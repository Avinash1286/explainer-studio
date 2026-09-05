import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
import { renderStill, selectComposition } from "@remotion/renderer";

const directory = path.resolve(process.argv[2] || "runs/fixture");
const project = JSON.parse(await readFile(path.join(directory, "project.json"), "utf8"));
const icons = {};
for (const id of new Set(project.scenes.flatMap(s => s.nodes.map(n => n.icon)))) icons[id] = await readFile(`public/openmoji/${id}.svg`, "utf8");
assert.equal(project.scenes.length, 3);
assert.deepEqual(new Set(project.scenes.map(s => s.layout)), new Set(["process", "comparison", "relationship"]));
assert.ok(project.durationInFrames / project.fps >= 20 && project.durationInFrames / project.fps <= 30);
let end = 0;
for (const scene of project.scenes) {
  assert.equal(scene.startFrame, end);
  assert.ok(scene.audioSeconds * project.fps + 8 < scene.durationInFrames);
  assert.ok(scene.words.length > 0);
  for (const cue of scene.cueFrames) assert.ok(cue >= 0 && cue + 36 < scene.durationInFrames);
  for (const word of scene.words) assert.ok(word.start >= 0 && word.end >= word.start && word.end <= scene.audioSeconds + 0.1);
  end += scene.durationInFrames;
}
assert.equal(end, project.durationInFrames);
const inputProps = { project, icons };
const serveUrl = path.join(directory, "bundle");
const composition = await selectComposition({ serveUrl, id: "Explainer", inputProps });
const frames = [project.scenes[1].startFrame + 60, 18, project.scenes[2].startFrame + 70, project.scenes[1].startFrame + 60];
const hashes = [];
for (const [index, frame] of frames.entries()) {
  const output = path.join(directory, `verification-${index}.png`);
  await renderStill({ serveUrl, composition, inputProps, frame, output, imageFormat: "png" });
  hashes.push(createHash("sha256").update(await readFile(output)).digest("hex"));
}
assert.equal(hashes[0], hashes[3], "Same frame must be identical after out-of-order requests");
const report = { passed: true, scenes: 3, durationSeconds: project.durationInFrames / project.fps, framesChecked: frames, identicalRepeatedFrame: hashes[0] === hashes[3], timingMethod: project.timingMethod };
await writeFile(path.join(directory, "verification.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
