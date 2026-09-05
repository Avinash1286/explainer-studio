import { describe, expect, it, vi } from "vitest";
import { directorEvidenceContext, DIRECTOR_PASSAGE_LIMIT, DIRECTOR_SUPPLEMENT_LIMIT, validateDirectorEvidenceContext } from "./lib/directorEvidence";
import { directorInput, directScenes } from "./lib/director";
import { testDraft, testSources } from "./testFixtures";
import { sampleProject } from "../tests/review-helpers";
import { syntheticVisualPlan } from "../tests/director-helpers";
import type { Research } from "../packages/contracts/generation";

const sceneId = sampleProject.scenes[0].id;
const citations = (quote: string, sourceId = "source-1") => [{ sceneId, evidence: [{ sourceId, quote }] }];
const evidence = testDraft.scenes.map(scene => ({ sceneId: scene.id, evidence: scene.evidence }));
const sourcesWith = (text: string): Research => [{ ...testSources[0], text }, testSources[1]];

describe("scene-specific cited director context", () => {
  it("recovers verbatim original text from authoring's accepted whitespace and case variations", () => {
    const text = "Context precedes the mechanism. Photons carry\u00a0energy,\nwhich can free an electron. Only absorbed photons contribute to the effect. The rest pass through or are reflected.";
    const sources = sourcesWith(text);
    const context = directorEvidenceContext(sources, citations("PHOTONS CARRY energy, which can free an electron."), sceneId);
    expect(context.sources[0]).toMatchObject({ id: sources[0].id, title: sources[0].title, url: sources[0].url, quote: "Photons carry\u00a0energy,\nwhich can free an electron." });
    expect(context.sources[0].text).toBe(text);
    expect(validateDirectorEvidenceContext(context, sources, sceneId)).toBe(context);
    expect(sources[0].text).toBe(text);
  });

  it("includes the complete sentence and nearby qualification when a quoted prefix was shortened", () => {
    const statement = "A solar cell converts the energy of light into electricity by using a semiconductor junction. Only absorbed light provides energy to the process.";
    const text = `${"Earlier background has no bearing on this claim. ".repeat(30)}${statement} ${"Later background is separate from the mechanism. ".repeat(30)}`;
    const sources = sourcesWith(text), quote = "A solar cell converts the energy of light into electricity by using";
    const passage = directorEvidenceContext(sources, citations(quote), sceneId).sources[0];
    expect(passage.text).toContain(statement);
    expect(passage.text.length).toBeLessThanOrEqual(DIRECTOR_PASSAGE_LIMIT);
    expect(passage.partial).toBeUndefined();
    expect(passage.text.trim()).toMatch(/\.$/);
    expect(sources[0].text.slice(passage.offset, passage.offset + passage.text.length)).toBe(passage.text);
  });

  it("keeps distant citations as separate verbatim passages even when they share a source", () => {
    const first = "The valve opens a passage for water.", last = "The arriving water fills the receiving beaker.";
    const text = `${first} ${"Unrelated context occupies the middle of this article. ".repeat(50)}${last}`;
    const sourceEvidence = [{ sceneId, evidence: [{ sourceId: "source-1", quote: first }, { sourceId: "source-1", quote: last }] }];
    const context = directorEvidenceContext(sourcesWith(text), sourceEvidence, sceneId);
    expect(context.sources).toHaveLength(2);
    expect(context.sources.map(source => source.id)).toEqual(["source-1", "source-1"]);
    expect(context.sources[0].offset + context.sources[0].text.length).toBeLessThan(context.sources[1].offset);
    for (const passage of context.sources) {
      expect(text.slice(passage.offset, passage.offset + passage.text.length)).toBe(passage.text);
      expect(passage.text).toContain(passage.quote);
    }
  });

  it("marks unavoidable partial sentences, retaining the full quote and whole boundary words", () => {
    const quote = "the quoted mechanism remains intact";
    const text = `${"surrounding ".repeat(100)}${quote} ${"surrounding ".repeat(100)}`;
    const passage = directorEvidenceContext(sourcesWith(text), citations(quote), sceneId).sources[0];
    expect(passage.partial).toBe(true);
    expect(passage.text.length).toBeLessThanOrEqual(DIRECTOR_PASSAGE_LIMIT);
    expect(passage.text).toContain(quote);
    expect(text[passage.offset - 1]).toMatch(/\s/);
    expect(text[passage.offset + passage.text.length]).toMatch(/\s/);
  });

  it("fails closed for missing, duplicate, foreign and unmatched evidence", () => {
    expect(() => directorEvidenceContext(testSources, undefined, sceneId)).toThrow();
    expect(() => directorEvidenceContext(testSources, [], sceneId)).toThrow();
    expect(() => directorEvidenceContext(testSources, evidence, "absent-scene")).toThrow("Missing cited evidence");
    expect(() => directorEvidenceContext(testSources, [evidence[0], evidence[0]], sceneId)).toThrow("unique");
    expect(() => directorEvidenceContext(testSources, citations(testDraft.scenes[0].evidence[0].quote, "absent-source"), sceneId)).toThrow("unknown source");
    expect(() => directorEvidenceContext(testSources, citations("This supposed quotation was never retrieved."), sceneId)).toThrow("must match");
    expect(() => directorEvidenceContext([testSources[0], testSources[0]], evidence, sceneId)).toThrow("source IDs must be unique");
  });

  it("rejects explicit context substitution and wrong scope instead of reverting to full sources", async () => {
    const context = directorEvidenceContext(testSources, evidence, sceneId);
    expect(() => directorInput(sampleProject, testSources, sampleProject.scenes[1].id, "", context)).toThrow("scope");
    expect(() => directorInput(sampleProject, testSources, sceneId, "", { ...context, sources: [{ ...context.sources[0], text: "Invented source content", quote: "Invented" }] })).toThrow("original cited source");
    const transport = vi.fn<typeof fetch>();
    await expect(directScenes({ generationProvider: "openai", OPENAI_API_KEY: "synthetic" }, sampleProject, testSources, [sceneId], "", transport, [])).rejects.toThrow("scope");
    expect(transport).not.toHaveBeenCalled();
  });

  it.each(["nim", "openai"] as const)("uses bounded context without changing %s routing or full-source repair input", async generationProvider => {
    const context = directorEvidenceContext(testSources, evidence, sceneId);
    const transport = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(String(url)).toContain(generationProvider === "openai" ? "api.openai.com" : "integrate.api.nvidia.com");
      const prompt = JSON.parse(generationProvider === "openai" ? body.input[0].content : body.messages[1].content);
      expect(prompt.sources).toEqual(context.sources);
      const plan = JSON.stringify(syntheticVisualPlan(prompt.scene.narration));
      return generationProvider === "openai"
        ? Response.json({ id: "synthetic-director", status: "completed", model: "gpt-5.4-mini", output: [{ type: "message", content: [{ type: "output_text", text: plan }] }] })
        : Response.json({ choices: [{ message: { content: plan } }] });
    });
    await directScenes({ generationProvider, OPENAI_API_KEY: "synthetic", NVIDIA_API_KEY: "synthetic" }, sampleProject, testSources, [sceneId], "", transport, [context]);
    expect(transport).toHaveBeenCalledTimes(1);
    // Repair callers have no authored sceneEvidence and explicitly keep the
    // unchanged full-research path by omitting the optional context argument.
    expect(JSON.parse(directorInput(sampleProject, testSources, sceneId, "Repair this scene").prompt).sources).toEqual(testSources);
  });

  it("cuts a five-article directing prompt by over 55% without dropping schema or story", () => {
    const longSources = Array.from({ length: 5 }, (_, i) => ({ id: `source-${i + 1}`, title: `Test source ${i + 1}`, url: `https://source${i + 1}.example/article`, text: `${testSources[0].text} ${"This additional research paragraph is unrelated to the scene's cited mechanism. ".repeat(100)}`.slice(0, 8000) }));
    const context = directorEvidenceContext(longSources, evidence, sceneId);
    const full = directorInput(sampleProject, longSources, sceneId), bounded = directorInput(sampleProject, longSources, sceneId, "", context);
    expect(bounded.prompt.length / full.prompt.length).toBeLessThan(0.45);
    const before = JSON.parse(full.prompt), after = JSON.parse(bounded.prompt);
    expect(after.schema).toEqual(before.schema);
    expect(after.lesson).toEqual(before.lesson);
    expect(after.direction).toEqual(before.direction);
    expect(after.scene).toEqual(before.scene);
  });

  it("retains both citations and retrieves the omitted circuit requirement from full research", () => {
    const first = "Sunlight creates electrical charges inside the cell.", second = "Solar cells generate direct current from sunlight.";
    const circuit = "Electrical conductors collect the electrons. When the conductors connect in an electrical circuit to an external load, electricity flows through the circuit. The return connection completes the path.";
    const sources: Research = [
      { ...testSources[0], text: `${first}\n\n${"Separate background describes manufacturing history. ".repeat(25)}\n\n${circuit}` },
      { ...testSources[1], text: second },
    ];
    const citations = [{ sceneId, evidence: [{ sourceId: sources[0].id, quote: first }, { sourceId: sources[1].id, quote: second }] }];
    const original = directorEvidenceContext(sources, citations, sceneId);
    const context = directorEvidenceContext(sources, citations, sceneId, "Electrons flow through an external circuit as direct current, delivering electricity to a load before returning to the cell.");
    expect(context.sources.slice(0, 2)).toEqual(original.sources);
    const extra = context.sources.filter(passage => passage.selection === "narration");
    expect(extra.some(passage => passage.id === sources[0].id && passage.text.includes(circuit))).toBe(true);
    expect(extra.length).toBeLessThanOrEqual(DIRECTOR_SUPPLEMENT_LIMIT);
    for (const passage of extra) {
      const source = sources.find(source => source.id === passage.id)!;
      expect(source.text.slice(passage.offset, passage.offset + passage.text.length)).toBe(passage.text);
      expect(passage.text).toContain(passage.quote);
      expect(passage.text.length).toBeLessThanOrEqual(DIRECTOR_PASSAGE_LIMIT);
    }
    expect(validateDirectorEvidenceContext(context, sources, sceneId)).toBe(context);
    expect(JSON.parse(directorInput(sampleProject, sources, sceneId, "", context).prompt).sources).toEqual(context.sources);
  });

  it("finds omitted absorption qualifications and electron-hole creation without topic rules", () => {
    const quote = "Sunlight excites electrons inside the semiconductor.";
    const qualification = "Photons striking silicon may be reflected, transmitted or absorbed. Only absorbed photons transfer energy to electrons.";
    const carriers = "The absorption of light generates unbound electron-hole pairs in the semiconductor lattice.";
    const sources: Research = [
      { ...testSources[0], text: quote },
      { ...testSources[1], text: qualification },
      { ...testSources[0], id: "source-3", url: "https://third.example/pairs", text: carriers },
    ];
    const context = directorEvidenceContext(sources, citations(quote), sceneId, "Photons strike silicon and transfer energy to electrons. This creates free electrons and corresponding positive charge holes in the silicon lattice.");
    expect(context.sources.slice(1).map(passage => passage.id).sort()).toEqual(["source-2", "source-3"]);
    expect(context.sources.some(passage => passage.text.includes("Only absorbed photons"))).toBe(true);
    expect(context.sources.some(passage => passage.text.includes("electron-hole pairs"))).toBe(true);
  });

  it("uses the same retrieval for other subjects and deduplicates repeated source text", () => {
    const quote = "Plants exchange substances with their environment.";
    const mechanism = "Water enters the roots and moves through vessels toward the leaves. Evaporation from leaves helps pull water upward.";
    const sources: Research = [
      { ...testSources[0], text: quote },
      { ...testSources[1], text: mechanism },
      { ...testSources[1], id: "source-3", url: "https://mirror.example/plants", text: mechanism },
    ];
    const narration = "Water moves from roots through vessels to leaves, where evaporation helps pull it upward.";
    const context = directorEvidenceContext(sources, citations(quote), sceneId, narration);
    expect(context.sources).toHaveLength(2);
    expect(context.sources[1]).toMatchObject({ id: "source-2", text: mechanism, selection: "narration" });
    expect(directorEvidenceContext(sources, citations(quote), sceneId, narration)).toEqual(context);
    expect(directorEvidenceContext(sources, citations(quote), sceneId, "And then it is there.").sources).toHaveLength(1);
  });

  it("never overlaps supplemental source slices or invents text when a long passage is bounded", () => {
    const quote = "The initial description identifies the machine.";
    const mechanism = `Rotation transfers torque through the shaft ${"surrounding context ".repeat(65)}before the turning gear rotates the wheel`;
    const sources: Research = [{ ...testSources[0], text: `${quote}\n\n${"Unrelated history. ".repeat(60)}\n\n${mechanism}` }];
    const context = directorEvidenceContext(sources, citations(quote), sceneId, "The rotating shaft transfers torque to a gear, turning the wheel.");
    const extra = context.sources.filter(passage => passage.selection === "narration");
    expect(extra.length).toBeGreaterThan(0);
    expect(extra.some(passage => passage.partial)).toBe(true);
    for (const passage of context.sources) {
      expect(passage.text.length).toBeLessThanOrEqual(DIRECTOR_PASSAGE_LIMIT);
      expect(sources[0].text.slice(passage.offset, passage.offset + passage.text.length)).toBe(passage.text);
      for (const other of context.sources.filter(other => other !== passage)) expect(passage.offset >= other.offset + other.text.length || other.offset >= passage.offset + passage.text.length).toBe(true);
    }
    const tampered = structuredClone(context);
    tampered.sources[1].offset++;
    expect(() => validateDirectorEvidenceContext(tampered, sources, sceneId)).toThrow("original cited source");
    const invented = structuredClone(context);
    invented.sources[1].text += " Invented conclusion.";
    expect(() => validateDirectorEvidenceContext(invented, sources, sceneId)).toThrow("original cited source");
  });

  it("enforces at most two supplements and retains required cited scope", () => {
    const context = directorEvidenceContext(testSources, evidence, sceneId);
    const supplemental = { ...context.sources[0], selection: "narration" as const };
    expect(() => validateDirectorEvidenceContext({ ...context, sources: [...context.sources, supplemental, supplemental, supplemental] }, testSources, sceneId)).toThrow("scope");
    expect(() => validateDirectorEvidenceContext({ ...context, sources: [supplemental] }, testSources, sceneId)).toThrow("scope");
    expect(() => directorEvidenceContext(testSources, undefined, sceneId, "A relevant narration cannot replace missing citations.")).toThrow();
  });
});
