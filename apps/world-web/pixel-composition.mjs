import { createWorkshopDisplay } from "./workshop-display.mjs";
import { renderCharacterLayers, resolveCharacterClip } from "./scene-assets.mjs";
import { createSceneMotion } from "./scene-motion.mjs";
import { createSceneObjects } from "./scene-objects.mjs";
import { createAssetPreview } from "./asset-preview.mjs";
import { loadCharacterSelection, saveCharacterSelection } from "./character-preferences.mjs";
import { artifactKey } from "./view-state.mjs";

export function createPixelComposition(document, { openArtifact }) {
  const window = document.defaultView;
  let snapshot = null;
  let source = "live";
  let disposed = false;
  const board = document.querySelector(".quest-board");
  const boardActions = board?.querySelector(".board-actions");
  if (boardActions) board.append(boardActions);
  const displayDialog = document.createElement("dialog");
  displayDialog.className = "display-drawer";
  displayDialog.setAttribute("aria-labelledby", "display-drawer-title");
  const drawerHeader = document.createElement("header");
  drawerHeader.className = "display-drawer-header";
  const drawerTitle = document.createElement("h2");
  drawerTitle.id = "display-drawer-title";
  drawerTitle.textContent = "陈列与外观";
  const closeDrawer = document.createElement("button");
  closeDrawer.type = "button";
  closeDrawer.className = "close-button";
  closeDrawer.textContent = "×";
  closeDrawer.setAttribute("aria-label", "关闭陈列与外观");
  closeDrawer.addEventListener("click", () => displayDialog.close());
  drawerHeader.append(drawerTitle, closeDrawer);
  displayDialog.append(drawerHeader);
  displayDialog.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const controls = [...displayDialog.querySelectorAll("button:not(:disabled), select:not(:disabled), input:not(:disabled), summary, a[href], [tabindex='0']")]
      .filter(control => control.getClientRects().length && !control.closest("[inert]"));
    const first = controls[0] ?? closeDrawer;
    const last = controls.at(-1) ?? closeDrawer;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
  document.body.append(displayDialog);
  function showDisplayDrawer() {
    if (!displayDialog.open) displayDialog.showModal();
  }
  const drawerTrigger = document.createElement("button");
  drawerTrigger.className = "text-button";
  drawerTrigger.type = "button";
  drawerTrigger.textContent = "陈列与外观";
  drawerTrigger.setAttribute("aria-haspopup", "dialog");
  drawerTrigger.addEventListener("click", showDisplayDrawer);
  document.querySelector(".scene-view-actions").prepend(drawerTrigger);
  let fitScene = true;
  const fitToggle = document.getElementById("scene-fit-toggle");
  function resizeScene() {
    const width = document.documentElement.clientWidth;
    const scale = fitScene ? Math.min(1, width / 1180) : 1;
    document.body.style.setProperty("--guild-scale", String(scale));
    document.body.classList.toggle("guild-fit", fitScene);
    if (fitToggle) {
      fitToggle.textContent = fitScene ? "原尺寸查看" : "适应窗口";
      fitToggle.setAttribute("aria-pressed", String(fitScene));
      fitToggle.hidden = width >= 1180;
    }
  }
  function toggleSceneFit() { fitScene = !fitScene; resizeScene(); }
  fitToggle?.addEventListener("click", toggleSceneFit);
  window.addEventListener("resize", resizeScene);
  resizeScene();
  let displayStorage = null;
  try { displayStorage = window.localStorage; } catch {}
  let characterSelection = loadCharacterSelection(displayStorage);
  const displayHost = document.createElement("section");
  displayHost.className = "workshop-display game-frame";
  displayHost.setAttribute("aria-label", "工坊成果陈列");
  displayDialog.append(displayHost);
  const assetPreview = document.createElement("details");
  assetPreview.className = "asset-preview game-frame";
  const assetSummary = document.createElement("summary");
  assetSummary.textContent = "查看资产与外观组合";
  assetPreview.append(assetSummary);
  const assetPreviewContent = document.createElement("div");
  assetPreviewContent.className = "asset-preview-content";
  assetPreview.append(assetPreviewContent);
  displayDialog.append(assetPreview);
  let assetPreviewMounted = false;
  assetPreview.addEventListener("toggle", () => {
    if (assetPreview.open && !assetPreviewMounted) {
      createAssetPreview(assetPreviewContent, { initialSelection: characterSelection, onApply: selection => {
        const result = saveCharacterSelection(displayStorage, selection);
        characterSelection = result.selection;
        sceneMotion.remove("archivist");
        renderCharacterLayers(character, characterSelection);
        if (snapshot) update(snapshot, source);
        return result;
      } });
      assetPreviewMounted = true;
    }
  });
  let displayedArtifactKey = null;
  const workshopDisplay = createWorkshopDisplay(displayHost, {
    storage: displayStorage,
    openArtifact: key => {
      displayDialog.close();
      openArtifact(key);
    },
    onDisplayChange: ({ artifact, locked, missing, source }) => {
      displayedArtifactKey = artifact ? artifactKey(artifact) : null;
      const displayObject = sceneObjects.upsert({
        id: "workshop-artifact", x: 85, y: 82, layer: 3,
        label: artifact?.name ?? (locked ? "陈列位未解锁" : missing ? "陈列成果暂不可用" : "选择陈列成果"),
        description: artifact ? "查看这份真实成果" : "打开工坊陈列设置",
        disabled: locked || source !== "live"
      });
      displayObject.dataset.displayState = artifact ? "occupied" : locked ? "locked" : missing ? "missing" : "empty";
      if (artifact) displayObject.dataset.artifactKind = artifact.kind;
      else delete displayObject.dataset.artifactKind;
    }
  });
  const character = document.querySelector(".archivist");
  renderCharacterLayers(character, characterSelection);
  const sceneMotion = createSceneMotion(document.querySelector("#world-scene"));
  const sceneObjects = createSceneObjects(document.querySelector("#world-scene"), id => {
    if (id === "workshop-artifact" && displayedArtifactKey) {
      openArtifact(displayedArtifactKey);
      return;
    }
    if (id === "workshop-display" || id === "workshop-artifact" || id === "workshop-desk") {
      showDisplayDrawer();
    }
  });
  sceneObjects.upsert({ id: "workshop-display", label: "管理工坊陈列", description: "选择、更换或取消真实成果展示", x: 85, y: 91, layer: 3 });
  sceneObjects.upsert({ id: "workshop-desk", assetId: "workshop.desk", label: "工坊工作台", description: "打开工坊陈列设置", x: 83, y: 81, layer: 2 });

  function update(next, nextSource) {
    if (disposed) return;
    snapshot = next;
    source = nextSource;
    workshopDisplay.update(snapshot, source);
    const action = snapshot.world.active_run_ids.length ? "working" : "idle";
    character.dataset.activity = action === "working" ? "active" : "idle";
    sceneMotion.setState("archivist", character, action, resolveCharacterClip(characterSelection, action));
  }
  function destroy() {
    if (disposed) return;
    disposed = true;
    sceneMotion.destroy();
    sceneObjects.destroy();
    workshopDisplay.destroy();
    window.removeEventListener("resize", resizeScene);
    fitToggle?.removeEventListener("click", toggleSceneFit);
    displayHost.remove();
    assetPreview.remove();
    if (displayDialog.open) displayDialog.close();
    displayDialog.remove();
    drawerTrigger.remove();
    window.removeEventListener("pagehide", onPageHide);
  }
  function onPageHide(event) { if (!event.persisted) destroy(); }
  window.addEventListener("pagehide", onPageHide);
  return {
    update,
    suspend() {
      if (!disposed && snapshot) {
        source = "loading";
        workshopDisplay.update(snapshot, source);
      }
    },
    destroy
  };
}
