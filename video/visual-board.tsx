import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { TimedScene } from "../packages/contracts/scene";
import type { VisualBeat, VisualEntity, VisualKind, VisualPlan, VisualRelation, VisualTiming } from "../packages/contracts/visual";
import { renderedGlyphSize, VISUAL_CANVAS } from "../packages/contracts/visual";
import { EverydayGlyph } from "./illustrations";
import "@fontsource/kalam/700.css";

export const BOARD_PALETTE = { ink: "#171717", blue: "#91cbed", green: "#98c982", yellow: "#ffe275", orange: "#f6ac68", purple: "#b9a0d6", red: "#f28d86", gray: "#d7dadd", white: "#ffffff" } as const;
const INK = BOARD_PALETTE.ink;
const WIDTH = VISUAL_CANVAS.width, HEIGHT = VISUAL_CANVAS.height;
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const progress = (frame: number, start: number, duration: number) => clamp((frame - start) / Math.max(.000001, duration));
const ease = (value: number) => value * value * (3 - 2 * value);
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
type Point = { x: number; y: number };
type GlyphProps = { kind: VisualKind; color: string; count?: number; values?: number[]; variant?: VisualEntity["variant"]; state: number; frame: number };

/** Native SVG geometry only: no generated HTML, remote assets, or imperative animation. */
export function MechanismGlyph({ kind, color, count = 4, values = [], variant, state, frame }: GlyphProps): React.ReactNode {
  const blue = BOARD_PALETTE.blue, yellow = BOARD_PALETTE.yellow;
  if (kind === "solar-panel") {
    const point = (u: number, v: number) => ({ x: 16 + 65 * u + 10 * v, y: 18 - 5 * u + 57 * v });
    return <g><path d="M39 78 L35 91 M74 75 L80 89 M29 92 L46 92 M72 90 L86 90" fill="none" /><path d="M16 18 L81 13 L91 70 L26 75 Z" fill={color === INK ? blue : color} /><path d="M26 75 L91 70 L91 76 L27 81 Z" fill="#669ab8" />{[.25,.5,.75].map(u => { const a=point(u,0),b=point(u,1); return <path key={`v${u}`} d={`M${a.x} ${a.y} L${b.x} ${b.y}`} stroke="#ffffff" strokeWidth="1.8" />; })}{[.25,.5,.75].map(v=>{const a=point(0,v),b=point(1,v);return <path key={`h${v}`} d={`M${a.x} ${a.y} L${b.x} ${b.y}`} stroke="#ffffff" strokeWidth="1.8" />;})}<path d="M16 18 L81 13 L91 70 L26 75 Z" fill="none" /></g>;
  }
  if (kind === "photon") return <g fill="none"><path d="M7 53 Q16 24 25 53 T43 53 T61 53 T79 53 L94 53" stroke={color === INK ? "#e8a624" : color} strokeWidth="6" /><path d="M7 53 Q16 24 25 53 T43 53 T61 53 T79 53 L94 53" strokeWidth="1.8" /><path d="M86 44 L96 53 L86 62" /><path d="M23 13 L28 21 M45 7 L45 17 M66 13 L62 21" strokeWidth="2" /></g>;
  if (kind === "electron") return <g><circle cx="50" cy="50" r="30" fill={color === INK ? blue : color} /><path d="M36 50 L64 50" strokeWidth="5" /><path d="M30 29 Q39 20 52 22" fill="none" stroke="#ffffff" strokeWidth="4" /></g>;
  if (kind === "atom") return <g><ellipse cx="50" cy="50" rx="43" ry="17" fill="none" strokeWidth="1.8" /><ellipse cx="50" cy="50" rx="43" ry="17" transform="rotate(60 50 50)" fill="none" strokeWidth="1.8" /><ellipse cx="50" cy="50" rx="43" ry="17" transform="rotate(120 50 50)" fill="none" strokeWidth="1.8" /><circle cx="44" cy="47" r="9" fill={color === INK ? BOARD_PALETTE.red : color} /><circle cx="56" cy="47" r="9" fill={yellow} /><circle cx="50" cy="58" r="9" fill={BOARD_PALETTE.orange} />{Array.from({length:count},(_,i)=>{const angle=i*Math.PI*2/count,orbit=(i%3)*Math.PI/3,x=43*Math.cos(angle),y=17*Math.sin(angle);return <circle key={i} cx={50+x*Math.cos(orbit)-y*Math.sin(orbit)} cy={50+x*Math.sin(orbit)+y*Math.cos(orbit)} r={count>8?3.7:5} fill={blue} />;})}</g>;
  if (kind === "molecule") {
    const n=Math.max(1,count);
    const points = n===2 ? [{x:28,y:50},{x:72,y:50}] : Array.from({length:n},(_,i)=>({x:50+32*Math.cos(-Math.PI/2+i*Math.PI*2/n),y:50+32*Math.sin(-Math.PI/2+i*Math.PI*2/n)}));
    return <g>{points.slice(1).map((p,i)=><path key={i} d={`M${points[i].x} ${points[i].y} L${p.x} ${p.y}`} strokeWidth="5" />)}{points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={n>8?6:n>5?10:15} fill={i%2 ? blue : color===INK?BOARD_PALETTE.red:color} />)}</g>;
  }
  if (kind === "lattice") {
    const n=Math.max(2,Math.min(4,Math.ceil(Math.sqrt(count))));
    const points=Array.from({length:count},(_,i)=>({x:15+(i%n)*70/(n-1),y:15+Math.floor(i/n)*70/(n-1)}));
    return <g>{points.map((p,i)=><g key={i}>{i%n<n-1&&i+1<points.length?<path d={`M${p.x} ${p.y} L${points[i+1].x} ${p.y}`} stroke="#898989" strokeWidth="2" />:null}{i+n<points.length?<path d={`M${p.x} ${p.y} L${p.x} ${points[i+n].y}`} stroke="#898989" strokeWidth="2" />:null}</g>)}{points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="8" fill={color===INK?BOARD_PALETTE.purple:color} />)}{variant==="positive"?<g opacity={state}><circle cx={29+state*22} cy="32" r="4" fill={blue} /><circle cx={48+state*20} cy="67" r="4" fill={blue} /></g>:null}</g>;
  }
  if (kind === "beaker") return <g><path d="M25 9 L75 9 M29 10 L29 35 L16 83 Q13 91 22 92 L78 92 Q87 91 84 83 L71 35 L71 10" fill="white" />{state>0?<path d={`M${22+(1-state)*8} ${82-state*32} Q50 ${88-state*32} ${78-(1-state)*8} ${82-state*32} L81 85 Q81 88 76 88 L24 88 Q19 88 19 85 Z`} fill={color===INK?blue:color} stroke="none" opacity={clamp(state*8)} />:null}<path d="M57 45 L66 45 M56 58 L70 58 M57 72 L72 72" fill="none" strokeWidth="2" /><path d="M25 9 L75 9 M29 10 L29 35 L16 83 Q13 91 22 92 L78 92 Q87 91 84 83 L71 35 L71 10" fill="none" /></g>;
  if (kind === "heat") return <g fill="none" opacity={state}>{[24,50,76].map(x=><g key={x}><path d={`M${x} 88 Q${x-12} 70 ${x} 53 Q${x+12} 36 ${x} 17`} stroke={color===INK?BOARD_PALETTE.red:color} strokeWidth="5" /><path d={`M${x-7} 25 L${x} 15 L${x+7} 24`} strokeWidth="2" /></g>)}</g>;
  if (kind === "wave") {
    const points=Array.from({length:65},(_,i)=>`${i===0?"M":"L"}${5+i*90/64} ${50+Math.sin(i/64*Math.PI*4)*24*(.35+.65*state)}`).join(" ");
    return <g transform={variant==="vertical"?"rotate(90 50 50)":undefined}><path d="M4 50 L97 50" stroke="#b6b6b6" strokeWidth="1.5" /><path d={points} stroke={color===INK?blue:color} strokeWidth="5" fill="none" /><path d={points} strokeWidth="1.4" fill="none" /></g>;
  }
  if (kind === "bars") {
    const data=values.length?values:[1,2,3], maximum=Math.max(...data,1), width=72/data.length;
    return <g><path d="M13 8 L13 83 L94 83" fill="none" />{data.map((value,i)=>{const height=55*value/maximum*state;return <g key={i}><rect x={18+i*width} y={81-height} width={width*.7} height={Math.max(.5,height)} rx="1" fill={color===INK?blue:color} /><text x={18+i*width+width*.35} y={75-height} textAnchor="middle" fontSize={data.length>5?8:10} fill={INK} stroke="none">{value>=1000?`${Math.round(value/100)/10}k`:value}</text></g>;})}</g>;
  }
  if (kind === "pie") {
    const data=values.length?values:[1,1,1],total=data.reduce((a,b)=>a+b,0)||1;
    const colors=[color===INK?blue:color,BOARD_PALETTE.yellow,BOARD_PALETTE.green,BOARD_PALETTE.purple,BOARD_PALETTE.orange,BOARD_PALETTE.red,BOARD_PALETTE.gray];
    return <g><circle cx="50" cy="50" r="39" fill="#ffffff" />{data.map((value,i)=>{const start=-Math.PI/2+data.slice(0,i).reduce((sum,v)=>sum+v,0)/total*Math.PI*2*state,end=start+value/total*Math.PI*2*state;if(end-start>=Math.PI*2-.001)return <circle key={i} cx="50" cy="50" r="39" fill={colors[i%colors.length]} />;const a={x:50+39*Math.cos(start),y:50+39*Math.sin(start)},b={x:50+39*Math.cos(end),y:50+39*Math.sin(end)};return <path key={i} d={`M50 50 L${a.x} ${a.y} A39 39 0 ${end-start>Math.PI?1:0} 1 ${b.x} ${b.y} Z`} fill={colors[i%colors.length]} />;})}</g>;
  }
  if (kind === "grid") {
    const n=Math.max(2,Math.min(4,Math.ceil(Math.sqrt(count))));const size=76/n;
    return <g>{Array.from({length:count},(_,i)=><rect key={i} x={12+(i%n)*size} y={12+Math.floor(i/n)*size} width={size-3} height={size-3} rx="2" fill={i<count*state?(color===INK?blue:color):"#ffffff"} />)}</g>;
  }
  if (kind === "layers") return <g>{Array.from({length:count},(_,i)=>{const y=count===1?50:73-i*43/(count-1);return <path key={i} d={`M10 ${y} L50 ${y-21} L91 ${y-1} L51 ${y+22} Z`} fill={i%2?"#ffffff":color===INK?blue:color} />;})}</g>;
  if (kind === "circle") return <g><circle cx="50" cy="50" r="38" fill={color} />{variant==="positive"||variant==="negative"?<path d={`M34 50 L66 50${variant==="positive"?" M50 34 L50 66":""}`} strokeWidth="4" fill="none" />:null}</g>;
  if (kind === "box") return <rect x="9" y="14" width="82" height="72" rx="5" fill={color} />;
  if (kind === "label") return null;
  return <EverydayGlyph kind={kind} color={color} count={count} values={values} variant={variant} state={state} frame={frame} />;
}

export type EntityFrameState = { entity: VisualEntity; x: number; y: number; rotation: number; scale: number; state: number; draw: number; opacity: number; emphasis: number; focus: number };
type TimedBeat = VisualBeat & { start: number; frames: number };
function timedBeats(plan: VisualPlan, timing: VisualTiming | undefined, durationInFrames: number): TimedBeat[] {
  return plan.beats.map(beat=>({ ...beat,start:timing?.beats[beat.id]?.start ?? Math.round(beat.at*durationInFrames),frames:timing?.beats[beat.id]?.duration ?? Math.max(6,Math.round(beat.duration*durationInFrames)) })).sort((a,b)=>a.start-b.start || a.id.localeCompare(b.id));
}

/** Evaluate from scratch at every requested frame; seeking never depends on playback history. */
export function evaluateVisualFrame(plan: VisualPlan, timing: VisualTiming | undefined, durationInFrames: number, frame: number): EntityFrameState[] {
  const beats=timedBeats(plan,timing,durationInFrames);
  const own=new Map<string,EntityFrameState>();
  for(const entity of plan.entities){
    const relevant=beats.filter(beat=>beat.target===entity.id),firstTransform=relevant.find(beat=>beat.action==="transform");
    const enter=timing?.entities[entity.id] ?? entity.enter*durationInFrames;
    const firstVisibility=relevant.find(beat=>beat.action==="draw"||beat.action==="hide");
    const start=firstVisibility?.action==="draw"?Math.max(enter,firstVisibility.start):enter;
    const state:EntityFrameState={entity,x:entity.x*WIDTH/100,y:entity.y*HEIGHT/100,rotation:0,scale:1,state:firstTransform ? (firstTransform.value===0?1:0) : ["closed","negative"].includes(entity.variant||"")?0:1,draw:progress(frame,start,28),opacity:progress(frame,start,5),emphasis:0,focus:0};
    for(const beat of relevant){
      if(frame<beat.start)continue;
      const p=progress(frame,beat.start,beat.frames),t=ease(p),active=p<1;
      if(beat.action==="move"){state.x=mix(state.x,(beat.x??entity.x)*WIDTH/100,t);state.y=mix(state.y,(beat.y??entity.y)*HEIGHT/100,t);}
      if(beat.action==="rotate")state.rotation+=(beat.value??0)*t;
      if(beat.action==="transform")state.state=mix(state.state,beat.value??1,t);
      if(beat.action==="hide")state.opacity*=1-t;
      if(beat.action==="draw"){state.opacity=progress(frame,beat.start,5);state.draw=p;}
      if(beat.action==="pulse"&&active)state.scale*=1+.08*Math.sin(p*Math.PI*2)**2;
      if(beat.action==="highlight"&&active)state.emphasis=Math.max(state.emphasis,Math.sin(p*Math.PI));
      if(beat.action==="focus"&&active)state.focus=Math.max(state.focus,Math.sin(p*Math.PI));
    }
    own.set(entity.id,state);
  }
  const resolved=new Map<string,EntityFrameState>();
  const resolve=(id:string):EntityFrameState=>{
    const found=resolved.get(id);if(found)return found;
    const state={...own.get(id)!},parentId=state.entity.parentId;
    if(parentId&&own.has(parentId)){
      const parent=resolve(parentId),angle=parent.rotation*Math.PI/180;
      const dx=state.x-parent.entity.x*WIDTH/100,dy=state.y-parent.entity.y*HEIGHT/100;
      state.x=parent.x+(dx*Math.cos(angle)-dy*Math.sin(angle))*parent.scale;
      state.y=parent.y+(dx*Math.sin(angle)+dy*Math.cos(angle))*parent.scale;
      state.rotation+=parent.rotation;state.scale*=parent.scale;state.opacity*=parent.opacity;
    }
    resolved.set(id,state);return state;
  };
  return plan.entities.map(entity=>resolve(entity.id));
}

function wrapLabel(text:string,maxCharacters:number){
  const lines:string[]=[];let current="";
  for(const word of text.toUpperCase().split(/\s+/)){if(current&&`${current} ${word}`.length>maxCharacters){lines.push(current);current=word;}else current=current?`${current} ${word}`:word;}
  if(current)lines.push(current);
  return lines;
}
function Label({text,x,y,width,fontSize=26,color=INK,center=false}:{text:string;x:number;y:number;width:number;fontSize?:number;color?:string;center?:boolean}){
  const maxWord=Math.max(...text.split(/\s+/).map(word=>word.length),1);
  const size=Math.min(fontSize,width/(maxWord*.56));
  const lines=wrapLabel(text,Math.max(5,Math.floor(width/(size*.52))));
  const top=clamp(center?y-(lines.length-1)*size*.58:y,25,HEIGHT-25-(lines.length-1)*size*1.17);
  return <text x={x} y={top} textAnchor="middle" fontFamily="Kalam, cursive" fontWeight="700" fontSize={size} fill={color} stroke="#ffffff" strokeWidth="7" strokeLinejoin="round" paintOrder="stroke" dominantBaseline="central">{lines.map((line,i)=><tspan key={i} x={x} dy={i===0?0:size*1.17}>{line}</tspan>)}</text>;
}
function quadratic(a:Point,c:Point,b:Point,t:number):Point{return{x:(1-t)**2*a.x+2*(1-t)*t*c.x+t*t*b.x,y:(1-t)**2*a.y+2*(1-t)*t*c.y+t*t*b.y};}
function tangent(a:Point,c:Point,b:Point,t:number){return Math.atan2(2*(1-t)*(c.y-a.y)+2*t*(b.y-c.y),2*(1-t)*(c.x-a.x)+2*t*(b.x-c.x))*180/Math.PI;}
function boxRadius(state:EntityFrameState){
  const angle=state.rotation*Math.PI/180,size=renderedGlyphSize(state.entity);
  const glyphWidth=size.width*state.scale,glyphHeight=size.height*state.scale;
  return{x:(Math.abs(glyphWidth*Math.cos(angle))+Math.abs(glyphHeight*Math.sin(angle)))/2,y:(Math.abs(glyphWidth*Math.sin(angle))+Math.abs(glyphHeight*Math.cos(angle)))/2};
}
function boundary(state:EntityFrameState,toward:Point){
  const dx=toward.x-state.x,dy=toward.y-state.y,radius=boxRadius(state);
  const ry=radius.y+(dy>0&&state.entity.label&&state.entity.kind!=="label"?28:0);
  const ratio=1/Math.max(Math.abs(dx)/(radius.x+13),Math.abs(dy)/(ry+13),.001);
  return{x:state.x+dx*ratio,y:state.y+dy*ratio};
}
export function relationGeometry(relation:VisualRelation,from:EntityFrameState,to:EntityFrameState){
  const dx=to.x-from.x,dy=to.y-from.y,distance=Math.hypot(dx,dy)||1;
  const bend=relation.curve*distance*.42;
  const control={x:clamp((from.x+to.x)/2-dy/distance*bend,35,WIDTH-35),y:clamp((from.y+to.y)/2+dx/distance*bend,35,HEIGHT-35)};
  const start=boundary(from,Math.abs(relation.curve)>.05?control:to),end=boundary(to,Math.abs(relation.curve)>.05?control:from);
  return{start,end,control,path:`M${start.x} ${start.y} Q${control.x} ${control.y} ${end.x} ${end.y}`};
}

function Relation({relation,from,to,frame,durationInFrames,timing,beats}:{relation:VisualRelation;from:EntityFrameState;to:EntityFrameState;frame:number;durationInFrames:number;timing?:VisualTiming;beats:TimedBeat[]}){
  const relevant=beats.filter(beat=>beat.target===relation.id);
  const enter=timing?.relations[relation.id]??Math.max(relation.enter*durationInFrames,(timing?.entities[relation.from]??from.entity.enter*durationInFrames)+22,(timing?.entities[relation.to]??to.entity.enter*durationInFrames)+22);
  const firstVisibility=relevant.find(beat=>beat.action==="draw"||beat.action==="hide");
  const start=firstVisibility?.action==="draw"?Math.max(enter,firstVisibility.start):enter;
  let draw=progress(frame,start,24),opacity=Math.min(from.opacity,to.opacity),emphasis=0;
  for(const beat of relevant){if(frame<beat.start)continue;const p=progress(frame,beat.start,beat.frames);if(beat.action==="hide")opacity*=1-ease(p);if(beat.action==="draw"){draw=p;opacity=Math.min(from.opacity,to.opacity)*progress(frame,beat.start,5);}if(["highlight","pulse","focus"].includes(beat.action)&&p<1)emphasis=Math.max(emphasis,Math.sin(p*Math.PI));}
  if(draw<=0||opacity<=0)return null;
  const geometry=relationGeometry(relation,from,to),color=BOARD_PALETTE[relation.color];
  const arrow=relation.type==="arrow"||relation.type==="flow";
  const middle=quadratic(geometry.start,geometry.control,geometry.end,.5);
  const angle=tangent(geometry.start,geometry.control,geometry.end,1);
  const flowBeats=relevant.filter(beat=>beat.action==="flow");
  const flow=flowBeats.find(beat=>frame>=beat.start&&frame<beat.start+beat.frames);
  const automatic=relation.type==="flow"&&!flowBeats.length&&frame>start+24;
  const flowStart=flow?.start??start+24,flowFrames=flow?.frames??Math.max(48,durationInFrames-start-24);
  const isPhoton=relation.particle==="photon";
  const isElectron=relation.particle==="electron";
  return <g opacity={opacity}>
    {emphasis>0?<path d={geometry.path} fill="none" stroke={color===INK?BOARD_PALETTE.yellow:color} strokeWidth={10+emphasis*5} opacity={emphasis*.35} />:null}
    <path d={geometry.path} pathLength="1" strokeDasharray="1" strokeDashoffset={1-draw} fill="none" stroke={color} strokeWidth={relation.type==="line"?2.8:3.6} strokeLinecap="round" />
    {arrow&&draw>.93?<g transform={`translate(${geometry.end.x} ${geometry.end.y}) rotate(${angle})`} opacity={clamp((draw-.93)/.07)}><path d="M-14 -7 L0 0 L-14 7" fill="none" stroke={color} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /></g>:null}
    {relation.type==="brace"?<><path d={`M${geometry.start.x-5} ${geometry.start.y-7} L${geometry.start.x} ${geometry.start.y} L${geometry.start.x+5} ${geometry.start.y-7}`} fill="none" stroke={color} strokeWidth="3" /><path d={`M${geometry.end.x-5} ${geometry.end.y-7} L${geometry.end.x} ${geometry.end.y} L${geometry.end.x+5} ${geometry.end.y-7}`} fill="none" stroke={color} strokeWidth="3" /></>:null}
    {(flow||automatic)&&draw>.8?Array.from({length:3},(_,i)=>{const t=((frame-flowStart)/Math.max(36,flowFrames*.55)+i/3)%1,p=quadratic(geometry.start,geometry.control,geometry.end,t);return <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${isPhoton?tangent(geometry.start,geometry.control,geometry.end,t):0})`} opacity={Math.min(1,t*10,(1-t)*10)}>{isPhoton?<path d="M-12 0 L-7 -5 L-2 5 L3 -5 L8 5 L13 0" fill="none" stroke="#eab627" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />:<><circle r="6.5" fill={isElectron?BOARD_PALETTE.blue:color} stroke={INK} strokeWidth="1.5" />{isElectron?<path d="M-3 0 L3 0" stroke={INK} strokeWidth="1.4" />:null}</>}</g>;}):null}
    {relation.label?<g opacity={progress(frame,start+14,12)}><Label text={relation.label} x={clamp(middle.x,120,WIDTH-120)} y={clamp(middle.y+(relation.curve>.1?24:-24),35,HEIGHT-35)} width={Math.max(160,Math.min(300,Math.hypot(geometry.end.x-geometry.start.x,geometry.end.y-geometry.start.y)*.75))} fontSize={24} /></g>:null}
  </g>;
}

function Entity({state,sceneId,frame,dim}:{state:EntityFrameState;sceneId:string;frame:number;dim:number}){
  const {entity}=state,width=entity.w*WIDTH/100,height=entity.h*HEIGHT/100,color=BOARD_PALETTE[entity.color];
  const identifier=`visual-${sceneId}-${entity.id}`;
  const fill=progress(state.draw, .58, .42);
  const radius=boxRadius(state);
  return <g opacity={state.opacity*dim}>
    {state.emphasis>0||state.focus>0?<ellipse cx={state.x} cy={state.y} rx={radius.x+17} ry={radius.y+13} fill="none" stroke={color===INK?BOARD_PALETTE.yellow:color} strokeWidth="10" opacity={Math.max(state.emphasis,state.focus)*.55} />:null}
    {entity.kind==="label"?<g opacity={state.draw}><Label text={entity.label} x={state.x} y={state.y} width={width} fontSize={Math.min(40,height*.65)} color={color} center /></g>:<>
      <g transform={`translate(${state.x} ${state.y}) rotate(${state.rotation}) scale(${state.scale}) translate(${-width/2} ${-height/2})`}>
        <style>{`.${identifier}-trace *{fill:none!important;stroke:${INK}!important;stroke-dasharray:1!important;stroke-dashoffset:${1-state.draw}!important;stroke-width:2.4!important}.${identifier}-trace text{fill:${INK}!important;stroke:none!important}`}</style>
        <svg width={width} height={height} viewBox="0 0 100 100" overflow="visible" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fontFamily="Kalam, cursive" fontWeight="700">
          <g opacity={fill}><NormalizedPaths><MechanismGlyph kind={entity.kind} color={color} count={entity.count} values={entity.values} variant={entity.variant} state={state.state} frame={frame} /></NormalizedPaths></g>
          {state.draw<1?<g className={`${identifier}-trace`} opacity={state.draw>0?1:0}><NormalizedPaths><MechanismGlyph kind={entity.kind} color={color} count={entity.count} values={entity.values} variant={entity.variant} state={state.state} frame={frame} /></NormalizedPaths></g>:null}
        </svg>
      </g>
      {entity.label?<g opacity={progress(state.draw,.7,.3)}><Label text={entity.label} x={clamp(state.x,90,WIDTH-90)} y={Math.min(HEIGHT-38,state.y+radius.y+21)} width={Math.min(300,Math.max(155,width+35))} fontSize={27} /></g>:null}
    </>}
    {state.focus>.1?<g transform={`translate(${state.x+radius.x+22} ${state.y-radius.y-12}) rotate(145)`} opacity={state.focus}><path d="M0 0 L27 0 M19 -7 L27 0 L19 7" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>:null}
  </g>;
}

/** Normalize path tracing and canvas stroke weight without mutable DOM measurements. */
function NormalizedPaths({children}:{children:React.ReactNode}):React.ReactNode{
  return React.Children.map(children,child=>{
    if(!React.isValidElement<{children?:React.ReactNode;pathLength?:number;vectorEffect?:string}>(child))return child;
    if(typeof child.type==="function"){
      const component=child.type as (props:unknown)=>React.ReactNode;
      return <NormalizedPaths>{component(child.props)}</NormalizedPaths>;
    }
    const isGeometry=typeof child.type==="string"&&["path","circle","ellipse","line","polyline","polygon","rect"].includes(child.type);
    return React.cloneElement(child,{...(isGeometry?{pathLength:1,vectorEffect:"non-scaling-stroke"}:{}),...(child.props.children?{children:<NormalizedPaths>{child.props.children}</NormalizedPaths>}: {})});
  });
}

/** Pure entry point for deterministic still verification and arbitrary frame seeking. */
export function VisualBoardFrame({plan,timing,durationInFrames,frame,sceneId="board"}:{plan:VisualPlan;timing?:VisualTiming;durationInFrames:number;frame:number;sceneId?:string}){
  const states=evaluateVisualFrame(plan,timing,durationInFrames,frame),byId=new Map(states.map(state=>[state.entity.id,state]));
  const beats=timedBeats(plan,timing,durationInFrames);
  const focus=Math.max(0,...states.map(state=>state.focus));
  return <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="100%" style={{display:"block",background:"#ffffff",fontFamily:"Kalam, cursive"}} aria-label={plan.objective}>
    <rect width={WIDTH} height={HEIGHT} fill="#ffffff" />
    {plan.relations.map(relation=>{const from=byId.get(relation.from),to=byId.get(relation.to);return from&&to?<Relation key={relation.id} relation={relation} from={from} to={to} frame={frame} durationInFrames={durationInFrames} timing={timing} beats={beats} />:null;})}
    {states.map(state=><Entity key={state.entity.id} state={state} sceneId={sceneId} frame={frame} dim={state.focus>0?1:1-focus*.28} />)}
  </svg>;
}

export function VisualBoard({scene}:{scene:TimedScene}){
  const frame=useCurrentFrame();
  if(!scene.visualPlan)return null;
  return <AbsoluteFill><VisualBoardFrame plan={scene.visualPlan} timing={scene.visualTiming} durationInFrames={scene.durationInFrames} frame={frame} sceneId={scene.id} /></AbsoluteFill>;
}
