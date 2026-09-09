import { createHash } from "node:crypto";

const identityKey = (...parts) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

export function describeRuntimeIdentities(events) {
  const projects = new Map();
  const agents = new Map();
  const runs = new Map();
  for (const event of events) {
    const context = event.context;
    const scope = [event.source.adapter_id, context.workspace_id ?? null, context.project_id ?? null];
    const projectKey = identityKey("project", ...scope);
    if (!projects.has(projectKey)) projects.set(projectKey, {
      project_key: projectKey, adapter_id: scope[0], workspace_id: scope[1], project_id: scope[2],
      identity_known: scope[1] !== null || scope[2] !== null
    });
    const runKey = identityKey("run", ...scope, context.run_id);
    const agentKey = context.agent_id ? identityKey("agent", ...scope, context.agent_id) : null;
    if (agentKey && !agents.has(agentKey)) agents.set(agentKey, {
      agent_key: agentKey, project_key: projectKey, agent_id: context.agent_id,
      identity_kind: "reported", run_keys: []
    });
    if (agentKey && !agents.get(agentKey).run_keys.includes(runKey)) agents.get(agentKey).run_keys.push(runKey);
    if (!runs.has(runKey)) runs.set(runKey, {
      run_key: runKey, run_id: context.run_id, project_key: projectKey,
      agent_keys: [], parent_run_keys: [], resumed_from_run_keys: [],
      first_event_at: event.timestamp, last_event_at: event.timestamp
    });
    const run = runs.get(runKey);
    if (agentKey && !run.agent_keys.includes(agentKey)) run.agent_keys.push(agentKey);
    if (context.parent_run_id) add(run.parent_run_keys, identityKey("run", ...scope, context.parent_run_id));
    if (event.type === "run.started" && typeof event.attributes.resumed_from_run_id === "string") {
      add(run.resumed_from_run_keys, identityKey("run", ...scope, event.attributes.resumed_from_run_id));
    }
    if (Date.parse(event.timestamp) < Date.parse(run.first_event_at)) run.first_event_at = event.timestamp;
    if (Date.parse(event.timestamp) > Date.parse(run.last_event_at)) run.last_event_at = event.timestamp;
  }
  return { projects: [...projects.values()], agents: [...agents.values()], runs: [...runs.values()] };
}

function add(values, value) {
  if (!values.includes(value)) values.push(value);
}
