import { errorInfo, failureReason, isRetryableFailure } from "./retry";

export type GenerationProvider = "nim" | "openai";
export const DEFAULT_GENERATION_PROVIDER: GenerationProvider = "nim";
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";
export const PROVIDER_LABELS: Record<GenerationProvider, string> = {
  nim: "NVIDIA NIM + Cloudflare Workers AI",
  openai: "OpenAI",
};

// Safe messages shared by synchronous checks and durable job failures.
export const PROVIDER_MESSAGES = {
  missingKey: "OpenAI is not configured yet. Choose NVIDIA NIM + Cloudflare Workers AI, or ask the app owner to add the OpenAI API key.",
  unavailableModel: "The configured OpenAI model is unavailable or this app cannot access it. Choose NVIDIA NIM + Cloudflare Workers AI, or ask the app owner to check the model settings.",
  invalidKey: "OpenAI could not authenticate this app. Ask the app owner to check the OpenAI API key, or choose NVIDIA NIM + Cloudflare Workers AI.",
  rateLimit: "OpenAI has reached its usage or rate limit. Try again later, or choose NVIDIA NIM + Cloudflare Workers AI for a new lesson.",
  unavailable: "OpenAI is temporarily unavailable. Try again later. Existing lessons remain saved.",
} as const;
export const MODEL_SERVICE_UNAVAILABLE = "The AI model services are temporarily unavailable or rate limited. Your saved work is retained. Try again later.";

// Kept for existing workflow journals and callers. The shared parser preserves
// quota and fallback causes even after Convex serializes the Error.
export function transientProviderFailure(error: string): boolean {
  return isRetryableFailure(error);
}

export function openAIErrorMessage(status: number): string {
  if (status === 401) return PROVIDER_MESSAGES.invalidKey;
  if (status === 400 || status === 403 || status === 404) return PROVIDER_MESSAGES.unavailableModel;
  if (status === 429) return PROVIDER_MESSAGES.rateLimit;
  return PROVIDER_MESSAGES.unavailable;
}

export function providerFailureMessage(error: string): string | null {
  for (const message of Object.values(PROVIDER_MESSAGES)) if (error.includes(message)) return message;
  if (error.includes(MODEL_SERVICE_UNAVAILABLE)) return MODEL_SERVICE_UNAVAILABLE;
  return errorInfo(error) ? failureReason(error) : null;
}
