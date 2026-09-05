import { expect, it } from "vitest";
import { fitNarration } from "../packages/contracts/timing";

it("fits the observed 44.725-second narration without exceeding the slowdown limit", () => {
  const result = fitNarration(44.725, 60, 4);
  expect(result.tempo).toBe(0.8);
  expect(result.holdSeconds).toBeCloseTo(1.0234375);
  expect(44.725 / result.tempo + 4 * result.holdSeconds).toBeCloseTo(60);
});
it("rejects speech needing excessive speed changes or long silent holds", () => {
  expect(() => fitNarration(100, 60, 4)).toThrow("safe timing");
  expect(() => fitNarration(20, 60, 4)).toThrow("safe timing");
  expect(fitNarration(60, 60, 4).holdSeconds).toBeCloseTo(0.7);
});
it("fits the observed repaired narration with bounded reading time", () => {
  const result = fitNarration(39, 60, 4);
  expect(result.tempo).toBe(0.8);
  expect(result.holdSeconds).toBeCloseTo(2.8125);
  expect(39 / result.tempo + 4 * result.holdSeconds).toBeCloseTo(60);
  expect(() => fitNarration(38, 60, 4)).toThrow("safe timing");
});
