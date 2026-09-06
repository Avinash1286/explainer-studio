/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { ASSET_CATALOG_VERSION, LESSON_ASSETS } from "../packages/assets/catalog";
import { projectSchema, type Project } from "../packages/contracts/scene";
import { type VisualPlan } from "../packages/contracts/visual";
import { directorInput, directScenes, validateAssetSelection } from "./lib/director";
import { openAISchema } from "./lib/providers";
import { goodReview, sampleProject } from "../tests/review-helpers";
import { repairScenes } from "./lib/repair";
import { syntheticVisualPlan } from "../tests/director-helpers";
import { testDraft, testSources } from "./testFixtures";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const target = sampleProject.scenes[0];
const answer = (value: unknown) => Response.json({ id: "response-with-asset", model: "actual-test-model", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }], usage: { input_tokens: 100, output_tokens: 50 } });
function assetPlan(narration: string, assetId: string): VisualPlan {
  const plan = syntheticVisualPlan(narration);
  plan.entities[1] = { ...plan.entities[1], kind: "asset", assetId, label: "" };
  return plan;
}
function selection(project: Project = sampleProject, sceneId = target.id) {
  const input = directorInput(project, testSources, sceneId);
  const prompt = JSON.parse(input.prompt);
  return { input, prompt, assetId: prompt.assetCatalog.candidates[0]?.id as string };
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("catalog-constrained asset direction", () => {
  it("provides a bounded relevant shortlist, static/aspect constraints and strict nullable asset IDs", () => {
    const { input, prompt, assetId } = selection();
    expect(assetId).toBeTruthy();
    expect(prompt.assetCatalog.version).toBe(ASSET_CATALOG_VERSION);
    expect(prompt.assetCatalog.candidates.length).toBeLessThanOrEqual(16);
    expect(prompt.assetCatalog.candidates.length).toBeLessThan(LESSON_ASSETS.length);
    expect(prompt.assetCatalog.role).toContain("never factual evidence");
    expect(prompt.assetCatalog.constraints).toContain("cannot transform");
    expect(prompt.glyphCatalog.glyphs.asset).toContain("aspect ratio");
    expect(prompt.assetCatalog.candidates.every((item: Record<string, unknown>) => !item.file && !item.sha256 && typeof item.width === "number" && typeof item.height === "number")).toBe(true);
    const json = JSON.parse(JSON.stringify(openAISchema(input.schema)));
    expect(json.properties.entities.items.required).toContain("assetId");
    expect(JSON.stringify(json.properties.entities.items.properties.assetId)).toContain('"null"');
    const parsed = input.validate(assetPlan(target.narration, assetId));
    expect(parsed.entities[1].assetId).toBe(assetId);
    expect(input.assetSelection).toEqual({ catalogVersion: ASSET_CATALOG_VERSION, candidateIds: prompt.assetCatalog.candidates.map((item: { id: string }) => item.id), selectedIds: [assetId] });
  });

  it("rejects real but unlisted references and never records a failed candidate as selected", () => {
    const { input, assetId } = selection();
    input.validate(assetPlan(target.narration, assetId));
    const outside = LESSON_ASSETS.find(asset => !input.assetSelection.candidateIds.includes(asset.id))!;
    expect(() => input.validate(assetPlan(target.narration, outside.id))).toThrow("only from this scene");
    expect(input.assetSelection.selectedIds).toEqual([]);
    expect(() => input.validate(assetPlan(target.narration, "invented-asset"))).toThrow("existing vetted assetId");
    expect(() => input.validate({ ...assetPlan(target.narration, assetId), entities: assetPlan(target.narration, assetId).entities.map(entity => ({ ...entity, assetId })) })).toThrow("only valid for kind asset");
  });

  it("retains existing same-scene assets for repair without allowing a neighbor's unlisted asset", () => {
    const original = selection();
    const outside = LESSON_ASSETS.find(asset => !original.input.assetSelection.candidateIds.includes(asset.id))!;
    const plan = assetPlan(target.narration, outside.id);
    const previous = projectSchema.parse({ ...sampleProject, scenes: sampleProject.scenes.map(scene => scene.id === target.id ? { ...scene, visualPlan: plan } : scene) });
    const repaired = directorInput(previous, testSources, target.id, "Keep the same illustration and make its motion readable.");
    expect(repaired.assetSelection.candidateIds).toContain(outside.id);
    expect(repaired.assetSelection.candidateIds.length).toBeLessThanOrEqual(16);
    expect(repaired.validate(plan).entities[1].assetId).toBe(outside.id);
    const neighbor = projectSchema.parse({ ...sampleProject, scenes: sampleProject.scenes.map((scene, i) => i === 1 ? { ...scene, visualPlan: assetPlan(scene.narration, outside.id) } : scene) });
    expect(() => directorInput(neighbor, testSources, target.id).validate(plan)).toThrow("only from this scene");
  });

  it.each(["nim", "openai"] as const)("keeps actual asset references and provenance on the selected %s provider route", async generationProvider => {
    const { assetId } = selection();
    const plan = assetPlan(target.narration, assetId);
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => generationProvider === "openai" ? answer(plan) : Response.json({ id: "response-with-asset", model: "actual-test-model", choices: [{ message: { content: JSON.stringify(plan) }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50 } }));
    const result = await directScenes({ generationProvider, OPENAI_API_KEY: "synthetic", NVIDIA_API_KEY: "synthetic" }, sampleProject, testSources, [target.id], "", transport);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(String(transport.mock.calls[0][0])).toBe(generationProvider === "openai" ? "https://api.openai.com/v1/responses" : "https://integrate.api.nvidia.com/v1/chat/completions");
    expect(result.project.scenes[0].visualPlan?.entities[1].assetId).toBe(assetId);
    expect(result.attempts[0]).toMatchObject({ assetSelection: { catalogVersion: ASSET_CATALOG_VERSION, selectedIds: [assetId] }, attempts: [{ provider: generationProvider === "openai" ? "openai" : "nvidia", model: "actual-test-model", responseId: "response-with-asset" }] });
    expect(validateAssetSelection(result.attempts[0].assetSelection, result.project.scenes[0].visualPlan!)).toEqual(result.attempts[0].assetSelection);
    expect(() => validateAssetSelection({ ...result.attempts[0].assetSelection, selectedIds: [] }, result.project.scenes[0].visualPlan!)).toThrow("actual references");
  });

  it("forwards repair asset selection only on the final accepted director attempt", async () => {
    const previous = projectSchema.parse({ ...sampleProject, scenes: sampleProject.scenes.map(scene => ({ ...scene, visualPlan: syntheticVisualPlan(scene.narration) })) });
    const report = goodReview();
    report.scenes[0] = { sceneId: target.id, factualPass: true, visualPass: false, issues: [{ sceneId: target.id, kind: "icon", detail: "Synthetic illustrated subject needs correction.", repair: "Use a relevant supplied illustration for the moving subject." }] };
    const input = directorInput(previous, testSources, target.id, JSON.stringify(report));
    const assetId = input.assetSelection.candidateIds[0];
    const fixed = assetPlan(target.narration, assetId);
    const invalid = { ...fixed, entities: fixed.entities.map((entity, i) => i === 1 ? { ...entity, x: 0 } : entity) };
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(answer(invalid)).mockResolvedValueOnce(answer(fixed));
    const result = await repairScenes({ generationProvider: "openai", OPENAI_API_KEY: "synthetic" }, previous, testSources, [target.id], JSON.stringify(report), transport);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).not.toHaveProperty("assetSelection");
    expect(result.attempts[1]).toMatchObject({ stage: "director", sceneId: target.id, assetSelection: { catalogVersion: ASSET_CATALOG_VERSION, selectedIds: [assetId] } });
    expect(result.data.project.scenes[0].visualPlan?.entities[1].assetId).toBe(assetId);
  });

  it("persists selected references in per-scene checkpoints and final project provenance", async () => {
    const t = convexTest(schema, modules); rateLimiter.register(t);
    const token = "f".repeat(64);
    await t.mutation(api.sessions.start, { token });
    const jobId = await t.mutation(api.jobs.create, { token, topic: "How does water move?", duration: 60, audience: "beginner", requestId: "asset-direction-test", generationProvider: "openai" });
    vi.stubEnv("OPENAI_API_KEY", "synthetic");
    await t.run(async ctx => {
      await ctx.db.patch(jobId, { generation: true, status: "planning" });
      await ctx.db.insert("generationArtifacts", { jobId, stage: "research", json: JSON.stringify({ sources: testSources }), createdAt: Date.now() });
      await ctx.db.insert("generationArtifacts", { jobId, stage: "base", json: JSON.stringify({ project: sampleProject, provenance: { sceneEvidence: testDraft.scenes.map(scene => ({ sceneId: scene.id, evidence: scene.evidence })) } }), createdAt: Date.now() });
    });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const prompt = JSON.parse(body.input[0].content);
      return answer(assetPlan(prompt.scene.narration, prompt.assetCatalog.candidates[0].id));
    }));
    for (const scene of sampleProject.scenes) await t.action(internal.planning.directScene, { jobId, sceneId: scene.id });
    await t.action(internal.planning.finalizeProject, { jobId });
    const artifacts = await t.run(ctx => ctx.db.query("generationArtifacts").withIndex("by_jobId_and_stage", q => q.eq("jobId", jobId)).collect());
    const finalized = JSON.parse(artifacts.find(item => item.stage === "project")!.json);
    for (const scene of finalized.project.scenes) {
      const checkpoint = JSON.parse(artifacts.find(item => item.stage === `visual-${scene.id}`)!.json);
      const selected = [...new Set(scene.visualPlan.entities.flatMap((entity: { assetId?: string }) => entity.assetId ? [entity.assetId] : []))];
      expect(checkpoint.assetSelection.selectedIds).toEqual(selected);
      expect(finalized.provenance.directorAttempts.find((attempt: { sceneId: string }) => attempt.sceneId === scene.id).assetSelection).toEqual(checkpoint.assetSelection);
    }
  });
});
