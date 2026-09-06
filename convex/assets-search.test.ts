import { describe, expect, it } from "vitest";
import { selectLessonAssets } from "../packages/assets/search";
import { LESSON_ASSETS, type LessonAsset } from "../packages/assets/catalog";

function asset(id: string, label: string, extras: Partial<LessonAsset> = {}): LessonAsset {
  return { id, label, concept: label, synonyms: [], family: "openmoji", style: "flat", file: `assets/${id}.svg`, width: 100, height: 100, sha256: id, source: "synthetic test", originalId: id, license: "test", attribution: "test", ...extras };
}
describe("deterministic illustration retrieval", () => {
  it("ranks exact multiword subjects and lexical aliases while excluding ambiguous partial subjects", () => {
    const catalog = [asset("biological", "young cell"), asset("field", "field"), asset("pv", "solar cell"), asset("panel", "solar panel"), asset("baseball", "baseball field")];
    const result = selectLessonAssets({ title: "A photovoltaic cell", narration: "The internal field separates charges in the photovoltaic cell." }, { catalog });
    expect(result.map(item => item.id)).toEqual(["pv"]);
    expect(selectLessonAssets({ narration: "Solar panels collect sunlight." }, { catalog }).map(item => item.id)).toEqual(["panel"]);
  });

  it("uses meaningful catalog synonyms and whole tokens, without adding unrelated filler", () => {
    const catalog = [asset("rain", "rain cloud", { synonyms: ["rainfall"] }), asset("train", "train"), asset("brain", "brain"), asset("chair", "chair")];
    expect(selectLessonAssets({ narration: "Rainfall returns water to the land." }, { catalog }).map(item => item.id)).toEqual(["rain"]);
    expect(selectLessonAssets({ narration: "Trains carry cargo." }, { catalog }).map(item => item.id)).toEqual(["train"]);
    expect(selectLessonAssets({ narration: "This illustrates the abstract epistemological paradox." }, { catalog })).toEqual([]);
    expect(selectLessonAssets({ narration: "the and an object icon" }, { catalog })).toEqual([]);
  });

  it("prefers an equivalent sketch and removes skin-tone and identical-artwork duplicates", () => {
    const catalog = [
      asset("bulb-flat", "light bulb"), asset("bulb-sketch", "lightbulb", { family: "sketch", style: "sketch" }),
      asset("hand", "waving hand"), asset("hand-light", "waving hand: light skin tone"), asset("hand-dark", "waving hand: medium-dark skin tone"),
      asset("same-art", "greeting hand", { sha256: "hand", synonyms: ["waving hand"] }),
    ];
    const result = selectLessonAssets({ narration: "A waving hand holds a light bulb." }, { catalog });
    expect(result.map(item => item.id)).toContain("bulb-sketch");
    expect(result.map(item => item.id)).not.toContain("bulb-flat");
    expect(result.filter(item => item.label.includes("hand"))).toHaveLength(1);
  });

  it("uses scene concepts and a requested correction, with stable capped ordering", () => {
    const catalog = Array.from({ length: 24 }, (_, i) => asset(`battery-${String(i).padStart(2, "0")}`, `battery design ${i}`, { synonyms: ["battery"] }));
    const query = { narration: "Electricity travels through a circuit.", concepts: ["battery design"], correction: "Make the battery design readable." };
    const result = selectLessonAssets(query, { catalog, limit: 100 });
    expect(result).toHaveLength(16);
    expect(selectLessonAssets(query, { catalog: [...catalog].reverse(), limit: 100 })).toEqual(result);
    expect(selectLessonAssets(query, { catalog, limit: 0 })).toEqual([]);
    expect(selectLessonAssets(query, { catalog, limit: 3 })).toHaveLength(3);
  });

  it("does not expand scientific parts or ambiguous words into unrelated subjects", () => {
    const catalog = [asset("young-cell", "young cell"), asset("water-vapor", "water vapor", { concept: "cloud" }), asset("pipeline", "pipeline", { synonyms: ["plumbing pipe"] }), asset("electron", "electron")];
    const result = selectLessonAssets({ narration: "Electrons move within a photovoltaic cell." }, { catalog });
    expect(result.map(item => item.id)).toEqual(["electron"]);
  });

  it("retrieves real imported artwork for exact subjects, synonyms and multiword phrases", () => {
    expect(LESSON_ASSETS.length).toBeGreaterThan(4500);
    const battery = selectLessonAssets({ title: "Battery", narration: "A battery stores energy and supplies a circuit." });
    expect(battery[0]).toMatchObject({ family: "sketch", concept: "battery" });
    expect(selectLessonAssets({ narration: "An electric bulb lights the room." }).some(item => item.family === "sketch" && item.concept === "lightbulb")).toBe(true);
    expect(selectLessonAssets({ narration: "Water gathers in a rain cloud before falling." }).some(item => item.concept === "rain cloud")).toBe(true);
    expect(selectLessonAssets({ narration: "The photovoltaic cell pushes freed electrons toward its front surface." }).some(item => item.concept === "young cell")).toBe(false);
    expect(selectLessonAssets({ narration: "Zqxj epistemological metaparadox." })).toEqual([]);
  });

  it("does not treat broad imported tags or ambiguous verbs as subjects in real narration", () => {
    const cell = selectLessonAssets({ narration: "The cell’s internal electric field pushes freed electrons toward the front surface and leaves positive charges behind, creating a voltage." });
    expect(cell.some(item => /arduino|battery|clover|herb|seedling|young cell|lightning|desktop computer/.test(item.concept))).toBe(false);
    const cpu = selectLessonAssets({ narration: "A CPU executes instructions and stores data in memory." });
    expect(cpu.some(item => /store|jar/.test(item.concept))).toBe(false);
    const cloud = selectLessonAssets({ narration: "Water vapor can cool as air rises. Tiny drops gather to form a cloud." });
    expect(cloud.some(item => /COOL button|anchor|airplane|aquarius|snow/.test(item.concept))).toBe(false);
  });
});
