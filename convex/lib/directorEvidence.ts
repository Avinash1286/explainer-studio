import { z } from "zod";
import type { Research } from "../../packages/contracts/generation";

// Two cited passages keep the directing request bounded. Full research remains
// stored separately and is still supplied to the independent factual reviewer.
export const DIRECTOR_PASSAGE_LIMIT = 700;
const sceneEvidenceSchema = z.array(z.object({
  sceneId: z.string().min(1),
  evidence: z.array(z.object({ sourceId: z.string().min(1), quote: z.string().min(20).max(240) }).strict()).min(1).max(2),
}).strict()).min(1).max(8);

type Passage = Research[number] & { quote: string; offset: number; partial?: true };
export type DirectorEvidenceContext = { sceneId: string; sources: Passage[] };

// Authoring accepts differences in whitespace and case. Retain an offset map
// while applying that same normalization, then recover the original bytes:
// the model sees a verbatim source passage, never our normalized reconstruction.
function normalizedOffsets(text: string) {
  let normalized = "";
  const starts: number[] = [], ends: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (/\s/.test(char)) {
      if (normalized.endsWith(" ")) { ends[ends.length - 1] = i + 1; continue; }
      normalized += " "; starts.push(i); ends.push(i + 1);
    } else {
      const lower = char.toLowerCase();
      normalized += char;
      for (let j = 0; j < lower.length; j++) { starts.push(i); ends.push(i + 1); }
    }
  }
  // Lowercase the whole string so contextual Unicode casing matches authoring.
  return { normalized: normalized.toLowerCase(), starts, ends };
}

function quoteSpan(text: string, quote: string): [number, number] {
  const exact = text.indexOf(quote);
  if (exact >= 0) return [exact, exact + quote.length];
  const mapped = normalizedOffsets(text), normalizedQuote = quote.replace(/\s+/g, " ").trim().toLowerCase();
  const start = mapped.normalized.indexOf(normalizedQuote);
  if (!normalizedQuote || start < 0) throw new Error("Director evidence must match a retrieved source");
  return [mapped.starts[start], mapped.ends[start + normalizedQuote.length - 1]];
}

function passageSpan(text: string, quoteStart: number, quoteEnd: number) {
  // Sentence/paragraph boundaries preserve qualifications next to an authored
  // quote, including quotes that authoring shortened at a word boundary.
  const boundaries = [0];
  for (const match of text.matchAll(/[.!?]["')\]]*\s+|\n+/g)) boundaries.push(match.index + match[0].length);
  if (boundaries.at(-1) !== text.length) boundaries.push(text.length);
  let left = boundaries.findLastIndex(offset => offset <= quoteStart);
  let right = boundaries.findIndex(offset => offset >= quoteEnd);
  if (boundaries[right] - boundaries[left] <= DIRECTOR_PASSAGE_LIMIT) {
    while (true) {
      const before = left > 0 && boundaries[right] - boundaries[left - 1] <= DIRECTOR_PASSAGE_LIMIT;
      const after = right + 1 < boundaries.length && boundaries[right + 1] - boundaries[left] <= DIRECTOR_PASSAGE_LIMIT;
      if (!before && !after) break;
      if (after && (!before || boundaries[right] - quoteEnd <= quoteStart - boundaries[left])) right++;
      else left--;
    }
    return { start: boundaries[left], end: boundaries[right], partial: false };
  }
  // An unusually long sentence cannot fit whole. Preserve the complete matched
  // quote and nearby whole words, explicitly identifying the partial passage.
  if (quoteEnd - quoteStart > DIRECTOR_PASSAGE_LIMIT) throw new Error("Director evidence exceeds the bounded passage limit");
  const spare = DIRECTOR_PASSAGE_LIMIT - (quoteEnd - quoteStart);
  let start = Math.max(0, quoteStart - Math.floor(spare / 2));
  let end = Math.min(text.length, start + DIRECTOR_PASSAGE_LIMIT);
  start = Math.max(0, end - DIRECTOR_PASSAGE_LIMIT);
  while (start < quoteStart && start > 0 && !/\s/.test(text[start - 1])) start++;
  while (end > quoteEnd && end < text.length && !/\s/.test(text[end])) end--;
  return { start, end, partial: true };
}

/** Select original source context only from this scene's validated citations. */
export function directorEvidenceContext(sources: Research, sceneEvidence: unknown, sceneId: string): DirectorEvidenceContext {
  const scenes = sceneEvidenceSchema.parse(sceneEvidence);
  if (new Set(scenes.map(scene => scene.sceneId)).size !== scenes.length) throw new Error("Director evidence scene IDs must be unique");
  if (new Set(sources.map(source => source.id)).size !== sources.length) throw new Error("Director evidence source IDs must be unique");
  const scene = scenes.find(scene => scene.sceneId === sceneId);
  if (!scene) throw new Error("Missing cited evidence for the scene to direct");
  return { sceneId, sources: scene.evidence.map(evidence => {
    const source = sources.find(source => source.id === evidence.sourceId);
    if (!source) throw new Error("Director evidence refers to an unknown source");
    const [quoteStart, quoteEnd] = quoteSpan(source.text, evidence.quote);
    const { start, end, partial } = passageSpan(source.text, quoteStart, quoteEnd);
    return { id: source.id, title: source.title, url: source.url, text: source.text.slice(start, end), quote: source.text.slice(quoteStart, quoteEnd), offset: start, ...(partial ? { partial: true as const } : {}) };
  }) };
}

/** Explicit context must stay in scope and cannot substitute invented text. */
export function validateDirectorEvidenceContext(context: DirectorEvidenceContext, sources: Research, sceneId: string) {
  if (context.sceneId !== sceneId || !context.sources.length || context.sources.length > 2) throw new Error("Wrong director evidence scope");
  for (const passage of context.sources) {
    const source = sources.find(source => source.id === passage.id);
    if (!source || source.title !== passage.title || source.url !== passage.url || !Number.isInteger(passage.offset) || passage.offset < 0 || !passage.text.length || passage.text.length > DIRECTOR_PASSAGE_LIMIT || source.text.slice(passage.offset, passage.offset + passage.text.length) !== passage.text || !passage.quote.trim() || !passage.text.includes(passage.quote)) throw new Error("Director context must preserve its original cited source");
  }
  return context;
}
