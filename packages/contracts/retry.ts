export const MAX_PROVIDER_ATTEMPTS = 5;
export const RETRY_BASE_MS = 30_000;
export const RETRY_CAP_MS = 300_000;
const providers = ["nvidia", "cloudflare", "openai", "firecrawl", "storage", "unknown"] as const;
const kinds = ["rate_limit", "quota_exhausted", "authentication", "model_unavailable", "timeout", "network", "unavailable", "invalid_request", "invalid_output"] as const;
export type FailureProvider = typeof providers[number];
export type ProviderFailureKind = typeof kinds[number];
export type ProviderFailureInfo = {
  provider: FailureProvider;
  status: number;
  kind: ProviderFailureKind;
  retryAfterMs?: number;
  retryAt?: number;
  previous?: ProviderFailureInfo;
};
export type RetryDecision = { retry: boolean; delayMs: number; reason: "transient" | "permanent" | "attempt-limit" | "cooldown"; info: ProviderFailureInfo | null };

export function defaultFailureKind(status: number): ProviderFailureKind {
  if (status === 429) return "rate_limit";
  if (status === 402) return "quota_exhausted";
  if (status === 401 || status === 403) return "authentication";
  if (status === 404) return "model_unavailable";
  if (status === 408 || status === 504) return "timeout";
  if (status === 0) return "network";
  return status >= 500 && status <= 599 ? "unavailable" : "invalid_request";
}
function compatible(kind: ProviderFailureKind, status: number): boolean {
  switch (kind) {
    case "rate_limit": return status === 429;
    case "quota_exhausted": return [402, 403, 429].includes(status);
    case "authentication": return status === 401 || status === 403;
    case "model_unavailable": return [400, 403, 404].includes(status);
    case "timeout": return [0, 408, 504].includes(status);
    case "network": return status === 0;
    case "unavailable": return status === 429 || (status >= 500 && status <= 599);
    case "invalid_output": return status === 422;
    case "invalid_request": return status >= 400 && status <= 499;
  }
}
function safeInfo(value: unknown, depth = 0): ProviderFailureInfo | null {
  if (!value || typeof value !== "object" || depth > 2) return null;
  const raw = value as Record<string, unknown>;
  if (!providers.includes(raw.provider as FailureProvider) || !Number.isInteger(raw.status) || Number(raw.status) < 0 || Number(raw.status) > 599 || !kinds.includes(raw.kind as ProviderFailureKind) || !compatible(raw.kind as ProviderFailureKind, Number(raw.status))) return null;
  const finiteMs = (number: unknown) => typeof number === "number" && Number.isSafeInteger(number) && number >= 0;
  if ((raw.retryAfterMs !== undefined && !finiteMs(raw.retryAfterMs)) || (raw.retryAt !== undefined && !finiteMs(raw.retryAt))) return null;
  const previous = raw.previous === undefined ? undefined : safeInfo(raw.previous, depth + 1);
  if (previous === null) return null;
  return { provider: raw.provider as FailureProvider, status: Number(raw.status), kind: raw.kind as ProviderFailureKind,
    ...(raw.retryAfterMs !== undefined ? { retryAfterMs: Number(raw.retryAfterMs) } : {}),
    ...(raw.retryAt !== undefined ? { retryAt: Number(raw.retryAt) } : {}), ...(previous ? { previous } : {}),
  };
}
export function makeFailureInfo(provider: string, status: number, options: Partial<Omit<ProviderFailureInfo, "provider" | "status">> = {}): ProviderFailureInfo {
  const name = providers.includes(provider as FailureProvider) ? provider as FailureProvider : "unknown";
  const code = Number.isInteger(status) && status >= 0 && status <= 599 ? status : 0;
  return safeInfo({ provider: name, status: code, kind: options.kind || defaultFailureKind(code), retryAfterMs: options.retryAfterMs, retryAt: options.retryAt, previous: options.previous }) || { provider: name, status: code, kind: defaultFailureKind(code) };
}
export function serializeFailure(info: ProviderFailureInfo): string {
  const safe = safeInfo(info) || makeFailureInfo("unknown", 0);
  return `${safe.provider} request failed (${safe.status}) [provider-error:v1:${JSON.stringify(safe)}]`;
}

/** Read only our bounded, sanitized marker after Convex wraps an Error. Old
 * status-only errors remain readable; arbitrary error prose is never returned. */
export function errorInfo(error: unknown, depth = 0): ProviderFailureInfo | null {
  if (depth > 3) return null;
  if (error && typeof error === "object") {
    const raw = error as { info?: unknown; message?: unknown };
    return safeInfo(raw.info) || safeInfo(error) || (typeof raw.message === "string" ? errorInfo(raw.message, depth + 1) : null);
  }
  if (typeof error !== "string") return null;
  const text = error.slice(0, 16_000);
  if (/^[\s]*["{]/.test(text)) { try { const parsed = JSON.parse(text); if (parsed !== text) { const info = errorInfo(parsed, depth + 1); if (info) return info; } } catch { /* Error wrappers need not be JSON. */ } }
  const match = /\b(nvidia|cloudflare|openai|firecrawl|storage|unknown) request failed \((\d{1,3})\)/i.exec(text);
  if (!match) return null;
  const marker = /\[provider-error:v1:(\{[^\r\n]{1,4000}?\})\]/.exec(text);
  if (marker && !text.slice(match.index, marker.index).includes("; primary:")) {
    try {
      const parsed = safeInfo(JSON.parse(marker[1]));
      if (!parsed || parsed.provider !== match[1].toLowerCase() || parsed.status !== Number(match[2])) return null;
      const primary = text.indexOf("; primary:", marker.index + marker[0].length);
      if (primary >= 0 && !parsed.previous) parsed.previous = errorInfo(text.slice(primary + 10), depth + 1) || makeFailureInfo("nvidia", 422, { kind: "invalid_output" });
      return parsed;
    } catch { return null; }
  }
  const info = makeFailureInfo(match[1].toLowerCase(), Number(match[2]));
  const primary = text.indexOf("; primary:", match.index + match[0].length);
  if (primary >= 0) info.previous = errorInfo(text.slice(primary + 10), depth + 1) || makeFailureInfo("nvidia", 422, { kind: "invalid_output" });
  return info;
}

/** Retry-After delta seconds and HTTP dates. Keeping the absolute deadline
 * prevents a workflow replay from restarting the same server cooldown. */
export function parseRetryAfter(headers: Pick<Headers, "get">, now = Date.now()): Pick<ProviderFailureInfo, "retryAfterMs" | "retryAt"> {
  const value = headers.get("retry-after")?.trim();
  if (!value || value.length > 128) return {};
  let delay: number;
  if (/^\d+(?:\.\d+)?$/.test(value)) delay = Number(value) * 1000;
  else {
    // Date.parse accepts strings such as "-1" as dates; HTTP-date needs a
    // weekday/month textual form before parsing, not a malformed delta.
    if (!/[a-z]{3}/i.test(value) || !/\d{2}:\d{2}:\d{2}/.test(value)) return {};
    const date = Date.parse(value);
    if (!Number.isFinite(date)) return {};
    delay = Math.max(0, date - now);
  }
  if (Number.isNaN(delay) || delay < 0) return {};
  const retryAfterMs = Math.min(Math.ceil(delay), Number.MAX_SAFE_INTEGER - Math.ceil(now));
  return { retryAfterMs, retryAt: Math.ceil(now) + retryAfterMs };
}
const transientKinds = new Set<ProviderFailureKind>(["rate_limit", "timeout", "network", "unavailable"]);
export function isRetryableFailure(error: unknown): boolean {
  const info = errorInfo(error);
  if (!info) return false;
  for (let current: ProviderFailureInfo | undefined = info; current; current = current.previous) if (!transientKinds.has(current.kind)) return false;
  return true;
}
export function retryDelay(error: unknown, attempt: number, random: () => number = Math.random, now = Date.now()): RetryDecision {
  const info = errorInfo(error);
  if (!info || !isRetryableFailure(info)) return { retry: false, delayMs: 0, reason: "permanent", info };
  let serverDelay = 0;
  for (let current: ProviderFailureInfo | undefined = info; current; current = current.previous) serverDelay = Math.max(serverDelay, current.retryAt !== undefined ? Math.max(0, current.retryAt - now) : current.retryAfterMs || 0);
  // Exhausting automatic attempts must not erase a provider cooldown: the
  // owner may resume later, but must still wait until this deadline.
  if (!Number.isInteger(attempt) || attempt < 1 || attempt >= MAX_PROVIDER_ATTEMPTS) return { retry: false, delayMs: serverDelay, reason: "attempt-limit", info };
  if (serverDelay > RETRY_CAP_MS) return { retry: false, delayMs: serverDelay, reason: "cooldown", info };
  const base = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** (attempt - 1));
  const value = random();
  const jitter = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const delayMs = Math.min(RETRY_CAP_MS, Math.ceil(Math.max(serverDelay, base * (1 + jitter * 0.2))));
  return { retry: true, delayMs, reason: "transient", info };
}

const names: Record<FailureProvider, string> = { nvidia: "NVIDIA NIM", cloudflare: "Cloudflare Workers AI", openai: "OpenAI", firecrawl: "Firecrawl research", storage: "Media storage", unknown: "The service" };
function description(info: ProviderFailureInfo): string {
  const name = names[info.provider];
  switch (info.kind) {
    case "rate_limit": return `${name} is temporarily rate limited.`;
    case "quota_exhausted": return `${name} has exhausted the app's credits or usage quota.`;
    case "authentication": return `${name} credentials are missing, invalid, or lack access.`;
    case "model_unavailable": return `${name} cannot access the configured model or resource.`;
    case "timeout": return `${name} did not respond before the request deadline.`;
    case "network": return `${name} could not be reached or the connection was interrupted.`;
    case "unavailable": return `${name} is temporarily unavailable.`;
    case "invalid_output": return `${name} returned output that did not pass validation.`;
    case "invalid_request": return `${name} rejected this request (${info.status}).`;
  }
}
export function failureReason(error: unknown): string {
  const info = errorInfo(error);
  if (!info && typeof error === "string") {
    if (error.includes("Planner could not produce a valid supported lesson")) return "The model's lesson or scene output did not pass validation after the allowed corrections. Your saved work is retained. Review the brief or scene before resuming.";
    if (error.includes("Research needs two independent source domains")) return "Research did not return enough independent sources to support this lesson. Your saved work is retained. Try resuming when research is available or refine the question.";
    if (error.includes("No supported illustration") || error.includes("No literal icon matches")) return "The planned objects could not be matched to supported illustrations. Your saved work is retained. The scene plan needs an illustration correction before it can continue.";
    if (error.includes("Invalid embedding response")) return "The illustration search service returned an invalid result. Your saved work is retained. Check the search provider before resuming.";
  }
  if (!info) return "This step could not finish. Your saved work is retained.";
  const messages: string[] = [];
  let permanent: ProviderFailureKind | undefined;
  for (let current: ProviderFailureInfo | undefined = info; current; current = current.previous) {
    messages.push(description(current));
    if (!transientKinds.has(current.kind)) permanent = current.kind;
  }
  const guidance = permanent === "quota_exhausted" ? "Ask the app owner to check the provider's credits or quota reset before resuming."
    : permanent === "authentication" || permanent === "model_unavailable" || permanent === "invalid_request" ? "Ask the app owner to check the provider configuration before resuming."
    : permanent === "invalid_output" ? "Review the reported scene or brief before retrying the failed step."
    : "The failed step can resume when the service is available.";
  return `${messages.join(" ")} Your saved work is retained. ${guidance}`;
}
