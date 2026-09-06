import { readFile, writeFile, mkdir, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { inspectAssetSvg } from "./asset-validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawRoot = await realpath(path.resolve(root, process.argv[2] || "assets"));
const output = path.join(root, "public", "lesson-assets");
const catalogPath = path.join(root, "packages", "assets", "catalog.json");
const hash = value => createHash("sha256").update(value).digest("hex");
const clean = value => String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 180);
const slug = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 62);
const resolveRaw = async relative => {
  const file = await realpath(path.resolve(rawRoot, relative.replace(/^assets[\\/]/, "")));
  if (!file.startsWith(`${rawRoot}${path.sep}`)) throw new Error("Asset source escapes the supplied asset folder");
  return file;
};
const json = async relative => JSON.parse(await readFile(await resolveRaw(relative), "utf8"));
const registry = await json("vendor/openmoji/registry.json");
const custom = await json("generated/icon-library/manifest.json");
const candidates = [];
for (const entry of registry.entries) candidates.push({ family: "openmoji", style: "flat", originalId: clean(entry.id), label: clean(entry.label), concept: clean(entry.label), synonyms: (entry.concepts || []).map(clean), source: entry.colorSvgPath, license: clean(entry.license || "License not supplied"), attribution: `OpenMoji${entry.author ? `; ${clean(entry.author)}` : ""}` });
for (const entry of custom.entries) candidates.push({ family: "sketch", style: "sketch", originalId: clean(entry.id), label: clean(entry.label || entry.concept), concept: clean(entry.concept || entry.label), synonyms: (entry.synonyms || []).map(clean), source: entry.svgPath, license: clean(entry.license || "License not supplied by the source catalog"), attribution: clean(entry.attribution || "User-provided generated illustration") });
const knownCustom = new Set(custom.entries.map(entry => path.basename(entry.svgPath)));
for (const filename of (await readdir(path.join(rawRoot, "generated", "icon-library", "svg"))).sort()) {
  if (!filename.endsWith(".svg") || knownCustom.has(filename)) continue;
  const name = filename.slice(0, -4);
  candidates.push({ family: "sketch", style: "sketch", originalId: name, label: name.replaceAll("-", " "), concept: name.replaceAll("-", " "), synonyms: [], source: `assets/generated/icon-library/svg/${filename}`, license: "License not supplied by the source catalog", attribution: "User-provided generated illustration; no current catalog entry" });
}
for (const filename of (await readdir(path.join(rawRoot, "generated", "iconify"))).sort()) {
  if (!filename.endsWith(".svg")) continue;
  const name = filename.slice(0, -4), separator = name.indexOf("_");
  const label = name.slice(separator + 1).replace(/-\d+(?:-(?:filled|regular))?$/, "").replaceAll("-", " ");
  candidates.push({ family: "iconify", style: "flat", originalId: name, label, concept: label, synonyms: [], source: `assets/generated/iconify/${filename}`, license: "License not supplied by the source folder", attribution: `User-provided Iconify asset (${separator >= 0 ? name.slice(0, separator) : "unknown collection"})` });
}
await mkdir(output, { recursive: true });
await mkdir(path.dirname(catalogPath), { recursive: true });
const entries = [], rejected = [];
for (const candidate of candidates) {
  try {
    const bytes = await readFile(await resolveRaw(candidate.source));
    const dimensions = inspectAssetSvg(bytes.toString("utf8"));
    const sha256 = hash(bytes), id = `${candidate.family}-${slug(candidate.originalId.replace(/^openmoji\./, ""))}-${sha256.slice(0, 12)}`;
    const file = `${id}.svg`;
    const record = { id, ...candidate, synonyms: [...new Set(candidate.synonyms.filter(Boolean))].slice(0, 32), file, ...dimensions, sha256 };
    // Byte-identical copies preserve the source illustration and its original metadata.
    await writeFile(path.join(output, file), bytes);
    entries.push(record);
  } catch (error) { rejected.push({ source: candidate.source, reason: error.message }); }
}
entries.sort((a, b) => a.id.localeCompare(b.id, "en"));
if (!entries.length || new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error("Empty or ambiguous asset catalog");
const version = `wbev-${hash(JSON.stringify(entries)).slice(0, 16)}`;
const manifest = { version, source: "User-supplied asset folder; static SVG subset", entries };
await writeFile(catalogPath, JSON.stringify(manifest, null, 2) + "\n");
await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const report = { version, imported: entries.length, families: Object.fromEntries(["sketch", "openmoji", "iconify"].map(family => [family, entries.filter(entry => entry.family === family).length])), rejected, ignored: "Raster counterparts, font/query caches, and historical embedding indexes remain in the original local snapshot. They are not runtime assets." };
await writeFile(path.join(root, "packages", "assets", "import-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
