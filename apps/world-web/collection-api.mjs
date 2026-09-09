import { CollectionConflict } from "../../storage/sqlite/collection-store.mjs";

export async function handleCollectionPlacement(request, response, runtime) {
  const send = (status, data) => {
    response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify(data));
  };
  if (!runtime) return send(503, { error: "World unavailable" });
  if (request.headers.origin !== `http://${request.headers.host}` ||
      request.headers["x-world-namespace"] !== runtime.getDisplayNamespace()) return send(403, { error: "Local world required" });
  if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") return send(415, { error: "JSON required" });
  let body = "";
  let size = 0;
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 1024) { send(413, { error: "Request too large" }); return; }
      body += chunk.toString("utf8");
    }
    const value = JSON.parse(body);
    if (!value || Array.isArray(value) || typeof value !== "object" ||
        Object.keys(value).some(key => !["item_id", "revision"].includes(key))) throw new TypeError("Invalid placement");
    send(200, runtime.placeCollectible(value));
  } catch (error) {
    if (error instanceof CollectionConflict) return send(409, { error: "Refresh collection before retrying" });
    if (error instanceof SyntaxError || error instanceof TypeError) return send(400, { error: "Invalid placement" });
    throw error;
  }
}
