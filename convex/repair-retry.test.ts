import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { repairInput } from "./lib/repair";
import { testSources } from "./testFixtures";
import { goodReview, owner, reviewSetup, sampleProject, currentReviewArgs } from "../tests/review-helpers";
import { transientProviderFailure } from "../packages/contracts/provider";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NVIDIA_API_KEY", "test"); vi.stubEnv("CLOUDFLARE_API_TOKEN", "test"); vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

async function setup(automatic = true) {
  const current = await reviewSetup();
  const { t, jobId, lease, result } = current;
  await t.mutation(internal.media.complete, { ...lease, result });
  const report = goodReview();
  if (automatic) {
    report.scenes[0].visualPass = false;
    report.scenes[0].issues = [{ sceneId: "water-0", kind: "layout", detail: "Title too long", repair: "Shorten the title" }];
  }
  await t.mutation(internal.reviews.commit, { ...await currentReviewArgs(t, jobId), reportJson: JSON.stringify(report), provider: "cloudflare", model: "test", usageJson: "{}" });
  if (!automatic) await t.mutation(api.reviews.revise, { token: owner, jobId, revision: 1, requestId: "edit-retry-request-001", sceneId: "water-0", instruction: "Shorten the title" });
  return current;
}

function patchResponse() {
  const input = repairInput(sampleProject, testSources, ["water-0"], "Shorten the title");
  const patch = { scenes: [{ ...sampleProject.scenes[0], title: "Evaporation", layout: "comparison", nodes: [{ icon: "2600", label: "Sun", cue: "sun" }, { icon: "1F4A7", label: "Water", cue: "water" }], evidenceIds: [input.evidence[0].id] }] };
  return Response.json({ choices: [{ message: { content: JSON.stringify(patch) } }] });
}

describe("durable transient repair recovery", () => {
  it.each([true, false])("retries the same %s automatic request after primary/fallback outages without spending another edit", async automatic => {
    const { t, jobId, lease } = await setup(automatic);
    const calls: { url: string; at: number }[] = [];
    const transport = vi.fn<typeof fetch>().mockImplementation(async url => {
      calls.push({ url: String(url), at: Date.now() });
      if (calls.length === 1) return new Response("", { status: 502 });
      if (calls.length === 2) return new Response("", { status: 429 });
      return patchResponse();
    });
    vi.stubGlobal("fetch", transport);
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    expect(calls).toHaveLength(3);
    expect(calls.map(call => new URL(call.url).hostname)).toEqual(["integrate.api.nvidia.com", "api.cloudflare.com", "integrate.api.nvidia.com"]);
    expect(calls[2].at - calls[1].at).toBeGreaterThanOrEqual(30_000);
    const job = await t.run(ctx => ctx.db.get(jobId));
    expect(job).toMatchObject({ revision: 2, status: "rendering" });
    expect(job?.automaticRepairs || 0).toBe(automatic ? 1 : 0);
    expect(job?.userRevisions || 0).toBe(automatic ? 0 : 1);
    const requests = await t.run(ctx => ctx.db.query("revisionRequests").withIndex("by_jobId_and_requestId", q => q.eq("jobId", jobId)).take(5));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ status: "completed", fromRevision: 1, automatic });
    const task = await t.run(ctx => ctx.db.get(lease.taskId));
    expect(task?.revision).toBe(2);
    expect(JSON.parse(task!.projectJson!).scenes.slice(1)).toEqual(sampleProject.scenes.slice(1));
    // Replaying a completed action is a no-op rather than a second paid rewrite.
    await t.action(internal.reviewActions.rewrite, { requestId: requests[0]._id });
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("stops after five transient attempts and reports an outage while retaining the draft", async () => {
    const { t, jobId, lease } = await setup();
    const transport = vi.fn<typeof fetch>().mockImplementation(async url => new Response("private error body", { status: String(url).includes("nvidia") ? 503 : 429 }));
    vi.stubGlobal("fetch", transport);
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    expect(transport).toHaveBeenCalledTimes(10);
    const job = await t.run(ctx => ctx.db.get(jobId));
    expect(job).toMatchObject({ status: "failed", revision: 1, automaticRepairs: 1, recovery: { stage: "repair", state: "failed", attempt: 5, maxAttempts: 5 } });
    const task = await t.run(ctx => ctx.db.get(lease.taskId));
    expect(task?.result).toBeDefined();
    expect(JSON.parse(task!.projectJson!)).toEqual(sampleProject);
    const events = await t.run(ctx => ctx.db.query("jobEvents").withIndex("by_jobId", q => q.eq("jobId", jobId)).take(20));
    expect(events.filter(event => event.kind === "repair_retry")).toHaveLength(4);
    expect(events.some(event => event.message.includes("private error body"))).toBe(false);
  });

  it.each([401, 403, 404])("does not retry permanent credential/model status %i", async status => {
    const { t, jobId } = await setup();
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => new Response("", { status }));
    vi.stubGlobal("fetch", transport);
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    expect(transport).toHaveBeenCalledTimes(1);
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe("failed");
  });

  it("does not multiply the existing bounded repairs after invalid model output", async () => {
    const { t, jobId } = await setup();
    const transport = vi.fn<typeof fetch>().mockImplementation(async url => String(url).includes("nvidia")
      ? Response.json({ choices: [{ message: { content: '{"scenes":[]}' } }] })
      : Response.json({ success: true, result: { response: { scenes: [] } } }));
    vi.stubGlobal("fetch", transport);
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    expect(transport).toHaveBeenCalledTimes(6);
    const job = await t.run(ctx => ctx.db.get(jobId));
    expect(job).toMatchObject({ status: "failed", revision: 1, automaticRepairs: 1 });
    expect(job?.stageMessage).toContain("did not pass validation");
  });

  it("classifies only terminal transient failures and cannot retry a cancelled request", async () => {
    expect(transientProviderFailure("cloudflare request failed (429); primary: nvidia request failed (502)")).toBe(true);
    expect(transientProviderFailure("cloudflare request failed (401); primary: nvidia request failed (503)")).toBe(false);
    expect(transientProviderFailure("Output was truncated")).toBe(false);
    expect(transientProviderFailure("openai request failed (408)")).toBe(true);
    const { t, jobId } = await setup();
    const request = (await t.run(ctx => ctx.db.query("revisionRequests").withIndex("by_jobId_and_requestId", q => q.eq("jobId", jobId)).take(1)))[0];
    await t.mutation(api.jobs.cancel, { token: owner, jobId });
    expect(await t.mutation(internal.reviews.repairWaiting, { requestId: request._id, nextAttempt: 2 })).toBe(false);
    const transport = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", transport);
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    expect(transport).not.toHaveBeenCalled();
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe("cancelled");
  });
});
