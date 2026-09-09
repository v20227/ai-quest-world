import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLiveTail } from "../../apps/world-web/live-tail.mjs";
import { PersistentWorldRuntime } from "../../apps/world-web/world-runtime.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hasZstd = spawnSync("zstd", ["--version"]).status === 0;

function codexRolloutLines(sessionId, cwd, { withWork = true } = {}) {
  const lines = [
    JSON.stringify({
      timestamp: "2026-09-09T10:00:00.000Z", ordinal: 1, type: "session_meta",
      payload: { session_id: sessionId, id: sessionId, timestamp: "2026-09-09T10:00:00.000Z", cwd, originator: "Codex Desktop", cli_version: "0.153.4" }
    })
  ];
  if (withWork) {
    lines.push(
      JSON.stringify({
        timestamp: "2026-09-09T10:00:01.000Z", ordinal: 2, type: "event_msg",
        payload: { type: "item_completed", item: { id: "cmd-1", type: "CommandExecution", command: "node --test", cwd, status: "completed", exit_code: 0, aggregated_output: "# tests 1\n# pass 1\n# fail 0" } }
      }),
      JSON.stringify({
        timestamp: "2026-09-09T10:00:02.000Z", ordinal: 3, type: "event_msg",
        payload: { type: "item_completed", item: { id: "reason-1", type: "Reasoning", text: "private-live-tail-marker" } }
      })
    );
  }
  return lines;
}

test("live tail streams codex desktop rollouts into the world and settles on inactivity", async t => {
  const root = await mkdtemp(join(tmpdir(), "aqw-live-codex-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const codexHome = join(root, "codex");
  const dshHome = join(root, "dsh");
  const day = join(codexHome, "sessions", "2026", "09", "09");
  await mkdir(day, { recursive: true });

  const runtime = new PersistentWorldRuntime({ path: ":memory:" });
  t.after(() => runtime.close());
  const sessionId = "11111111-2222-4333-8444-555555555555";
  await writeFile(join(day, `rollout-2026-09-09T10-00-00-${sessionId}.jsonl`), `${codexRolloutLines(sessionId, root).join("\n")}\n`);

  const slowTail = startLiveTail({ runtime, codexHome, dshHome, pollMs: 40, settleMinutes: 30 });
  await sleep(250);
  slowTail.stop();

  const active = runtime.getSnapshot();
  assert.equal(active.quests.length, 1);
  assert.notEqual(active.quests[0].status, "COMPLETED");
  assert.equal(JSON.stringify(active).includes("private-live-tail-marker"), false);

  const fastTail = startLiveTail({ runtime, codexHome, dshHome, pollMs: 40, settleMinutes: 0.002 });
  t.after(() => fastTail.stop());
  await sleep(500);
  const settled = runtime.getSnapshot();
  assert.equal(settled.quests[0].status, "COMPLETED");
  const terminal = settled.quests[0].settlement_snapshot.event_ids.length > 0;
  assert.equal(terminal, true);
  assert.ok(fastTail.watchedFileCount >= 1);
});

{ const zstdTest = hasZstd ? test : test.skip;
  zstdTest("live tail watches zstd-compressed dsh sessions and dedupes across polls", async t => {
    const root = await mkdtemp(join(tmpdir(), "aqw-live-dsh-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const dshHome = join(root, "dsh");
    const codexHome = join(root, "codex");
    const sessionDir = join(dshHome, "sessions", "--tmp-project--", "session-abc");
    await mkdir(sessionDir, { recursive: true });

    const lines = [
      JSON.stringify({ type: "session", version: 0, id: "session-abc", createdAt: 1788611594041, cwd: root, delegationDepth: 0 }),
      JSON.stringify({ type: "session/title", seq: 1, time: 1788611595041, data: { title: "Live dsh task" } }),
      JSON.stringify({ type: "tool/call", seq: 2, time: 1788611596041, data: { turn: 1, step: 1, callId: "c1", name: "bash", arguments: JSON.stringify({ command: "node --test" }) } }),
      JSON.stringify({ type: "tool/result", seq: 3, time: 1788611597041, data: { turn: 1, step: 1, message: { content: [{ type: "tool-result", content: [{ type: "text", text: "# tests 1\n# pass 1\n# fail 0" }], isError: false }] } }, sourceEventSeqs: [2] })
    ];
    const plain = join(root, "session.jsonl");
    await writeFile(plain, `${lines.join("\n")}\n`);
    const compressed = spawnSync("zstd", ["-q", "-f", plain, "-o", join(sessionDir, "session.jsonl.zstd")]);
    assert.equal(compressed.status, 0);

    const runtime = new PersistentWorldRuntime({ path: ":memory:" });
    const tail = startLiveTail({ runtime, codexHome, dshHome, pollMs: 40, settleMinutes: 0.002 });
    t.after(() => { tail.stop(); runtime.close(); });

    await sleep(300);
    const first = runtime.getSnapshot();
    assert.equal(first.quests.length, 1);
    assert.equal(first.quests[0].title, "Live dsh task");
    const eventCount = runtime.getDiagnostics().event_count;

    await sleep(300);
    assert.equal(runtime.getDiagnostics().event_count, eventCount);

    await sleep(300);
    assert.equal(runtime.getSnapshot().quests[0].status, "COMPLETED");
  });
}
