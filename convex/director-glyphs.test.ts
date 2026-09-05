// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { glyphCatalog } from "./lib/directorGlyphs";
import { directorInput } from "./lib/director";
import { sampleProject } from "../tests/review-helpers";
import { testSources } from "./testFixtures";
import { renderedGlyphSize, TRANSFORM_KINDS, VISUAL_KINDS, visualMaterialBounds, type VisualKind } from "../packages/contracts/visual";
import { MechanismGlyph } from "../video/visual-board";

const glyph = (kind: VisualKind, state = 1, count?: number) => renderToStaticMarkup(MechanismGlyph({ kind, state, count, color: "#91cbed", frame: 0 }));

describe("director's actual renderer vocabulary", () => {
  it("covers every kind and only the supported transform states in one bounded prompt field", () => {
    expect(Object.keys(glyphCatalog.glyphs).sort()).toEqual([...VISUAL_KINDS].sort());
    expect(Object.keys(glyphCatalog.transform).sort()).toEqual([...TRANSFORM_KINDS].sort());
    const input = directorInput(sampleProject, testSources, sampleProject.scenes[0].id);
    const prompt = JSON.parse(input.prompt);
    expect(prompt.glyphCatalog).toEqual(glyphCatalog);
    expect(input.prompt.match(/"glyphCatalog":/g)).toHaveLength(1);
    expect(JSON.stringify(glyphCatalog).length).toBeLessThan(11_000);
    expect(prompt.scene.narration).toBe(sampleProject.scenes[0].narration);
    expect(prompt.sources).toEqual(testSources);
  });

  it("describes a thin box viewport as a tiny fitted shape rather than a stretched contact", () => {
    const size = renderedGlyphSize({ kind: "box", w: 32, h: 6 });
    expect(size.width).toBeCloseTo(43.2);
    expect(size.height).toBe(size.width);
    expect(glyph("box")).toContain('width="82" height="72"');
    expect(glyphCatalog.geometry).toContain("43.2px square");
    expect(glyphCatalog.glyphs.box).toContain("fixed local width82,height72");
  });

  it("documents count-dependent lattice material instead of promising a filled square", () => {
    for (const count of [1, 2, 4, 9, 16]) {
      expect(glyph("lattice", 1, count).match(/<circle /g)).toHaveLength(count);
    }
    const base = { kind: "lattice" as const, x: 50, y: 50, w: 28, h: 50 };
    const two = visualMaterialBounds({ ...base, count: 2 });
    const four = visualMaterialBounds({ ...base, count: 4 });
    expect(two.bottom - two.top).toBeCloseTo(16 / 86 * (four.bottom - four.top));
    expect(two.bottom).toBeLessThan(50);
    expect(glyphCatalog.glyphs.lattice).toContain("count2 is only a top row");
    expect(glyphCatalog.glyphs.lattice).toContain("unsigned blue dots");
    expect(glyphCatalog.transform).not.toHaveProperty("lattice");
  });

  it("keeps illustrated stacks and quantities distinct from arrows and accurate molecular models", () => {
    expect(glyph("layers", 1, 3).match(/<path /g)).toHaveLength(3);
    expect(glyph("layers", 0, 3)).toBe(glyph("layers", 1, 3));
    expect(glyph("molecule", 1, 3).match(/<path /g)).toHaveLength(2);
    expect(glyph("atom", 1, 2).match(/<circle /g)).toHaveLength(5);
    expect(glyph("token").match(/<circle /g)).toHaveLength(8); // Four double-ring tokens.
    expect(glyphCatalog.glyphs.layers).toContain("NOT field arrows");
    expect(glyphCatalog.glyphs.molecule).toContain("no closing bond");
    expect(glyphCatalog.glyphs.atom).toContain("count does NOT set protons");
    expect(glyphCatalog.parameters).toContain("default4");
  });

  it("matches meaningful state changes and explicitly static silhouettes", () => {
    for (const kind of TRANSFORM_KINDS) expect(glyph(kind, 0), kind).not.toBe(glyph(kind, 1));
    for (const kind of ["sun", "solar-panel", "electron", "molecule", "layers", "box"] as const) expect(glyph(kind, 0), kind).toBe(glyph(kind, 1));
    expect(glyphCatalog.glyphs.battery).toContain("not a generic voltage/potential label");
    expect(glyphCatalog.glyphs.pipe).toContain("Not a wire");
    expect(glyphCatalog.transform.wave).toContain("amplitude35%");
    expect(glyphCatalog.transform.scale).toContain("never tips the other way");
  });
});
