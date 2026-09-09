import { isPlainRecord } from "../../packages/uarp/validation.mjs";
import { SEMANTIC_PHASES, SEMANTIC_KINDS } from "../semantic/semantic-types.mjs";

export function validateExpedition(value) {
  const require = (condition, message) => { if (!condition) throw new TypeError(`expedition: ${message}`); };
  const text = value => typeof value === "string" && value.trim().length > 0;
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const timestamp = value => text(value) && Number.isFinite(Date.parse(value));
  require(isPlainRecord(value) && value.expedition_version === "0.1", "unsupported shape or version");
  require(SEMANTIC_PHASES.includes(value.current_phase), "invalid current phase");
  require(Array.isArray(value.steps) && value.steps.length <= 80 && count(value.omitted_step_count), "invalid step history");
  require(Array.isArray(value.observed_phases) && value.observed_phases.every(phase => SEMANTIC_PHASES.includes(phase)), "invalid observed phases");
  for (const step of value.steps) {
    require(isPlainRecord(step) && text(step.step_id) && SEMANTIC_PHASES.includes(step.phase) && SEMANTIC_KINDS.includes(step.kind), "invalid step");
    require(timestamp(step.first_at) && timestamp(step.last_at) && Date.parse(step.last_at) >= Date.parse(step.first_at), "invalid step times");
    require(text(step.first_event_id) && text(step.last_event_id) && count(step.observation_count) && step.observation_count > 0, "invalid step evidence");
  }
  require(Array.isArray(value.encounters), "invalid encounters");
  for (const encounter of value.encounters) {
    require(isPlainRecord(encounter) && text(encounter.encounter_id) && ["validation", "blocker"].includes(encounter.kind), "invalid encounter");
    require(["OPEN", "RECOVERING", "VERIFYING", "RECHECK_REQUIRED", "RESOLVED"].includes(encounter.state), "invalid encounter state");
    require(encounter.target === null || text(encounter.target), "invalid encounter target");
    require(timestamp(encounter.opened_at) && timestamp(encounter.updated_at), "invalid encounter times");
    require(encounter.state === "RESOLVED" ? timestamp(encounter.resolved_at) : encounter.resolved_at === null, "resolution evidence required");
    require(text(encounter.first_event_id) && text(encounter.latest_event_id) && count(encounter.failure_count) && encounter.failure_count > 0, "invalid encounter evidence");
    require(Array.isArray(encounter.evidence_ids) && encounter.evidence_ids.every(text), "invalid evidence references");
    if (encounter.measurement !== null) {
      require(isPlainRecord(encounter.measurement), "invalid measurement");
      for (const key of ["passed", "failed", "total", "blockers"]) require(encounter.measurement[key] === null || count(encounter.measurement[key]), "invalid measurement count");
    }
  }
  require(count(value.unresolved_count) && value.unresolved_count === value.encounters.filter(encounter => encounter.state !== "RESOLVED").length, "invalid unresolved total");
  return value;
}
