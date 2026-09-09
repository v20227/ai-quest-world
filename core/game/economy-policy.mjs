import { COMPANION, SHOP_CATALOG, ECONOMY_VERSION, EconomyError } from "../../packages/game-contracts/economy.mjs";

export function workGoldGrants(progressions) {
  return progressions.flatMap(progression => {
    if (progression.resolution !== "RESOLVED" || progression.status !== "COMPLETED") return [];
    const amount = progression.outcome_confidence === "VERIFIED" ? 20 : progression.outcome_confidence === "SUPPORTED" ? 12 : 0;
    if (!amount) return [];
    return [{ root_run_id: progression.root_run_id, quest_id: progression.quest_id,
      quest_title: progression.quest_snapshot.title, confidence: progression.outcome_confidence,
      amount, occurred_at: progression.quest_snapshot.updated_at, policy_version: ECONOMY_VERSION }];
  }).sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.root_run_id.localeCompare(b.root_run_id));
}

export function companionStage(growth) {
  return growth >= 100 ? "默契伙伴" : growth >= 60 ? "亲密伙伴" : growth >= 25 ? "熟悉伙伴" : "初识伙伴";
}

export function applyEconomyCommand(state, command, at) {
  const next = structuredClone(state);
  const item = SHOP_CATALOG.find(entry => entry.item_id === command.item_id);
  let goldDelta = 0;
  let growthDelta = 0;
  let message;
  if (command.action === "buy") {
    if (item.kind === "egg" && (command.quantity !== 1 || next.inventory[item.item_id] > 0 || next.pets.length > 0)) {
      throw new EconomyError("ALREADY_OWNED", "已有伙伴或待孵化的蛋，不能重复购买。");
    }
    const cost = item.price * command.quantity;
    if (next.gold < cost) throw new EconomyError("INSUFFICIENT_GOLD", "金币不足，请先完成合格的真实任务。");
    next.gold -= cost;
    goldDelta = -cost;
    next.inventory[item.item_id] = (next.inventory[item.item_id] ?? 0) + command.quantity;
    if (!Number.isSafeInteger(next.inventory[item.item_id])) throw new EconomyError("LIMIT_REACHED", "库存已达上限。");
    message = `${item.name} × ${command.quantity} 已收入背包。`;
  } else if (command.action === "hatch") {
    if (item.kind !== "egg") throw new EconomyError("INVALID_COMMAND", "此物品不能孵化。");
    if (!(next.inventory[item.item_id] > 0)) throw new EconomyError("INSUFFICIENT_STOCK", "背包中没有伙伴蛋。");
    if (next.pets.length) throw new EconomyError("ALREADY_OWNED", "已经拥有这位伙伴。");
    next.inventory[item.item_id] -= 1;
    next.pets.push({ pet_id: COMPANION.id, name: COMPANION.name, growth: 0, hatched_at: at, hatch_command_id: command.command_id });
    message = "信号伙伴已孵化。可以选择让它陪伴你的工作。";
  } else if (command.action === "feed") {
    const pet = next.pets.find(entry => entry.pet_id === command.pet_id);
    if (!pet) throw new EconomyError("PET_NOT_OWNED", "尚未拥有这位伙伴。");
    if (item.kind !== "food") throw new EconomyError("INVALID_COMMAND", "此物品不能喂养。");
    if (pet.growth >= COMPANION.max_growth) throw new EconomyError("GROWTH_COMPLETE", "伙伴已达当前成长上限，不会消耗食物。");
    if ((next.inventory[item.item_id] ?? 0) < command.quantity) throw new EconomyError("INSUFFICIENT_STOCK", "食物数量不足。");
    const required = Math.ceil((COMPANION.max_growth - pet.growth) / item.growth);
    if (command.quantity > required) throw new EconomyError("EXCESS_FOOD", `本次最多需要 ${required} 份，避免浪费食物。`);
    next.inventory[item.item_id] -= command.quantity;
    growthDelta = Math.min(COMPANION.max_growth - pet.growth, item.growth * command.quantity);
    pet.growth += growthDelta;
    message = `喂养完成，成长 +${growthDelta} · ${companionStage(pet.growth)}。`;
  } else if (command.action === "select") {
    if (command.pet_id !== null && !next.pets.some(pet => pet.pet_id === command.pet_id)) throw new EconomyError("PET_NOT_OWNED", "尚未拥有这位伙伴。");
    next.selected_pet_id = command.pet_id;
    message = command.pet_id ? "信号伙伴已来到你的工作世界。" : "已取消展示，伙伴仍保留在图鉴中。";
  }
  next.revision += 1;
  return { state: next, receipt: { command_id: command.command_id, policy_version: ECONOMY_VERSION, action: command.action, item_id: command.item_id ?? null,
    quantity: command.quantity ?? null, pet_id: command.pet_id ?? null, gold_delta: goldDelta,
    growth_delta: growthDelta, balance_after: next.gold, revision: next.revision, occurred_at: at, message } };
}
