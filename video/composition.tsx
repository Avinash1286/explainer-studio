import React from "react";
import { AbsoluteFill, Audio, Composition, interpolate, registerRoot, Sequence, staticFile, useCurrentFrame } from "remotion";
import type { RenderProject, TimedScene } from "../packages/contracts/scene";

export type VideoProps = { project: RenderProject; icons: Record<string, string> };
const ink = "#233d34";
const progress = (frame: number, start: number, length: number) => interpolate(frame, [start, start + length], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

function Icon({ svg, at, name }: { svg: string; at: number; name: string }) {
  const frame = useCurrentFrame();
  const draw = progress(frame, at, 24);
  const fill = progress(frame, at + 24, 12);
  // Only pinned, locally imported and validated OpenMoji SVGs enter this markup.
  return <div style={{ width: 160, height: 160, position: "relative" }}>
    <style>{`.trace-${name} svg{width:100%;height:100%}.trace-${name} *{fill:none!important;stroke:${ink}!important;stroke-width:1.5!important;stroke-dasharray:320!important;stroke-dashoffset:${320 * (1 - draw)}!important}.color-${name} svg{width:100%;height:100%}`}</style>
    <div className={`trace-${name}`} style={{ position: "absolute", inset: 0, opacity: draw > 0 ? 1 : 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
    <div className={`color-${name}`} style={{ position: "absolute", inset: 0, opacity: fill }} dangerouslySetInnerHTML={{ __html: svg }} />
  </div>;
}

function Board({ scene, icons, index, fps, total, origin }: { scene: TimedScene; icons: Record<string, string>; index: number; fps: number; total: number; origin?: string }) {
  const frame = useCurrentFrame();
  const positions = scene.layout === "comparison" ? [[365, 340], [915, 340]] : scene.layout === "relationship" ? [[275, 420], [640, 300], [1005, 420]] : [[245, 355], [640, 355], [1035, 355]];
  const cues = scene.cueFrames;
  const connections = scene.connections ?? (scene.layout === "comparison" ? [] : [{ from: 0, to: 1, label: "" }, { from: 1, to: 2, label: "" }]);
  const time = (frame - 8) / fps;
  const active = scene.words.findIndex(w => time >= w.start && time < w.end);
  const captionWords = active >= 0 ? scene.words.slice(Math.floor(active / 7) * 7, Math.floor(active / 7) * 7 + 7) : [];
  return <AbsoluteFill style={{ background: "#fbfaf5", color: ink, fontFamily: "Arial, sans-serif", padding: "52px 72px" }}>
    <div style={{ fontSize: 15, letterSpacing: 3, color: "#71836b" }}>EXPLAINER STUDIO · THE EVERYDAY SCIENCE COLLECTION</div>
    <h1 style={{ fontSize: 48, letterSpacing: -1.8, fontWeight: 600, margin: "25px 0 0", opacity: progress(frame, 0, 10) }}>{scene.title}</h1>
    <div style={{ position: "absolute", right: 72, top: 55, fontSize: 16 }}>{index + 1} / {total}</div>
    {scene.layout === "comparison" ? <><div style={{ position: "absolute", left: 140, top: 220, width: 450, height: 300, borderRadius: 24, background: "#f4f0dc" }} /><div style={{ position: "absolute", left: 690, top: 220, width: 450, height: 300, borderRadius: 24, background: "#eaf0e4" }} /><div style={{ position: "absolute", left: 632, top: 260, height: 230, width: 2, background: "#dce1d5" }} /></> : null}
    <svg viewBox="0 0 1280 720" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <defs><marker id={`arrow-${scene.id}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke={ink} strokeWidth="1.5" /></marker></defs>
      {connections.map((edge, i) => {
        const [x,y] = positions[edge.from], [tx,ty] = positions[edge.to];
        const direction = tx > x ? 1 : -1;
        const bidirectional = connections.some(other => other.from === edge.to && other.to === edge.from);
        const lane = bidirectional ? (edge.from < edge.to ? -24 : 24) : 0;
        const crossBase = scene.layout === "relationship" && Math.abs(edge.from-edge.to) === 2;
        const labelY = (y+ty)/2 + lane + (crossBase ? 31 : bidirectional && edge.from > edge.to ? 22 : -18);
        return <g key={i} opacity={progress(frame, Math.max(cues[edge.from], cues[edge.to])+25, 12)}><line x1={x+105*direction} y1={y+lane} x2={tx-105*direction} y2={ty+lane} stroke={ink} strokeWidth="3" strokeDasharray="6 8" markerEnd={`url(#arrow-${scene.id})`} /><text x={(x+tx)/2} y={labelY} textAnchor="middle" fontSize="19" fill={ink} stroke="#fbfaf5" strokeWidth="6" paintOrder="stroke">{edge.label}</text></g>;
      })}
    </svg>
    {scene.nodes.map((node, i) => <div key={node.icon + i} style={{ position: "absolute", left: positions[i][0]-110, top: positions[i][1]-90, width: 220, display: "flex", flexDirection: "column", alignItems: "center" }}>
      {node.icon === "TEXT" ? <div style={{ width:190, minHeight:140, display:"flex", alignItems:"center", justifyContent:"center", textAlign:"center", border:"2px solid #71836b", borderRadius:20, padding:12, boxSizing:"border-box", background:"#f5f6ec", fontSize:node.label.split(/\s+/).some(word => word.length > 11) ? 20 : 28, overflowWrap:"anywhere", lineHeight:1.2, fontWeight:600, opacity:progress(frame,cues[i],24) }}>{node.label}</div> : <><Icon svg={icons[node.icon]} at={cues[i]} name={`${scene.id}-${i}`} /><div style={{ fontSize: 27, fontWeight: 600, marginTop: 12, opacity: progress(frame, cues[i]+24, 12) }}>{node.label}</div></>}
    </div>)}
    <div style={{ position: "absolute", bottom: 120, left: 100, right: 100, textAlign: "center", fontSize: 24, color: "#576b51", opacity: progress(frame, cues.at(-1)!+35, 12) }}>{scene.takeaway}</div>
    <div style={{ position: "absolute", bottom: 49, left: 90, right: 90, textAlign: "center", fontSize: 24, minHeight: 30 }}>{captionWords.map(w => w.text).join(" ").replace(/\s+([.,!?;:])/g, "$1")}</div>
    <div style={{ position: "absolute", bottom: 17, left: 35, fontSize: 12, color: "#66745f" }}>Illustrations: OpenMoji · CC BY-SA 4.0 · animation adaptations</div>
    <div style={{ position: "absolute", bottom: 17, right: 35, fontSize: 12, color: "#66745f" }}>{origin === "generated" ? "AI-planned lesson" : origin === "validation" ? "Scripted renderer validation" : "Original scripted renderer demo"} · Kokoro narration</div>
    <Sequence from={8}><Audio src={staticFile(scene.audioFile)} /></Sequence>
  </AbsoluteFill>;
}

export function ExplainerVideo({ project, icons }: VideoProps) {
  return <AbsoluteFill>{project.scenes.map((scene, index) => <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationInFrames}><Board scene={scene} icons={icons} index={index} fps={project.fps} total={project.scenes.length} origin={project.origin} /></Sequence>)}</AbsoluteFill>;
}
const empty = { project: { fps: 24, width: 1280, height: 720, durationInFrames: 24, scenes: [] }, icons: {} } as unknown as VideoProps;
function Root() {
  return <Composition id="Explainer" component={ExplainerVideo} width={1280} height={720} fps={24} durationInFrames={24} defaultProps={empty} calculateMetadata={({ props }) => ({ durationInFrames: props.project.durationInFrames, fps: props.project.fps, width: props.project.width, height: props.project.height })} />;
}
registerRoot(Root);
