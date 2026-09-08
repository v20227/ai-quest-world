import {
  assertBoolean,
  assertOptionalString,
  assertRecord,
  assertString,
  assertAllowed
} from "./validation.mjs";

export const EVIDENCE_KINDS = Object.freeze([
  "validation",
  "artifact",
  "commit",
  "review",
  "deployment",
  "result",
  "other"
]);

/**
 * @typedef {object} EvidenceRef
 * @property {string} id
 * @property {string} kind
 * @property {string=} uri
 * @property {string=} local_ref
 * @property {boolean=} content_available
 */

/** @param {unknown} value @param {string} [path] @returns {EvidenceRef} */
export function validateEvidenceRef(value, path = "evidence_ref") {
  const evidence = assertRecord(value, path);
  assertString(evidence.id, `${path}.id`);
  assertAllowed(evidence.kind, `${path}.kind`, EVIDENCE_KINDS);
  assertOptionalString(evidence.uri, `${path}.uri`);
  assertOptionalString(evidence.local_ref, `${path}.local_ref`);
  if (evidence.content_available !== undefined) {
    assertBoolean(evidence.content_available, `${path}.content_available`);
  }

  return evidence;
}
