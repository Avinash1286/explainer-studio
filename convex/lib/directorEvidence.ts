import { z } from "zod";
import type { Research } from "../../packages/contracts/generation";

// Keep authored citations, then optionally retrieve two additional passages
// from narration. Full research still goes to the independent factual reviewer.
export const DIRECTOR_PASSAGE_LIMIT = 700;
export const DIRECTOR_SUPPLEMENT_LIMIT = 2;
const sceneEvidenceSchema = z.array(z.object({
  sceneId: z.string().min(1),
  evidence: z.array(z.object({ sourceId: z.string().min(1), quote: z.string().min(20).max(240) }).strict()).min(1).max(2),
}).strict()).min(1).max(8);

type Passage = Research[number] & { quote: string; offset: number; partial?: true; selection?: "narration" };
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

function sentenceBoundaries(text: string) {
  const boundaries = [0];
  for (const match of text.matchAll(/[.!?]["')\]]*\s+|\n+/g)) boundaries.push(match.index + match[0].length);
  if (boundaries.at(-1) !== text.length) boundaries.push(text.length);
  return boundaries;
}

function passageSpan(text: string, quoteStart: number, quoteEnd: number) {
  // Sentence/paragraph boundaries preserve qualifications next to an authored
  // quote, including quotes that authoring shortened at a word boundary.
  const boundaries = sentenceBoundaries(text);
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

// Language-only normalization for retrieval; never used to reconstruct source
// text. No topic vocabulary, source preference, synonyms or factual rules.
const STOP_WORDS = new Set("a an and are as at be been being but by can could did do does for from had has have he her hers him his how i if in into is it its itself may might more most must no not of on only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up us very was we were what when where which while who will with would you your".split(" "));
function terms(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}]{3,}/gu) || []).filter(word => !STOP_WORDS.has(word)).map(word => {
    if (/ies$/.test(word) && word.length > 4) word = `${word.slice(0, -3)}y`;
    else if (/s$/.test(word) && !/(ss|us|is)$/.test(word) && word.length > 3) word = word.slice(0, -1);
    if (word.length > 5 && /(ing|ed)$/.test(word)) {
      word = word.replace(/(ing|ed)$/, "");
      if (/([b-df-hj-np-tv-z])\1$/.test(word)) word = word.slice(0, -1);
    }
    return word.length > 4 ? word.replace(/e$/, "") : word;
  }));
}
const normalizedText = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
type RetrievalUnit = { source: Research[number]; sourceIndex: number; start: number; end: number; partial: boolean; terms: Set<string> };

function retrievalUnits(sources: Research): RetrievalUnit[] {
  return sources.flatMap((source, sourceIndex) => {
    const boundaries = sentenceBoundaries(source.text), units: RetrievalUnit[] = [];
    for (let i = 1; i < boundaries.length; i++) {
      const sentenceEnd = boundaries[i];
      let start = boundaries[i - 1];
      const partial = sentenceEnd - start > DIRECTOR_PASSAGE_LIMIT;
      // Very long sentences are split at whole words; offset slices remain
      // verbatim and explicitly partial, never assembled from disjoint text.
      while (start < sentenceEnd) {
        let end = Math.min(sentenceEnd, start + DIRECTOR_PASSAGE_LIMIT);
        if (end < sentenceEnd) {
          while (end > start && !/\s/.test(source.text[end])) end--;
          if (end === start) break; // A single overlong token is not evidence.
        }
        const text = source.text.slice(start, end);
        if (text.trim().length >= 20) units.push({ source, sourceIndex, start, end, partial, terms: terms(text) });
        start = end;
        while (start < sentenceEnd && /\s/.test(source.text[start])) start++;
      }
    }
    return units;
  });
}

function supplementalPassage(unit: RetrievalUnit, selected: Passage[]): Passage | undefined {
  const { source } = unit, anchor = source.text.slice(unit.start, unit.end);
  // Do not spend a retrieval slot repeating a citation or a previously selected
  // sentence, even when the same text was syndicated by another source.
  if (selected.some(passage => normalizedText(passage.text).includes(normalizedText(anchor)))) return;
  if (selected.some(passage => passage.id === source.id && unit.start < passage.offset + passage.text.length && unit.end > passage.offset)) return;
  const span = unit.partial ? { start: unit.start, end: unit.end, partial: true } : passageSpan(source.text, unit.start, unit.end);
  // Preserve the ranked sentence and adjacent qualifications without repeating
  // an existing same-source passage in the expanded context.
  for (const passage of selected.filter(passage => passage.id === source.id)) {
    if (passage.offset + passage.text.length <= unit.start) span.start = Math.max(span.start, passage.offset + passage.text.length);
    if (passage.offset >= unit.end) span.end = Math.min(span.end, passage.offset);
  }
  let quoteEnd = Math.min(unit.end, unit.start + 240);
  while (quoteEnd > unit.start && quoteEnd < unit.end && !/\s/.test(source.text[quoteEnd])) quoteEnd--;
  if (quoteEnd === unit.start) return;
  return { id: source.id, title: source.title, url: source.url, text: source.text.slice(span.start, span.end), quote: source.text.slice(unit.start, quoteEnd), offset: span.start, selection: "narration", ...(span.partial ? { partial: true as const } : {}) };
}

function supplement(sources: Research, cited: Passage[], narration: string): Passage[] {
  const query = terms(narration);
  if (query.size < 2) return [];
  const units = retrievalUnits(sources), frequency = new Map<string, number>(), distinct = new Set<string>();
  // IDF is over distinct sentences, so repeated site boilerplate cannot inflate
  // a term's importance. Two matching informative terms are required.
  for (const unit of units) {
    const identity = normalizedText(unit.source.text.slice(unit.start, unit.end));
    if (distinct.has(identity)) continue;
    distinct.add(identity);
    for (const term of unit.terms) frequency.set(term, (frequency.get(term) || 0) + 1);
  }
  const matches = units.map(unit => ({ unit, matched: [...query].filter(term => unit.terms.has(term)) })).filter(candidate => candidate.matched.length >= 2);
  const added: Passage[] = [];
  while (added.length < DIRECTOR_SUPPLEMENT_LIMIT) {
    const selected = [...cited, ...added], covered = new Set(selected.flatMap(passage => [...terms(passage.text)]));
    const ranked = matches.map(candidate => ({ ...candidate, score: candidate.matched.reduce((sum, term) => sum + (1 + Math.log((distinct.size + 1) / ((frequency.get(term) || 0) + 1))) * (covered.has(term) ? 1 : 1.5), 0) / Math.sqrt(1 + candidate.unit.terms.size / 25) }));
    ranked.sort((a, b) => b.score - a.score || a.unit.sourceIndex - b.unit.sourceIndex || a.unit.start - b.unit.start);
    let next: Passage | undefined;
    for (const candidate of ranked) {
      next = supplementalPassage(candidate.unit, selected);
      if (next) break;
    }
    if (!next) break;
    added.push(next);
  }
  return added;
}

/** Retain this scene's citations and retrieve bounded narration context. */
export function directorEvidenceContext(sources: Research, sceneEvidence: unknown, sceneId: string, narration?: string): DirectorEvidenceContext {
  const scenes = sceneEvidenceSchema.parse(sceneEvidence);
  if (new Set(scenes.map(scene => scene.sceneId)).size !== scenes.length) throw new Error("Director evidence scene IDs must be unique");
  if (new Set(sources.map(source => source.id)).size !== sources.length) throw new Error("Director evidence source IDs must be unique");
  const scene = scenes.find(scene => scene.sceneId === sceneId);
  if (!scene) throw new Error("Missing cited evidence for the scene to direct");
  const cited: Passage[] = scene.evidence.map(evidence => {
    const source = sources.find(source => source.id === evidence.sourceId);
    if (!source) throw new Error("Director evidence refers to an unknown source");
    const [quoteStart, quoteEnd] = quoteSpan(source.text, evidence.quote);
    const { start, end, partial } = passageSpan(source.text, quoteStart, quoteEnd);
    return { id: source.id, title: source.title, url: source.url, text: source.text.slice(start, end), quote: source.text.slice(quoteStart, quoteEnd), offset: start, ...(partial ? { partial: true as const } : {}) };
  });
  return validateDirectorEvidenceContext({ sceneId, sources: [...cited, ...(narration ? supplement(sources, cited, narration) : [])] }, sources, sceneId);
}

/** Explicit context must stay in scope and cannot substitute invented text. */
export function validateDirectorEvidenceContext(context: DirectorEvidenceContext, sources: Research, sceneId: string) {
  const cited = context.sources.filter(passage => passage.selection === undefined), supplemental = context.sources.filter(passage => passage.selection === "narration");
  if (context.sceneId !== sceneId || cited.length < 1 || cited.length > 2 || supplemental.length > DIRECTOR_SUPPLEMENT_LIMIT || cited.length + supplemental.length !== context.sources.length) throw new Error("Wrong director evidence scope");
  for (const passage of context.sources) {
    const source = sources.find(source => source.id === passage.id);
    if (!source || source.title !== passage.title || source.url !== passage.url || !Number.isInteger(passage.offset) || passage.offset < 0 || !passage.text.length || passage.text.length > DIRECTOR_PASSAGE_LIMIT || source.text.slice(passage.offset, passage.offset + passage.text.length) !== passage.text || !passage.quote.trim() || !passage.text.includes(passage.quote)) throw new Error("Director context must preserve its original cited source");
  }
  return context;
}
