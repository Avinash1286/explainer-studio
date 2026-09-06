import { describe, expect, it, vi } from "vitest";
import { repairInput, repairScenes, type RepairCheckpoints } from "./lib/repair";
import { projectSchema } from "../packages/contracts/scene";
import { sampleProject } from "../tests/review-helpers";
import { syntheticVisualPlan } from "../tests/director-helpers";
import { testSources } from "./testFixtures";

const config = { generationProvider: "openai" as const, OPENAI_API_KEY: "synthetic" };
const answer = (value: unknown, id: string) => Response.json({ id, status: "completed", model: "gpt-5.4-mini", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }], usage: { input_tokens: 100, output_tokens: 20 } });
const project = () => projectSchema.parse({ ...sampleProject, scenes: sampleProject.scenes.map(scene => ({ ...scene, visualPlan: syntheticVisualPlan(scene.narration) })) });
function store() {
  const rows = new Map<string, unknown>();
  const checkpoints: RepairCheckpoints = {
    load: async stage => structuredClone(rows.get(stage) ?? null),
    save: async (stage, value) => { rows.set(stage, structuredClone(value)); },
  };
  return { rows, checkpoints };
}

describe("repair phase checkpoints", () => {
  it("reuses the accepted script after a director outage, with original evidence and usage", async () => {
    const previous = project(), sceneId = previous.scenes[0].id, instruction = "Clarify the narration";
    const narration = "The sun warms water in lakes and oceans. Some liquid water changes into vapor and enters the air. Evaporation moves water through the environment, and this material continues through the cycle rather than disappearing.";
    const input = repairInput(previous, testSources, [sceneId], instruction);
    const { visualPlan, ...base } = previous.scenes[0]; void visualPlan;
    const patch = { scenes: [{ ...base, narration, layout: "comparison", nodes: [{ icon: "2600", label: "Sun", cue: "sun" }, { icon: "1F4A7", label: "Water", cue: "water" }], evidenceIds: [input.evidence[0].id] }] };
    const { rows, checkpoints } = store();
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(answer(patch, "script-one")).mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(answer(syntheticVisualPlan(narration), "visual-one"));
    await expect(repairScenes(config, previous, testSources, [sceneId], instruction, transport, undefined, checkpoints)).rejects.toThrow("503");
    expect([...rows.keys()]).toEqual(["script"]);
    const result = await repairScenes(config, previous, testSources, [sceneId], instruction, transport, undefined, checkpoints);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(result.data.project.scenes[0].narration).toBe(narration);
    expect(result.data.project.scenes.slice(1)).toEqual(previous.scenes.slice(1));
    expect(result.data.evidence).toEqual(input.validate(patch).evidence);
    expect(result.attempts.map(attempt => attempt.responseId)).toEqual(["script-one", "visual-one"]);
    expect(result.attempts[0].usage).toMatchObject({ input_tokens: 100, output_tokens: 20 });
    await repairScenes(config, previous, testSources, [sceneId], instruction, transport, undefined, checkpoints);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("saves a successful sibling before surfacing the failed scene, then calls only the missing scene", async () => {
    const previous = project(), sceneIds = previous.scenes.slice(0, 2).map(scene => scene.id), { rows, checkpoints } = store();
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(answer(previous.scenes[0].visualPlan, "visual-a")).mockResolvedValueOnce(new Response("", { status: 429 })).mockResolvedValueOnce(answer(previous.scenes[1].visualPlan, "visual-b"));
    await expect(repairScenes(config, previous, testSources, sceneIds, "Improve the diagram", transport, undefined, checkpoints)).rejects.toThrow("429");
    expect([...rows.keys()]).toEqual([`scene-${sceneIds[0]}`]);
    const result = await repairScenes(config, previous, testSources, sceneIds, "Improve the diagram", transport, undefined, checkpoints);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(result.data.project).toEqual(previous);
    expect(result.attempts.map(attempt => attempt.responseId)).toEqual(["visual-a", "visual-b"]);
    const lastPrompt = JSON.parse(String(transport.mock.calls[2][1]?.body));
    expect(JSON.parse(lastPrompt.input[0].content).scene.id).toBe(sceneIds[1]);
  });

  it("revalidates restored script evidence and selected provider before any further model call", async () => {
    const { rows, checkpoints } = store(), transport = vi.fn<typeof fetch>();
    rows.set("script", { candidate: { scenes: [] }, attempts: [{ provider: "openai", outcome: "success", elapsedMs: 1 }] });
    await expect(repairScenes(config, project(), testSources, ["water-0"], "Clarify narration", transport, undefined, checkpoints)).rejects.toThrow();
    rows.set("script", { candidate: {}, attempts: [{ provider: "nvidia", outcome: "success", elapsedMs: 1 }] });
    await expect(repairScenes(config, project(), testSources, ["water-0"], "Clarify narration", transport, undefined, checkpoints)).rejects.toThrow("provider route");
    expect(transport).not.toHaveBeenCalled();
  });
});
