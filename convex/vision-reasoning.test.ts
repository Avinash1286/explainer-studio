import { describe, expect, it, vi } from "vitest";
import { inspectSceneFrames } from "./lib/critic";
import { goodReview, sampleProject } from "../tests/review-helpers";
import { testSources } from "./testFixtures";

const sceneId = sampleProject.scenes[0].id;
const report = { summary: "Scene evidence reviewed.", ...goodReview().scenes[0] };
const frames = [1, 20].map(frame => ({ sceneId, frame, url: `data:image/jpeg;base64,${btoa(`test frame ${frame}`)}` }));
const config = { generationProvider: "nim" as const, NVIDIA_API_KEY: "test-nvidia", CLOUDFLARE_API_TOKEN: "test-cf", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32) };

describe("bounded NIM vision reasoning", () => {
  it("retains the exact image packet, bounds reasoning/output, and persists only final JSON with actual usage", async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(Response.json({ id: "vision-response", model: "actual-vision-model", choices: [{ finish_reason: "stop", message: { content: `<think>Private model reasoning.</think>\n${JSON.stringify(report)}`, reasoning_content: "Separate reasoning must also be ignored." } }], usage: { prompt_tokens: 400, completion_tokens: 700, total_tokens: 1100 } }));
    const result = await inspectSceneFrames(config, sampleProject, testSources, sceneId, frames, transport);
    const cf = JSON.parse(String(transport.mock.calls[0][1]?.body));
    const nim = JSON.parse(String(transport.mock.calls[1][1]?.body));
    expect(cf).toMatchObject({ max_tokens: 3000, temperature: 0.1 });
    expect(cf).not.toHaveProperty("reasoning_budget");
    expect(nim).toMatchObject({ model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", temperature: 0.6, top_p: 0.95, reasoning_budget: 2048, max_tokens: 6144, chat_template_kwargs: { enable_thinking: true } });
    expect(nim.max_tokens - nim.reasoning_budget).toBeGreaterThanOrEqual(3000);
    expect(nim.messages).toEqual(cf.messages);
    expect(nim.messages[1].content.filter((part: { type: string }) => part.type === "image_url").map((part: { image_url: { url: string } }) => part.image_url.url)).toEqual(frames.map(frame => frame.url));
    expect(result).toMatchObject({ report, inference: { sceneId, provider: "nvidia", model: "actual-vision-model", responseId: "vision-response", usage: { input_tokens: 400, output_tokens: 700, total_tokens: 1100 } } });
    expect(JSON.stringify(result)).not.toContain("reasoning");
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each([
    { finish_reason: "length", content: JSON.stringify(report), error: "Truncated frame review" },
    { finish_reason: "stop", content: `<think>${JSON.stringify(report)}`, error: "Incomplete frame review reasoning" },
    { finish_reason: "stop", content: "<think>Reasoning only.</think>", error: /JSON|Unexpected/i },
  ])("rejects incomplete reasoning or output instead of treating it as a verdict ($finish_reason)", async ({ finish_reason, content, error }) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 429 })).mockResolvedValueOnce(Response.json({ choices: [{ finish_reason, message: { content } }] }));
    await expect(inspectSceneFrames(config, sampleProject, testSources, sceneId, frames, transport)).rejects.toThrow(error);
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
