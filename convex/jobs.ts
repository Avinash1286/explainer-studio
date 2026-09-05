import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireSession } from "./lib/session";
import { DURATION_PRESETS, LIMITS, normalizeTopic } from "../packages/contracts";
import { jobStatus } from "./schema";
import { limits } from "./lib/limits";

const visibleJob = v.object({
  _id: v.id("jobs"), topic: v.string(), duration: v.number(), audience: v.string(),
  status: jobStatus, stageMessage: v.string(), revision: v.number(), createdAt: v.number(), updatedAt: v.number(),
});

export const list = query({
  args: { token: v.string() },
  returns: v.array(visibleJob),
  handler: async (ctx, { token }) => {
    const session = await requireSession(ctx, token);
    const jobs = await ctx.db.query("jobs").withIndex("by_sessionId_and_createdAt", (q) => q.eq("sessionId", session._id)).order("desc").take(30);
    return jobs.map(({ _id, topic, duration, audience, status, stageMessage, revision, createdAt, updatedAt }) =>
      ({ _id, topic, duration, audience, status, stageMessage, revision, createdAt, updatedAt }));
  },
});

export const create = mutation({
  args: { token: v.string(), topic: v.string(), duration: v.number(), audience: v.union(v.literal("beginner"), v.literal("student")), requestId: v.string() },
  returns: v.id("jobs"),
  handler: async (ctx, args) => {
    const session = await requireSession(ctx, args.token, Date.now());
    let topic: string;
    try { topic = normalizeTopic(args.topic); } catch (error) { throw new ConvexError((error as Error).message); }
    if (!(DURATION_PRESETS as readonly number[]).includes(args.duration)) throw new ConvexError("Choose 60, 75, or 90 seconds.");
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(args.requestId)) throw new ConvexError("Invalid request ID.");
    const previous = await ctx.db.query("jobs").withIndex("by_sessionId_and_requestId", (q) => q.eq("sessionId", session._id).eq("requestId", args.requestId)).unique();
    if (previous) {
      if (previous.topic !== topic || previous.duration !== args.duration || previous.audience !== args.audience) throw new ConvexError("Request ID was already used for a different lesson.");
      return previous._id;
    }
    const perSession = await limits.limit(ctx, "sessionJobs", { key: session._id });
    if (!perSession.ok) throw new ConvexError("Your daily lesson limit has been reached. Try again tomorrow.");
    const global = await limits.limit(ctx, "allJobs");
    if (!global.ok) throw new ConvexError("Today's generation capacity is full. Try again tomorrow.");
    const queued = await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "queued")).take(LIMITS.maxQueued);
    if (queued.length >= LIMITS.maxQueued) throw new ConvexError("The queue is full. Please try again later.");
    const now = Date.now();
    const jobId = await ctx.db.insert("jobs", {
      sessionId: session._id, topic, duration: args.duration, audience: args.audience,
      status: "queued", stageMessage: "Brief saved. Video generation is being built in the next phase.",
      revision: 1, requestId: args.requestId, createdAt: now, updatedAt: now,
    });
    await ctx.db.insert("jobEvents", { jobId, kind: "created", message: "Lesson brief saved", createdAt: now });
    return jobId;
  },
});

export const cancel = mutation({
  args: { token: v.string(), jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, { token, jobId }) => {
    const session = await requireSession(ctx, token, Date.now());
    const job = await ctx.db.get(jobId);
    if (!job || job.sessionId !== session._id) throw new ConvexError("Lesson not found.");
    if (job.status === "cancelled") return null;
    if (job.status === "completed" || job.status === "failed") throw new ConvexError("This lesson has already finished.");
    await ctx.db.patch(jobId, { status: "cancelled", stageMessage: "Lesson cancelled", updatedAt: Date.now() });
    await ctx.db.insert("jobEvents", { jobId, kind: "cancelled", message: "Cancelled by owner", createdAt: Date.now() });
    return null;
  },
});
