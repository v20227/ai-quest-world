import { validateRuntimeEvent } from "../packages/uarp/runtime-event.mjs";
import { UarpValidationError } from "../packages/uarp/validation.mjs";

const AGGREGATED_FIELDS = [
  "read_count",
  "search_count",
  "write_count",
  "resource_count",
  "duration_ms"
];

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

/**
 * Aggregate only resource.activity events from one run/context. Other event
 * types must be passed through separately so high-value transitions survive.
 */
export function aggregateResourceActivity(events, { eventId, timestamp } = {}) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new UarpValidationError("events", "must contain at least one event");
  }

  const resourceEvents = events.filter((event) => event?.type === "resource.activity");
  if (resourceEvents.length === 0) {
    throw new UarpValidationError("events", "must contain a resource.activity event");
  }

  resourceEvents.forEach((event, index) => {
    validateRuntimeEvent(event);
    if (event.type !== "resource.activity") {
      throw new UarpValidationError(`events[${index}].type`, "must be resource.activity");
    }
  });

  const first = resourceEvents[0];
  for (const event of resourceEvents.slice(1)) {
    if (!sameContext(first, event)) {
      throw new UarpValidationError(
        "events",
        "resource.activity events must share source and run context"
      );
    }
  }

  const attributes = {};
  for (const field of AGGREGATED_FIELDS) {
    const values = resourceEvents
      .map((event) => event.attributes[field])
      .filter((value) => value !== undefined);
    if (values.length > 0) {
      attributes[field] = values.reduce((sum, value) => sum + value, 0);
    }
  }

  const resourceKinds = uniqueDefined(resourceEvents.map((event) => event.attributes.resource_kind));
  if (resourceKinds.length === 1) {
    attributes.resource_kind = resourceKinds[0];
  }

  const scopes = uniqueDefined(resourceEvents.map((event) => event.attributes.scope));
  if (scopes.length === 1) {
    attributes.scope = scopes[0];
  } else if (scopes.length > 1) {
    attributes.scope = "mixed";
  }

  const redactionLevels = resourceEvents.map((event) => event.privacy.redaction_level);
  const fieldsRedacted = uniqueDefined(
    resourceEvents.flatMap((event) => event.privacy.fields_redacted ?? [])
  );
  const aggregate = {
    ...cloneJson(first),
    event_id: eventId ?? `aggregate:${first.event_id}:${resourceEvents.at(-1).event_id}`,
    timestamp: timestamp ?? resourceEvents.at(-1).timestamp,
    attributes,
    privacy: {
      content_included: false,
      redaction_level: strongestRedactionLevel(redactionLevels),
      ...(fieldsRedacted.length > 0 ? { fields_redacted: fieldsRedacted } : {})
    }
  };

  return validateRuntimeEvent(aggregate);
}

/**
 * Replace a batch's resource.activity events with one aggregate and preserve
 * every non-resource event in its original relative position.
 */
export function aggregateBatch(events, options = {}) {
  if (!Array.isArray(events)) {
    throw new UarpValidationError("events", "must be an array");
  }

  const normalized = events.map((event) => validateRuntimeEvent(event));
  const resourceEvents = normalized.filter((event) => event.type === "resource.activity");
  if (resourceEvents.length === 0) {
    return normalized.map(cloneJson);
  }

  const aggregate = aggregateResourceActivity(resourceEvents, options);
  const firstResourceIndex = normalized.findIndex((event) => event.type === "resource.activity");
  const result = [];

  normalized.forEach((event, index) => {
    if (index === firstResourceIndex) {
      result.push(aggregate);
    }
    if (event.type !== "resource.activity") {
      result.push(cloneJson(event));
    }
  });

  return result;
}

function sameContext(left, right) {
  return sameFields(left.source, right.source, [
    "adapter_id",
    "adapter_version",
    "harness_family",
    "harness_version"
  ]) && sameFields(left.context, right.context, [
    "workspace_id",
    "project_id",
    "run_id",
    "parent_run_id",
    "agent_id",
    "parent_agent_id"
  ]);
}

function sameFields(left, right, fields) {
  return fields.every((field) => left[field] === right[field]);
}

function uniqueDefined(values) {
  return [...new Set(values.filter((value) => value !== undefined))];
}

function strongestRedactionLevel(levels) {
  const rank = { none: 0, standard: 1, strict: 2 };
  return levels.reduce(
    (strongest, current) => rank[current] > rank[strongest] ? current : strongest,
    "none"
  );
}
