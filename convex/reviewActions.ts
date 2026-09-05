import { v } from "convex/values";
import { z } from "zod";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { projectSchema, FPS, type Project } from "../packages/contracts/scene";
import { compileVisualTiming } from "../packages/contracts/visual";
import { frameSamples } from "../packages/contracts/review";
import { researchSchema } from "../packages/contracts/generation";
import { inspectFrames } from "./lib/critic";
import { inspectFacts, combineReviews } from "./lib/factCheck";
import { validateReview } from "../packages/contracts/review";
import { repairScenes } from "./lib/repair";
import { providerConfig } from "./lib/generationConfig";

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

export const inspect = internalAction({ args: { jobId: v.id("jobs"), revision: v.number() }, returns: v.null(), handler: async (ctx, args) => {
  const current = await ctx.runQuery(internal.reviews.context, args);
  if (!current) return null;
  const project = projectSchema.parse(JSON.parse(current.task.projectJson!));
  const sources = researchSchema.parse(JSON.parse(current.research).sources);
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
    const bytes = new Uint8Array(await image.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    // Workers AI requires inline image bytes for this route. Sending storage
    // URLs was rejected in live qualification; never omit the images to retry.
    frames.push({ ...sample, url: `data:image/jpeg;base64,${btoa(binary)}` });
  }
  const config = providerConfig(current.job.generationProvider);
  const facts = await inspectFacts(config, project, sources);
  const review = await inspectFrames(config, project, sources, frames);
  const combined = combineReviews(validateReview(JSON.parse(review.reportJson), project), facts.data);
  await ctx.runMutation(internal.reviews.commit, { ...args, ...review, reportJson: JSON.stringify(combined), usageJson: JSON.stringify({ visual: JSON.parse(review.usageJson), factualAttempts: facts.attempts }) });
  return null;
} });

export const rewrite = internalAction({ args: { requestId: v.id("revisionRequests") }, returns: v.null(), handler: async (ctx, args) => {
  const current = await ctx.runQuery(internal.reviews.repairContext, args);
  if (!current) return null;
  const previous = projectSchema.parse(JSON.parse(current.task.projectJson!));
  const sources = researchSchema.parse(JSON.parse(current.research).sources);
  const result = await repairScenes(providerConfig(current.job.generationProvider), previous, sources, current.request.sceneIds, current.request.instruction);
  await ctx.runMutation(internal.reviews.replace, { ...args, projectJson: JSON.stringify(result.data.project), evidenceJson: JSON.stringify(result.data.evidence), attemptsJson: JSON.stringify(result.attempts) });
  return null;
} });
