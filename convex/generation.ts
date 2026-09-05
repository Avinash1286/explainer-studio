import { ConvexError, v } from "convex/values";
import { start, WorkflowManager, vResultValidator, vWorkflowId } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireSession } from "./lib/session";
import { generationReady } from "./lib/generationConfig";
import { projectSchema } from "../packages/contracts/scene";

export const workflow = new WorkflowManager(components.workflow, { workpoolOptions: { maxParallelism: 2 } });
export const run = workflow.define({ args: { jobId: v.id("jobs") }, returns: v.null() }).handler(async (step, args): Promise<null> => {
  // Each action persists a checkpoint. Replays reuse it rather than charging again.
  await step.runAction(internal.planning.researchTopic, args, { retry: { maxAttempts: 2, initialBackoffMs: 3000, base: 2 } });
  await step.runAction(internal.planning.planScenes, args, { retry: false });
  await step.runAction(internal.planning.retrieveIcons, args, { retry: { maxAttempts: 2, initialBackoffMs: 3000, base: 2 } });
  await step.runMutation(internal.generation.enqueue, args);
  return null;
});

export const availability = query({ args: {}, handler: async ctx => ({ enabled: await generationReady(ctx) }) });

export const retryPlanning = mutation({ args: { token: v.string(), jobId: v.id("jobs") }, returns: v.null(), handler: async (ctx, args) => {
  const session = await requireSession(ctx, args.token, Date.now());
  const job = await ctx.db.get(args.jobId);
  if (!job || job.sessionId !== session._id) throw new ConvexError("Lesson not found");
  if (job.status === "planning" && job.planningRetries) return null;
  if ((job.planningRetries || 0) >= 1) throw new ConvexError("Retry limit reached. Create a new lesson with a clearer question.");
  const active = await Promise.all(["researching", "planning", "rendering", "reviewing"].map(status => ctx.db.query("jobs").withIndex("by_status", q => q.eq("status", status as "researching" | "planning" | "rendering" | "reviewing")).take(5)));
  if (active.flat().length >= 5) throw new ConvexError("Generation queue is full. Try again later");
  await ctx.runMutation(internal.generation.resumePlanning, { jobId: args.jobId });
  await ctx.db.patch(args.jobId, { planningRetries: 1 });
  return null;
} });

// Operator recovery after a planner fix. Research is reused; no public retry loop.
export const resumePlanning = internalMutation({ args: { jobId: v.id("jobs") }, returns: v.null(), handler: async (ctx, { jobId }) => {
  const job = await ctx.db.get(jobId);
  if (!job?.generation || job.status !== "failed") throw new ConvexError("Only failed generation can resume");
  const artifacts = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", jobId)).take(4);
  if (artifacts.some(a => a.stage !== "research")) throw new ConvexError("Only a failed pre-render plan can resume");
  if (!await generationReady(ctx)) throw new ConvexError("Providers must be qualified");
  await ctx.db.patch(jobId, { status: "planning", stageMessage: artifacts.length ? "Retrying the lesson plan using saved research" : "Retrying research for this lesson", updatedAt: Date.now() });
  const workflowId = await start(ctx, internal.generation.run, { jobId }, { onComplete: internal.generation.finished, context: { jobId }, startAsync: true });
  await ctx.db.patch(jobId, { workflowId });
  await ctx.db.insert("jobEvents", { jobId, kind: "planning_retry", message: "Operator resumed planning using saved research", createdAt: Date.now() });
  return null;
} });

export const generate = mutation({
  args: { token: v.string(), jobId: v.id("jobs") }, returns: v.null(),
  handler: async (ctx, { token, jobId }) => {
    const session = await requireSession(ctx, token, Date.now());
    const job = await ctx.db.get(jobId);
    if (!job || job.sessionId !== session._id) throw new ConvexError("Lesson not found");
    if (job.generation) return null; // Idempotent even after completion or a lost response.
    if (job.status !== "queued") throw new ConvexError("This lesson cannot be started");
    if (!await generationReady(ctx)) throw new ConvexError("Topic generation is awaiting provider setup");
    const active = await Promise.all(["researching", "planning", "rendering", "reviewing"].map(status => ctx.db.query("jobs").withIndex("by_status", q => q.eq("status", status as "researching" | "planning" | "rendering" | "reviewing")).take(5)));
    if (active.flat().length >= 5) throw new ConvexError("Generation queue is full. Try again later");
    await ctx.db.patch(jobId, { generation: true, status: "researching", stageMessage: "Finding sources for your question", updatedAt: Date.now() });
    const workflowId = await start(ctx, internal.generation.run, { jobId }, { onComplete: internal.generation.finished, context: { jobId }, startAsync: true });
    await ctx.db.patch(jobId, { workflowId });
    return null;
  },
});

export const context = internalQuery({ args: { jobId: v.id("jobs") }, handler: async (ctx, { jobId }) => {
  const job = await ctx.db.get(jobId);
  if (!job || !job.generation || !["researching", "planning"].includes(job.status)) throw new ConvexError("Generation no longer active");
  const artifacts = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", jobId)).take(4);
  return { job, artifacts };
} });

export const checkpoint = internalMutation({ args: { jobId: v.id("jobs"), stage: v.union(v.literal("research"), v.literal("plan"), v.literal("project")), json: v.string() }, handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  if (!job || !job.generation || !["researching", "planning"].includes(job.status)) throw new ConvexError("Generation no longer active");
  if (args.json.length > 100_000) throw new ConvexError("Artifact too large");
  const previous = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", args.jobId).eq("stage", args.stage)).unique();
  if (previous) return null;
  await ctx.db.insert("generationArtifacts", { ...args, createdAt: Date.now() });
  const message = args.stage === "research" ? "Sources found. Writing and checking the lesson" : args.stage === "plan" ? "Choosing illustrations for each scene" : "Scene plan ready for narration and animation";
  await ctx.db.patch(args.jobId, { status: "planning", stageMessage: message, updatedAt: Date.now() });
  await ctx.db.insert("jobEvents", { jobId: args.jobId, kind: args.stage, message, createdAt: Date.now() });
  return null;
} });

export const enqueue = internalMutation({ args: { jobId: v.id("jobs") }, handler: async (ctx, { jobId }) => {
  const job = await ctx.db.get(jobId);
  if (!job || !job.generation || job.status === "cancelled") return null;
  const existing = await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", jobId)).unique();
  if (existing) return null;
  if (job.status !== "planning") throw new ConvexError("Generation no longer active");
  const artifact = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", jobId).eq("stage", "project")).unique();
  if (!artifact) throw new ConvexError("Missing project checkpoint");
  const data = JSON.parse(artifact.json) as { project: unknown; provenance: unknown };
  const project = projectSchema.parse(data.project);
  await ctx.db.insert("mediaTasks", { jobId, fixtureVersion: "generated-v1", projectJson: JSON.stringify(project), provenanceJson: JSON.stringify(data.provenance), status: "queued", attempt: 0, leaseUntil: 0, createdAt: Date.now() });
  await ctx.db.patch(jobId, { status: "rendering", stageMessage: "Your lesson is queued for narration and animation", updatedAt: Date.now() });
  return null;
} });

export const finished = internalMutation({ args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ jobId: v.id("jobs") }) }, handler: async (ctx, args) => {
  const job = await ctx.db.get(args.context.jobId);
  if (!job || job.workflowId !== args.workflowId || !["researching", "planning"].includes(job.status)) return null;
  if (args.result.kind !== "success") {
    const error = args.result.kind === "failed" ? args.result.error : "";
    const providerUnavailable = /request failed|timed out|timeout/i.test(error);
    await ctx.db.patch(job._id, { status: "failed", stageMessage: providerUnavailable ? "An AI or research service could not respond. Saved research is retained; retry later if available below." : "Planning could not produce a supported lesson. Try a clearer science or everyday-mechanism question.", updatedAt: Date.now() });
    await ctx.db.insert("jobEvents", { jobId: job._id, kind: "failed", message: "Generation workflow stopped before rendering", createdAt: Date.now() });
  }
  return null;
} });

export const details = query({ args: { token: v.string(), jobId: v.id("jobs") }, handler: async (ctx, { token, jobId }) => {
  const session = await requireSession(ctx, token);
  const job = await ctx.db.get(jobId);
  if (!job || job.sessionId !== session._id) return null;
  const artifacts = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", jobId)).take(4);
  const source = artifacts.find(a => a.stage === "research");
  const sources = source ? (JSON.parse(source.json) as { sources: { id: string; title: string; url: string }[] }).sources.map(({ id, title, url }) => ({ id, title, url })) : [];
  return { generated: Boolean(job.generation), stages: artifacts.map(a => a.stage), sources, canRetry: job.status === "failed" && artifacts.every(a => a.stage === "research") && (job.planningRetries || 0) < 1 };
} });
