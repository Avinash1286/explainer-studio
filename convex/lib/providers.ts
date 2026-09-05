import { z } from "zod";
import { CLOUDFLARE_MODEL, EMBEDDING_MODEL, NVIDIA_MODEL, researchSchema, type Research } from "../../packages/contracts/generation";

export type ProviderConfig = { NVIDIA_API_KEY?: string; CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_API_TOKEN?: string; FIRECRAWL_API_KEY?: string };
export type Provider = "nvidia" | "cloudflare";
export type Attempt = { provider: Provider; outcome: string; elapsedMs: number };
export class ProviderError extends Error {
  constructor(public provider: string, public status: number) { super(`${provider} request failed (${status})`); }
}
export const transient = (e: unknown) => e instanceof ProviderError && (e.status === 429 || e.status === 408 || e.status >= 500 || e.status === 0);
export async function post(url: string, key: string | undefined, body: unknown, provider: string, transport: typeof fetch = fetch): Promise<unknown> {
  if (!key) throw new ProviderError(provider, 401);
  let response: Response;
  try { response = await transport(url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(55_000), redirect: "error" }); }
  catch { throw new ProviderError(provider, 0); }
  if (!response.ok) throw new ProviderError(provider, response.status);
  let text: string;
  try { text = await response.text(); } catch { throw new ProviderError(provider, 0); }
  if (text.length > 500_000) throw new ProviderError(provider, 413);
  try { return JSON.parse(text); } catch { throw new ProviderError(provider, 502); }
}
function cfUrl(config: ProviderConfig, model: string) {
  if (!/^[a-f0-9]{32}$/i.test(config.CLOUDFLARE_ACCOUNT_ID || "")) throw new ProviderError("cloudflare", 401);
  return `https://api.cloudflare.com/client/v4/accounts/${config.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;
}
export async function chat(config: ProviderConfig, provider: Provider, system: string, prompt: string, schema: object, transport: typeof fetch = fetch) {
  const messages = [{ role: "system", content: system }, { role: "user", content: prompt }];
  const common = { messages, temperature: 0.2, max_tokens: 5000, stream: false };
  const raw = provider === "nvidia"
    ? await post("https://integrate.api.nvidia.com/v1/chat/completions", config.NVIDIA_API_KEY, { ...common, model: NVIDIA_MODEL, response_format: { type: "json_object" } }, provider, transport)
    : await post(cfUrl(config, CLOUDFLARE_MODEL), config.CLOUDFLARE_API_TOKEN, { ...common, response_format: { type: "json_schema", json_schema: schema } }, provider, transport);
  const parsed = provider === "nvidia"
    ? z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) }).parse(raw).choices[0].message.content
    : z.object({ success: z.literal(true), result: z.object({ response: z.union([z.string(), z.record(z.string(), z.unknown())]) }) }).parse(raw).result.response;
  return typeof parsed === "string" ? JSON.parse(parsed.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()) as unknown : parsed;
}
// One validation repair per provider. Only transient upstream failures switch providers.
export async function structured<T>(config: ProviderConfig, system: string, prompt: string, schema: object, validate: (data: unknown) => T, transport: typeof fetch = fetch, preferred: Provider = "nvidia") {
  const attempts: Attempt[] = [];
  for (const provider of preferred === "nvidia" ? ["nvidia", "cloudflare"] as const : ["cloudflare"] as const) {
    for (let repair = 0; repair < 2; repair++) {
      const start = Date.now();
      try {
        const value = await chat(config, provider, system, prompt + (repair ? "\nYour previous output failed validation. Recheck every schema, citation, word count, cue and layout constraint before returning JSON." : ""), schema, transport);
        const data = validate(value);
        attempts.push({ provider, outcome: "success", elapsedMs: Date.now() - start });
        return { data, attempts };
      } catch (error) {
        attempts.push({ provider, outcome: error instanceof ProviderError ? `http-${error.status}` : "invalid-output", elapsedMs: Date.now() - start });
        if (transient(error) && provider === "nvidia") break;
        if (error instanceof ProviderError || repair === 1) throw error instanceof ProviderError ? error : new Error("Planner could not produce a valid supported lesson");
      }
    }
  }
  throw new Error("Text providers unavailable");
}
export async function research(config: ProviderConfig, topic: string, transport: typeof fetch = fetch): Promise<Research> {
  const raw = await post("https://api.firecrawl.dev/v2/search", config.FIRECRAWL_API_KEY,
    { query: topic.slice(0, 500), limit: 5, sources: ["web"], safe: true, timeout: 45000, scrapeOptions: { formats: ["markdown"], onlyMainContent: true } }, "firecrawl", transport);
  const result = z.object({ success: z.literal(true), data: z.object({ web: z.array(z.object({ title: z.string().optional(), url: z.string(), markdown: z.string().optional() })) }) }).parse(raw);
  const seen = new Set<string>();
  const sources = result.data.web.flatMap((item, i) => {
    let url: URL;
    try { url = new URL(item.url); } catch { return []; }
    if (url.protocol !== "https:" || url.username || url.password || !item.markdown || item.markdown.length < 150 || seen.has(url.href)) return [];
    seen.add(url.href);
    return [{ id: `source-${i + 1}`, title: (item.title || url.hostname).slice(0, 300), url: url.href, text: item.markdown.slice(0, 8000) }];
  });
  if (new Set(sources.map(s => new URL(s.url).hostname.replace(/^www\./, ""))).size < 2) throw new Error("Research needs two independent source domains");
  return researchSchema.parse(sources);
}
export async function embed(config: ProviderConfig, texts: string[], transport: typeof fetch = fetch): Promise<number[][]> {
  if (texts.length < 1 || texts.length > 32 || texts.some(t => t.length > 500)) throw new Error("Embedding batch exceeded");
  const raw = await post(cfUrl(config, EMBEDDING_MODEL), config.CLOUDFLARE_API_TOKEN, { text: texts, pooling: "mean" }, "cloudflare", transport);
  const result = z.object({ success: z.literal(true), result: z.object({ data: z.array(z.array(z.number().finite()).length(768)) }) }).parse(raw);
  if (result.result.data.length !== texts.length || result.result.data.some(row => !row.some(x => x !== 0))) throw new Error("Invalid embedding response");
  return result.result.data;
}
