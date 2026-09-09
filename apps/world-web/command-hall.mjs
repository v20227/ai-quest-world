import { getCommandHallFixture, normalizeCommandHallSnapshot } from "./command-hall-fixtures.mjs";

const state = {
  mode: "canonical",
  theme: "midnight",
  motion: "full",
  selectedRun: "root-run",
  selectedLocation: "gate"
};

const hall = document.querySelector(".command-hall");
const toast = document.querySelector("#hall-toast");

function icon(name) {
  const icons = {
    gate: "✦",
    runs: "⌘",
    evidence: "◎",
    domain: "⌁",
    artifact: "◇",
    book: "▤",
    eye: "◉",
    code: "</>",
    check: "✓",
    flag: "⚑",
    plan: "＋",
    bug: "⊘",
    gear: "⚙",
    signal: "⌁"
  };
  return icons[name] ?? "✦";
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value ?? "";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function renderTopStats(viewModel) {
  document.querySelector("#top-stats").innerHTML = viewModel.topStats.map((stat) => `
    <div class="top-stat top-stat-${stat.tone}">
      <span class="top-stat-icon">${icon(stat.icon)}</span>
      <span class="top-stat-copy"><small>${stat.label}</small><strong>${stat.value}</strong><em>${stat.detail}</em></span>
    </div>
  `).join("");
}

function renderRoster(viewModel) {
  const roster = viewModel.roster;
  setText("#roster-count", `${roster.length} / 4`);
  const container = document.querySelector("#roster-list");
  if (roster.length === 0) {
    container.innerHTML = `
      <div class="empty-roster">
        <span class="empty-glyph">◌</span>
        <strong>Quiet camp</strong>
        <p>没有活动运行。下一次真实工作会从 AI Gate 进入。</p>
      </div>
    `;
    return;
  }
  container.innerHTML = roster.map((run) => `
    <button class="run-card ${run.id === state.selectedRun ? "is-selected" : ""} run-card-${run.accent}" type="button" data-run-id="${run.id}">
      <span class="run-avatar" style="--avatar-position: ${run.avatarPosition}" aria-hidden="true"></span>
      <span class="run-card-copy">
        <span class="run-card-title"><strong>${run.name}</strong><small>${run.label}</small></span>
        <span class="run-card-status"><i></i>${run.statusLabel}<em>${run.level}</em></span>
        <span class="run-card-detail">${run.detail}</span>
      </span>
      <span class="run-card-chevron">›</span>
    </button>
  `).join("");
  container.querySelectorAll("[data-run-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedRun = button.dataset.runId;
      render();
      showToast(`已选中 ${roster.find((run) => run.id === state.selectedRun)?.name ?? "运行"}`);
    });
  });
}

function renderExpedition(viewModel) {
  const expedition = viewModel.expedition;
  const selectedRun = viewModel.roster.find((run) => run.id === state.selectedRun);
  setText("#expedition-eyebrow", expedition.eyebrow);
  setText("#expedition-domain", expedition.domain.toUpperCase());
  setText("#expedition-title", selectedRun?.id === "child-validation" ? "Verify the trusted boundary" : expedition.title);
  setText("#expedition-title-zh", selectedRun?.id === "child-validation" ? "验证可信边界" : expedition.titleZh);
  setText("#expedition-summary", selectedRun?.summary ?? expedition.summary);
  setText("#expedition-status", expedition.statusLabel.toUpperCase());
  setText("#expedition-progress-label", expedition.progressLabel);
  setText("#expedition-progress-value", `${expedition.progress}%`);
  setText("#evidence-count", expedition.evidence.filter((item) => item.state === "verified").length + " refs");
  document.querySelector("#expedition-status").dataset.state = expedition.status;
  document.querySelector("#expedition-progress").style.width = `${expedition.progress}%`;

  document.querySelector("#expedition-stats").innerHTML = [
    ["Difficulty", "★".repeat(expedition.difficulty) + "☆".repeat(5 - expedition.difficulty), expedition.difficultyLabel],
    ["Evidence", expedition.evidenceLabel, "factual refs only"],
    ["Source", expedition.sourceLabel, "no control path"]
  ].map(([label, value, detail]) => `
    <div class="expedition-stat"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>
  `).join("");

  document.querySelector("#reward-row").innerHTML = expedition.rewards.map((reward) => `
    <div class="reward-item reward-${reward.tone}"><span>${reward.value}</span><small>${reward.label}</small></div>
  `).join("");

  document.querySelector("#expedition-flow").innerHTML = expedition.flow.map((step, index) => `
    <div class="flow-step flow-${step.state}">
      <span class="flow-icon">${icon(step.icon)}</span>
      <span class="flow-copy"><strong>${step.label}</strong><small>${step.detail}</small></span>
      ${index < expedition.flow.length - 1 ? "<span class=\"flow-connector\">›</span>" : ""}
    </div>
  `).join("");

  document.querySelector("#evidence-list").innerHTML = expedition.evidence.map((item) => `
    <div class="evidence-item evidence-${item.state}"><span>${item.state === "verified" ? "✓" : "·"}</span><strong>${item.label}</strong><small>${item.detail}</small></div>
  `).join("");
}

function renderDomains(viewModel) {
  document.querySelector("#domain-grid").innerHTML = viewModel.domains.map((domain) => `
    <div class="domain-card domain-${domain.tone}">
      <span class="domain-icon">${icon(domain.icon)}</span>
      <span class="domain-copy"><strong>${domain.label}</strong><small>${domain.labelZh} · ${domain.level}</small></span>
      <span class="domain-meter"><i style="width: ${domain.value}%"></i></span>
      <span class="domain-value">${domain.value}</span>
    </div>
  `).join("");
}

function renderCollection(viewModel) {
  document.querySelector("#collection-grid").innerHTML = viewModel.collection.map((item) => `
    <article class="collection-card">
      <div class="collection-art" style="--asset-image: url('${item.image}'); --asset-position: ${item.position}" role="img" aria-label="${item.labelZh} ${item.label}"></div>
      <div class="collection-copy"><strong>${item.labelZh}</strong><small>${item.category} · ${item.state}</small></div>
    </article>
  `).join("");
}

function renderAtlas(viewModel) {
  const locations = viewModel.atlas;
  const activeLocation = locations.find((location) => location.key === state.selectedLocation) ?? locations[0];
  if (activeLocation) {
    setText("#atlas-coordinates", activeLocation.coordinates);
    setText("#atlas-state", activeLocation.level);
    setText("#atlas-location-title", `${activeLocation.label} / ${activeLocation.labelZh}`);
    setText("#atlas-location-detail", activeLocation.detail);
    document.querySelector("#atlas-state").dataset.state = activeLocation.state;
  }
  document.querySelector("#atlas-map").innerHTML = locations.map((location, index) => `
    <button class="atlas-node atlas-node-${location.tone} ${location.key === activeLocation?.key ? "is-active" : ""} atlas-${location.state}" type="button" data-location-key="${location.key}">
      <span class="atlas-node-index">0${index + 1}</span>
      <span class="atlas-node-icon">${location.key === "camp" ? "⌂" : location.key === "gate" ? "✦" : location.key === "guild" ? "♜" : location.key === "workshop" ? "⚒" : "▤"}</span>
      <span class="atlas-node-copy"><strong>${location.label}</strong><small>${location.labelZh}</small></span>
      <span class="atlas-node-state">${location.level}</span>
    </button>
    ${index < locations.length - 1 ? "<span class=\"atlas-path\" aria-hidden=\"true\"></span>" : ""}
  `).join("");
  document.querySelectorAll("[data-location-key]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedLocation = button.dataset.locationKey;
      render();
      showToast(`地图焦点：${locations.find((location) => location.key === state.selectedLocation)?.label ?? "World Atlas"}`);
    });
  });
}

function render() {
  const viewModel = normalizeCommandHallSnapshot(getCommandHallFixture(state.mode));
  hall.dataset.theme = state.theme;
  hall.dataset.motion = state.motion;
  setText("#hall-eyebrow", viewModel.page.eyebrow);
  setText("#hall-title", viewModel.page.title);
  setText("#hall-subtitle", viewModel.page.subtitle);
  setText("#provider-label", viewModel.page.providerLabel);
  setText("#provider-description", viewModel.page.providerDescription);
  document.querySelector("#fixture-mode").value = state.mode;
  renderTopStats(viewModel);
  renderRoster(viewModel);
  renderExpedition(viewModel);
  renderDomains(viewModel);
  renderCollection(viewModel);
  renderAtlas(viewModel);
}

document.querySelector("#fixture-mode").addEventListener("change", (event) => {
  state.mode = event.target.value;
  state.selectedRun = state.mode === "idle" ? "" : "root-run";
  render();
  showToast(getCommandHallFixture(state.mode).demoState.description);
});

document.querySelector('[data-action="theme"]').addEventListener("click", () => {
  state.theme = state.theme === "midnight" ? "dawn" : "midnight";
  render();
  showToast(state.theme === "dawn" ? "已切换到 Dawn 色调" : "已切换到 Midnight 色调");
});

document.querySelector('[data-action="motion"]').addEventListener("click", () => {
  state.motion = state.motion === "full" ? "reduced" : "full";
  render();
  showToast(state.motion === "reduced" ? "动效已收敛" : "动效已开启");
});

document.querySelectorAll("[data-focus]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-focus]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.focus}`)?.scrollIntoView({ behavior: state.motion === "reduced" ? "auto" : "smooth", block: "start" });
  });
});

render();
