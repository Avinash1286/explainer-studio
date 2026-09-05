import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/health", method: "GET",
  handler: httpAction(async () => Response.json({ ok: true, service: "explainer-studio", phase: "foundation", generationEnabled: false })),
});

http.route({
  path: "/worker/heartbeat", method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = env.WORKER_AUTH_TOKEN;
    if (!token || token.length < 32) return new Response("Worker authentication is not configured", { status: 503 });
    if (request.headers.get("Authorization") !== `Bearer ${token}`) return new Response("Unauthorized", { status: 401 });
    const raw = await request.text();
    if (raw.length > 4096) return new Response("Payload too large", { status: 413 });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
    if (!body || typeof body !== "object") return new Response("Invalid heartbeat", { status: 400 });
    const data = body as Record<string, unknown>;
    if (typeof data.workerId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(data.workerId)
      || typeof data.instanceId !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(data.instanceId)
      || typeof data.version !== "string" || data.version.length > 30
      || !Array.isArray(data.capabilities) || data.capabilities.length > 5
      || !data.capabilities.every((cap) => typeof cap === "string" && cap.length < 40)) {
      return new Response("Invalid heartbeat", { status: 400 });
    }
    await ctx.runMutation(internal.workers.heartbeat, {
      workerId: data.workerId, instanceId: data.instanceId, version: data.version,
      capabilities: data.capabilities as string[],
    });
    return Response.json({ accepted: true });
  }),
});

export default http;
