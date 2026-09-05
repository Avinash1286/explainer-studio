import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { goodReview, owner, reviewSetup, sampleProject } from "../tests/review-helpers";
import { knownIconIssues, validateReplacement, validateReview } from "../packages/contracts/review";
import { inspectFrames } from "./lib/critic";
import { testSources } from "./testFixtures";
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
const response = (report: unknown = goodReview()) => Response.json({ choices: [{ message: { content: JSON.stringify(report) } }], success: true, result: { response: report, usage: { prompt_tokens: 100, completion_tokens: 100 } } });
function reportForRequest(init?: RequestInit, report = goodReview()) {
  const body = JSON.parse(String(init?.body)), content = body.messages[1].content;
  if (!Array.isArray(content)) return report; // Independent factual review stays full-lesson.
  const { targetSceneId } = JSON.parse(content[0].text);
  return { summary: report.summary, ...report.scenes.find(scene => scene.sceneId === targetSceneId)! };
}
describe("source and rendered-frame review", () => {
  it("allows only one owner retry of an unavailable review", async () => {
    const { t, jobId, lease, result } = await reviewSetup();
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "test"); vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
    await t.mutation(internal.media.complete, { ...lease, result });
    await t.mutation(internal.reviews.unavailable, { jobId, revision: 1 });
    const other = "d".repeat(64); await t.mutation(api.sessions.start, { token: other });
    await expect(t.mutation(api.reviews.retryReview, { token: other, jobId, revision: 1 })).rejects.toThrow("not found");
    await t.mutation(api.reviews.retryReview, { token: owner, jobId, revision: 1 });
    expect((await t.run(ctx => ctx.db.get(jobId)))?.reviewRetries).toBe(1);
    await t.mutation(internal.reviews.unavailable, { jobId, revision: 1 });
    await expect(t.mutation(api.reviews.retryReview, { token: owner, jobId, revision: 1 })).rejects.toThrow("limit");
  });
  it("uses the qualified NVIDIA vision fallback after Cloudflare rate limits, retaining actual image bytes", async () => {
    const frames = sampleProject.scenes.flatMap((s,i) => [0,1].map(j => ({ sceneId: s.id, frame: i*360+j, url: "data:image/jpeg;base64,cGl4ZWxz" })));
    const config = { NVIDIA_API_KEY: "test", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "test" };
    const transport = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url).includes("cloudflare")) return new Response("", { status: 429 });
      const report = reportForRequest(init);
      if (!("sceneId" in report)) throw new Error("Expected a scoped frame request");
      return Response.json({ id: `vision-${report.sceneId}`, model: "actual-nvidia-vision", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(report) } }] });
    });
    const result = await inspectFrames(config, sampleProject, testSources, frames, transport);
    expect(result.provider).toBe("nvidia");
    expect(result).not.toHaveProperty("responseId");
    expect(JSON.parse(result.usageJson).scenes.map((scene: { responseId: string }) => scene.responseId)).toEqual(sampleProject.scenes.map(scene => `vision-${scene.id}`));
    expect(result.model).toBe("actual-nvidia-vision");
    expect(transport).toHaveBeenCalledTimes(sampleProject.scenes.length * 2);
    for (const [, init] of transport.mock.calls) {
      const content = JSON.parse(String(init?.body)).messages[1].content;
      expect(content.filter((part: { type: string }) => part.type === "image_url").map((part: { image_url: { url: string } }) => part.image_url.url)).toEqual([frames[0].url, frames[0].url]);
      expect(content.filter((part: { type: string }) => part.type === "image_url")).toHaveLength(2);
    }
  });
  it("recovers one failed automatic repair without resetting budgets or accepting stale retries", async () => {
    const { t, jobId, lease, result } = await reviewSetup();
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "test"); vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
    await t.mutation(internal.media.complete, { ...lease, result });
    const report = goodReview(); report.scenes[0].visualPass = false;
    report.scenes[0].issues = [{ sceneId: "water-0", kind: "layout", detail: "Long title", repair: "Shorten title" }];
    await t.mutation(internal.reviews.commit, { jobId, revision: 1, reportJson: JSON.stringify(report), provider: "cloudflare", model: "test", usageJson: "{}" });
    const request = (await t.run(ctx => ctx.db.query("revisionRequests").withIndex("by_jobId_and_requestId", q => q.eq("jobId", jobId)).take(1)))[0];
    await t.mutation(internal.reviews.repairFailed, { requestId: request._id });
    await expect(t.mutation(internal.reviews.retryFailedRepair, { jobId, revision: 2 })).rejects.toThrow("same rendered version");
    await t.mutation(internal.reviews.retryFailedRepair, { jobId, revision: 1 });
    expect((await t.run(ctx => ctx.db.get(jobId)))?.automaticRepairs).toBe(1);
    expect((await t.run(ctx => ctx.db.get(request._id)))?.recoveryAttempted).toBe(true);
    await t.mutation(internal.reviews.repairFailed, { requestId: request._id });
    await expect(t.mutation(internal.reviews.retryFailedRepair, { jobId, revision: 1 })).rejects.toThrow("once");
  });
  it("fails closed on rate limits or malformed reviews without contacting another model platform", async () => {
    const frames = sampleProject.scenes.flatMap((s, i) => [0, 1].map(j => ({ sceneId: s.id, frame: i * 360 + j, url: "data:image/jpeg;base64,cGl4ZWxz" })));
    const config = { CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "test" };
    const limited = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 429 }));
    await expect(inspectFrames(config, sampleProject, testSources, frames, limited)).rejects.toThrow("cloudflare request failed (429)");
    expect(limited).toHaveBeenCalledTimes(1);
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: true, result: { response: { summary: "Trust me", scenes: [] } } }));
    await expect(inspectFrames(config, sampleProject, testSources, frames, malformed)).rejects.toThrow();
    expect(malformed).toHaveBeenCalledTimes(2);
    const missing = vi.fn<typeof fetch>();
    await expect(inspectFrames(config, sampleProject, testSources, frames.map(f => ({ ...f, sceneId: "wrong" })), missing)).rejects.toThrow("Missing rendered frames");
    expect(missing).not.toHaveBeenCalled();
  });
  it("maps mixed provider results to their exact scene and aggregates only complete actual usage", async () => {
    const frames = sampleProject.scenes.flatMap((scene, i) => [0, 1].map(j => ({ sceneId: scene.id, frame: i * 360 + j, url: `data:image/jpeg;base64,${btoa(`pixels ${scene.id} ${j}`)}` })));
    const config = { NVIDIA_API_KEY: "test", OPENAI_API_KEY: "must-not-be-used", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "test" };
    const transport = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      const report = reportForRequest(init);
      if (!("sceneId" in report)) throw new Error("Expected a scoped frame request");
      const body = JSON.parse(String(init?.body)), prompt = JSON.parse(body.messages[1].content[0].text);
      expect(prompt.scene.id).toBe(report.sceneId);
      expect(prompt).not.toHaveProperty("project");
      const images = body.messages[1].content.filter((part: { type: string }) => part.type === "image_url");
      expect(images.map((part: { image_url: { url: string } }) => part.image_url.url)).toEqual(frames.filter(frame => frame.sceneId === report.sceneId).map(frame => frame.url));
      expect(body.response_format.type).toBe(String(url).includes("cloudflare") ? "json_schema" : "json_object");
      if (String(url).includes("cloudflare")) {
        if (report.sceneId === sampleProject.scenes[1].id) return new Response("", { status: 429 });
        return Response.json({ success: true, result: { response: report, usage: { prompt_tokens: 100, completion_tokens: 40, unrelated: "excluded" } } });
      }
      return Response.json({ id: "actual-nvidia-response", model: "actual-nvidia-model", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(report) } }], usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 } });
    });
    // Input packet order may be shuffled; each scene is sent in frame order.
    const result = await inspectFrames(config, sampleProject, testSources, [...frames].reverse(), transport);
    expect(result).toMatchObject({ provider: "mixed", model: "per-scene" });
    expect(result).not.toHaveProperty("responseId");
    const usage = JSON.parse(result.usageJson);
    expect(usage.scenes.map((scene: { sceneId: string }) => scene.sceneId)).toEqual(sampleProject.scenes.map(scene => scene.id));
    expect(usage.scenes[1]).toMatchObject({ provider: "nvidia", responseId: "actual-nvidia-response", model: "actual-nvidia-model", usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 } });
    expect(usage.scenes[0]).not.toHaveProperty("responseId");
    expect(usage.totals).toEqual({ input_tokens: 350, output_tokens: 140 });
    expect(result.usageJson).not.toContain("excluded");
    expect(transport).toHaveBeenCalledTimes(5);
    expect(transport.mock.calls.some(([url]) => String(url).includes("openai"))).toBe(false);
    expect(JSON.parse(result.reportJson).scenes.map((scene: { sceneId: string }) => scene.sceneId)).toEqual(sampleProject.scenes.map(scene => scene.id));
  });
  it("rejects duplicated frames or remote image URLs before any scene is reviewed", async () => {
    const frames = sampleProject.scenes.flatMap((scene, i) => [0, 1].map(j => ({ sceneId: scene.id, frame: i * 360 + j, url: "data:image/jpeg;base64,cGl4ZWxz" })));
    const config = { CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "test" }, transport = vi.fn<typeof fetch>();
    await expect(inspectFrames(config, sampleProject, testSources, [frames[0], frames[0], ...frames.slice(2)], transport)).rejects.toThrow("Missing rendered frames");
    await expect(inspectFrames(config, sampleProject, testSources, frames.map(frame => ({ ...frame, url: "https://example.org/frame.jpg" })), transport)).rejects.toThrow("decoded frame bytes");
    expect(transport).not.toHaveBeenCalled();
  });
  it("does not publish a partial review when a later scene result is missing", async () => {
    const { t, jobId, lease, result } = await reviewSetup();
    vi.stubEnv("NVIDIA_API_KEY", "test"); vi.stubEnv("CLOUDFLARE_API_TOKEN", "test"); vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
    await t.mutation(internal.media.complete, { ...lease, result });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_, init) => {
      const report = reportForRequest(init);
      return response("sceneId" in report && report.sceneId === sampleProject.scenes[1].id ? {} : report);
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(t.action(internal.reviewActions.inspect, { jobId, revision: 1 })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(4); // Facts, first scene, missing second scene and its one correction.
    const review = await t.run(ctx => ctx.db.query("lessonReviews").withIndex("by_jobId_and_revision", q => q.eq("jobId", jobId).eq("revision", 1)).unique());
    expect(review?.status).toBe("pending");
    expect(review?.reportJson).toBeUndefined();
    expect((await t.query(api.media.result, { token: owner, jobId }))?.approved).toBe(false);
  });
  it("keeps a rendered lesson a private unapproved draft until actual frame review passes", async () => {
    const { t, jobId, lease, result } = await reviewSetup();
    await t.mutation(internal.media.complete, { ...lease, result });
    await t.mutation(internal.media.complete, { ...lease, result });
    expect((await t.query(api.media.result, { token: owner, jobId }))?.approved).toBe(false);
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe("reviewing");
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_, init) => response(reportForRequest(init))); vi.stubGlobal("fetch", fetcher); vi.stubEnv("NVIDIA_API_KEY", "test"); vi.stubEnv("CLOUDFLARE_API_TOKEN", "test"); vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
    await t.action(internal.reviewActions.inspect, { jobId, revision: 1 });
    const payload = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(fetcher.mock.calls[0][0]).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(fetcher.mock.calls[1][0]).toBe(`https://api.cloudflare.com/client/v4/accounts/${"a".repeat(32)}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct`);
    expect(payload.messages[1].content.filter((c: { type: string }) => c.type === "image_url")).toHaveLength(2);
    expect(payload.messages[1].content.find((c: { type: string }) => c.type === "image_url").image_url.url).toBe(`data:image/jpeg;base64,${btoa("synthetic frame")}`);
    expect(payload.messages[1].content[0].text).toContain(testSources[0].text);
    expect((await t.query(api.media.result, { token: owner, jobId }))?.approved).toBe(true);
    await t.action(internal.reviewActions.inspect, { jobId, revision: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1 + sampleProject.scenes.length);
    await t.mutation(api.sessions.start, { token: "b".repeat(64) });
    expect(await t.query(api.reviews.details, { token: "b".repeat(64), jobId })).toBeNull();
  });
  it("requires complete frame coverage and rejects a different MP4 project manifest", async () => {
    const { t, jobId, lease, result } = await reviewSetup();
    await expect(t.mutation(internal.media.complete, { ...lease, result: { ...result, frames: [] } })).rejects.toThrow("review frames");
    await t.mutation(internal.media.complete, { ...lease, result });
    await t.run(ctx => ctx.db.patch(lease.taskId, { projectJson: JSON.stringify({ ...sampleProject, title: "Different title" }) }));
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(t.action(internal.reviewActions.inspect, { jobId, revision: 1 })).rejects.toThrow("does not match");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("retains an unapproved draft on unavailable critic and ignores stale/cancelled verdicts", async () => {
    const { t, jobId, lease, result } = await reviewSetup();
    await t.mutation(internal.media.complete, { ...lease, result });
    await t.mutation(internal.reviews.unavailable, { jobId, revision: 1 });
    expect((await t.query(api.media.result, { token: owner, jobId }))?.approved).toBe(false);
    await t.mutation(internal.reviews.commit, { jobId, revision: 1, reportJson: JSON.stringify(goodReview()), provider: "cloudflare", model: "test", responseId: "test", usageJson: "{}" });
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe("failed");
    await t.run(ctx => ctx.db.patch(jobId, { status: "reviewing", revision: 2 }));
    await t.mutation(internal.reviews.commit, { jobId, revision: 1, reportJson: JSON.stringify(goodReview()), provider: "cloudflare", model: "test", responseId: "test", usageJson: "{}" });
    await t.mutation(api.jobs.cancel, { token: owner, jobId });
    await t.mutation(internal.reviews.commit, { jobId, revision: 2, reportJson: JSON.stringify(goodReview()), provider: "cloudflare", model: "test", responseId: "test", usageJson: "{}" });
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe("cancelled");
  });
  it("rejects known live icon defects even if the model falsely passes them", async () => {
    const project = structuredClone(sampleProject);
    project.scenes[0].nodes[0] = { icon: "1F343", label: "Pollen", cue: "sun" };
    project.scenes[1].nodes[0] = { icon: "1F343", label: "Ovule", cue: "water" };
    project.scenes[2].nodes[0] = { icon: "1F331", label: "Seed", cue: "cloud" };
    project.scenes[3].nodes[0] = { icon: "1F30D", label: "Soil", cue: "rain" };
    expect(knownIconIssues(project)).toHaveLength(4);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_, init) => response(reportForRequest(init))));
    const result = await inspectFrames({ CLOUDFLARE_API_TOKEN: "test", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32) }, project, testSources, Array.from({ length: 8 }, (_, i) => ({ sceneId: project.scenes[Math.floor(i/2)].id, frame: i, url: "data:image/jpeg;base64,cGl4ZWxz" })));
    expect(JSON.parse(result.reportJson).scenes.every((s: { visualPass: boolean }) => !s.visualPass)).toBe(true);
  });
  it("allows one automatic repair, preserves unaffected scenes, and stops after another rejection", async () => {
    const { t, jobId, lease, result } = await reviewSetup();
    await t.mutation(internal.media.complete, { ...lease, result });
    const report = goodReview(); report.scenes[0].visualPass = false; report.scenes[0].issues = [{ sceneId: "water-0", kind: "layout", detail: "Title too long", repair: "Shorten title" }];
    await t.mutation(internal.reviews.commit, { jobId, revision: 1, reportJson: JSON.stringify(report), provider: "cloudflare", model: "test", responseId: "test", usageJson: "{}" });
    const request = (await t.run(ctx => ctx.db.query("revisionRequests").withIndex("by_jobId_and_requestId", q => q.eq("jobId", jobId)).take(1)))[0];
    const changed = structuredClone(sampleProject); changed.scenes[0].title = "Evaporation";
    await t.mutation(internal.reviews.replace, { requestId: request._id, projectJson: JSON.stringify(changed), evidenceJson: "[]" });
    const task = await t.run(ctx => ctx.db.get(lease.taskId));
    expect(task?.attempt).toBe(1); expect(task?.attemptBase).toBe(1); expect(task?.revision).toBe(2);
    expect(JSON.parse(task!.projectJson!).scenes.slice(1)).toEqual(sampleProject.scenes.slice(1));
    await t.run(async ctx => { await ctx.db.patch(jobId, { status: "reviewing" }); await ctx.db.patch(lease.taskId, { result, status: "completed" }); await ctx.db.insert("lessonReviews", { jobId, revision: 2, status: "pending", createdAt: Date.now() }); });
    await t.mutation(internal.reviews.commit, { jobId, revision: 2, reportJson: JSON.stringify(report), provider: "cloudflare", model: "test", responseId: "test", usageJson: "{}" });
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe("failed");
    expect(await t.run(ctx => ctx.db.query("revisionRequests").withIndex("by_jobId_and_requestId", q => q.eq("jobId", jobId)).take(5))).toHaveLength(1);
  });
  it("fences public edits by owner, version and request id, separately from automatic repair", async () => {
    const { t, jobId, lease, result } = await reviewSetup(); vi.stubEnv("CLOUDFLARE_API_TOKEN", "test"); vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
    await t.mutation(internal.media.complete, { ...lease, result });
    await t.mutation(internal.reviews.commit, { jobId, revision: 1, reportJson: JSON.stringify(goodReview()), provider: "cloudflare", model: "test", responseId: "test", usageJson: "{}" });
    const args = { token: owner, jobId, revision: 1, requestId: "edit-request-000001", sceneId: "water-0", instruction: "Shorten the title" };
    await t.mutation(api.reviews.revise, args); await t.mutation(api.reviews.revise, args);
    expect((await t.run(ctx => ctx.db.get(jobId)))?.userRevisions).toBe(1);
    await expect(t.mutation(api.reviews.revise, { ...args, instruction: "Different instruction" })).rejects.toThrow("already used");
    await expect(t.mutation(api.reviews.revise, { ...args, requestId: "other-request-00001", revision: 99 })).rejects.toThrow("cannot be edited");
    const changed = structuredClone(sampleProject); changed.scenes[1].title = "Out of scope";
    expect(() => validateReplacement(sampleProject, changed, ["water-0"])).toThrow("unaffected");
    expect(() => validateReview({ ...goodReview(), scenes: [goodReview().scenes[0]] }, sampleProject)).toThrow();
  });
});
