import type { VisualPlan } from "../packages/contracts/visual";

/** Synthetic plans for schema/routing tests only; never used as real direction. */
export function syntheticVisualPlan(narration: string): VisualPlan {
  const words = narration.toLowerCase().match(/[a-z0-9]+/g)!;
  const early = words.slice(0, 2).join(" "), later = words.slice(Math.floor(words.length * 0.55), Math.floor(words.length * 0.55) + 2).join(" ");
  return {
    version: 1, grammar: "mechanism", objective: "Show a synthetic supported change across two narrated stages.",
    entities: [
      { id: "water", kind: "beaker", label: "Water", x: 26, y: 55, w: 28, h: 30, color: "blue", enter: 0, cue: early },
      { id: "vapor", kind: "molecule", label: "Vapor", x: 68, y: 35, w: 22, h: 24, color: "blue", enter: 0.35, cue: later },
    ],
    relations: [{ id: "water-to-vapor", from: "water", to: "vapor", label: "changes", type: "flow", color: "blue", curve: 0.2, enter: 0.15, cue: early }],
    beats: [
      { id: "water-changes", target: "water", action: "transform", at: 0.05, duration: 0.2, cue: early, value: 0, meaning: "The initial material visibly changes state." },
      { id: "vapor-rises", target: "vapor", action: "move", at: 0.55, duration: 0.2, cue: later, x: 68, y: 24, meaning: "The material moves to the later illustrated state." },
    ],
  };
}
