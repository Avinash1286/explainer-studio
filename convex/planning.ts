import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authorLesson } from "./lib/authoring";
import { providerConfig } from "./lib/generationConfig";
import { embed, research } from "./lib/providers";
import { EMBEDDING_SPACE, researchSchema, validateDraft, type Draft, type Research } from "../packages/contracts/generation";
import { projectSchema } from "../packages/contracts/scene";

export const researchTopic = internalAction({ args: { jobId: v.id("jobs") }, handler: async (ctx, { jobId }): Promise<null> => {
  const { job, artifacts } = await ctx.runQuery(internal.generation.context, { jobId });
  if (artifacts.some(a => a.stage === "research")) return null;
  const sources = await research(providerConfig(), job.topic);
  await ctx.runMutation(internal.generation.checkpoint, { jobId, stage: "research", json: JSON.stringify({ sources, provider: "firecrawl", retrievedAt: Date.now() }) });
  return null;
} });

export const planScenes = internalAction({ args: { jobId: v.id("jobs") }, handler: async (ctx, { jobId }): Promise<null> => {
  const { job, artifacts } = await ctx.runQuery(internal.generation.context, { jobId });
  if (artifacts.some(a => a.stage === "plan")) return null;
  const sources: Research = researchSchema.parse(JSON.parse(artifacts.find(a => a.stage === "research")!.json).sources);
  const result = await authorLesson(providerConfig(), sources, job.duration, job.topic, job.audience);
  await ctx.runMutation(internal.generation.checkpoint, { jobId, stage: "plan", json: JSON.stringify(result) });
  return null;
} });

export const retrieveIcons = internalAction({ args: { jobId: v.id("jobs") }, handler: async (ctx, { jobId }): Promise<null> => {
  const { job, artifacts } = await ctx.runQuery(internal.generation.context, { jobId });
  if (artifacts.some(a => a.stage === "project")) return null;
  const researchRecord = JSON.parse(artifacts.find(a => a.stage === "research")!.json) as { sources: Research; retrievedAt: number };
  const planned = JSON.parse(artifacts.find(a => a.stage === "plan")!.json) as { data: Draft; attempts: unknown };
  const draft = validateDraft(planned.data, researchRecord.sources, job.duration);
  const nodes = draft.scenes.flatMap(s => s.nodes);
  const catalog = await ctx.runQuery(internal.icons.catalog, {});
  const exact = nodes.map(n => catalog.find(icon => icon.name === n.concept));
  const reuse = nodes.every((node, i) => node.concept.startsWith("text:") || exact[i]);
  const vectors = reuse ? exact.map(icon => icon?.embedding || []) : await embed(providerConfig(), nodes.map(n => `Represent this sentence for searching relevant passages: ${n.concept} ${n.label}`));
  const candidates: { concept: string; label: string; options: { icon: string; name: string; score: number }[] }[] = [];
  for (let i = 0; i < vectors.length; i++) {
    if (nodes[i].concept.startsWith("text:")) { candidates.push({ concept: nodes[i].concept, label: nodes[i].label, options: [{ icon: "TEXT", name: nodes[i].concept, score: 1 }] }); continue; }
    const hits = await ctx.vectorSearch("iconEmbeddings", "by_embedding", { vector: vectors[i], limit: 3, filter: q => q.eq("space", EMBEDDING_SPACE) });
    const entries = await ctx.runQuery(internal.icons.hydrate, { ids: hits.map(h => h._id) });
    const options = hits.flatMap(hit => {
      const entry = entries.find(e => e._id === hit._id);
      return entry && hit._score >= 0.35 ? [{ icon: entry.iconId, name: entry.name, score: hit._score }] : [];
    });
    // Literal authored concepts reuse the qualified catalog vector. Preserve
    // exact identity even when near-equal vectors reorder the nearest hits.
    if (exact[i] && !options.some(o => o.icon === exact[i]!.iconId)) options.unshift({ icon: exact[i]!.iconId, name: exact[i]!.name, score: 1 });
    if (!options.length) throw new Error("No supported illustration for this concept");
    candidates.push({ concept: nodes[i].concept, label: nodes[i].label, options });
  }
  const selectedIcons = candidates.map((candidate, i) => {
    const match = candidate.options.find(o => o.name === nodes[i].concept);
    if (!match) throw new Error("No literal icon matches the planned object");
    return match.icon;
  });
  let index = 0;
  const project = projectSchema.parse({ version: 1, id: jobId, title: draft.title, targetDuration: job.duration, origin: "generated", voice: "af_heart", speed: 0.9,
    scenes: draft.scenes.map(scene => ({ ...scene, nodes: scene.nodes.map(node => ({ icon: selectedIcons[index++], label: node.label, cue: node.cue })) })),
    sources: researchRecord.sources.map(({ title, url }) => ({ title, url })) });
  const provenance = { topic: job.topic, audience: job.audience, researchProvider: "firecrawl", retrievedAt: researchRecord.retrievedAt,
    sourceMap: researchRecord.sources.map(({ id, title, url }) => ({ id, title, url })),
    sceneEvidence: draft.scenes.map(s => ({ sceneId: s.id, evidence: s.evidence })),
    planningAttempts: planned.attempts, selectionMethod: "literal-catalog-identity", reusedCatalogVectors: reuse, embeddingSpace: EMBEDDING_SPACE, candidates,
    verification: "Source IDs and exact quotes checked mechanically. Publication requires a separate Cloudflare source and rendered-frame review." };
  await ctx.runMutation(internal.generation.checkpoint, { jobId, stage: "project", json: JSON.stringify({ project, provenance }) });
  return null;
} });
