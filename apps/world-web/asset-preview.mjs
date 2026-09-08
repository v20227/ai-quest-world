import { SCENE_ASSETS, CHARACTER_SLOTS, renderCharacterLayers } from "./scene-assets.mjs";

const SLOT_LABELS = { back: "背饰", body: "基础角色", apparel: "服装", head: "头部", tool: "手持物", effect: "特效" };

export function createAssetPreview(host, { initialSelection = { body: "agent.archivist" }, onApply = null } = {}) {
  const doc = host.ownerDocument;
  const selection = { ...initialSelection };
  const selectors = new Map();
  const make = (tag, className, text) => {
    const element = doc.createElement(tag);
    element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const heading = make("h3", "", "资产与外观预览");
  const note = make("p", "artifact-meta", "这里只预览已有素材，不代表已获得收藏，不修改世界或奖励。");
  const portrait = make("div", "asset-preview-character");
  portrait.setAttribute("role", "img");
  portrait.setAttribute("aria-label", "角色图层组合预览");
  const controls = make("div", "asset-slot-controls");
  const status = make("p", "artifact-meta");
  status.setAttribute("role", "status");

  function render() {
    renderCharacterLayers(portrait, selection);
    const used = Object.values(selection).filter(Boolean).length;
    status.textContent = `当前组合 ${used} 个图层；暂无素材的插槽保持空置。`;
  }

  for (const slot of CHARACTER_SLOTS) {
    const label = make("label", "asset-slot-label", SLOT_LABELS[slot]);
    const select = make("select", "display-picker");
    const assets = Object.values(SCENE_ASSETS).filter(asset => asset.role === slot && asset.runtimeReady !== false && asset.displayAccess === "default");
    const empty = make("option", "", assets.length ? "不显示" : "暂无可用素材");
    empty.value = "";
    select.append(empty);
    for (const asset of assets) {
      const option = make("option", "", asset.name ?? asset.id);
      option.value = asset.id;
      select.append(option);
    }
    select.value = selection[slot] ?? "";
    select.disabled = assets.length === 0;
    selectors.set(slot, select);
    select.addEventListener("change", () => { selection[slot] = select.value; render(); });
    label.append(select);
    controls.append(label);
  }

  const catalog = make("div", "asset-preview-catalog");
  for (const asset of Object.values(SCENE_ASSETS)) {
    const card = make("article", "asset-preview-card");
    const title = make("h4", "", asset.name ?? asset.id);
    const state = make("p", "artifact-meta", asset.runtimeReady === false ? "制作中 · 未开放场景使用" : "可用于组合 · 非收藏授予");
    const image = make("img", "");
    image.src = asset.src;
    image.alt = asset.name ?? asset.id;
    image.loading = "lazy";
    image.addEventListener("error", () => { image.hidden = true; state.textContent = "素材加载失败"; });
    card.append(image, title, state);
    catalog.append(card);
  }
  const actions = make("div", "display-actions");
  const apply = make("button", "secondary-button", "应用到大厅角色");
  apply.type = "button";
  apply.disabled = !onApply;
  apply.addEventListener("click", () => {
    const result = onApply?.(selection);
    if (!result) return;
    Object.assign(selection, result.selection);
    for (const [slot, select] of selectors) select.value = selection[slot] ?? "";
    render();
    status.textContent = result.saved ? "角色展示已保存；未修改收藏或奖励" : "已应用，但无法保存；刷新后可能恢复原样";
  });
  const reset = make("button", "text-button", "预览默认外观");
  reset.type = "button";
  reset.addEventListener("click", () => {
    for (const key of Object.keys(selection)) delete selection[key];
    selection.body = "agent.archivist";
    for (const [slot, select] of selectors) select.value = selection[slot] ?? "";
    render();
  });
  actions.append(apply, reset);
  host.append(heading, note, portrait, controls, actions, status, catalog);
  render();
}
