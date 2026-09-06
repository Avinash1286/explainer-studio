/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { testDraft, testSources } from "./testFixtures";
import manifest from "../public/openmoji/manifest.json";
import { syntheticVisualPlan } from "../tests/director-helpers";
import { retryableDirectorFailure } from "./generation";
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const token = "e".repeat(64);
const vector = Array.from({ length: 768 }, (_, i) => i === 0 ? 1 : 0);
function requestPrompt(body: { messages?: { content: string }[] }) {
  if (!body.messages) return null;
  const packet = JSON.parse(body.messages[1].content);
  return packet.originalRequest ? JSON.parse(packet.originalRequest) : packet;
}
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
    const prompt = requestPrompt(body);
    if (prompt.scene?.narration) return Response.json({ choices: [{ message: { content: JSON.stringify(syntheticVisualPlan(prompt.scene.narration)) } }] });
    const content = { title: testDraft.title, scenes: testDraft.scenes.map((scene, i) => ({
      title: scene.title, narration: "The sun warms water in lakes and rivers, helping liquid water change into an invisible gas that rises into air. This process moves water around the planet every day.",
      optionalNarration: "", takeaway: "Sunlight helps water move through the atmosphere.", icons: ["sun", "water"], connections: [],
      evidenceIds: [prompt.evidence.find((e: { sourceId: string }) => e.sourceId === (i % 2 ? "source-2" : "source-1")).id],
    })) };
    return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
  });
}
describe("durable topic generation", () => {
  it("retries only transient director failures, including a transient primary before fallback", () => {
    expect(retryableDirectorFailure("Error: cloudflare request failed (429); primary: nvidia request failed (0)")).toBe(true);
    expect(retryableDirectorFailure("Error: openai request failed (503)")).toBe(true);
    expect(retryableDirectorFailure("Error: cloudflare request failed (401); primary: nvidia request failed (503)")).toBe(false);
    expect(retryableDirectorFailure("Error: cloudflare request failed (429); primary: beats.2.x must be a number")).toBe(false);
    expect(retryableDirectorFailure("Planner could not produce a valid supported lesson")).toBe(false);
  });
  it("durably retries one transient unsaved scene and keeps completed scene inference sequential", async () => {
    vi.useFakeTimers();
    const { t, jobId } = await setup(true); const base = mockProviders(); const sceneCalls: string[] = [];
    let targetCalls = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, request) => {
      const body = JSON.parse(String(request?.body));
      const prompt = requestPrompt(body);
      if (prompt?.scene) {
        sceneCalls.push(prompt.scene.id);
        if (prompt.scene.id === "scene-2" && ++targetCalls <= 2) return new Response("temporary", { status: targetCalls === 1 ? 503 : 429 });
      }
      return base(url, request);
    });
    vi.stubGlobal("fetch", fetcher);
    await t.mutation(api.generation.generate, { token, jobId });
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    expect((await t.run(ctx => ctx.db.get(jobId)))).toMatchObject({ status: "rendering", revision: 1 });
    expect(sceneCalls).toEqual(["scene-1", "scene-2", "scene-2", "scene-2", "scene-3", "scene-4"]);
    const events = await t.run(ctx => ctx.db.query("jobEvents").withIndex("by_jobId", q => q.eq("jobId", jobId)).collect());
    expect(events.filter(event => event.kind === "director_retry")).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", jobId)).collect())).toHaveLength(1);
  });
  it.each(["auth", "invalid-output"] as const)("does not durably repeat a director %s failure", async failure => {
    vi.useFakeTimers();
    const { t, jobId } = await setup(true); const base = mockProviders(); let directorCalls = 0;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (url, request) => {
      const body = JSON.parse(String(request?.body));
      const prompt = requestPrompt(body);
      if (prompt?.scene) {
        directorCalls++;
        if (failure === "auth") return new Response("unauthorized", { status: 401 });
        if (String(url).includes("cloudflare")) return new Response("rate limit", { status: 429 });
        return Response.json({ choices: [{ message: { content: "{}" } }] });
      }
      return base(url, request);
    }));
    await t.mutation(api.generation.generate, { token, jobId });
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe("failed");
    expect(directorCalls).toBe(failure === "auth" ? 1 : 4);
    const events = await t.run(ctx => ctx.db.query("jobEvents").withIndex("by_jobId", q => q.eq("jobId", jobId)).collect());
    expect(events.filter(event => event.kind === "director_retry")).toHaveLength(0);
  });
  it("keeps public generation closed during an operator canary and still requires qualified providers", async () => {
    vi.useFakeTimers();
    const { t, jobId } = await setup();
    await expect(t.mutation(internal.generation.startCanary, { jobId })).rejects.toThrow("qualified");
    const ready = await setup(true); vi.stubEnv("GENERATION_ENABLED", "false");
    expect(await ready.t.query(api.generation.availability, {})).toMatchObject({ enabled: false });
    await ready.t.mutation(internal.generation.startCanary, { jobId: ready.jobId });
    expect((await ready.t.run(ctx => ctx.db.get(ready.jobId)))?.generation).toBe(true);
    expect(await ready.t.query(api.generation.availability, {})).toMatchObject({ enabled: false });
    await expect(ready.t.mutation(internal.generation.startCanary, { jobId: ready.jobId })).rejects.toThrow("queued");
  });
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
    expect(await t.mutation(internal.media.claim, { worker: "current", protocol: 6 })).not.toBeNull();
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
    expect(await t.query(api.generation.availability, {})).toMatchObject({ enabled: false });
    await expect(t.mutation(api.generation.generate, { token, jobId })).rejects.toThrow("paused");
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
    const artifacts = await t.run(ctx => ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", jobId)).take(14));
    expect(artifacts.map(a => a.stage).sort()).toEqual(["base", "plan", "project", "research", "visual-scene-1", "visual-scene-2", "visual-scene-3", "visual-scene-4"]);
    expect(fetcher).toHaveBeenCalledTimes(6); // Research + script + four separately saved visual plans.
    expect(await t.mutation(internal.media.claim, { worker: "old-worker" })).toBeNull();
    expect(await t.mutation(internal.media.claim, { worker: "previous-worker", protocol: 5 })).toBeNull();
    const task = await t.mutation(internal.media.claim, { worker: "new-worker", protocol: 6 });
    expect(task?.fixtureVersion).toBe("generated-v1");
    expect(JSON.parse(task!.projectJson!).scenes).toHaveLength(4);
    expect(JSON.parse(task!.projectJson!).scenes.every((scene: { visualPlan?: unknown }) => scene.visualPlan)).toBe(true);
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
  it("resumes failed direction without charging again for already saved scenes", async () => {
    vi.useFakeTimers();
    const { t, jobId } = await setup(true);
    const base = mockProviders(); let unavailable = true;
    const calls: string[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, request) => {
      const body = JSON.parse(String(request?.body));
      const prompt = body.messages ? JSON.parse(body.messages[1].content) : null;
      if (prompt?.scene) {
        calls.push(prompt.scene.id);
        if (unavailable && prompt.scene.id === "scene-3") return new Response("unavailable", { status: 503 });
      }
      return base(url, request);
    });
    vi.stubGlobal("fetch", fetcher);
    await t.mutation(api.generation.generate, { token, jobId });
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers(), 2000);
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe("failed");
    const saved = await t.run(ctx => ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", jobId)).take(14));
    const savedIds = saved.filter(a => a.stage.startsWith("visual-")).map(a => a.stage.slice(7));
    expect(savedIds).toEqual(expect.arrayContaining(["scene-1", "scene-2"]));
    const counts = new Map(savedIds.map(id => [id, calls.filter(call => call === id).length]));
    const failedJob = (await t.run(ctx => ctx.db.get(jobId)))!;
    await t.run(ctx => ctx.db.patch(failedJob.sessionId, { expired: false, expiresAt: Date.now() + 86_400_000 }));
    expect(await t.query(api.recovery.details, { token, jobId })).toMatchObject({ canResume: true, savedCheckpoints: expect.arrayContaining(["Research and sources", "Narration script", "2 illustrated scenes"]) });
    unavailable = false;
    vi.stubEnv("FIRECRAWL_API_KEY", ""); // Saved research does not need this provider again.
    await t.mutation(api.recovery.resume, { token, jobId, requestId: "resume-direction-0001" });
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe("rendering");
    for (const id of savedIds) expect(calls.filter(call => call === id)).toHaveLength(counts.get(id)!);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("firecrawl"))).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", jobId)).collect())).toHaveLength(1);
  });
  it("rejects unfinished direction, forged scene checkpoints and stale actions before inference", async () => {
    const { t, jobId } = await setup(true); const fetcher = mockProviders(); vi.stubGlobal("fetch", fetcher);
    await t.run(ctx => ctx.db.patch(jobId, { generation: true, status: "researching" }));
    await t.action(internal.planning.researchTopic, { jobId });
    await t.action(internal.planning.planScenes, { jobId });
    await t.action(internal.planning.retrieveIcons, { jobId });
    fetcher.mockClear();
    await expect(t.action(internal.planning.finalizeProject, { jobId })).rejects.toThrow("Every generated scene");
    await expect(t.mutation(internal.generation.checkpoint, { jobId, stage: "visual-missing", json: JSON.stringify({ sceneId: "missing", visualPlan: syntheticVisualPlan(testDraft.scenes[0].narration) }) })).rejects.toThrow("Unknown directed scene");
    await expect(t.mutation(internal.generation.checkpoint, { jobId, stage: "arbitrary", json: "{}" })).rejects.toThrow("Unsupported checkpoint");
    await t.run(ctx => ctx.db.patch(jobId, { status: "cancelled" }));
    expect(await t.mutation(internal.generation.directorWaiting, { jobId, sceneId: "scene-1" })).toBe(false);
    await expect(t.action(internal.planning.directScene, { jobId, sceneId: "scene-1" })).rejects.toThrow("no longer active");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refreshes only invalid pre-render visual caches and preserves their paid attempt history", async () => {
    const { t, jobId } = await setup(true); const fetcher = mockProviders(); vi.stubGlobal("fetch", fetcher);
    await t.run(ctx => ctx.db.patch(jobId, { generation: true, status: "researching" }));
    await t.action(internal.planning.researchTopic, { jobId });
    await t.action(internal.planning.planScenes, { jobId });
    await t.action(internal.planning.retrieveIcons, { jobId });
    await t.action(internal.planning.directScene, { jobId, sceneId: "scene-1" });
    const before = (await t.query(internal.generation.context, { jobId })).artifacts;
    const compiled = JSON.parse(before.find(a => a.stage === "base")!.json).project;
    const oldPlan = syntheticVisualPlan(compiled.scenes[1].narration);
    oldPlan.entities[0].kind = "water"; // Valid in the prior release; no actual transform state.
    await t.run(ctx => ctx.db.insert("generationArtifacts", { jobId, stage: "visual-scene-2", json: JSON.stringify({ sceneId: "scene-2", visualPlan: oldPlan, attempts: [{ provider: "nvidia", model: "prior-model", responseId: "prior-response", outcome: "success", elapsedMs: 1 }] }), createdAt: Date.now() }));
    fetcher.mockClear();
    await t.action(internal.planning.directScene, { jobId, sceneId: "scene-1" });
    await t.action(internal.planning.directScene, { jobId, sceneId: "scene-2" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const after = (await t.query(internal.generation.context, { jobId })).artifacts;
    for (const artifact of before) expect(after.find(a => a.stage === artifact.stage)?.json).toBe(artifact.json);
    const refreshed = JSON.parse(after.find(a => a.stage === "visual-scene-2")!.json);
    expect(refreshed.visualPlan.entities[0].kind).toBe("beaker");
    expect(refreshed.attempts.map((attempt: { outcome: string }) => attempt.outcome)).toEqual(["superseded-invalid-plan", "success"]);
    expect(refreshed.attempts[0].responseId).toBe("prior-response");
    await t.run(ctx => ctx.db.patch(jobId, { revision: 2 }));
    await expect(t.mutation(internal.generation.checkpoint, { jobId, stage: "visual-scene-3", json: JSON.stringify({ ...refreshed, sceneId: "scene-3" }) })).rejects.toThrow("pre-render");
  });
  it.each(["missing", "unmatched"] as const)("rejects %s planning evidence before directing while retaining the full research", async corruption => {
    const { t, jobId } = await setup(true); const fetcher = mockProviders(); vi.stubGlobal("fetch", fetcher);
    await t.run(ctx => ctx.db.patch(jobId, { generation: true, status: "researching" }));
    await t.action(internal.planning.researchTopic, { jobId });
    await t.action(internal.planning.planScenes, { jobId });
    await t.action(internal.planning.retrieveIcons, { jobId });
    const before = (await t.query(internal.generation.context, { jobId })).artifacts;
    const base = before.find(artifact => artifact.stage === "base")!;
    const record = JSON.parse(base.json);
    if (corruption === "missing") delete record.provenance.sceneEvidence;
    else record.provenance.sceneEvidence[0].evidence[0].quote = "This supposed quotation was never retrieved.";
    await t.run(ctx => ctx.db.patch(base._id, { json: JSON.stringify(record) }));
    fetcher.mockClear();
    await expect(t.action(internal.planning.directScene, { jobId, sceneId: "scene-1" })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    const after = (await t.query(internal.generation.context, { jobId })).artifacts;
    expect(after.find(artifact => artifact.stage === "research")!.json).toBe(before.find(artifact => artifact.stage === "research")!.json);
    expect(after.some(artifact => artifact.stage === "visual-scene-1")).toBe(false);
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
    expect(fetcher).toHaveBeenCalledTimes(5);
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
  it("cancels a media job after its planning workflow has already completed", async () => {
    vi.useFakeTimers();
    const { t, jobId } = await setup(true); vi.stubGlobal("fetch", mockProviders());
    await t.mutation(api.generation.generate, { token, jobId });
    await t.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
    const job = await t.run(ctx => ctx.db.get(jobId));
    expect(job?.status).toBe("rendering");
    // Draining scheduled work also expires sessions in this harness.
    await t.run(ctx => ctx.db.patch(job!.sessionId, { expiresAt: Date.now() + 60_000, expired: false }));
    const task = await t.mutation(internal.media.claim, { worker: "active-renderer", protocol: 6 });
    expect(task).not.toBeNull();
    await t.mutation(api.jobs.cancel, { token, jobId });
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe("cancelled");
    await expect(t.mutation(internal.media.renew, { taskId: task!.taskId, attempt: task!.attempt, worker: "active-renderer", message: "late progress" })).rejects.toThrow();
  });
});
