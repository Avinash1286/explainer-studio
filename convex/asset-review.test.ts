import { describe, expect, it, vi } from "vitest";
import { inspectSceneFrames } from "./lib/critic";
import { combineReviews, inspectFacts } from "./lib/factCheck";
import { LESSON_ASSETS } from "../packages/assets/catalog";
import { goodReview, sampleProject } from "../tests/review-helpers";
import { syntheticVisualPlan } from "../tests/director-helpers";
import { testSources } from "./testFixtures";
import type { Project } from "../packages/contracts/scene";

const selected = LESSON_ASSETS.find(asset => asset.family === "sketch" && asset.originalId === "young-cell")!;
const otherScene = LESSON_ASSETS.find(asset => asset.family === "sketch" && asset.originalId === "plant")!;
const unused = LESSON_ASSETS.find(asset => asset.family === "sketch" && asset.originalId === "bank")!;
const sceneId = sampleProject.scenes[0].id;
const config = { NVIDIA_API_KEY: "synthetic-nvidia", CLOUDFLARE_API_TOKEN: "synthetic-cf", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), OPENAI_API_KEY: "synthetic-openai" };
const frames = [8, 40, 80].map(frame => ({ sceneId, frame, url: `data:image/jpeg;base64,${btoa(`synthetic decoded frame ${frame}`)}` }));
const sceneReport = { summary: "Synthetic scene inspection", ...goodReview().scenes[0] };
const cloudflareResponse = (value: unknown) => Response.json({ success: true, result: { response: value } });
const nvidiaResponse = (value: unknown) => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
const openaiResponse = (value: unknown) => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });

function projectWithAssets(): Project {
  return { ...sampleProject, scenes: sampleProject.scenes.map((scene, index) => {
    if (index > 1) return scene;
    const visualPlan = syntheticVisualPlan(scene.narration);
    visualPlan.entities[0] = { ...visualPlan.entities[0], kind: "asset", assetId: index === 0 ? selected.id : otherScene.id, label: index === 0 ? "Solar cell" : "Plant" };
    // Imported artwork is static: this fixture highlights, never transforms it.
    visualPlan.beats[0] = { ...visualPlan.beats[0], action: "highlight", value: undefined };
    return { ...scene, visualPlan };
  }) };
}

describe("selected imported artwork in independent review", () => {
  it.each(["nim", "openai"] as const)("supplies only target-scene catalog identities and the same decoded bytes on %s", async generationProvider => {
    const project = projectWithAssets();
    const transport = vi.fn<typeof fetch>().mockResolvedValue(generationProvider === "openai" ? openaiResponse(sceneReport) : cloudflareResponse(sceneReport));
    await inspectSceneFrames({ ...config, generationProvider }, project, testSources, sceneId, frames, transport);
    expect(transport).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
    const content = generationProvider === "openai" ? body.input[0].content : body.messages[1].content;
    const prompt = JSON.parse(content[0].text);
    expect(prompt.selectedAssets).toHaveLength(1);
    expect(prompt.selectedAssets[0]).toMatchObject({ entityId: "water", assetId: selected.id, catalogIdentity: { id: selected.id, label: selected.label, concept: selected.concept, family: selected.family, source: selected.source, license: selected.license, sha256: selected.sha256 } });
    expect(prompt.scene.visualPlan.entities[0].label).toBe("Solar cell");
    expect(prompt.selectedAssets[0].catalogIdentity.label).not.toBe("Solar cell");
    expect(prompt.importedArtworkPolicy).toContain("not scientific evidence");
    expect(prompt.importedArtworkPolicy).toContain("no parameterized interior structure, count, charge");
    expect(prompt.sources).toEqual(testSources);
    expect(JSON.stringify(prompt)).not.toContain(otherScene.id);
    expect(JSON.stringify(prompt)).not.toContain(unused.id);
    expect(prompt).not.toHaveProperty("project");
    const imageUrls = content.filter((part: { type: string }) => part.type === (generationProvider === "openai" ? "input_image" : "image_url")).map((part: { image_url: string | { url: string } }) => typeof part.image_url === "string" ? part.image_url : part.image_url.url);
    expect(imageUrls).toEqual(frames.map(frame => frame.url));
    expect(String(transport.mock.calls[0][0])).toContain(generationProvider === "openai" ? "api.openai.com/v1/responses" : "api.cloudflare.com");
  });

  it("retains selected identity metadata on the existing NIM vision fallback", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 429 })).mockResolvedValueOnce(nvidiaResponse(sceneReport));
    const result = await inspectSceneFrames({ ...config, generationProvider: "nim" }, projectWithAssets(), testSources, sceneId, frames, transport);
    expect(result.inference.provider).toBe("nvidia");
    const first = JSON.parse(String(transport.mock.calls[0][1]?.body)), fallback = JSON.parse(String(transport.mock.calls[1][1]?.body));
    expect(fallback.messages).toEqual(first.messages);
    expect(JSON.parse(fallback.messages[1].content[0].text).selectedAssets[0].catalogIdentity.id).toBe(selected.id);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each(["nim", "openai"] as const)("preserves factual entity identity and a rejecting verdict on %s", async generationProvider => {
    const project = projectWithAssets(), facts = goodReview();
    facts.scenes[0].factualPass = false;
    facts.scenes[0].issues = [{ sceneId, kind: "factual", detail: "The biological-cell illustration was labeled as a solar cell.", repair: "Use a source-supported photovoltaic subject instead of a biological cell." }];
    const transport = vi.fn<typeof fetch>().mockResolvedValue(generationProvider === "openai" ? openaiResponse(facts) : nvidiaResponse(facts));
    const result = await inspectFacts({ ...config, generationProvider }, project, testSources, transport);
    const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
    const prompt = JSON.parse(generationProvider === "openai" ? body.input[0].content : body.messages[1].content);
    expect(prompt.sources).toEqual(testSources);
    const first = prompt.diagramClaims.find((claim: { sceneId: string }) => claim.sceneId === sceneId).mechanism.entities[0];
    expect(first).toMatchObject({ id: "water", kind: "asset", label: "Solar cell", assetId: selected.id, catalogIdentity: { id: selected.id, label: selected.label, concept: selected.concept } });
    const second = prompt.diagramClaims.find((claim: { sceneId: string }) => claim.sceneId === project.scenes[1].id).mechanism.entities[0];
    expect(second.catalogIdentity.id).toBe(otherScene.id);
    expect(JSON.stringify(prompt)).not.toContain(unused.id);
    expect(prompt.importedArtworkPolicy).toContain("not scientific evidence");
    expect(combineReviews(goodReview(), result.data).scenes[0].factualPass).toBe(false);
    expect(result.data.scenes[0].issues[0].detail).toContain("biological-cell");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(String(transport.mock.calls[0][0])).toContain(generationProvider === "openai" ? "api.openai.com/v1/responses" : "integrate.api.nvidia.com");
  });

  it("fails before provider inference for an unknown imported identity", async () => {
    const project = projectWithAssets();
    project.scenes[0].visualPlan!.entities[0].assetId = "unknown-imported-asset";
    const transport = vi.fn<typeof fetch>();
    await expect(inspectSceneFrames(config, project, testSources, sceneId, frames, transport)).rejects.toThrow("unknown imported asset");
    await expect(inspectFacts(config, project, testSources, transport)).rejects.toThrow("unknown imported asset");
    expect(transport).not.toHaveBeenCalled();
  });

  it("does not attach the imported catalog to a legacy scene", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(cloudflareResponse(sceneReport));
    await inspectSceneFrames(config, sampleProject, testSources, sceneId, frames.slice(0, 2), transport);
    const prompt = JSON.parse(JSON.parse(String(transport.mock.calls[0][1]?.body)).messages[1].content[0].text);
    expect(prompt).not.toHaveProperty("selectedAssets");
    expect(prompt).not.toHaveProperty("importedArtworkPolicy");
    expect(JSON.stringify(prompt)).not.toContain(selected.id);
  });
});
