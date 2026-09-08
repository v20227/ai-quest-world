import test from "node:test";
import assert from "node:assert/strict";

import {
  createCapabilities,
  parseRuntimeEvent,
  UARP_VERSION,
  validateHarnessCapabilities,
  validateRuntimeEvent
} from "../../packages/uarp/index.mjs";
import {
  assertHarnessAdapter,
  assertRuntimeObserver,
  getValidatedCapabilities
} from "../../packages/adapter-core/contracts.mjs";
import {
  createSimulatedCapabilities,
  createSimulatedRunSequence,
  SimulatedHarnessAdapter
} from "../../adapters/first-harness/simulated-adapter.mjs";
import { aggregateBatch } from "../../observer/aggregation.mjs";
import { LocalRuntimeObserver } from "../../observer/runtime-observer.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

function collectingSink() {
  const events = [];
  return {
    events,
    async emit(event) {
      events.push(clone(event));
    }
  };
}

test("valid UARP events parse and round-trip without losing factual data", () => {
  const event = createSimulatedRunSequence({ includeChildRun: false })[0];
  const parsed = parseRuntimeEvent(JSON.stringify(event));

  assert.deepEqual(parsed, event);
  assert.equal(parsed.uarp_version, UARP_VERSION);
  assert.equal(parsed.type, "run.started");
  assert.equal(parsed.context.run_id, "run-auth-001");
});

test("UARP rejects missing identity and unsupported versions", () => {
  const event = createSimulatedRunSequence({ includeChildRun: false })[0];

  const missingEventId = clone(event);
  delete missingEventId.event_id;
  assert.throws(() => validateRuntimeEvent(missingEventId), /event\.event_id/);

  const missingRunId = clone(event);
  delete missingRunId.context.run_id;
  assert.throws(() => validateRuntimeEvent(missingRunId), /event\.context\.run_id/);

  const unsupportedVersion = { ...clone(event), uarp_version: "0.2" };
  assert.throws(() => validateRuntimeEvent(unsupportedVersion), /uarp_version.*0\.1/);
});

test("UARP validates capabilities and keeps game semantics out of attributes", () => {
  const capabilities = createCapabilities("test-adapter", {
    observe: { run_lifecycle: true },
    content: { task_title: true }
  });

  assert.doesNotThrow(() => validateHarnessCapabilities(capabilities));
  assert.equal(capabilities.observe.run_lifecycle, true);
  assert.equal(capabilities.observe.validation, false);
  assert.equal(capabilities.content.task_title, true);

  const invalidCapabilities = { ...clone(capabilities), uarp_version: "0.2" };
  assert.throws(() => validateHarnessCapabilities(invalidCapabilities), /uarp_version/);

  const event = createSimulatedRunSequence({ includeChildRun: false })[0];
  assert.throws(
    () => validateRuntimeEvent({ ...event, attributes: { xp: 10 } }),
    /game semantics are not allowed/
  );
});

test("Adapter Core exposes valid contracts and simulated lifecycle is safe", async () => {
  const adapter = new SimulatedHarnessAdapter({ includeChildRun: true });
  const sink = collectingSink();
  const observer = new LocalRuntimeObserver({ downstream: sink });

  assert.doesNotThrow(() => assertHarnessAdapter(adapter));
  assert.doesNotThrow(() => assertRuntimeObserver(observer));
  await adapter.stop();
  assert.equal(await adapter.detect(), true);
  assert.deepEqual(await getValidatedCapabilities(adapter), createSimulatedCapabilities());

  await adapter.start(observer);
  await adapter.start(observer);
  await adapter.stop();

  assert.deepEqual(
    sink.events.map((event) => event.type),
    [
      "run.started",
      "agent.started",
      "resource.activity",
      "agent.completed",
      "resource.activity",
      "resource.changed",
      "validation.completed",
      "resource.changed",
      "validation.completed",
      "artifact.created",
      "run.completed"
    ]
  );
  assert.equal(adapter.isRunning, false);
  assert.equal(adapter.emissionCount, 22);
});

test("Observer deduplicates event IDs and preserves buffering order", async () => {
  const eventSequence = createSimulatedRunSequence({ includeChildRun: false });
  const sink = collectingSink();
  const observer = new LocalRuntimeObserver({ downstream: sink, autoFlush: false });

  const first = await observer.emit(eventSequence[0]);
  const duplicate = await observer.emit(clone(eventSequence[0]));
  await observer.emit(eventSequence[1]);

  assert.deepEqual(first, { accepted: true, duplicate: false, event_id: "evt-auth-run-started" });
  assert.deepEqual(duplicate, { accepted: false, duplicate: true, event_id: "evt-auth-run-started" });
  assert.equal(observer.pendingEventCount, 2);
  assert.equal(sink.events.length, 0);

  await observer.flush();
  assert.equal(observer.pendingEventCount, 0);
  assert.deepEqual(sink.events.map((event) => event.event_id), [
    "evt-auth-run-started",
    "evt-auth-resource-activity"
  ]);
  assert.equal(observer.hasProcessed("evt-auth-run-started"), true);
});

test("Observer redaction hook preserves identity and records the privacy change", async () => {
  const changedEvent = createSimulatedRunSequence({ includeChildRun: false })
    .find((event) => event.type === "resource.changed");
  const sink = collectingSink();
  const observer = new LocalRuntimeObserver({
    downstream: sink,
    redactor(event) {
      const { path_or_name: _path, ...attributes } = event.attributes;
      return {
        ...event,
        attributes,
        privacy: {
          ...event.privacy,
          redaction_level: "strict",
          fields_redacted: ["attributes.path_or_name"]
        }
      };
    }
  });

  await observer.emit(changedEvent);

  assert.equal(sink.events[0].event_id, changedEvent.event_id);
  assert.equal(sink.events[0].attributes.path_or_name, undefined);
  assert.equal(sink.events[0].privacy.redaction_level, "strict");
  assert.deepEqual(sink.events[0].privacy.fields_redacted, ["attributes.path_or_name"]);
});

test("resource aggregation collapses only resource activity and preserves high-value events", () => {
  const sequence = createSimulatedRunSequence({ includeChildRun: false });
  const firstActivity = sequence.find((event) => event.type === "resource.activity");
  const secondActivity = {
    ...clone(firstActivity),
    event_id: "evt-auth-resource-activity-extra",
    timestamp: "2026-09-08T10:00:30.000Z",
    attributes: {
      ...firstActivity.attributes,
      read_count: 3,
      search_count: 2,
      resource_count: 2,
      duration_ms: 100
    }
  };
  const validation = sequence.find((event) => event.type === "validation.completed");
  const artifact = sequence.find((event) => event.type === "artifact.created");
  const terminal = sequence.at(-1);

  const result = aggregateBatch([
    sequence[0],
    firstActivity,
    secondActivity,
    validation,
    artifact,
    terminal
  ]);

  const aggregate = result.find((event) => event.type === "resource.activity");
  assert.equal(result.filter((event) => event.type === "resource.activity").length, 1);
  assert.equal(result.filter((event) => event.type === "validation.completed").length, 1);
  assert.equal(result.filter((event) => event.type === "artifact.created").length, 1);
  assert.equal(aggregate.attributes.read_count, 15);
  assert.equal(aggregate.attributes.search_count, 6);
  assert.equal(aggregate.attributes.resource_count, 12);
  assert.equal(aggregate.attributes.duration_ms, 900);
  assert.deepEqual(result.map((event) => event.type), [
    "run.started",
    "resource.activity",
    "validation.completed",
    "artifact.created",
    "run.completed"
  ]);
});

test("simulated parent and child run identities survive the observer boundary", async () => {
  const sink = collectingSink();
  const observer = new LocalRuntimeObserver({ downstream: sink });
  const adapter = new SimulatedHarnessAdapter({ includeChildRun: true });

  await adapter.start(observer);

  const childEvent = sink.events.find((event) => event.context.run_id === "run-auth-research-001");
  assert.equal(childEvent.context.parent_run_id, "run-auth-001");
  assert.equal(childEvent.context.agent_id, "agent-research");
  assert.equal(childEvent.context.parent_agent_id, "agent-root");
  assert.equal(sink.events.find((event) => event.type === "run.completed").context.run_id, "run-auth-001");
});
