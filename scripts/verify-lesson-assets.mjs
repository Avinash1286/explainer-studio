import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { inspectAssetSvg } from "./asset-validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = await realpath(path.join(root, "public", "lesson-assets"));
const manifest = JSON.parse(await readFile(path.join(root, "packages", "assets", "catalog.json"), "utf8"));
const published = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
if (JSON.stringify(manifest) !== JSON.stringify(published)) throw new Error("Runtime and downloadable asset catalogs differ");
const ids = new Set();
for (const asset of manifest.entries) {
  if (!/^[a-z][a-z0-9-]{0,99}$/.test(asset.id) || asset.file !== `${asset.id}.svg` || !/^[a-f0-9]{64}$/.test(asset.sha256) || ids.has(asset.id)) throw new Error("Invalid asset identity");
  ids.add(asset.id);
  const file = await realpath(path.join(directory, asset.file));
  if (!file.startsWith(`${directory}${path.sep}`)) throw new Error("Asset file escapes catalog directory");
  const bytes = await readFile(file);
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error(`Asset checksum mismatch: ${asset.id}`);
  const dimensions = inspectAssetSvg(bytes.toString("utf8"));
  if (dimensions.width !== asset.width || dimensions.height !== asset.height) throw new Error(`Asset aspect ratio mismatch: ${asset.id}`);
}
if (!ids.size) throw new Error("Asset catalog is empty");
console.log(`Verified ${ids.size} static SVG assets (${manifest.version}).`);
