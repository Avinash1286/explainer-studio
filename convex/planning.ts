import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { authorLesson } from "./lib/authoring";
import { directScenes, validateDirectedPlan, validateAssetSelection, type DirectorAttempt } from "./lib/director";
import { directorEvidenceContext } from "./lib/directorEvidence";
import { providerConfig } from "./lib/generationConfig";
import { embed, research } from "./lib/providers";
import { EMBEDDING_SPACE, researchSchema, validateDraft, type Draft, type Research } from "../packages/contracts/generation";
import { projectSchema } from "../packages/contracts/scene";
import manifest from "../public/openmoji/manifest.json";

export const researchTopic = internalAction({ args: { jobId: v.id("jobs") }, handler: async (ctx, { jobId }): Promise<null> => {
  const { job, artifacts } = await ctx.runQuery(internal.generation.context, { jobId });
  if (artifacts.some(a => a.stage === "research")) return null;
  const sources = await research(providerConfig(job.generationProvider), job.topic);
  await ctx.runMutation(internal.generation.checkpoint, { jobId, stage: "research", json: JSON.stringify({ sources, provider: "firecrawl", retrievedAt: Date.now() }) });
  return null;
} });

export const planScenes = internalAction({ args: { jobId: v.id("jobs") }, handler: async (ctx, { jobId }): Promise<null> => {
  const { job, artifacts } = await ctx.runQuery(internal.generation.context, { jobId });
  if (artifacts.some(a => a.stage === "plan")) return null;
  const sources: Research = researchSchema.parse(JSON.parse(artifacts.find(a => a.stage === "research")!.json).sources);
  const result = await authorLesson(providerConfig(job.generationProvider), sources, job.duration, job.topic, job.audience);
  await ctx.runMutation(internal.generation.checkpoint, { jobId, stage: "plan", json: JSON.stringify(result) });
  return null;
} });

export const retrieveIcons = internalAction({ args: { jobId: v.id("jobs") }, handler: async (ctx, { jobId }): Promise<null> => {
  const { job, artifacts } = await ctx.runQuery(internal.generation.context, { jobId });
  if (artifacts.some(a => a.stage === "base" || a.stage === "project")) return null;
  const researchRecord = JSON.parse(artifacts.find(a => a.stage === "research")!.json) as { sources: Research; retrievedAt: number };
  const planned = JSON.parse(artifacts.find(a => a.stage === "plan")!.json) as { data: Draft; attempts: unknown };
  const draft = validateDraft(planned.data, researchRecord.sources, job.duration);
  const nodes = draft.scenes.flatMap(s => s.nodes);
  // Authored icons already have literal identities in the bundled catalog.
  // OpenAI jobs therefore require no Cloudflare embeddings or qualification.
  const openai = job.generationProvider === "openai";
  const catalog = openai ? manifest.entries.map(icon => ({ name: icon.name, iconId: icon.id, embedding: [] as number[] })) : await ctx.runQuery(internal.icons.catalog, {});
  const exact = nodes.map(n => catalog.find(icon => icon.name === n.concept));
  const reuse = nodes.every((node, i) => node.concept.startsWith("text:") || exact[i]);
  if (openai && !reuse) throw new Error("No literal icon matches the planned object");
  const vectors = reuse ? exact.map(icon => icon?.embedding || []) : await embed(providerConfig(job.generationProvider), nodes.map(n => `Represent this sentence for searching relevant passages: ${n.concept} ${n.label}`));
  const candidates: { concept: string; label: string; options: { icon: string; name: string; score: number }[] }[] = [];
  for (let i = 0; i < vectors.length; i++) {
    if (nodes[i].concept.startsWith("text:")) { candidates.push({ concept: nodes[i].concept, label: nodes[i].label, options: [{ icon: "TEXT", name: nodes[i].concept, score: 1 }] }); continue; }
    if (openai && exact[i]) { candidates.push({ concept: nodes[i].concept, label: nodes[i].label, options: [{ icon: exact[i]!.iconId, name: exact[i]!.name, score: 1 }] }); continue; }
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
  const compiled = projectSchema.parse({ version: 1, id: jobId, title: draft.title, targetDuration: job.duration, origin: "generated", voice: "af_heart", speed: 0.9,
    scenes: draft.scenes.map(scene => ({ ...scene, nodes: scene.nodes.map(node => ({ icon: selectedIcons[index++], label: node.label, cue: node.cue })) })),
    sources: researchRecord.sources.map(({ title, url }) => ({ title, url })) });
  const provenance = { topic: job.topic, audience: job.audience, generationProvider: job.generationProvider || "nim", researchProvider: "firecrawl", retrievedAt: researchRecord.retrievedAt,
    sourceMap: researchRecord.sources.map(({ id, title, url }) => ({ id, title, url })),
    sceneEvidence: draft.scenes.map(s => ({ sceneId: s.id, evidence: s.evidence })),
    planningAttempts: planned.attempts, selectionMethod: "literal-catalog-identity", reusedCatalogVectors: !openai && reuse, ...(!openai ? { embeddingSpace: EMBEDDING_SPACE } : {}), candidates,
    verification: `Source IDs and exact quotes checked mechanically. Publication requires separate factual and decoded-frame review using ${openai ? "OpenAI" : "NVIDIA NIM and Cloudflare Workers AI"}.` };
  await ctx.runMutation(internal.generation.checkpoint, { jobId, stage: "base", json: JSON.stringify({ project: compiled, provenance }) });
  return null;
} });

export const directorSceneIds = internalQuery({ args: { jobId: v.id("jobs") }, returns: v.array(v.string()), handler: async (ctx, args): Promise<string[]> => {
  const { artifacts } = await ctx.runQuery(internal.generation.context, args);
  if (artifacts.some(a => a.stage === "project")) return [];
  const base = artifacts.find(a => a.stage === "base");
  if (!base) throw new Error("Missing compiled lesson");
  return projectSchema.parse(JSON.parse(base.json).project).scenes.map(s => s.id);
} });

export const directScene = internalAction({ args: { jobId: v.id("jobs"), sceneId: v.string() }, returns: v.null(), handler: async (ctx, { jobId, sceneId }) => {
  const { job, artifacts } = await ctx.runQuery(internal.generation.context, { jobId });
  if (artifacts.some(a => a.stage === "project")) return null;
  const base = artifacts.find(a => a.stage === "base");
  if (!base) throw new Error("Missing compiled lesson");
  const sources = researchSchema.parse(JSON.parse(artifacts.find(a => a.stage === "research")!.json).sources);
  const baseRecord = JSON.parse(base.json);
  const compiled = projectSchema.parse(baseRecord.project);
  const target = compiled.scenes.find(scene => scene.id === sceneId);
  if (!target) throw new Error("Unknown scene to direct");
  const previous = artifacts.find(a => a.stage === `visual-${sceneId}`);
  if (previous) {
    try { validateDirectedPlan(JSON.parse(previous.json).visualPlan, target.narration); return null; }
    catch { /* Re-direct only a saved plan rejected by the current validators. */ }
  }
  // Saved neighbouring scenes establish identities and color continuity without
  // rerunning their paid inference after a later scene fails.
  const project = projectSchema.parse({ ...compiled, scenes: compiled.scenes.map(scene => {
    const saved = artifacts.find(a => a.stage === `visual-${scene.id}`);
    if (saved) {
      try { return { ...scene, visualPlan: validateDirectedPlan(JSON.parse(saved.json).visualPlan, scene.narration) }; }
      catch { /* Other invalid checkpoints are re-directed in their own steps. */ }
    }
    return scene;
  }) });
  const evidenceContext = directorEvidenceContext(sources, baseRecord.provenance?.sceneEvidence, sceneId, target.narration);
  const result = await directScenes(providerConfig(job.generationProvider), project, sources, [sceneId], "", fetch, [evidenceContext]);
  const scene = result.project.scenes.find(s => s.id === sceneId)!;
  const direction = result.attempts[0];
  await ctx.runMutation(internal.generation.checkpoint, { jobId, stage: `visual-${sceneId}`, json: JSON.stringify({ sceneId, visualPlan: scene.visualPlan, attempts: direction.attempts, assetSelection: validateAssetSelection(direction.assetSelection, scene.visualPlan!), ...(direction.layoutAdjustment ? { layoutAdjustment: direction.layoutAdjustment } : {}) }) });
  return null;
} });

export const finalizeProject = internalAction({ args: { jobId: v.id("jobs") }, returns: v.null(), handler: async (ctx, { jobId }) => {
  const { artifacts } = await ctx.runQuery(internal.generation.context, { jobId });
  if (artifacts.some(a => a.stage === "project")) return null;
  const base = artifacts.find(a => a.stage === "base");
  if (!base) throw new Error("Missing compiled lesson");
  const { project: value, provenance } = JSON.parse(base.json);
  const compiled = projectSchema.parse(value);
  const directorAttempts: DirectorAttempt[] = [];
  const project = projectSchema.parse({ ...compiled, scenes: compiled.scenes.map(scene => {
    const saved = artifacts.find(a => a.stage === `visual-${scene.id}`);
    if (!saved) throw new Error("Every generated scene requires a validated visual plan");
    const record = JSON.parse(saved.json);
    const visualPlan = validateDirectedPlan(record.visualPlan, scene.narration);
    directorAttempts.push({ sceneId: scene.id, attempts: record.attempts, ...(record.assetSelection ? { assetSelection: validateAssetSelection(record.assetSelection, visualPlan) } : {}), ...(record.layoutAdjustment ? { layoutAdjustment: record.layoutAdjustment } : {}) });
    return { ...scene, visualPlan };
  }) });
  await ctx.runMutation(internal.generation.checkpoint, { jobId, stage: "project", json: JSON.stringify({ project, provenance: { ...provenance, visualPlanVersion: 1, directorAttempts } }) });
  return null;
} });
