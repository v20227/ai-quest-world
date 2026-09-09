const ASSET_ROOT = "/assets/pixel/reward-concepts";

const canonicalFixture = {
  page: {
    title: "AI Quest World",
    eyebrow: "LOCAL COMMAND HALL",
    subtitle: "把真实工作变成一座可以回来的世界。",
    providerLabel: "LOCAL FIXTURE",
    providerDescription: "前端演示数据 · 后端接口尚未接入"
  },
  demoState: {
    key: "canonical",
    label: "Verified loop",
    description: "完整证据链，展示一次可信的任务返回。"
  },
  topStats: [
    { label: "Gate state", value: "Returning", detail: "AI Gate", tone: "cyan", icon: "gate" },
    { label: "Active runs", value: "02", detail: "1 root · 1 child", tone: "violet", icon: "runs" },
    { label: "Evidence refs", value: "05", detail: "metadata-first", tone: "amber", icon: "evidence" },
    { label: "Domain signal", value: "+18", detail: "Engineering", tone: "blue", icon: "domain" },
    { label: "Artifacts", value: "02", detail: "factual refs", tone: "green", icon: "artifact" }
  ],
  roster: [
    {
      id: "root-run",
      kind: "root",
      name: "Root run",
      label: "主运行",
      status: "returning",
      statusLabel: "Returning",
      detail: "正在整理可信返回",
      level: "RUN 02",
      avatarPosition: "0% 0%",
      accent: "cyan",
      summary: "工程适配器 · 5 个事实引用"
    },
    {
      id: "child-validation",
      kind: "child",
      name: "Validation pass",
      label: "子运行",
      status: "verified",
      statusLabel: "Verified",
      detail: "验证边界已通过",
      level: "CHILD 01",
      avatarPosition: "33% 0%",
      accent: "violet",
      parentId: "root-run",
      summary: "契约检查 · 与主运行共享一次结算"
    },
    {
      id: "artifact-index",
      kind: "child",
      name: "Artifact index",
      label: "子运行",
      status: "observing",
      statusLabel: "Observing",
      detail: "扫描可引用产物",
      level: "CHILD 02",
      avatarPosition: "66% 0%",
      accent: "amber",
      parentId: "root-run",
      summary: "仅记录真实引用，不创建虚假奖励"
    }
  ],
  expedition: {
    eyebrow: "MAIN EXPEDITION / TRUSTED LOOP",
    title: "Build a resilient event adapter",
    titleZh: "构建可靠的事件适配器",
    summary: "把一次真实 Harness 运行转成可重放、可审查的事实事件。",
    domain: "Engineering",
    status: "returning",
    statusLabel: "Returning",
    progress: 72,
    progressLabel: "3 / 5 phases",
    difficulty: 4,
    difficultyLabel: "Bounded difficulty",
    evidenceLabel: "5 factual references",
    sourceLabel: "Read-only observation",
    rewards: [
      { value: "+12", label: "Skill XP", tone: "cyan" },
      { value: "+18", label: "Domain progress", tone: "violet" },
      { value: "02", label: "Artifact refs", tone: "amber" }
    ],
    flow: [
      { label: "Research", icon: "book", state: "complete", detail: "边界已确认" },
      { label: "Observe", icon: "eye", state: "complete", detail: "事实已收集" },
      { label: "Normalize", icon: "code", state: "active", detail: "UARP v0.1" },
      { label: "Validate", icon: "check", state: "next", detail: "等待确认" },
      { label: "Return", icon: "flag", state: "locked", detail: "回到世界" }
    ],
    evidence: [
      { label: "Adapter contract", detail: "public boundary", state: "verified" },
      { label: "Artifact reference", detail: "real path identity", state: "verified" },
      { label: "Validation marker", detail: "not fabricated", state: "verified" }
    ],
    highlights: [
      "AI Gate 记录了一次可信返回",
      "Quest Guild 已恢复可见",
      "Workshop 等待工程进度继续积累"
    ],
    art: `${ASSET_ROOT}/signal-camp-world-concept.png`
  },
  domains: [
    { key: "research", label: "Research", labelZh: "研究", value: 68, level: "Lv. 03", icon: "book", tone: "cyan" },
    { key: "planning", label: "Planning", labelZh: "规划", value: 46, level: "Lv. 02", icon: "plan", tone: "blue" },
    { key: "engineering", label: "Engineering", labelZh: "工程", value: 84, level: "Lv. 04", icon: "code", tone: "violet" },
    { key: "debugging", label: "Debugging", labelZh: "调试", value: 54, level: "Lv. 03", icon: "bug", tone: "amber" },
    { key: "automation", label: "Automation", labelZh: "自动化", value: 31, level: "Lv. 01", icon: "gear", tone: "green" },
    { key: "communication", label: "Communication", labelZh: "沟通", value: 22, level: "Lv. 01", icon: "signal", tone: "pink" }
  ],
  collection: [
    {
      id: "field-coat",
      category: "apparel",
      label: "Field coat",
      labelZh: "远征外套",
      state: "visual preview",
      image: `${ASSET_ROOT}/apparel-concept-sheet.png`,
      position: "0% 0%"
    },
    {
      id: "memory-crystal",
      category: "equipment",
      label: "Memory crystal",
      labelZh: "记忆晶体",
      state: "visual preview",
      image: `${ASSET_ROOT}/equipment-concept-sheet.png`,
      position: "33% 0%"
    },
    {
      id: "signal-moth",
      category: "companion",
      label: "Signal moth",
      labelZh: "信号蛾",
      state: "visual preview",
      image: `${ASSET_ROOT}/companion-concept-sheet.png`,
      position: "66% 0%"
    },
    {
      id: "focus-tea",
      category: "supply",
      label: "Focus tea",
      labelZh: "专注茶",
      state: "visual preview",
      image: `${ASSET_ROOT}/food-supply-concept-sheet.png`,
      position: "0% 50%"
    }
  ],
  atlas: [
    {
      key: "camp",
      label: "Small Camp",
      labelZh: "小营地",
      level: "BASE",
      state: "active",
      detail: "所有旅程从这里开始。",
      coordinates: "01 / 05",
      tone: "amber"
    },
    {
      key: "gate",
      label: "AI Gate",
      labelZh: "AI 之门",
      level: "RETURNING",
      state: "returning",
      detail: "接收来自 Harness 的事实流。",
      coordinates: "02 / 05",
      tone: "cyan"
    },
    {
      key: "guild",
      label: "Quest Guild",
      labelZh: "任务公会",
      level: "RESTORED",
      state: "unlocked",
      detail: "把运行组织成可追踪的 Quest。",
      coordinates: "03 / 05",
      tone: "violet"
    },
    {
      key: "workshop",
      label: "Workshop",
      labelZh: "工程工坊",
      level: "IN PROGRESS",
      state: "progress",
      detail: "工程、调试与自动化的成长空间。",
      coordinates: "04 / 05",
      tone: "blue"
    },
    {
      key: "library",
      label: "Library",
      labelZh: "研究图书馆",
      level: "LOCKED",
      state: "locked",
      detail: "等待 Research 与 Planning 的真实进度。",
      coordinates: "05 / 05",
      tone: "pink"
    }
  ]
};

export function getCommandHallFixture(mode = "canonical") {
  const snapshot = structuredClone(canonicalFixture);
  if (mode === "unverified") {
    snapshot.demoState = {
      key: "unverified",
      label: "Unverified loop",
      description: "缺少足够验证证据，页面只展示状态，不发放产物。"
    };
    snapshot.topStats = snapshot.topStats.map((stat) => ({ ...stat }));
    snapshot.topStats[0] = { ...snapshot.topStats[0], value: "Paused", detail: "evidence pending", tone: "amber" };
    snapshot.topStats[2] = { ...snapshot.topStats[2], value: "02", detail: "1 pending", tone: "amber" };
    snapshot.topStats[3] = { ...snapshot.topStats[3], value: "+04", detail: "bounded only", tone: "blue" };
    snapshot.topStats[4] = { ...snapshot.topStats[4], value: "00", detail: "no loot fabricated", tone: "pink" };
    snapshot.expedition = {
      ...snapshot.expedition,
      status: "unverified",
      statusLabel: "Unverified",
      progress: 44,
      progressLabel: "2 / 5 phases",
      evidenceLabel: "2 factual references",
      rewards: [
        { value: "+04", label: "Bounded progress", tone: "blue" },
        { value: "00", label: "Artifact loot", tone: "pink" },
        { value: "—", label: "Return pending", tone: "amber" }
      ],
      highlights: [
        "返回被保守标记为 Unverified",
        "未发现可确认的 Artifact loot",
        "已有事实进度仍被保留"
      ],
      flow: snapshot.expedition.flow.map((step, index) => index > 1
        ? { ...step, state: index === 2 ? "active" : "locked" }
        : step),
      evidence: snapshot.expedition.evidence.map((item, index) => index === 2
        ? { ...item, state: "pending", detail: "需要真实验证" }
        : item)
    };
    snapshot.atlas = snapshot.atlas.map((location) => location.key === "guild"
      ? { ...location, level: "PENDING", state: "locked", detail: "可信返回后才会恢复。" }
      : location);
  } else if (mode === "idle") {
    snapshot.demoState = {
      key: "idle",
      label: "Quiet camp",
      description: "没有活动运行，世界保持安静。"
    };
    snapshot.topStats = snapshot.topStats.map((stat) => ({ ...stat }));
    snapshot.topStats[0] = { ...snapshot.topStats[0], value: "Dormant", detail: "AI Gate", tone: "slate" };
    snapshot.topStats[1] = { ...snapshot.topStats[1], value: "00", detail: "no active runs", tone: "slate" };
    snapshot.expedition = {
      ...snapshot.expedition,
      title: "Quiet camp",
      titleZh: "营地待命",
      summary: "等待下一次真实运行从 AI Gate 进入世界。",
      status: "idle",
      statusLabel: "No active expedition",
      progress: 0,
      progressLabel: "awaiting a real run",
      difficulty: 0,
      difficultyLabel: "No active estimate",
      evidenceLabel: "0 factual references",
      sourceLabel: "Waiting for local run",
      rewards: [
        { value: "—", label: "No active quest", tone: "blue" },
        { value: "00", label: "Artifact loot", tone: "pink" },
        { value: "—", label: "No return", tone: "amber" }
      ],
      highlights: [
        "小营地保持活动",
        "下一次真实运行会从 AI Gate 进入",
        "不会因为空闲时间产生奖励"
      ],
      flow: snapshot.expedition.flow.map((step) => ({ ...step, state: "locked" })),
      evidence: snapshot.expedition.evidence.map((item) => ({ ...item, state: "pending", detail: "等待事实输入" }))
    };
    snapshot.roster = [];
    snapshot.atlas = snapshot.atlas.map((location) => location.key === "gate"
      ? { ...location, level: "DORMANT", state: "dormant", detail: "等待下一个根运行。" }
      : location);
  } else if (mode !== "canonical") {
    throw new TypeError("command hall fixture mode must be canonical, unverified, or idle");
  }
  return snapshot;
}

export function normalizeCommandHallSnapshot(snapshot) {
  const roster = Array.isArray(snapshot?.roster) ? snapshot.roster : [];
  const atlas = Array.isArray(snapshot?.atlas) ? snapshot.atlas : [];
  return {
    ...snapshot,
    page: { ...snapshot.page },
    demoState: { ...snapshot.demoState },
    topStats: Array.isArray(snapshot.topStats) ? snapshot.topStats.map((stat) => ({ ...stat })) : [],
    roster: roster.map((run) => ({ ...run })),
    domains: Array.isArray(snapshot.domains) ? snapshot.domains.map((domain) => ({ ...domain })) : [],
    collection: Array.isArray(snapshot.collection) ? snapshot.collection.map((item) => ({ ...item })) : [],
    atlas: atlas.map((location) => ({ ...location })),
    expedition: {
      ...snapshot.expedition,
      rewards: Array.isArray(snapshot.expedition?.rewards) ? snapshot.expedition.rewards.map((reward) => ({ ...reward })) : [],
      flow: Array.isArray(snapshot.expedition?.flow) ? snapshot.expedition.flow.map((step) => ({ ...step })) : [],
      evidence: Array.isArray(snapshot.expedition?.evidence) ? snapshot.expedition.evidence.map((item) => ({ ...item })) : [],
      highlights: Array.isArray(snapshot.expedition?.highlights) ? [...snapshot.expedition.highlights] : []
    }
  };
}

export const commandHallAssetRoot = ASSET_ROOT;
