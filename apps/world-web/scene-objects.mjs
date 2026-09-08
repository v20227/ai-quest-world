import { SCENE_ASSETS } from "./scene-assets.mjs";

export function createSceneObjects(root, onSelect, catalog = SCENE_ASSETS) {
  const objects = new Map();
  const doc = root.ownerDocument;
  function upsert(definition) {
    let entry = objects.get(definition.id);
    if (!entry) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "scene-object-control";
      const label = doc.createElement("span");
      button.append(label);
      entry = { button, label, definition };
      button.addEventListener("click", () => onSelect(entry.definition.id));
      root.append(button);
      objects.set(definition.id, entry);
    }
    entry.definition = definition;
    const candidate = Object.hasOwn(catalog, definition.assetId ?? "") ? catalog[definition.assetId] : null;
    const asset = candidate?.runtimeReady === false ? null : candidate;
    if (entry.assetId !== asset?.id) {
      entry.image?.remove();
      entry.image = null;
      entry.assetId = asset?.id;
      delete entry.button.dataset.assetError;
      if (asset) {
        const image = doc.createElement("img");
        image.alt = "";
        image.src = asset.src;
        image.className = "scene-object-image";
        image.addEventListener("error", () => { image.hidden = true; entry.button.dataset.assetError = "true"; });
        entry.button.prepend(image);
        entry.image = image;
      }
    }
    entry.label.textContent = definition.label;
    entry.button.title = definition.description ?? definition.label;
    entry.button.disabled = Boolean(definition.disabled);
    entry.button.style.left = `${Math.max(0, Math.min(100, definition.x))}%`;
    entry.button.style.top = `${Math.max(0, Math.min(100, definition.y))}%`;
    entry.button.style.zIndex = String(definition.layer ?? 1);
    if (asset) {
      const anchor = asset.anchor ?? [0.5, 0.5];
      entry.button.style.setProperty("--object-anchor-x", `${-100 * anchor[0]}%`);
      entry.button.style.setProperty("--object-anchor-y", `${-100 * anchor[1]}%`);
      entry.button.dataset.hasAsset = "true";
    } else {
      entry.button.style.removeProperty("--object-anchor-x");
      entry.button.style.removeProperty("--object-anchor-y");
      delete entry.button.dataset.hasAsset;
    }
    entry.button.dataset.objectId = definition.id;
    entry.button.setAttribute("aria-label", definition.label);
    return entry.button;
  }
  return {
    upsert,
    remove(id) { objects.get(id)?.button.remove(); objects.delete(id); },
    destroy() { for (const entry of objects.values()) entry.button.remove(); objects.clear(); }
  };
}
