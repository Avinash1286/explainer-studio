import { describe, expect, it } from "vitest";
import { directorInput } from "./lib/director";
import { projectSchema } from "../packages/contracts/scene";
import { goodReview, sampleProject } from "../tests/review-helpers";
import { syntheticVisualPlan } from "../tests/director-helpers";
import { testSources } from "./testFixtures";

describe("visible correction for a rejected animation", () => {
  const project = () => projectSchema.parse({ ...sampleProject, scenes: sampleProject.scenes.map(scene => ({ ...scene, visualPlan: syntheticVisualPlan(scene.narration) })) });

  it("rejects an unchanged animation and reviewer-note-only edits, but accepts a changed render parameter", () => {
    const previous = project(), scene = previous.scenes[0];
    const review = goodReview();
    review.scenes[0] = { sceneId: scene.id, factualPass: true, visualPass: false, issues: [{ sceneId: scene.id, kind: "layout", detail: "The label is obscured.", repair: "Move the annotation away from the material." }] };
    const input = directorInput(previous, testSources, scene.id, JSON.stringify(review));
    expect(() => input.validate(scene.visualPlan)).toThrow("animation is unchanged");
    expect(() => input.validate({ ...scene.visualPlan, objective: "New reviewer notes describe a proposed improvement.", beats: scene.visualPlan!.beats.map(beat => ({ ...beat, meaning: `${beat.meaning} Corrected.` })) })).toThrow("animation is unchanged");
    const changed = { ...scene.visualPlan, entities: scene.visualPlan!.entities.map((entity, i) => i === 1 ? { ...entity, x: entity.x + 2 } : entity) };
    expect(input.validate(changed).entities[1].x).toBe(changed.entities[1].x);
  });

  it("does not require a visual change for initial direction, factual-only reviews, or another scene's failure", () => {
    const previous = project(), scene = previous.scenes[0];
    expect(directorInput(previous, testSources, scene.id).validate(scene.visualPlan)).toEqual(scene.visualPlan);
    const review = goodReview();
    review.scenes[0] = { sceneId: scene.id, factualPass: false, visualPass: true, issues: [{ sceneId: scene.id, kind: "factual", detail: "Correct the spoken claim.", repair: "Correct the narration." }] };
    review.scenes[1] = { sceneId: previous.scenes[1].id, factualPass: true, visualPass: false, issues: [{ sceneId: previous.scenes[1].id, kind: "layout", detail: "An annotation overlaps.", repair: "Move the annotation." }] };
    expect(directorInput(previous, testSources, scene.id, JSON.stringify(review)).validate(scene.visualPlan)).toEqual(scene.visualPlan);
  });
});
