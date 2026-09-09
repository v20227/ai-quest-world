export const ECONOMY_VERSION = "economy-1";
export const COMPANION = Object.freeze({ id: "signal-companion", name: "信号伙伴", max_growth: 100 });
export const SHOP_CATALOG = Object.freeze([
  Object.freeze({ item_id: "signal-egg", name: "信号伙伴蛋", kind: "egg", price: 40, growth: 0, description: "确定孵化一位信号伙伴；同物种仅拥有一位。" }),
  Object.freeze({ item_id: "focus-apple", name: "专注苹果", kind: "food", price: 4, growth: 5, description: "每份增加 5 点成长。" }),
  Object.freeze({ item_id: "research-biscuit", name: "研究饼干", kind: "food", price: 8, growth: 12, description: "伙伴偏爱的食物，每份增加 12 点成长。" })
]);

export class EconomyError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function validateEconomyCommand(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new EconomyError("INVALID_COMMAND", "操作格式无效。");
  const allowed = {
    buy: ["item_id", "quantity"], hatch: ["item_id"], feed: ["pet_id", "item_id", "quantity"], select: ["pet_id"]
  };
  if (!Object.hasOwn(allowed, input.action)) throw new EconomyError("INVALID_COMMAND", "不支持此操作。");
  const fields = ["command_id", "revision", "action", ...allowed[input.action]];
  if (Object.keys(input).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(input, key))) {
    throw new EconomyError("INVALID_COMMAND", "操作字段无效。");
  }
  if (typeof input.command_id !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(input.command_id) ||
      !Number.isSafeInteger(input.revision) || input.revision < 0) throw new EconomyError("INVALID_COMMAND", "操作标识或版本无效。");
  if ("item_id" in input && !SHOP_CATALOG.some(item => item.item_id === input.item_id)) throw new EconomyError("INVALID_COMMAND", "物品不存在。");
  if ("quantity" in input && (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 20)) throw new EconomyError("INVALID_COMMAND", "数量须为 1 至 20 的整数。");
  if ("pet_id" in input && input.pet_id !== null && input.pet_id !== COMPANION.id) throw new EconomyError("INVALID_COMMAND", "伙伴不存在。");
  return Object.fromEntries(fields.map(key => [key, input[key]]));
}
