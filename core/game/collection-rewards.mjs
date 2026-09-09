export function milestoneCollectibles(world) {
  const milestone = world.milestones.find(item => item.milestone_id === "first_verified_outcome");
  if (!milestone?.quest_id) return [];
  return [{
    grant_id: "milestone:first_verified_outcome:verified-memento",
    item_id: "verified-memento",
    rule_id: "first-verified-memento-1",
    milestone_id: milestone.milestone_id,
    quest_id: milestone.quest_id,
    earned_at: milestone.unlocked_at
  }];
}
