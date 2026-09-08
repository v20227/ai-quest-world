import { parseRuntimeEvent } from "../../packages/uarp/runtime-event.mjs";
import { OUTCOME_CONFIDENCES } from "./quest-types.mjs";

/**
 * Classify terminal outcome confidence from normalized UARP evidence.
 * A native completed status alone is never enough for VERIFIED.
 *
 * @param {unknown[]} inputs
 * @param {{rootRunId?: string}=} options
 * @returns {{confidence: string|null, terminal_type: string|null, validation_summary: {attempted: boolean, success_count: number, failure_count: number, latest_kind: string|null, latest_status: string|null, latest_passed: number|null, latest_failed: number|null, latest_total: number|null, latest_blockers: number|null}, artifact_refs: Array<Record<string, unknown>>, has_durable_artifact: boolean, evidence_ref_count: number}}
 */
export function classifyOutcome(inputs, { rootRunId } = {}) {
  if (!Array.isArray(inputs)) {
    throw new TypeError("outcome events must be an array");
  }

  const events = [...new Map(inputs.map(parseRuntimeEvent).map(event => [event.event_id, event])).values()]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.event_id.localeCompare(b.event_id));
  const resolvedRootRunId = rootRunId ?? findRootRunId(events);
  const validation = createValidationSummary();
  const artifactRefs = new Map();
  let evidenceRefCount = 0;
  let terminalEvent = null;
  const latestValidations = new Map();
  let lastChange = "";

  for (const event of events) {
    evidenceRefCount += event.evidence_refs?.filter(ref => ref.uri || ref.local_ref).length ?? 0;

    if (event.type === "resource.changed") lastChange = event.timestamp;

    if (event.type === "validation.completed") {
      observeValidation(event, validation);
    }
    if (event.type === "validation.started" || event.type === "validation.completed") {
      const key = `${event.attributes.kind}:${event.attributes.target ?? "unknown"}`;
      const previous = latestValidations.get(key);
      const summary = createValidationSummary();
      if (event.type === "validation.completed") observeValidation(event, summary);
      latestValidations.set(key, { event, passed: summary.success_count > 0,
        unresolvedFailure: summary.failure_count > 0 || (previous?.unresolvedFailure === true && summary.success_count === 0) });
    }

    if (event.type === "artifact.created" || event.type === "artifact.updated") {
      const artifact = createArtifactReference(event);
      artifactRefs.set(
        artifact.artifact_id,
        mergeArtifactReference(artifactRefs.get(artifact.artifact_id), artifact)
      );
    }

    if (isRootTerminal(event, resolvedRootRunId)) {
      terminalEvent = event;
    }
  }

  const confidence = classifyTerminalConfidence(
    terminalEvent,
    validation,
    artifactRefs,
    evidenceRefCount,
    [...latestValidations.values()],
    lastChange
  );

  return {
    confidence,
    terminal_type: terminalEvent?.type ?? null,
    validation_summary: validation,
    artifact_refs: [...artifactRefs.values()],
    has_durable_artifact: [...artifactRefs.values()].some((artifact) => artifact.durable === true && artifact.has_reference === true),
    evidence_ref_count: evidenceRefCount
  };
}

function createValidationSummary() {
  return {
    attempted: false,
    success_count: 0,
    failure_count: 0,
    latest_kind: null,
    latest_status: null,
    latest_passed: null,
    latest_failed: null,
    latest_total: null,
    latest_blockers: null
  };
}

function observeValidation(event, summary) {
  const attributes = event.attributes;
  const failed = event.status === "failed" || (attributes.failed ?? 0) > 0 || (attributes.blockers ?? 0) > 0;
  const succeeded = !failed && (
    !["unknown", "running", "started", "cancelled"].includes(event.status) && (
    event.status === "succeeded" ||
    ((attributes.failed ?? 0) === 0 && (attributes.blockers ?? 0) === 0 && (attributes.passed ?? 0) > 0)
    )
  );

  summary.attempted = true;
  if (failed) {
    summary.failure_count += 1;
  } else if (succeeded) {
    summary.success_count += 1;
  }

  summary.latest_kind = attributes.kind;
  summary.latest_status = event.status ?? (succeeded ? "succeeded" : failed ? "failed" : "unknown");
  summary.latest_passed = attributes.passed ?? null;
  summary.latest_failed = attributes.failed ?? null;
  summary.latest_total = attributes.total ?? null;
  summary.latest_blockers = attributes.blockers ?? null;
}

function createArtifactReference(event) {
  const attributes = event.attributes;
  return {
    artifact_id: attributes.artifact_id,
    kind: attributes.kind,
    ...(attributes.name === undefined ? {} : { name: attributes.name }),
    ...(attributes.uri_or_path === undefined ? {} : { uri_or_path: attributes.uri_or_path }),
    ...(attributes.mime_type === undefined ? {} : { mime_type: attributes.mime_type }),
    ...(attributes.durable === undefined ? {} : { durable: attributes.durable }),
    ...(attributes.relation === undefined ? {} : { relation: attributes.relation }),
    evidence_refs: event.evidence_refs === undefined ? [] : event.evidence_refs.map(cloneJson),
    has_reference: Boolean(
      attributes.uri_or_path ||
      event.evidence_refs?.some(ref => ref.uri || ref.local_ref)
    )
  };
}

function mergeArtifactReference(previous, current) {
  if (previous === undefined) {
    return current;
  }

  const evidenceRefs = new Map(
    [...(previous.evidence_refs ?? []), ...(current.evidence_refs ?? [])]
      .map((evidence) => [evidence.id, evidence])
  );
  const merged = {
    ...previous,
    ...current,
    evidence_refs: [...evidenceRefs.values()],
    has_reference: previous.has_reference === true || current.has_reference === true
  };

  for (const key of ["name", "uri_or_path", "mime_type", "durable", "relation"]) {
    if (current[key] === undefined && previous[key] !== undefined) {
      merged[key] = previous[key];
    }
  }
  return merged;
}

function classifyTerminalConfidence(terminalEvent, validation, artifactRefs, evidenceRefCount, latestValidations, lastChange) {
  if (terminalEvent === null) {
    return null;
  }
  if (terminalEvent.type === "run.failed") {
    return "FAILED";
  }
  if (terminalEvent.type === "run.cancelled") {
    return "CANCELLED";
  }
  if (terminalEvent.type !== "run.completed") {
    return null;
  }

  const hasFailure = latestValidations.some(result => result.unresolvedFailure);
  if (hasFailure) return "FAILED";
  const hasSuccessfulValidation = latestValidations.length > 0
    && latestValidations.every(result => result.passed && result.event.timestamp >= lastChange);
  const hasDurableArtifact = [...artifactRefs.values()].some(
    (artifact) => artifact.durable === true && artifact.has_reference === true
  );
  if (hasSuccessfulValidation && hasDurableArtifact) {
    return "VERIFIED";
  }
  if (hasSuccessfulValidation || hasDurableArtifact || evidenceRefCount > 0) {
    return "SUPPORTED";
  }
  return "UNVERIFIED";
}

function findRootRunId(events) {
  const rootEvent = events.find((event) => event.context.parent_run_id === undefined);
  return rootEvent?.context.run_id;
}

function isRootTerminal(event, rootRunId) {
  return rootRunId !== undefined &&
    event.context.run_id === rootRunId &&
    event.context.parent_run_id === undefined &&
    ["run.completed", "run.failed", "run.cancelled"].includes(event.type);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export { OUTCOME_CONFIDENCES };
