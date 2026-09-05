import type { Draft, Research } from "../packages/contracts/generation";
// Synthetic provider responses for isolated tests. Never used as production research.
const narration = [
  "The sun warms water in lakes and oceans. Some liquid water becomes vapor and enters the air. This change is called evaporation. The water keeps moving through the environment instead of disappearing.",
  "Water vapor can cool as air rises. Tiny drops gather to form a cloud. Liquid water and invisible vapor are different forms of the same substance, changing as energy moves between them.",
  "A cloud contains many tiny drops of water. These drops can combine and grow. When they become heavy enough, water falls as rain, bringing moisture back to the ground below the cloud.",
  "Rain reaches the ground and water flows into rivers, lakes and oceans. The sun can warm this water again. The cycle connects evaporation, clouds and rain through repeated changes and movements of water.",
];
const cues = [["sun", "water", "air"], ["water", "cloud"], ["cloud", "drops", "rain"], ["rain", "water", "sun"]];
export const testSources: Research = [
  { id: "source-1", title: "Synthetic water-cycle evidence A", url: "https://example.org/water", text: narration.join(" ") },
  { id: "source-2", title: "Synthetic water-cycle evidence B", url: "https://example.net/water", text: narration.join(" ") },
];
export const testDraft: Draft = {
  title: "How water moves through the environment",
  scenes: narration.map((text, i) => ({
    id: `water-${i}`, title: ["Water enters the air", "Vapor and drops", "Water falls as rain", "The cycle continues"][i],
    layout: i === 1 ? "comparison" : i === 2 ? "relationship" : "process", narration: text,
    nodes: cues[i].map(word => ({ concept: ({ air: "cloud", drops: "water", rain: "water" } as Record<string, string>)[word] || word, label: word, cue: word })),
    takeaway: "Water moves and changes form.", evidence: [{ sourceId: i % 2 ? "source-2" : "source-1", quote: text.slice(0, 70) }],
  })),
};
