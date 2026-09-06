import { v } from "convex/values";
import { workflow } from "./generation";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { failureReason, retryDelay, MAX_PROVIDER_ATTEMPTS } from "../packages/contracts/retry";
import { providerFailureMessage } from "../packages/contracts/provider";

// A new journal definition leaves already running legacy workflows replayable.
export const run = workflow.define({ args: { jobId: v.id("jobs") }, returns: v.null() }).handler(async (step, { jobId }): Promise<null> => {
  const args = { jobId, runId: String(step.workflowId) };
  const initial = await step.runQuery(internal.generation.context, args);
  const saved = new Set(initial.artifacts.map(a => a.stage));
  async function execute(stage: string, operation: () => Promise<unknown>): Promise<boolean> {
    for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt++) {
      if (!await step.runMutation(internal.generationRetry.started, { ...args, stage, attempt })) return false;
      try { await operation(); return true; }
      catch (error) {
        const delay: number | null = await step.runMutation(internal.generationRetry.failedAttempt, { ...args, stage, attempt, error: String(error).slice(0, 12_000) });
        if (delay === null) return false;
        await step.sleep(delay, { name: `${stage}: backoff before attempt ${attempt + 1}` });
      }
    }
    return false;
  }
  if (!saved.has("project")) {
    if (!await execute("Model access", () => step.runAction(internal.generation.verifyProviderForJob, args, { retry: false }))) return null;
    if (!saved.has("research") && !await execute("Research", () => step.runAction(internal.planning.researchTopic, args, { retry: false }))) return null;
    if (!saved.has("plan") && !await execute("Script planning", () => step.runAction(internal.planning.planScenes, args, { retry: false }))) return null;
    if (!saved.has("base") && !await execute("Illustration selection", () => step.runAction(internal.planning.retrieveIcons, args, { retry: false }))) return null;
    const sceneIds: string[] = await step.runQuery(internal.planning.directorSceneIds, args);
    for (const sceneId of sceneIds) {
      // directScene verifies cached plans and refreshes only invalid checkpoints.
      if (!await execute(`Visual direction · ${sceneId}`, () => step.runAction(internal.planning.directScene, { ...args, sceneId }, { retry: false }))) return null;
    }
    if (!await execute("Prepare video", () => step.runAction(internal.planning.finalizeProject, args, { retry: false }))) return null;
  }
  await step.runMutation(internal.generation.enqueue, args);
  return null;
});

const stateArgs = { jobId: v.id("jobs"), runId: v.string(), stage: v.string(), attempt: v.number() };
export const started = internalMutation({ args: stateArgs, returns: v.boolean(), handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  if (!job || job.generationRunId !== args.runId || !["researching", "planning"].includes(job.status)) return false;
  if (!Number.isInteger(args.attempt) || args.attempt < 1 || args.attempt > MAX_PROVIDER_ATTEMPTS || args.stage.length > 120) throw new Error("Invalid retry state");
  const now = Date.now();
  await ctx.db.patch(job._id, { recovery: { runId: args.runId, stage: args.stage, state: "running", attempt: args.attempt, maxAttempts: MAX_PROVIDER_ATTEMPTS, updatedAt: now, ...(args.attempt > 1 && job.recovery?.reason ? { reason: job.recovery.reason } : {}) }, stageMessage: `${args.stage}${args.attempt > 1 ? ` · attempt ${args.attempt} of ${MAX_PROVIDER_ATTEMPTS}` : ""}. Saved progress is retained.`, updatedAt: now });
  return true;
} });

export const failedAttempt = internalMutation({ args: { ...stateArgs, error: v.string() }, returns: v.union(v.null(), v.number()), handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  if (!job || job.generationRunId !== args.runId || !["researching", "planning"].includes(job.status) || job.recovery?.stage !== args.stage || job.recovery.attempt !== args.attempt) return null;
  const now = Date.now(), decision = retryDelay(args.error, args.attempt, Math.random, now);
  const reason = providerFailureMessage(args.error) ?? failureReason(args.error);
  const nextRetryAt = decision.delayMs > 0 ? now + decision.delayMs : undefined;
  const message = decision.retry ? `${args.stage}: ${reason} Retrying automatically in ${Math.ceil(decision.delayMs / 1000)}s (attempt ${args.attempt + 1} of ${MAX_PROVIDER_ATTEMPTS}).` : `${args.stage}: ${reason}${decision.reason === "attempt-limit" ? ` All ${MAX_PROVIDER_ATTEMPTS} automatic attempts were used.` : ""} Saved progress is retained.`;
  await ctx.db.patch(job._id, { ...(decision.retry ? {} : { status: "failed" as const }), stageMessage: message, recovery: { runId: args.runId, stage: args.stage, state: decision.retry ? "waiting" : "failed", attempt: args.attempt, maxAttempts: MAX_PROVIDER_ATTEMPTS, reason, ...(nextRetryAt === undefined ? {} : { nextRetryAt }), updatedAt: now }, updatedAt: now });
  await ctx.db.insert("jobEvents", { jobId: job._id, kind: decision.retry ? (args.stage.startsWith("Visual direction") ? "director_retry" : "provider_retry") : "failed", message, createdAt: now });
  return decision.retry ? decision.delayMs : null;
} });
