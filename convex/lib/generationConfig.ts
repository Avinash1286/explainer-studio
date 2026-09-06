import { env, type QueryCtx } from "../_generated/server";
import { EMBEDDING_SPACE } from "../../packages/contracts/generation";
import manifest from "../../public/openmoji/manifest.json";
import type { ProviderConfig } from "./providers";
import { DEFAULT_OPENAI_MODEL, PROVIDER_MESSAGES, type GenerationProvider } from "../../packages/contracts/provider";

export function providerConfig(generationProvider: GenerationProvider = "nim"): ProviderConfig {
  return { NVIDIA_API_KEY: env.NVIDIA_API_KEY, FIRECRAWL_API_KEY: env.FIRECRAWL_API_KEY,
    CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
    OPENAI_API_KEY: env.OPENAI_API_KEY?.trim(), OPENAI_MODEL: env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL, generationProvider };
}
export async function generationAvailability(ctx: QueryCtx, generationProvider: GenerationProvider = "nim", operatorCanary = false, savedStages?: ReadonlySet<string>) {
  if (savedStages?.has("project")) return { enabled: true, message: "The saved project is ready to render." };
  const config = providerConfig(generationProvider);
  if (generationProvider === "openai" && !config.OPENAI_API_KEY) return { enabled: false, message: PROVIDER_MESSAGES.missingKey };
  if (generationProvider === "openai" && !/^[A-Za-z0-9_.:-]{1,100}$/.test(config.OPENAI_MODEL || "")) return { enabled: false, message: PROVIDER_MESSAGES.unavailableModel };
  if (!operatorCanary && env.GENERATION_ENABLED !== "true") return { enabled: false, message: "New video generation is paused. You can still watch saved lessons." };
  if (!config.FIRECRAWL_API_KEY && !savedStages?.has("research")) return { enabled: false, message: "Research is awaiting service setup. Please try again later." };
  if (generationProvider === "openai") return { enabled: true, message: "OpenAI access is checked before generation." };
  const configured = Boolean(config.NVIDIA_API_KEY && config.CLOUDFLARE_ACCOUNT_ID && config.CLOUDFLARE_API_TOKEN);
  if (savedStages?.has("base")) return { enabled: configured, message: configured ? "Continuing visual direction using the saved script and illustrations." : "Set up the generation providers before resuming visual direction." };
  const qualification = await ctx.db.query("providerQualification").withIndex("by_key", q => q.eq("key", EMBEDDING_SPACE)).unique();
  const icons = await ctx.db.query("iconEmbeddings").withIndex("by_space_and_iconId", q => q.eq("space", EMBEDDING_SPACE)).take(manifest.entries.length + 1);
  const enabled = configured && qualification?.passed === true && icons.length === manifest.entries.length;
  return { enabled, message: enabled ? "NVIDIA NIM with Cloudflare Workers AI fallback is ready." : "Topic generation is awaiting provider setup and qualification." };
}

export async function generationReady(ctx: QueryCtx, operatorCanary = false, generationProvider: GenerationProvider = "nim") {
  return (await generationAvailability(ctx, generationProvider, operatorCanary)).enabled;
}

export function reviewReady(generationProvider: GenerationProvider = "nim") {
  if (generationProvider === "openai") return Boolean(providerConfig(generationProvider).OPENAI_API_KEY);
  return Boolean(env.CLOUDFLARE_API_TOKEN && /^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID || ""));
}
