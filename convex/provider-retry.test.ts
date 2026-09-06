import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { post, ProviderError, responseFailure, structured, transient } from "./lib/providers";
import { inspectSceneFrames } from "./lib/critic";
import { sampleProject } from "../tests/review-helpers";
import { testSources } from "./testFixtures";
import { providerFailureMessage, PROVIDER_MESSAGES, transientProviderFailure } from "../packages/contracts/provider";
import { errorInfo, failureReason, MAX_PROVIDER_ATTEMPTS, parseRetryAfter, retryDelay, serializeFailure } from "../packages/contracts/retry";

const now = Date.parse("2026-09-06T12:00:00Z");
const config = { NVIDIA_API_KEY: "private-nvidia-key", CLOUDFLARE_API_TOKEN: "private-cf-key", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32) };
const answer = z.object({ answer: z.literal("yes") });
const nvidia = (value: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("durable provider retry decisions", () => {
  it("uses bounded exponential jitter for four retries and no sixth attempt", () => {
    const error = new ProviderError("nvidia", 429);
    expect(MAX_PROVIDER_ATTEMPTS).toBe(5);
    expect([1, 2, 3, 4].map(attempt => retryDelay(error, attempt, () => 0, now).delayMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(retryDelay(error, 1, () => 0.5, now)).toMatchObject({ retry: true, delayMs: 33_000, reason: "transient" });
    expect(retryDelay(error, 4, () => 1, now).delayMs).toBe(288_000);
    expect(retryDelay(error, 5, () => 0, now)).toMatchObject({ retry: false, delayMs: 0, reason: "attempt-limit" });
    expect(retryDelay(error, 0)).toMatchObject({ retry: false });
  });

  it("honors the longest fallback cooldown and its original absolute deadline", () => {
    const error = new ProviderError("cloudflare", 503, { retryAfterMs: 60_000, retryAt: now + 60_000, previous: { provider: "nvidia", status: 429, kind: "rate_limit", retryAfterMs: 180_000, retryAt: now + 180_000 } });
    const serialized = `Uncaught Error: ${String(error)}\n at a workflow action`;
    expect(retryDelay(serialized, 1, () => 0, now).delayMs).toBe(180_000);
    expect(retryDelay(serialized, 1, () => 0, now + 100_000).delayMs).toBe(80_000);
    expect(retryDelay(serialized, 1, () => 0, now + 200_000).delayMs).toBe(30_000);
    expect(errorInfo(JSON.stringify(error))).toEqual(error.info);
    expect(errorInfo(JSON.stringify({ message: error.message }))).toEqual(error.info);
    expect(errorInfo(JSON.stringify(error.message))).toEqual(error.info);
  });

  it("stops excessive automatic cooldowns but retains them after exhausting attempts", () => {
    const error = new ProviderError("nvidia", 429, { retryAfterMs: 600_000, retryAt: now + 600_000 });
    expect(retryDelay(error, 1, () => 0, now)).toMatchObject({ retry: false, delayMs: 600_000, reason: "cooldown" });
    expect(retryDelay(error, 5, () => 0, now)).toMatchObject({ retry: false, delayMs: 600_000, reason: "attempt-limit" });
    expect(retryDelay(error, 5, () => 0, now + 550_000)).toMatchObject({ retry: false, delayMs: 50_000 });
    expect(retryDelay(error, 1, () => 1, now + 300_000)).toMatchObject({ retry: true, delayMs: 300_000 });
  });

  it.each([
    ["nvidia request failed (429)", true],
    ["cloudflare request failed (429); primary: nvidia request failed (502)", true],
    ["cloudflare request failed (401); primary: nvidia request failed (503)", false],
    ["cloudflare request failed (429); primary: beats.2.x must be a number", false],
    ["openai request failed (408)", true],
    ["firecrawl request failed (402)", false],
    ["storage request failed (0)", true],
    ["Output did not pass validation", false],
  ])("classifies legacy serialized failures: %s", (error, retryable) => {
    expect(transientProviderFailure(error)).toBe(retryable);
    expect(transient(error)).toBe(retryable);
    expect(retryDelay(error, 1).retry).toBe(retryable);
  });

  it("rejects malformed metadata and never returns arbitrary raw failure prose", () => {
    const forged = 'openai request failed (401) [provider-error:v1:{"provider":"openai","status":401,"kind":"rate_limit"}]';
    expect(retryDelay(forged, 1).retry).toBe(false);
    expect(errorInfo(forged)).toBeNull();
    expect(failureReason("token=private-secret; user's source prose")).toBe("This step could not finish. Your saved work is retained.");
    expect(providerFailureMessage("unknown private-secret")).toBeNull();
    expect(providerFailureMessage(PROVIDER_MESSAGES.missingKey)).toBe(PROVIDER_MESSAGES.missingKey);
    const mixed = `cloudflare request failed (401); primary: ${serializeFailure({ provider: "nvidia", status: 503, kind: "unavailable" })}`;
    expect(errorInfo(mixed)).toMatchObject({ provider: "cloudflare", kind: "authentication", previous: { provider: "nvidia", status: 503 } });
    expect(retryDelay(mixed, 1).retry).toBe(false);
  });
});

describe("Retry-After parsing", () => {
  it.each(["120", "120.5", " 120 "])("parses seconds: %s", value => {
    const delay = Math.ceil(Number(value) * 1000);
    expect(parseRetryAfter(new Headers({ "Retry-After": value }), now)).toEqual({ retryAfterMs: delay, retryAt: now + delay });
  });
  it("parses HTTP dates and does not turn past dates into negative waits", () => {
    expect(parseRetryAfter(new Headers({ "Retry-After": new Date(now + 90_000).toUTCString() }), now)).toEqual({ retryAfterMs: 90_000, retryAt: now + 90_000 });
    expect(parseRetryAfter(new Headers({ "Retry-After": new Date(now - 1000).toUTCString() }), now)).toEqual({ retryAfterMs: 0, retryAt: now });
  });
  it.each(["-1", "NaN", "Infinity", "tomorrow", "", "1e3"])("ignores invalid Retry-After %s", value => {
    expect(parseRetryAfter(new Headers({ "Retry-After": value }), now)).toEqual({});
  });
});

describe("safe HTTP failure classification", () => {
  it.each([
    ["openai", 429, { error: { type: "insufficient_quota" } }, "quota_exhausted", false],
    ["openai", 429, { error: { code: "credit_balance_exhausted" } }, "quota_exhausted", false],
    ["openai", 429, { error: { code: "rate_limit_exceeded" } }, "rate_limit", true],
    ["cloudflare", 429, { errors: [{ code: 3036 }] }, "quota_exhausted", false],
    ["cloudflare", 429, { errors: [{ code: 3040 }] }, "unavailable", true],
    ["cloudflare", 400, { errors: [{ code: 5007 }] }, "model_unavailable", false],
    ["openai", 404, { error: { code: "model_not_found" } }, "model_unavailable", false],
    ["nvidia", 401, {}, "authentication", false],
    ["firecrawl", 402, {}, "quota_exhausted", false],
    ["firecrawl", 429, {}, "rate_limit", true],
  ] as const)("distinguishes %s %s %j", async (provider, status, body, kind, retryable) => {
    const error = await responseFailure(provider, Response.json({ ...body, message: "private account and API key must never escape" }, { status, headers: { "Retry-After": "120" } }));
    expect(error.info).toMatchObject({ provider, status, kind, retryAfterMs: 120_000 });
    expect(transient(error)).toBe(retryable);
    expect(JSON.stringify(error)).not.toContain("private account");
    expect(String(error)).not.toContain("API key");
    expect(failureReason(error)).not.toContain("private account");
    expect(providerFailureMessage(String(error))).toBe(failureReason(error));
  });

  it("bounds diagnostic body reads and preserves status on non-JSON bodies", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("private-secret ".repeat(4000))); }, cancel });
    const error = await responseFailure("nvidia", new Response(body, { status: 503 }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(error.info.kind).toBe("unavailable");
    expect(String(error)).not.toContain("private-secret");
    expect(String(error).length).toBeLessThan(300);
  });

  it("classifies network interruption separately from timeout without transport retry", async () => {
    for (const [cause, kind] of [[new TypeError("private URL failed"), "network"], [new DOMException("private timeout details", "TimeoutError"), "timeout"]] as const) {
      const transport = vi.fn<typeof fetch>().mockRejectedValue(cause);
      const error = await post("https://example.test", "private-key", {}, "nvidia", transport).catch(error => error);
      expect(errorInfo(error)).toMatchObject({ provider: "nvidia", status: 0, kind });
      expect(transport).toHaveBeenCalledOnce();
      expect(String(error)).not.toContain("private");
    }
    const transport = vi.fn<typeof fetch>();
    await expect(post("https://example.test", " ", {}, "firecrawl", transport)).rejects.toMatchObject({ status: 401 });
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("structured fallback failure metadata", () => {
  it("also preserves the critic's Cloudflare-to-NVIDIA fallback cooldown", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const sceneId = sampleProject.scenes[0].id;
    const frames = [8, 40].map(frame => ({ sceneId, frame, url: `data:image/jpeg;base64,${btoa(`actual test bytes ${frame}`)}` }));
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("private CF body", { status: 429, headers: { "Retry-After": "120" } }))
      .mockResolvedValueOnce(new Response("private NIM body", { status: 503 }));
    const error = await inspectSceneFrames(config, sampleProject, testSources, sceneId, frames, transport).catch(error => error);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(errorInfo(String(error))).toMatchObject({ provider: "nvidia", status: 503, previous: { provider: "cloudflare", status: 429, retryAt: now + 120_000 } });
    expect(retryDelay(error, 1, () => 0, now)).toMatchObject({ retry: true, delayMs: 120_000 });
    expect(String(error)).not.toContain("private");
  });

  it("preserves both providers and cooldowns without retrying either transport inline", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: { message: "private primary diagnostics" } }, { status: 429, headers: { "Retry-After": "120" } }))
      .mockResolvedValueOnce(new Response("private fallback diagnostics", { status: 503, headers: { "Retry-After": "30" } }));
    const error = await structured(config, "JSON", "question", {}, value => answer.parse(value), transport).catch(error => error);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(errorInfo(String(error))).toMatchObject({ provider: "cloudflare", status: 503, retryAt: now + 30_000, previous: { provider: "nvidia", status: 429, kind: "rate_limit", retryAt: now + 120_000 } });
    expect(retryDelay(String(error), 1, () => 0, now).delayMs).toBe(120_000);
    expect(failureReason(error)).toContain("Cloudflare Workers AI is temporarily unavailable");
    expect(failureReason(error)).toContain("NVIDIA NIM is temporarily rate limited");
    expect(String(error)).not.toContain("private");
  });

  it("does not treat invalid primary output followed by fallback 429 as a transient stage", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async url => String(url).includes("nvidia") ? nvidia({ answer: "wrong" }) : new Response("limited", { status: 429 }));
    const error = await structured(config, "JSON", "question", {}, value => answer.parse(value), transport, "nvidia", { fallbackOnInvalid: true }).catch(error => error);
    expect(transport).toHaveBeenCalledTimes(4); // Existing three validation attempts plus one fallback.
    expect(errorInfo(error)).toMatchObject({ provider: "cloudflare", status: 429, previous: { provider: "nvidia", kind: "invalid_output" } });
    expect(retryDelay(error, 1)).toMatchObject({ retry: false, reason: "permanent" });
    expect(failureReason(error)).toContain("output that did not pass validation");
  });

  it("fails quota and auth errors once, and never crosses the explicit OpenAI route", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ error: { type: "insufficient_quota" } }, { status: 429 }));
    const error = await structured({ ...config, generationProvider: "openai", OPENAI_API_KEY: "private-openai" }, "JSON", "question", {}, value => value, transport).catch(error => error);
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    expect(errorInfo(error)).toMatchObject({ provider: "openai", kind: "quota_exhausted" });
    expect(retryDelay(error, 1).retry).toBe(false);
    expect(failureReason(error)).toContain("check the provider's credits or quota reset");
    transport.mockClear().mockImplementation(async () => new Response("private", { status: 401 }));
    await expect(structured(config, "JSON", "question", {}, value => value, transport)).rejects.toMatchObject({ status: 401 });
    expect(transport).toHaveBeenCalledOnce();
  });
});
