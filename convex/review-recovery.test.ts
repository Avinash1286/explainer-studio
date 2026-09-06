import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { ProviderError } from "./lib/providers";
import { currentRepairArgs, currentReviewArgs, goodReview, owner, reviewSetup, sampleProject } from "../tests/review-helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NVIDIA_API_KEY", "test"); vi.stubEnv("CLOUDFLARE_API_TOKEN", "test"); vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });
async function setup() {
  const current = await reviewSetup();
  await current.t.mutation(internal.media.complete, { ...current.lease, result: current.result });
  return current;
}
function successfulTransport(calls: string[]) {
  return vi.fn<typeof fetch>().mockImplementation(async (_, request) => {
    const content = JSON.parse(String(request?.body)).messages[1].content;
    const sceneId = Array.isArray(content) ? JSON.parse(content[0].text).targetSceneId : "facts";
    calls.push(sceneId);
    const full = goodReview(), report = sceneId === "facts" ? full : { summary: full.summary, ...full.scenes.find(scene => scene.sceneId === sceneId)! };
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(report) } }], success: true, result: { response: report } });
  });
}

describe("review and repair owner recovery", () => {
  it("resumes only missing review checks on a new run and fences old actions, failures and verdicts", async () => {
    const { t, jobId, lease, result } = await setup(), first = await currentReviewArgs(t, jobId), calls: string[] = [];
    const fetcher = successfulTransport(calls); vi.stubGlobal("fetch", fetcher);
    await t.action(internal.reviewActions.prepare, first);
    await t.action(internal.reviewActions.checkFacts, first);
    await t.action(internal.reviewActions.checkScene, { ...first, sceneId: sampleProject.scenes[0].id });
    const saved = await t.run(ctx => ctx.db.query("reviewCheckpoints").collect());
    await t.mutation(internal.reviews.reviewRetryDecision, { ...first, label: "Checking scene", attempt: 5, error: String(new ProviderError("cloudflare", 503)) });
    expect(await t.mutation(internal.reviews.resumeFailed, { jobId, revision: 1 })).toBe("review");
    const second = await currentReviewArgs(t, jobId);
    expect(second.runId).not.toBe(first.runId);
    expect(await t.mutation(internal.reviews.reviewRetryDecision, { ...first, label: "Old failed scene", attempt: 5, error: String(new ProviderError("cloudflare", 503)) })).toBeNull();
    await t.mutation(internal.reviews.commit, { ...first, reportJson: JSON.stringify(goodReview()), provider: "cloudflare", model: "old", usageJson: "{}" });
    await t.action(internal.reviewActions.inspect, first);
    expect(calls).toEqual(["facts", sampleProject.scenes[0].id]);
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe("reviewing");
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    expect(calls).toEqual(["facts", ...sampleProject.scenes.map(scene => scene.id)]);
    const final = await t.run(ctx => ctx.db.get(jobId));
    expect(final).toMatchObject({ revision: 1, status: "completed", reviewRetries: 1 });
    expect(final?.recovery).toBeUndefined();
    expect((await t.run(ctx => ctx.db.get(lease.taskId)))?.result).toEqual(result);
    const after = await t.run(ctx => ctx.db.query("reviewCheckpoints").collect());
    for (const row of saved) expect(after.find(item => item._id === row._id)).toEqual(row);
  });

  it("persists Retry-After deadlines including the exhausted final attempt without exposing provider bodies", async () => {
    const { t, jobId } = await setup(), args = await currentReviewArgs(t, jobId), now = Date.now();
    const error = String(new ProviderError("cloudflare", 429, { retryAfterMs: 90_000, retryAt: now + 90_000 }));
    const decision = await t.mutation(internal.reviews.reviewRetryDecision, { ...args, label: "Checking facts", attempt: 1, error });
    expect(decision).toEqual({ retry: true, delayMs: 90_000 });
    expect((await t.run(ctx => ctx.db.get(jobId)))?.recovery).toMatchObject({ state: "waiting", attempt: 1, nextRetryAt: now + 90_000, runId: args.runId });
    const final = await t.mutation(internal.reviews.reviewRetryDecision, { ...args, label: "Checking facts", attempt: 5, error });
    expect(final).toEqual({ retry: false, delayMs: 90_000 });
    const job = await t.run(ctx => ctx.db.get(jobId));
    expect(job?.recovery).toMatchObject({ state: "failed", attempt: 5, nextRetryAt: now + 90_000 });
    expect(job?.stageMessage).toContain("rate limited");
    expect(job?.stageMessage).not.toContain("provider-error");
  });

  it("does not execute another check after cancellation during its retry wait", async () => {
    const { t, jobId } = await setup(), args = await currentReviewArgs(t, jobId);
    await t.mutation(internal.reviews.reviewRetryDecision, { ...args, label: "Checking facts", attempt: 1, error: String(new ProviderError("cloudflare", 503)) });
    await t.mutation(api.jobs.cancel, { token: owner, jobId });
    expect(await t.mutation(internal.reviews.reviewAttempt, { ...args, label: "Checking facts", attempt: 2 })).toBe(false);
    const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetcher);
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    expect(fetcher).not.toHaveBeenCalled();
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe("cancelled");
  });

  it("resumes the latest failed edit in the same revision and retains immutable scoped checkpoints", async () => {
    const { t, jobId } = await setup();
    await t.mutation(internal.reviews.commit, { ...await currentReviewArgs(t, jobId), reportJson: JSON.stringify(goodReview()), provider: "cloudflare", model: "test", usageJson: "{}" });
    const edit = { token: owner, jobId, revision: 1, sceneId: "water-0", instruction: "Shorten this scene title" };
    await t.mutation(api.reviews.revise, { ...edit, requestId: "a-edit-request-001" });
    let rows = await t.run(ctx => ctx.db.query("revisionRequests").collect());
    const first = await currentRepairArgs(t, rows[0]._id);
    await t.mutation(internal.reviews.repairRetryDecision, { ...first, attempt: 5, error: String(new ProviderError("nvidia", 503)) });
    await t.mutation(api.reviews.revise, { ...edit, requestId: "z-edit-request-002" });
    rows = await t.run(ctx => ctx.db.query("revisionRequests").collect());
    const latest = rows.find(row => row.requestId === "z-edit-request-002")!, second = await currentRepairArgs(t, latest._id);
    const context = await t.query(internal.reviews.repairContext, second);
    const checkpoint = { ...second, stage: "script", scopeJson: context!.scopeJson, json: JSON.stringify({ accepted: "opaque compiler-validated fixture" }) };
    expect(await t.mutation(internal.reviews.saveRepairCheckpoint, checkpoint)).toBe(true);
    await expect(t.mutation(internal.reviews.saveRepairCheckpoint, { ...checkpoint, json: "{}" })).rejects.toThrow("immutable");
    await expect(t.mutation(internal.reviews.saveRepairCheckpoint, { ...checkpoint, stage: "scene-foreign" })).rejects.toThrow("scope");
    await t.mutation(internal.reviews.repairRetryDecision, { ...second, attempt: 5, error: String(new ProviderError("nvidia", 503)) });
    expect(await t.mutation(internal.reviews.resumeFailed, { jobId, revision: 1 })).toBe("repair");
    const resumed = await currentRepairArgs(t, latest._id);
    expect(resumed.runId).not.toBe(second.runId);
    expect(await t.query(internal.reviews.readRepairCheckpoint, { ...resumed, stage: checkpoint.stage, scopeJson: checkpoint.scopeJson })).toEqual({ json: checkpoint.json });
    expect(await t.query(internal.reviews.readRepairCheckpoint, { ...second, stage: checkpoint.stage, scopeJson: checkpoint.scopeJson })).toBeNull();
    expect(await t.mutation(internal.reviews.saveRepairCheckpoint, checkpoint)).toBe(false);
    await t.mutation(internal.reviews.replace, { ...second, projectJson: JSON.stringify(sampleProject), evidenceJson: "[]" });
    expect((await t.run(ctx => ctx.db.get(jobId)))?.revision).toBe(1);
    expect(await t.query(internal.reviews.repairContext, first)).toBeNull();
    expect(await t.run(ctx => ctx.db.get(latest._id))).toMatchObject({ status: "pending", resumeCount: 1 });
    expect(await t.run(ctx => ctx.db.get(jobId))).toMatchObject({ userRevisions: 2, revision: 1, status: "planning" });
    // New owner resumes are not capped permanently after one recovery.
    await t.mutation(internal.reviews.repairRetryDecision, { ...resumed, attempt: 5, error: String(new ProviderError("nvidia", 503)) });
    expect(await t.mutation(internal.reviews.resumeFailed, { jobId, revision: 1 })).toBe("repair");
    expect(await t.run(ctx => ctx.db.get(latest._id))).toMatchObject({ resumeCount: 2 });
    const newest = await currentRepairArgs(t, latest._id);
    await t.run(ctx => ctx.db.patch(latest._id, { instruction: "Changed evidence scope" }));
    await expect(t.query(internal.reviews.readRepairCheckpoint, { ...newest, stage: checkpoint.stage, scopeJson: checkpoint.scopeJson })).rejects.toThrow("scope");
  });
});
