import { z } from "zod";
import { projectSchema, type Project, type TimedScene } from "./scene";
import manifest from "../../public/openmoji/manifest.json";
import { validateVisualPlan } from "./visual";

export const REVIEW_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
export const issueSchema = z.object({ sceneId: z.string().max(40), kind: z.enum(["factual", "icon", "layout", "timing"]), detail: z.string().min(1).max(500), repair: z.string().min(1).max(500) }).strict();
export const reviewSchema = z.object({ summary: z.string().min(1).max(1000), scenes: z.array(z.object({ sceneId: z.string().max(40), factualPass: z.boolean(), visualPass: z.boolean(), issues: z.array(issueSchema).max(8) }).strict()).min(3).max(8) }).strict();
export type Review = z.infer<typeof reviewSchema>;
export function validateReview(value: unknown, project: Project): Review {
  const review = reviewSchema.parse(value);
  if (review.scenes.length !== project.scenes.length || new Set(review.scenes.map(s => s.sceneId)).size !== project.scenes.length || review.scenes.some(s => !project.scenes.some(p => p.id === s.sceneId) || s.issues.some(i => i.sceneId !== s.sceneId))) throw new Error("Review must cover every scene exactly once");
  if (review.scenes.some(s => ((!s.factualPass || !s.visualPass) && !s.issues.length) || (s.issues.length > 0 && s.factualPass && s.visualPass))) throw new Error("Inconsistent review verdict");
  return review;
}
export function passedReview(review: Review) { return review.scenes.every(s => s.factualPass && s.visualPass && !s.issues.length); }

// These concrete category errors occurred in the first live draft. The critic
// still checks other concepts and the actual pixels; this is a regression guard.
export function knownIconIssues(project: Project): z.infer<typeof issueSchema>[] {
  return project.scenes.flatMap(scene => scene.visualPlan ? [] : scene.nodes.flatMap(node => {
    const name = manifest.entries.find(e => e.id === node.icon)?.name || "";
    const wrong = (name === "leaf" && /\b(pollen|ovule|seed)\b/i.test(`${node.label} ${node.cue || ""}`)) || (name === "seedling" && (/^seeds?$/i.test(node.label) || /^seeds?$/i.test(node.cue || ""))) || (name === "earth" && /\b(soil|dirt)\b/i.test(`${node.label} ${node.cue || ""}`));
    return wrong ? [{ sceneId: scene.id, kind: "icon" as const, detail: `${name} icon is misleading with label '${node.label}' and narration cue '${node.cue || ""}'.`, repair: "Replace the diagram with supported whole-object interactions. Keep the scientific facts correct; do not merely rename the label or change pollen into leaves. The label AND cue must refer to the icon's actual meaning." }] : [];
  }));
}
export function frameSamples(scenes: (Pick<TimedScene, "id" | "startFrame" | "durationInFrames"> & Partial<Pick<TimedScene,"visualPlan" | "visualTiming">>)[]) {
  return scenes.flatMap(s => {
    if (!s.visualPlan) return [.45,.9].map(fraction=>({sceneId:s.id,frame:s.startFrame+Math.floor(s.durationInFrames*fraction)}));
    const actions=s.visualPlan.beats.filter(b=>["move","flow","transform","rotate"].includes(b.action)).map(b=>{
      const timing=s.visualTiming?.beats[b.id];
      const start=timing?.start??b.at*s.durationInFrames,duration=timing?.duration??b.duration*s.durationInFrames;
      return {mid:Math.floor(start+duration*.5),end:Math.ceil(start+duration)};
    });
    const actionMidpoints=actions.map(a=>a.mid).sort((a,b)=>a-b);
    const first=actionMidpoints[0]??Math.floor(s.durationInFrames*.2);
    const last=actionMidpoints.at(-1)??Math.floor(s.durationInFrames*.55);
    // At least one sampled frame lands inside a real mechanism action. With
    // multiple actions show the first and last, then the settled result.
    const before=Math.max(0,first-Math.floor(s.durationInFrames*.12));
    const settled=Math.max(last+2,Math.floor(s.durationInFrames*.94),...actions.map(a=>a.end));
    const points=first===last?[before,first,settled]:[first,last,settled];
    return points.map((frame,i)=>({sceneId:s.id,frame:s.startFrame+Math.max(i,Math.min(s.durationInFrames-3+i,frame))}));
  });
}
export function validateReplacement(previous: Project, value: unknown, sceneIds: string[], options: { deferVisualValidation?: boolean } = {}): Project {
  const next = projectSchema.parse(value);
  if (!sceneIds.length || sceneIds.some(id => !previous.scenes.some(s => s.id === id))) throw new Error("Unknown repair scene");
  const fixed = { ...previous, scenes: next.scenes };
  if (JSON.stringify(fixed) !== JSON.stringify(next) || next.scenes.length !== previous.scenes.length) throw new Error("Revision changed project metadata");
  const errors: string[] = [];
  next.scenes.forEach((scene, index) => {
    if (scene.id !== previous.scenes[index].id) throw new Error("Revision reordered scenes");
    if (!sceneIds.includes(scene.id) && JSON.stringify(scene) !== JSON.stringify(previous.scenes[index])) throw new Error("Revision changed an unaffected scene");
    if (previous.scenes[index].visualPlan && !scene.visualPlan) errors.push(`Scene ${scene.id}: repair discarded the visual direction`);
    // Narrative edits are re-directed before their final commit. Only that
    // internal intermediate stage may defer cue checks on the old plan.
    if (scene.visualPlan && !options.deferVisualValidation) validateVisualPlan(scene.visualPlan, scene.narration);
    if (scene.nodes.length !== (scene.layout === "comparison" ? 2 : 3) || scene.nodes.some(n => n.icon !== "TEXT" && !manifest.entries.some(e => e.id === n.icon))) errors.push(`Scene ${scene.id}: unsupported repaired diagram`);
    const words: string[] = scene.narration.toLowerCase().match(/[a-z]+/g) || [];
    const cues = scene.nodes.map(n => words.indexOf((n.cue || "").toLowerCase()));
    cues.forEach((cue, i) => {
      if (cue < 0 || (i > 0 && cue <= cues[i - 1])) errors.push(`Scene ${scene.id}: repair needs ordered distinct narration cues. '${scene.nodes[i].cue}' first appears at word ${cue}; it must appear after ${i ? cues[i - 1] : -1}. Use an exact spoken word and order nodes by their first occurrence.`);
    });
  });
  const count = next.scenes.reduce((n, s) => n + s.narration.trim().split(/\s+/).length, 0);
  const modern = previous.scenes.every(s => s.connections !== undefined);
  const min = (next.targetDuration || 60) * (modern ? 1.6 : 1.8), max = (next.targetDuration || 60) * (modern ? 2.8 : 2.4);
  if (count < min || count > max) errors.push(`Repair narration does not fit duration: received ${count} words, need ${Math.ceil(min)}-${Math.floor(max)} total across all scenes.`);
  for (const issue of knownIconIssues(next).filter(issue => sceneIds.includes(issue.sceneId))) errors.push(`Scene ${issue.sceneId}: icon category error: ${issue.detail} ${issue.repair}`);
  for (const scene of next.scenes.filter(s => sceneIds.includes(s.id))) {
    for (const edge of scene.connections || []) if (edge.from === edge.to || edge.from >= scene.nodes.length || edge.to >= scene.nodes.length) errors.push(`Scene ${scene.id}: invalid diagram connection`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return next;
}
