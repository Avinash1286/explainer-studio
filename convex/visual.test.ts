/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { internal } from "./_generated/api";
import schema from "./schema";
import { visualFixture } from "../packages/contracts/visual-fixture";
import { compileVisualTiming, renderedGlyphSize, validateVisualPlan, visualMaterialBounds, type VisualPlan } from "../packages/contracts/visual";
import { frameSamples, validateReplacement } from "../packages/contracts/review";
import { validateDirectedPlan } from "./lib/director";
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
afterEach(() => vi.useRealTimers());

describe("directed scene contract", () => {
  it("shares actual SVG fitting dimensions rather than treating equal percentages as a square", () => {
    expect(renderedGlyphSize({ kind: "lattice", w: 30, h: 30 })).toEqual({ width: 216, height: 216 });
    expect(renderedGlyphSize({ kind: "label", w: 30, h: 30 })).toEqual({ width: 384, height: 216 });
    expect(renderedGlyphSize({ kind: "chip", w: 40, h: 10 })).toEqual({ width: 72, height: 72 });
    expect(renderedGlyphSize({ kind: "chip", w: 10, h: 40 })).toEqual({ width: 128, height: 128 });
  });
  it("bounds the drawn lattice rather than its empty rows or rectangular viewport", () => {
    const lattice = { kind: "lattice" as const, x: 50, y: 40, w: 30, h: 30 };
    const full = visualMaterialBounds(lattice);
    expect(full.left).toBeCloseTo(42.74375);
    expect(full.right).toBeCloseTo(57.25625);
    expect(full.top).toBeCloseTo(27.1);
    expect(full.bottom).toBeCloseTo(52.9);
    const row = visualMaterialBounds({ ...lattice, count: 2 });
    expect(row.left).toBeCloseTo(full.left);
    expect(row.right).toBeCloseTo(full.right);
    expect(row.bottom).toBeCloseTo(31.9);
    expect(visualMaterialBounds({ ...lattice, count: 1 }).right).toBeCloseTo(45.44375);
    expect(visualMaterialBounds({ ...lattice, count: 16 })).toEqual(full);
  });
  it("rejects movement inside nominal material bounds but outside the drawn material", () => {
    const narration = "The lattice contains an electron. The electron starts to move within the material. Later the electron moves within the material again.";
    const plan: VisualPlan = {
      version: 1, grammar: "mechanism", objective: "An electron moves within the surrounding semiconductor material.",
      entities: [
        { id: "material", kind: "lattice", label: "", x: 50, y: 40, w: 30, h: 30, color: "gray", enter: 0, cue: "The lattice" },
        { id: "electron", kind: "electron", label: "", x: 50, y: 40, w: 6, h: 6, color: "blue", enter: 0.1, cue: "an electron", parentId: "material" },
      ],
      relations: [],
      beats: [
        { id: "first-move", target: "electron", action: "move", x: 52, y: 40, at: 0.3, duration: 0.1, cue: "The electron starts to move within the material", meaning: "The electron moves within the material." },
        { id: "later-move", target: "electron", action: "move", x: 61, y: 40, at: 0.7, duration: 0.1, cue: "Later the electron moves within the material again", meaning: "The electron continues moving within the material." },
      ],
    };
    // The former rectangle check accepted x=61 plus the nominal 3% half-width.
    expect(plan.beats[1].x! + plan.entities[1].w / 2).toBeLessThan(65);
    expect(() => validateDirectedPlan(plan, narration)).toThrow(/material|bounds|lattice/i);
    plan.beats[1].x = 55;
    expect(() => validateDirectedPlan(plan, narration)).not.toThrow();
  });
  it("accepts the renderer calibration and rejects disconnected or colliding scene geometry", () => {
    for (const scene of visualFixture.scenes) expect(validateVisualPlan(scene.visualPlan, scene.narration)).toEqual(scene.visualPlan);
    const scene = visualFixture.scenes[0];
    const copy = structuredClone(scene.visualPlan!);
    copy.entities[1].x = copy.entities[0].x;
    copy.entities[1].y = copy.entities[0].y;
    expect(() => validateVisualPlan(copy,scene.narration)).toThrow("overlap");
    copy.entities[1].parentId = copy.entities[0].id;
    expect(() => validateVisualPlan(copy,scene.narration)).not.toThrow();
    copy.relations[0].to = "missing";
    expect(() => validateVisualPlan(copy,scene.narration)).toThrow("existing entities");
  });
  it("checks move bounds, spoken anchors, meaningful motion, and chart data", () => {
    const scene = visualFixture.scenes[0];
    const copy = structuredClone(scene.visualPlan!);
    copy.beats[0].x = 96;
    expect(() => validateVisualPlan(copy,scene.narration)).toThrow("destination clips");
    copy.beats[0].x = 65;
    copy.beats[0].cue = "invented spoken words";
    expect(() => validateVisualPlan(copy,scene.narration)).toThrow("not spoken");
    copy.beats[0].cue = "";
    copy.beats[0].action = "pulse";
    expect(() => validateVisualPlan(copy,scene.narration)).toThrow("mechanism must");
    copy.grammar = "comparison";
    copy.entities[0].kind = "bars";
    expect(() => validateVisualPlan(copy,scene.narration)).toThrow("nonzero values");
  });
  it("uses actual spoken phrase timings including hyphenated and punctuation-only tokens", () => {
    const plan = structuredClone(visualFixture.scenes[0].visualPlan!);
    plan.entities[0].cue = "solar panel";
    const timing = compileVisualTiming(plan, [{text:".",start:0,end:0},{text:"Solar-panel",start:2,end:3}], 240, 24);
    expect(timing.entities.sun).toBe(44);
    const late = compileVisualTiming(plan, [{text:"Solar-panel",start:9.9,end:10}], 240,24);
    expect(late.entities.sun).toBeLessThanOrEqual(208);
    expect(late.relations[plan.relations[0].id]+24).toBeLessThan(240);
    for (const beat of Object.values(late.beats)) expect(beat.start+beat.duration).toBeLessThanOrEqual(240);
    expect(timing.relations[plan.relations[0].id]).toBeGreaterThanOrEqual(timing.entities.sun+12);
  });
  it("checks translated children and the whole rotation sweep", () => {
    const scene=visualFixture.scenes[1],source=structuredClone(scene.visualPlan!);
    source.entities[2].x=64;
    source.beats=[{id:"parent-move",target:"material",action:"move",at:.2,duration:.2,cue:"",meaning:"Move the material with its attached electron.",x:78,y:52},{...source.beats[0],cue:""}];
    expect(()=>validateVisualPlan(source,scene.narration)).toThrow("clips child");
    source.entities[2].x=47;
    source.beats[0].x=75;
    source.beats.push({id:"child-move",target:"electron",action:"move",at:.1,duration:.1,cue:"",meaning:"The electron moves before its material.",x:81,y:52});
    expect(()=>validateVisualPlan(source,scene.narration)).toThrow("clips child");
    const rotation=structuredClone(visualFixture.scenes[0].visualPlan!);
    rotation.entities[0].y=20;
    rotation.beats[0]={...rotation.beats[0],target:"sun",action:"rotate",value:360};
    expect(()=>validateVisualPlan(rotation,visualFixture.scenes[0].narration)).toThrow("rotating the group");
  });
  it("rejects a released particle carried off-canvas by two moving ancestors", () => {
    const source=structuredClone(visualFixture.scenes[1].visualPlan!);
    source.entities=[
      {id:"container",kind:"container",label:"",x:40,y:50,w:60,h:60,color:"blue",enter:0,cue:""},
      {id:"material",kind:"lattice",label:"",x:40,y:50,w:30,h:30,color:"purple",enter:0,cue:"",parentId:"container"},
      {id:"electron",kind:"electron",label:"",x:40,y:50,w:8,h:8,color:"blue",enter:0,cue:"",parentId:"material"},
    ];
    source.relations=[];
    source.beats=[
      {id:"release",target:"electron",action:"move",x:70,y:50,at:.1,duration:.1,cue:"",meaning:"The electron moves away from its original material."},
      {id:"move-material",target:"material",action:"move",x:55,y:50,at:.3,duration:.1,cue:"",meaning:"The material moves inside its containing structure."},
      {id:"move-container",target:"container",action:"move",x:60,y:50,at:.5,duration:.1,cue:"",meaning:"The container carries its remaining components rightward."},
    ];
    // All three absolute destinations fit individually. Their inherited
    // translations would nevertheless place the electron at x=105%.
    expect(()=>validateVisualPlan(source,visualFixture.scenes[1].narration)).toThrow(/clip|ancestor|nested/i);
  });
  it("rejects transform actions on fixed illustrations instead of accepting invisible motion", () => {
    for(const kind of ["water","root","heat","electron","sun","molecule","label"] as const){
      const scene=visualFixture.scenes[0],source=structuredClone(scene.visualPlan!);
      source.entities[0].kind=kind;
      source.beats[0]={...source.beats[0],target:source.entities[0].id,action:"transform",value:1};
      expect(()=>validateVisualPlan(source,scene.narration),kind).toThrow("no visual transform state");
    }
  });
  it("samples an early, intermediate, and completed rich scene while retaining legacy coverage", () => {
    const scenes = visualFixture.scenes.map((s,i)=>({...s,startFrame:i*240,durationInFrames:240}));
    const samples=frameSamples(scenes);
    expect(samples).toHaveLength(9);
    expect(samples.filter(s=>s.sceneId===scenes[0].id).map(s=>s.frame)).toContain(Math.floor(240*(.3+.22/2)));
    expect(samples.map(s=>s.frame)).toEqual(samples.map(s=>s.frame).sort((a,b)=>a-b));
    expect(frameSamples(scenes.map(scene=>({...scene,visualPlan:undefined})))).toHaveLength(6);
  });
  it("samples inside actual spoken action timing rather than missing a short flow between fixed fractions", () => {
    const source=structuredClone(visualFixture.scenes[0].visualPlan!);
    source.beats=[{id:"flow",target:source.relations[0].id,action:"flow",at:.3,duration:.15,cue:"",meaning:"Light travels along the relation during the spoken explanation."}];
    const samples=frameSamples([{id:"spoken-flow",startFrame:720,durationInFrames:480,visualPlan:source,visualTiming:{entities:{},relations:{},beats:{flow:{start:144,duration:72}}}}]);
    expect(samples.some(sample=>sample.frame>=720+144&&sample.frame<720+216)).toBe(true);
    expect(samples.map(sample=>sample.frame)).toContain(720+180);
  });
  it("includes a fully settled late action rather than sampling twice around its midpoint", () => {
    const source=structuredClone(visualFixture.scenes[2].visualPlan!);
    source.beats=[{id:"late-light",target:"bulb",action:"transform",value:1,at:.8,duration:.1,cue:"",meaning:"The bulb reaches its fully lit state at the end of the scene."}];
    const samples=frameSamples([{id:"late-light",startFrame:720,durationInFrames:480,visualPlan:source,visualTiming:{entities:{},relations:{},beats:{"late-light":{start:432,duration:47}}}}]);
    expect(samples).toHaveLength(3);
    expect(samples.at(-1)!.frame).toBe(720+479);
    expect(new Set(samples.map(sample=>sample.frame)).size).toBe(3);
  });
  it("cannot drop a directed scene during repair or change an untouched scene", () => {
    const before = {...visualFixture,origin:"generated" as const};
    const after = structuredClone(before);
    delete after.scenes[0].visualPlan;
    expect(() => validateReplacement(before,after,[before.scenes[0].id])).toThrow();
    const altered = structuredClone(before);
    altered.scenes[1].visualPlan!.entities[0].x += 1;
    expect(() => validateReplacement(before,altered,[before.scenes[0].id])).toThrow();
  });
  it("fences old renderers and accepts all 24 review frames for an eight-scene directed lesson", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules); workflow.register(t);
    const scenes = Array.from({length:8},(_,i)=>({...visualFixture.scenes[i%3],id:`scene-${i}`}));
    await t.run(async ctx=>{
      const sessionId=await ctx.db.insert("sessions",{tokenHash:"visual-worker-test",expiresAt:Date.now()+60000,expired:false});
      const jobId=await ctx.db.insert("jobs",{sessionId,topic:"How solar cells work",duration:90,audience:"beginner",status:"rendering",stageMessage:"Queued",revision:1,requestId:"visual-worker-test",generation:true,createdAt:Date.now(),updatedAt:Date.now()});
      await ctx.db.insert("mediaTasks",{jobId,fixtureVersion:"generated-v1",projectJson:JSON.stringify({...visualFixture,origin:"generated",targetDuration:90,scenes}),status:"queued",attempt:0,leaseUntil:0,createdAt:Date.now()});
    });
    expect(await t.mutation(internal.media.claim,{worker:"old",protocol:5})).toBeNull();
    const task=(await t.mutation(internal.media.claim,{worker:"directed",protocol:6}))!;
    expect(task).not.toBeNull();
    const lease={taskId:task.taskId,attempt:task.attempt,worker:"directed"};
    async function file(type:string){
      const storageId=await t.run(ctx=>ctx.storage.store(new Blob(["fixture bytes"],{type})));
      await t.run(ctx=>(ctx.db as unknown as {patch(id:string,doc:{contentType:string}):Promise<void>}).patch(storageId,{contentType:type}));
      await t.mutation(internal.media.registerUpload,{...lease,storageId});
      return storageId;
    }
    const result={video:await file("video/mp4"),project:await file("application/json"),captions:await file("text/vtt"),poster:await file("image/png"),durationSeconds:90};
    const frames=[];
    for(const [i,scene] of scenes.entries())for(const offset of [54,148,243])frames.push({sceneId:scene.id,frame:i*270+offset,storageId:await file("image/jpeg")});
    await expect(t.mutation(internal.media.complete,{...lease,result:{...result,frames:frames.slice(0,16)}})).rejects.toThrow("Missing");
    await t.mutation(internal.media.complete,{...lease,result:{...result,frames}});
    const saved=await t.run(ctx=>ctx.db.get(task.taskId));
    expect(saved?.status).toBe("completed");
    expect(saved?.result?.frames).toHaveLength(24);
  });
});
