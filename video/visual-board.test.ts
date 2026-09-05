// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { visualFixture } from "../packages/contracts/visual-fixture";
import { evaluateVisualFrame, MechanismGlyph, relationGeometry, VisualBoardFrame } from "./visual-board";
import type { VisualPlan } from "../packages/contracts/visual";

const plan = () => structuredClone(visualFixture.scenes[0].visualPlan!);
describe("directed whiteboard rendering", () => {
  it("seeks deterministically without changing the scene program", () => {
    const source = plan(), original = structuredClone(source);
    const first = evaluateVisualFrame(source, undefined, 480, 180);
    evaluateVisualFrame(source, undefined, 480, 420);
    expect(evaluateVisualFrame(source, undefined, 480, 180)).toEqual(first);
    expect(source).toEqual(original);
  });
  it("hides then redraws an existing illustration with a fresh outline", () => {
    const source = plan();
    source.beats = [
      { id:"hide",target:"sun",action:"hide",at:.15,duration:.1,cue:"",meaning:"Remove the original source after its energy transfers." },
      { id:"draw",target:"sun",action:"draw",at:.5,duration:.2,cue:"",meaning:"Draw the source again for a new explanation stage." },
    ];
    const sun = (frame:number) => evaluateVisualFrame(source,undefined,480,frame).find(s=>s.entity.id==="sun")!;
    expect(sun(60).opacity).toBe(1);
    expect(sun(180).opacity).toBe(0);
    expect(sun(288).opacity).toBe(1);
    expect(sun(288).draw).toBeCloseTo(.5);
    expect(sun(420).draw).toBe(1);
  });
  it("moves children with their parent while retaining absolute authored positions", () => {
    const source=structuredClone(visualFixture.scenes[1].visualPlan!);
    source.beats=[{id:"move-material",target:"material",action:"move",at:.1,duration:.2,cue:"",meaning:"Move the material and its attached electron together.",x:55,y:52}];
    const end=evaluateVisualFrame(source,undefined,480,420);
    expect(end.find(s=>s.entity.id==="electron")!.x).toBeCloseTo(1280*.55);
    expect(end.find(s=>s.entity.id==="electron")!.y).toBeCloseTo(720*.52);
  });
  it("changes a bulb from off to on and keeps arrow endpoints outside the illustrations", () => {
    const source=visualFixture.scenes[2].visualPlan!;
    const beginning=evaluateVisualFrame(source,undefined,480,0),end=evaluateVisualFrame(source,undefined,480,420);
    expect(beginning.find(s=>s.entity.id==="bulb")!.state).toBe(0);
    expect(end.find(s=>s.entity.id==="bulb")!.state).toBe(1);
    const geometry=relationGeometry(source.relations[0],end[0],end[1]);
    expect(geometry.start.x).toBeGreaterThan(end[0].x);
    expect(geometry.end.x).toBeLessThan(end[1].x);
    expect(Object.values(geometry.start).every(Number.isFinite)).toBe(true);
  });
  it("honors count exactly for scientific groups, including non-square lattices", () => {
    for(const count of [1,3,10,16]) for(const kind of ["molecule","lattice","grid","atom","layers"] as const){
      const markup=renderToStaticMarkup(MechanismGlyph({kind,count,color:"#91cbed",state:1,frame:100}));
      const shapes=markup.match(kind==="grid"?/<rect/g:kind==="layers"?/<path/g:/<circle/g)||[];
      expect(shapes.length,`${kind}: ${count}`).toBe(count+(kind==="atom"?3:0));
    }
  });
  it("renders an empty beaker at state zero and only intentional spatial text", () => {
    const empty=renderToStaticMarkup(MechanismGlyph({kind:"beaker",color:"#91cbed",state:0,frame:0}));
    expect(empty).not.toContain('fill="#91cbed"');
    const source=plan();
    const markup=renderToStaticMarkup(VisualBoardFrame({plan:source,durationInFrames:480,frame:420}));
    expect(markup).toContain("SOLAR CELL");
    expect(markup).not.toContain("EXPLAINER STUDIO");
    expect(markup).not.toContain("Kokoro");
    expect(markup).not.toContain(visualFixture.scenes[0].takeaway);
  });
  it("restores a relation after hide and draw without inventing a photon from its color", () => {
    const source:VisualPlan=plan();
    source.relations[0].color="yellow";
    source.relations[0].particle="dot";
    source.beats=[{id:"hide-edge",target:"light-path",action:"hide",at:.25,duration:.1,cue:"",meaning:"Hide the old relation before drawing it again."},{id:"draw-edge",target:"light-path",action:"draw",at:.5,duration:.2,cue:"",meaning:"Restore the relation to reconnect the two subjects."}];
    const hidden=renderToStaticMarkup(VisualBoardFrame({plan:source,durationInFrames:480,frame:200}));
    const restored=renderToStaticMarkup(VisualBoardFrame({plan:source,durationInFrames:480,frame:420}));
    expect(hidden).not.toContain("LIGHT ENERGY");
    expect(restored).toContain("LIGHT ENERGY");
    expect(restored).not.toContain('d="M-12 0 L-7 -5 L-2 5');
  });
});
