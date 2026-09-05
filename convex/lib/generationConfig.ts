import { env, type QueryCtx } from "../_generated/server";
import { EMBEDDING_SPACE } from "../../packages/contracts/generation";
import manifest from "../../public/openmoji/manifest.json";

export function providerConfig() {
  return { NVIDIA_API_KEY: env.NVIDIA_API_KEY, FIRECRAWL_API_KEY: env.FIRECRAWL_API_KEY,
    CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN };
}
export async function generationReady(ctx: QueryCtx) {
  const configured = Object.values(providerConfig()).every(Boolean);
  const qualification = await ctx.db.query("providerQualification").withIndex("by_key", q => q.eq("key", EMBEDDING_SPACE)).unique();
  const icons = await ctx.db.query("iconEmbeddings").withIndex("by_space_and_iconId", q => q.eq("space", EMBEDDING_SPACE)).take(manifest.entries.length + 1);
  return configured && env.GENERATION_ENABLED === "true" && qualification?.passed === true && icons.length === manifest.entries.length;
}
