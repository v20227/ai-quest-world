export function recentQuests(quests) {
  return [...quests].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at) || a.quest_id.localeCompare(b.quest_id));
}

export function currentQuest(quests) {
  const ordered = recentQuests(quests);
  return ordered.find(quest => !["COMPLETED", "FAILED", "CANCELLED"].includes(quest.status)) ?? ordered[0];
}

export function artifactKey(artifact) { return JSON.stringify([artifact.source_quest_id, artifact.artifact_id]); }

export function allArtifacts(progressions, quests = []) {
  const rewards = new Set(progressions.flatMap(progression => progression.loot_refs).map(artifactKey));
  const facts = recentQuests(quests).flatMap(quest => quest.artifact_refs
    .filter(artifact => artifact.durable === true && (artifact.uri_or_path || artifact.evidence_refs?.some(ref => ref.uri || ref.local_ref)))
    .map(artifact => ({ ...artifact, source_quest_id: quest.quest_id })));
  const artifacts = [...facts, ...[...progressions].sort((a, b) => Date.parse(b.quest_snapshot.updated_at) - Date.parse(a.quest_snapshot.updated_at))
    .flatMap(progression => progression.loot_refs)];
  return [...new Map(artifacts.map(artifact => [artifactKey(artifact), artifact])).values()]
    .map(artifact => ({ ...artifact, rewarded: rewards.has(artifactKey(artifact)) }));
}

export function unseenReturns(world, seen, pending = []) {
  const queued = new Set(pending.map(entry => entry.return_id));
  return (world.return_history ?? []).filter(entry => !seen.has(entry.return_id) && !queued.has(entry.return_id));
}
