// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { LESSON_ASSETS } from "../packages/assets/catalog";
import { renderedGlyphSize, validateVisualPlan } from "../packages/contracts/visual";
import { loadLessonAssets } from "../workers/media/render";
import { sampleProject } from "../tests/review-helpers";
import { syntheticVisualPlan } from "../tests/director-helpers";

describe("published artwork and worker integration", () => {
  it("loads one real asset from each family with its original bytes, aspect and attribution", async () => {
    const selected = (["sketch", "openmoji", "iconify"] as const).map(family => {
      const asset = LESSON_ASSETS.find(item => item.family === family);
      if (!asset) throw new Error(`Missing published ${family} asset`);
      return asset;
    });
    const project = { ...sampleProject, scenes: sampleProject.scenes.map((scene, index) => {
      const visualPlan = syntheticVisualPlan(scene.narration), asset = selected[index % selected.length];
      visualPlan.entities[0] = { ...visualPlan.entities[0], kind: "asset", assetId: asset.id };
      visualPlan.beats[0].action = "draw"; delete visualPlan.beats[0].value;
      validateVisualPlan(visualPlan, scene.narration);
      const fitted = renderedGlyphSize(visualPlan.entities[0]);
      expect(fitted.width / fitted.height).toBeCloseTo(asset.width / asset.height);
      return { ...scene, visualPlan };
    }) };
    const loaded = await loadLessonAssets(project);
    expect(Object.keys(loaded.assets).sort()).toEqual(selected.map(asset => asset.id).sort());
    for (const asset of selected) {
      const original = await readFile(path.join("public/lesson-assets", asset.file));
      expect(Buffer.from(loaded.assets[asset.id].split(",")[1], "base64")).toEqual(original);
      expect(loaded.assetManifest.entries.find(entry => entry.id === asset.id)).toMatchObject({ sha256: asset.sha256, license: asset.license, attribution: asset.attribution, source: asset.source, originalId: asset.originalId });
    }
  });
});
