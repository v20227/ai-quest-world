import { parseRuntimeEvent } from "./runtime-event.mjs";

export function orderRuntimeEvents(inputs) {
  const unique = new Map();
  for (const event of inputs.map(parseRuntimeEvent)) if (!unique.has(event.event_id)) unique.set(event.event_id, event);
  const events = [...unique.values()];
  const rank = event => event.type === "run.started" ? 0 : /^run\.(completed|failed|cancelled)$/.test(event.type) ? 2 : 1;
  return events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || rank(a) - rank(b) || a.event_id.localeCompare(b.event_id));
}

export class RunLineage {
  #edges = new Map();
  #parents = new Set();
  #resumes = new Set();
  #started = new Set();
  constructor(events = []) { for (const event of events) this.observe(event); }
  observe(event) {
    const run = event.context.run_id;
    if (event.type === "run.started") this.#started.add(run);
    const edges = this.#edges.get(run) ?? new Set();
    if (event.context.parent_run_id) {
      edges.add(event.context.parent_run_id);
      this.#parents.add(run);
    }
    if (event.type === "run.started" && event.attributes.resumed_from_run_id) {
      edges.add(event.attributes.resumed_from_run_id);
      this.#resumes.add(run);
    }
    this.#edges.set(run, edges);
  }
  rootFor(run, visited = new Set()) {
    if (visited.has(run)) return null;
    const edges = this.#edges.get(run);
    if (edges?.size > 1) return null;
    if (!edges?.size) return run;
    const next = new Set(visited).add(run);
    const roots = new Set([...edges].map(parent => this.rootFor(parent, next)));
    return roots.size === 1 && !roots.has(null) ? [...roots][0] : null;
  }
  isDriver(run) {
    if (this.#parents.has(run) || this.rootFor(run) === null) return false;
    const edges = this.#edges.get(run);
    if (!edges?.size) return this.#started.has(run);
    return this.#resumes.has(run) && [...edges].every(parent => this.isDriver(parent));
  }
}
