import { parseRuntimeEvent, validateRuntimeEvent } from "../packages/uarp/runtime-event.mjs";
import { assertRuntimeObserver } from "../packages/adapter-core/contracts.mjs";

export class ObserverContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "ObserverContractError";
  }
}

/**
 * @typedef {object} RuntimeRedactor
 * @property {(event: import("../packages/uarp/runtime-event.mjs").RuntimeEvent) => import("../packages/uarp/runtime-event.mjs").RuntimeEvent|Promise<import("../packages/uarp/runtime-event.mjs").RuntimeEvent>} redact
 */

/**
 * Local ingestion boundary. It validates before accepting, deduplicates by
 * event_id, queues events in order, and forwards only accepted events.
 */
export class LocalRuntimeObserver {
  #downstream;
  #redact;
  #autoFlush;
  #buffer = [];
  #queuedIds = new Set();
  #processedIds = new Set();
  #emittedEvents = [];
  #operation = Promise.resolve();

  /**
   * @param {{downstream: import("../packages/adapter-core/contracts.mjs").RuntimeObserver, redactor?: RuntimeRedactor|RuntimeRedactor["redact"], autoFlush?: boolean}} options
   */
  constructor({ downstream, redactor, autoFlush = true } = {}) {
    assertRuntimeObserver(downstream);
    this.#downstream = downstream;
    this.#redact = resolveRedactor(redactor);
    this.#autoFlush = autoFlush;
  }

  /** @param {unknown} event @returns {Promise<{accepted: boolean, duplicate: boolean, event_id: string}>} */
  emit(event) {
    const operation = this.#operation.then(() => this.#accept(event));
    this.#operation = operation.catch(() => undefined);
    return operation;
  }

  async #accept(input) {
    const normalized = parseRuntimeEvent(input);
    const eventId = normalized.event_id;
    if (this.#processedIds.has(eventId) || this.#queuedIds.has(eventId)) {
      return { accepted: false, duplicate: true, event_id: eventId };
    }

    const redacted = await this.#redact(cloneJson(normalized));
    validateRuntimeEvent(redacted);
    if (redacted.event_id !== eventId) {
      throw new ObserverContractError("redaction must preserve event.event_id");
    }

    this.#queuedIds.add(eventId);
    this.#buffer.push(redacted);
    if (this.#autoFlush) {
      await this.flush();
    }

    return { accepted: true, duplicate: false, event_id: eventId };
  }

  async flush() {
    while (this.#buffer.length > 0) {
      const event = this.#buffer.shift();
      this.#queuedIds.delete(event.event_id);
      try {
        await this.#downstream.emit(event);
      } catch (error) {
        this.#buffer.unshift(event);
        this.#queuedIds.add(event.event_id);
        throw error;
      }
      this.#processedIds.add(event.event_id);
      this.#emittedEvents.push(cloneJson(event));
    }
  }

  get pendingEventCount() {
    return this.#buffer.length;
  }

  get emittedEvents() {
    return this.#emittedEvents.map(cloneJson);
  }

  hasProcessed(eventId) {
    return this.#processedIds.has(eventId);
  }
}

function resolveRedactor(redactor) {
  if (redactor === undefined) {
    return (event) => event;
  }
  if (typeof redactor === "function") {
    return redactor;
  }
  if (typeof redactor === "object" && redactor !== null && typeof redactor.redact === "function") {
    return (event) => redactor.redact(event);
  }
  throw new ObserverContractError("redactor must be a function or provide redact(event)");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
