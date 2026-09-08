import { displayLabel } from "./guild-scene.mjs";

const ENCOUNTER_STATES = {
  OPEN: "阻碍待处理", RECOVERING: "已有修改，等待复验", VERIFYING: "验证结果待确认",
  RECHECK_REQUIRED: "通过后又有修改，需重新验证", RESOLVED: "已有匹配证据解除"
};
const VALIDATION_LABELS = { test: "测试", lint: "静态检查", typecheck: "类型检查", build: "构建", review: "审查", custom: "自定义验证" };
const ACTIVITY_LABELS = {
  run_started: "远征开始", exploration_activity: "探索与调查", implementation_activity: "实现与构建",
  validation_started: "开始验证", validation_failure: "验证受阻", recovery_activity: "修复与恢复",
  validation_success: "验证通过", artifact_delivered: "交付成果", run_completed: "任务结束",
  run_failed: "任务失败", run_cancelled: "任务取消"
};
const GOAL_LABELS = {
  gate_connected: "连接信号之门", guild_restored: "修复任务公会", workshop_unlocked: "解锁工坊", library_unlocked: "解锁档案馆",
  first_qualifying_completion: "首次达标完成", first_artifact: "首份真实成果", first_verified_outcome: "首次已验证结果"
};
const REQUIREMENTS = {
  observed_run_started: "观测到一次真实运行开始，即可连接。",
  credible_completion: "完成一项结果为“已验证”或“有证据支持”的任务。",
  first_qualifying_completion: "首次完成结果为“已验证”或“有证据支持”的任务。",
  first_artifact: "一项可信完成的任务带回具有持久化引用的成果，并被计入结算。",
  first_verified_outcome: "首次结算一个具有成功验证证据的“已验证”结果。"
};

export function renderExpedition(quest) {
  const expedition = quest.expedition;
  if (!expedition) return card("远征记录", '<p class="artifact-meta">当前记录暂未提供远征过程。</p>');
  const steps = expedition.steps.map(step => `<li><strong>${escapeHtml(ACTIVITY_LABELS[step.kind] ?? displayLabel(step.phase))}</strong><p class="artifact-meta">${escapeHtml(displayLabel(step.phase))} · ${time(step.first_at)}${step.observation_count > 1 ? ` · 连续 ${step.observation_count} 条观测，至 ${time(step.last_at)}` : ""}</p></li>`).join("");
  const encounters = expedition.encounters.map(encounter => {
    const measurement = encounter.measurement;
    const facts = measurement ? [
      measurement.passed === null ? null : `通过 ${measurement.passed}`,
      measurement.failed === null ? null : `失败 ${measurement.failed}`,
      measurement.total === null ? null : `共 ${measurement.total} 项`,
      measurement.blockers === null ? null : `阻碍 ${measurement.blockers} 项`
    ].filter(Boolean).join(" · ") : "";
    return `<div class="evidence-card"><div class="evidence-head"><h4 class="evidence-title">${escapeHtml(encounter.kind === "validation" ? VALIDATION_LABELS[encounter.validation_kind] ?? "验证" : "运行阻碍")}</h4><span class="status-badge">${escapeHtml(ENCOUNTER_STATES[encounter.state])}</span></div>
      <p class="artifact-meta">目标：${escapeHtml(encounter.target ?? "未提供具体目标")} · 已记录 ${encounter.failure_count} 次失败</p>
      <p class="artifact-meta">${escapeHtml(facts || "没有可展示的测量数据；不推算完成比例。")}</p>
      <p class="artifact-meta">${encounter.resolved_at ? `解除于 ${time(encounter.resolved_at)}` : `最近观测 ${time(encounter.updated_at)}`}</p></div>`;
  }).join("");
  return card("远征记录", `<p class="artifact-meta">仅展示实际观测到的阶段；修复和复验可以反复发生。</p>${steps ? `<ol class="expedition-steps">${steps}</ol>` : '<p class="artifact-meta">尚无可展示的工作阶段。</p>'}${expedition.omitted_step_count ? `<p class="artifact-meta">当前展示最近 ${expedition.steps.length} 段；此前还有 ${expedition.omitted_step_count} 段。</p>` : ""}`)
    + card("阻碍与恢复", `<p class="artifact-meta">${expedition.unresolved_count} 项尚未解除。修改代码不等于验证通过。</p>${encounters || '<p class="artifact-meta">尚未观测到验证失败或明确的阻塞错误。</p>'}`);
}

export function renderSettlement(snapshot, questId) {
  const settlement = snapshot.gameplay?.settlements.find(value => value.quest_id === questId);
  if (!settlement || settlement.resolution !== "RESOLVED") return card("结算说明", '<p class="artifact-meta">任务尚未结算。当前活动不会提前计入永久成长。</p>');
  return card("结算说明", `
    <p class="artifact-meta">结算于 ${time(settlement.settled_at)}。后续观测可以更新远征记录，但不会重复发放本次奖励。</p>
    ${line("证据等级", displayLabel(settlement.outcome_confidence))}
    ${line("过程经验", settlement.activity_xp)}${line("结果奖励", settlement.outcome_bonus)}${line("本次总经验", settlement.total_xp)}
    <p class="artifact-meta">下列各项已经应用递减、上限和证据系数 ${settlement.outcome_multiplier}，无需再次相乘。</p>
    ${settlement.contributions.map(value => line(ACTIVITY_LABELS[value.kind] ?? value.kind, `+${value.xp}`)).join("")}
    ${settlement.capped_kinds.length ? `<p class="artifact-meta">已触及活动上限：${escapeHtml(settlement.capped_kinds.map(kind => ACTIVITY_LABELS[kind] ?? kind).join("、"))}。继续重复不会无限累积经验。</p>` : ""}
    <p class="artifact-meta">每项领域单次增长最多 ${settlement.domain_progress_cap}；建筑的永久进度最多 100。</p>
    ${Object.entries(settlement.domain_progress).filter(([, value]) => value > 0).map(([domain, value]) => line(displayLabel(domain), `+${value}`)).join("")}
    ${line("已计入结算的成果", settlement.credited_artifact_ids.length)}
  `);
}

export function renderGoals(snapshot, target) {
  const goals = snapshot.gameplay?.goals.filter(goal => goal.target === target) ?? [];
  if (!goals.length) return "";
  return card(target === "chronicle" ? "下一步里程碑" : "解锁条件", goals.map(goal => `<div class="insight-card"><div class="evidence-head"><h4 class="evidence-title">${escapeHtml(GOAL_LABELS[goal.goal_id] ?? goal.goal_id)}</h4><span class="status-badge">${goal.achieved ? "已达成" : "待达成"}</span></div><p class="artifact-meta">${escapeHtml(goal.requirement === "credible_domain_progress" ? `结算结果为“已验证”或“有证据支持”，且${goal.domains.map(displayLabel).join("、")}中至少一个领域有正向增长。` : REQUIREMENTS[goal.requirement] ?? "条件暂不可用。")}</p></div>`).join(""));
}

function card(title, body) { return `<section class="detail-card"><h3 class="evidence-title">${escapeHtml(title)}</h3>${body}</section>`; }
function line(label, value) { return `<div class="detail-line"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`; }
function time(value) { return value ? escapeHtml(new Date(value).toLocaleString("zh-CN", { hour12: false })) : "时间未知"; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
