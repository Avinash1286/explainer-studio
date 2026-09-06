import { LESSON_ASSETS, type LessonAsset } from "./catalog";

export type AssetQuery = { narration: string; title?: string; concepts?: readonly string[]; correction?: string };

// Linguistic aliases only: these do not infer causes, unseen structures, or
// factual equivalence between parts (a solar cell is not a whole panel).
const phraseAliases = [
  ["solar panel", "photovoltaic panel", "pv panel"],
  ["solar cell", "photovoltaic cell", "pv cell"],
  ["light bulb", "lightbulb", "electric bulb"],
  ["mobile phone", "cell phone", "cellphone", "smartphone"],
  ["car", "automobile", "motor car"],
  ["bicycle", "bike", "cycle bicycle"],
  ["airplane", "aeroplane", "aircraft"],
  ["wind turbine", "wind generator"],
  ["electric battery", "battery"],
  ["carbon dioxide", "co2"],
  ["sunlight", "sun light", "sunshine"],
  ["rainfall", "rain"],
  ["heart rate", "heartbeat"],
  ["gear", "cogwheel", "cog wheel"],
  ["magnifying glass", "magnifier"],
  ["document", "document sheet"],
] as const;
const stopWords = new Set("a an the and or of to in on at for from with by as is are was were be been being it its this that these those into onto through about can will may when then than which who how does do did has have had their our your they them you we behind toward towards above below under over via scene show shows showing make makes use using illustration icon emoji sketch outline flat color colored black white small large basic simple symbol object vector hand drawn".split(" "));
const ambiguousTerms = new Set(["cell", "field", "current", "charge", "positive", "negative", "power", "surface", "state", "system"]);
// Imported "synonyms" include broad category/action tags. They help annotate
// artwork but do not make a cloud, shop, battery or plant the narrated subject.
const broadTags = new Set("electric electricity electrical electronic energy voltage water air plant leaf leave store storage data cool hot form process flow stage front back surface move movement ground natural science technology digital thing nature".split(" "));
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("sses")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}
const tokens = (text: string) => (text.replace(/([a-z])([A-Z])/g, "$1 $2").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]+/g) || []).map(stem);
const phrase = (text: string) => tokens(text).join(" ");
const contains = (text: string, term: string) => !!term && ` ${text} `.includes(` ${term} `);
const useful = (text: string) => [...new Set(tokens(text).filter(word => word.length > 1 && !stopWords.has(word)))];
const aliases = phraseAliases.map(group => group.map(phrase));
type IndexEntry = { asset: LessonAsset; phrases: { phrase: string; words: string[]; weight: number; synonym: boolean }[]; primaryWords: Set<string>; key: string };

function duplicateKey(asset: LessonAsset): string {
  // Tone/skin variants must not crowd out distinct subjects. Preserve gender
  // and colors because either can be part of a deliberate comparison.
  const clean = (asset.concept || asset.label).replace(/(?:medium[ -])?(?:light|dark|medium)[ -]skin[ -]tone/gi, "").replace(/skin[ -]tone/gi, "").replace(/[():,]/g, " ");
  const normalized = phrase(clean);
  const equivalent = aliases.find(group => group.includes(normalized));
  return equivalent?.[0] || normalized;
}
function buildIndex(catalog: readonly LessonAsset[]): IndexEntry[] {
  return catalog.map(asset => ({ asset, key: duplicateKey(asset), primaryWords: new Set([...useful(asset.label), ...useful(asset.concept)]), phrases: [
    { text: asset.label, weight: 1.2, synonym: false }, { text: asset.concept, weight: 1.1, synonym: false }, ...asset.synonyms.map(text => ({ text, weight: 0.7, synonym: true })),
  ].map(({ text, weight, synonym }) => ({ phrase: phrase(text), words: useful(text), weight, synonym })).filter(item => item.words.length) }));
}
const catalogIndex = buildIndex(LESSON_ASSETS);

/** Bounded lexical retrieval, with no network or embedding dependency. Empty
 * or unrelated queries return no candidates instead of filling with artwork. */
export function selectLessonAssets(query: AssetQuery, options: { limit?: number; catalog?: readonly LessonAsset[] } = {}): LessonAsset[] {
  const limit = Math.max(0, Math.min(16, Math.floor(options.limit ?? 16)));
  if (!limit) return [];
  const sections = [
    { text: query.title || "", weight: 1.25 },
    { text: query.narration, weight: 1 },
    { text: (query.concepts || []).join(". "), weight: 1.15 },
    { text: query.correction || "", weight: 1.1 },
  ].map(({ text, weight }) => {
    const normalized = phrase(text.slice(0, 6000));
    const expanded = aliases.filter(group => group.some(alias => contains(normalized, alias))).flat();
    return { phrase: normalized, terms: new Set(useful(text)), aliases: new Set(expanded), weight };
  });
  const index = options.catalog ? buildIndex(options.catalog) : catalogIndex;
  const tagFrequency = new Map<string, number>();
  for (const entry of index) for (const term of new Set(entry.phrases.filter(item => item.synonym).map(item => item.phrase))) tagFrequency.set(term, (tagFrequency.get(term) || 0) + 1);
  const ranked = index.map(entry => {
    let score = 0;
    for (const section of sections) {
      let best = 0;
      for (const term of entry.phrases) {
        const matches = term.words.filter(word => section.terms.has(word));
        const full = contains(section.phrase, term.phrase);
        const alias = section.aliases.has(term.phrase);
        if (term.synonym && term.words.length === 1 && !alias) {
          const word = term.words[0];
          if (broadTags.has(word) || (tagFrequency.get(term.phrase) || 0) > 8) continue;
          // A tag repeating one part of a multiword subject must not bypass
          // phrase coverage ("cloud" cannot mean "cloud with snow").
          if (entry.primaryWords.has(word) && entry.primaryWords.size > 1 && [...entry.primaryWords].filter(primary => section.terms.has(primary)).length / entry.primaryWords.size < 2 / 3) continue;
        }
        // "cell" alone does not retrieve a young/biological cell in a PV
        // explanation. Multiword subjects need meaningful phrase coverage.
        const distinctive = matches.some(word => !ambiguousTerms.has(word));
        const coverage = matches.length / term.words.length;
        if (!alias && (!matches.length || !distinctive || (!full && coverage < 2 / 3))) continue;
        const value = alias ? 85 + term.words.length * 12 : full ? 100 + Math.min(term.words.length, 5) * 15 : coverage * 65 + matches.length * 7;
        best = Math.max(best, value * term.weight);
      }
      score += best * section.weight;
    }
    return { ...entry, score };
  }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || Number(b.asset.style === "sketch") - Number(a.asset.style === "sketch") || a.asset.id.localeCompare(b.asset.id));
  const groups = new Map<string, typeof ranked[number]>();
  for (const entry of ranked) {
    const existing = groups.get(entry.key);
    // Prefer a sketch only within the same subject, never over a closer match
    // for a different subject. Exact artwork duplicates are also removed.
    if (!existing || (entry.asset.style === "sketch" && existing.asset.style !== "sketch")) groups.set(entry.key, entry);
  }
  const hashes = new Set<string>();
  return [...groups.values()].sort((a, b) => b.score - a.score || Number(b.asset.style === "sketch") - Number(a.asset.style === "sketch") || a.asset.id.localeCompare(b.asset.id)).filter(entry => {
    if (entry.asset.sha256 && hashes.has(entry.asset.sha256)) return false;
    if (entry.asset.sha256) hashes.add(entry.asset.sha256);
    return true;
  }).slice(0, limit).map(entry => entry.asset);
}
