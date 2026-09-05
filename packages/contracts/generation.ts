import { z } from "zod";
import { sceneSchema } from "./scene";

export const EMBEDDING_SPACE = "cf-bge-base-en-v1.5-mean-openmoji-v1";
export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
export const NVIDIA_MODEL = "nvidia/nemotron-3-super-120b-a12b";
export const CLOUDFLARE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const sourceSchema = z.object({ id: z.string(), title: z.string().max(300), url: z.string().url(), text: z.string().min(150).max(8000) });
export const researchSchema = z.array(sourceSchema).min(2).max(5);
export type Research = z.infer<typeof researchSchema>;
const draftNodeSchema = z.object({ concept: z.string().min(2).max(80), label: z.string().min(1).max(24), cue: z.string().regex(/^[a-zA-Z]+$/).max(24) });
const draftSceneBase = sceneSchema.omit({ nodes: true, layout: true }).extend({
  evidence: z.array(z.object({ sourceId: z.string(), quote: z.string().min(20).max(240) })).min(1).max(2),
});
export const draftSchema = z.object({
  title: z.string().min(1).max(100),
  scenes: z.array(z.discriminatedUnion("layout", [
    draftSceneBase.extend({ layout: z.literal("process"), nodes: z.array(draftNodeSchema).length(3, "Layout node count mismatch") }),
    draftSceneBase.extend({ layout: z.literal("comparison"), nodes: z.array(draftNodeSchema).length(2, "Layout node count mismatch") }),
    draftSceneBase.extend({ layout: z.literal("relationship"), nodes: z.array(draftNodeSchema).length(3, "Layout node count mismatch") }),
  ])).min(4).max(8),
}).strict();
export type Draft = z.infer<typeof draftSchema>;

export function planningInput(sources: Research, duration: number, topic: string, iconVocabulary: string[] = []) {
  const terms = topic.toLowerCase().match(/[a-z]{4,}/g) || [];
  const excerpts = sources.map(source => {
    const candidates = source.text.split(/\n+|(?<=[.!?])\s+/)
      .map(text => text.trim()).filter(text => text.length >= 20 && !/^(?:#|\[|!\[|\||\*)/.test(text))
      .map(text => text.length <= 180 ? text : text.slice(0, 180).replace(/\s+\S*$/, ""))
      .filter(text => text.length >= 20);
    const score = (text: string) => terms.reduce((sum, term) => sum + Number(text.toLowerCase().includes(term)), 0);
    const quotes = [...new Set(candidates)].sort((a, b) => score(b) - score(a)).slice(0, 8);
    return { id: source.id, title: source.title, quotes };
  }).filter(source => source.quotes.length > 0);
  if (excerpts.length < 2) throw new Error("Research needs quotable passages from two sources");
  const node = iconVocabulary.length ? draftNodeSchema.extend({ concept: z.enum(iconVocabulary) }) : draftNodeSchema;
  const base = draftSceneBase.extend({
    narration: z.string().min(10).max(600).regex(/^(?:\S+\s+){26,35}\S+$/, "Each scene needs 27-36 narration words").describe("27-36 words in two or three full sentences"),
    evidence: z.array(z.object({ sourceId: z.enum(excerpts.map(s => s.id)), quote: z.enum(excerpts.flatMap(s => s.quotes)) })).length(1),
  });
  const schema = draftSchema.extend({ scenes: z.array(z.discriminatedUnion("layout", [
    base.extend({ layout: z.literal("process"), nodes: z.array(node).length(3) }),
    base.extend({ layout: z.literal("comparison"), nodes: z.array(node).length(2) }),
    base.extend({ layout: z.literal("relationship"), nodes: z.array(node).length(3) }),
  ])).length(Math.round(duration / 15)) });
  return { schema, excerpts };
}

// Compile singular/plural cue variants to the actual spoken word, then put the
// nodes in narration order. Never invent a cue for an unrelated concept.
export function alignDraftCues(value: unknown): Draft {
  const draft = draftSchema.parse(value);
  const variants = (word: string) => new Set([word, `${word}s`, `${word}es`, ...(word.endsWith("y") ? [`${word.slice(0, -1)}ies`] : [])]);
  for (const scene of draft.scenes) {
    const words = scene.narration.toLowerCase().split(/[^a-z]+/);
    for (const node of scene.nodes) {
      const cue = node.cue.toLowerCase();
      if (!words.includes(cue)) {
        const labels = `${node.label} ${node.concept}`.toLowerCase().match(/[a-z]{3,}/g) || [];
        const aliases = cue === "sun" ? ["sunlight", "sunshine"] : [];
        const match = words.find(word => variants(cue).has(word) || variants(word).has(cue))
          || words.find(word => aliases.includes(word))
          || words.find(word => labels.some(label => variants(label).has(word) || variants(word).has(label)));
        if (match) node.cue = match;
      }
    }
    scene.nodes.sort((a, b) => words.indexOf(a.cue.toLowerCase()) - words.indexOf(b.cue.toLowerCase()));
  }
  return draft;
}

export function validateDraft(value: unknown, sources: Research, duration: number): Draft {
  const draft = draftSchema.parse(value);
  const errors: string[] = [];
  if (draft.scenes.some(s => s.connections === undefined) && new Set(draft.scenes.map(s => s.layout)).size < 2) errors.push("Use at least two layout families");
  const ids = new Set<string>();
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  for (const scene of draft.scenes) {
    if (ids.has(scene.id)) errors.push("Scene IDs must be unique");
    ids.add(scene.id);
    for (const edge of scene.connections || []) {
      if (edge.from === edge.to || edge.from >= scene.nodes.length || edge.to >= scene.nodes.length) errors.push(`Scene ${scene.id}: invalid diagram connection`);
    }
    if (scene.nodes.length !== (scene.layout === "comparison" ? 2 : 3)) errors.push(`Scene ${scene.id}: layout node count mismatch`);
    let previousCue = -1;
    for (const node of scene.nodes) {
      const position = scene.narration.toLowerCase().split(/[^a-z]+/).indexOf(node.cue.toLowerCase());
      if (position <= previousCue) errors.push(`Scene ${scene.id}: cue '${node.cue}' first occurs at word ${position}, but must occur after word ${previousCue}. Choose a different narration word or reorder nodes to match their first occurrence. A position of -1 means the cue is absent.`);
      previousCue = position;
    }
    for (const evidence of scene.evidence) {
      const source = sources.find(s => s.id === evidence.sourceId);
      if (!source || !normalize(source.text).includes(normalize(evidence.quote))) errors.push(`Scene ${scene.id}: evidence must quote a retrieved source exactly; check ${evidence.sourceId}`);
    }
  }
  if (new Set(draft.scenes.flatMap(s => s.evidence.map(e => e.sourceId))).size < 2) errors.push("Use at least two retrieved sources");
  const words = draft.scenes.reduce((n, s) => n + s.narration.trim().split(/\s+/).length, 0);
  const modern = draft.scenes.every(s => s.connections !== undefined);
  const minimum = duration * (modern ? 1.6 : 1.8), maximum = duration * (modern ? 2.8 : 2.4);
  if (words < minimum || words > maximum) errors.push(`Narration needs ${Math.ceil(minimum)}-${Math.floor(maximum)} words; received ${words}`);
  if (errors.length) throw new Error(errors.join("\n"));
  return draft;
}
