import { EconomyError } from "../../packages/game-contracts/economy.mjs";

export async function handleEconomyRequest(request, response, runtime, url) {
  const send = (status, value) => {
    response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify(value));
  };
  if (!runtime) return send(503, { error: "世界暂不可用。" });
  try {
    if (url.pathname === "/api/economy/history" && request.method === "GET") {
      const before = url.searchParams.has("before") ? Number(url.searchParams.get("before")) : undefined;
      return send(200, runtime.getEconomyHistory({ before }));
    }
    if (url.pathname !== "/api/economy/command" || request.method !== "POST") return send(405, { error: "不支持此请求。" });
    if (request.headers.origin !== `http://${request.headers.host}` || request.headers["x-world-namespace"] !== runtime.getDisplayNamespace()) {
      return send(403, { error: "仅允许当前本地世界操作。" });
    }
    if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") return send(415, { error: "请求须为 JSON。" });
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 2048) return send(413, { error: "请求过大。" });
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return send(200, runtime.executeEconomyCommand(input));
  } catch (error) {
    if (error instanceof EconomyError) return send(error.code === "INVALID_COMMAND" ? 400 : 409, { error: error.message, code: error.code });
    if (error instanceof SyntaxError) return send(400, { error: "请求格式无效。" });
    throw error;
  }
}
