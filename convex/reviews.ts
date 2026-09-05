import { ConvexError, v } from "convex/values";
import { start } from "@convex-dev/workflow";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { workflow } from "./generation";
import { requireSession } from "./lib/session";
import { projectSchema } from "../packages/contracts/scene";
import { passedReview, validateReview, validateReplacement } from "../packages/contracts/review";
import schema from "./schema";
import { reviewReady } from "./lib/generationConfig";

const versionArgs = { jobId: v.id("jobs"), revision: v.number() };
const reportValidator = v.object({ summary: v.string(), scenes: v.array(v.object({ sceneId: v.string(), factualPass: v.boolean(), visualPass: v.boolean(), issues: v.array(v.object({ sceneId: v.string(), kind: v.union(v.literal("factual"), v.literal("icon"), v.literal("layout"), v.literal("timing")), detail: v.string(), repair: v.string() })) })) });
export const run = workflow.define({ args: versionArgs, returns: v.null() }).handler(async (step, args): Promise<null> => {
  try { await step.runAction(internal.reviewActions.inspect, args, { retry: { maxAttempts: 2, initialBackoffMs: 5000, base: 2 } }); }
  catch { await step.runMutation(internal.reviews.unavailable, args); }
  return null;
});
export const repair = workflow.define({ args: { requestId: v.id("revisionRequests") }, returns: v.null() }).handler(async (step, args): Promise<null> => {
  try { await step.runAction(internal.reviewActions.rewrite, args, { retry: false }); }
  catch { await step.runMutation(internal.reviews.repairFailed, args); }
  return null;
});

export const context = internalQuery({ args: versionArgs, returns: v.union(v.null(), v.object({ job: schema.doc("jobs"), task: schema.doc("mediaTasks"), research: v.string(), review: schema.doc("lessonReviews") })), handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  const task = await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", args.jobId)).unique();
  const review = await ctx.db.query("lessonReviews").withIndex("by_jobId_and_revision", q => q.eq("jobId", args.jobId).eq("revision", args.revision)).unique();
  const research = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", args.jobId).eq("stage", "research")).unique();
  if (!job || job.revision !== args.revision || job.status !== "reviewing" || !task?.result || review?.status !== "pending" || !research) return null;
  return { job, task, research: research.json, review };
} });
export const unavailable = internalMutation({ args: versionArgs, returns: v.null(), handler: async (ctx, args) => {
  const review = await ctx.db.query("lessonReviews").withIndex("by_jobId_and_revision", q => q.eq("jobId", args.jobId).eq("revision", args.revision)).unique();
  const job = await ctx.db.get(args.jobId);
  if (job?.revision !== args.revision || job.status !== "reviewing" || review?.status !== "pending") return null;
  await ctx.db.patch(review._id, { status: "unavailable" });
  await ctx.db.patch(job._id, { status: "failed", stageMessage: "Review unavailable. Your draft is saved and has not been approved for delivery.", updatedAt: Date.now() });
  return null;
} });
export const commit = internalMutation({ args: { ...versionArgs, reportJson: v.string(), provider: v.literal("cloudflare"), model: v.string(), responseId: v.optional(v.string()), usageJson: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const current = await ctx.runQuery(internal.reviews.context, { jobId: args.jobId, revision: args.revision });
  if (!current) return null;
  if (args.reportJson.length > 40_000 || args.usageJson.length > 4000 || args.model.length > 100 || (args.responseId?.length || 0) > 200) throw new Error("Review too large");
  const project = projectSchema.parse(JSON.parse(current.task.projectJson!));
  const report = validateReview(JSON.parse(args.reportJson), project);
  const passed = passedReview(report);
  await ctx.db.patch(current.review._id, { status: passed ? "passed" : "rejected", reportJson: JSON.stringify(report), provider: args.provider, model: args.model, responseId: args.responseId, usageJson: args.usageJson });
  await ctx.db.insert("jobEvents", { jobId: args.jobId, kind: "review", message: `Revision ${args.revision}: ${passed ? "passed" : "rejected"} factual and rendered-frame review`, createdAt: Date.now() });
  if (passed) {
    await ctx.db.patch(args.jobId, { status: "completed", stageMessage: "Lesson passed automated source and rendered-frame review. Ready to watch or email.", updatedAt: Date.now() });
  } else if ((current.job.automaticRepairs || 0) < 1) {
    const sceneIds = report.scenes.filter(s => !s.factualPass || !s.visualPass).map(s => s.sceneId);
    const requestId = await ctx.db.insert("revisionRequests", { jobId: args.jobId, fromRevision: args.revision, requestId: `automatic-${args.revision}`, sceneIds, instruction: JSON.stringify(report), status: "pending", automatic: true });
    await ctx.db.patch(args.jobId, { automaticRepairs: 1, status: "planning", stageMessage: "Review found issues. Repairing the affected scenes once.", updatedAt: Date.now() });
    await start(ctx, internal.reviews.repair, { requestId }, { startAsync: true });
  } else {
    await ctx.db.patch(args.jobId, { status: "failed", stageMessage: "The repaired draft still has review issues. Automatic repair limit reached; review the findings or request a scene edit.", updatedAt: Date.now() });
  }
  return null;
} });
export const repairContext = internalQuery({ args: { requestId: v.id("revisionRequests") }, returns: v.union(v.null(), v.object({ request: schema.doc("revisionRequests"), task: schema.doc("mediaTasks"), research: v.string() })), handler: async (ctx, { requestId }) => {
  const request = await ctx.db.get(requestId);
  if (!request || request.status !== "pending") return null;
  const job = await ctx.db.get(request.jobId);
  const task = await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", request.jobId)).unique();
  const research = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", request.jobId).eq("stage", "research")).unique();
  if (!job || job.status !== "planning" || job.revision !== request.fromRevision || !task?.projectJson || !research) return null;
  return { request, task, research: research.json };
} });
export const replace = internalMutation({ args: { requestId: v.id("revisionRequests"), projectJson: v.string(), evidenceJson: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const current = await ctx.runQuery(internal.reviews.repairContext, { requestId: args.requestId });
  if (!current) return null;
  if (args.projectJson.length > 100_000 || args.evidenceJson.length > 20_000) throw new Error("Revision too large");
  const previous = projectSchema.parse(JSON.parse(current.task.projectJson!));
  const next = validateReplacement(previous, JSON.parse(args.projectJson), current.request.sceneIds);
  const revision = current.request.fromRevision + 1;
  const provenance = { ...JSON.parse(current.task.provenanceJson || "{}"), revision, parentRevision: current.request.fromRevision, revisionEvidence: JSON.parse(args.evidenceJson), revisedSceneIds: current.request.sceneIds };
  await ctx.db.patch(current.task._id, { projectJson: JSON.stringify(next), provenanceJson: JSON.stringify(provenance), revision, attemptBase: current.task.attempt, status: "queued", result: undefined, worker: undefined, leaseUntil: 0 });
  await ctx.db.patch(current.request.jobId, { revision, status: "rendering", stageMessage: "Revised scenes queued. Unchanged narration will be reused when cached.", updatedAt: Date.now() });
  await ctx.db.patch(args.requestId, { status: "completed" });
  return null;
} });
export const repairFailed = internalMutation({ args: { requestId: v.id("revisionRequests") }, returns: v.null(), handler: async (ctx, { requestId }) => {
  const current = await ctx.runQuery(internal.reviews.repairContext, { requestId });
  if (!current) return null;
  await ctx.db.patch(requestId, { status: "failed" });
  await ctx.db.patch(current.request.jobId, { status: "failed", stageMessage: "The scene edit could not produce a supported replacement. Previous draft is saved.", updatedAt: Date.now() });
  return null;
} });
export const revise = mutation({ args: { token: v.string(), jobId: v.id("jobs"), revision: v.number(), requestId: v.string(), sceneId: v.string(), instruction: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const session = await requireSession(ctx, args.token, Date.now());
  const job = await ctx.db.get(args.jobId);
  if (!job || job.sessionId !== session._id) throw new ConvexError("Lesson not found");
  const previous = await ctx.db.query("revisionRequests").withIndex("by_jobId_and_requestId", q => q.eq("jobId", args.jobId).eq("requestId", args.requestId)).unique();
  if (previous) {
    if (previous.instruction !== args.instruction.trim() || previous.sceneIds[0] !== args.sceneId || previous.fromRevision !== args.revision) throw new ConvexError("Request ID already used");
    return null;
  }
  if (!reviewReady()) throw new ConvexError("Review provider setup is required before editing");
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(args.requestId) || args.instruction.trim().length < 5 || args.instruction.length > 500) throw new ConvexError("Enter an edit request of 5–500 characters");
  if (!job.generation || job.revision !== args.revision || !["failed", "completed"].includes(job.status) || (job.userRevisions || 0) >= 2) throw new ConvexError("This version cannot be edited (maximum two user edits)");
  const task = await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", args.jobId)).unique();
  if (!task?.result || !projectSchema.parse(JSON.parse(task.projectJson!)).scenes.some(s => s.id === args.sceneId)) throw new ConvexError("Rendered scene not found");
  const requestId = await ctx.db.insert("revisionRequests", { jobId: args.jobId, fromRevision: args.revision, requestId: args.requestId, sceneIds: [args.sceneId], instruction: args.instruction.trim(), status: "pending", automatic: false });
  await ctx.db.patch(args.jobId, { userRevisions: (job.userRevisions || 0) + 1, status: "planning", stageMessage: "Applying your scene edit", updatedAt: Date.now() });
  await start(ctx, internal.reviews.repair, { requestId }, { startAsync: true });
  return null;
} });
export const details = query({ args: { token: v.string(), jobId: v.id("jobs") }, returns: v.union(v.null(), v.object({ revision: v.number(), canRevise: v.boolean(), scenes: v.array(v.object({ id: v.string(), title: v.string() })), reviews: v.array(v.object({ revision: v.number(), status: v.string(), provider: v.union(v.string(), v.null()), model: v.union(v.string(), v.null()), report: v.union(v.null(), reportValidator) })) })), handler: async (ctx, args) => {
  const session = await requireSession(ctx, args.token);
  const job = await ctx.db.get(args.jobId);
  if (!job || job.sessionId !== session._id || !job.generation) return null;
  const task = await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", args.jobId)).unique();
  const reviews = await ctx.db.query("lessonReviews").withIndex("by_jobId_and_revision", q => q.eq("jobId", args.jobId)).order("desc").take(5);
  return { revision: job.revision, canRevise: Boolean(reviewReady() && task?.result && ["failed", "completed"].includes(job.status) && (job.userRevisions || 0) < 2), scenes: task?.projectJson ? projectSchema.parse(JSON.parse(task.projectJson)).scenes.map(s => ({ id: s.id, title: s.title })) : [], reviews: reviews.map(r => ({ revision: r.revision, status: r.status, provider: r.provider ?? null, model: r.model ?? null, report: r.reportJson ? validateReview(JSON.parse(r.reportJson), projectSchema.parse(JSON.parse(task!.projectJson!))) : null })) };
} });

// Operator migration for a pre-H3 rendered draft. Retain the original version;
// regenerate decoded-frame evidence without repeating research or planning.
export const upgradeLegacy = internalMutation({ args: { jobId: v.id("jobs") }, returns: v.null(), handler: async (ctx, { jobId }) => {
  const job = await ctx.db.get(jobId);
  const task = await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", jobId)).unique();
  if (!job?.generation || job.status !== "completed" || !task?.projectJson || !task.result || task.result.frames) throw new Error("Only a completed pre-review draft can migrate");
  await ctx.db.insert("lessonVersions", { jobId, revision: job.revision, projectJson: task.projectJson, provenanceJson: task.provenanceJson || "{}", result: task.result, createdAt: Date.now() });
  await ctx.db.patch(task._id, { revision: job.revision + 1, attemptBase: task.attempt, result: undefined, status: "queued", worker: undefined, leaseUntil: 0 });
  await ctx.db.patch(jobId, { revision: job.revision + 1, status: "rendering", stageMessage: "Rendering the saved draft with frame evidence for review", updatedAt: Date.now() });
  return null;
} });
export const retryUnavailable = internalMutation({ args: versionArgs, returns: v.null(), handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  const review = await ctx.db.query("lessonReviews").withIndex("by_jobId_and_revision", q => q.eq("jobId", args.jobId).eq("revision", args.revision)).unique();
  if (!reviewReady() || job?.revision !== args.revision || job.status !== "failed" || review?.status !== "unavailable") throw new Error("Only an unavailable review can resume after setup");
  await ctx.db.patch(review._id, { status: "pending" });
  await ctx.db.patch(job._id, { status: "reviewing", stageMessage: "Retrying review of the saved video", updatedAt: Date.now() });
  await start(ctx, internal.reviews.run, args, { startAsync: true });
  return null;
} });
