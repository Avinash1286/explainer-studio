import { v } from "convex/values";
import { z } from "zod";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { projectSchema, type TimedScene } from "../packages/contracts/scene";
import { frameSamples } from "../packages/contracts/review";
import { researchSchema } from "../packages/contracts/generation";
import { inspectFrames } from "./lib/critic";
import { inspectFacts, combineReviews } from "./lib/factCheck";
import { validateReview } from "../packages/contracts/review";
import { repairScenes } from "./lib/repair";
import { providerConfig } from "./lib/generationConfig";

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
  const timed = z.array(z.object({ id: z.string(), startFrame: z.number().int().nonnegative(), durationInFrames: z.number().int().positive() })).parse(rendered.scenes);
  let cursor = 0;
  for (const scene of timed) { if (scene.startFrame !== cursor) throw new Error("Invalid scene timeline"); cursor += scene.durationInFrames; }
  if (cursor !== Math.round(result.durationSeconds * 24)) throw new Error("Invalid rendered duration");
  const samples = frameSamples(timed as TimedScene[]);
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
  const facts = await inspectFacts(providerConfig(), project, sources);
  const review = await inspectFrames(providerConfig(), project, sources, frames);
  const combined = combineReviews(validateReview(JSON.parse(review.reportJson), project), facts.data);
  await ctx.runMutation(internal.reviews.commit, { ...args, ...review, reportJson: JSON.stringify(combined), usageJson: JSON.stringify({ visual: JSON.parse(review.usageJson), factualAttempts: facts.attempts }) });
  return null;
} });

export const rewrite = internalAction({ args: { requestId: v.id("revisionRequests") }, returns: v.null(), handler: async (ctx, args) => {
  const current = await ctx.runQuery(internal.reviews.repairContext, args);
  if (!current) return null;
  const previous = projectSchema.parse(JSON.parse(current.task.projectJson!));
  const sources = researchSchema.parse(JSON.parse(current.research).sources);
  const result = await repairScenes(providerConfig(), previous, sources, current.request.sceneIds, current.request.instruction);
  await ctx.runMutation(internal.reviews.replace, { ...args, projectJson: JSON.stringify(result.data.project), evidenceJson: JSON.stringify(result.data.evidence), attemptsJson: JSON.stringify(result.attempts) });
  return null;
} });
