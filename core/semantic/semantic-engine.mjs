import { parseRuntimeEvent } from "../../packages/uarp/runtime-event.mjs";
import {
  createEmptyDomainScores,
  SEMANTIC_DOMAINS,
  SEMANTIC_VERSION,
  validateSemanticRecord
} from "./semantic-types.mjs";

const CODE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "css",
  "go",
  "h",
  "hpp",
  "java",
  "js",
  "jsx",
  "kt",
  "mjs",
  "php",
  "py",
  "rb",
  "rs",
  "swift",
  "ts",
  "tsx",
  "vue"
]);

const AUTOMATION_EXTENSIONS = new Set(["bat", "ps1", "sh", "workflow", "yml", "yaml"]);
const PLANNING_EXTENSIONS = new Set(["adoc", "md", "rst", "txt"]);
const CREATIVE_EXTENSIONS = new Set(["gif", "jpeg", "jpg", "mov", "mp3", "mp4", "png", "svg", "wav", "webp"]);

/**
 * Interpret factual UARP events into deterministic semantic records.
 * The engine owns no Quest, reward, world, or renderer state.
 */
export class SemanticEngine {
  #states = new Map();
  #runRoots = new Map();
  #processedEventIds = new Set();

  /**
   * @param {unknown} input
   * @returns {import("./semantic-types.mjs").SemanticRecord | null}
   */
  ingest(input) {
    const event = parseRuntimeEvent(input);
    if (this.#processedEventIds.has(event.event_id)) {
      return null;
    }

    const rootRunId = this.#resolveRootRunId(event.context);
    const state = this.#getOrCreateState(rootRunId);
    const interpretation = interpretEvent(event, state);

    if (interpretation === null) {
      this.#processedEventIds.add(event.event_id);
      return null;
    }

    const record = createSemanticRecord(event, rootRunId, interpretation);
    validateSemanticRecord(record);
    state.records.push(record);
    state.phase = record.phase;
    state.lastSemanticKind = record.kind;
    for (const domain of SEMANTIC_DOMAINS) {
      state.domainScores[domain] += record.domain_contributions[domain];
    }
    this.#processedEventIds.add(event.event_id);

    return cloneJson(record);
  }

  /**
   * @param {string} rootRunId
   * @returns {import("./semantic-types.mjs").SemanticRecord[]}
   */
  getRecords(rootRunId) {
    assertRunId(rootRunId);
    const state = this.#states.get(rootRunId);
    return state === undefined ? [] : state.records.map(cloneJson);
  }

  /**
   * @param {string} rootRunId
   * @returns {{root_run_id: string, phase: string, records: import("./semantic-types.mjs").SemanticRecord[], domain_scores: Record<string, number>, activity_mix: Record<string, number>, primary_domain: string | null, secondary_domains: string[]}}
   */
  getSnapshot(rootRunId) {
    assertRunId(rootRunId);
    const state = this.#states.get(rootRunId);
    if (state === undefined) {
      return createEmptySnapshot(rootRunId);
    }

    const domainScores = { ...state.domainScores };
    const rankedDomains = rankDomains(domainScores);
    return {
      root_run_id: rootRunId,
      phase: state.phase,
      records: state.records.map(cloneJson),
      domain_scores: domainScores,
      activity_mix: calculateActivityMix(domainScores),
      primary_domain: rankedDomains[0] ?? null,
      secondary_domains: rankedDomains.slice(1)
    };
  }

  reset() {
    this.#states.clear();
    this.#runRoots.clear();
    this.#processedEventIds.clear();
  }

  #getOrCreateState(rootRunId) {
    let state = this.#states.get(rootRunId);
    if (state === undefined) {
      state = {
        rootRunId,
        phase: "DEPART",
        records: [],
        domainScores: createEmptyDomainScores(),
        validationFailed: false,
        lastSemanticKind: null
      };
      this.#states.set(rootRunId, state);
    }
    return state;
  }

  #resolveRootRunId(context) {
    const knownRoot = this.#runRoots.get(context.run_id);
    if (knownRoot !== undefined) {
      return knownRoot;
    }

    const rootRunId = context.parent_run_id === undefined
      ? context.run_id
      : this.#runRoots.get(context.parent_run_id) ?? context.parent_run_id;
    this.#runRoots.set(context.run_id, rootRunId);
    if (context.parent_run_id !== undefined && !this.#runRoots.has(context.parent_run_id)) {
      this.#runRoots.set(context.parent_run_id, rootRunId);
    }
    return rootRunId;
  }
}

/**
 * Analyze a fresh event sequence without retaining state in the caller.
 *
 * @param {unknown[]} events
 * @returns {{records: import("./semantic-types.mjs").SemanticRecord[], snapshots: Array<ReturnType<SemanticEngine["getSnapshot"]>>}}
 */
export function analyzeRuntimeEvents(events) {
  if (!Array.isArray(events)) {
    throw new TypeError("events must be an array");
  }

  const engine = new SemanticEngine();
  const records = [];
  const rootRunIds = [];
  const seenRoots = new Set();

  for (const event of events) {
    const record = engine.ingest(event);
    if (record === null) {
      continue;
    }
    records.push(record);
    if (!seenRoots.has(record.root_run_id)) {
      seenRoots.add(record.root_run_id);
      rootRunIds.push(record.root_run_id);
    }
  }

  return {
    records,
    snapshots: rootRunIds.map((rootRunId) => engine.getSnapshot(rootRunId))
  };
}

function interpretEvent(event, state) {
  switch (event.type) {
    case "run.started":
      return createInterpretation(
        "DEPART",
        "run_started",
        0,
        2,
        {},
        "run_started"
      );
    case "resource.activity":
      if (state.lastSemanticKind === "exploration_activity") {
        return null;
      }
      return createInterpretation(
        "EXPLORE",
        "exploration_activity",
        2,
        2,
        explorationDomains(event.attributes),
        "resource_activity_observed"
      );
    case "resource.changed":
      return interpretResourceChange(event, state);
    case "validation.started":
      return createInterpretation(
        "VALIDATE",
        "validation_started",
        1,
        2,
        { Engineering: 1, Debugging: 1 },
        "validation_started"
      );
    case "validation.completed":
      return interpretValidation(event, state);
    case "artifact.created":
    case "artifact.updated":
      return createInterpretation(
        "DELIVER",
        "artifact_delivered",
        4,
        4,
        artifactDomains(event.attributes.kind),
        "artifact_reference_observed"
      );
    case "run.completed":
      return createInterpretation("RETURN", "run_completed", 3, 3, {}, "run_completed");
    case "run.failed":
      return createInterpretation("RETURN", "run_failed", 3, 4, { Debugging: 2 }, "run_failed");
    case "run.cancelled":
      return createInterpretation("RETURN", "run_cancelled", 2, 3, {}, "run_cancelled");
    default:
      return null;
  }
}

function interpretResourceChange(event, state) {
  const domains = changeDomains(event.attributes);
  if (state.validationFailed) {
    return createInterpretation(
      "RECOVER",
      "recovery_activity",
      3,
      3,
      { ...domains, Debugging: Math.max(domains.Debugging ?? 0, 4) },
      "resource_change_after_validation_failure"
    );
  }

  return createInterpretation(
    "ACT",
    "implementation_activity",
    3,
    3,
    domains,
    "resource_change_observed"
  );
}

function interpretValidation(event, state) {
  const attributes = event.attributes;
  const failed = event.status === "failed" || (attributes.failed ?? 0) > 0 || (attributes.blockers ?? 0) > 0;
  if (failed) {
    state.validationFailed = true;
    return createInterpretation(
      "VALIDATE",
      "validation_failure",
      4,
      4,
      { Engineering: 2, Debugging: 4 },
      "validation_failure_observed"
    );
  }

  const succeeded = event.status === "succeeded" ||
    event.status === "completed" ||
    ((attributes.failed ?? 0) === 0 && (attributes.blockers ?? 0) === 0 && (attributes.passed ?? 0) > 0);
  if (!succeeded) {
    return null;
  }

  state.validationFailed = false;
  return createInterpretation(
    "VALIDATE",
    "validation_success",
    4,
    4,
    { Engineering: 2, Debugging: 2 },
    "validation_success_observed"
  );
}

function explorationDomains(attributes) {
  const domains = {};
  const hasReading = (attributes.read_count ?? 0) > 0 ||
    (attributes.search_count ?? 0) > 0 ||
    (attributes.resource_count ?? 0) > 0;
  if (hasReading || attributes.resource_kind === "web" || attributes.resource_kind === "memory") {
    domains.Research = 3;
  }
  if (attributes.scope === "project" || attributes.scope === "workspace") {
    domains.Planning = 1;
  }
  return domains;
}

function changeDomains(attributes) {
  const extension = normalizeExtension(attributes.extension ?? attributes.path_or_name);
  if (AUTOMATION_EXTENSIONS.has(extension)) {
    return { Automation: 4, Engineering: 1 };
  }
  if (CREATIVE_EXTENSIONS.has(extension)) {
    return { Creation: 4 };
  }
  if (PLANNING_EXTENSIONS.has(extension)) {
    return { Planning: 3, Creation: 1 };
  }
  if (CODE_EXTENSIONS.has(extension) || attributes.resource_kind === "database") {
    return { Engineering: 4 };
  }
  if (attributes.resource_kind === "web") {
    return { Research: 3, Planning: 1 };
  }
  return { Engineering: 2 };
}

function artifactDomains(kind) {
  switch (kind) {
    case "research":
      return { Research: 4 };
    case "plan":
      return { Planning: 4 };
    case "document":
      return { Planning: 1, Creation: 3 };
    case "creative":
      return { Creation: 4 };
    case "automation":
      return { Automation: 4 };
    case "validation":
      return { Engineering: 1, Debugging: 3 };
    case "code":
      return { Engineering: 4 };
    default:
      return { Engineering: 1 };
  }
}

function createInterpretation(phase, kind, impact, visibility, domains, signal) {
  return {
    phase,
    kind,
    impact,
    visibility,
    domainContributions: createDomainContributions(domains),
    signal
  };
}

function createDomainContributions(values = {}) {
  const contributions = createEmptyDomainScores();
  for (const domain of SEMANTIC_DOMAINS) {
    if (values[domain] !== undefined) {
      contributions[domain] = values[domain];
    }
  }
  return contributions;
}

function createSemanticRecord(event, rootRunId, interpretation) {
  return {
    semantic_version: SEMANTIC_VERSION,
    semantic_id: `semantic:${event.event_id}`,
    source_event_id: event.event_id,
    timestamp: event.timestamp,
    source: copyDefined(event.source),
    context: copyDefined(event.context),
    root_run_id: rootRunId,
    phase: interpretation.phase,
    kind: interpretation.kind,
    impact: interpretation.impact,
    visibility: interpretation.visibility,
    domain_contributions: interpretation.domainContributions,
    signal: interpretation.signal
  };
}

function createEmptySnapshot(rootRunId) {
  const domainScores = createEmptyDomainScores();
  return {
    root_run_id: rootRunId,
    phase: "DEPART",
    records: [],
    domain_scores: domainScores,
    activity_mix: calculateActivityMix(domainScores),
    primary_domain: null,
    secondary_domains: []
  };
}

function rankDomains(domainScores) {
  return SEMANTIC_DOMAINS
    .filter((domain) => domainScores[domain] > 0)
    .sort((left, right) => {
      const scoreDifference = domainScores[right] - domainScores[left];
      if (scoreDifference !== 0) {
        return scoreDifference;
      }
      return SEMANTIC_DOMAINS.indexOf(left) - SEMANTIC_DOMAINS.indexOf(right);
    });
}

function calculateActivityMix(domainScores) {
  const total = SEMANTIC_DOMAINS.reduce((sum, domain) => sum + domainScores[domain], 0);
  if (total === 0) {
    return createEmptyDomainScores();
  }

  const mix = createEmptyDomainScores();
  let remaining = 100;
  for (let index = 0; index < SEMANTIC_DOMAINS.length - 1; index += 1) {
    const domain = SEMANTIC_DOMAINS[index];
    const value = Math.min(
      remaining,
      roundPercentage((domainScores[domain] / total) * 100)
    );
    mix[domain] = value;
    remaining = Math.max(0, roundPercentage(remaining - value));
  }
  const lastDomain = SEMANTIC_DOMAINS.at(-1);
  mix[lastDomain] = roundPercentage(remaining);
  return mix;
}

function roundPercentage(value) {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeExtension(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.toLowerCase().split(/[\\/.]/).pop() ?? "";
  return normalized;
}

function copyDefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertRunId(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("rootRunId must be a non-empty string");
  }
}
