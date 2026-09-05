import { describe, expect, it, vi } from "vitest";
import { directScenes, directorInput, validateDirectedPlan } from "./lib/director";
import { fitDirectedLayout, requiredCompositionScale } from "./lib/directorLayout";
import { renderedGlyphSize, validateVisualPlan, type VisualPlan } from "../packages/contracts/visual";
import { syntheticVisualPlan } from "../tests/director-helpers";
import { sampleProject } from "../tests/review-helpers";
import { testSources } from "./testFixtures";

const narration=sampleProject.scenes[0].narration;
function smallPlan() {
  const plan=syntheticVisualPlan(narration),scale=.6;
  return {...plan,entities:plan.entities.map(entity=>({...entity,x:50+(entity.x-50)*scale,y:50+(entity.y-50)*scale,w:entity.w*scale,h:entity.h*scale})),beats:plan.beats.map(beat=>beat.action==="move"?{...beat,x:50+(beat.x!-50)*scale,y:50+(beat.y!-50)*scale}:beat)};
}
const fit=(plan:VisualPlan)=>fitDirectedLayout(plan,narration,candidate=>validateDirectedPlan(candidate,narration));
function nestedPlan():VisualPlan {
  const source=syntheticVisualPlan(narration),early=source.entities[0].cue,later=source.entities[1].cue;
  return {version:1,grammar:"mechanism",objective:"Move a material and its contained electron together.",entities:[
    {id:"material",kind:"lattice",label:"",x:45,y:50,w:20,h:20,color:"gray",enter:0,cue:early},
    {id:"electron",kind:"electron",label:"",x:45,y:50,w:4,h:4,color:"blue",enter:0,cue:early,parentId:"material"},
  ],relations:[],beats:[
    {id:"move-material",target:"material",action:"move",x:48,y:50,at:.1,duration:.1,cue:early,meaning:"The material carries the electron to the right."},
    {id:"move-charge",target:"electron",action:"move",x:46,y:50,at:.55,duration:.15,cue:later,meaning:"The electron moves within the material."},
  ]};
}

describe("guarded uniform director layout fit",()=>{
  it("leaves an already readable layout and subsequent repeated fits unchanged",()=>{
    const original=syntheticVisualPlan(narration);
    expect(fit(original)).toEqual({plan:original});
    expect(fit(fit(original).plan)).toEqual({plan:original});
  });

  it("uniformly fits the complete candidate while retaining all authored non-geometric fields",()=>{
    const original=smallPlan(),snapshot=structuredClone(original),result=fit(original),adjustment=result.layoutAdjustment!;
    expect(original).toEqual(snapshot);
    expect(adjustment.original).toEqual(snapshot);
    expect(adjustment.reason).toBe("readability");
    const {scale,translateXPixels,translateYPixels}=adjustment.transform;
    expect(scale).toBeCloseTo(1/.6);
    for(const [i,entity] of result.plan.entities.entries()) {
      const source=original.entities[i];
      expect(entity).toEqual({...source,x:source.x*scale+translateXPixels/1280*100,y:source.y*scale+translateYPixels/720*100,w:source.w*scale,h:source.h*scale});
    }
    for(const [i,beat] of result.plan.beats.entries())expect(beat).toEqual(original.beats[i].action==="move"?{...original.beats[i],x:original.beats[i].x!*scale+translateXPixels/1280*100,y:original.beats[i].y!*scale+translateYPixels/720*100}:original.beats[i]);
    expect(result.plan.relations).toEqual(original.relations);
    expect(renderedGlyphSize(result.plan.entities[0]).width).toBeCloseTo(358.4,8);
    expect(requiredCompositionScale(result.plan)).toBeLessThanOrEqual(1+1e-9);
    expect(fit(result.plan)).toEqual({plan:result.plan});
  });

  it("fits inherited movement without altering containment or relative scale",()=>{
    const original=nestedPlan(),result=fit(original);
    expect(result.layoutAdjustment).toBeDefined();
    expect(result.plan.entities[1].parentId).toBe("material");
    expect(result.plan.entities[0].w/result.plan.entities[1].w).toBe(original.entities[0].w/original.entities[1].w);
    expect(()=>validateDirectedPlan(result.plan,narration)).not.toThrow();
  });

  it("does not normalize invalid original structure, overlaps or unspoken actions",()=>{
    const overlap=smallPlan();overlap.entities[1].x=overlap.entities[0].x;overlap.entities[1].y=overlap.entities[0].y;
    expect(()=>fit(overlap)).toThrow("overlap");
    const unspoken=smallPlan();unspoken.beats[0].cue="invented non-spoken mechanism";
    expect(()=>fit(unspoken)).toThrow("not spoken");
  });

  it("rejects widely spaced tiny objects with actionable measured feedback",()=>{
    const original=smallPlan();original.entities[0].x=20;original.entities[1].x=80;original.beats[1].x=80;
    expect(()=>validateVisualPlan(original,narration)).not.toThrow();
    expect(()=>fit(original)).toThrow(/motion and label bounds.*Largest primary 'water' is 215\.0px; required uniform scale is 1\.667/);
  });

  it("rejects a fit that violates viewport limits instead of independently resizing objects",()=>{
    const original=smallPlan();original.entities[0]={...original.entities[0],x:40,y:60,w:70,h:22};original.entities[1]={...original.entities[1],x:85,y:20};original.beats[1]={...original.beats[1],x:85,y:20};
    expect(()=>validateVisualPlan(original,narration)).not.toThrow();
    expect(()=>fit(original)).toThrow("w<=70/h<=75");
  });

  it("reserves inherited parent travel and the complete rotation sweep before enlarging",()=>{
    const movement=nestedPlan();movement.beats[0].x=68;
    expect(()=>validateVisualPlan(movement,narration)).not.toThrow();
    expect(()=>fit(movement)).toThrow("motion and label bounds");
    const rotation=nestedPlan();rotation.entities.forEach(entity=>{entity.x+=5;});rotation.beats[0]={...rotation.beats[0],action:"rotate",value:360};rotation.beats[1].x=51;
    expect(()=>validateVisualPlan(rotation,narration)).not.toThrow();
    expect(()=>fit(rotation)).toThrow("motion and label bounds");
  });

  it("fits only new model candidates and records their original plan and transform beside actual provider attempts",async()=>{
    const original=smallPlan();
    expect(()=>validateDirectedPlan(original,narration)).toThrow("focal component");
    const input=directorInput(sampleProject,testSources,sampleProject.scenes[0].id);
    expect(()=>input.validate(original)).not.toThrow();
    expect(input.layoutAdjustment?.original).toEqual(original);
    const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({id:"actual-layout-response",model:"actual-nim-model",choices:[{message:{content:JSON.stringify(original)}}],usage:{prompt_tokens:100,completion_tokens:80}}));
    const result=await directScenes({generationProvider:"nim",NVIDIA_API_KEY:"test"},sampleProject,testSources,[sampleProject.scenes[0].id],"",transport);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.attempts[0].attempts[0]).toMatchObject({provider:"nvidia",model:"actual-nim-model",responseId:"actual-layout-response"});
    expect(result.attempts[0].layoutAdjustment?.original).toEqual(original);
    expect(result.project.scenes.slice(1)).toEqual(sampleProject.scenes.slice(1));
  });
});
