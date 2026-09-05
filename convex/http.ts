import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { z } from "zod";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

http.route({
  path: "/health", method: "GET",
  handler: httpAction(async (ctx) => Response.json({ ok: true, service: "explainer-studio", phase: "topic-generation", generationEnabled: (await ctx.runQuery(internal.serviceReadiness.read, {})).enabled, fixtureGenerationEnabled: true })),
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

const id = <T extends "mediaTasks" | "_storage">() => z.string().min(10).max(100).transform(value => value as Id<T>);
const lease = { taskId: id<"mediaTasks">(), attempt: z.number().int().min(1).max(3), worker: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) };
const mediaRequest = z.discriminatedUnion("op", [
  z.object({ op: z.literal("claim"), worker: lease.worker, protocol: z.literal(2).optional() }).strict(),
  z.object({ op: z.literal("renew"), ...lease, message: z.string().max(120) }).strict(),
  z.object({ op: z.literal("uploadUrl"), ...lease }).strict(),
  z.object({ op: z.literal("abandon"), ...lease }).strict(),
  z.object({ op: z.literal("registerUpload"), ...lease, storageId: id<"_storage">() }).strict(),
  z.object({ op: z.literal("complete"), ...lease, result: z.object({ video: id<"_storage">(), project: id<"_storage">(), captions: id<"_storage">(), poster: id<"_storage">(), durationSeconds: z.number().min(15).max(90) }).strict() }).strict(),
]);
http.route({ path: "/worker/media", method: "POST", handler: httpAction(async (ctx, request) => {
  if (!env.WORKER_AUTH_TOKEN || env.WORKER_AUTH_TOKEN.length < 32) return new Response("Worker not configured", { status: 503 });
  if (request.headers.get("Authorization") !== `Bearer ${env.WORKER_AUTH_TOKEN}`) return new Response("Unauthorized", { status: 401 });
  const raw = await request.text();
  if (raw.length > 16000) return new Response("Payload too large", { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const parsed = mediaRequest.safeParse(body);
  if (!parsed.success) return new Response("Invalid media request", { status: 400 });
  const data = parsed.data;
  try {
    switch (data.op) {
      case "claim": return Response.json(await ctx.runMutation(internal.media.claim, { worker: data.worker, protocol: data.protocol }));
      case "renew": { const { op, ...value } = data; void op; return Response.json(await ctx.runMutation(internal.media.renew, value)); }
      case "uploadUrl": { const { op, ...value } = data; void op; return Response.json(await ctx.runMutation(internal.media.uploadUrl, value)); }
      case "abandon": { const { op, ...value } = data; void op; return Response.json(await ctx.runMutation(internal.media.abandon, value)); }
      case "registerUpload": { const { op, ...value } = data; void op; return Response.json(await ctx.runMutation(internal.media.registerUpload, value)); }
      case "complete": { const { op, ...value } = data; void op; return Response.json(await ctx.runMutation(internal.media.complete, value)); }
    }
  } catch { return new Response("Media lease or artifact rejected", { status: 409 }); }
}) });

export default http;
