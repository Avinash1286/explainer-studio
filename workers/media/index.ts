import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { renderFixture, renderProject } from "./render";

const origin = process.env.CONVEX_SITE_URL;
const token = process.env.WORKER_AUTH_TOKEN;
if (!origin || !token || token.length < 32) throw new Error("Set CONVEX_SITE_URL and WORKER_AUTH_TOKEN (32+ characters)");
const url = new URL(origin);
if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("HTTPS required");
const workerId = process.env.WORKER_ID || "mediaworker";
const instanceId = randomUUID();
const worker = `${workerId}-${instanceId}`;
let lastHeartbeat = 0;
let stopping = false;
let inFlight = false;
let active: AbortController | undefined;

async function api<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(new URL("/api/worker/media", url), { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Media API ${response.status}`);
  return response.json() as Promise<T>;
}
async function heartbeat() {
  try {
    const response = await fetch(new URL("/api/worker/heartbeat", url), { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ workerId, instanceId, version: "0.7.1", capabilities: ["kokoro", "remotion", "fixture-v1", "generated-v1", "review-frames-v1", "explicit-connections-v1", "text-cards-v1", "directed-visuals-v1"] }), signal: AbortSignal.timeout(10_000) });
    if (response.ok) lastHeartbeat = Date.now();
  } catch { console.error(JSON.stringify({ event: "heartbeat_failed" })); }
}
async function poll() {
  if (stopping || inFlight) return;
  inFlight = true;
  let renewTimer: ReturnType<typeof setInterval> | undefined;
  let directory: string | undefined;
  let attemptLease: { taskId: string; attempt: number; worker: string } | undefined;
  try {
    const task = await api<{ taskId: string; attempt: number; fixtureVersion: string; projectJson?: string; provenanceJson?: string } | null>({ op: "claim", worker, protocol: 6 });
    if (!task) return;
    const lease = { taskId: task.taskId, attempt: task.attempt, worker };
    attemptLease = lease;
    if (!["plant-energy-v1", "generated-v1"].includes(task.fixtureVersion)) throw new Error("Unsupported project version");
    const controller = new AbortController();
    active = controller;
    let message = "Preparing the media runtime";
    let renewing = false;
    const renew = async () => {
      if (renewing) return;
      renewing = true;
      try { await api({ op: "renew", ...lease, message }); }
      catch { controller.abort(); }
      finally { renewing = false; }
    };
    renewTimer = setInterval(() => void renew(), 15_000);
    const root = path.resolve("runs");
    directory = path.join(root, `${task.taskId}-${task.attempt}`);
    if (!directory.startsWith(root + path.sep)) throw new Error("Invalid task path");
    const stage = async (next: string) => { message = next; await renew(); controller.signal.throwIfAborted(); };
    const rendered = task.fixtureVersion === "generated-v1"
      ? await renderProject(JSON.parse(task.projectJson || "null"), directory, stage, controller.signal, JSON.parse(task.provenanceJson || "null"))
      : await renderFixture(directory, stage, controller.signal);
    message = "Uploading the video, captions, and project";
    await renew();
    const files = { video: ["video.mp4", "video/mp4"], project: ["project.json", "application/json"], captions: ["captions.vtt", "text/vtt"], poster: ["poster.png", "image/png"] } as const;
    const result: Record<string, unknown> = { durationSeconds: rendered.benchmark.durationSeconds };
    for (const [kind, [name, contentType]] of Object.entries(files)) {
      controller.signal.throwIfAborted();
      const uploadUrl = await api<string>({ op: "uploadUrl", ...lease });
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": contentType }, body: await readFile(path.join(directory, name)), signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Upload ${response.status}`);
      const { storageId } = await response.json() as { storageId: string };
      await api({ op: "registerUpload", ...lease, storageId });
      result[kind] = storageId;
    }
    if (rendered.frames.length) {
      const frames = [];
      for (const [index, sample] of rendered.frames.entries()) {
        controller.signal.throwIfAborted();
        const uploadUrl = await api<string>({ op: "uploadUrl", ...lease });
        const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: await readFile(path.join(directory, `review-${index}.jpg`)), signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`Frame upload ${response.status}`);
        const { storageId } = await response.json() as { storageId: string };
        await api({ op: "registerUpload", ...lease, storageId });
        frames.push({ ...sample, storageId });
      }
      result.frames = frames;
    }
    try { await api({ op: "complete", ...lease, result }); }
    catch { await api({ op: "complete", ...lease, result }); }
    console.log(JSON.stringify({ event: "render_completed", taskId: task.taskId, attempt: task.attempt, ...rendered.benchmark }));
  } catch (error) {
    console.error(JSON.stringify({ event: "render_attempt_failed", message: (error as Error).message }));
    if (attemptLease) { try { await api({ op: "abandon", ...attemptLease }); } catch { /* Lease expiry recovers an unreachable backend. */ } }
  }
  finally {
    if (renewTimer) clearInterval(renewTimer);
    active = undefined;
    if (directory && process.env.KEEP_RUNS !== "1") {
      const root = path.resolve("runs") + path.sep;
      if (path.resolve(directory).startsWith(root)) await rm(directory, { recursive: true, force: true });
    }
    inFlight = false;
  }
}
const server = createServer((request, response) => {
  if (request.url !== "/health") { response.writeHead(404); response.end(); return; }
  const ready = !stopping && lastHeartbeat > Date.now()-45_000;
  response.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ ready, phase: "review-and-delivery", capabilities: ["kokoro", "remotion", "fixture-v1", "generated-v1", "review-frames-v1", "explicit-connections-v1", "text-cards-v1", "directed-visuals-v1"], busy: inFlight }));
});
await heartbeat();
server.listen(Number(process.env.PORT || 3001), "0.0.0.0");
const heartbeatTimer = setInterval(() => void heartbeat(), 15_000);
const pollTimer = setInterval(() => void poll(), 5_000);
void poll();
function stop() { stopping = true; active?.abort(); clearInterval(heartbeatTimer); clearInterval(pollTimer); server.close(); setTimeout(() => process.exit(0), 5_000).unref(); }
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
