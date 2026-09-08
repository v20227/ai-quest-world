import {
  assertBoolean,
  assertRecord,
  assertString,
  UarpValidationError
} from "./validation.mjs";
import { UARP_VERSION } from "./version.mjs";

export { UARP_VERSION } from "./version.mjs";

export const OBSERVATION_CAPABILITIES = Object.freeze([
  "run_lifecycle",
  "subagents",
  "tool_calls",
  "resource_reads",
  "resource_changes",
  "validation",
  "artifacts",
  "errors",
  "usage_tokens",
  "usage_cost",
  "outcome_evidence"
]);

export const CONTENT_CAPABILITIES = Object.freeze([
  "task_title",
  "task_text",
  "tool_arguments",
  "resource_paths",
  "artifact_paths",
  "output_summary"
]);

/**
 * @typedef {object} HarnessCapabilities
 * @property {"0.1"} uarp_version
 * @property {string} adapter_id
 * @property {Record<string, boolean>} observe
 * @property {Record<string, boolean>} content
 */

/** @param {unknown} value @param {string} [path] @returns {HarnessCapabilities} */
export function validateHarnessCapabilities(value, path = "capabilities") {
  const capabilities = assertRecord(value, path);
  if (capabilities.uarp_version !== UARP_VERSION) {
    throw new UarpValidationError(
      `${path}.uarp_version`,
      `must be exactly ${UARP_VERSION}`
    );
  }

  assertString(capabilities.adapter_id, `${path}.adapter_id`);
  validateBooleanMap(capabilities.observe, OBSERVATION_CAPABILITIES, `${path}.observe`);
  validateBooleanMap(capabilities.content, CONTENT_CAPABILITIES, `${path}.content`);

  return capabilities;
}

function validateBooleanMap(value, requiredKeys, path) {
  const map = assertRecord(value, path);
  for (const key of requiredKeys) {
    assertBoolean(map[key], `${path}.${key}`);
  }
}

export function createCapabilities(adapterId, { observe = {}, content = {} } = {}) {
  const capabilities = {
    uarp_version: UARP_VERSION,
    adapter_id: adapterId,
    observe: Object.fromEntries(
      OBSERVATION_CAPABILITIES.map((key) => [key, Boolean(observe[key])])
    ),
    content: Object.fromEntries(
      CONTENT_CAPABILITIES.map((key) => [key, Boolean(content[key])])
    )
  };

  return validateHarnessCapabilities(capabilities);
}

export function parseHarnessCapabilities(input) {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      throw new UarpValidationError("capabilities", "must be valid JSON");
    }
  }

  return validateHarnessCapabilities(value);
}
