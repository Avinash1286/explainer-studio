import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { embed, research, structured } from "./lib/providers";
import { validateDraft } from "../packages/contracts/generation";
import { testDraft, testSources } from "./testFixtures";
const config = { NVIDIA_API_KEY: "test", CLOUDFLARE_API_TOKEN: "test", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), FIRECRAWL_API_KEY: "test" };
const schema = z.object({ answer: z.literal("yes") });
const primary = (content: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
const backup = (content: unknown) => Response.json({ success: true, result: { response: content } });
describe("provider boundaries", () => {
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
  it("repairs invalid JSON output once, then fails closed", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => primary({ answer: "wrong" }));
    await expect(structured(config, "JSON", "question", {}, x => schema.parse(x), transport)).rejects.toThrow("valid supported lesson");
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("keeps repairs within a provider and accepts a corrected result", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(primary({ answer: "wrong" })).mockResolvedValueOnce(primary({ answer: "yes" }));
    expect((await structured(config, "JSON", "question", {}, x => schema.parse(x), transport)).data.answer).toBe("yes");
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
