import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireSession } from "./lib/session";
import { start } from "@convex-dev/workflow";
import { mediaResult } from "./schema";
import { projectSchema } from "../packages/contracts/scene";
import { limits } from "./lib/limits";

const LEASE_MS = 90_000;
const MAX_ATTEMPTS = 3;
const leaseArgs = { taskId: v.id("mediaTasks"), attempt: v.number(), worker: v.string() };
const resultValidator = mediaResult;

async function activeLease(ctx: MutationCtx, args: { taskId: Id<"mediaTasks">; attempt: number; worker: string }) {
  const task = await ctx.db.get(args.taskId);
  if (task?.status === "cancelled") throw new ConvexError("Lesson cancelled");
  if (!task || task.status !== "running" || task.attempt !== args.attempt || task.worker !== args.worker || task.leaseUntil <= Date.now()) throw new ConvexError("Stale media lease");
  const job = await ctx.db.get(task.jobId);
  if (!job || job.status === "cancelled") throw new ConvexError("Lesson cancelled");
  return task;
}

export const createSample = mutation({
  args: { token: v.string(), requestId: v.string() }, returns: v.id("jobs"),
  handler: async (ctx, { token, requestId }) => {
    const session = await requireSession(ctx, token, Date.now());
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(requestId)) throw new ConvexError("Invalid request ID");
    const previous = await ctx.db.query("jobs").withIndex("by_sessionId_and_requestId", q => q.eq("sessionId", session._id).eq("requestId", requestId)).unique();
    if (previous) {
      const task = await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", previous._id)).unique();
      if (!task) throw new ConvexError("Request ID already used for a brief");
      return previous._id;
    }
    if (!(await limits.limit(ctx, "sessionJobs", { key: session._id })).ok || !(await limits.limit(ctx, "allJobs")).ok) throw new ConvexError("Daily lesson capacity reached");
    const queued = await ctx.db.query("mediaTasks").withIndex("by_status_and_leaseUntil", q => q.eq("status", "queued")).take(5);
    if (queued.length >= 5) throw new ConvexError("Demo render queue is full. Try again later.");
    const now = Date.now();
    const jobId = await ctx.db.insert("jobs", { sessionId: session._id, topic: "Demo: How plants turn light into food", duration: 30, audience: "beginner", status: "rendering", stageMessage: "Demo queued for the media worker", revision: 1, requestId, createdAt: now, updatedAt: now });
    await ctx.db.insert("mediaTasks", { jobId, fixtureVersion: "plant-energy-v1", status: "queued", attempt: 0, leaseUntil: 0, createdAt: now });
    return jobId;
  },
});

export const result = query({
  args: { token: v.string(), jobId: v.id("jobs") },
  handler: async (ctx, { token, jobId }) => {
    const session = await requireSession(ctx, token);
    const job = await ctx.db.get(jobId);
    if (!job || job.sessionId !== session._id) return null;
    const task = await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", jobId)).unique();
    if (!task?.result || task.status !== "completed" || job.status === "cancelled") return null;
    const review = job.generation ? await ctx.db.query("lessonReviews").withIndex("by_jobId_and_revision", q => q.eq("jobId", jobId).eq("revision", job.revision)).unique() : null;
    const approved = !job.generation || (review?.status === "passed" && job.status === "completed");
    const [video, project, captions, poster] = await Promise.all([ctx.storage.getUrl(task.result.video), ctx.storage.getUrl(task.result.project), ctx.storage.getUrl(task.result.captions), ctx.storage.getUrl(task.result.poster)]);
    return { video, project, captions, poster, durationSeconds: task.result.durationSeconds, generated: Boolean(job.generation), approved };
  },
});

export const claim = internalMutation({
  args: { worker: v.string(), protocol: v.optional(v.number()) },
  handler: async (ctx, { worker, protocol }) => {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(worker)) throw new ConvexError("Invalid worker identity");
    const existing = await ctx.db.query("mediaTasks").withIndex("by_status_and_leaseUntil", q => q.eq("status", "running")).take(10);
    const owned = existing.find(t => t.worker === worker && t.leaseUntil > Date.now());
    if (owned) return { taskId: owned._id, attempt: owned.attempt, fixtureVersion: owned.fixtureVersion, projectJson: owned.projectJson, provenanceJson: owned.provenanceJson };
    const queued = await ctx.db.query("mediaTasks").withIndex("by_status_and_leaseUntil", q => q.eq("status", "queued")).take(5);
    for (const task of queued) {
      if (task.fixtureVersion === "generated-v1" && protocol !== 3) continue;
      const job = await ctx.db.get(task.jobId);
      if (!job || job.status === "cancelled") { await ctx.db.patch(task._id, { status: "cancelled" }); continue; }
      const attempt = task.attempt + 1;
      await ctx.db.patch(task._id, { status: "running", attempt, worker, leaseUntil: Date.now() + LEASE_MS });
      await ctx.db.patch(task.jobId, { stageMessage: "Media worker is preparing your lesson", updatedAt: Date.now() });
      await ctx.scheduler.runAfter(LEASE_MS, internal.media.recover, { taskId: task._id, attempt });
      return { taskId: task._id, attempt, fixtureVersion: task.fixtureVersion, projectJson: task.projectJson, provenanceJson: task.provenanceJson };
    }
    return null;
  },
});

export const renew = internalMutation({
  args: { ...leaseArgs, message: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const task = await activeLease(ctx, args);
    await ctx.db.patch(task._id, { leaseUntil: Date.now() + LEASE_MS });
    if (args.message.length > 120) throw new ConvexError("Message too long");
    const job = await ctx.db.get(task.jobId);
    if (job?.stageMessage !== args.message) await ctx.db.patch(task.jobId, { stageMessage: args.message, updatedAt: Date.now() });
    return null;
  },
});

export const recover = internalMutation({
  args: { taskId: v.id("mediaTasks"), attempt: v.number() }, returns: v.null(),
  handler: async (ctx, { taskId, attempt }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.attempt !== attempt || task.status !== "running") return null;
    const job = await ctx.db.get(task.jobId);
    if (job?.status === "cancelled") { await ctx.db.patch(taskId, { status: "cancelled" }); return null; }
    if (task.leaseUntil > Date.now()) { await ctx.scheduler.runAt(task.leaseUntil, internal.media.recover, { taskId, attempt }); return null; }
    const failed = attempt - (task.attemptBase || 0) >= MAX_ATTEMPTS;
    await ctx.db.patch(taskId, { status: failed ? "failed" : "queued", worker: undefined, leaseUntil: 0 });
    if (job) await ctx.db.patch(job._id, { status: failed ? "failed" : "rendering", stageMessage: failed ? "The video could not finish after three worker attempts" : "Worker interrupted. Video queued for a fresh attempt", updatedAt: Date.now() });
    return null;
  },
});

export const uploadUrl = internalMutation({ args: leaseArgs, handler: async (ctx, args) => { await activeLease(ctx, args); return ctx.storage.generateUploadUrl(); } });

export const abandon = internalMutation({ args: leaseArgs, returns: v.null(), handler: async (ctx, args) => {
  const task = await ctx.db.get(args.taskId);
  if (task?.status === "running" && task.attempt === args.attempt && task.worker === args.worker) {
    await ctx.db.patch(task._id, { leaseUntil: Date.now()-1 });
    await ctx.scheduler.runAfter(0, internal.media.recover, { taskId: task._id, attempt: task.attempt });
  }
  return null;
} });

// One operator-requested attempt after a worker fix; preserve the fencing counter.
export const retryFailed = internalMutation({ args: { jobId: v.id("jobs") }, returns: v.null(), handler: async (ctx, { jobId }) => {
  const job = await ctx.db.get(jobId);
  const task = await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", jobId)).unique();
  if (job?.status !== "failed" || task?.status !== "failed" || task.result) throw new ConvexError("Only failed unpublished media can retry");
  await ctx.db.patch(task._id, { status: "queued", worker: undefined, leaseUntil: 0 });
  await ctx.db.patch(jobId, { status: "rendering", stageMessage: "Retrying the saved lesson after a worker fix", updatedAt: Date.now() });
  return null;
} });

export const registerUpload = internalMutation({
  args: { ...leaseArgs, storageId: v.id("_storage") }, returns: v.null(),
  handler: async (ctx, args) => {
    // Track files even after cancellation so a late upload can be collected.
    const task = await ctx.db.get(args.taskId);
    if (!task || task.worker !== args.worker || task.attempt !== args.attempt) throw new ConvexError("Stale upload registration");
    const existing = await ctx.db.query("mediaUploads").withIndex("by_taskId_and_attempt", q => q.eq("taskId", args.taskId).eq("attempt", args.attempt)).take(21);
    if (existing.some(x => x.storageId === args.storageId)) return null;
    if (existing.length >= 20) throw new ConvexError("Upload count exceeded");
    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata || metadata.size > 30_000_000) throw new ConvexError("Missing or oversized artifact");
    const id = await ctx.db.insert("mediaUploads", { taskId: args.taskId, attempt: args.attempt, storageId: args.storageId, createdAt: Date.now(), committed: false });
    await ctx.scheduler.runAfter(3_600_000, internal.media.collectUpload, { id });
    return null;
  },
});
export const collectUpload = internalMutation({ args: { id: v.id("mediaUploads") }, handler: async (ctx, { id }) => { const upload = await ctx.db.get(id); if (upload && !upload.committed) { await ctx.storage.delete(upload.storageId); await ctx.db.delete(id); } } });

export const complete = internalMutation({
  args: { ...leaseArgs, result: resultValidator }, returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.taskId);
    if (existing?.status === "completed" && existing.attempt === args.attempt && existing.worker === args.worker) {
      if (!existing.result || (Object.keys(args.result) as (keyof typeof args.result)[]).some(key => JSON.stringify(existing.result![key]) !== JSON.stringify(args.result[key]))) throw new ConvexError("Completion payload changed");
      return null;
    }
    const task = await activeLease(ctx, args);
    if (!Number.isFinite(args.result.durationSeconds) || args.result.durationSeconds < (task.projectJson ? 60 : 15) || args.result.durationSeconds > (task.projectJson ? 90 : 45)) throw new ConvexError("Invalid video duration");
    const uploads = await ctx.db.query("mediaUploads").withIndex("by_taskId_and_attempt", q => q.eq("taskId", args.taskId).eq("attempt", args.attempt)).take(21);
    const expected = [[args.result.video, "video/mp4"], [args.result.project, "application/json"], [args.result.captions, "text/vtt"], [args.result.poster, "image/png"]] as const;
    if (new Set(expected.map(([id]) => id)).size !== 4) throw new ConvexError("Artifacts must be distinct");
    for (const [id, contentType] of expected) {
      const upload = uploads.find(u => u.storageId === id);
      const metadata = await ctx.db.system.get(id);
      if (!upload || !metadata || metadata.contentType !== contentType || !metadata.size) throw new ConvexError(`Artifact validation failed: expected ${contentType}, got ${metadata?.contentType}, size ${metadata?.size}, registered ${Boolean(upload)}`);
      await ctx.db.patch(upload._id, { committed: true });
    }
    const job = await ctx.db.get(task.jobId);
    if (!job) throw new ConvexError("Lesson missing");
    if (task.projectJson) {
      const project = projectSchema.parse(JSON.parse(task.projectJson));
      const frames = args.result.frames || [];
      if (frames.length !== project.scenes.length * 2 || new Set(frames.map(f => f.storageId)).size !== frames.length || frames.some(f => expected.some(([id]) => id === f.storageId))) throw new ConvexError("Missing or duplicate review frames");
      for (const scene of project.scenes) if (frames.filter(f => f.sceneId === scene.id).length !== 2) throw new ConvexError("Frame coverage incomplete");
      for (const frame of frames) {
        const upload = uploads.find(u => u.storageId === frame.storageId);
        const metadata = await ctx.db.system.get(frame.storageId);
        if (!upload || metadata?.contentType !== "image/jpeg" || !metadata.size || metadata.size > 2_000_000 || !Number.isInteger(frame.frame) || frame.frame < 0 || frame.frame >= args.result.durationSeconds * 24) throw new ConvexError("Invalid review frame");
        await ctx.db.patch(upload._id, { committed: true });
      }
      await ctx.db.insert("lessonVersions", { jobId: job._id, revision: job.revision, projectJson: task.projectJson, provenanceJson: task.provenanceJson || "{}", result: args.result, createdAt: Date.now() });
      await ctx.db.insert("lessonReviews", { jobId: job._id, revision: job.revision, status: "pending", createdAt: Date.now() });
      await start(ctx, internal.reviews.run, { jobId: job._id, revision: job.revision }, { startAsync: true });
    }
    await ctx.db.patch(task._id, { status: "completed", result: args.result });
    await ctx.db.patch(task.jobId, { status: task.projectJson ? "reviewing" : "completed", duration: args.result.durationSeconds, stageMessage: task.projectJson ? "Draft rendered. Checking source support and actual video frames." : "Original scripted demo rendered with Kokoro narration.", updatedAt: Date.now() });
    return null;
  },
});
