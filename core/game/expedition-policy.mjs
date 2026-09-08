import { orderRuntimeEvents } from "../../packages/uarp/run-lineage.mjs";
import { classifyOutcome } from "./outcome-policy.mjs";
import { validationIdentity } from "./validation-identity.mjs";

export const EXPEDITION_VERSION = "0.1";
const MAX_STEPS = 80;

export function buildExpedition(quest, events, semanticRecords, terminalEventIds) {
  const eventIds = new Set(quest.event_ids);
  const records = new Map(semanticRecords.map(record => [record.source_event_id, record]));
  const ordered = orderRuntimeEvents([...new Map(events.filter(event => eventIds.has(event.event_id)).map(event => [event.event_id, event])).values()]);
  const steps = [];
  const encounters = new Map();
  const driverTerminals = new Set(["run_completed", "run_failed", "run_cancelled"]);

  for (const event of ordered) {
    const record = records.get(event.event_id);
    if (record && record.visibility >= 2 && (!driverTerminals.has(record.kind) || terminalEventIds.has(event.event_id))) {
      const last = steps.at(-1);
      if (last?.phase === record.phase && last.kind === record.kind) {
        last.last_at = event.timestamp;
        last.last_event_id = event.event_id;
        last.observation_count += 1;
      } else {
        steps.push({ step_id: `step:${event.event_id}`, phase: record.phase, kind: record.kind,
          first_at: event.timestamp, last_at: event.timestamp, first_event_id: event.event_id,
          last_event_id: event.event_id, observation_count: 1 });
      }
    }

    if (event.type === "resource.changed") {
      for (const encounter of encounters.values()) {
        if (encounter.kind !== "validation") continue;
        encounter.state = encounter.state === "RESOLVED" ? "RECHECK_REQUIRED" : "RECOVERING";
        encounter.resolved_at = null;
        encounter.updated_at = event.timestamp;
      }
    }

    if (event.type === "validation.started" || event.type === "validation.completed") {
      const key = `validation:${validationIdentity(event)}`;
      const result = event.type === "validation.completed" ? classifyOutcome([event]).validation_summary : null;
      const failed = (result?.failure_count ?? 0) > 0;
      let encounter = encounters.get(key);
      if (failed && !encounter) {
        encounter = { encounter_id: `encounter:${event.event_id}`, kind: "validation",
          validation_kind: event.attributes.kind, target: event.attributes.target ?? null,
          opened_at: event.timestamp, updated_at: event.timestamp, resolved_at: null,
          state: "OPEN", failure_count: 0, first_event_id: event.event_id, latest_event_id: event.event_id,
          evidence_ids: [], measurement: null };
        encounters.set(key, encounter);
      }
      if (encounter) {
        encounter.updated_at = event.timestamp;
        encounter.latest_event_id = event.event_id;
        encounter.evidence_ids = [...new Set((event.evidence_refs ?? []).map(ref => ref.id))];
        encounter.measurement = result ? { passed: result.latest_passed, failed: result.latest_failed,
          total: result.latest_total, blockers: result.latest_blockers } : null;
        encounter.state = failed ? "OPEN" : result?.success_count > 0 ? "RESOLVED" : "VERIFYING";
        encounter.resolved_at = encounter.state === "RESOLVED" ? event.timestamp : null;
        if (failed) encounter.failure_count += 1;
      }
    }

    if (event.type === "error.observed" && event.attributes.blocking === true) {
      const identity = event.attributes.error_id ?? event.event_id;
      const key = JSON.stringify(["blocker", event.context.run_id, identity]);
      const previous = encounters.get(key);
      encounters.set(key, { encounter_id: previous?.encounter_id ?? `encounter:${event.event_id}`,
        kind: "blocker", target: event.attributes.kind ?? null, error_id: event.attributes.error_id ?? null,
        opened_at: previous?.opened_at ?? event.timestamp, updated_at: event.timestamp,
        resolved_at: null, state: "OPEN", failure_count: (previous?.failure_count ?? 0) + 1,
        first_event_id: previous?.first_event_id ?? event.event_id, latest_event_id: event.event_id,
        evidence_ids: [...new Set((event.evidence_refs ?? []).map(ref => ref.id))], measurement: null });
    }
    if (event.type === "error.resolved" && event.attributes.error_id && !["failed", "unknown", "running", "started", "cancelled"].includes(event.status)) {
      const key = JSON.stringify(["blocker", event.context.run_id, event.attributes.error_id]);
      const encounter = encounters.get(key);
      if (encounter) Object.assign(encounter, { state: "RESOLVED", resolved_at: event.timestamp,
        updated_at: event.timestamp, latest_event_id: event.event_id });
    }
  }

  const values = [...encounters.values()];
  return { expedition_version: EXPEDITION_VERSION, current_phase: quest.phase,
    steps: steps.slice(-MAX_STEPS), omitted_step_count: Math.max(0, steps.length - MAX_STEPS),
    observed_phases: [...new Set(steps.map(step => step.phase))], encounters: values,
    unresolved_count: values.filter(encounter => encounter.state !== "RESOLVED").length };
}
