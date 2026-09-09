const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const reasons = {
  STREAM_INCOMPLETE: "缺少完整结束信号，任务结果待确认",
  STREAM_INVALID: "输入记录无效或顺序不符合采集协议，未推断任务结果",
  COLLECTOR_STOPPED: "本地采集已停止，不代表真实任务取消",
  PROCESS_UNAVAILABLE: "未能可靠读取执行进程结果",
  CAPTURE_FAILED: "采集或存储失败，需检查本地采集进程"
};

export function captureLabel(snapshot) {
  const sessions = snapshot.observability?.sessions;
  if (!sessions) return "世界可读取 · 采集状态未知";
  const live = sessions.filter(session => session.status === "observing");
  if (live.length) return `采集进程在线 · ${live.length}`;
  if (sessions.some(session => session.status === "unknown")) return "采集心跳过期 · 待确认";
  return "世界可读取 · 无活动采集";
}

export function renderCaptureStatus(snapshot) {
  const sessions = snapshot.observability?.sessions;
  if (!sessions) return '<div class="detail-card"><h3>真实工作采集</h3><p>此快照未提供采集健康信息，不能据此判断 AI 是否在线。</p></div>';
  const labels = { observing: "采集进程在线", unknown: "心跳过期，连接未知", interrupted: "采集中断，结果待确认", error: "采集异常", ended: "采集已结束" };
  return `<section class="detail-card"><h3>真实工作采集</h3><p>${escape(captureLabel(snapshot))}</p>
    <p>心跳只代表采集进程在线；世界活跃度与历史任务不代表实时连接。当前支持显式接入的一次 CLI 执行，不是桌面全部会话自动监控。</p>
    ${sessions.length ? sessions.slice(0, 8).map(session => {
      const quest = snapshot.quests.find(item => item.run_ids.includes(session.last_run_id));
      const age = session.last_event_at ? Date.now() - Date.parse(session.last_event_at) : Infinity;
      const activity = session.status === "observing" ? age > 15000 ? "暂未收到新事件，不推断任务停止" : "近期收到运行事件" : "";
      return `<article class="insight-card"><h4>${escape(session.connection_id)}</h4><p>${escape(labels[session.status] ?? "状态未知")} · ${escape(session.adapter_id)}</p>
        <p>${escape(activity)}</p><p>最后接收：${escape(session.last_event_at ?? "尚未收到事件")}</p>
        <p>最近心跳：${escape(session.heartbeat_at)}</p><p>运行：${escape(session.last_run_id ?? "尚未识别")}</p>
        ${session.error_code ? `<p>${escape(reasons[session.error_code] ?? "采集状态需要确认")}</p>` : ""}
        <p>子代理观测：${session.capabilities?.observe?.subagents ? "支持" : "当前来源不支持"}；成果引用：${session.capabilities?.observe?.artifacts ? "已开启" : "未开启"}</p>
        ${quest ? `<button class="secondary-button" type="button" data-quest-id="${escape(quest.quest_id)}">查看对应任务</button>` : ""}</article>`;
    }).join("") : "<p>还没有采集会话。打开世界页面本身不会开始监控 AI。</p>"}
    <p>采集中断后，如已保留原始 JSONL，可使用同一个运行编号完整重放；新执行使用新编号，延续目标需显式提供关联。尚不支持从任意半段日志自动续传。</p>
    <p class="artifact-meta">显示最近 ${Math.min(sessions.length, 8)} 条采集记录。原始日志可能含敏感内容，请自行妥善保管。</p></section>`;
}
