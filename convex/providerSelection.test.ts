/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workflow from "@convex-dev/workflow/test";
import type { WorkflowId } from "@convex-dev/workflow";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { DEFAULT_OPENAI_MODEL, PROVIDER_MESSAGES } from "../packages/contracts/provider";
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const token = "b".repeat(64);
const brief = { topic: "How does a loudspeaker produce sound?", duration: 60, audience: "beginner" as const, requestId: "provider-choice-test-001" };
beforeEach(() => {
  for (const key of ["OPENAI_API_KEY", "OPENAI_MODEL", "NVIDIA_API_KEY", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "FIRECRAWL_API_KEY", "GENERATION_ENABLED"]) vi.stubEnv(key, undefined);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
async function setup(openai = false) {
  const t = convexTest(schema, modules); rateLimiter.register(t); workflow.register(t);
  await t.mutation(api.sessions.start, { token });
  vi.stubEnv("FIRECRAWL_API_KEY", "research-test-key"); vi.stubEnv("GENERATION_ENABLED", "true");
  if (openai) vi.stubEnv("OPENAI_API_KEY", "sk-private-test-key");
  return t;
}
it("shows independent OpenAI readiness without requiring NIM or embedding credentials", async () => {
  const t = await setup(true);
  const result = await t.query(api.generation.availability, {});
  expect(result).toMatchObject({ enabled: false, providers: { nim: { enabled: false }, openai: { enabled: true } } });
  expect(JSON.stringify(result)).not.toContain("sk-private");
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects missing OpenAI credentials before any lesson, quota or network operation", async () => {
  const t = await setup();
  await expect(t.action(api.generation.checkProvider, { token, generationProvider: "openai" })).rejects.toThrow(PROVIDER_MESSAGES.missingKey);
  expect(await t.query(api.jobs.list, { token })).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});
it.each([[401, PROVIDER_MESSAGES.invalidKey], [404, PROVIDER_MESSAGES.unavailableModel], [429, PROVIDER_MESSAGES.rateLimit]])("returns a safe actionable toast for model preflight HTTP %s", async (status, message) => {
  const t = await setup(true);
  const transport = vi.fn().mockResolvedValue(Response.json({ error: { message: "secret-upstream-detail" } }, { status })); vi.stubGlobal("fetch", transport);
  await expect(t.action(api.generation.checkProvider, { token, generationProvider: "openai" })).rejects.toThrow(message);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(await t.query(api.jobs.list, { token })).toHaveLength(0);
});
it("checks the configured model and keeps provider preflight authenticated", async () => {
  const t = await setup(true);
  const transport = vi.fn().mockResolvedValue(Response.json({ id: DEFAULT_OPENAI_MODEL })); vi.stubGlobal("fetch", transport);
  await expect(t.action(api.generation.checkProvider, { token: "c".repeat(64), generationProvider: "openai" })).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
  await t.action(api.generation.checkProvider, { token, generationProvider: "openai" });
  expect(transport.mock.calls[0][0]).toBe(`https://api.openai.com/v1/models/${DEFAULT_OPENAI_MODEL}`);
});
it("keeps the route in the saved brief and rejects changing it under one request ID", async () => {
  const t = await setup();
  const jobId = await t.mutation(api.jobs.create, { token, ...brief, generationProvider: "openai" });
  expect((await t.query(api.jobs.list, { token }))[0].generationProvider).toBe("openai");
  await expect(t.mutation(api.jobs.create, { token, ...brief, generationProvider: "nim" })).rejects.toThrow("different lesson");
  expect(await t.mutation(api.jobs.create, { token, ...brief, generationProvider: "openai" })).toBe(jobId);
  await t.run(ctx => ctx.db.patch(jobId, { generationProvider: undefined }));
  expect((await t.query(api.jobs.list, { token }))[0].generationProvider).toBe("nim");
});
it("enforces provider readiness on the server even when a client skips preflight", async () => {
  const t = await setup();
  const jobId = await t.mutation(api.jobs.create, { token, ...brief, generationProvider: "openai" });
  await expect(t.mutation(api.generation.generate, { token, jobId })).rejects.toThrow(PROVIDER_MESSAGES.missingKey);
  expect((await t.run(ctx => ctx.db.get(jobId)))?.generation).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
});
it("stops a durable OpenAI job before research if model access disappears", async () => {
  vi.useFakeTimers(); const t = await setup(true);
  const transport = vi.fn().mockResolvedValue(Response.json({ error: "sensitive upstream text" }, { status: 404 })); vi.stubGlobal("fetch", transport);
  const jobId = await t.mutation(api.jobs.create, { token, ...brief, generationProvider: "openai" });
  await t.mutation(api.generation.generate, { token, jobId });
  await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
  expect(await t.run(ctx => ctx.db.get(jobId))).toMatchObject({ generationProvider: "openai", status: "failed", stageMessage: PROVIDER_MESSAGES.unavailableModel });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(await t.run(ctx => ctx.db.query("generationArtifacts").collect())).toHaveLength(0);
});
it("sanitizes provider failures from delayed workflow completions", async () => {
  const t = await setup(true); const jobId = await t.mutation(api.jobs.create, { token, ...brief, generationProvider: "openai" });
  await t.run(ctx => ctx.db.patch(jobId, { workflowId: "workflow-test", status: "planning", generation: true }));
  await t.mutation(internal.generation.finished, { workflowId: "workflow-test" as WorkflowId, result: { kind: "failed", error: "openai request failed (429): do-not-show-this" }, context: { jobId } });
  expect((await t.query(api.jobs.list, { token }))[0].stageMessage).toBe(PROVIDER_MESSAGES.rateLimit);
});
it("checks existing lessons while new generation is paused without spending a review retry", async () => {
  const t = await setup(true); const jobId = await t.mutation(api.jobs.create, { token, ...brief, generationProvider: "openai" });
  vi.stubEnv("GENERATION_ENABLED", "false");
  const transport = vi.fn().mockResolvedValue(Response.json({ id: DEFAULT_OPENAI_MODEL })); vi.stubGlobal("fetch", transport);
  await t.action(api.generation.checkLessonProvider, { token, jobId });
  expect((await t.run(ctx => ctx.db.get(jobId)))?.reviewRetries).toBeUndefined();
  transport.mockResolvedValue(Response.json({}, { status: 404 }));
  await expect(t.action(api.generation.checkLessonProvider, { token, jobId })).rejects.toThrow(PROVIDER_MESSAGES.unavailableModel);
  expect((await t.run(ctx => ctx.db.get(jobId)))?.reviewRetries).toBeUndefined();
});
it("returns missing-key guidance before spending the existing lesson review retry", async () => {
  const t = await setup(); const jobId = await t.mutation(api.jobs.create, { token, ...brief, generationProvider: "openai" });
  await expect(t.mutation(api.reviews.retryReview, { token, jobId, revision: 1 })).rejects.toThrow(PROVIDER_MESSAGES.missingKey);
  expect((await t.run(ctx => ctx.db.get(jobId)))?.reviewRetries).toBeUndefined();
});
