import { ConvexError, v } from "convex/values";
import { query, mutation, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { requireSession } from "./lib/session";
import { limits } from "./lib/limits";
import { generationAvailability, reviewReady } from "./lib/generationConfig";
import { PROVIDER_MESSAGES } from "../packages/contracts/provider";
import { projectSchema } from "../packages/contracts/scene";

type ResumeKind = "planning" | "rendering" | "review" | "repair";
async function checkpointState(ctx: QueryCtx, job: Doc<"jobs">) {
  const artifacts = await ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", job._id)).take(14);
  const task = await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", job._id)).unique();
  const review = await ctx.db.query("lessonReviews").withIndex("by_jobId_and_revision", q => q.eq("jobId", job._id).eq("revision", job.revision)).unique();
  const requests = await ctx.db.query("revisionRequests").withIndex("by_jobId_and_requestId", q => q.eq("jobId", job._id)).take(10);
  const failedRequests = requests.filter(r => r.fromRevision === job.revision && r.status === "failed");
  const failedRepair = job.recovery?.stage === "review" ? undefined : job.recovery?.stage === "repair"
    ? failedRequests.find(r => r.runId === job.recovery?.runId)
    : failedRequests.sort((a, b) => b._creationTime - a._creationTime)[0];
  const savedCheckpoints: string[] = [];
  const stages = new Set(artifacts.map(a => a.stage));
  if (stages.has("research")) savedCheckpoints.push("Research and sources");
  if (stages.has("plan")) savedCheckpoints.push("Narration script");
  const directed = artifacts.filter(a => a.stage.startsWith("visual-"));
  if (directed.length) savedCheckpoints.push(`${directed.length} illustrated scene${directed.length === 1 ? "" : "s"}`);
  if (stages.has("project") || task?.projectJson) savedCheckpoints.push("Render project");
  if (task?.result) savedCheckpoints.push("Rendered video and captions");
  const reviewed = await ctx.db.query("reviewCheckpoints").withIndex("by_jobId_and_revision", q => q.eq("jobId", job._id).eq("revision", job.revision)).take(11);
  if (reviewed.some(r => r.kind === "facts")) savedCheckpoints.push("Factual review");
  const frames = reviewed.filter(r => r.kind === "scene").length;
  if (frames) savedCheckpoints.push(`${frames} scene review${frames === 1 ? "" : "s"}`);
  let kind: ResumeKind | null = null, resumeFrom: string | null = null;
  if (task?.result && failedRepair) {
    kind = "repair"; resumeFrom = "The saved scene edit";
    const edits = await ctx.db.query("repairCheckpoints").withIndex("by_requestId_and_stage", q => q.eq("requestId", failedRepair._id)).take(10);
    if (edits.length) savedCheckpoints.push(`${edits.length} saved edit checkpoint${edits.length === 1 ? "" : "s"}`);
  } else if (task?.result && review?.status === "unavailable") {
    kind = "review"; resumeFrom = reviewed.some(r => r.kind === "facts") ? "The next unfinished scene review" : "Review of the saved video";
  } else if (task?.status === "failed" && !task.result) {
    kind = "rendering"; resumeFrom = "Rendering the saved lesson project";
  } else if (job.generation && !task && artifacts.every(a => ["research", "plan", "base", "project"].includes(a.stage) || a.stage.startsWith("visual-"))) {
    kind = "planning";
    resumeFrom = stages.has("project") ? "The saved render project" : stages.has("base") ? "The next unfinished illustrated scene" : stages.has("plan") ? "Illustration selection" : stages.has("research") ? "Script planning using saved research" : "Research for the saved question";
    if (stages.has("base") && !stages.has("project")) {
      const base = artifacts.find(a => a.stage === "base");
      try {
        const project = base ? projectSchema.safeParse(JSON.parse(base.json).project) : null;
        const next = project?.success ? project.data.scenes.find(s => !stages.has(`visual-${s.id}`)) : null;
        if (next) resumeFrom = `Visual direction · ${next.title}`;
      } catch { /* A damaged checkpoint must not hide the failure controls. */ }
    }
  }
  let blockedReason: string | null = null;
  if (job.status === "failed") {
    if (!kind) blockedReason = review?.status === "rejected" ? "This draft needs a scene edit to address its review findings." : "No recoverable checkpoint is available for this failure.";
    else if (kind === "planning") { const availability = await generationAvailability(ctx, job.generationProvider, true, stages); if (!availability.enabled) blockedReason = availability.message; }
    else if ((kind === "review" || kind === "repair") && !reviewReady(job.generationProvider)) blockedReason = job.generationProvider === "openai" ? PROVIDER_MESSAGES.missingKey : "Set up the review provider before resuming this lesson.";
  }
  return { kind, resumeFrom, blockedReason, savedCheckpoints };
}

export const details = query({ args: { token: v.string(), jobId: v.id("jobs") }, returns: v.union(v.null(), v.object({ identity: v.string(), state: v.union(v.literal("waiting"), v.literal("failed"), v.literal("running")), stage: v.string(), reason: v.union(v.string(), v.null()), attempt: v.number(), maxAttempts: v.number(), nextRetryAt: v.union(v.number(), v.null()), canResume: v.boolean(), resumeFrom: v.union(v.string(), v.null()), blockedReason: v.union(v.string(), v.null()), savedCheckpoints: v.array(v.string()), resumeAvailableAt: v.union(v.number(), v.null()) })), handler: async (ctx, args) => {
  const session = await requireSession(ctx, args.token);
  const job = await ctx.db.get(args.jobId);
  if (!job || job.sessionId !== session._id || ["completed", "cancelled", "queued"].includes(job.status)) return null;
  if (job.status !== "failed" && !job.recovery) return null;
  const state = await checkpointState(ctx, job);
  const recovery = job.recovery;
  return { identity: `${job._id}:${job.revision}:${recovery?.updatedAt ?? job.updatedAt}`, state: job.status === "failed" ? "failed" as const : recovery?.state ?? "running" as const, stage: recovery?.stage ?? (state.kind === "repair" ? "Scene edit" : state.kind === "review" ? "Review" : state.kind === "rendering" ? "Rendering" : "Generation"), reason: recovery?.reason ?? (job.status === "failed" ? job.stageMessage : null), attempt: recovery?.attempt ?? 0, maxAttempts: recovery?.maxAttempts ?? 0, nextRetryAt: recovery?.nextRetryAt ?? null, canResume: job.status === "failed" && state.kind !== null && !state.blockedReason, resumeFrom: state.resumeFrom, blockedReason: state.blockedReason, savedCheckpoints: state.savedCheckpoints, resumeAvailableAt: job.status === "failed" ? Math.max(recovery?.nextRetryAt ?? 0, job.lastResumedAt ? job.lastResumedAt + 60_000 : 0) || null : null };
} });

export const resume = mutation({ args: { token: v.string(), jobId: v.id("jobs"), requestId: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const session = await requireSession(ctx, args.token, Date.now());
  const job = await ctx.db.get(args.jobId);
  if (!job || job.sessionId !== session._id) throw new ConvexError("Lesson not found");
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(args.requestId)) throw new ConvexError("Invalid resume request");
  const previous = await ctx.db.query("jobResumes").withIndex("by_jobId_and_requestId", q => q.eq("jobId", job._id).eq("requestId", args.requestId)).unique();
  if (previous) return null;
  if (job.status !== "failed") {
    if (["researching", "planning", "rendering", "reviewing"].includes(job.status)) return null;
    throw new ConvexError("Only a failed lesson can be resumed");
  }
  const state = await checkpointState(ctx, job);
  if (!state.kind || state.blockedReason) throw new ConvexError(state.blockedReason || "No recoverable checkpoint is available");
  const now = Date.now(), availableAt = Math.max(job.recovery?.nextRetryAt ?? 0, job.lastResumedAt ? job.lastResumedAt + 60_000 : 0);
  if (availableAt > now) throw new ConvexError(`Please wait ${Math.ceil((availableAt - now) / 1000)} seconds before resuming. Your saved progress is retained.`);
  const sessionLimit = await limits.limit(ctx, "lessonResumes", { key: session._id });
  if (!sessionLimit.ok) throw new ConvexError("Resume limit reached: up to five resumes per hour. Your saved progress is retained.");
  if (!(await limits.limit(ctx, "allLessonResumes")).ok) throw new ConvexError("Recovery capacity is busy. Please try again later; your saved progress is retained.");
  const active = await Promise.all((["researching", "planning", "rendering", "reviewing"] as const).map(status => ctx.db.query("jobs").withIndex("by_status", q => q.eq("status", status)).take(5)));
  if (active.flat().length >= 5) throw new ConvexError("Generation queue is full. Please try again later.");
  if (state.kind === "planning") await ctx.runMutation(internal.generation.resumePlanning, { jobId: job._id });
  else if (state.kind === "rendering") await ctx.runMutation(internal.media.resumeSaved, { jobId: job._id });
  else if (!await ctx.runMutation(internal.reviews.resumeFailed, { jobId: job._id, revision: job.revision })) throw new ConvexError("This checkpoint can no longer be resumed");
  await ctx.db.patch(job._id, { resumeCount: (job.resumeCount ?? 0) + 1, lastResumedAt: now });
  await ctx.db.insert("jobResumes", { jobId: job._id, requestId: args.requestId, revision: job.revision, createdAt: now });
  await ctx.db.insert("jobEvents", { jobId: job._id, kind: "owner_resume", message: `Resumed from saved progress: ${state.resumeFrom}`, createdAt: now });
  return null;
} });
