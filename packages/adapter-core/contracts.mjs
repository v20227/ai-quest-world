import { validateHarnessCapabilities } from "../uarp/capabilities.mjs";
import { UarpValidationError } from "../uarp/validation.mjs";

export class AdapterContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "AdapterContractError";
  }
}

/**
 * @typedef {object} RuntimeObserver
 * @property {(event: import("../uarp/runtime-event.mjs").RuntimeEvent) => void|Promise<void>} emit
 */

/**
 * @typedef {object} HarnessAdapter
 * @property {string} id
 * @property {() => Promise<boolean>} detect
 * @property {() => Promise<import("../uarp/capabilities.mjs").HarnessCapabilities>} getCapabilities
 * @property {(observer: RuntimeObserver) => Promise<void>} start
 * @property {() => Promise<void>} stop
 */

/** @param {unknown} value @returns {RuntimeObserver} */
export function assertRuntimeObserver(value) {
  if (typeof value !== "object" || value === null || typeof value.emit !== "function") {
    throw new AdapterContractError("RuntimeObserver must provide an emit(event) function");
  }

  return value;
}

/** @param {unknown} value @returns {HarnessAdapter} */
export function assertHarnessAdapter(value) {
  if (typeof value !== "object" || value === null) {
    throw new AdapterContractError("HarnessAdapter must be an object");
  }
  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new AdapterContractError("HarnessAdapter.id must be a non-empty string");
  }
  for (const method of ["detect", "getCapabilities", "start", "stop"]) {
    if (typeof value[method] !== "function") {
      throw new AdapterContractError(`HarnessAdapter.${method} must be a function`);
    }
  }

  return value;
}

/** @param {HarnessAdapter} adapter @returns {Promise<import("../uarp/capabilities.mjs").HarnessCapabilities>} */
export async function getValidatedCapabilities(adapter) {
  assertHarnessAdapter(adapter);

  try {
    return validateHarnessCapabilities(await adapter.getCapabilities());
  } catch (error) {
    if (error instanceof UarpValidationError) {
      throw new AdapterContractError(`Invalid capabilities from ${adapter.id}: ${error.message}`);
    }
    throw error;
  }
}
