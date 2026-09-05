import { renderedGlyphSize, validateVisualPlan, VISUAL_CANVAS, type VisualEntity, type VisualPlan } from "../../packages/contracts/visual";

export type LayoutAdjustment = {
  original: VisualPlan;
  transform: { scale: number; translateXPixels: number; translateYPixels: number };
  reason: "readability";
};
const W=VISUAL_CANVAS.width,H=VISUAL_CANVAS.height;
const particles=new Set(["photon","electron","token"]);
const primary=(plan:VisualPlan)=>plan.entities.filter(entity=>!entity.parentId&&!particles.has(entity.kind)&&entity.kind!=="label");

/** Smallest uniform enlargement satisfying either accepted composition grammar. */
export function requiredCompositionScale(plan:VisualPlan):number {
  const sizes=primary(plan).map(entity=>({entity,size:renderedGlyphSize(entity)}));
  let required=Math.min(...sizes.map(({size})=>Math.max(W*28/100/size.width,H*40/100/size.height)));
  // A small contextual object need not set the scale of a readable branch.
  // Consider the bounded set of possible participating size thresholds.
  for(const threshold of sizes.map(({size})=>Math.min(size.width,size.height))) {
    const eligible=sizes.filter(({size})=>Math.min(size.width,size.height)>=threshold);
    const ids=new Set(eligible.map(({entity})=>entity.id));
    const links=plan.relations.filter(relation=>ids.has(relation.from)&&ids.has(relation.to));
    const linkedIds=new Set(links.flatMap(relation=>[relation.from,relation.to]));
    const linked=eligible.filter(({entity})=>linkedIds.has(entity.id));
    if(linked.length<3||links.length<2)continue;
    const spanX=Math.max(...linked.map(({entity,size})=>entity.x*W/100+size.width/2))-Math.min(...linked.map(({entity,size})=>entity.x*W/100-size.width/2));
    const spanY=Math.max(...linked.map(({entity,size})=>entity.y*H/100+size.height/2))-Math.min(...linked.map(({entity,size})=>entity.y*H/100-size.height/2));
    required=Math.min(required,Math.max(180/Math.min(...linked.map(({size})=>Math.min(size.width,size.height))),W*.55/spanX,H*.5/spanY));
  }
  return Math.max(1,required);
}

type Range={minX:number;maxX:number;minY:number;maxY:number};
type Motion={center:Range;scale:number;rotates:boolean};
function union(ranges:Range[]):Range {
  return {minX:Math.min(...ranges.map(r=>r.minX)),maxX:Math.max(...ranges.map(r=>r.maxX)),minY:Math.min(...ranges.map(r=>r.minY)),maxY:Math.max(...ranges.map(r=>r.maxY))};
}

/** Conservative full motion envelope: all move destinations, inherited parent
 * motion, complete rotation sweeps and the maximum of overlapping pulses.
 * Reserved viewports preserve existing schema guards. Labels retain their
 * fixed screen typography, with space for the maximum four short wrapped lines.
 */
function motionBounds(plan:VisualPlan):Range {
  const entities=new Map(plan.entities.map(entity=>[entity.id,entity])),memo=new Map<string,Motion>();
  const resolve=(entity:VisualEntity):Motion=>{
    const cached=memo.get(entity.id);if(cached)return cached;
    const own=[{x:entity.x,y:entity.y},...plan.beats.filter(beat=>beat.target===entity.id&&beat.action==="move").map(beat=>({x:beat.x!,y:beat.y!}))];
    let center={minX:Math.min(...own.map(p=>p.x*W/100)),maxX:Math.max(...own.map(p=>p.x*W/100)),minY:Math.min(...own.map(p=>p.y*H/100)),maxY:Math.max(...own.map(p=>p.y*H/100))};
    let scale=1.08**plan.beats.filter(beat=>beat.target===entity.id&&beat.action==="pulse").length;
    let rotates=plan.beats.some(beat=>beat.target===entity.id&&beat.action==="rotate"&&beat.value!==0);
    if(entity.parentId) {
      const parent=entities.get(entity.parentId)!,state=resolve(parent);
      const dx=[center.minX-parent.x*W/100,center.maxX-parent.x*W/100],dy=[center.minY-parent.y*H/100,center.maxY-parent.y*H/100];
      if(state.rotates) {
        const radius=Math.hypot(Math.max(...dx.map(Math.abs)),Math.max(...dy.map(Math.abs)))*state.scale;
        center={minX:state.center.minX-radius,maxX:state.center.maxX+radius,minY:state.center.minY-radius,maxY:state.center.maxY+radius};
      } else {
        const xx=dx.flatMap(value=>[value,value*state.scale]),yy=dy.flatMap(value=>[value,value*state.scale]);
        center={minX:state.center.minX+Math.min(...xx),maxX:state.center.maxX+Math.max(...xx),minY:state.center.minY+Math.min(...yy),maxY:state.center.maxY+Math.max(...yy)};
      }
      scale*=state.scale;rotates||=state.rotates;
    }
    const state={center,scale,rotates};memo.set(entity.id,state);return state;
  };
  return union(plan.entities.map(entity=>{
    const state=resolve(entity),w=entity.w*W/100*state.scale,h=entity.h*H/100*state.scale;
    const rx=state.rotates?Math.hypot(w,h)/2:w/2,ry=state.rotates?Math.hypot(w,h)/2:h/2;
    const hasLabel=Boolean(entity.label),labelX=hasLabel?150:0,labelBelow=hasLabel?130:0;
    return {minX:state.center.minX-Math.max(rx,labelX)-3,maxX:state.center.maxX+Math.max(rx,labelX)+3,minY:state.center.minY-ry-3,maxY:state.center.maxY+ry+labelBelow+3};
  }));
}

/** Fit incoming candidates only. Saved plans are validated, never reframed. */
export function fitDirectedLayout(plan:VisualPlan,narration:string,validate:(plan:VisualPlan)=>VisualPlan):{plan:VisualPlan;layoutAdjustment?:LayoutAdjustment} {
  const original=validateVisualPlan(plan,narration),scale=requiredCompositionScale(original);
  if(scale<=1+1e-9)return {plan:validate(original)};
  const largest=primary(original).map(entity=>({id:entity.id,pixels:renderedGlyphSize(entity).width})).sort((a,b)=>b.pixels-a.pixels)[0];
  const description=`Largest primary '${largest?.id??"none"}' is ${largest?.pixels.toFixed(1)??0}px; required uniform scale is ${Number.isFinite(scale)?scale.toFixed(3):"unavailable"}.`;
  if(!Number.isFinite(scale))throw new Error(`Uniform composition fit needs a semantic primary illustration. ${description}`);
  const oversized=original.entities.find(entity=>entity.w*scale>70+1e-9||entity.h*scale>75+1e-9);
  if(oversized)throw new Error(`Uniform composition fit exceeds the w<=70/h<=75 viewport limit at '${oversized.id}'. ${description} Recompose the authored layout; individual objects will not be resized independently.`);
  const scaled:VisualPlan={...original,entities:original.entities.map(entity=>({...entity,x:entity.x*scale,y:entity.y*scale,w:entity.w*scale,h:entity.h*scale})),beats:original.beats.map(beat=>beat.action==="move"?{...beat,x:beat.x!*scale,y:beat.y!*scale}:beat)};
  const bounds=motionBounds(scaled),left=W*.03,right=W*.97,top=H*.04,bottom=H*.95;
  const minX=left-bounds.minX,maxX=right-bounds.maxX,minY=top-bounds.minY,maxY=bottom-bounds.maxY;
  if(minX>maxX||minY>maxY)throw new Error(`Uniform composition fit cannot keep all motion and label bounds on canvas (${(bounds.maxX-bounds.minX).toFixed(1)}x${(bounds.maxY-bounds.minY).toFixed(1)}px versus ${(right-left).toFixed(1)}x${(bottom-top).toFixed(1)}px safe area). ${description} Reduce empty spacing or recompose the scene without changing its supported mechanism.`);
  const translateXPixels=(minX+maxX)/2,translateYPixels=(minY+maxY)/2;
  const fitted:VisualPlan={...scaled,entities:scaled.entities.map(entity=>({...entity,x:entity.x+translateXPixels/W*100,y:entity.y+translateYPixels/H*100})),beats:scaled.beats.map(beat=>beat.action==="move"?{...beat,x:beat.x!+translateXPixels/W*100,y:beat.y!+translateYPixels/H*100}:beat)};
  return {plan:validate(fitted),layoutAdjustment:{original,transform:{scale,translateXPixels,translateYPixels},reason:"readability"}};
}
