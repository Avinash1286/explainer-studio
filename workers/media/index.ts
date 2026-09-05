import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const origin = process.env.CONVEX_SITE_URL;
const token = process.env.WORKER_AUTH_TOKEN;
if (!origin || !token || token.length < 32) throw new Error("Set CONVEX_SITE_URL and a WORKER_AUTH_TOKEN of at least 32 characters.");
const url = new URL(origin);
if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
  throw new Error("CONVEX_SITE_URL must use HTTPS (HTTP is allowed only for local development).");
}
const workerId = process.env.WORKER_ID || "mediaworker-1";
const instanceId = randomUUID();
let lastHeartbeat = 0;
let stopping = false;
let inFlight = false;

async function heartbeat() {
  if (inFlight || stopping) return;
  inFlight = true;
  try {
    const response = await fetch(new URL("/api/worker/heartbeat", url), {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ workerId, instanceId, version: "0.1.0", capabilities: ["heartbeat"] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Heartbeat rejected (${response.status})`);
    lastHeartbeat = Date.now();
  } catch (error) {
    console.error(JSON.stringify({ event: "heartbeat_failed", message: (error as Error).message }));
  } finally { inFlight = false; }
}

await heartbeat();
const interval = setInterval(heartbeat, 15_000);
const server = createServer((request, response) => {
  if (request.url !== "/health") { response.writeHead(404); response.end(); return; }
  const ready = !stopping && lastHeartbeat > Date.now() - 45_000;
  response.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ ready, phase: "foundation", capabilities: ["heartbeat"], renderingReady: false }));
});
server.listen(Number(process.env.PORT || 3001), "0.0.0.0", () => console.log(JSON.stringify({ event: "worker_started", workerId })));

function stop() {
  stopping = true;
  clearInterval(interval);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
