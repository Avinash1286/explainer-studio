import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectSceneFrames } from "./lib/critic";
import { goodReview, sampleProject } from "../tests/review-helpers";
import { testSources } from "./testFixtures";
import { KIMI_MODEL } from "./lib/providers";
import { syntheticVisualPlan } from "../tests/director-helpers";

const sceneId = sampleProject.scenes[0].id;
const report = { summary: "Scene evidence reviewed.", ...goodReview().scenes[0] };
const frames = [1, 20].map(frame => ({ sceneId, frame, url: `data:image/jpeg;base64,${btoa(`test frame ${frame}`)}` }));
const config = { generationProvider: "nim" as const, NVIDIA_API_KEY: "test-nvidia", CLOUDFLARE_API_TOKEN: "test-cf", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32) };
afterEach(() => vi.restoreAllMocks());

describe("bounded NIM vision reasoning", () => {
  it("retains the exact image packet, bounds reasoning/output, and persists only final JSON with actual usage", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const rich = { ...sampleProject, scenes: sampleProject.scenes.map(scene => scene.id === sceneId ? { ...scene, visualPlan: syntheticVisualPlan(scene.narration) } : scene) };
    const richFrames = [...frames, { sceneId, frame: 30, url: `data:image/jpeg;base64,${btoa("third distinct test frame")}` }];
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(Response.json({ id: "vision-response", model: "actual-vision-model", choices: [{ finish_reason: "stop", message: { content: `<think>Private model reasoning.</think>\n${JSON.stringify(report)}`, reasoning_content: "Separate reasoning must also be ignored." } }], usage: { prompt_tokens: 400, completion_tokens: 700, total_tokens: 1100 } }));
    const result = await inspectSceneFrames(config, rich, testSources, sceneId, richFrames, transport);
    const cf = JSON.parse(String(transport.mock.calls[0][1]?.body));
    const nim = JSON.parse(String(transport.mock.calls[1][1]?.body));
    expect(cf).toMatchObject({ max_tokens: 3000, temperature: 0.1 });
    expect(cf).not.toHaveProperty("reasoning_budget");
    expect(nim).toEqual({ model: KIMI_MODEL, temperature: 1, max_tokens: 16384, reasoning_effort: "low", stream: false, messages: cf.messages });
    expect(timeout.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([90_000, 150_000]);
    expect(nim.messages[1].content.filter((part: { type: string }) => part.type === "image_url").map((part: { image_url: { url: string } }) => part.image_url.url)).toEqual(richFrames.map(frame => frame.url));
    expect(result).toMatchObject({ report, inference: { sceneId, provider: "nvidia", model: "actual-vision-model", responseId: "vision-response", usage: { input_tokens: 400, output_tokens: 700, total_tokens: 1100 } } });
    expect(JSON.stringify(result)).not.toContain("reasoning");
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("keeps Cloudflare primary and makes no Kimi call when that review succeeds", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ success: true, result: { response: report } }));
    const result = await inspectSceneFrames(config, sampleProject, testSources, sceneId, frames, transport);
    expect(result.inference.provider).toBe("cloudflare");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(String(transport.mock.calls[0][0])).toContain("api.cloudflare.com");
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toMatchObject({ max_tokens: 3000, temperature: 0.1, response_format: { type: "json_schema" } });
  });

  it.each([
    { finish_reason: "length", content: JSON.stringify(report), error: "Truncated frame review", calls: 2 },
    { finish_reason: "stop", content: `<think>${JSON.stringify(report)}`, error: "Incomplete frame review reasoning", calls: 2 },
    { finish_reason: "stop", content: "<think>Reasoning only.</think>", error: /JSON|Unexpected/i, calls: 3 },
  ])("rejects incomplete reasoning or output instead of treating it as a verdict ($finish_reason)", async ({ finish_reason, content, error, calls }) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 429 })).mockImplementation(async () => Response.json({ choices: [{ finish_reason, message: { content } }] }));
    await expect(inspectSceneFrames(config, sampleProject, testSources, sceneId, frames, transport)).rejects.toThrow(error);
    expect(transport).toHaveBeenCalledTimes(calls);
  });
});
