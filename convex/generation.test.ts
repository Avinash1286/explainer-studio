/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { testDraft, testSources } from "./testFixtures";
import manifest from "../public/openmoji/manifest.json";
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const token = "e".repeat(64);
const vector = Array.from({ length: 768 }, (_, i) => i === 0 ? 1 : 0);
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function setup(ready = false) {
  const t = convexTest(schema, modules); rateLimiter.register(t); workflow.register(t);
  await t.mutation(api.sessions.start, { token });
  const jobId = await t.mutation(api.jobs.create, { token, topic: "How does water move around the planet?", duration: 60, audience: "beginner", requestId: "generation-test-001" });
  if (ready) {
    for (const name of ["NVIDIA_API_KEY", "FIRECRAWL_API_KEY", "CLOUDFLARE_API_TOKEN"]) vi.stubEnv(name, "test");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32)); vi.stubEnv("GENERATION_ENABLED", "true");
    await t.mutation(internal.icons.put, { vectors: manifest.entries.map(() => vector) });
    await t.mutation(internal.icons.record, { passed: true, reportJson: "test qualification" });
  }
  return { t, jobId };
}
function mockProviders() {
  return vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(url).includes("firecrawl")) return Response.json({ success: true, data: { web: testSources.map(s => ({ title: s.title, url: s.url, markdown: s.text })) } });
    if (String(url).includes("bge-base")) return Response.json({ success: true, result: { data: body.text.map(() => vector) } });
    const prompt = JSON.parse(body.messages[1].content);
    const content = { title: testDraft.title, scenes: testDraft.scenes.map((scene, i) => ({
      title: scene.title, narration: "The sun warms water in lakes and rivers, helping liquid water change into an invisible gas that rises into air. This process moves water around the planet every day.",
      optionalNarration: "", takeaway: "Sunlight helps water move through the atmosphere.", icons: ["sun", "water"], connections: [],
      evidenceIds: [prompt.evidence.find((e: { sourceId: string }) => e.sourceId === (i % 2 ? "source-2" : "source-1")).id],
    })) };
    return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
  });
}
describe("durable topic generation", () => {
  it("permits only one owner planning retry and fences text cards from older workers", async () => {
    vi.useFakeTimers();
    const { t, jobId } = await setup(true); vi.stubGlobal("fetch", mockProviders());
    await t.run(ctx => ctx.db.patch(jobId, { generation: true, status: "failed" }));
    const other = "f".repeat(64); await t.mutation(api.sessions.start, { token: other });
    await expect(t.mutation(api.generation.retryPlanning, { token: other, jobId })).rejects.toThrow("not found");
    await t.mutation(api.generation.retryPlanning, { token, jobId });
    await t.run(ctx => ctx.db.patch(jobId, { status: "failed" }));
    await expect(t.mutation(api.generation.retryPlanning, { token, jobId })).rejects.toThrow("Retry limit");
    await t.run(ctx => ctx.db.patch(jobId, { status: "planning" }));
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    await t.run(async ctx => {
      const task = (await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", jobId)).unique())!;
      const project = JSON.parse(task.projectJson!); project.scenes[0].nodes[0].icon = "TEXT";
      await ctx.db.patch(task._id, { projectJson: JSON.stringify(project) });
      await ctx.db.patch(jobId, { status: "failed" });
    });
    await t.run(ctx => ctx.db.patch(jobId, { status: "rendering" }));
    expect(await t.mutation(internal.media.claim, { worker: "older", protocol: 4 })).toBeNull();
    expect(await t.mutation(internal.media.claim, { worker: "current", protocol: 5 })).not.toBeNull();
  });
  it("lets an operator resume a failed plan without repeating research or reopening rendered work", async () => {
    vi.useFakeTimers();
    const { t, jobId } = await setup(true); const fetcher = mockProviders(); vi.stubGlobal("fetch", fetcher);
    await expect(t.mutation(internal.generation.resumePlanning, { jobId })).rejects.toThrow("Only failed");
    await t.run(ctx => ctx.db.patch(jobId, { generation: true, status: "researching" }));
    await t.action(internal.planning.researchTopic, { jobId });
    await t.run(ctx => ctx.db.patch(jobId, { status: "failed" }));
    await t.mutation(internal.generation.resumePlanning, { jobId });
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe("rendering");
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("firecrawl"))).toHaveLength(1);
    await t.run(ctx => ctx.db.patch(jobId, { status: "failed" }));
    await expect(t.mutation(internal.generation.resumePlanning, { jobId })).rejects.toThrow("pre-render");
  });
  it("stays disabled without qualified providers and does not spend requests", async () => {
    const { t, jobId } = await setup(); const fetcher = mockProviders(); vi.stubGlobal("fetch", fetcher);
    expect(await t.query(api.generation.availability, {})).toEqual({ enabled: false });
    await expect(t.mutation(api.generation.generate, { token, jobId })).rejects.toThrow("provider setup");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("executes real workflow steps with simulated providers and hands a new project to the media queue", async () => {
    vi.useFakeTimers();
    const { t, jobId } = await setup(true); const fetcher = mockProviders(); vi.stubGlobal("fetch", fetcher);
    await t.mutation(api.generation.generate, { token, jobId });
    await t.mutation(api.generation.generate, { token, jobId });
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    const job = await t.run(ctx => ctx.db.get(jobId));
    expect(job?.status).toBe("rendering");
    const artifacts = await t.run(ctx => ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", jobId)).take(4));
    expect(artifacts.map(a => a.stage).sort()).toEqual(["plan", "project", "research"]);
    expect(fetcher).toHaveBeenCalledTimes(2); // Research + authoring; qualified icon vectors are reused.
    expect(await t.mutation(internal.media.claim, { worker: "old-worker" })).toBeNull();
    const task = await t.mutation(internal.media.claim, { worker: "new-worker", protocol: 4 });
    expect(task?.fixtureVersion).toBe("generated-v1");
    expect(JSON.parse(task!.projectJson!).scenes).toHaveLength(4);
  });
  it("reuses research checkpoints and rejects late work after cancellation", async () => {
    const { t, jobId } = await setup(true);
    await t.run(ctx => ctx.db.patch(jobId, { generation: true, status: "researching" }));
    const fetcher = mockProviders(); vi.stubGlobal("fetch", fetcher);
    await t.action(internal.planning.researchTopic, { jobId });
    await t.action(internal.planning.researchTopic, { jobId });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await t.mutation(api.jobs.cancel, { token, jobId });
    await expect(t.mutation(internal.generation.checkpoint, { jobId, stage: "plan", json: "{}" })).rejects.toThrow("no longer active");
    await t.mutation(internal.generation.enqueue, { jobId });
    expect(await t.mutation(internal.media.claim, { worker: "a", protocol: 3 })).toBeNull();
  });
  it("does not expose research or start another browser's lesson", async () => {
    const { t, jobId } = await setup(true);
    const other = "f".repeat(64); await t.mutation(api.sessions.start, { token: other });
    expect(await t.query(api.generation.details, { token: other, jobId })).toBeNull();
    await expect(t.mutation(api.generation.generate, { token: other, jobId })).rejects.toThrow("not found");
  });
  it("turns an exhausted research step into a failed job without a media task", async () => {
    vi.useFakeTimers();
    const { t, jobId } = await setup(true);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await t.mutation(api.generation.generate, { token, jobId });
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe("failed");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await t.mutation(internal.media.claim, { worker: "a", protocol: 3 })).toBeNull();
  });
  it("cancels the real workflow without allowing its completion to revive the job", async () => {
    vi.useFakeTimers();
    const { t, jobId } = await setup(true); vi.stubGlobal("fetch", mockProviders());
    await t.mutation(api.generation.generate, { token, jobId });
    await t.mutation(api.jobs.cancel, { token, jobId });
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe("cancelled");
    expect(await t.mutation(internal.media.claim, { worker: "a", protocol: 3 })).toBeNull();
  });
});
