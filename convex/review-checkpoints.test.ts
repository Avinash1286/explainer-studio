import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { goodReview, owner, reviewSetup, sampleProject } from "../tests/review-helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NVIDIA_API_KEY", "test-nvidia");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-cloudflare");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

async function setup() {
  const current=await reviewSetup();
  await current.t.mutation(internal.media.complete,{...current.lease,result:current.result});
  return current;
}
const scope=(request?:RequestInit):string=>{
  const content=JSON.parse(String(request?.body)).messages[1].content;
  return Array.isArray(content)?JSON.parse(content[0].text).targetSceneId:"facts";
};
function response(sceneId:string) {
  const full=goodReview(),report=sceneId==="facts"?full:{summary:full.summary,...full.scenes.find(scene=>scene.sceneId===sceneId)!};
  return Response.json({id:`response-${sceneId}`,model:"test-model",choices:[{finish_reason:"stop",message:{content:JSON.stringify(report)}}],success:true,result:{response:report,usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}}});
}
function sceneCheckpoint(sceneId=sampleProject.scenes[0].id) {
  return {
    report:{summary:"Synthetic scene checkpoint",...goodReview().scenes.find(scene=>scene.sceneId===sceneId)!},
    inference:{sceneId,provider:"cloudflare",model:"test-model",usage:{input_tokens:100,output_tokens:20,total_tokens:120}},
  };
}

describe("durable review checkpoints",()=>{
  it("retries only the failed scene in the actual workflow after both vision providers fail transiently",async()=>{
    const {t,jobId}=await setup(),failedScene=sampleProject.scenes[1].id;
    const calls:{sceneId:string;provider:string;at:number}[]=[];
    let failures=0;
    const transport=vi.fn<typeof fetch>().mockImplementation(async(url,request)=>{
      const sceneId=scope(request),provider=String(url).includes("cloudflare")?"cloudflare":"nvidia";
      calls.push({sceneId,provider,at:Date.now()});
      if(sceneId===failedScene&&failures<2){failures++;return new Response("transient test failure",{status:provider==="cloudflare"?429:503});}
      return response(sceneId);
    });
    vi.stubGlobal("fetch",transport);
    await t.finishAllScheduledFunctions(()=>vi.runOnlyPendingTimers());
    expect(calls.filter(call=>call.sceneId==="facts")).toHaveLength(1);
    for(const scene of sampleProject.scenes.filter(scene=>scene.id!==failedScene))expect(calls.filter(call=>call.sceneId===scene.id)).toHaveLength(1);
    const retried=calls.filter(call=>call.sceneId===failedScene);
    expect(retried.map(call=>call.provider)).toEqual(["cloudflare","nvidia","cloudflare"]);
    expect(retried[2].at-retried[1].at).toBeGreaterThanOrEqual(30_000);
    expect((await t.run(ctx=>ctx.db.get(jobId)))?.status).toBe("completed");
    const checkpoints=await t.run(ctx=>ctx.db.query("reviewCheckpoints").collect());
    expect(checkpoints.filter(row=>row.kind==="evidence")).toHaveLength(1);
    expect(checkpoints.filter(row=>row.kind==="facts")).toHaveLength(1);
    expect(checkpoints.filter(row=>row.kind==="scene").map(row=>row.sceneId).sort()).toEqual(sampleProject.scenes.map(scene=>scene.id).sort());
    const evidence=checkpoints.find(row=>row.kind==="evidence")!;
    expect(checkpoints.filter(row=>row.kind!=="evidence").every(row=>row.evidenceId===evidence._id)).toBe(true);
  });

  it("cannot assemble a lesson with missing factual or scene checkpoints",async()=>{
    const {t,jobId}=await setup(),args={jobId,revision:1};
    const transport=vi.fn<typeof fetch>().mockImplementation(async(_,request)=>response(scope(request)));
    vi.stubGlobal("fetch",transport);
    await t.action(internal.reviewActions.prepare,args);
    await expect(t.mutation(internal.reviews.assemble,args)).rejects.toThrow(/missing|incomplete|checkpoint/i);
    await t.action(internal.reviewActions.checkFacts,args);
    await t.action(internal.reviewActions.checkScene,{...args,sceneId:sampleProject.scenes[0].id});
    await expect(t.mutation(internal.reviews.assemble,args)).rejects.toThrow(/missing|incomplete|checkpoint/i);
    expect((await t.run(ctx=>ctx.db.get(jobId)))?.status).toBe("reviewing");
    expect((await t.query(api.media.result,{token:owner,jobId}))?.approved).toBe(false);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("rejects foreign evidence and wrong scene payloads, and discards stale revision results",async()=>{
    const {t,jobId}=await setup(),args={jobId,revision:1};
    await t.action(internal.reviewActions.prepare,args);
    const evidence=(await t.run(ctx=>ctx.db.query("reviewCheckpoints").collect())).find(row=>row.kind==="evidence")!;
    const otherJob=await t.mutation(api.jobs.create,{token:owner,topic:"A different lesson",duration:60,audience:"beginner",requestId:"foreign-evidence-request"});
    const foreignEvidence=await t.run(async ctx=>{
      const {_id,_creationTime,...data}=evidence;void _id;void _creationTime;
      return ctx.db.insert("reviewCheckpoints",{...data,jobId:otherJob});
    });
    const payload={...args,kind:"scene" as const,sceneId:sampleProject.scenes[0].id,evidenceId:evidence._id,json:JSON.stringify(sceneCheckpoint())};
    await expect(t.mutation(internal.reviews.saveCheckpoint,{...payload,evidenceId:foreignEvidence})).rejects.toThrow(/evidence|scope|foreign/i);
    await expect(t.mutation(internal.reviews.saveCheckpoint,{...payload,sceneId:"foreign-scene"})).rejects.toThrow(/scene|scope/i);
    await expect(t.mutation(internal.reviews.saveCheckpoint,{...payload,json:JSON.stringify(sceneCheckpoint(sampleProject.scenes[1].id))})).rejects.toThrow(/scene|scope/i);
    await t.run(ctx=>ctx.db.patch(jobId,{revision:2}));
    expect(await t.mutation(internal.reviews.saveCheckpoint,payload)).toBe(false);
    expect((await t.run(ctx=>ctx.db.query("reviewCheckpoints").collect())).filter(row=>row.jobId===jobId&&row.kind==="scene")).toHaveLength(0);
  });

  it("stops paid work after cancellation and cannot save an in-flight verdict",async()=>{
    const {t,jobId}=await setup(),args={jobId,revision:1};
    const transport=vi.fn<typeof fetch>().mockImplementation(async(_,request)=>response(scope(request)));
    vi.stubGlobal("fetch",transport);
    await t.action(internal.reviewActions.prepare,args);
    await t.action(internal.reviewActions.checkFacts,args);
    const evidence=(await t.run(ctx=>ctx.db.query("reviewCheckpoints").collect())).find(row=>row.kind==="evidence")!;
    await t.mutation(api.jobs.cancel,{token:owner,jobId});
    transport.mockClear();
    await t.action(internal.reviewActions.prepare,args);
    await t.action(internal.reviewActions.checkFacts,args);
    await t.action(internal.reviewActions.checkScene,{...args,sceneId:sampleProject.scenes[0].id});
    expect(await t.mutation(internal.reviews.saveCheckpoint,{...args,kind:"scene",sceneId:sampleProject.scenes[0].id,evidenceId:evidence._id,json:JSON.stringify(sceneCheckpoint())})).toBe(false);
    await t.finishAllScheduledFunctions(()=>vi.runOnlyPendingTimers());
    expect(transport).not.toHaveBeenCalled();
    expect((await t.run(ctx=>ctx.db.get(jobId)))?.status).toBe("cancelled");
  });

  it("resumes a partial compatibility inspection through the durable workflow without re-reviewing saved gates",async()=>{
    const {t,jobId}=await setup(),args={jobId,revision:1},failedScene=sampleProject.scenes[1].id;
    let unavailable=true;
    const calls:string[]=[];
    const transport=vi.fn<typeof fetch>().mockImplementation(async(_,request)=>{
      const sceneId=scope(request);calls.push(sceneId);
      if(unavailable&&sceneId===failedScene)return new Response("",{status:503});
      return response(sceneId);
    });
    vi.stubGlobal("fetch",transport);
    await expect(t.action(internal.reviewActions.inspect,args)).rejects.toThrow();
    const saved=await t.run(ctx=>ctx.db.query("reviewCheckpoints").collect());
    expect(saved.filter(row=>row.kind==="facts")).toHaveLength(1);
    expect(saved.filter(row=>row.kind==="scene").map(row=>row.sceneId)).toEqual([sampleProject.scenes[0].id]);
    unavailable=false;
    await t.finishAllScheduledFunctions(()=>vi.runOnlyPendingTimers());
    expect((await t.run(ctx=>ctx.db.get(jobId)))?.status).toBe("completed");
    expect(calls.filter(sceneId=>sceneId==="facts")).toHaveLength(1);
    expect(calls.filter(sceneId=>sceneId===sampleProject.scenes[0].id)).toHaveLength(1);
    for(const scene of sampleProject.scenes.slice(2))expect(calls.filter(sceneId=>sceneId===scene.id)).toHaveLength(1);
    const count=transport.mock.calls.length;
    await t.action(internal.reviewActions.inspect,args);
    expect(transport).toHaveBeenCalledTimes(count);
  });
});
