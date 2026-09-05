import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { compactSceneReview } from "./lib/reviewProse";
import { validateSceneFrameReview } from "./lib/critic";
import { directorInput } from "./lib/director";
import { repairInput, visualOnlyRepair } from "./lib/repair";
import { goodReview, reviewSetup, sampleProject } from "../tests/review-helpers";
import { syntheticVisualPlan } from "../tests/director-helpers";
import { testSources } from "./testFixtures";

const sceneId=sampleProject.scenes[0].id;
const prose=(label:string)=>`${label}. ${"The visible mechanism needs a clear unobscured path and readable labels. ".repeat(12)} Preserve the complete final qualification.`;
function originalReview() {
  return {sceneId,summary:prose("Summary"),factualPass:true,visualPass:false,issues:[
    {sceneId,kind:"layout" as const,detail:prose("First detail"),repair:"Move the label beside its material."},
    {sceneId,kind:"timing" as const,detail:"The object arrives after it disappears.",repair:prose("Second repair")},
  ]};
}
const inference=(id=sceneId)=>({sceneId:id,provider:"cloudflare" as const,model:"test-model",usage:{input_tokens:100,output_tokens:200}});
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});

describe("bounded critic prose projection",()=>{
  it("shortens only overflowing prose and retains the exact original findings and field paths",()=>{
    const original=originalReview(),snapshot=structuredClone(original);
    const result=compactSceneReview(original,sceneId);
    expect(original).toEqual(snapshot);
    expect(result.proseCompaction).toEqual({original:snapshot,changedFields:["summary","issues.0.detail","issues.1.repair"]});
    expect(result.report.summary.length).toBeLessThanOrEqual(400);
    expect(result.report.issues[0].detail.length).toBeLessThanOrEqual(500);
    expect(result.report.issues[1].repair.length).toBeLessThanOrEqual(500);
    for(const text of [result.report.summary,result.report.issues[0].detail,result.report.issues[1].repair])expect(text).toMatch(/ … \[truncated; full text retained\]$/);
    expect(result.report.issues[0].repair).toBe(original.issues[0].repair);
    expect(result.report.issues[1].detail).toBe(original.issues[1].detail);
    expect(result.report.issues.map(({sceneId,kind})=>({sceneId,kind}))).toEqual(original.issues.map(({sceneId,kind})=>({sceneId,kind})));
    expect(result.report).toMatchObject({sceneId,factualPass:true,visualPass:false});
    expect(result.report.issues).toHaveLength(2);
    expect(validateSceneFrameReview({...result,inference:inference()},sceneId)).toEqual({...result,inference:inference()});
  });

  it("leaves prose at its existing ceilings byte-for-byte unchanged without an overflow record",()=>{
    const report={sceneId,summary:"s".repeat(400),factualPass:false,visualPass:true,issues:[{sceneId,kind:"factual",detail:"d".repeat(500),repair:"r".repeat(500)}]};
    expect(compactSceneReview(report,sceneId)).toEqual({report});
  });

  it.each([
    ["foreign scene",()=>({...originalReview(),sceneId:"foreign"})],
    ["foreign issue",()=>({...originalReview(),issues:[{...originalReview().issues[0],sceneId:"foreign"}]})],
    ["coerced boolean",()=>({...originalReview(),factualPass:"true"})],
    ["unknown kind",()=>({...originalReview(),issues:[{...originalReview().issues[0],kind:"cosmetic"}]})],
    ["excess count",()=>({...originalReview(),issues:Array.from({length:9},()=>originalReview().issues[0])})],
    ["unknown field",()=>({...originalReview(),approvalOverride:true})],
    ["inconsistent verdict",()=>({...originalReview(),visualPass:true})],
    ["oversized string",()=>({...originalReview(),summary:"x".repeat(4001)})],
    ["oversized original",()=>({...originalReview(),issues:Array.from({length:4},()=>({...originalReview().issues[0],detail:"d".repeat(4000),repair:"r".repeat(4000)}))})],
  ])("rejects %s rather than repairing non-prose structure",(_,candidate)=>{
    expect(()=>compactSceneReview(candidate(),sceneId)).toThrow();
  });

  it("rejects forged compact prose, source correspondence and reordered changed paths",()=>{
    const valid={...compactSceneReview(originalReview(),sceneId),inference:inference()};
    const changed=structuredClone(valid);changed.report.issues[0].detail="A different finding.";
    expect(()=>validateSceneFrameReview(changed,sceneId)).toThrow("does not match");
    const wrongOriginal=structuredClone(valid);wrongOriginal.proseCompaction!.original.issues[0].detail="Unrelated original. "+wrongOriginal.proseCompaction!.original.issues[0].detail;
    expect(()=>validateSceneFrameReview(wrongOriginal,sceneId)).toThrow("does not match");
    const wrongPaths=structuredClone(valid);wrongPaths.proseCompaction!.changedFields.reverse();
    expect(()=>validateSceneFrameReview(wrongPaths,sceneId)).toThrow("does not match");
  });

  it("keeps saved original prose immutable and gives automatic repair the complete overflow text",async()=>{
    const {t,jobId,lease,result}=await reviewSetup(),args={jobId,revision:1};
    await t.mutation(internal.media.complete,{...lease,result});
    await t.action(internal.reviewActions.prepare,args);
    const evidence=(await t.run(ctx=>ctx.db.query("reviewCheckpoints").collect())).find(row=>row.kind==="evidence")!;
    await t.mutation(internal.reviews.saveCheckpoint,{...args,kind:"facts",sceneId:"",evidenceId:evidence._id,json:JSON.stringify({data:goodReview(),attempts:[{provider:"nvidia",outcome:"success",elapsedMs:1}]})});
    const compact=compactSceneReview(originalReview(),sceneId),value={...compact,inference:inference()};
    const payload={...args,kind:"scene" as const,sceneId,evidenceId:evidence._id,json:JSON.stringify(value)};
    expect(await t.mutation(internal.reviews.saveCheckpoint,payload)).toBe(true);
    expect(await t.mutation(internal.reviews.saveCheckpoint,payload)).toBe(true);
    const changedOriginal=originalReview();changedOriginal.issues[0].detail+=" Different retained ending.";
    const alternative={...compactSceneReview(changedOriginal,sceneId),inference:inference()};
    expect(alternative.report).toEqual(value.report);
    await expect(t.mutation(internal.reviews.saveCheckpoint,{...payload,json:JSON.stringify(alternative)})).rejects.toThrow("immutable");
    for(const scene of goodReview().scenes.slice(1))await t.mutation(internal.reviews.saveCheckpoint,{...args,kind:"scene",sceneId:scene.sceneId,evidenceId:evidence._id,json:JSON.stringify({report:{summary:"Passing scene",...scene},inference:inference(scene.sceneId)})});
    await t.mutation(internal.reviews.assemble,args);
    const request=(await t.run(ctx=>ctx.db.query("revisionRequests").collect()))[0];
    const context=await t.query(internal.reviews.repairContext,{requestId:request._id});
    expect(JSON.parse(context!.reviewContext!).scenes).toEqual([originalReview()]);
    expect(visualOnlyRepair(request.instruction,[sceneId])).toBe(true);
    const input=repairInput(sampleProject,testSources,[sceneId],request.instruction,context!.reviewContext);
    const prompt=JSON.parse(input.prompt);
    expect(prompt.requestedEdit).toBe(request.instruction);
    expect(prompt.originalReviewContext).toBe(context!.reviewContext);
    expect(JSON.parse(prompt.originalReviewContext).scenes[0].issues[0].detail).toBe(originalReview().issues[0].detail);
    const transport=vi.fn<typeof fetch>().mockImplementation(async(_,init)=>{
      const actual=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      expect(actual.requestedEdit).toBe(request.instruction);
      expect(actual.originalReviewContext).toBe(context!.reviewContext);
      const patch={scenes:[{...sampleProject.scenes[0],title:"Clear flow",layout:"comparison",nodes:[{icon:"2600",label:"Sun",cue:"sun"},{icon:"1F4A7",label:"Water",cue:"water"}],evidenceIds:[input.evidence[0].id]}]};
      return Response.json({choices:[{message:{content:JSON.stringify(patch)}}]});
    });
    vi.stubEnv("NVIDIA_API_KEY","test");vi.stubGlobal("fetch",transport);
    await t.action(internal.reviewActions.rewrite,{requestId:request._id});
    expect(transport).toHaveBeenCalledTimes(1);
    const saved=(await t.run(ctx=>ctx.db.query("reviewCheckpoints").collect())).find(row=>row.kind==="scene"&&row.sceneId===sceneId)!;
    expect(JSON.parse(saved.json).proseCompaction.original).toEqual(originalReview());
  });

  it("preserves the structured visual-only envelope and unchanged-plan rejection when full context is supplied",()=>{
    const project=structuredClone(sampleProject);project.scenes[0].visualPlan=syntheticVisualPlan(project.scenes[0].narration);
    const report=goodReview(),compact=compactSceneReview(originalReview(),sceneId);
    report.scenes[0]={sceneId,factualPass:compact.report.factualPass,visualPass:compact.report.visualPass,issues:compact.report.issues};
    const instruction=JSON.stringify(report),context=JSON.stringify({scenes:[originalReview()]});
    const input=directorInput(project,testSources,sceneId,instruction,undefined,context),prompt=JSON.parse(input.prompt);
    expect(prompt.requestedCorrection).toBe(instruction);
    expect(prompt.originalReviewContext).toBe(context);
    expect(visualOnlyRepair(prompt.requestedCorrection,[sceneId])).toBe(true);
    expect(()=>input.validate(project.scenes[0].visualPlan)).toThrow("animation is unchanged");
  });
});
