/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { sampleProject } from "../tests/review-helpers";
import { ProviderError } from "./lib/providers";
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const token = "7".repeat(64), requestId = "resume-request-0001";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
async function setup() {
  const t = convexTest(schema, modules); rateLimiter.register(t); workflow.register(t);
  await t.mutation(api.sessions.start, { token });
  const jobId = await t.mutation(api.jobs.create, { token, topic: "How does water move?", duration: 60, audience: "beginner", requestId: "recovery-fixture-001" });
  await t.run(async ctx => {
    await ctx.db.patch(jobId, { generation: true, status: "failed", stageMessage: "Interrupted before rendering" });
    await ctx.db.insert("generationArtifacts", { jobId, stage: "project", json: JSON.stringify({ project: sampleProject, provenance: {} }), createdAt: Date.now() });
  });
  return { t, jobId };
}
describe("owner checkpoint recovery", () => {
  it("resumes a complete project without provider setup or inference, and deduplicates lost acknowledgements", async () => {
    vi.useFakeTimers();
    const { t, jobId } = await setup(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const key of ["OPENAI_API_KEY", "NVIDIA_API_KEY", "CLOUDFLARE_API_TOKEN", "FIRECRAWL_API_KEY"]) vi.stubEnv(key, "");
    expect(await t.query(api.recovery.details, { token, jobId })).toMatchObject({ canResume: true, resumeFrom: "The saved render project", savedCheckpoints: ["Render project"] });
    await t.mutation(api.recovery.resume, { token, jobId, requestId });
    await t.mutation(api.recovery.resume, { token, jobId, requestId });
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    expect(fetcher).not.toHaveBeenCalled();
    expect(await t.run(ctx => ctx.db.get(jobId))).toMatchObject({ status: "rendering", resumeCount: 1 });
    expect(await t.run(ctx => ctx.db.query("mediaTasks").collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("jobResumes").collect())).toHaveLength(1);
  });
  it("keeps checkpoints private and rejects other owners, cancelled jobs and missing checkpoints", async () => {
    const { t, jobId } = await setup(); const other = "8".repeat(64);
    await t.mutation(api.sessions.start, { token: other });
    expect(await t.query(api.recovery.details, { token: other, jobId })).toBeNull();
    await expect(t.mutation(api.recovery.resume, { token: other, jobId, requestId })).rejects.toThrow("not found");
    await t.run(ctx => ctx.db.patch(jobId, { status: "cancelled" }));
    await expect(t.mutation(api.recovery.resume, { token, jobId, requestId })).rejects.toThrow("Only a failed");
    await t.run(ctx => ctx.db.patch(jobId, { status: "failed", generation: false }));
    expect(await t.query(api.recovery.details, { token, jobId })).toMatchObject({ canResume: false });
    await expect(t.mutation(api.recovery.resume, { token, jobId, requestId })).rejects.toThrow("No recoverable");
  });
  it("honors the final API cooldown without scheduling a sixth attempt", async () => {
    vi.useFakeTimers(); const { t, jobId } = await setup(); const now = Date.now();
    await t.run(ctx => ctx.db.patch(jobId, { status: "planning", generationRunId: "current" }));
    await t.mutation(internal.generationRetry.started, { jobId, runId: "current", stage: "Script planning", attempt: 5 });
    const error = new ProviderError("nvidia", 429, { retryAfterMs: 600_000, retryAt: now + 600_000 });
    expect(await t.mutation(internal.generationRetry.failedAttempt, { jobId, runId: "current", stage: "Script planning", attempt: 5, error: String(error) })).toBeNull();
    expect(await t.query(api.recovery.details, { token, jobId })).toMatchObject({ state: "failed", canResume: true, resumeAvailableAt: now + 600_000, reason: expect.stringContaining("rate limited") });
    await expect(t.mutation(api.recovery.resume, { token, jobId, requestId })).rejects.toThrow("wait 600 seconds");
    expect(await t.run(ctx => ctx.db.query("jobResumes").collect())).toHaveLength(0);
  });
  it("records increasing durable backoff and safely rejects superseded completions", async () => {
    vi.useFakeTimers(); const { t, jobId } = await setup();
    await t.run(ctx => ctx.db.patch(jobId, { status: "planning", generationRunId: "current" }));
    const delays: number[] = [];
    for (let attempt = 1; attempt <= 4; attempt++) {
      await t.mutation(internal.generationRetry.started, { jobId, runId: "current", stage: "Research", attempt });
      const delay = await t.mutation(internal.generationRetry.failedAttempt, { jobId, runId: "current", stage: "Research", attempt, error: String(new ProviderError("firecrawl", 429)) });
      expect(delay).toBeGreaterThanOrEqual(30_000 * 2 ** (attempt - 1));
      expect(delay).toBeLessThanOrEqual(36_000 * 2 ** (attempt - 1)); delays.push(delay!);
    }
    expect(delays[3]).toBeGreaterThan(delays[2]);
    expect(await t.mutation(internal.generationRetry.started, { jobId, runId: "old", stage: "Research", attempt: 1 })).toBe(false);
    expect(await t.mutation(internal.generationRetry.failedAttempt, { jobId, runId: "old", stage: "Research", attempt: 4, error: "invalid" })).toBeNull();
    await expect(t.mutation(internal.generation.checkpoint, { jobId, runId: "old", stage: "research", json: "{}" })).rejects.toThrow("superseded");
    expect(await t.mutation(internal.generation.directorWaiting, { jobId, sceneId: "scene-1" })).toBe(false);
    expect(await t.run(ctx => ctx.db.get(jobId))).toMatchObject({ recovery: { runId: "current", state: "waiting", attempt: 4 } });
  });
  it("stops permanent authentication failures immediately with a safe actionable cause", async () => {
    const { t, jobId } = await setup();
    await t.run(ctx => ctx.db.patch(jobId, { status: "planning", generationRunId: "current" }));
    await t.mutation(internal.generationRetry.started, { jobId, runId: "current", stage: "Model access", attempt: 1 });
    expect(await t.mutation(internal.generationRetry.failedAttempt, { jobId, runId: "current", stage: "Model access", attempt: 1, error: String(new ProviderError("openai", 401)) })).toBeNull();
    expect(await t.query(api.recovery.details, { token, jobId })).toMatchObject({ state: "failed", attempt: 1, reason: expect.stringContaining("credentials") });
  });
  it("resumes rendering with a fresh lease budget while fencing the previous worker", async () => {
    const { t, jobId } = await setup();
    const taskId = await t.run(ctx => ctx.db.insert("mediaTasks", { jobId, fixtureVersion: "generated-v1", projectJson: JSON.stringify(sampleProject), status: "failed", attempt: 3, attemptBase: 0, worker: "old", leaseUntil: 0, createdAt: Date.now() }));
    await t.mutation(api.recovery.resume, { token, jobId, requestId });
    await t.mutation(api.recovery.resume, { token, jobId, requestId });
    const next = await t.mutation(internal.media.claim, { worker: "new", protocol: 7 });
    expect(next).toMatchObject({ taskId, attempt: 4 });
    expect(await t.run(ctx => ctx.db.get(taskId))).toMatchObject({ attemptBase: 3, attempt: 4 });
    await expect(t.mutation(internal.media.renew, { taskId, attempt: 3, worker: "old", message: "stale" })).rejects.toThrow("Stale");
    await t.run(ctx => ctx.db.patch(jobId, { status: "failed" }));
    await t.run(ctx => ctx.db.patch(taskId, { status: "failed" }));
    await expect(t.mutation(api.recovery.resume, { token, jobId, requestId: "resume-request-0002" })).rejects.toThrow("wait");
  });
  it("bounds owner resumes per hour while retaining the same draft and idempotency receipts", async () => {
    vi.useFakeTimers(); const { t, jobId } = await setup();
    const taskId = await t.run(ctx => ctx.db.insert("mediaTasks", { jobId, fixtureVersion: "generated-v1", projectJson: JSON.stringify(sampleProject), status: "failed", attempt: 3, leaseUntil: 0, createdAt: Date.now() }));
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.recovery.resume, { token, jobId, requestId: `resume-hour-limit-${i}` });
      await t.run(async ctx => { await ctx.db.patch(jobId, { status: "failed" }); await ctx.db.patch(taskId, { status: "failed" }); });
      vi.setSystemTime(Date.now() + 61_000);
    }
    await expect(t.mutation(api.recovery.resume, { token, jobId, requestId: "resume-hour-limit-5" })).rejects.toThrow("five resumes per hour");
    await t.mutation(api.recovery.resume, { token, jobId, requestId: "resume-hour-limit-4" });
    expect(await t.run(ctx => ctx.db.get(jobId))).toMatchObject({ status: "failed", resumeCount: 5 });
    expect(await t.run(ctx => ctx.db.query("jobResumes").collect())).toHaveLength(5);
    expect(await t.run(ctx => ctx.db.get(taskId))).toMatchObject({ projectJson: JSON.stringify(sampleProject) });
  });
});
