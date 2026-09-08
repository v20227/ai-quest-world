import { CHARACTER_SLOTS, SCENE_ASSETS } from "./scene-assets.mjs";

export const DEFAULT_CHARACTER = Object.freeze({ body: "agent.archivist" });
const KEY = "ai-quest-world-character-v1";

export function normalizeCharacterSelection(input) {
  const result = {};
  for (const slot of CHARACTER_SLOTS) {
    const id = input?.[slot];
    if (typeof id !== "string" || !Object.hasOwn(SCENE_ASSETS, id)) continue;
    const asset = SCENE_ASSETS[id];
    if (asset.role === slot && asset.runtimeReady !== false && asset.displayAccess === "default") result[slot] = id;
  }
  if (!result.body) result.body = DEFAULT_CHARACTER.body;
  return result;
}

export function loadCharacterSelection(storage) {
  try {
    const data = JSON.parse(storage?.getItem(KEY) ?? "null");
    return normalizeCharacterSelection(data?.version === 1 ? data.selection : DEFAULT_CHARACTER);
  } catch { return { ...DEFAULT_CHARACTER }; }
}

export function saveCharacterSelection(storage, input) {
  const selection = normalizeCharacterSelection(input);
  try {
    if (!storage) throw new Error("storage unavailable");
    storage.setItem(KEY, JSON.stringify({ version: 1, selection }));
    return { selection, saved: true };
  } catch { return { selection, saved: false }; }
}
