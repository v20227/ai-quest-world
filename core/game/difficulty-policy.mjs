import { SEMANTIC_DOMAINS } from "../semantic/semantic-types.mjs";

const WORK_PHASES = new Map([
  ["exploration_activity", "EXPLORE"],
  ["implementation_activity", "ACT"],
  ["recovery_activity", "RECOVER"],
  ["validation_success", "VALIDATE"],
  ["artifact_delivered", "DELIVER"]
]);

export function createDifficultyBasis() {
  return { phases: new Set(), scopes: new Set() };
}

/** @param {{phases: Set<string>, scopes: Set<string>}} basis
 * @param {import("../semantic/semantic-types.mjs").SemanticRecord} record */
export function updateDifficultyBasis(basis, record) {
  if (WORK_PHASES.get(record.kind) !== record.phase || record.impact <= 0) return;
  const supported = SEMANTIC_DOMAINS.filter(domain => record.domain_contributions[domain] > 0);
  if (supported.length === 0) return;
  basis.phases.add(record.phase);
  if (record.kind !== "validation_success") {
    for (const domain of supported) {
      if (record.domain_contributions[domain] >= 3) basis.scopes.add(domain);
    }
  }
}

/** @param {{phases: Set<string>, scopes: Set<string>}} basis
 * @returns {number|null} */
export function estimateDifficulty(basis) {
  if (basis.phases.size === 0) return null;
  const phaseBreadth = Math.min(2, basis.phases.size - 1);
  const scopeBreadth = Math.min(2, Math.max(0, basis.scopes.size - 1));
  return 1 + phaseBreadth + scopeBreadth;
}
