export const SCENE_ASSETS = Object.freeze({
  "workshop.desk": Object.freeze({ id: "workshop.desk", role: "furniture", src: "/assets/pixel/workshop/desk.png", anchor: [0.5, 1], layer: 10, runtimeReady: false }),
  "guild.environment": Object.freeze({ id: "guild.environment", role: "environment", src: "/assets/pixel/guild/hall-interior.png", anchor: [0.5, 0.5], layer: 0 }),
  "agent.archivist": Object.freeze({ id: "agent.archivist", name: "档案管理员", role: "body", displayAccess: "default", src: "/assets/pixel/guild/archivist.png", anchor: [0.5, 1], layer: 20 })
});

export const CHARACTER_SLOTS = Object.freeze(["back", "body", "apparel", "head", "tool", "effect"]);

export function composeCharacterLayers(selection, catalog = SCENE_ASSETS) {
  return CHARACTER_SLOTS.flatMap((slot, index) => {
    const id = selection?.[slot];
    const asset = Object.hasOwn(catalog, id ?? "") ? catalog[id] : null;
    return asset?.role === slot && asset.runtimeReady !== false ? [{ ...asset, slot, layer: index }] : [];
  });
}

export function renderCharacterLayers(host, selection, catalog = SCENE_ASSETS) {
  const layers = composeCharacterLayers(selection, catalog);
  const signature = JSON.stringify(layers.map(layer => layer.id));
  if (host.dataset.layers === signature) return;
  host.dataset.layers = signature;
  delete host.dataset.assetError;
  host.replaceChildren(...layers.map(layer => {
    const image = host.ownerDocument.createElement("img");
    image.src = layer.src;
    image.alt = "";
    image.dataset.assetId = layer.id;
    image.style.zIndex = String(layer.layer);
    image.addEventListener("error", () => { image.hidden = true; host.dataset.assetError = "true"; });
    return image;
  }));
}

export function resolveCharacterClip(selection, action, catalog = SCENE_ASSETS) {
  const layers = composeCharacterLayers(selection, catalog);
  const body = layers.find(layer => layer.slot === "body");
  const base = body?.clips?.[action];
  if (!base || !Number.isFinite(base.fps) || base.fps <= 0 || !Array.isArray(base.frames) || !base.frames.length) return null;
  const clips = layers.map(layer => ({ id: layer.id, clip: layer.clips?.[action] }));
  if (clips.some(({ clip }) => !clip || clip.fps !== base.fps || clip.frames?.length !== base.frames.length || !clip.frames.every(path => typeof path === "string" && path.startsWith("/assets/") && !path.includes("..")))) return null;
  return { fps: base.fps, frames: base.frames.length, loop: base.loop !== false, layers: clips };
}
