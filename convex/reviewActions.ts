import { v } from "convex/values";
import { z } from "zod";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { projectSchema, FPS, type Project } from "../packages/contracts/scene";
import { compileVisualTiming } from "../packages/contracts/visual";
import { frameSamples } from "../packages/contracts/review";
import { researchSchema } from "../packages/contracts/generation";
import { inspectSceneFrames } from "./lib/critic";
import { inspectFacts } from "./lib/factCheck";
import { repairScenes } from "./lib/repair";
import { providerConfig } from "./lib/generationConfig";
import { reviewScope } from "./lib/reviewCheckpoint";

/** Reconstruct sampling from validated narration alignment, never a worker's
 * unchecked visualTiming map that could hide the actual action frames. */
export function renderedReviewSamples(project: Project, value: unknown, durationSeconds: number) {
  const timed = z.array(z.object({
    id: z.string(), startFrame: z.number().int().nonnegative(), durationInFrames: z.number().int().positive(),
    words: z.array(z.object({ text: z.string().min(1).max(160), start: z.number().nonnegative(), end: z.number().nonnegative() })).max(600).optional(),
  })).length(project.scenes.length).parse(value);
  let cursor = 0;
  const tokenText = (text: string) => (text.toLowerCase().match(/[a-z0-9]+/g) || []).join(" ");
  const scenes = timed.map((timing, index) => {
    const scene = project.scenes[index];
    if (timing.id !== scene.id || timing.startFrame !== cursor) throw new Error("Invalid scene timeline");
    cursor += timing.durationInFrames;
    if (!scene.visualPlan) return timing;
    if (!timing.words?.length) throw new Error("Missing rendered narration timing");
    const spoken = timing.words;
    if (spoken.some((word, i) => word.end < word.start || word.end > timing.durationInFrames / FPS || (i > 0 && word.start < spoken[i - 1].start))) throw new Error("Invalid rendered narration timing");
    if (tokenText(spoken.map(word => word.text).join(" ")) !== tokenText(scene.narration)) throw new Error("Rendered word timing does not match narration");
    return { ...timing, visualPlan: scene.visualPlan, visualTiming: compileVisualTiming(scene.visualPlan, spoken, timing.durationInFrames, FPS) };
  });
  if (cursor !== Math.round(durationSeconds * FPS)) throw new Error("Invalid rendered duration");
  return frameSamples(scenes);
}

const versionArgs = { jobId: v.id("jobs"), revision: v.number() };

// Validate the whole rendered artifact once, before any model call. Checkpoints
// bind these immutable storage objects and the requested inputs to the revision.
export const prepare = internalAction({ args: versionArgs, returns: v.null(), handler: async (ctx, args): Promise<null> => {
  const state = await ctx.runQuery(internal.reviews.checkpointContext, args);
  if (!state || state.evidence) return null;
  const current = state.current;
  const project = projectSchema.parse(JSON.parse(current.task.projectJson!));
  const result = current.task.result!;
  const blob = await ctx.storage.get(result.project);
  if (!blob || blob.size > 500_000) throw new Error("Missing rendered project");
  const rendered = JSON.parse(await blob.text());
  if (JSON.stringify(projectSchema.parse(rendered)) !== JSON.stringify(project)) throw new Error("Rendered project does not match requested version");
  const samples = renderedReviewSamples(project, rendered.scenes, result.durationSeconds);
  if (result.frames?.length !== samples.length) throw new Error("Missing frame evidence");
  const frames = [];
  let imageBytes = 0;
  for (const sample of samples) {
    const frame = result.frames!.find(f => f.sceneId === sample.sceneId && f.frame === sample.frame);
    const image = frame ? await ctx.storage.get(frame.storageId) : null;
    if (!image || image.type !== "image/jpeg" || image.size > 2_000_000) throw new Error("Missing frame evidence");
    imageBytes += image.size;
    if (imageBytes > 8_000_000) throw new Error("Frame evidence exceeds review budget");
    frames.push(frame!);
  }
  await ctx.runMutation(internal.reviews.saveEvidence, { ...args, scopeJson: reviewScope(current), json: JSON.stringify({ samples: frames, totalImageBytes: imageBytes }) });
  return null;
} });

export const checkFacts = internalAction({ args: versionArgs, returns: v.null(), handler: async (ctx, args): Promise<null> => {
  const state = await ctx.runQuery(internal.reviews.checkpointContext, args);
  if (!state) return null;
  if (!state.evidence) throw new Error("Missing prepared review evidence");
  if (state.checkpoints.some(checkpoint => checkpoint.kind === "facts" && checkpoint.sceneId === "")) return null;
  const project = projectSchema.parse(JSON.parse(state.current.task.projectJson!));
  const sources = researchSchema.parse(JSON.parse(state.current.research).sources);
  const facts = await inspectFacts(providerConfig(state.current.job.generationProvider), project, sources);
  await ctx.runMutation(internal.reviews.saveCheckpoint, { ...args, kind: "facts", sceneId: "", evidenceId: state.evidence._id, json: JSON.stringify({ data: facts.data, attempts: facts.attempts }) });
  return null;
} });

export const checkScene = internalAction({ args: { ...versionArgs, sceneId: v.string() }, returns: v.null(), handler: async (ctx, args): Promise<null> => {
  const version = { jobId: args.jobId, revision: args.revision };
  const state = await ctx.runQuery(internal.reviews.checkpointContext, version);
  if (!state) return null;
  if (!state.evidence) throw new Error("Missing prepared review evidence");
  const project = projectSchema.parse(JSON.parse(state.current.task.projectJson!));
  if (!project.scenes.some(scene => scene.id === args.sceneId)) throw new Error("Foreign review scene");
  if (state.checkpoints.some(checkpoint => checkpoint.kind === "scene" && checkpoint.sceneId === args.sceneId)) return null;
  const sources = researchSchema.parse(JSON.parse(state.current.research).sources);
  const prepared = JSON.parse(state.evidence.json) as { samples: { sceneId: string; frame: number; storageId: string }[] };
  const frames = [];
  for (const sample of prepared.samples.filter(sample => sample.sceneId === args.sceneId)) {
    const frame = state.current.task.result!.frames!.find(frame => frame.sceneId === sample.sceneId && frame.frame === sample.frame && frame.storageId === sample.storageId);
    const image = frame ? await ctx.storage.get(frame.storageId) : null;
    if (!image || image.type !== "image/jpeg" || image.size > 2_000_000) throw new Error("Missing frame evidence");
    const bytes = new Uint8Array(await image.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    // Workers AI requires inline image bytes for this route. Sending storage
    // URLs was rejected in live qualification; never omit the images to retry.
    frames.push({ sceneId: sample.sceneId, frame: sample.frame, url: `data:image/jpeg;base64,${btoa(binary)}` });
  }
  const result = await inspectSceneFrames(providerConfig(state.current.job.generationProvider), project, sources, args.sceneId, frames);
  await ctx.runMutation(internal.reviews.saveCheckpoint, { ...args, kind: "scene", evidenceId: state.evidence._id, json: JSON.stringify(result) });
  return null;
} });

// Compatibility entry point for old workflow journals and internal callers.
// Even its retries reuse persisted work. New workflows schedule these bounded
// actions individually so their execution deadlines do not accumulate.
export const inspect = internalAction({ args: versionArgs, returns: v.null(), handler: async (ctx, args): Promise<null> => {
  await ctx.runAction(internal.reviewActions.prepare, args);
  const scenes = await ctx.runQuery(internal.reviews.reviewPlan, args);
  if (!scenes) return null;
  await ctx.runAction(internal.reviewActions.checkFacts, args);
  for (const sceneId of scenes) await ctx.runAction(internal.reviewActions.checkScene, { ...args, sceneId });
  await ctx.runMutation(internal.reviews.assemble, args);
  return null;
} });

export const rewrite = internalAction({ args: { requestId: v.id("revisionRequests") }, returns: v.null(), handler: async (ctx, args) => {
  const current = await ctx.runQuery(internal.reviews.repairContext, args);
  if (!current) return null;
  const previous = projectSchema.parse(JSON.parse(current.task.projectJson!));
  const sources = researchSchema.parse(JSON.parse(current.research).sources);
  const result = await repairScenes(providerConfig(current.job.generationProvider), previous, sources, current.request.sceneIds, current.request.instruction, fetch, current.reviewContext);
  await ctx.runMutation(internal.reviews.replace, { ...args, projectJson: JSON.stringify(result.data.project), evidenceJson: JSON.stringify(result.data.evidence), attemptsJson: JSON.stringify(result.attempts) });
  return null;
} });
