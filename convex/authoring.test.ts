import { describe, it, expect } from "vitest";
import { authoringInput } from "./lib/authoring";
import { testSources } from "./testFixtures";

describe("compact lesson compiler", () => {
  const input = authoringInput(testSources, 60, "water cycle", "beginner");
  const value = () => ({ title: "Water cycle", scenes: Array.from({ length: 4 }, (_, i) => ({
    title: `Water ${i+1}`, narration: "Water absorbs energy from the sun and changes into vapor in the air. It can later condense into droplets, returning to lakes and rivers as part of a cycle.",
    optionalNarration: "", takeaway: "Water moves around the planet in a cycle.", icons: ["sun", "water"], connections: [{ from: "sun", to: "water", label: "warms" }], evidenceIds: [input.evidence.find(e => e.sourceId === (i%2 ? "source-2" : "source-1"))!.id],
  })) });
  it("uses the earliest spoken alias rather than delaying an illustration until a later synonym", () => {
    const draft = value();
    draft.scenes[0].narration = "Sunlight warms water and changes it into vapor in the air. It can later condense into droplets and return to lakes and rivers. This energy comes from the sun.";
    expect(input.validate(draft).scenes[0].nodes[0].cue).toBe("sunlight");
  });
  it("keeps vapor distinct from liquid water when a text phrase shares a word with an icon", () => {
    const draft = value();
    draft.scenes[0].icons = ["water vapor", "water"];
    draft.scenes[0].connections = [];
    const nodes = input.validate(draft).scenes[0].nodes;
    expect(nodes.map(n => n.concept)).toEqual(["water", "text:water vapor"]);
    expect(nodes[1].cue).toBe("vapor");
  });
  it("keeps causal direction when narration changes node order and resolves exact source identities", () => {
    const result = input.validate(value());
    expect(result.scenes[0].nodes.map(n => n.concept)).toEqual(["water", "sun"]);
    expect(result.scenes[0].connections).toEqual([{ from: 1, to: 0, label: "warms" }]);
    expect(result.scenes[1].evidence[0].sourceId).toBe("source-2");
  });
  it("rejects invented evidence and truncated text, and omits unspoken visuals and dangling edges", () => {
    const badEvidence = value(); badEvidence.scenes[0].evidenceIds = ["invented"];
    expect(() => input.validate(badEvidence)).toThrow("Unknown evidence");
    const badIcon = value(); badIcon.scenes[0].icons[0] = "nonexistent"; badIcon.scenes[0].connections = [];
    expect(input.validate(badIcon).scenes[0].nodes.some(n => n.label.toLowerCase() === "nonexistent")).toBe(false);
    const badEdge = value(); badEdge.scenes[0].connections[0].to = "earth";
    expect(input.validate(badEdge).scenes[0].connections).toEqual([]);
    const text = value(); text.scenes[0].takeaway = "Water ".repeat(15).trim()+"r";
    expect(() => input.validate(text)).toThrow("incomplete");
  });
  it("keeps association boards free of invented causal arrows", () => {
    const draft = value(); draft.scenes.forEach(s => { s.connections = []; });
    expect(input.validate(draft).scenes.every(s => s.connections?.length === 0)).toBe(true);
  });
  it("replaces unspoken decoration with a literal spoken object without transferring its arrow", () => {
    const draft = value(); draft.scenes[0].icons = ["moon", "water"];
    draft.scenes[0].connections = [{ from: "moon", to: "water", label: "warms" }];
    const result = input.validate(draft).scenes[0];
    expect(result.nodes.map(n => n.concept)).toEqual(["water", "sun"]);
    expect(result.connections).toEqual([]);
  });
});
