import { describe, expect, it } from "vitest";
import { repairInput } from "./lib/repair";
import { sampleProject } from "../tests/review-helpers";
import { testSources } from "./testFixtures";
import { validateReplacement } from "../packages/contracts/review";

describe("bounded scene repair", () => {
  it("orders cues without reversing the intended causal edge or touching other scenes", () => {
    const input = repairInput(sampleProject, testSources, ["water-0"], "Clarify the diagram");
    const scene = { ...sampleProject.scenes[0], layout: "comparison", nodes: [{ icon: "1F4A7", label: "Water", cue: "water" }, { icon: "2600", label: "Sun", cue: "sun" }], connections: [{ from: 1, to: 0, label: "warms" }], evidenceIds: [input.evidence[0].id] };
    const result = input.validate({ scenes: [scene] }).project;
    expect(result.scenes[0].nodes.map(n => n.cue)).toEqual(["sun", "water"]);
    expect(result.scenes[0].connections).toEqual([{ from: 0, to: 1, label: "warms" }]);
    expect(result.scenes.slice(1)).toEqual(sampleProject.scenes.slice(1));
  });
  it("provides schema and exact evidence references, then compiles only selected scenes", () => {
    const input = repairInput(sampleProject, testSources, ["water-0"], "Shorten title");
    expect(JSON.parse(input.prompt).schema).toHaveProperty("properties.scenes");
    expect(JSON.parse(input.prompt).lesson.scenes[0]).toMatchObject({ ...sampleProject.scenes[0], replace: true });
    const patch = { scenes: [{ ...sampleProject.scenes[0], title: "Evaporation", layout: "comparison", nodes: sampleProject.scenes[0].nodes.slice(0, 2).map((node, i) => ({ ...node, label: i ? "Water" : "Sun" })), evidenceIds: [input.evidence[0].id] }] };
    const result = input.validate(patch);
    expect(result.project.scenes.slice(1)).toEqual(sampleProject.scenes.slice(1));
    expect(result.evidence[0].evidence[0]).toEqual({ sourceId: input.evidence[0].sourceId, quote: input.evidence[0].quote });
    expect(() => input.validate({ scenes: [{ ...patch.scenes[0], evidenceIds: ["invented"] }] })).toThrow();
    expect(() => input.validate({ scenes: [{ ...patch.scenes[0], id: "water-1" }] })).toThrow();
    expect(() => input.validate({ scenes: [{ ...patch.scenes[0], nodes: patch.scenes[0].nodes.slice(0, 1) }] })).toThrow();
    expect(() => input.validate({ scenes: [{ ...patch.scenes[0], nodes: [{ icon: "1F4A7", label: "Pollen", cue: "water" }, patch.scenes[0].nodes[0]] }] })).toThrow();
    expect(() => input.validate({ scenes: [{ ...patch.scenes[0], takeaway: "The production of seeds depends on the transfer of poll" }] })).toThrow("complete takeaway");
  });
  it("does not add optional facts to an icon-only repair whose original narration already fits", () => {
    const input = repairInput(sampleProject, testSources, ["water-0"], "Fix the arrow only");
    const original = sampleProject.scenes[0];
    const result = input.validate({ scenes: [{ ...original, layout: "comparison", nodes: [{ icon: "2600", label: "Sun", cue: "sun" }, { icon: "1F4A7", label: "Water", cue: "water" }], optionalNarration: "This water will continue moving through the natural cycle.", evidenceIds: [input.evidence[0].id] }] });
    expect(result.project.scenes[0].narration).toBe(original.narration);
  });
  it("budgets replacement narration after subtracting untouched scenes", () => {
    const input = repairInput(sampleProject, testSources, ["water-0"], "Explain simply");
    const unchanged = sampleProject.scenes.slice(1).reduce((sum, s) => sum + s.narration.trim().split(/\s+/).length, 0);
    expect(input.wordBudget).toEqual({ min: Math.max(10, 108 - unchanged), max: 144 - unchanged });
  });
  it("asks for expansion of short narration and shortening of long narration", () => {
    const input = repairInput(sampleProject, testSources, ["water-0"], "Explain simply");
    const scene = { ...sampleProject.scenes[0], layout: "comparison", nodes: sampleProject.scenes[0].nodes.slice(0, 2).map((node, i) => ({ ...node, label: i ? "Water" : "Sun" })), evidenceIds: [input.evidence[0].id] };
    expect(() => input.validate({ scenes: [{ ...scene, narration: Array(input.wordBudget.min - 1).fill("evaporation").join(" ") }] })).toThrow("Expand");
    expect(() => input.validate({ scenes: [{ ...scene, narration: Array(input.wordBudget.max + 1).fill("sun").join(" ") }] })).toThrow("Shorten");
  });
  it("fits duration by selecting a complete optional sentence without altering untouched scenes", () => {
    const input = repairInput(sampleProject, testSources, ["water-0"], "Explain simply");
    const core = "The sun warms water in lakes and rivers, helping liquid water change into an invisible gas that rises into air.";
    const optional = "This process is called evaporation in the water cycle.";
    const result = input.validate({ scenes: [{ ...sampleProject.scenes[0], layout: "comparison", nodes: [{ icon: "2600", label: "Sun", cue: "sun" }, { icon: "1F4A7", label: "Water", cue: "water" }], narration: core, optionalNarration: optional, evidenceIds: [input.evidence[0].id] }] });
    expect(result.project.scenes[0].narration).toBe(`${core} ${optional}`);
    expect(result.project.scenes.slice(1)).toEqual(sampleProject.scenes.slice(1));
  });
  it("allows an individual edit while other rejected scenes await separate repair", () => {
    const previous = structuredClone(sampleProject);
    previous.scenes[1].nodes[0] = { ...previous.scenes[1].nodes[0], icon: "1F343", label: "Pollen" };
    const next = structuredClone(previous); next.scenes[0].title = "Evaporation";
    expect(validateReplacement(previous, next, ["water-0"]).scenes[1]).toEqual(previous.scenes[1]);
    expect(() => validateReplacement(previous, next, ["water-0", "water-1"])).toThrow("category");
  });
});
