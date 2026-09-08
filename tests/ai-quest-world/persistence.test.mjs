import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";
import { validateRuntimeEvent } from "../../packages/uarp/runtime-event.mjs";
import { SqliteEventStore } from "../../storage/sqlite/event-store.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

async function createFileDatabase(t) {
  const directory = await mkdtemp(join(tmpdir(), "ai-quest-world-persistence-"));
  const path = join(directory, "events.sqlite");
  const handles = [];

  t.after(async () => {
    let cleanupError;

    for (const handle of handles) {
      if (handle.closed) {
        continue;
      }

      try {
        await handle.close();
      } catch (error) {
        cleanupError ??= error;
      }
    }

    try {
      await rm(directory, { recursive: true, force: true });
    } catch (error) {
      cleanupError ??= error;
    }

    if (cleanupError) {
      throw cleanupError;
    }
  });

  return {
    path,
    async open() {
      const store = new SqliteEventStore({ path });

      const handle = {
        store,
        closed: false,
        async close() {
          if (!handle.closed) {
            await store.close();
            handle.closed = true;
          }
        }
      };

      handles.push(handle);
      return handle;
    }
  };
}

async function createMemoryDatabase(t) {
  const store = new SqliteEventStore({ path: ":memory:" });

  const handle = {
    store,
    closed: false,
    async close() {
      if (!handle.closed) {
        await store.close();
        handle.closed = true;
      }
    }
  };

  t.after(() => handle.close());
  return handle;
}

function readSchemaState(path) {
  const database = new DatabaseSync(path);

  try {
    const { user_version: userVersion } = database
      .prepare("PRAGMA user_version")
      .get();
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
      .map(({ name }) => name);

    return { userVersion, tables };
  } finally {
    database.close();
  }
}

function eventWithId(sequence, eventId) {
  const event = sequence.find((candidate) => candidate.event_id === eventId);
  assert.ok(event, `fixture event ${eventId} must exist`);
  return clone(event);
}

test("opening file and memory stores creates a versioned schema and supports :memory:", async (t) => {
  const fileDatabase = await createFileDatabase(t);
  const fileHandle = await fileDatabase.open();
  await fileHandle.close();

  const schema = readSchemaState(fileDatabase.path);
  assert.equal(typeof schema.userVersion, "number");
  assert.ok(schema.userVersion >= 1);
  assert.ok(schema.tables.length >= 1);

  const memoryHandle = await createMemoryDatabase(t);
  const event = eventWithId(
    createSimulatedRunSequence({ includeChildRun: false }),
    "evt-auth-run-started"
  );

  await memoryHandle.store.append(event);
  assert.deepEqual(await memoryHandle.store.getById(event.event_id), event);
  assert.deepEqual(await memoryHandle.store.list(), [event]);
});

test("append validates UARP facts and preserves the complete envelope on getById and list", async (t) => {
  const database = await createMemoryDatabase(t);
  const event = eventWithId(
    createSimulatedRunSequence({ includeChildRun: true }),
    "evt-auth-validation-succeeded"
  );

  await database.store.append(event);

  assert.deepEqual(await database.store.getById(event.event_id), event);
  assert.deepEqual(await database.store.list(), [event]);

  const invalid = clone(event);
  invalid.event_id = "evt-invalid-game-semantic";
  invalid.attributes.xp = 10;

  await assert.rejects(
    async () => database.store.append(invalid),
    /event\./
  );
  assert.deepEqual(await database.store.list(), [event]);
});

test("append rejects values that JSON.stringify would silently change", async (t) => {
  const database = await createMemoryDatabase(t);
  const event = eventWithId(
    createSimulatedRunSequence({ includeChildRun: false }),
    "evt-auth-run-started"
  );
  event.attributes.unstable_measurement = Number.NaN;

  await assert.rejects(
    async () => database.store.append(event),
    /event\.attributes\.unstable_measurement.*finite JSON numbers/
  );
  assert.equal(database.store.count(), 0);
});

test("does not expose the raw SQLite handle", async (t) => {
  const database = await createMemoryDatabase(t);

  assert.equal("database" in database.store, false);
  assert.equal(database.store.database, undefined);
});

test("replay list preserves insertion order and stable run_id filtering", async (t) => {
  const database = await createMemoryDatabase(t);
  const sequence = createSimulatedRunSequence({ includeChildRun: true });
  const inserted = sequence.slice().reverse();

  for (const event of inserted) {
    await database.store.append(event);
  }

  const replayed = await database.store.list();
  assert.deepEqual(
    replayed.map((event) => event.event_id),
    inserted.map((event) => event.event_id)
  );

  const rootEvents = inserted.filter((event) => event.context.run_id === "run-auth-001");
  const childEvents = inserted.filter(
    (event) => event.context.run_id === "run-auth-research-001"
  );

  assert.deepEqual(
    (await database.store.list({ runId: "run-auth-001" })).map((event) => event.event_id),
    rootEvents.map((event) => event.event_id)
  );
  assert.deepEqual(
    (await database.store.list({ runId: "run-auth-research-001" })).map(
      (event) => event.event_id
    ),
    childEvents.map((event) => event.event_id)
  );
});

test("duplicate event_id is a no-op in one process and after close and reopen", async (t) => {
  const database = await createFileDatabase(t);
  const event = eventWithId(
    createSimulatedRunSequence({ includeChildRun: false }),
    "evt-auth-run-started"
  );

  const first = await database.open();
  await first.store.append(event);
  await first.store.append(clone(event));
  assert.deepEqual(await first.store.list(), [event]);
  await first.close();

  const reopened = await database.open();
  await reopened.store.append(clone(event));
  await reopened.store.append(clone(event));
  assert.deepEqual(await reopened.store.list(), [event]);
});

test("malformed append is rejected without creating a row", async (t) => {
  const database = await createMemoryDatabase(t);
  const invalid = eventWithId(
    createSimulatedRunSequence({ includeChildRun: false }),
    "evt-auth-run-started"
  );
  delete invalid.context.run_id;

  await assert.rejects(
    async () => database.store.append(invalid),
    /event\.context\.run_id/
  );
  assert.deepEqual(await database.store.list(), []);
});

test("appendMany is atomic when any event is invalid, including after reopen", async (t) => {
  const database = await createFileDatabase(t);
  const sequence = createSimulatedRunSequence({ includeChildRun: true });
  const firstValid = eventWithId(sequence, "evt-auth-run-started");
  const invalid = eventWithId(sequence, "evt-auth-child-resource-activity");
  const lastValid = eventWithId(sequence, "evt-auth-child-agent-completed");
  delete invalid.attributes.resource_kind;
  invalid.attributes.read_count = -1;

  const handle = await database.open();
  await assert.rejects(
    async () => handle.store.appendMany([firstValid, invalid, lastValid]),
    (error) => {
      assert.match(error.cause?.message ?? error.message, /event\.attributes\.read_count/);
      return true;
    }
  );
  assert.deepEqual(await handle.store.list(), []);
  await handle.close();

  const reopened = await database.open();
  assert.deepEqual(await reopened.store.list(), []);
});

test("parent and agent context, evidence references, and privacy metadata survive restart", async (t) => {
  const database = await createFileDatabase(t);
  const sourceEvent = eventWithId(
    createSimulatedRunSequence({ includeChildRun: true }),
    "evt-auth-validation-succeeded"
  );
  const event = {
    ...sourceEvent,
    event_id: "evt-persistence-child-validation",
    context: {
      ...sourceEvent.context,
      run_id: "run-persistence-child",
      parent_run_id: "run-auth-001",
      agent_id: "agent-persistence-child",
      parent_agent_id: "agent-root"
    },
    evidence_refs: [
      {
        id: "evidence-persistence-validation",
        kind: "validation",
        local_ref: "validation://run-persistence-child/01",
        content_available: true
      },
      {
        id: "evidence-persistence-artifact",
        kind: "artifact",
        uri: "artifact://artifact-auth-refactor",
        content_available: false
      }
    ],
    privacy: {
      content_included: false,
      redaction_level: "strict",
      fields_redacted: ["attributes.target", "evidence_refs[0].local_ref"]
    }
  };
  validateRuntimeEvent(event);

  const first = await database.open();
  await first.store.append(event);
  await first.close();

  const reopened = await database.open();
  const restored = await reopened.store.getById(event.event_id);

  assert.deepEqual(restored, event);
  assert.deepEqual(restored.context, event.context);
  assert.deepEqual(restored.evidence_refs, event.evidence_refs);
  assert.deepEqual(restored.privacy, event.privacy);
});
