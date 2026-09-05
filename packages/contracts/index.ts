export const PIPELINE_STAGES = [
  { id: "researching", label: "Research", description: "Find reliable sources" },
  { id: "planning", label: "Storyboard", description: "Give the idea a visual structure" },
  { id: "rendering", label: "Animate", description: "Draw, narrate, and synchronize" },
  { id: "reviewing", label: "Review", description: "Check the explanation and visuals" },
] as const;

export const DURATION_PRESETS = [60, 75, 90] as const;
export const LIMITS = {
  topicMin: 8,
  topicMax: 500,
  jobsPerSessionPerDay: 5,
  jobsPerDay: 50,
  maxQueued: 20,
  sessionLifetimeMs: 7 * 24 * 60 * 60 * 1000,
} as const;

export function normalizeTopic(topic: string): string {
  const clean = topic.replace(/\s+/g, " ").trim();
  if (clean.length < LIMITS.topicMin || clean.length > LIMITS.topicMax) {
    throw new Error(`Use ${LIMITS.topicMin}–${LIMITS.topicMax} characters for your question.`);
  }
  return clean;
}
