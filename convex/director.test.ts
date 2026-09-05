import { afterEach, describe, expect, it, vi } from "vitest";
import { directorInput, directScenes, validateDirectedPlan } from "./lib/director";
import { repairInput, repairScenes, visualOnlyRepair } from "./lib/repair";
import { inspectFacts } from "./lib/factCheck";
import { inspectFrames } from "./lib/critic";
import { decodingSchema, openAISchema, type ProviderConfig } from "./lib/providers";
import { frameSamples, knownIconIssues } from "../packages/contracts/review";
import { projectSchema } from "../packages/contracts/scene";
import { compileVisualTiming } from "../packages/contracts/visual";
import { renderedReviewSamples } from "./reviewActions";
import { goodReview, sampleProject } from "../tests/review-helpers";
import { syntheticVisualPlan } from "../tests/director-helpers";
import { testSources } from "./testFixtures";

const config: ProviderConfig = { generationProvider: "openai", OPENAI_API_KEY: "synthetic", NVIDIA_API_KEY: "synthetic", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "synthetic" };
const answer = (value: unknown, id = "resp-director") => Response.json({ id, status: "completed", model: "gpt-5.4-mini", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }], usage: { input_tokens: 100, output_tokens: 200 } });
const narration = sampleProject.scenes[0].narration;
const richProject = () => projectSchema.parse({ ...sampleProject, scenes: sampleProject.scenes.map(scene => ({ ...scene, visualPlan: syntheticVisualPlan(scene.narration) })) });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("bounded illustrated scene direction", () => {
  it("validates a mechanism and removes nullable schema fields before rendering", () => {
    const plan = syntheticVisualPlan(narration);
    const output = { ...plan, entities: plan.entities.map(e => ({ ...e, count: null, values: null, variant: null, parentId: null })), beats: plan.beats.map(b => ({ x: null, y: null, value: null, ...b })) };
    expect(validateDirectedPlan(output, narration)).toEqual(plan);
    const schema = openAISchema(directorInput(sampleProject, testSources, sampleProject.scenes[0].id).schema);
    expect(JSON.stringify(schema)).toContain('"null"');
    expect(JSON.stringify(schema).length).toBeLessThan(14_000);
  });

  it("makes movement destinations and transform/rotation values required in both decoding routes", () => {
    const input = directorInput(sampleProject, testSources, sampleProject.scenes[0].id);
    const raw = input.schema;
    expect(JSON.parse(input.prompt).schema).toEqual(raw);
    for (const schema of [decodingSchema(raw), openAISchema(raw)]) {
      const json = JSON.parse(JSON.stringify(schema));
      const branches = json.properties.beats.items.oneOf || json.properties.beats.items.anyOf;
      expect(branches).toHaveLength(4);
      const move = branches.find((branch: { properties: { action: { const?: string } } }) => branch.properties.action.const === "move");
      const transform = branches.find((branch: { properties: { action: { const?: string } } }) => branch.properties.action.const === "transform");
      const rotate = branches.find((branch: { properties: { action: { const?: string } } }) => branch.properties.action.const === "rotate");
      expect(move.required).toEqual(expect.arrayContaining(["x", "y"]));
      expect(move.properties.x.type).toBe("number");
      expect(move.properties.y.type).toBe("number");
      expect(transform.required).toContain("value");
      expect(transform.properties.value).toMatchObject({ type: "number", minimum: 0, maximum: 1 });
      expect(rotate.required).toContain("value");
      expect(rotate.properties.value.type).toBe("number");
    }
    const original = syntheticVisualPlan(narration);
    expect(() => validateDirectedPlan({ ...original, beats: original.beats.map(b => b.action === "move" ? { ...b, x: null } : b) }, narration)).toThrow();
    expect(() => validateDirectedPlan({ ...original, beats: original.beats.map(b => b.action === "transform" ? { ...b, value: null } : b) }, narration)).toThrow();
  });

  it("rejects isolated noun cards, motion only at the start, invented cues and clipping", () => {
    const original = syntheticVisualPlan(narration);
    expect(() => validateDirectedPlan({ ...original, beats: original.beats.map(b => ({ ...b, action: "pulse" })) }, narration)).toThrow("mechanism");
    expect(() => validateDirectedPlan({ ...original, beats: original.beats.map(b => ({ ...b, cue: "The sun" })) }, narration)).toThrow("separated");
    expect(() => validateDirectedPlan({ ...original, beats: original.beats.map(b => ({ ...b, cue: "imaginary phrase" })) }, narration)).toThrow("not spoken");
    expect(() => validateDirectedPlan({ ...original, entities: original.entities.map(e => ({ ...e, x: 4 })) }, narration)).toThrow("safe area");
    expect(() => validateDirectedPlan({ ...original, entities: original.entities.map(e => ({ ...e, cue: original.beats[1].cue })) }, narration)).toThrow("empty canvas");
    expect(() => validateDirectedPlan({ ...original, entities: original.entities.map(e => e.id === "water" ? { ...e, kind: "solar-panel" } : e) }, narration)).toThrow("no visual transform state");
    expect(() => validateDirectedPlan({ ...original, entities: original.entities.map(e => ({ ...e, w: 5, h: 5 })) }, narration)).toThrow("focal component");
  });

  it("compacts overlong spoken cues without changing the timed occurrence or accepting invented text", () => {
    const original = syntheticVisualPlan(narration);
    const long = { ...original, entities: original.entities.map((e, i) => i === 0 ? { ...e, cue: narration } : e) };
    const result = validateDirectedPlan(long, narration);
    expect(result.entities[0].cue.length).toBeLessThanOrEqual(70);
    expect(narration.startsWith(result.entities[0].cue)).toBe(true);
    expect(result.beats).toEqual(original.beats);
    expect(() => validateDirectedPlan({ ...long, entities: long.entities.map((e, i) => i === 0 ? { ...e, cue: `${narration} Nonexistent words at the end.` } : e) }, narration)).toThrow();
  });

  it("provides a valid compact composition example without using its source as lesson evidence", () => {
    const input = JSON.parse(directorInput(sampleProject, testSources, sampleProject.scenes[0].id).prompt);
    expect(validateDirectedPlan(input.styleExample.visualPlan, input.styleExample.source).entities.some(e => e.w >= 30)).toBe(true);
    expect(input.styleExample.role).toContain("Fictional teaching example");
    expect(input.sources).toEqual(testSources);
  });

  it("keeps a movement described as within a material inside its actual outer parent", () => {
    const original = syntheticVisualPlan(narration);
    const plan = { ...original, entities: [...original.entities, { id: "charge", kind: "electron", label: "", x: 26, y: 55, w: 4, h: 4, color: "blue", enter: 0, cue: original.entities[0].cue, parentId: "water" }], beats: [...original.beats, { id: "travel", target: "charge", action: "move", at: 0.55, duration: 0.2, cue: original.beats[1].cue, x: 60, y: 55, meaning: "The electron moves within the material." }] };
    expect(() => validateDirectedPlan(plan, narration)).toThrow("inside its outer parent");
  });

  it("checks through-material meaning and the spoken clause following a shortened movement cue", () => {
    const speech = "An electron begins inside the lattice. It receives energy and then moves away from its atom. The freed electron is now able to move within the semiconductor material as a charge carrier.";
    const plan = {
      version: 1, grammar: "mechanism", objective: "Show an electron gaining energy and moving within silicon.",
      entities: [
        { id: "silicon", kind: "lattice", label: "Silicon", x: 50, y: 45, w: 30, h: 30, color: "gray", enter: 0, cue: "An electron" },
        { id: "electron", kind: "electron", label: "", x: 50, y: 45, w: 6, h: 6, color: "blue", enter: 0, cue: "An electron", parentId: "silicon" },
        { id: "photon", kind: "photon", label: "", x: 20, y: 45, w: 8, h: 8, color: "yellow", enter: 0.1, cue: "It receives energy" },
      ],
      relations: [{ id: "energy", from: "photon", to: "electron", label: "", type: "flow", color: "yellow", curve: 0, enter: 0.2, cue: "It receives energy" }],
      beats: [
        { id: "gain", target: "energy", action: "flow", at: 0.2, duration: 0.15, cue: "It receives energy", meaning: "The electron receives energy." },
        { id: "travel", target: "electron", action: "move", at: 0.65, duration: 0.2, cue: "The freed electron is now able to move", meaning: "The electron moves.", x: 80, y: 45 },
      ],
    };
    expect(() => validateDirectedPlan(plan, speech)).toThrow("inside its outer parent");
    const through = { ...plan, beats: plan.beats.map(b => b.id === "travel" ? { ...b, cue: "moves away from its atom", meaning: "Electron moves through silicon lattice." } : b) };
    expect(() => validateDirectedPlan(through, speech)).toThrow("inside its outer parent");
    expect(validateDirectedPlan({ ...plan, beats: plan.beats.map(b => b.id === "travel" ? { ...b, x: 52 } : b) }, speech).beats).toHaveLength(2);
    expect(() => validateDirectedPlan({ ...plan, entities: plan.entities.map(e => e.id === "electron" ? { ...e, label: "Electron" } : e), beats: plan.beats.map(b => b.id === "travel" ? { ...b, x: 52 } : b) }, speech)).toThrow("small contained particles must be unlabeled");
  });

  it("returns geometry errors as bounded feedback and keeps selected-provider provenance", async () => {
    const plan = syntheticVisualPlan(narration);
    const bad = { ...plan, entities: plan.entities.map(e => ({ ...e, x: 4 })) };
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(answer(bad, "resp-bad")).mockResolvedValueOnce(answer(plan, "resp-fixed"));
    const result = await directScenes(config, sampleProject, testSources, [sampleProject.scenes[0].id], "", transport);
    expect(result.project.scenes[0].visualPlan).toEqual(plan);
    expect(result.project.scenes.slice(1)).toEqual(sampleProject.scenes.slice(1));
    expect(result.attempts[0].attempts.map(a => [a.outcome, a.responseId])).toEqual([["invalid-output", "resp-bad"], ["success", "resp-fixed"]]);
    expect(transport.mock.calls.every(call => call[0] === "https://api.openai.com/v1/responses")).toBe(true);
    expect(JSON.parse(String(transport.mock.calls[1][1]?.body)).input[2].content).toContain("safe area");
  });

  it("never silently falls back to legacy boards after invalid direction", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => answer({ entities: [] }));
    await expect(directScenes(config, sampleProject, testSources, [sampleProject.scenes[0].id], "", transport)).rejects.toThrow("valid supported lesson");
    expect(transport).toHaveBeenCalledTimes(3);
    expect(sampleProject.scenes[0]).not.toHaveProperty("visualPlan");
  });

  it("keeps NIM fallback within NVIDIA and Workers AI even when OpenAI is configured", async () => {
    const plan = syntheticVisualPlan(narration);
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("unavailable", { status: 503 })).mockResolvedValueOnce(Response.json({ success: true, result: { response: plan } }));
    const result = await directScenes({ ...config, generationProvider: "nim" }, sampleProject, testSources, [sampleProject.scenes[0].id], "", transport);
    expect(result.attempts[0].attempts.map(a => a.provider)).toEqual(["nvidia", "cloudflare"]);
    expect(transport.mock.calls.some(call => String(call[0]).includes("openai"))).toBe(false);
  });

  it("records actual NIM model, response IDs and numeric usage on director attempts", async () => {
    const plan = syntheticVisualPlan(narration);
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "nim-response-1", model: "nim-returned-model", choices: [{ message: { content: JSON.stringify(plan) } }], usage: { prompt_tokens: 90, completion_tokens: 30, total_tokens: 120, diagnostic: "private text" } }));
    const result = await directScenes({ ...config, generationProvider: "nim" }, sampleProject, testSources, [sampleProject.scenes[0].id], "", transport);
    expect(result.attempts[0].attempts[0]).toMatchObject({ model: "nim-returned-model", responseId: "nim-response-1", usage: { input_tokens: 90, output_tokens: 30, total_tokens: 120 } });
    expect(JSON.stringify(result.attempts)).not.toContain("private text");
  });

  it("limits concurrent directing calls to two and carries visual continuity to later pairs", async () => {
    let active = 0, peak = 0;
    const prompts: ReturnType<typeof JSON.parse>[] = [];
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_, request) => {
      active++; peak = Math.max(peak, active);
      const prompt = JSON.parse(JSON.parse(String(request?.body)).input[0].content); prompts.push(prompt);
      await new Promise(resolve => setTimeout(resolve, 2)); active--;
      return answer(syntheticVisualPlan(prompt.scene.narration));
    });
    const result = await directScenes(config, sampleProject, testSources, undefined, "", transport);
    expect(peak).toBe(2);
    expect(result.project.scenes.every(s => s.visualPlan)).toBe(true);
    expect(prompts[2].lesson.story[0].establishedEntities).toHaveLength(2);
    expect(result.attempts).toHaveLength(sampleProject.scenes.length);
  });
});

describe("rich scene repair and independent review", () => {
  it("repairs a visual-only scene without changing narration, metadata or its neighbours", async () => {
    const previous = richProject(), sceneId = previous.scenes[0].id;
    const fixed = { ...syntheticVisualPlan(narration), objective: "Clarify the physical change using a better illustrated composition." };
    const transport = vi.fn<typeof fetch>().mockResolvedValue(answer(fixed, "resp-visual-fix"));
    const result = await repairScenes(config, previous, testSources, [sceneId], "Improve the diagram layout and remove the header", transport);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.data.project.scenes[0].narration).toBe(narration);
    expect(result.data.project.scenes[0].visualPlan).toEqual(fixed);
    expect(result.data.project.scenes.slice(1)).toEqual(previous.scenes.slice(1));
    expect(result.data.project.sources).toEqual(previous.sources);
    expect(result.attempts).toMatchObject([{ stage: "director", sceneId, responseId: "resp-visual-fix" }]);
  });

  it("re-directs changed narration before final validation and keeps repair decoding small", async () => {
    const previous = richProject(), original = previous.scenes[0], sceneId = original.id;
    const nextNarration = "The sun warms water in lakes and oceans. Some liquid water changes into vapor and enters the air. Evaporation moves water through the environment, and this material continues through the cycle rather than disappearing.";
    const input = repairInput(previous, testSources, [sceneId], "Clarify the narration");
    const { visualPlan: omitted, ...base } = original; void omitted;
    const patch = { scenes: [{ ...base, narration: nextNarration, layout: "comparison", nodes: [{ icon: "2600", label: "Sun", cue: "sun" }, { icon: "1F4A7", label: "Water", cue: "water" }], evidenceIds: [input.evidence[0].id] }] };
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(answer(patch, "resp-script-fix")).mockResolvedValueOnce(answer(syntheticVisualPlan(nextNarration), "resp-redirection"));
    const result = await repairScenes(config, previous, testSources, [sceneId], "Clarify the narration", transport);
    expect(result.data.project.scenes[0].narration).toBe(nextNarration);
    expect(result.data.project.scenes[0].visualPlan).toEqual(syntheticVisualPlan(nextNarration));
    expect(result.data.project.scenes.slice(1)).toEqual(previous.scenes.slice(1));
    expect(result.attempts.map(a => a.responseId)).toEqual(["resp-script-fix", "resp-redirection"]);
    expect(JSON.stringify(input.schema)).not.toContain("visualPlan");
    expect(input.prompt.length).toBeLessThan(40_000);
  });

  it("recognizes visual-only critic requests and leaves factual repairs on the text path", () => {
    const report = goodReview(), sceneId = report.scenes[0].sceneId;
    report.scenes[0] = { sceneId, factualPass: true, visualPass: false, issues: [{ sceneId, kind: "layout", detail: "Label overlap", repair: "Move the label" }] };
    expect(visualOnlyRepair(JSON.stringify(report), [sceneId])).toBe(true);
    report.scenes[0].factualPass = false;
    report.scenes[0].issues[0].kind = "factual";
    expect(visualOnlyRepair(JSON.stringify(report), [sceneId])).toBe(false);
    expect(visualOnlyRepair("Correct the unsupported claim about melting", [sceneId])).toBe(false);
  });

  it("passes actual rich mechanism claims and three decoded frames per scene to independent critics", async () => {
    const project = richProject();
    const timed = project.scenes.map((scene, i) => ({ ...scene, startFrame: i * 360, durationInFrames: 360 }));
    const frames = frameSamples(timed).map(sample => ({ ...sample, url: `data:image/jpeg;base64,${btoa(`actual decoded bytes ${sample.frame}`)}` }));
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => answer(goodReview()));
    await inspectFacts(config, project, testSources, transport);
    await inspectFrames(config, project, testSources, frames, transport);
    const factualInput = JSON.parse(JSON.parse(String(transport.mock.calls[0][1]?.body)).input[0].content);
    expect(factualInput.diagramClaims[0].mechanism.actions[1].meaning).toContain("material moves");
    const vision = JSON.parse(String(transport.mock.calls[1][1]?.body));
    expect(vision.input[0].content.filter((part: { type: string }) => part.type === "input_image").map((part: { image_url: string }) => part.image_url)).toEqual(frames.map(f => f.url));
    expect(frames).toHaveLength(project.scenes.length * 3);
    expect(vision.instructions).toContain("do not require a title");
    await expect(inspectFrames(config, project, testSources, frames.slice(1), transport)).rejects.toThrow("Missing rendered frames");
  });

  it("rebuilds adaptive samples from checked rendered words and rejects forged timing evidence", () => {
    const project = richProject();
    const timed = project.scenes.map((scene, i) => ({ ...scene, startFrame: i * 360, durationInFrames: 360, words: scene.narration.split(/\s+/).map((text, j) => ({ text, start: j * 0.32, end: (j + 1) * 0.32 })), visualTiming: { entities: {}, relations: {}, beats: Object.fromEntries(scene.visualPlan!.beats.map(b => [b.id, { start: 0, duration: 1 }])) } }));
    const expected = frameSamples(timed.map(scene => ({ ...scene, visualTiming: compileVisualTiming(scene.visualPlan!, scene.words, 360, 24) })));
    expect(renderedReviewSamples(project, timed, 60)).toEqual(expected);
    expect(renderedReviewSamples(project, timed, 60)).not.toEqual(frameSamples(timed));
    expect(() => renderedReviewSamples(project, timed.map((s, i) => i === 0 ? { ...s, words: [] } : s), 60)).toThrow("Missing rendered narration timing");
    expect(() => renderedReviewSamples(project, timed.map((s, i) => i === 0 ? { ...s, words: s.words.map((w, j) => j === 0 ? { ...w, text: "unrelated" } : w) } : s), 60)).toThrow("does not match narration");
    expect(() => renderedReviewSamples(project, timed.map((s, i) => i === 0 ? { ...s, words: s.words.map((w, j) => j === 0 ? { ...w, end: 20 } : w) } : s), 60)).toThrow("Invalid rendered narration timing");
  });

  it("does not reject rich pixels because of legacy metadata nodes that are never rendered", () => {
    const project = richProject(); project.scenes[0].nodes[0] = { icon: "1F33F", label: "Pollen", cue: "pollen" };
    expect(knownIconIssues(project)).toEqual([]);
  });
});
