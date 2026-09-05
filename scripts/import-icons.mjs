import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const icons = { "2600":"sun", "1F343":"leaf", "1F331":"seedling", "1F36C":"candy", "1F4A7":"water", "1F30D":"earth", "1F9EC":"dna", "1F9E0":"brain", "1F50B":"battery", "1F4A1":"light bulb", "2699":"gear", "1F9EA":"test tube", "1F321":"thermometer", "1F52C":"microscope", "1F4DA":"books", "1F31E":"sun face", "1F319":"moon", "2601":"cloud", "1F332":"tree", "1F33B":"sunflower", "1F41D":"bee", "1F98B":"butterfly", "1F3E0":"house", "1F697":"car" };
const response = await fetch("https://api.github.com/repos/hfg-gmuend/openmoji/commits/master");
if (!response.ok) throw new Error(`GitHub: ${response.status}`);
const { sha } = await response.json();
const entries = [];
await mkdir("public/openmoji", { recursive: true });
for (const [id, name] of Object.entries(icons)) {
  const url = `https://raw.githubusercontent.com/hfg-gmuend/openmoji/${sha}/color/svg/${id}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${id}: ${res.status}`);
  const svg = await res.text();
  if (!svg.includes("<svg") || /<script|<foreignObject|\bon\w+=|(?:href|src)\s*=/i.test(svg)) throw new Error(`Unsafe SVG: ${id}`);
  await writeFile(`public/openmoji/${id}.svg`, svg);
  entries.push({ id, name, file: `openmoji/${id}.svg`, source: url, sha256: createHash("sha256").update(svg).digest("hex"), license: "CC-BY-SA-4.0", author: "OpenMoji contributors", modified: false });
}
await writeFile("public/openmoji/manifest.json", JSON.stringify({ version: 1, revision: sha, entries }, null, 2));
console.log(`Imported ${entries.length} pinned OpenMoji assets at ${sha}`);
