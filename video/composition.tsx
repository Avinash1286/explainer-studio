import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, cancelRender, Composition, continueRender, delayRender, interpolate, registerRoot, Sequence, staticFile, useCurrentFrame } from "remotion";
import type { RenderProject, TimedScene } from "../packages/contracts/scene";
import { VisualBoard, type AssetImages } from "./visual-board";
import "@fontsource/kalam/700.css";

export type VideoProps = { project: RenderProject; icons: Record<string, string>; assets?: AssetImages };
const NO_ASSETS: AssetImages = {};
const ink = "#171717";
const progress = (frame: number, start: number, length: number) => interpolate(frame, [start, start + length], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

function Icon({ svg, at, name }: { svg: string; at: number; name: string }) {
  const frame = useCurrentFrame();
  const draw = progress(frame, at, 24), fill = progress(frame, at + 20, 12);
  // These are pinned local OpenMoji assets, never model-supplied SVG markup.
  return <div style={{ width: 205, height: 205, position: "relative" }}>
    <style>{`.trace-${name} svg{width:100%;height:100%}.trace-${name} *{fill:none!important;stroke:${ink}!important;stroke-width:1.5!important;stroke-dasharray:320!important;stroke-dashoffset:${320 * (1 - draw)}!important}.color-${name} svg{width:100%;height:100%}`}</style>
    <div className={`trace-${name}`} style={{ position: "absolute", inset: 0, opacity: draw > 0 ? 1 : 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
    <div className={`color-${name}`} style={{ position: "absolute", inset: 0, opacity: fill }} dangerouslySetInnerHTML={{ __html: svg }} />
  </div>;
}

/** Saved v1 projects remain playable with the same narration and diagrams. */
function LegacyBoard({ scene, icons }: { scene: TimedScene; icons: Record<string, string> }) {
  const frame = useCurrentFrame();
  const positions = scene.layout === "comparison" ? [[365, 330], [915, 330]] : scene.layout === "relationship" ? [[275, 430], [640, 255], [1005, 430]] : [[245, 330], [640, 330], [1035, 330]];
  const cues = scene.cueFrames;
  const connections = scene.connections ?? (scene.layout === "comparison" ? [] : [{ from: 0, to: 1, label: "" }, { from: 1, to: 2, label: "" }]);
  return <AbsoluteFill style={{ background: "#ffffff", color: ink, fontFamily: "Kalam, cursive" }}>
    <svg viewBox="0 0 1280 720" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <defs><marker id={`arrow-${scene.id}`} markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L10 6 L1 11" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></marker></defs>
      {connections.map((edge, i) => {
        const [x,y] = positions[edge.from], [tx,ty] = positions[edge.to];
        const dx=tx-x,dy=ty-y,length=Math.hypot(dx,dy)||1;
        const bidirectional=connections.some(other=>other.from===edge.to&&other.to===edge.from);
        const offset=bidirectional?(edge.from<edge.to?-25:25):0;
        const sx=x+dx/length*125,sy=y+dy/length*125+offset,ex=tx-dx/length*125,ey=ty-dy/length*125+offset;
        const draw=progress(frame, Math.max(cues[edge.from],cues[edge.to])+23,20);
        return <g key={i} opacity={draw>0?1:0}><path d={`M${sx} ${sy} L${ex} ${ey}`} pathLength="1" stroke={ink} strokeWidth="3.5" strokeDasharray="1" strokeDashoffset={1-draw} fill="none" markerEnd={draw>.97?`url(#arrow-${scene.id})`:undefined} /><text x={(sx+ex)/2} y={(sy+ey)/2+(offset>0?30:-24)} textAnchor="middle" fontSize="26" fontWeight="700" fill={ink} stroke="#ffffff" strokeWidth="8" paintOrder="stroke" opacity={progress(frame,Math.max(cues[edge.from],cues[edge.to])+35,12)}>{edge.label.toUpperCase()}</text></g>;
      })}
    </svg>
    {scene.nodes.map((node, i) => <div key={node.icon + i} style={{ position: "absolute", left: positions[i][0]-140, top: positions[i][1]-105, width: 280, display: "flex", flexDirection: "column", alignItems: "center" }}>
      {node.icon === "TEXT" ? <div style={{ width:250,minHeight:205,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",padding:12,boxSizing:"border-box",fontSize:node.label.length>18?32:40,overflowWrap:"anywhere",lineHeight:1.25,fontWeight:700,opacity:progress(frame,cues[i],24) }}>{node.label.toUpperCase()}</div> : <><Icon svg={icons[node.icon]} at={cues[i]} name={`${scene.id}-${i}`} /><div style={{ fontSize: 30, fontWeight: 700, marginTop: 10, lineHeight:1.15,textAlign:"center",opacity: progress(frame, cues[i]+22, 12) }}>{node.label.toUpperCase()}</div></>}
    </div>)}
  </AbsoluteFill>;
}

function BoardFont() {
  const [handle] = useState(() => delayRender("Loading the whiteboard lettering"));
  useEffect(() => {
    document.fonts.load("700 32px Kalam").then(() => continueRender(handle)).catch(error => cancelRender(error));
    return () => continueRender(handle);
  }, [handle]);
  return null;
}

function BoardAssets({assets}:{assets:AssetImages}) {
  const [handle] = useState(() => delayRender("Loading the selected illustrations"));
  useEffect(() => {
    let active=true;
    Promise.all(Object.values(assets).map(source=>new Promise<void>((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve();
      image.onerror=()=>reject(new Error("A verified lesson illustration could not be decoded"));
      image.src=source;
    }))).then(()=>{if(active)continueRender(handle);}).catch(error=>{if(active)cancelRender(error);});
    return ()=>{active=false;continueRender(handle);};
  },[assets,handle]);
  return null;
}

export function ExplainerVideo({ project, icons, assets=NO_ASSETS }: VideoProps) {
  return <AbsoluteFill style={{background:"#ffffff"}}><BoardFont /><BoardAssets assets={assets} />{project.scenes.map(scene => <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationInFrames}>
    {scene.visualPlan ? <VisualBoard scene={scene} assets={assets} /> : <LegacyBoard scene={scene} icons={icons} />}
    <Sequence from={8}><Audio src={staticFile(scene.audioFile)} /></Sequence>
  </Sequence>)}</AbsoluteFill>;
}
const empty = { project: { fps: 24, width: 1280, height: 720, durationInFrames: 24, scenes: [] }, icons: {} } as unknown as VideoProps;
function Root() {
  return <Composition id="Explainer" component={ExplainerVideo} width={1280} height={720} fps={24} durationInFrames={24} defaultProps={empty} calculateMetadata={({ props }) => ({ durationInFrames: props.project.durationInFrames, fps: props.project.fps, width: props.project.width, height: props.project.height })} />;
}
registerRoot(Root);
