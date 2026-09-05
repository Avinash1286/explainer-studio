import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { decodingSchema, embed, research, structured } from "./lib/providers";
import { alignDraftCues, planningInput, validateDraft } from "../packages/contracts/generation";
import { testDraft, testSources } from "./testFixtures";
const config = { NVIDIA_API_KEY: "test", CLOUDFLARE_API_TOKEN: "test", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), FIRECRAWL_API_KEY: "test" };
const schema = z.object({ answer: z.literal("yes") });
const primary = (content: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
const backup = (content: unknown) => Response.json({ success: true, result: { response: content } });
describe("provider boundaries", () => {
  it("keeps complete-string decoding while enforcing string bounds locally", async () => {
    const bounded = z.object({ sentence: z.string().max(12).regex(/[.!?]$/), rows: z.array(z.string()).max(2) });
    const json = decodingSchema(z.toJSONSchema(bounded));
    expect(JSON.stringify(json)).not.toContain("maxLength");
    expect(JSON.stringify(json)).toContain("maxItems");
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(primary({ sentence: "A complete sentence that is too long.", rows: [] })).mockResolvedValueOnce(primary({ sentence: "It works.", rows: [] }));
    const result = await structured(config, "JSON", "question", z.toJSONSchema(bounded), x => bounded.parse(x), transport);
    expect(result.attempts.map(a => a.outcome)).toEqual(["invalid-output", "success"]);
  });
  it("optionally switches a repair to Cloudflare only after exhausting bounded validation attempts", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async url => String(url).includes("nvidia") ? primary({ answer: "wrong" }) : backup({ answer: "yes" }));
    const result = await structured(config, "JSON", "question", {}, x => schema.parse(x), transport, "nvidia", { fallbackOnInvalid: true });
    expect(result.attempts.map(a => a.provider)).toEqual(["nvidia", "nvidia", "nvidia", "cloudflare"]);
    expect(result.data.answer).toBe("yes");
    transport.mockImplementation(async () => new Response("private body", { status: 401 }));
    await expect(structured(config, "JSON", "question", {}, x => x, transport, "nvidia", { fallbackOnInvalid: true })).rejects.toThrow("401");
  });
  it("retains malformed JSON in repair feedback and never silently fixes or accepts it", async () => {
    const broken = '{"answer":"yes"';
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ choices: [{ message: { content: broken } }] })).mockResolvedValueOnce(primary({ answer: "yes" }));
    const result = await structured(config, "JSON", "question", {}, x => schema.parse(x), transport);
    expect(result.attempts.map(a => a.outcome)).toEqual(["invalid-json", "success"]);
    const messages = JSON.parse(String(transport.mock.calls[1][1]?.body)).messages;
    expect(messages[2]).toEqual({ role: "assistant", content: broken });
    expect(messages[3].content).toContain("escape quotes");
  });
  it("rejects a truncated completion even when its partial content parses", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ choices: [{ finish_reason: "length", message: { content: '{"answer":"yes"}' } }] }));
    await expect(structured(config, "JSON", "question", {}, x => schema.parse(x), transport)).rejects.toThrow("truncated");
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it("switches to Cloudflare after a primary rate limit and records attempts", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 429 })).mockResolvedValueOnce(backup({ answer: "yes" }));
    const result = await structured(config, "JSON", "question", z.toJSONSchema(schema), x => schema.parse(x), transport);
    expect(result.attempts.map(a => a.outcome)).toEqual(["http-429", "success"]);
    expect(String(transport.mock.calls[1][0])).toContain("api.cloudflare.com");
    expect(JSON.parse(String(transport.mock.calls[1][1]?.body)).messages).toEqual(JSON.parse(String(transport.mock.calls[0][1]?.body)).messages);
  });
  it("does not hide credential errors with fallback or retries", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("secret-error-body", { status: 401 }));
    await expect(structured(config, "JSON", "question", {}, x => x, transport)).rejects.toThrow("nvidia request failed (401)");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("repairs invalid JSON output twice, then fails closed", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => primary({ answer: "wrong" }));
    await expect(structured(config, "JSON", "question", {}, x => schema.parse(x), transport)).rejects.toThrow("valid supported lesson");
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it("keeps repairs within a provider and accepts a corrected result", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(primary({ answer: "wrong" })).mockResolvedValueOnce(primary({ answer: "yes" }));
    expect((await structured(config, "JSON", "question", {}, x => schema.parse(x), transport)).data.answer).toBe("yes");
    const messages = JSON.parse(String(transport.mock.calls[1][1]?.body)).messages;
    expect(messages[2]).toEqual({ role: "assistant", content: '{"answer":"wrong"}' });
    expect(messages[3].content).toContain("Validation errors:");
    expect(messages[3].content).toContain("answer");
  });
  it("rejects wrong embedding dimensions and zero vectors", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ success: true, result: { data: [[0, 1]] } }));
    await expect(embed(config, ["water"], transport)).rejects.toThrow();
    transport.mockImplementation(async () => Response.json({ success: true, result: { data: [Array(768).fill(0)] } }));
    await expect(embed(config, ["water"], transport)).rejects.toThrow("Invalid embedding");
  });
  it("requires scraped content from two domains, never just search snippets", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ success: true, data: { web: testSources.map(s => ({ title: s.title, url: s.url, description: s.text })) } }));
    await expect(research(config, "water", transport)).rejects.toThrow("two independent");
    transport.mockImplementation(async () => Response.json({ success: true, data: { web: testSources.map(s => ({ title: s.title, url: s.url, markdown: s.text })) } }));
    expect(await research(config, "water", transport)).toHaveLength(2);
  });
});
describe("scene grounding", () => {
  it("builds bounded exact quote options and enforces narration length in the generation schema", () => {
    const input = planningInput(testSources, 60, "water cycle");
    for (const excerpt of input.excerpts) {
      expect(excerpt.quotes.length).toBeLessThanOrEqual(8);
      for (const quote of excerpt.quotes) {
        expect(testSources.find(s => s.id === excerpt.id)!.text).toContain(quote);
        expect(quote.length).toBeLessThanOrEqual(180);
      }
    }
    const draft = structuredClone(testDraft);
    draft.scenes.forEach(s => { s.evidence[0].quote = input.excerpts.find(e => e.id === s.evidence[0].sourceId)!.quotes[0]; });
    expect(input.schema.safeParse(draft).success).toBe(true);
    draft.scenes[0].narration = "A scene that is far too short.";
    expect(input.schema.safeParse(draft).success).toBe(false);
  });
  it("aligns plural cues and narration order without accepting an unrelated cue", () => {
    const draft = structuredClone(testDraft);
    draft.scenes[0].nodes = [...draft.scenes[0].nodes].reverse();
    draft.scenes[2].nodes[1].cue = "drop";
    const aligned = validateDraft(alignDraftCues(draft), testSources, 60);
    expect(aligned.scenes[0].nodes.map(n => n.cue)).toEqual(["sun", "water", "air"]);
    expect(aligned.scenes[2].nodes[1].cue).toBe("drops");
    draft.scenes[0].nodes[0].cue = "unrelated";
    draft.scenes[0].nodes[0].label = "Unrelated";
    draft.scenes[0].nodes[0].concept = "unrelated";
    expect(() => validateDraft(alignDraftCues(draft), testSources, 60)).toThrow("unrelated");
  });
  it("reports failures across scenes together so one repair can correct them all", () => {
    const draft = structuredClone(testDraft);
    draft.scenes[0].nodes[0].cue = "missingone";
    draft.scenes[1].nodes[0].cue = "missingtwo";
    try { validateDraft(draft, testSources, 60); throw new Error("Should reject"); }
    catch (error) {
      expect(String(error)).toContain("missingone");
      expect(String(error)).toContain("missingtwo");
      expect(String(error)).toContain("word -1");
    }
  });
  it("accepts valid evidence and rejects invented quotes, cues and layout shapes", () => {
    expect(validateDraft(testDraft, testSources, 60).scenes).toHaveLength(4);
    const altered = structuredClone(testDraft); altered.scenes[0].evidence[0].quote = "This claim never appeared in the research source";
    expect(() => validateDraft(altered, testSources, 60)).toThrow("quote a retrieved");
    altered.scenes[0] = structuredClone(testDraft.scenes[0]); altered.scenes[0].nodes[0].cue = "invented";
    expect(() => validateDraft(altered, testSources, 60)).toThrow("cue");
    altered.scenes[0] = structuredClone(testDraft.scenes[0]); altered.scenes[1].nodes.push(altered.scenes[0].nodes[0]);
    expect(() => validateDraft(altered, testSources, 60)).toThrow("node count");
  });
  it("rejects duplicate scene IDs and narration outside the duration budget", () => {
    const draft = structuredClone(testDraft); draft.scenes[1].id = draft.scenes[0].id;
    expect(() => validateDraft(draft, testSources, 60)).toThrow("unique");
    expect(() => validateDraft(testDraft, testSources, 90)).toThrow("Narration needs");
  });
});
