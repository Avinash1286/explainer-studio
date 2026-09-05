import { describe, expect, it, vi } from "vitest";
import { combineReviews, inspectFacts } from "./lib/factCheck";
import { goodReview, sampleProject } from "../tests/review-helpers";
import { testSources } from "./testFixtures";
describe("independent factual gate", () => {
  it("blocks publication even when vision passes and preserves the causal correction", async () => {
    const facts = goodReview();
    facts.scenes[1].factualPass = false;
    facts.scenes[1].issues = [{ sceneId: facts.scenes[1].sceneId, kind: "factual", detail: "A period was assigned to the wrong cycle.", repair: "Distinguish the two source-defined cycles." }];
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(facts) } }] }));
    const result = await inspectFacts({ NVIDIA_API_KEY: "test" }, sampleProject, testSources, transport);
    const combined = combineReviews(goodReview(), result.data);
    expect(combined.scenes[1].factualPass).toBe(false);
    expect(combined.scenes[1].visualPass).toBe(true);
    expect(combined.scenes[1].issues[0].detail).toContain("wrong cycle");
    expect(String(transport.mock.calls[0][1]?.body)).toContain(testSources[0].text.slice(0,30));
  });
});
