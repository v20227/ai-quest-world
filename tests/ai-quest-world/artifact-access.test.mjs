import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, symlink, link, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { request } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";
import { CodexCliHarnessAdapter } from "../../adapters/codex-cli/index.mjs";
import { readArtifact } from "../../apps/world-web/artifact-access.mjs";
import { createWorldWebServer } from "../../apps/world-web/server.mjs";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "ai-quest-world-artifact-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "project"); await mkdir(root);
  const snapshot = { quests: [{ quest_id: "q", artifact_refs: [] }] };
  const add = (id, path) => snapshot.quests[0].artifact_refs.push({ artifact_id: id, uri_or_path: path, durable: true });
  return { directory, root, snapshot, add, get: id => readArtifact({ root, snapshot, questId: "q", artifactId: id }) };
}

test("artifact access requires opt-in, exact registered identity and an existing local regular file", async t => {
  const f = await fixture(t); const path = join(f.root, "result.md");
  await writeFile(path, "# A real result\n"); f.add("a", pathToFileURL(path).href);
  assert.equal((await f.get("a")).content.toString(), "# A real result\n");
  assert.equal(await f.get("unknown"), null);
  assert.equal(await readArtifact({ root: null, snapshot: f.snapshot, questId: "q", artifactId: "a" }), null);
  assert.equal(await readArtifact({ root: f.root, snapshot: f.snapshot, questId: "other", artifactId: "a" }), null);
  await rm(path); assert.equal(await f.get("a"), null);
});

test("artifact viewing denies traversal, symlinks, hardlinks, hidden files, databases, remote references and oversized files", async t => {
  const f = await fixture(t);
  const outside = join(f.directory, "outside.txt"); await writeFile(outside, "outside");
  await writeFile(join(f.root, ".env"), "synthetic-private");
  await writeFile(join(f.root, "world.sqlite"), "synthetic-database");
  await writeFile(join(f.root, "large.txt"), Buffer.alloc(1024 * 1024 + 1));
  await symlink(outside, join(f.root, "linked.txt"));
  await link(outside, join(f.root, "hard.txt"));
  await symlink(f.directory, join(f.root, "parent"));
  for (const [id, path] of Object.entries({ outside, traversal: "../outside.txt", hidden: ".env", database: "world.sqlite", symlink: "linked.txt", hardlink: "hard.txt", parent: "parent/outside.txt", remote: "https://example.com/result", large: "large.txt" })) {
    f.add(id, path); assert.equal(await f.get(id), null, id);
  }
});

test("HTTP artifact viewing is local-origin only and renders active content as sandboxed plain text", async t => {
  const f = await fixture(t); await writeFile(join(f.root, "result.html"), "<script>globalThis.pwned=true</script>");
  f.add("html", "result.html");
  const runtime = { getSnapshot: () => f.snapshot };
  const server = createWorldWebServer({ runtime, artifactRoot: f.root });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port; const origin = `http://127.0.0.1:${port}`;
  const response = await fetch(`${origin}/api/artifact?quest=q&artifact=html`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/plain/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy"), /sandbox/);
  assert.equal(await response.text(), "<script>globalThis.pwned=true</script>");
  assert.equal((await fetch(`${origin}/api/artifact?quest=q&artifact=html`, { headers: { origin: "https://attacker.example" } })).status, 403);
  assert.equal((await fetch(`${origin}/api/artifact?quest=q&artifact=html`, { headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  const status = await new Promise(resolve => {
    const req = request(`${origin}/api/artifact?quest=q&artifact=html`, { headers: { host: `attacker.example:${port}` } }, res => { res.resume(); resolve(res.statusCode); });
    req.end();
  });
  assert.equal(status, 403);
  assert.equal((await fetch(`${origin}/api/artifact?path=result.html`)).status, 404);
});

test("database extensions and disguised SQLite content cannot be collected or served", async t => {
  const f = await fixture(t);
  for (const name of ["synthetic.sqlite3", "disguised.txt", "journal.db-wal", "shared.db-shm", "alternate.db3"]) {
    const database = new DatabaseSync(join(f.root, name));
    database.exec("CREATE TABLE synthetic (value TEXT)"); database.close();
    f.add(name, name);
    assert.equal(await f.get(name), null, name);
    const events = [];
    const lines = [{ type: "thread.started", thread_id: "thread" }, { type: "turn.started" },
      { type: "item.completed", item: { id: "file", type: "file_change", status: "completed", changes: [{ path: name, kind: "add" }] } }, { type: "turn.completed" }];
    await new CodexCliHarnessAdapter({ input: Readable.from(lines.map(line => JSON.stringify(line) + "\n")),
      runId: name, cwd: f.root, artifactPaths: true }).start({ emit: async event => events.push(event) });
    assert.equal(events.some(event => event.type.startsWith("artifact.")), false, name);
  }
});
