import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectSceneFrames, assembleFrameReviews, validateSceneFrameReview } from "./lib/critic";
import { currentReviewArgs, goodReview, reviewSetup, sampleProject } from "../tests/review-helpers";
import { testSources } from "./testFixtures";
import { internal } from "./_generated/api";

const sceneId = sampleProject.scenes[0].id;
const valid = { summary: "The visible scene was reviewed.", ...goodReview().scenes[0] };
const rejected = { ...valid, visualPass: false, issues: [{ sceneId, kind: "layout" as const, detail: "The material hides the electron.", repair: "Expose the material interior so the electron remains visible." }] };
const frames = [8, 40].map(frame => ({ sceneId, frame, url: `data:image/jpeg;base64,${btoa(`distinct decoded frame ${frame}`)}` }));
const config = { generationProvider: "nim" as const, NVIDIA_API_KEY: "test-nvidia", CLOUDFLARE_API_TOKEN: "test-cf", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), OPENAI_API_KEY: "test-openai" };
const cf = (value: unknown) => Response.json({ success: true, result: { response: value, usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } } });
const nim = (value: unknown, id: string, usage = { prompt_tokens: 31, completion_tokens: 19, total_tokens: 50 }) => Response.json({ id, model: `actual-${id}`, choices: [{ finish_reason: "stop", message: { content: typeof value === "string" ? value : JSON.stringify(value) } }], usage });
const openai = (value: unknown, id: string) => Response.json({ id, model: `actual-${id}`, status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: typeof value === "string" ? value : JSON.stringify(value) }] }], usage: { input_tokens: 11, output_tokens: 13, total_tokens: 24 } });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("one bounded scene review correction", () => {
  it("corrects contradictory verdicts on the same NIM provider with identical evidence and records both paid responses", async () => {
    const invalid = { ...valid, visualPass: false };
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(nim(invalid, "invalid-response", { prompt_tokens: 101, completion_tokens: 17, total_tokens: 118 }))
      .mockResolvedValueOnce(nim(rejected, "corrected-response"));
    const result = await inspectSceneFrames(config, sampleProject, testSources, sceneId, frames, transport);
    expect(result.report).toEqual(rejected);
    expect(result.report.visualPass).toBe(false);
    expect(transport.mock.calls.map(([url]) => String(url).includes("cloudflare") ? "cloudflare" : "nvidia")).toEqual(["cloudflare", "nvidia", "nvidia"]);
    const first = JSON.parse(String(transport.mock.calls[1][1]?.body)), corrected = JSON.parse(String(transport.mock.calls[2][1]?.body));
    expect(first.model).toBe("moonshotai/kimi-k3");
    expect(corrected).toMatchObject({ model: "moonshotai/kimi-k3", temperature: 1, max_tokens: 16384, reasoning_effort: "low" });
    expect(corrected).not.toHaveProperty("response_format");
    expect(corrected).not.toHaveProperty("guided_json");
    expect(corrected).not.toHaveProperty("chat_template_kwargs");
    expect(corrected).not.toHaveProperty("top_p");
    expect(corrected.messages[0]).toEqual(first.messages[0]);
    expect(corrected.messages[1].content.slice(0, -1)).toEqual(first.messages[1].content);
    expect(JSON.parse(corrected.messages[1].content[0].text).sources).toEqual(testSources);
    const feedback = JSON.parse(corrected.messages[1].content.at(-1).text);
    expect(feedback.targetSceneId).toBe(sceneId);
    expect(feedback.validationErrors).toContain("Inconsistent scene review verdict");
    expect(JSON.parse(feedback.previousCandidate)).toEqual(invalid);
    expect(feedback.validationCorrection).toContain("Do not change targetSceneId");
    expect(result.validationAttempts).toMatchObject([
      { provider: "nvidia", model: "actual-invalid-response", responseId: "invalid-response", outcome: "invalid-output", usage: { input_tokens: 101, output_tokens: 17, total_tokens: 118 } },
      { provider: "nvidia", model: "actual-corrected-response", responseId: "corrected-response", outcome: "valid", usage: { input_tokens: 31, output_tokens: 19, total_tokens: 50 } },
    ]);
    expect(result.inference.responseId).toBe("corrected-response");
    const others = sampleProject.scenes.slice(1).map(scene => ({ report: { summary: "Valid scene", ...goodReview().scenes.find(item => item.sceneId === scene.id)! }, inference: { sceneId: scene.id, provider: "nvidia" as const, model: "other", usage: { input_tokens: 5, output_tokens: 7, total_tokens: 12 } } }));
    const assembled = assembleFrameReviews(sampleProject, [result, ...others]);
    expect(JSON.parse(assembled.usageJson).totals).toEqual({ input_tokens: 147, output_tokens: 57, total_tokens: 204 });
    expect(JSON.parse(assembled.usageJson).scenes[0].validationAttempts).toHaveLength(2);
    expect(JSON.parse(assembled.reportJson).scenes[0].visualPass).toBe(false);
  });

  it.each([
    ["malformed JSON", '{"sceneId":'],
    ["foreign scene", { ...valid, sceneId: "foreign-scene" }],
    ["string verdict", { ...valid, factualPass: "true" }],
    ["unknown field", { ...valid, approved: true }],
    ["too many issues", { ...rejected, issues: Array.from({ length: 9 }, () => rejected.issues[0]) }],
    ["contradictory issue", { ...valid, issues: rejected.issues }],
  ])("fails closed after exactly two invalid %s responses", async (_, invalid) => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => cf(invalid));
    await expect(inspectSceneFrames(config, sampleProject, testSources, sceneId, frames, transport)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls.every(([url]) => String(url).includes("cloudflare"))).toBe(true);
  });

  it.each([401, 429, 503])("does not retry or change provider when correction encounters HTTP %i", async status => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(cf({ ...valid, factualPass: false })).mockResolvedValueOnce(new Response("private API diagnostic", { status }));
    await expect(inspectSceneFrames(config, sampleProject, testSources, sceneId, frames, transport)).rejects.toThrow(`cloudflare request failed (${status})`);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls.every(([url]) => String(url).includes("cloudflare"))).toBe(true);
  });

  it("corrects malformed OpenAI JSON on OpenAI with the same exact image inputs", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(openai('{"sceneId":', "invalid-openai")).mockResolvedValueOnce(openai(rejected, "corrected-openai"));
    const result = await inspectSceneFrames({ ...config, generationProvider: "openai" }, sampleProject, testSources, sceneId, frames, transport);
    expect(result.report).toEqual(rejected);
    expect(transport.mock.calls.every(([url]) => String(url) === "https://api.openai.com/v1/responses")).toBe(true);
    const first = JSON.parse(String(transport.mock.calls[0][1]?.body)), last = JSON.parse(String(transport.mock.calls[1][1]?.body));
    expect(last.input[0].content.slice(0, -1)).toEqual(first.input[0].content);
    expect(result.validationAttempts?.map(attempt => attempt.responseId)).toEqual(["invalid-openai", "corrected-openai"]);
    expect(result.validationAttempts?.[0].validationError).toMatch(/valid JSON/i);
  });

  it("rejects forged correction route or final-response metadata", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(cf({ ...valid, visualPass: false })).mockResolvedValueOnce(cf(rejected));
    const result = await inspectSceneFrames(config, sampleProject, testSources, sceneId, frames, transport);
    const foreign = structuredClone(result);
    foreign.validationAttempts![0].provider = "openai";
    expect(() => validateSceneFrameReview(foreign, sceneId)).toThrow(/provenance/i);
    const wrong = structuredClone(result);
    wrong.validationAttempts![1].usage.total_tokens = 999;
    expect(() => validateSceneFrameReview(wrong, sceneId)).toThrow(/provenance/i);
  });

  it("saves a corrected checkpoint once and reuses it without another provider call", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NVIDIA_API_KEY", "test-nvidia"); vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-cf"); vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
    const { t, jobId, lease, result } = await reviewSetup();
    await t.mutation(internal.media.complete, { ...lease, result });
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(cf({ ...valid, visualPass: false })).mockResolvedValueOnce(cf(rejected));
    vi.stubGlobal("fetch", transport);
    const args = await currentReviewArgs(t, jobId);
    await t.action(internal.reviewActions.prepare, args);
    await t.action(internal.reviewActions.checkScene, { ...args, sceneId });
    await t.action(internal.reviewActions.checkScene, { ...args, sceneId });
    const checkpoint = await t.run(ctx => ctx.db.query("reviewCheckpoints").withIndex("by_scope", q => q.eq("jobId", jobId).eq("revision", 1).eq("kind", "scene").eq("sceneId", sceneId)).unique());
    expect(JSON.parse(checkpoint!.json).validationAttempts.map((attempt: { outcome: string }) => attempt.outcome)).toEqual(["invalid-output", "valid"]);
    expect(JSON.parse(checkpoint!.json).report.visualPass).toBe(false);
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
