import { z } from "zod";
import { issueSchema, reviewSchema } from "../../packages/contracts/review";

export function sceneReviewSchema(sceneId: string) {
  return reviewSchema.shape.scenes.element.extend({
    summary: z.string().min(1).max(400),
    sceneId: z.literal(sceneId),
    issues: z.array(issueSchema.extend({ sceneId: z.literal(sceneId) })).max(8),
  }).strict();
}

export type SceneReview = z.infer<ReturnType<typeof sceneReviewSchema>>;
export type ProseCompaction = { original: SceneReview; changedFields: string[] };
const TRUNCATED = " … [truncated; full text retained]";

function shorten(text: string, limit: number) {
  if (text.length <= limit) return text;
  const prefix = text.slice(0, limit - TRUNCATED.length);
  const sentence = [...prefix.matchAll(/[.!?](?:\s|$)/g)].at(-1);
  const sentenceEnd = sentence ? sentence.index! + 1 : -1;
  const wordEnd = prefix.search(/\s+\S*$/);
  // Prefer a complete sentence, then a whole word. A single very long word
  // still has a deterministic bound without splitting a Unicode surrogate.
  const end = sentenceEnd >= prefix.length / 2 ? sentenceEnd : wordEnd > 0 ? wordEnd : prefix.length;
  return prefix.slice(0, end).replace(/[\uD800-\uDBFF]$/, "").trimEnd() + TRUNCATED;
}

function consistent(report: SceneReview) {
  if (((!report.factualPass || !report.visualPass) && !report.issues.length) || (report.issues.length > 0 && report.factualPass && report.visualPass)) throw new Error("Inconsistent scene review verdict");
}

/** Only prose ceilings are relaxed. IDs, booleans, issue count/order/kinds and
 * every other field remain strict; no finding is removed or reinterpreted. */
export function compactSceneReview(value: unknown, sceneId: string): { report: SceneReview; proseCompaction?: ProseCompaction } {
  const schema = sceneReviewSchema(sceneId);
  const prose = z.string().min(1).max(4000);
  const original = schema.extend({ summary: prose, issues: z.array(schema.shape.issues.element.extend({ detail: prose, repair: prose })).max(8) }).strict().parse(value);
  if (JSON.stringify(original).length > 24_000) throw new Error("Original scene review exceeds prose budget");
  consistent(original);
  const changedFields: string[] = [];
  const compact = (text: string, limit: number, path: string) => {
    if (text.length > limit) changedFields.push(path);
    return shorten(text, limit);
  };
  const report = schema.parse({
    ...original,
    summary: compact(original.summary, 400, "summary"),
    issues: original.issues.map((issue, index) => ({
      ...issue,
      detail: compact(issue.detail, 500, `issues.${index}.detail`),
      repair: compact(issue.repair, 500, `issues.${index}.repair`),
    })),
  });
  consistent(report);
  return { report, ...(changedFields.length ? { proseCompaction: { original, changedFields } } : {}) };
}

/** Checkpoints must reproduce the exact reported projection of their original
 * findings. A caller cannot attach different findings to a compact verdict. */
export function validateProseCompaction(value: unknown, report: SceneReview): ProseCompaction {
  const input = z.object({ original: z.unknown(), changedFields: z.array(z.string().max(40)).min(1).max(17) }).strict().parse(value);
  const expected = compactSceneReview(input.original, report.sceneId);
  if (!expected.proseCompaction || JSON.stringify(expected.report) !== JSON.stringify(report) || JSON.stringify(expected.proseCompaction.changedFields) !== JSON.stringify(input.changedFields)) throw new Error("Scene review prose evidence does not match its compact report");
  return expected.proseCompaction;
}
