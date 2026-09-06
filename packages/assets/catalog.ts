import manifest from "./catalog.json";

export type LessonAsset = {
  id: string;
  label: string;
  concept: string;
  synonyms: string[];
  family: "sketch" | "openmoji" | "iconify";
  style: "sketch" | "flat";
  file: string;
  width: number;
  height: number;
  sha256: string;
  source: string;
  originalId: string;
  license: string;
  attribution: string;
};

export const ASSET_CATALOG_VERSION = manifest.version;
export const LESSON_ASSETS: readonly LessonAsset[] = manifest.entries as LessonAsset[];
const byId = new Map(LESSON_ASSETS.map(asset => [asset.id, asset]));
export function getLessonAsset(id: string | undefined): LessonAsset | undefined {
  return id ? byId.get(id) : undefined;
}
