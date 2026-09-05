import { v } from "convex/values";
import { z } from "zod";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { providerConfig } from "./lib/generationConfig";
import { EMBEDDING_SPACE, NVIDIA_MODEL, CLOUDFLARE_MODEL } from "../packages/contracts/generation";
import { embed, research, structured } from "./lib/providers";
import manifest from "../public/openmoji/manifest.json";
import schema from "./schema";

export const catalog = internalQuery({ args: {}, returns: v.array(schema.doc("iconEmbeddings")), handler: async ctx =>
  ctx.db.query("iconEmbeddings").withIndex("by_space_and_iconId", q => q.eq("space", EMBEDDING_SPACE)).take(manifest.entries.length + 1)
});

export const hydrate = internalQuery({ args: { ids: v.array(v.id("iconEmbeddings")) }, handler: async (ctx, { ids }) => {
  if (ids.length > 3) throw new Error("Too many icon hits");
  const rows = await Promise.all(ids.map(id => ctx.db.get(id)));
  return rows.flatMap(row => row && row.space === EMBEDDING_SPACE ? [{ _id: row._id, iconId: row.iconId, name: row.name }] : []);
} });
export const put = internalMutation({ args: { vectors: v.array(v.array(v.float64())) }, handler: async (ctx, { vectors }) => {
  if (vectors.length !== manifest.entries.length || vectors.some(v => v.length !== 768 || v.some(x => !Number.isFinite(x)))) throw new Error("Invalid catalog embeddings");
  for (const [index, icon] of manifest.entries.entries()) {
    const previous = await ctx.db.query("iconEmbeddings").withIndex("by_space_and_iconId", q => q.eq("space", EMBEDDING_SPACE).eq("iconId", icon.id)).unique();
    const value = { iconId: icon.id, name: icon.name, space: EMBEDDING_SPACE, embedding: vectors[index] };
    if (previous) await ctx.db.patch(previous._id, value); else await ctx.db.insert("iconEmbeddings", value);
  }
  return null;
} });
export const record = internalMutation({ args: { passed: v.boolean(), reportJson: v.string() }, handler: async (ctx, args) => {
  const previous = await ctx.db.query("providerQualification").withIndex("by_key", q => q.eq("key", EMBEDDING_SPACE)).unique();
  const value = { ...args, key: EMBEDDING_SPACE, updatedAt: Date.now() };
  if (previous) await ctx.db.patch(previous._id, value); else await ctx.db.insert("providerQualification", value);
  return null;
} });
// Admin-only CLI action. Never exposed to the public browser.
export const qualify = internalAction({ args: {}, handler: async (ctx): Promise<{ passed: boolean; report: string }> => {
  await ctx.runMutation(internal.icons.record, { passed: false, reportJson: "Qualification started" });
  try {
    const config = providerConfig();
    const probe = z.object({ answer: z.literal("water"), count: z.literal(2) });
    const schema = z.toJSONSchema(probe);
    const prompt = `Return JSON {"answer":"water","count":2}, matching ${JSON.stringify(schema)}`;
    const primary = await structured(config, "Return only the requested JSON.", prompt, schema, v => probe.parse(v));
    if (primary.attempts[0].provider !== "nvidia" || primary.attempts[0].outcome !== "success") throw new Error("Primary provider did not qualify directly");
    // A synthetic NVIDIA 429 plus a real Cloudflare request tests the router without inducing an upstream quota violation.
    const inject429: typeof fetch = (input, init) => String(input).includes("integrate.api.nvidia.com") ? Promise.resolve(new Response("", { status: 429 })) : fetch(input, init);
    const fallback = await structured(config, "Return only the requested JSON.", prompt, schema, v => probe.parse(v), inject429);
    const sources = await research(config, "How do plants use sunlight to make sugars?");
    const vectors = await embed(config, manifest.entries.map(e => `${e.name}. An OpenMoji illustration of ${e.name}.`));
    await ctx.runMutation(internal.icons.put, { vectors });
    const report = JSON.stringify({ primary: primary.attempts, fallback: fallback.attempts, fallbackTest: "Injected primary 429; real backup HTTP request", researchSources: sources.map(s => s.url), iconCount: vectors.length, space: EMBEDDING_SPACE, models: [NVIDIA_MODEL, CLOUDFLARE_MODEL], checkedAt: Date.now() });
    await ctx.runMutation(internal.icons.record, { passed: true, reportJson: report });
    return { passed: true, report };
  } catch (error) {
    const report = error instanceof Error ? error.message.slice(0, 250) : "Qualification failed";
    await ctx.runMutation(internal.icons.record, { passed: false, reportJson: report });
    return { passed: false, report };
  }
} });
