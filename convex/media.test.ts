/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { syntheticVisualPlan } from "../tests/director-helpers";
import { sampleProject } from "../tests/review-helpers";
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const token = "c".repeat(64);
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const t = convexTest(schema, modules); rateLimiter.register(t);
  await t.mutation(api.sessions.start, { token });
  const jobId = await t.mutation(api.media.createSample, { token, requestId: "sample-request-0001" });
  return { t, jobId };
}
async function withFiles() {
  const { t, jobId } = await setup();
  const task = (await t.mutation(internal.media.claim, { worker: "worker-a" }))!;
  const lease = { taskId: task.taskId, attempt: task.attempt, worker: "worker-a" };
  const video = await t.run(ctx => ctx.storage.store(new Blob(["video"], { type: "video/mp4" })));
  const project = await t.run(ctx => ctx.storage.store(new Blob(["{}"], { type: "application/json" })));
  const captions = await t.run(ctx => ctx.storage.store(new Blob(["WEBVTT"], { type: "text/vtt" })));
  const poster = await t.run(ctx => ctx.storage.store(new Blob(["png"], { type: "image/png" })));
  // convex-test 0.0.56 omits Blob.type from its fake _storage documents.
  // Fill only that missing mock metadata; production MIME validation stays strict.
  for (const [id, contentType] of [[video, "video/mp4"], [project, "application/json"], [captions, "text/vtt"], [poster, "image/png"]]) {
    await t.run(ctx => (ctx.db as unknown as { patch(id: string, value: { contentType: string }): Promise<void> }).patch(id, { contentType }));
  }
  for (const storageId of [video, project, captions, poster]) await t.mutation(internal.media.registerUpload, { ...lease, storageId });
  return { t, jobId, lease, result: { video, project, captions, poster, durationSeconds: 28 } };
}
describe("media leases and publication", () => {
  it("fences asset jobs to protocol7, including claim replay, while native directed jobs still use6", async () => {
    const {t,jobId} = await setup();
    const taskId = await t.run(async ctx => (await ctx.db.query("mediaTasks").withIndex("by_jobId", q=>q.eq("jobId",jobId)).unique())!._id);
    const native = {...sampleProject,scenes:sampleProject.scenes.map(scene=>({...scene,visualPlan:syntheticVisualPlan(scene.narration)}))};
    // Claim fencing examines the required wire protocol, independently of the
    // later worker/catalog validation; this ID is deliberately synthetic.
    const asset = {...native,scenes:native.scenes.map(scene=>({...scene,visualPlan:{...scene.visualPlan,entities:scene.visualPlan.entities.map((entity,index)=>index===0?{...entity,kind:"asset",assetId:"synthetic-catalog-reference"}:entity)}}))};
    await t.run(ctx=>ctx.db.patch(taskId,{fixtureVersion:"generated-v1",projectJson:JSON.stringify(asset)}));
    expect(await t.mutation(internal.media.claim,{worker:"old",protocol:6})).toBeNull();
    expect(await t.run(async ctx=>(await ctx.db.get(taskId))?.attempt)).toBe(0);
    const claimed = (await t.mutation(internal.media.claim,{worker:"assets",protocol:7}))!;
    expect(claimed.taskId).toBe(taskId);
    expect(await t.mutation(internal.media.claim,{worker:"assets",protocol:6})).toBeNull();
    expect(await t.mutation(internal.media.claim,{worker:"assets",protocol:7})).toEqual(claimed);
    await t.run(ctx=>ctx.db.patch(taskId,{status:"queued",worker:undefined,leaseUntil:0,projectJson:JSON.stringify(native)}));
    expect((await t.mutation(internal.media.claim,{worker:"native",protocol:6}))?.taskId).toBe(taskId);
  });
  it("deduplicates sample creation and lost claim acknowledgements", async () => {
    const { t, jobId } = await setup();
    expect(await t.mutation(api.media.createSample, { token, requestId: "sample-request-0001" })).toBe(jobId);
    const a = await t.mutation(internal.media.claim, { worker: "worker-a" });
    expect(await t.mutation(internal.media.claim, { worker: "worker-a" })).toEqual(a);
    expect(await t.mutation(internal.media.claim, { worker: "worker-b" })).toBeNull();
  });
  it("rejects renewal by the wrong worker", async () => {
    const { t } = await setup(); const task = (await t.mutation(internal.media.claim, { worker: "a" }))!;
    await expect(t.mutation(internal.media.renew, { taskId: task.taskId, attempt: task.attempt, worker: "b", message: "rendering" })).rejects.toThrow("Stale");
  });
  it("recovers an interrupted task and fences the earlier worker", async () => {
    const { t, lease, result } = await withFiles();
    await t.run(ctx => ctx.db.patch(lease.taskId, { leaseUntil: Date.now()-1 }));
    await t.mutation(internal.media.recover, { taskId: lease.taskId, attempt: lease.attempt });
    const next = (await t.mutation(internal.media.claim, { worker: "worker-b" }))!;
    expect(next.attempt).toBe(2);
    await expect(t.mutation(internal.media.complete, { ...lease, result })).rejects.toThrow("Stale");
  });
  it("does not publish after owner cancellation", async () => {
    const { t, jobId, lease, result } = await withFiles();
    await t.mutation(api.jobs.cancel, { token, jobId });
    expect(await t.run(async ctx => (await ctx.db.get(lease.taskId))?.status)).toBe("cancelled");
    await expect(t.mutation(internal.media.complete, { ...lease, result })).rejects.toThrow("cancelled");
    expect(await t.query(api.media.result, { token, jobId })).toBeNull();
  });
  it("publishes all validated artifacts atomically and deduplicates completion", async () => {
    const { t, jobId, lease, result } = await withFiles();
    await t.mutation(internal.media.complete, { ...lease, result });
    await t.mutation(internal.media.complete, { ...lease, result });
    expect((await t.query(api.jobs.list, { token }))[0].status).toBe("completed");
    expect(await t.query(api.media.result, { token, jobId })).toMatchObject({ video: expect.any(String), captions: expect.any(String) });
    await t.mutation(api.sessions.start, { token: "d".repeat(64) });
    expect(await t.query(api.media.result, { token: "d".repeat(64), jobId })).toBeNull();
  });
  it("rejects changed completion and mismatched content types", async () => {
    const { t, lease, result } = await withFiles();
    await expect(t.mutation(internal.media.complete, { ...lease, result: { ...result, video: result.project, project: result.video } })).rejects.toThrow("Artifact");
    await t.mutation(internal.media.complete, { ...lease, result });
    await expect(t.mutation(internal.media.complete, { ...lease, result: { ...result, durationSeconds: 29 } })).rejects.toThrow("changed");
  });
  it("collects abandoned uploads but preserves published ones", async () => {
    const { t, lease, result } = await withFiles();
    await t.mutation(internal.media.complete, { ...lease, result });
    const rows = await t.run(ctx => ctx.db.query("mediaUploads").take(4));
    await t.mutation(internal.media.collectUpload, { id: rows[0]._id });
    expect(await t.run(async ctx => (await ctx.storage.get(result.video)) !== null)).toBe(true);
    const abandoned = await withFiles();
    const row = (await abandoned.t.run(ctx => ctx.db.query("mediaUploads").take(1)))[0];
    await abandoned.t.mutation(internal.media.collectUpload, { id: row._id });
    expect(await abandoned.t.run(async ctx => (await ctx.storage.get(row.storageId)) === null)).toBe(true);
  });
  it("stops recovery after three attempts", async () => {
    const { t, jobId } = await setup();
    for (let attempt=1; attempt<=3; attempt++) {
      const task = (await t.mutation(internal.media.claim, { worker: `worker-${attempt}` }))!;
      await t.run(ctx => ctx.db.patch(task.taskId, { leaseUntil: Date.now()-1 }));
      await t.mutation(internal.media.recover, { taskId: task.taskId, attempt });
    }
    expect(await t.mutation(internal.media.claim, { worker: "fourth" })).toBeNull();
    expect((await t.query(api.jobs.list, { token })).find(j => j._id === jobId)?.status).toBe("failed");
    await t.mutation(internal.media.retryFailed, { jobId });
    const retry = (await t.mutation(internal.media.claim, { worker: "operator-retry" }))!;
    expect(retry.attempt).toBe(4);
    vi.stubEnv("WORKER_AUTH_TOKEN", "w".repeat(64));
    const renewed = await t.fetch("/worker/media", { method: "POST", headers: { Authorization: `Bearer ${"w".repeat(64)}` }, body: JSON.stringify({ op: "renew", taskId: retry.taskId, attempt: 4, worker: "operator-retry", message: "Rendering" }) });
    expect(renewed.status).toBe(200);
    await expect(t.mutation(internal.media.renew, { taskId: retry.taskId, attempt: 1, worker: "worker-1", message: "stale" })).rejects.toThrow("Stale");
    await expect(t.mutation(internal.media.retryFailed, { jobId })).rejects.toThrow("Only failed");
  });
  it("abandons a failed attempt without renewing it indefinitely", async () => {
    const { t } = await setup();
    const first = (await t.mutation(internal.media.claim, { worker: "a" }))!;
    await t.mutation(internal.media.abandon, { taskId: first.taskId, attempt: first.attempt, worker: "a" });
    await t.mutation(internal.media.recover, { taskId: first.taskId, attempt: first.attempt });
    const next = (await t.mutation(internal.media.claim, { worker: "b" }))!;
    expect(next.attempt).toBe(2);
    await t.mutation(internal.media.abandon, { taskId: first.taskId, attempt: first.attempt, worker: "a" });
    await expect(t.mutation(internal.media.renew, { taskId: next.taskId, attempt: next.attempt, worker: "b", message: "Rendering" })).resolves.toBeNull();
  });
});
