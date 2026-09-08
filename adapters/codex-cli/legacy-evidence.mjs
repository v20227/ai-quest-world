export function supportedCodexEvidence(event) {
  if (event.source.adapter_id === "codex-cli" && event.source.adapter_version === "0.1.0"
    && ["validation.started", "validation.completed", "artifact.created", "artifact.updated", "resource.changed"].includes(event.type)) return null;
  return event;
}
