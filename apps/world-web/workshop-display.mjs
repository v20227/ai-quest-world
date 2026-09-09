import { allArtifacts, artifactKey } from "./view-state.mjs";

const STORAGE_KEY = "ai-quest-world-display-v1";

export function readDisplaySelection(storage, namespace) {
  if (!namespace) return null;
  try {
    const value = JSON.parse(storage.getItem(`${STORAGE_KEY}:${namespace}`) ?? "null");
    if (value?.version !== 1 || typeof value.questId !== "string" || typeof value.artifactId !== "string") return null;
    return { version: 1, questId: value.questId, artifactId: value.artifactId };
  } catch { return null; }
}

export function workshopDisplayModel(snapshot, selection) {
  const artifacts = allArtifacts(snapshot.progressions, snapshot.quests).filter(item => ["code", "validation", "automation"].includes(item.kind));
  const selected = selection ? artifacts.find(item => item.source_quest_id === selection.questId && item.artifact_id === selection.artifactId) : null;
  return {
    locked: snapshot.world.workshop.state === "LOCKED",
    active: (snapshot.world.activity?.workshop?.level ?? 0) > 0,
    artifacts,
    selected: selected ?? null,
    missing: Boolean(selection && !selected)
  };
}

export function createWorkshopDisplay(host, { openArtifact, onDisplayChange = () => {}, storage = null }) {
  const doc = host.ownerDocument;
  const node = (tag, className, text) => {
    const element = doc.createElement(tag);
    element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  let selected = null;
  let namespace = null;
  let persistenceError = false;
  let snapshot = null;
  let source = "live";
  let signature = "";
  let syncPickerSelection = true;
  const title = node("h3", "", "工坊陈列");
  const status = node("p", "display-status");
  status.setAttribute("role", "status");
  const view = node("button", "display-selected", "空展示位");
  view.type = "button";
  const picker = node("select", "display-picker");
  picker.setAttribute("aria-label", "选择工坊陈列成果");
  const save = node("button", "secondary-button", "陈列所选成果");
  save.type = "button";
  const clear = node("button", "text-button", "取消陈列");
  clear.type = "button";
  const help = node("p", "artifact-meta", "陈列真实成果，不改变奖励。选择保存在当前浏览器。");
  const actions = node("div", "display-actions");
  actions.append(save, clear);
  host.append(title, status, view, picker, actions, help);

  function persist(value) {
    try {
      if (!storage || !namespace) throw new Error("storage unavailable");
      if (value) storage.setItem(`${STORAGE_KEY}:${namespace}`, JSON.stringify(value));
      else storage.removeItem(`${STORAGE_KEY}:${namespace}`);
      persistenceError = false;
      return true;
    } catch { persistenceError = true; return false; }
  }

  function render() {
    if (!snapshot) return;
    const model = workshopDisplayModel(snapshot, source === "live" ? selected : null);
    host.dataset.activity = model.active ? "active" : "idle";
    const nextSignature = JSON.stringify(model.artifacts.map(item => [artifactKey(item), item.name]));
    if (signature !== nextSignature) {
      const previous = picker.value;
      picker.replaceChildren(...model.artifacts.map(item => {
        const option = node("option", "", `${item.name ?? item.artifact_id} · ${item.source_quest_id}`);
        option.value = artifactKey(item);
        return option;
      }));
      if ([...picker.options].some(option => option.value === previous)) picker.value = previous;
      signature = nextSignature;
    }
    if (syncPickerSelection) {
      if (model.selected) picker.value = artifactKey(model.selected);
      syncPickerSelection = false;
    }
    picker.disabled = model.locked || source !== "live" || !model.artifacts.length;
    save.disabled = picker.disabled;
    clear.disabled = source !== "live" || !selected;
    view.disabled = model.locked || !model.selected;
    view.textContent = model.selected?.name ?? (model.missing ? "原成果引用暂不可用" : "空展示位");
    view.dataset.displayState = model.selected && !model.locked ? "occupied" : "empty";
    if (model.selected && !model.locked) view.dataset.artifactKind = model.selected.kind;
    else delete view.dataset.artifactKind;
    status.textContent = source === "loading" ? "正在切换世界，陈列操作暂不可用" : source !== "live" ? "演示模式不修改本地陈列" : model.locked ? "工坊尚未解锁" : model.missing ? "未找到原成果，可重新选择或取消陈列" : model.selected ? "已陈列 · 点击查看成果" : model.artifacts.length ? "从已有成果中选择一项陈列" : "尚无可陈列的代码、验证或自动化成果";
    if (source === "live" && persistenceError) status.textContent += " · 保存失败，当前选择仅在本次页面有效";
    onDisplayChange({
      artifact: source === "live" && !model.locked ? model.selected : null,
      locked: model.locked,
      active: model.active,
      source,
      missing: model.missing
    });
  }

  save.addEventListener("click", () => {
    if (!snapshot || source !== "live") return;
    const model = workshopDisplayModel(snapshot, selected);
    if (model.locked) return;
    const artifact = model.artifacts.find(item => artifactKey(item) === picker.value);
    if (!artifact) return;
    selected = { version: 1, questId: artifact.source_quest_id, artifactId: artifact.artifact_id };
    const saved = persist(selected);
    render();
    status.textContent = saved ? "陈列已保存" : "已陈列，但无法保存；刷新后可能丢失";
  });
  clear.addEventListener("click", () => {
    if (source !== "live") return;
    selected = null;
    const saved = persist(null);
    render();
    status.textContent = saved ? "已取消陈列，真实成果仍然保留" : "已取消，但无法保存此变更";
    if (!save.disabled) save.focus({ preventScroll: true });
  });
  view.addEventListener("click", () => {
    if (!snapshot) return;
    const model = workshopDisplayModel(snapshot, selected);
    if (!model.locked && model.selected && source === "live") openArtifact(artifactKey(model.selected));
  });
  function receiveStorage(event) {
    if (!namespace || (event.key !== null && event.key !== `${STORAGE_KEY}:${namespace}`)) return;
    selected = readDisplaySelection(storage, namespace);
    syncPickerSelection = true;
    persistenceError = false;
    if (source === "live") render();
  }
  doc.defaultView.addEventListener("storage", receiveStorage);
  return {
    destroy() { doc.defaultView.removeEventListener("storage", receiveStorage); host.replaceChildren(); },
    update(nextSnapshot, nextSource) {
      snapshot = nextSnapshot;
      source = nextSource;
      if (source === "live") {
        const nextNamespace = typeof snapshot.display_namespace === "string" ? snapshot.display_namespace : null;
        if (namespace !== nextNamespace) {
          namespace = nextNamespace;
          selected = readDisplaySelection(storage, namespace);
          syncPickerSelection = true;
          persistenceError = false;
        }
      }
      render();
    }
  };
}
