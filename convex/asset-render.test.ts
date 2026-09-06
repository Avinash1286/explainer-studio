// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { getLessonAsset } from "../packages/assets/catalog";
import { projectSchema } from "../packages/contracts/scene";
import { renderedGlyphSize, validateVisualPlan, visualMaterialBounds } from "../packages/contracts/visual";
import { evaluateVisualFrame, VisualBoardFrame } from "../video/visual-board";
import { loadLessonAssets } from "../workers/media/render";
import { syntheticVisualPlan } from "../tests/director-helpers";
import { sampleProject } from "../tests/review-helpers";

const source = vi.hoisted(() => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#c02343"/></svg>');
vi.mock("../packages/assets/catalog", async () => {
  const { createHash } = await import("node:crypto");
  const base = { label: "Test artwork", concept: "test", synonyms: [], family: "sketch", style: "sketch", width: 200, height: 100, sha256: createHash("sha256").update(source).digest("hex"), source: "https://example.test/catalog", originalId: "original-test", license: "CC0-1.0", attribution: "Synthetic test artwork" };
  const entries = [{ ...base, id: "test-wide", file: "test-wide.svg" }, { ...base, id: "test-tall", file: "test-tall.svg", width: 100, height: 200 }];
  return { ASSET_CATALOG_VERSION: "test-v1", LESSON_ASSETS: entries, getLessonAsset: (id: string) => entries.find(entry => entry.id === id) };
});

const narration = sampleProject.scenes[0].narration;
function assetPlan() {
  const plan = syntheticVisualPlan(narration);
  plan.entities[0] = { ...plan.entities[0], kind: "asset", assetId: "test-wide" };
  plan.beats[0].action = "draw";
  delete plan.beats[0].value;
  return plan;
}
const withPlan = (plan = assetPlan()) => ({ ...sampleProject, scenes: sampleProject.scenes.map(scene => ({ ...scene, visualPlan: plan })) });
const directories: string[] = [];
async function directory() { const value = await mkdtemp(path.join(tmpdir(), "lesson-assets-test-")); directories.push(value); return value; }
afterEach(async () => {
  for (const value of directories.splice(0)) {
    const resolved = path.resolve(value);
    if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith("lesson-assets-test-")) throw new Error("Unsafe test cleanup path");
    await rm(resolved, { recursive: true, force: true });
  }
});

describe("vetted library asset contract and rendering", () => {
  it("roundtrips asset references without altering the existing lesson or static artwork", () => {
    const project = projectSchema.parse(withPlan());
    expect(projectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    expect(validateVisualPlan(project.scenes[0].visualPlan, narration)).toEqual(assetPlan());
    expect(validateVisualPlan(syntheticVisualPlan(narration), narration)).toEqual(syntheticVisualPlan(narration));
    expect(project.scenes.map(scene => scene.narration)).toEqual(sampleProject.scenes.map(scene => scene.narration));
  });

  it("rejects absent, unknown, path and URL references and assetId on native kinds", () => {
    for (const assetId of [undefined, "missing", "../test-wide", "https://example.test/art.svg", "data:image/svg+xml,svg"]) {
      const plan = assetPlan(); plan.entities[0].assetId = assetId;
      expect(() => validateVisualPlan(plan, narration)).toThrow();
    }
    const native = assetPlan(); native.entities[0].kind = "beaker";
    expect(() => validateVisualPlan(native, narration)).toThrow("assetId is only valid");
  });

  it("keeps static art unmodified and forbids an opaque asset parent over a mechanism", () => {
    for (const unsupported of [{ count: 1 }, { values: [] }, { variant: "positive" }]) {
      const plan = assetPlan(); Object.assign(plan.entities[0], unsupported);
      expect(() => validateVisualPlan(plan, narration)).toThrow("static assets do not support");
    }
    const defaults = assetPlan(); defaults.entities[0].variant = "default";
    expect(() => validateVisualPlan(defaults, narration)).not.toThrow();
    const transformed = assetPlan(); transformed.beats[0] = { ...transformed.beats[0], action: "transform", value: 1 };
    expect(() => validateVisualPlan(transformed, narration)).toThrow("asset has no visual transform state");
    const nested = assetPlan(); nested.entities[1].parentId = nested.entities[0].id;
    expect(() => validateVisualPlan(nested, narration)).toThrow("static asset cannot enclose");
  });

  it("uses intrinsic aspect in fitting, bounds and endpoint geometry while preserving native glyph sizes", () => {
    expect(renderedGlyphSize({ kind: "asset", assetId: "test-wide", w: 30, h: 30 })).toEqual({ width: 384, height: 192 });
    expect(renderedGlyphSize({ kind: "asset", assetId: "test-tall", w: 30, h: 30 })).toEqual({ width: 108, height: 216 });
    expect(renderedGlyphSize({ kind: "box", w: 30, h: 30 })).toEqual({ width: 216, height: 216 });
    const bounds=visualMaterialBounds({ kind: "asset", assetId: "test-wide", x: 50, y: 50, w: 30, h: 30 });
    expect(bounds.left).toBe(35); expect(bounds.right).toBe(65);
    expect(bounds.top).toBeCloseTo(50-192/14.4); expect(bounds.bottom).toBeCloseTo(50+192/14.4);
  });

  it("reveals an isolated image document deterministically and fails closed on missing images", () => {
    const plan = assetPlan(); plan.beats[0].at = 0;
    const assets = { "test-wide": `data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}` };
    const render = (frame: number) => renderToStaticMarkup(VisualBoardFrame({ plan, assets, frame, durationInFrames: 480 }));
    const middle = render(48);
    expect(middle).toContain('<image href="data:image/svg+xml;base64,');
    expect(middle).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(middle).toContain('width="179.2" height="179.2"'); // Half-width wipe over fitted358.4x179.2 image.
    expect(middle).not.toContain('fill="#c02343"'); // Artwork is not injected as page SVG nodes.
    render(420); expect(render(48)).toBe(middle);
    expect(() => renderToStaticMarkup(VisualBoardFrame({ plan, frame: 48, durationInFrames: 480 }))).toThrow("Missing verified lesson asset image");
    expect(() => renderToStaticMarkup(VisualBoardFrame({ plan, assets: { "test-wide": "https://example.test/art.svg" }, frame: 48, durationInFrames: 480 }))).toThrow("Missing verified");
    const motion = assetPlan();
    motion.beats = [{ ...motion.beats[0], action: "move", at: .1, duration: .2, x: 40, y: 45 }, { ...motion.beats[1], target: "water", action: "hide", at: .5, duration: .1 }];
    const state = evaluateVisualFrame(motion, undefined, 480, 400).find(entity => entity.entity.id === "water")!;
    expect(state.x).toBe(512); expect(state.y).toBe(324); expect(state.opacity).toBe(0);
  });

  it("loads only selected deduplicated files and retains their real integrity/license provenance", async () => {
    const root = await directory();
    await writeFile(path.join(root, "test-wide.svg"), source);
    const result = await loadLessonAssets(withPlan(), root);
    expect(Object.keys(result.assets)).toEqual(["test-wide"]); // Unselected test-tall.svg is intentionally absent.
    expect(Buffer.from(result.assets["test-wide"].split(",")[1], "base64").toString()).toBe(source);
    expect(result.assetManifest).toEqual({ catalogVersion: "test-v1", entries: [getLessonAsset("test-wide")] });
    expect(await readFile(path.join(root, "test-wide.svg"), "utf8")).toBe(source);
    const legacy = await loadLessonAssets(sampleProject, path.join(root, "does-not-exist"));
    expect(legacy.assets).toEqual({}); expect(legacy.assetManifest.entries).toEqual([]);
  });

  it("refuses missing and tampered selected files before handing any data to the renderer", async () => {
    const root = await directory();
    await expect(loadLessonAssets(withPlan(), root)).rejects.toThrow("Missing vetted lesson asset");
    await writeFile(path.join(root, "test-wide.svg"), source.replace("#c02343", "#000000"));
    await expect(loadLessonAssets(withPlan(), root)).rejects.toThrow("integrity check failed");
    const unknown = assetPlan(); unknown.entities[0].assetId = "../test-wide";
    await expect(loadLessonAssets(withPlan(unknown), root)).rejects.toThrow("Unknown or unsafe");
  });
});
