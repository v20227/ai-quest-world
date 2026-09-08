import { createCapabilities, UARP_VERSION, validateHarnessCapabilities } from "../../packages/uarp/capabilities.mjs";
import { validateRuntimeEvent } from "../../packages/uarp/runtime-event.mjs";
import { assertRuntimeObserver } from "../../packages/adapter-core/contracts.mjs";

export const SIMULATED_ADAPTER_ID = "simulated-harness";
export const SIMULATED_ADAPTER_VERSION = "0.1.0";

const ROOT_RUN_ID = "run-auth-001";
const ROOT_AGENT_ID = "agent-root";
const CHILD_RUN_ID = "run-auth-research-001";
const CHILD_AGENT_ID = "agent-research";
const SOURCE = {
  adapter_id: SIMULATED_ADAPTER_ID,
  adapter_version: SIMULATED_ADAPTER_VERSION,
  harness_family: "simulated",
  harness_version: "0.1"
};
const PRIVACY = {
  content_included: false,
  redaction_level: "standard"
};

export function createSimulatedCapabilities() {
  return createCapabilities(SIMULATED_ADAPTER_ID, {
    observe: {
      run_lifecycle: true,
      subagents: true,
      tool_calls: true,
      resource_reads: true,
      resource_changes: true,
      validation: true,
      artifacts: true,
      errors: true,
      usage_tokens: false,
      usage_cost: false,
      outcome_evidence: true
    },
    content: {
      task_title: true,
      task_text: false,
      tool_arguments: false,
      resource_paths: true,
      artifact_paths: true,
      output_summary: false
    }
  });
}

/**
 * Create a deterministic, contract-faithful run. The optional child run
 * exercises parent/child identity without changing the root run's outcome.
 */
export function createSimulatedRunSequence({
  includeChildRun = true,
  baseTimestamp = "2026-09-08T10:00:00.000Z"
} = {}) {
  const baseTime = Date.parse(baseTimestamp);
  if (Number.isNaN(baseTime)) {
    throw new TypeError("baseTimestamp must be a valid ISO-8601 timestamp");
  }

  let eventNumber = 0;
  const timestamp = () => new Date(baseTime + eventNumber++ * 1000).toISOString();
  const rootContext = {
    workspace_id: "workspace-simulated",
    project_id: "project-authentication",
    run_id: ROOT_RUN_ID,
    agent_id: ROOT_AGENT_ID
  };
  const childContext = {
    ...rootContext,
    run_id: CHILD_RUN_ID,
    parent_run_id: ROOT_RUN_ID,
    agent_id: CHILD_AGENT_ID,
    parent_agent_id: ROOT_AGENT_ID
  };
  const makeEvent = (eventId, context, type, attributes, extra = {}) => ({
    uarp_version: UARP_VERSION,
    event_id: eventId,
    timestamp: timestamp(),
    source: { ...SOURCE },
    context: { ...context },
    type,
    attributes: { ...attributes },
    privacy: { ...PRIVACY },
    ...extra
  });

  const events = [
    makeEvent(
      "evt-auth-run-started",
      rootContext,
      "run.started",
      { title: "Fix Authentication", task_text_available: false, mode: "simulated" },
      { status: "started" }
    )
  ];

  if (includeChildRun) {
    events.push(
      makeEvent(
        "evt-auth-child-agent-started",
        childContext,
        "agent.started",
        { role: "research", name: "research-agent", purpose: "Inspect authentication path" },
        { status: "started" }
      ),
      makeEvent(
        "evt-auth-child-resource-activity",
        childContext,
        "resource.activity",
        { resource_kind: "file", read_count: 8, search_count: 3, resource_count: 6, duration_ms: 500, scope: "project" }
      ),
      makeEvent(
        "evt-auth-child-agent-completed",
        childContext,
        "agent.completed",
        { role: "research", name: "research-agent" },
        { status: "completed" }
      )
    );
  }

  events.push(
    makeEvent(
      "evt-auth-resource-activity",
      rootContext,
      "resource.activity",
      { resource_kind: "file", read_count: 12, search_count: 4, resource_count: 10, duration_ms: 800, scope: "project" }
    ),
    makeEvent(
      "evt-auth-change-initial",
      rootContext,
      "resource.changed",
      { resource_kind: "file", change_type: "modified", path_or_name: "src/AuthService.js", extension: "js", size_delta: 48 }
    ),
    makeEvent(
      "evt-auth-validation-failed",
      rootContext,
      "validation.completed",
      { kind: "test", passed: 13, failed: 3, total: 16, duration_ms: 12400, target: "AuthTests" },
      {
        status: "failed",
        evidence_refs: [
          { id: "evidence-auth-tests-01", kind: "validation", local_ref: "validation://run-auth-001/01", content_available: true }
        ]
      }
    ),
    makeEvent(
      "evt-auth-change-recovery",
      rootContext,
      "resource.changed",
      { resource_kind: "file", change_type: "modified", path_or_name: "src/AuthService.js", extension: "js", size_delta: 16 }
    ),
    makeEvent(
      "evt-auth-validation-succeeded",
      rootContext,
      "validation.completed",
      { kind: "test", passed: 16, failed: 0, total: 16, duration_ms: 13800, target: "AuthTests" },
      {
        status: "succeeded",
        evidence_refs: [
          { id: "evidence-auth-tests-02", kind: "validation", local_ref: "validation://run-auth-001/02", content_available: true }
        ]
      }
    ),
    makeEvent(
      "evt-auth-artifact-created",
      rootContext,
      "artifact.created",
      {
        artifact_id: "artifact-auth-refactor",
        kind: "code",
        name: "auth-refactor.patch",
        uri_or_path: "artifacts/auth-refactor.patch",
        durable: true,
        relation: "created"
      },
      {
        evidence_refs: [
          { id: "evidence-auth-artifact", kind: "artifact", local_ref: "artifact://artifact-auth-refactor", content_available: false }
        ]
      }
    ),
    makeEvent(
      "evt-auth-run-completed",
      rootContext,
      "run.completed",
      { native_outcome: "succeeded", duration_ms: 24000, output_summary_available: false },
      { status: "completed" }
    )
  );

  events.forEach(validateRuntimeEvent);
  return events;
}

export class SimulatedHarnessAdapter {
  #includeChildRun;
  #running = false;
  #emissionCount = 0;

  constructor({ includeChildRun = true } = {}) {
    this.id = SIMULATED_ADAPTER_ID;
    this.#includeChildRun = includeChildRun;
  }

  async detect() {
    return true;
  }

  async getCapabilities() {
    return validateHarnessCapabilities(createSimulatedCapabilities());
  }

  async start(observer) {
    assertRuntimeObserver(observer);
    if (this.#running) {
      return;
    }

    this.#running = true;
    try {
      for (const event of createSimulatedRunSequence({ includeChildRun: this.#includeChildRun })) {
        if (!this.#running) {
          break;
        }
        await observer.emit(event);
        this.#emissionCount += 1;
      }
    } finally {
      this.#running = false;
    }
  }

  async stop() {
    this.#running = false;
  }

  get isRunning() {
    return this.#running;
  }

  get emissionCount() {
    return this.#emissionCount;
  }
}
