import { getValidatedCapabilities } from "../packages/adapter-core/contracts.mjs";
import { ObservationInterrupted } from "../packages/adapter-core/observation-interrupted.mjs";

export async function captureAdapter({ adapter, observer, store, connectionId = adapter.id, activeSessions }) {
  const capabilities = await getValidatedCapabilities(adapter);
  const sessionId = store.begin({ connectionId, adapterId: adapter.id, capabilities });
  activeSessions.add(sessionId);
  let heartbeatError = null;
  const timer = setInterval(() => {
    if (!activeSessions.has(sessionId)) { clearInterval(timer); return; }
    try { store.touch(sessionId); }
    catch (error) { heartbeatError = error; }
  }, 10000);
  timer.unref();
  try {
    await adapter.start({
      emit: async event => {
        if (heartbeatError) throw heartbeatError;
        const result = await observer.emit(event);
        store.touch(sessionId, { eventReceived: true, runId: event.context?.run_id, eventId: result?.event_id });
        return result;
      }
    });
    if (heartbeatError) throw heartbeatError;
    store.end(sessionId);
  } catch (error) {
    try { store.end(sessionId, error instanceof ObservationInterrupted ? "interrupted" : "error", error instanceof ObservationInterrupted ? error.code : "CAPTURE_FAILED"); }
    catch { /* Preserve the ingestion failure. */ }
    throw error;
  } finally {
    clearInterval(timer);
    activeSessions.delete(sessionId);
  }
}
