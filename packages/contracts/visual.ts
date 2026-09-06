import { z } from "zod";
import { getLessonAsset } from "../assets/catalog";

export const VISUAL_KINDS = ["sun", "solar-panel", "photon", "electron", "atom", "molecule", "lattice", "battery", "bulb", "house", "plant", "root", "flower", "seed", "water", "beaker", "cloud", "gear", "turbine", "magnet", "speaker", "book", "document", "person", "brain", "chip", "computer", "database", "magnifier", "clock", "shield", "container", "token", "filter", "memory", "pipe", "thermometer", "heat", "wave", "globe", "scale", "valve", "check", "cross", "bars", "pie", "grid", "layers", "circle", "box", "label", "asset"] as const;
export const VISUAL_COLORS = ["ink", "blue", "green", "yellow", "orange", "purple", "red", "gray", "white"] as const;
export const TRANSFORM_KINDS = ["battery", "bulb", "plant", "flower", "speaker", "book", "clock", "container", "pipe", "thermometer", "scale", "valve", "beaker", "wave", "bars", "pie", "grid"] as const;
const id = z.string().regex(/^[a-z][a-z0-9-]{0,35}$/);
const cue = z.string().max(70);
export const visualEntitySchema = z.object({
  id, kind: z.enum(VISUAL_KINDS), label: z.string().max(32),
  x: z.number().min(4).max(96), y: z.number().min(6).max(94),
  w: z.number().min(4).max(70), h: z.number().min(4).max(75),
  color: z.enum(VISUAL_COLORS), enter: z.number().min(0).max(0.8), cue,
  count: z.number().int().min(1).max(16).optional(),
  values: z.array(z.number().min(0).max(1000000)).max(8).optional(),
  variant: z.enum(["default", "positive", "negative", "open", "closed", "horizontal", "vertical"]).optional(),
  parentId: id.optional(),
  assetId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/).optional(),
}).strict();
export const visualRelationSchema = z.object({
  id, from: id, to: id, label: z.string().max(28),
  type: z.enum(["arrow", "flow", "line", "brace"]), color: z.enum(VISUAL_COLORS),
  curve: z.number().min(-1).max(1), enter: z.number().min(0).max(0.85), cue,
  particle: z.enum(["dot", "photon", "electron"]).optional(),
}).strict();
export const visualBeatSchema = z.object({
  id, target: id,
  action: z.enum(["draw", "move", "pulse", "flow", "transform", "highlight", "hide", "rotate", "focus"]),
  at: z.number().min(0).max(0.88), duration: z.number().min(0.04).max(0.6), cue,
  meaning: z.string().min(8).max(180),
  x: z.number().min(4).max(96).optional(), y: z.number().min(6).max(94).optional(),
  value: z.number().min(-360).max(360).optional(),
}).strict();
export const visualPlanSchema = z.object({
  version: z.literal(1),
  grammar: z.enum(["process", "branch", "cycle", "comparison", "mechanism", "timeline", "quantitative", "spatial"]),
  objective: z.string().min(15).max(240),
  entities: z.array(visualEntitySchema).min(2).max(12),
  relations: z.array(visualRelationSchema).max(14),
  beats: z.array(visualBeatSchema).min(2).max(10),
}).strict();
export type VisualPlan = z.infer<typeof visualPlanSchema>;
export type VisualEntity = z.infer<typeof visualEntitySchema>;
export type VisualRelation = z.infer<typeof visualRelationSchema>;
export type VisualBeat = z.infer<typeof visualBeatSchema>;
export type VisualKind = typeof VISUAL_KINDS[number];
export type VisualColor = typeof VISUAL_COLORS[number];
export type VisualTiming = { entities: Record<string, number>; relations: Record<string, number>; beats: Record<string, { start: number; duration: number }> };

export const VISUAL_CANVAS = { width: 1280, height: 720 } as const;

/** Pixel dimensions after SVG's default xMidYMid meet fitting on the 16:9 canvas. */
export function renderedGlyphSize(entity: Pick<VisualEntity, "kind" | "w" | "h" | "assetId">): { width: number; height: number } {
  const width = entity.w * VISUAL_CANVAS.width / 100;
  const height = entity.h * VISUAL_CANVAS.height / 100;
  if (entity.kind === "label") return { width, height };
  if (entity.kind === "asset") {
    const asset = getLessonAsset(entity.assetId);
    if (!asset || !(asset.width > 0) || !(asset.height > 0)) throw new Error("Unknown or invalid lesson asset");
    const scale = Math.min(width / asset.width, height / asset.height);
    return { width: asset.width * scale, height: asset.height * scale };
  }
  const side = Math.min(width, height);
  return { width: side, height: side };
}

/** Absolute canvas-percent bounds, excluding labels and unpainted SVG letterboxing.
 * Lattices use their count-dependent node extents (including each node's radius).
 * Other kinds currently use the fitted viewport, not a promise of exact shape containment.
 * These are the entity's unrotated base bounds; inherited group transforms are separate.
 */
export function visualMaterialBounds(entity: Pick<VisualEntity, "kind" | "x" | "y" | "w" | "h" | "count" | "assetId">): { left: number; right: number; top: number; bottom: number } {
  const size = renderedGlyphSize(entity);
  let left = 0, right = 100, top = 0, bottom = 100;
  if (entity.kind === "lattice") {
    const count = entity.count ?? 4;
    const columns = Math.max(2, Math.min(4, Math.ceil(Math.sqrt(count))));
    const points = Array.from({ length: count }, (_, i) => ({
      x: 15 + (i % columns) * 70 / (columns - 1),
      y: 15 + Math.floor(i / columns) * 70 / (columns - 1),
    }));
    left = Math.min(...points.map(point => point.x)) - 8;
    right = Math.max(...points.map(point => point.x)) + 8;
    top = Math.min(...points.map(point => point.y)) - 8;
    bottom = Math.max(...points.map(point => point.y)) + 8;
  }
  return {
    left: entity.x + (left - 50) * size.width / VISUAL_CANVAS.width,
    right: entity.x + (right - 50) * size.width / VISUAL_CANVAS.width,
    top: entity.y + (top - 50) * size.height / VISUAL_CANVAS.height,
    bottom: entity.y + (bottom - 50) * size.height / VISUAL_CANVAS.height,
  };
}

const words = (value: string) => value.toLowerCase().match(/[a-z0-9]+/g) || [];
function hasCue(narration: string, anchor: string) { return !anchor || ` ${words(narration).join(" ")} `.includes(` ${words(anchor).join(" ")} `); }

/** Mechanical director checks. Semantic accuracy remains independently reviewed. */
export function validateVisualPlan(value: unknown, narration: string): VisualPlan {
  const plan = visualPlanSchema.parse(value);
  const errors: string[] = [];
  const entities = new Map(plan.entities.map(e => [e.id, e]));
  const relationIds = new Set(plan.relations.map(r => r.id));
  const ids = [...entities.keys(), ...relationIds];
  // Resolve static artwork before any geometry lookup. A model supplies only a
  // catalog ID; paths, URLs, new SVG and stateful reinterpretation are forbidden.
  for (const entity of plan.entities) {
    if (entity.kind === "asset") {
      if (!getLessonAsset(entity.assetId)) errors.push(`${entity.id}: asset needs an existing vetted assetId`);
      if (entity.count !== undefined || entity.values !== undefined || (entity.variant !== undefined && entity.variant !== "default")) errors.push(`${entity.id}: static assets do not support count, values or nondefault variants`);
      if (plan.entities.some(child => child.parentId === entity.id)) errors.push(`${entity.id}: a static asset cannot enclose an interior mechanism; use a separate explicit cutaway instead of parenting components to its opaque artwork`);
    } else if (entity.assetId !== undefined) errors.push(`${entity.id}: assetId is only valid for kind asset`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  if (entities.size !== plan.entities.length || relationIds.size !== plan.relations.length || new Set(ids).size !== ids.length) errors.push("Entity and relation IDs must be unique");
  if (new Set(plan.beats.map(b => b.id)).size !== plan.beats.length) errors.push("Beat IDs must be unique");
  for (const e of plan.entities) {
    const labelSpace = e.label && e.kind !== "label" ? 5 : 0;
    if (e.x-e.w/2 < 3 || e.x+e.w/2 > 97 || e.y-e.h/2 < 4 || e.y+e.h/2+labelSpace > 95) errors.push(`${e.id}: illustration and label must fit the canvas safe area`);
    if (!hasCue(narration, e.cue)) errors.push(`${e.id}: cue '${e.cue}' is not spoken`);
    if (e.parentId && (!entities.has(e.parentId) || e.parentId === e.id)) errors.push(`${e.id}: invalid parent`);
    if (["bars", "pie"].includes(e.kind) && (!e.values?.length || !e.values.some(v => v > 0))) errors.push(`${e.id}: charts require real nonzero values`);
    const seen = new Set([e.id]); let parent = e.parentId;
    while (parent) { if (seen.has(parent)) { errors.push(`${e.id}: parent cycle`); break; } seen.add(parent); parent = entities.get(parent)?.parentId; }
  }
  for (const r of plan.relations) {
    if (!entities.has(r.from) || !entities.has(r.to) || r.from === r.to) errors.push(`${r.id}: relation needs two distinct existing entities`);
    if (!hasCue(narration,r.cue)) errors.push(`${r.id}: cue '${r.cue}' is not spoken`);
  }
  const ancestors = (entity: VisualEntity) => {
    const seen = new Set<string>(); let parent = entity.parentId;
    while (parent && !seen.has(parent)) { seen.add(parent); parent = entities.get(parent)?.parentId; }
    return seen;
  };
  for (let i = 0; i < plan.entities.length; i++) for (let j = i+1; j < plan.entities.length; j++) {
    const a = plan.entities[i], b = plan.entities[j];
    if (ancestors(a).has(b.id) || ancestors(b).has(a.id)) continue;
    // Unlabeled glyphs occupy their fitted square, not the unpainted SVG
    // letterbox. Keep the conservative reserved viewport for labeled objects.
    const bounds=(entity:VisualEntity)=>{const fit=renderedGlyphSize(entity);return entity.label?{w:entity.w,h:entity.h}:{w:fit.width/VISUAL_CANVAS.width*100,h:fit.height/VISUAL_CANVAS.height*100};};
    const aa=bounds(a),bb=bounds(b);
    const overlapW = Math.max(0, Math.min(a.x+aa.w/2,b.x+bb.w/2)-Math.max(a.x-aa.w/2,b.x-bb.w/2));
    const overlapH = Math.max(0, Math.min(a.y+aa.h/2,b.y+bb.h/2)-Math.max(a.y-aa.h/2,b.y-bb.h/2));
    if (overlapW*overlapH > Math.min(aa.w*aa.h,bb.w*bb.h)*0.22) errors.push(`${a.id}/${b.id}: illustrations overlap; separate their starting positions. Sharing a parent does not permit siblings to overlap. parentId permits only real ancestor/child containment, never one peer particle inside another.`);
  }
  for (const b of plan.beats) {
    if (!entities.has(b.target) && !relationIds.has(b.target)) errors.push(`${b.id}: missing target`);
    if (!hasCue(narration,b.cue)) errors.push(`${b.id}: cue '${b.cue}' is not spoken`);
    if (b.action === "move" && (b.x === undefined || b.y === undefined || !entities.has(b.target))) errors.push(`${b.id}: move needs an entity and destination x/y`);
    if (b.action === "flow" && !relationIds.has(b.target)) errors.push(`${b.id}: flow needs a relation target`);
    if (["pulse", "focus"].includes(b.action) && !entities.has(b.target)) errors.push(`${b.id}: ${b.action} needs an entity target`);
    if (["transform", "rotate"].includes(b.action) && (b.value === undefined || !entities.has(b.target))) errors.push(`${b.id}: ${b.action} needs entity and value`);
    if (b.action === "transform" && b.value !== undefined && (b.value < 0 || b.value > 1)) errors.push(`${b.id}: transformation value must be 0–1`);
    const e=entities.get(b.target);
    if (b.action === "transform" && e && !(TRANSFORM_KINDS as readonly string[]).includes(e.kind) && !(e.kind === "lattice" && e.variant === "positive")) errors.push(`${b.id}: ${e.kind} has no visual transform state; use movement or a supported stateful illustration`);
    if (b.action === "move" && e && b.x !== undefined && b.y !== undefined && (b.x-e.w/2 < 3 || b.x+e.w/2 > 97 || b.y-e.h/2 < 4 || b.y+e.h/2+(e.label?5:0)>95)) errors.push(`${b.id}: destination clips the illustration or label`);
    if (b.action === "move" && e && b.x !== undefined && b.y !== undefined) for (const child of plan.entities.filter(child => ancestors(child).has(e.id))) {
      const childPositions=[child,...plan.beats.filter(action=>action.target===child.id&&action.action==="move"&&action.x!==undefined&&action.y!==undefined).map(action=>({x:action.x!,y:action.y!}))];
      for (const position of childPositions) {
        const x=position.x+b.x-e.x,y=position.y+b.y-e.y;
        if (x-child.w/2<3 || x+child.w/2>97 || y-child.h/2<4 || y+child.h/2+(child.label?5:0)>95) errors.push(`${b.id}: moving the parent clips child ${child.id}; keep the whole group inside the canvas, including each child's own movement`);
      }
    }
    if (b.action === "rotate" && e) {
      // Percentages use different pixel scales on a 16:9 board. Bound the
      // complete sweep, not only the unrotated starting rectangle.
      const children=plan.entities.filter(child => ancestors(child).has(e.id));
      const radius=Math.max(Math.hypot(e.w*12.8,e.h*7.2)/2,...children.map(child=>Math.hypot((child.x-e.x)*12.8,(child.y-e.y)*7.2)+Math.hypot(child.w*12.8,child.h*7.2)/2));
      if (e.x-radius/12.8<3 || e.x+radius/12.8>97 || e.y-radius/7.2<4 || e.y+radius/7.2+(e.label?5:0)>95) errors.push(`${b.id}: rotating the group can clip the canvas; reduce its size or move it inward`);
    }
  }
  if (plan.entities.filter(e=>e.kind === "label" || e.kind === "box").length > plan.entities.length * 0.5) errors.push("Draw the subject: most entities must be illustrations or meaningful scientific primitives, not text boxes");
  if (!plan.relations.length && !plan.beats.some(b=>["move","transform","rotate"].includes(b.action))) errors.push("Show a relationship or a visible state change; an array of isolated icons is not an explanation");
  if (plan.grammar === "mechanism" && !plan.beats.some(b=>["move","flow","transform","rotate"].includes(b.action))) errors.push("A mechanism must visibly move, flow, transform or rotate");
  for (const entity of plan.entities.filter(e=>e.parentId)) {
    const positions=(e:VisualEntity)=>[e,...plan.beats.filter(b=>b.target===e.id&&b.action==="move"&&b.x!==undefined&&b.y!==undefined).map(b=>({x:b.x!,y:b.y!}))];
    const own=positions(entity);
    let minX=Math.min(...own.map(p=>p.x)),maxX=Math.max(...own.map(p=>p.x)),minY=Math.min(...own.map(p=>p.y)),maxY=Math.max(...own.map(p=>p.y));
    for(const ancestorId of ancestors(entity)) {
      const ancestor=entities.get(ancestorId);if(!ancestor)continue;
      const moves=positions(ancestor);
      minX+=Math.min(...moves.map(p=>p.x-ancestor.x));maxX+=Math.max(...moves.map(p=>p.x-ancestor.x));
      minY+=Math.min(...moves.map(p=>p.y-ancestor.y));maxY+=Math.max(...moves.map(p=>p.y-ancestor.y));
    }
    if(minX-entity.w/2<3||maxX+entity.w/2>97||minY-entity.h/2<4||maxY+entity.h/2+(entity.label?5:0)>95) errors.push(`${entity.id}: composed ancestor/child movement can clip the canvas; reduce the group movement`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return plan;
}

export function compileVisualTiming(plan: VisualPlan, spoken: { text: string; start: number; end: number }[], frames: number, fps: number): VisualTiming {
  const tokens = spoken.flatMap(w => words(w.text).map(text => ({ text, start: w.start })));
  const lastReveal = Math.max(0, frames - 56);
  const atCue = (anchor: string, fallback: number) => {
    const cueWords = words(anchor);
    const index = cueWords.length ? tokens.findIndex((_,i)=>cueWords.every((w,j)=>tokens[i+j]?.text===w)) : -1;
    return Math.max(0, Math.min(lastReveal, index >= 0 ? Math.round(tokens[index].start*fps)-4 : Math.round(frames*fallback)));
  };
  const entities = Object.fromEntries(plan.entities.map(e=>[e.id,atCue(e.cue,e.enter)]));
  // A nested component must never wait invisibly for a parent's later cue.
  // Establish its surrounding structure by the time the component is named.
  for (const entity of plan.entities) {
    let parent=entity.parentId; const seen=new Set<string>();
    while(parent&&!seen.has(parent)) { seen.add(parent);entities[parent]=Math.min(entities[parent],entities[entity.id]);parent=plan.entities.find(e=>e.id===parent)?.parentId; }
  }
  const relations = Object.fromEntries(plan.relations.map(r=>[r.id,Math.min(Math.max(0,frames-32),Math.max(atCue(r.cue,r.enter),entities[r.from]+12,entities[r.to]+12))]));
  const beats = Object.fromEntries(plan.beats.map(b=>{
    const start=Math.min(Math.max(0,frames-8),Math.max(atCue(b.cue,b.at),(entities[b.target]??relations[b.target]??0)+8));
    return [b.id,{ start,duration:Math.min(frames-1-start,Math.max(6,Math.round(frames*b.duration))) }];
  }));
  // Reach the destination before a later spoken absorption or movement cue.
  // Concurrent emphasis and other entities do not interrupt this trajectory.
  // Equal cue starts stay concurrent; their semantic ambiguity belongs in review.
  for (const move of plan.beats.filter(beat=>beat.action==="move")) {
    const timing=beats[move.id];
    const nextStart=Math.min(...plan.beats
      .filter(beat=>beat.target===move.target&&(beat.action==="move"||beat.action==="hide")&&beats[beat.id].start>timing.start)
      .map(beat=>beats[beat.id].start));
    timing.duration=Math.min(timing.duration,nextStart-timing.start);
  }
  return { entities,relations,beats };
}
