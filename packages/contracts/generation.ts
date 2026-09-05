import { z } from "zod";
import { sceneSchema } from "./scene";

export const EMBEDDING_SPACE = "cf-bge-base-en-v1.5-mean-openmoji-v1";
export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
export const NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";
export const CLOUDFLARE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const sourceSchema = z.object({ id: z.string(), title: z.string().max(300), url: z.string().url(), text: z.string().min(150).max(8000) });
export const researchSchema = z.array(sourceSchema).min(2).max(5);
export type Research = z.infer<typeof researchSchema>;
export const draftSchema = z.object({
  title: z.string().min(1).max(100),
  scenes: z.array(sceneSchema.omit({ nodes: true }).extend({
    nodes: z.array(z.object({ concept: z.string().min(2).max(80), label: z.string().min(1).max(24), cue: z.string().regex(/^[a-zA-Z]+$/).max(24) })).min(2).max(3),
    evidence: z.array(z.object({ sourceId: z.string(), quote: z.string().min(20).max(240) })).min(1).max(2),
  })).min(4).max(8),
}).strict();
export type Draft = z.infer<typeof draftSchema>;

export function validateDraft(value: unknown, sources: Research, duration: number): Draft {
  const draft = draftSchema.parse(value);
  if (new Set(draft.scenes.map(s => s.layout)).size < 2) throw new Error("Use at least two layout families");
  const ids = new Set<string>();
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  for (const scene of draft.scenes) {
    if (ids.has(scene.id)) throw new Error("Scene IDs must be unique");
    ids.add(scene.id);
    if (scene.nodes.length !== (scene.layout === "comparison" ? 2 : 3)) throw new Error("Layout node count mismatch");
    let previousCue = -1;
    for (const node of scene.nodes) {
      const position = scene.narration.toLowerCase().split(/[^a-z]+/).indexOf(node.cue.toLowerCase());
      if (position <= previousCue) throw new Error("Each reveal cue must occur in narration order, without repeats");
      previousCue = position;
    }
    for (const evidence of scene.evidence) {
      const source = sources.find(s => s.id === evidence.sourceId);
      if (!source || !normalize(source.text).includes(normalize(evidence.quote))) throw new Error("Evidence must quote a retrieved source exactly");
    }
  }
  if (new Set(draft.scenes.flatMap(s => s.evidence.map(e => e.sourceId))).size < 2) throw new Error("Use at least two retrieved sources");
  const words = draft.scenes.reduce((n, s) => n + s.narration.trim().split(/\s+/).length, 0);
  if (words < duration * 1.8 || words > duration * 2.4) throw new Error(`Narration needs ${Math.ceil(duration * 1.8)}-${Math.floor(duration * 2.4)} words`);
  return draft;
}
