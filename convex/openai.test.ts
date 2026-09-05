import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { internal } from "./_generated/api";
import { authoringInput, authorLesson } from "./lib/authoring";
import { inspectFrames } from "./lib/critic";
import { inspectFacts } from "./lib/factCheck";
import { openAISchema, structured, type ProviderConfig } from "./lib/providers";
import { repairInput, repairScenes } from "./lib/repair";
import { DEFAULT_OPENAI_MODEL, PROVIDER_MESSAGES } from "../packages/contracts/provider";
import { goodReview, reviewSetup, sampleProject } from "../tests/review-helpers";
import { testDraft, testSources } from "./testFixtures";
import { syntheticVisualPlan } from "../tests/director-helpers";

const config: ProviderConfig = { generationProvider: "openai", OPENAI_API_KEY: "test-openai", NVIDIA_API_KEY: "test-nvidia", CLOUDFLARE_API_TOKEN: "test-cf", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32) };
const answerSchema = z.object({ answer: z.literal("yes") }).strict();
const completed = (value: unknown, id = "resp-test") => Response.json({
  id, model: "gpt-5.4-mini-2026-03-17", status: "completed",
  output: [{ type: "reasoning", summary: [] }, { type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }],
  usage: { input_tokens: 100, output_tokens: 80, total_tokens: 180 },
});
const frames = sampleProject.scenes.flatMap((scene, i) => [0, 1].map(j => ({ sceneId: scene.id, frame: i * 360 + j, url: `data:image/jpeg;base64,${btoa(`decoded pixels ${i}-${j}`)}` })));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("OpenAI provider isolation", () => {
  it("uses Responses strict output and records the returned model, response and usage", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(completed({ answer: "yes" }));
    const result = await structured(config, "educational JSON only", "question", z.toJSONSchema(answerSchema), value => answerSchema.parse(value), transport);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ model: DEFAULT_OPENAI_MODEL, store: false, stream: false, instructions: "educational JSON only", text: { format: { type: "json_schema", strict: true } } });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("messages");
    expect(result.attempts).toMatchObject([{ provider: "openai", model: "gpt-5.4-mini-2026-03-17", responseId: "resp-test", usage: { total_tokens: 180 } }]);
  });

  it("fails a missing key before network access and respects a configurable model", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(completed({ answer: "yes" }));
    await expect(structured({ ...config, OPENAI_API_KEY: " " }, "JSON", "question", {}, value => value, transport)).rejects.toThrow(PROVIDER_MESSAGES.missingKey);
    expect(transport).not.toHaveBeenCalled();
    await structured({ ...config, OPENAI_MODEL: "gpt-5.4-mini-2026-03-17" }, "JSON", "question", z.toJSONSchema(answerSchema), value => answerSchema.parse(value), transport);
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).model).toBe("gpt-5.4-mini-2026-03-17");
  });

  it.each([400, 401, 403, 404, 429, 500, 503])("stops on HTTP %i without leaking the error body or crossing providers", async status => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("private diagnostic and credential test-openai", { status }));
    await expect(structured(config, "JSON", "question", {}, value => value, transport, "nvidia", { fallbackOnInvalid: true })).rejects.toThrow(`openai request failed (${status})`);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
  });

  it("keeps retries for invalid output on OpenAI and rejects truncated or refused answers", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => completed({ answer: "wrong" }));
    await expect(structured(config, "JSON", "question", z.toJSONSchema(answerSchema), value => answerSchema.parse(value), transport, "nvidia", { fallbackOnInvalid: true })).rejects.toThrow("valid supported lesson");
    expect(transport).toHaveBeenCalledTimes(3);
    expect(transport.mock.calls.every(call => call[0] === "https://api.openai.com/v1/responses")).toBe(true);
    const retry = JSON.parse(String(transport.mock.calls[1][1]?.body));
    expect(retry.input[1]).toEqual({ role: "assistant", content: '{"answer":"wrong"}' });
    expect(retry.input[2].content).toContain("Validation errors:");
    transport.mockClear().mockImplementation(async () => Response.json({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [{ type: "message", content: [{ type: "output_text", text: '{"answer":"yes"}' }] }] }));
    await expect(structured(config, "JSON", "question", {}, value => value, transport)).rejects.toThrow("truncated");
    expect(transport).toHaveBeenCalledTimes(3);
    transport.mockClear().mockImplementation(async () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "private refusal" }] }] }));
    await expect(structured(config, "JSON", "question", {}, value => value, transport)).rejects.toThrow("openai request failed (422)");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("leaves the NIM and Workers AI fallback unchanged even with an OpenAI key present", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 429 })).mockResolvedValueOnce(Response.json({ success: true, result: { response: { answer: "yes" } } }));
    const result = await structured({ ...config, generationProvider: "nim" }, "JSON", "question", {}, value => answerSchema.parse(value), transport);
    expect(result.attempts.map(attempt => attempt.provider)).toEqual(["nvidia", "cloudflare"]);
    expect(transport.mock.calls.some(call => String(call[0]).includes("openai"))).toBe(false);
  });

  it("retains malformed-response provenance through a bounded repair and sanitizes transport failures", async () => {
    const broken = '{"answer":"yes"';
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ id: "resp-broken", status: "completed", model: DEFAULT_OPENAI_MODEL, output: [{ type: "message", content: [{ type: "output_text", text: broken }] }] })).mockResolvedValueOnce(completed({ answer: "yes" }, "resp-fixed"));
    const result = await structured(config, "JSON", "question", z.toJSONSchema(answerSchema), value => answerSchema.parse(value), transport);
    expect(result.attempts.map(attempt => [attempt.outcome, attempt.responseId])).toEqual([["invalid-json", "resp-broken"], ["success", "resp-fixed"]]);
    expect(JSON.parse(String(transport.mock.calls[1][1]?.body)).input[1].content).toBe(broken);
    transport.mockClear().mockRejectedValue(new Error("private transport details"));
    await expect(structured(config, "JSON", "question", {}, value => value, transport)).rejects.toThrow("openai request failed (0)");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("makes the actual authoring, factual review and scene repair calls on the selected route", async () => {
    const input = authoringInput(testSources, 60, "water cycle", "beginner");
    const authored = { title: "Water cycle", scenes: Array.from({ length: 4 }, (_, i) => ({
      title: `Water ${i + 1}`, narration: "Water absorbs energy from the sun and changes into vapor in the air. It can later condense into droplets, returning to lakes and rivers as part of a cycle.",
      optionalNarration: "", takeaway: "Water moves around the planet in a cycle.", icons: ["sun", "water"], connections: [{ from: "sun", to: "water", label: "warms" }], evidenceIds: [input.evidence.find(e => e.sourceId === (i % 2 ? "source-2" : "source-1"))!.id],
    })) };
    const repair = repairInput(sampleProject, testSources, ["water-0"], "Shorten title");
    const patch = { scenes: [{ ...sampleProject.scenes[0], title: "Evaporation", layout: "comparison", nodes: [{ icon: "2600", label: "Sun", cue: "sun" }, { icon: "1F4A7", label: "Water", cue: "water" }], evidenceIds: [repair.evidence[0].id] }] };
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(completed(authored, "resp-author")).mockResolvedValueOnce(completed(goodReview(), "resp-facts")).mockResolvedValueOnce(completed(patch, "resp-repair"));
    const plan = await authorLesson(config, testSources, 60, "water cycle", "beginner", transport);
    const facts = await inspectFacts(config, sampleProject, testSources, transport);
    const fixed = await repairScenes(config, sampleProject, testSources, ["water-0"], "Shorten title", transport);
    expect([plan, facts, fixed].map(result => result.attempts[0].responseId)).toEqual(["resp-author", "resp-facts", "resp-repair"]);
    expect(fixed.data.project.scenes.slice(1)).toEqual(sampleProject.scenes.slice(1));
    expect(transport.mock.calls.every(call => call[0] === "https://api.openai.com/v1/responses")).toBe(true);
  });

  it("normalizes the real repair schema for strict output without weakening local validators", () => {
    const input = repairInput(sampleProject, testSources, ["water-0"], "Fix diagram");
    const normalized = openAISchema(z.toJSONSchema(input.schema));
    function inspect(value: unknown) {
      if (Array.isArray(value)) { value.forEach(inspect); return; }
      if (!value || typeof value !== "object") return;
      const object = value as Record<string, unknown>;
      expect(object).not.toHaveProperty("oneOf");
      expect(object).not.toHaveProperty("default");
      if (object.type === "object") {
        expect(object.additionalProperties).toBe(false);
        expect(object.required).toEqual(Object.keys(object.properties as object));
      }
      Object.values(object).forEach(inspect);
    }
    inspect(normalized);
    expect(JSON.stringify(normalized)).toContain('"anyOf"');
    expect(JSON.stringify(normalized)).toContain('"maxLength"');
  });
});

describe("OpenAI rendered evidence and workflow", () => {
  it("serializes every decoded JPEG into Responses vision input and preserves provenance", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(completed(goodReview(), "resp-vision"));
    const review = await inspectFrames({ generationProvider: "openai", OPENAI_API_KEY: "test" }, sampleProject, testSources, frames, transport);
    const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
    const images = body.input[0].content.filter((item: { type: string }) => item.type === "input_image");
    expect(images.map((item: { image_url: string }) => item.image_url)).toEqual(frames.map(frame => frame.url));
    expect(images.every((item: { detail: string }) => item.detail === "high")).toBe(true);
    expect(body.input[0].content[0].text).toContain(testSources[0].text);
    expect(review).toMatchObject({ provider: "openai", responseId: "resp-vision", model: "gpt-5.4-mini-2026-03-17" });
    transport.mockClear();
    await expect(inspectFrames(config, sampleProject, testSources, frames.map(frame => ({ ...frame, url: "https://example.org/image.jpg" })), transport)).rejects.toThrow("decoded frame bytes");
    expect(transport).not.toHaveBeenCalled();
  });

  it("builds literal concept notes without embeddings then directs every scene only on OpenAI", async () => {
    vi.useFakeTimers();
    vi.stubEnv("OPENAI_API_KEY", "test-openai");
    const { t, jobId } = await reviewSetup();
    const draft = structuredClone(testDraft);
    draft.scenes[0].nodes[0] = { concept: "text:sun", label: "Sun", cue: "sun" };
    await t.run(async ctx => {
      await ctx.db.patch(jobId, { generationProvider: "openai", status: "planning" });
      for (const task of await ctx.db.query("mediaTasks").withIndex("by_jobId", q => q.eq("jobId", jobId)).collect()) await ctx.db.delete(task._id);
      await ctx.db.insert("generationArtifacts", { jobId, stage: "plan", json: JSON.stringify({ data: draft, attempts: [{ provider: "openai", model: DEFAULT_OPENAI_MODEL, responseId: "resp-plan" }] }), createdAt: Date.now() });
    });
    const transport = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", transport);
    await t.action(internal.planning.retrieveIcons, { jobId });
    expect(transport).not.toHaveBeenCalled();
    transport.mockImplementation(async (_, request) => {
      const prompt = JSON.parse(JSON.parse(String(request?.body)).input[0].content);
      return completed(syntheticVisualPlan(prompt.scene.narration), `resp-direct-${prompt.scene.id}`);
    });
    const ids = await t.query(internal.planning.directorSceneIds, { jobId });
    for (const sceneId of ids) await t.action(internal.planning.directScene, { jobId, sceneId });
    await t.action(internal.planning.finalizeProject, { jobId });
    const artifact = await t.run(ctx => ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", jobId).eq("stage", "project")).unique());
    const result = JSON.parse(artifact!.json);
    expect(result.project.scenes[0].nodes[0].icon).toBe("TEXT");
    expect(result.project.scenes[0].nodes[1].icon).toBe("1F4A7");
    expect(result.provenance).toMatchObject({ generationProvider: "openai", reusedCatalogVectors: false, planningAttempts: [{ responseId: "resp-plan" }] });
    expect(result.provenance).not.toHaveProperty("embeddingSpace");
    expect(transport).toHaveBeenCalledTimes(draft.scenes.length);
    expect(transport.mock.calls.every(call => call[0] === "https://api.openai.com/v1/responses")).toBe(true);
    expect(result.project.scenes.every((scene: { visualPlan?: unknown }) => scene.visualPlan)).toBe(true);
    expect(result.provenance.directorAttempts[0].attempts[0].responseId).toBe(`resp-direct-${draft.scenes[0].id}`);
  });

  it("uses the job choice for both review gates and stores the actual provider and response", async () => {
    vi.useFakeTimers(); vi.stubEnv("OPENAI_API_KEY", "test-openai");
    const { t, jobId, lease, result } = await reviewSetup();
    await t.run(ctx => ctx.db.patch(jobId, { generationProvider: "openai" }));
    await t.mutation(internal.media.complete, { ...lease, result });
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(completed(goodReview(), "resp-facts")).mockResolvedValueOnce(completed(goodReview(), "resp-pixels"));
    vi.stubGlobal("fetch", transport);
    await t.action(internal.reviewActions.inspect, { jobId, revision: 1 });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls.every(call => call[0] === "https://api.openai.com/v1/responses")).toBe(true);
    const body = JSON.parse(String(transport.mock.calls[1][1]?.body));
    expect(body.input[0].content.find((item: { type: string }) => item.type === "input_image").image_url).toBe(`data:image/jpeg;base64,${btoa("synthetic frame")}`);
    const review = await t.run(ctx => ctx.db.query("lessonReviews").withIndex("by_jobId_and_revision", q => q.eq("jobId", jobId).eq("revision", 1)).unique());
    expect(review).toMatchObject({ status: "passed", provider: "openai", responseId: "resp-pixels" });
    expect(JSON.parse(review!.usageJson!).factualAttempts[0].responseId).toBe("resp-facts");
  });
});
