import { ConvexError, v } from "convex/values";
import { start, WorkflowManager, vResultValidator, vWorkflowId } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireSession } from "./lib/session";
import { generationAvailability, generationReady, providerConfig, reviewReady } from "./lib/generationConfig";
import { projectSchema } from "../packages/contracts/scene";
import { validateDirectedPlan } from "./lib/director";
import { ProviderError, responseFailure, type Attempt } from "./lib/providers";
import { errorInfo, failureReason } from "../packages/contracts/retry";
import { generationProvider } from "./schema";
import { limits } from "./lib/limits";
import { providerFailureMessage, PROVIDER_MESSAGES, transientProviderFailure, type GenerationProvider } from "../packages/contracts/provider";

export const workflow = new WorkflowManager(components.workflow, { workpoolOptions: { maxParallelism: 2 } });

export function retryableDirectorFailure(error: string): boolean {
  if (!transientProviderFailure(error)) return false;
  // A rate-limited fallback after three invalid primary outputs is still a
  // validation failure; retrying would repeat the same paid invalid candidates.
  const primary = error.split("; primary:")[1];
  return !primary || transientProviderFailure(primary);
}

export const run = workflow.define({ args: { jobId: v.id("jobs") }, returns: v.null() }).handler(async (step, args): Promise<null> => {
  // Each action persists a checkpoint. Replays reuse it rather than charging again.
  await step.runAction(internal.generation.verifyProviderForJob, args, { retry: false });
  await step.runAction(internal.planning.researchTopic, args, { retry: { maxAttempts: 2, initialBackoffMs: 3000, base: 2 } });
  await step.runAction(internal.planning.planScenes, args, { retry: false });
  await step.runAction(internal.planning.retrieveIcons, args, { retry: { maxAttempts: 2, initialBackoffMs: 3000, base: 2 } });
  const sceneIds: string[] = await step.runQuery(internal.planning.directorSceneIds, args);
  // Sequential scene checkpoints reduce inference pressure and let every scene
  // see its predecessor's final visual identities. Backoff is durable, not a
  // sleeping paid action; completed scenes are never regenerated on recovery.
  for (const sceneId of sceneIds) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try { await step.runAction(internal.planning.directScene, { ...args, sceneId }, { retry: false }); break; }
      catch (error) {
        if (attempt === 2 || !retryableDirectorFailure(String(error))) throw error;
        if (!await step.runMutation(internal.generation.directorWaiting, { ...args, sceneId })) return null;
        await step.sleep(30_000, { name: `Wait before retrying ${sceneId}` });
      }
    }
  }
  await step.runAction(internal.planning.finalizeProject, args, { retry: false });
  await step.runMutation(internal.generation.enqueue, args);
  return null;
});

export const directorWaiting = internalMutation({ args: { jobId: v.id("jobs"), sceneId: v.string() }, returns: v.boolean(), handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  if (!job?.generation || job.generationRunId || job.revision !== 1 || job.status !== "planning") return false;
  if (await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", args.jobId)).first()) return false;
  const base = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", args.jobId).eq("stage", "base")).unique();
  const index = base ? projectSchema.parse(JSON.parse(base.json).project).scenes.findIndex(scene => scene.id === args.sceneId) : -1;
  if (index < 0) return false;
  const message = `The AI service is temporarily unavailable. Retrying scene ${index + 1} once; completed scenes remain saved.`;
  await ctx.db.patch(args.jobId, { stageMessage: message, updatedAt: Date.now() });
  await ctx.db.insert("jobEvents", { jobId: args.jobId, kind: "director_retry", message, createdAt: Date.now() });
  return true;
} });

export const availability = query({ args: {}, handler: async ctx => {
  const [nim, openai] = await Promise.all([generationAvailability(ctx, "nim"), generationAvailability(ctx, "openai")]);
  // Keep the original field tied to NIM for cached clients that cannot choose a route.
  return { enabled: nim.enabled, providers: { nim, openai } };
} });

async function verifyProvider(provider: GenerationProvider) {
  if (provider !== "openai") return;
  const config = providerConfig(provider);
  if (!config.OPENAI_API_KEY) throw new ConvexError(PROVIDER_MESSAGES.missingKey);
  let response: Response;
  try {
    response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(config.OPENAI_MODEL!)}`, {
      headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}` }, redirect: "error", signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new ProviderError("openai", 0, { kind: "network" }); }
  if (!response.ok) throw await responseFailure("openai", response);
  const model = await response.json().catch(() => null);
  if (model?.id !== config.OPENAI_MODEL) throw new ConvexError(PROVIDER_MESSAGES.unavailableModel);
}

export const authorizeProviderCheck = internalMutation({ args: { token: v.string(), generationProvider }, returns: v.null(), handler: async (ctx, args) => {
  const session = await requireSession(ctx, args.token, Date.now());
  const state = await generationAvailability(ctx, args.generationProvider);
  if (!state.enabled) throw new ConvexError(state.message);
  if (!(await limits.limit(ctx, "providerChecks", { key: session._id })).ok || !(await limits.limit(ctx, "allProviderChecks")).ok) throw new ConvexError("Too many provider checks. Please try again later.");
  return null;
} });

export const checkProvider = action({ args: { token: v.string(), generationProvider }, returns: v.null(), handler: async (ctx, args) => {
  await ctx.runMutation(internal.generation.authorizeProviderCheck, args);
  try { await verifyProvider(args.generationProvider); }
  catch (error) {
    const info = errorInfo(error);
    // Temporary preflight trouble must not prevent saving a resumable job.
    // The workflow performs the same check with durable backoff.
    if (!info || !["rate_limit", "network", "timeout", "unavailable"].includes(info.kind)) throw new ConvexError(providerFailureMessage(String(error)) || failureReason(error));
  }
  return null;
} });

export const authorizeLessonProviderCheck = internalMutation({ args: { token: v.string(), jobId: v.id("jobs") }, returns: generationProvider, handler: async (ctx, args) => {
  const session = await requireSession(ctx, args.token, Date.now());
  const job = await ctx.db.get(args.jobId);
  if (!job || job.sessionId !== session._id) throw new ConvexError("Lesson not found");
  const provider = job.generationProvider ?? "nim";
  if (!reviewReady(provider)) throw new ConvexError(provider === "openai" ? PROVIDER_MESSAGES.missingKey : "The review service is awaiting setup. Your draft remains saved.");
  if (!(await limits.limit(ctx, "providerChecks", { key: session._id })).ok || !(await limits.limit(ctx, "allProviderChecks")).ok) throw new ConvexError("Too many provider checks. Please try again later.");
  return provider;
} });

export const checkLessonProvider = action({ args: { token: v.string(), jobId: v.id("jobs") }, returns: v.null(), handler: async (ctx, args) => {
  const provider = await ctx.runMutation(internal.generation.authorizeLessonProviderCheck, args);
  try { await verifyProvider(provider); }
  catch (error) { throw new ConvexError(providerFailureMessage(String(error)) || failureReason(error)); }
  return null;
} });

export const verifyProviderForJob = internalAction({ args: { jobId: v.id("jobs"), runId: v.optional(v.string()) }, returns: v.null(), handler: async (ctx, args) => {
  const { job } = await ctx.runQuery(internal.generation.context, args);
  await verifyProvider(job.generationProvider ?? "nim");
  return null;
} });

// Authenticated operator-only canary: exercise the real deployment before
// opening public generation. This never bypasses provider or content checks.
export const startCanary = internalMutation({ args: { jobId: v.id("jobs") }, returns: v.null(), handler: async (ctx, { jobId }) => {
  const job = await ctx.db.get(jobId);
  if (!job || !["queued", "failed"].includes(job.status)) throw new ConvexError("Canary needs a queued brief or failed pre-render plan");
  const artifacts = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", jobId)).take(14);
  if (artifacts.some(a => a.stage !== "research")) throw new ConvexError("Canary cannot replace a rendered project");
  if (!await generationReady(ctx, true, job.generationProvider)) throw new ConvexError("Canary providers must be qualified");
  await ctx.db.patch(jobId, { generation: true, status: "researching", stageMessage: "Finding sources for your question", updatedAt: Date.now() });
  const workflowId = await start(ctx, internal.generationRetry.run, { jobId }, { onComplete: internal.generation.finished, context: { jobId }, startAsync: true });
  await ctx.db.patch(jobId, { workflowId, generationRunId: String(workflowId), recovery: undefined });
  await ctx.db.insert("jobEvents", { jobId, kind: "operator_canary", message: "Operator started release acceptance with public generation still gated", createdAt: Date.now() });
  return null;
} });

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

// The authenticated recovery endpoint also uses this checkpoint-preserving start.
export const resumePlanning = internalMutation({ args: { jobId: v.id("jobs") }, returns: v.null(), handler: async (ctx, { jobId }) => {
  const job = await ctx.db.get(jobId);
  if (!job?.generation || job.status !== "failed") throw new ConvexError("Only failed generation can resume");
  if ((job.recovery?.nextRetryAt || 0) > Date.now()) throw new ConvexError("The provider requested a cooldown. Resume after the displayed retry time.");
  const artifacts = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", jobId)).take(14);
  const media = await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", jobId)).first();
  if (media || artifacts.some(a => !["research", "plan", "base", "project"].includes(a.stage) && !a.stage.startsWith("visual-"))) throw new ConvexError("Only a failed pre-render plan can resume");
  const state = await generationAvailability(ctx, job.generationProvider, true, new Set(artifacts.map(a => a.stage)));
  if (!state.enabled) throw new ConvexError(state.message);
  await ctx.db.patch(jobId, { status: "planning", stageMessage: artifacts.some(a => a.stage === "base") ? "Continuing visual direction using saved scenes" : artifacts.length ? "Retrying the lesson plan using saved research" : "Retrying research for this lesson", updatedAt: Date.now() });
  const workflowId = await start(ctx, internal.generationRetry.run, { jobId }, { onComplete: internal.generation.finished, context: { jobId }, startAsync: true });
  await ctx.db.patch(jobId, { workflowId, generationRunId: String(workflowId), recovery: undefined });
  await ctx.db.insert("jobEvents", { jobId, kind: "planning_retry", message: "Planning resumed using saved research, script and directed scenes", createdAt: Date.now() });
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
    const state = await generationAvailability(ctx, job.generationProvider);
    if (!state.enabled) throw new ConvexError(state.message);
    const active = await Promise.all(["researching", "planning", "rendering", "reviewing"].map(status => ctx.db.query("jobs").withIndex("by_status", q => q.eq("status", status as "researching" | "planning" | "rendering" | "reviewing")).take(5)));
    if (active.flat().length >= 5) throw new ConvexError("Generation queue is full. Try again later");
    await ctx.db.patch(jobId, { generation: true, status: "researching", stageMessage: "Finding sources for your question", updatedAt: Date.now() });
    const workflowId = await start(ctx, internal.generationRetry.run, { jobId }, { onComplete: internal.generation.finished, context: { jobId }, startAsync: true });
    await ctx.db.patch(jobId, { workflowId, generationRunId: String(workflowId), recovery: undefined });
    return null;
  },
});

export const context = internalQuery({ args: { jobId: v.id("jobs"), runId: v.optional(v.string()) }, handler: async (ctx, { jobId, runId }) => {
  const job = await ctx.db.get(jobId);
  if (!job || !job.generation || !["researching", "planning"].includes(job.status)) throw new ConvexError("Generation no longer active");
  if (job.generationRunId && job.generationRunId !== runId) throw new ConvexError("Generation attempt was superseded");
  const artifacts = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", jobId)).take(14);
  return { job, artifacts };
} });

export const checkpoint = internalMutation({ args: { jobId: v.id("jobs"), runId: v.optional(v.string()), stage: v.string(), json: v.string() }, handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  if (!job || !job.generation || !["researching", "planning"].includes(job.status)) throw new ConvexError("Generation no longer active");
  if (job.generationRunId && job.generationRunId !== args.runId) throw new ConvexError("Generation attempt was superseded");
  if (args.json.length > 100_000) throw new ConvexError("Artifact too large");
  let visualNarration: string | undefined;
  if (!["research", "plan", "base", "project"].includes(args.stage)) {
    if (!args.stage.startsWith("visual-")) throw new ConvexError("Unsupported checkpoint stage");
    const base = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", args.jobId).eq("stage", "base")).unique();
    const sceneId = args.stage.slice(7), record = JSON.parse(args.json);
    const scene = base ? projectSchema.parse(JSON.parse(base.json).project).scenes.find(s => s.id === sceneId) : undefined;
    if (!scene || record.sceneId !== sceneId) throw new ConvexError("Unknown directed scene checkpoint");
    const media = await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", args.jobId)).first();
    if (job.revision !== 1 || media) throw new ConvexError("Visual checkpoints are only for active pre-render planning");
    validateDirectedPlan(record.visualPlan, scene.narration);
    visualNarration = scene.narration;
  }
  const previous = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", args.jobId).eq("stage", args.stage)).unique();
  if (previous) {
    if (!visualNarration) return null;
    try { validateDirectedPlan(JSON.parse(previous.json).visualPlan, visualNarration); return null; }
    catch { /* Superseded validators may reject an older pre-render cache. */ }
    const old = JSON.parse(previous.json) as { attempts?: Attempt[] }, next = JSON.parse(args.json);
    const json = JSON.stringify({ ...next, attempts: [...(Array.isArray(old.attempts) ? old.attempts : []).map(attempt => ({ ...attempt, ...(attempt.outcome === "success" ? { outcome: "superseded-invalid-plan" } : {}) })), ...next.attempts] });
    if (json.length > 100_000) throw new ConvexError("Artifact too large");
    await ctx.db.patch(previous._id, { json, createdAt: Date.now() });
    await ctx.db.insert("jobEvents", { jobId: args.jobId, kind: "director_refresh", message: "Replaced an outdated invalid scene plan while preserving valid saved scenes and inference provenance", createdAt: Date.now() });
  } else await ctx.db.insert("generationArtifacts", { jobId: args.jobId, stage: args.stage, json: args.json, createdAt: Date.now() });
  const message = args.stage === "research" ? "Sources found. Writing and checking the lesson" : args.stage === "plan" ? "Choosing illustrations for each scene" : args.stage === "base" ? "Directing the illustrated actions in each scene" : args.stage.startsWith("visual-") ? "An illustrated scene is directed and saved" : "Scene plan ready for narration and animation";
  await ctx.db.patch(args.jobId, { status: "planning", stageMessage: message, updatedAt: Date.now() });
  await ctx.db.insert("jobEvents", { jobId: args.jobId, kind: args.stage, message, createdAt: Date.now() });
  return null;
} });

export const enqueue = internalMutation({ args: { jobId: v.id("jobs"), runId: v.optional(v.string()) }, handler: async (ctx, { jobId, runId }) => {
  const job = await ctx.db.get(jobId);
  if (!job || !job.generation || job.status === "cancelled") return null;
  if (job.generationRunId && job.generationRunId !== runId) throw new ConvexError("Generation attempt was superseded");
  const existing = await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", jobId)).unique();
  if (existing) return null;
  if (job.status !== "planning") throw new ConvexError("Generation no longer active");
  const artifact = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", jobId).eq("stage", "project")).unique();
  if (!artifact) throw new ConvexError("Missing project checkpoint");
  const data = JSON.parse(artifact.json) as { project: unknown; provenance: unknown };
  const project = projectSchema.parse(data.project);
  await ctx.db.insert("mediaTasks", { jobId, fixtureVersion: "generated-v1", projectJson: JSON.stringify(project), provenanceJson: JSON.stringify(data.provenance), status: "queued", attempt: 0, leaseUntil: 0, createdAt: Date.now() });
  await ctx.db.patch(jobId, { status: "rendering", stageMessage: "Your lesson is queued for narration and animation", recovery: undefined, updatedAt: Date.now() });
  return null;
} });

export const finished = internalMutation({ args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ jobId: v.id("jobs") }) }, handler: async (ctx, args) => {
  const job = await ctx.db.get(args.context.jobId);
  if (!job || job.workflowId !== args.workflowId || !["researching", "planning"].includes(job.status)) return null;
  if (args.result.kind !== "success") {
    const error = args.result.kind === "failed" ? args.result.error : "";
    const providerUnavailable = /request failed|timed out|timeout/i.test(error);
    const reason = providerFailureMessage(error) ?? (providerUnavailable ? "An AI or research service could not respond. Saved research is retained; retry later if available below." : "Planning could not produce a supported lesson. Try a clearer science or everyday-mechanism question.");
    await ctx.db.patch(job._id, { status: "failed", stageMessage: reason, recovery: job.recovery ? { ...job.recovery, state: "failed", reason, nextRetryAt: undefined, updatedAt: Date.now() } : undefined, updatedAt: Date.now() });
    await ctx.db.insert("jobEvents", { jobId: job._id, kind: "failed", message: "Generation workflow stopped before rendering", createdAt: Date.now() });
  }
  return null;
} });

export const details = query({ args: { token: v.string(), jobId: v.id("jobs") }, handler: async (ctx, { token, jobId }) => {
  const session = await requireSession(ctx, token);
  const job = await ctx.db.get(jobId);
  if (!job || job.sessionId !== session._id) return null;
  const artifacts = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", jobId)).take(14);
  const source = artifacts.find(a => a.stage === "research");
  const sources = source ? (JSON.parse(source.json) as { sources: { id: string; title: string; url: string }[] }).sources.map(({ id, title, url }) => ({ id, title, url })) : [];
  const media = job.status === "failed" ? await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", jobId)).first() : null;
  return { generated: Boolean(job.generation), stages: artifacts.map(a => a.stage), sources, canRetry: job.status === "failed" && !media && artifacts.every(a => ["research", "plan", "base"].includes(a.stage) || a.stage.startsWith("visual-")) && (job.planningRetries || 0) < 1 };
} });
