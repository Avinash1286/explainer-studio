# Supplied asset library — 0.8.0

The owner requested a complete copy of `F:\wbev\assets` and relevant use of its artwork in the lesson pipeline. The source remains unchanged. The local copy at `F:\cai\explainer-studio\assets` contains all **5,172 files / 241,919,524 bytes**; every relative path, size and SHA-256 matches the source. The local verification receipt is `runs/asset-import/copy-verification.json`.

The runtime catalog contains **4,818 static SVGs**: 194 generated sketches, 4,493 OpenMoji graphics and 131 Iconify graphics. Catalog version: `wbev-61babac4937cc309`. Published SVG bytes match the supplied originals. Two malformed flag SVGs remain in the complete local copy but are excluded from selection; `packages/assets/import-report.json` records their paths and validation failures.

## How the pipeline uses them

1. Each scene's title, researched narration, concepts and requested correction retrieve up to 16 relevant candidates. Matching uses phrases, narrow synonyms and token coverage; it deduplicates equivalent artwork and prefers the sketch treatment for the same subject. Broad metadata tags alone cannot establish relevance. No extra provider call or embedding key is needed.
2. The visual director receives those candidates' IDs, subjects, styles and dimensions. It may choose a candidate when it fits the explanation or use native visual kinds when they express a mechanism better. IDs outside the shortlist are rejected; an existing scene's selected IDs remain available during its repair. The original source metadata is descriptive data, not an instruction or research evidence.
3. Selected assets use the bounded `asset` visual kind. Proportions and source colors are preserved. Artwork supports progressive wipe reveals and whole-object motion/emphasis. It does not support synthetic counts, charge/state variants, interior child components or state transformations; those need explicit native diagrams. This is a static artwork reveal, not traced stroke animation.
4. Before synthesizing speech, the media worker resolves only selected catalog IDs, verifies their local file paths and SHA-256 hashes, and passes isolated SVG image data to Remotion. Missing, altered or undecodable files fail explicitly. Models cannot supply SVG, a filesystem path or a remote image URL.
5. Pixel and factual reviewers receive the selected artwork's catalog identity. Relabeling biological cell art as a solar cell cannot hide its identity from review. The existing factual and visual gates remain required.
6. Per-scene director provenance records the catalog version, candidate IDs and selected IDs, including repairs. Exported `project.json` includes `assetManifest`, with each selected asset's identity, dimensions, hash, source path, attribution and supplied license. The worker also writes `asset-manifest.json` locally. Attribution and captions remain outside the clean video canvas.

The NVIDIA NIM + Cloudflare and OpenAI routes use the same bounded catalog without switching providers. OpenAI remains intentionally disabled in the current operator configuration.

## Files and maintenance

- `assets/`: complete ignored local snapshot, including original indexes, caches, raster counterparts and fonts.
- `packages/assets/catalog.json`: portable runtime metadata; `catalog.ts` and `search.ts` provide lookup and relevance matching.
- `public/lesson-assets/`: checksum-pinned SVGs and a matching downloadable manifest, included in worker deployment. The web build removes individual SVG copies from generated `out/` only; the browser receives videos, the catalog and credits. This stays within Convex hosting's 1,800-file limit while preserving every source file for the worker.
- `scripts/import-lesson-assets.mjs`: repeatable importer from the local snapshot; `scripts/asset-validation.mjs` validates static SVG structure.
- `scripts/verify-lesson-assets.mjs`: verifies every runtime file and catalog without needing the original source folder.

```sh
npm run assets:import
npm run assets:verify
npm run check
```

Import defaults to the project's `assets/` folder; an optional positional argument supplies another snapshot directory. Review catalog changes before publishing a reimport. Preserve historical catalog entries and files if previously generated projects still reference them. A clean checkout needs only the committed runtime files, not `F:\wbev\assets`.

Historical query caches and embedding indexes are not used or published. They contain incompatible models/dimensions and stale entries. Raster files are unnecessary for the SVG renderer (the supplied `.png` counterparts contain JPEG data). Copied fonts are retained in the snapshot; the renderer continues to use its existing Kalam lettering.

The source provides CC BY-SA 4.0 attribution metadata for OpenMoji. The sketch/Iconify source metadata does not supply license terms, and the manifest records this honestly. See `ATTRIBUTIONS.md`; the application's license does not replace artwork terms.

## Verification and rollout

The import verifies all runtime SVGs for static structure, local references, file integrity and dimensions. Regression tests exercise actual-catalog relevance, shortlist enforcement, provider isolation, repair provenance, reviewer identity, asset decoding inputs, aspect ratios, missing/tampered files and worker protocol fencing. `npm run check` includes the asset verifier, TypeScript, ESLint, tests and both builds.

Asset jobs require worker **protocol 7**, capability `library-assets-v1` and the bundled catalog. Native directed jobs retain protocol 6 compatibility. Upgrade the backend's protocol/heartbeat handling and worker together: the previous HTTP handler rejects the new nine-capability heartbeat, so it must be upgraded before the new worker's readiness check can pass. Asset jobs wait for a compatible worker rather than being claimed by an older renderer. `zerops.yaml` verifies and ships the runtime catalog. Existing rendered MP4s remain unchanged.

September 6 verification: `npm run check` passed all **305 tests across 31 files**, the complete asset verifier, TypeScript, ESLint and both builds. All 4,818 staged Git blobs also match their catalog hashes; no raw snapshot, cache or operator configuration is staged. Development functions deployed successfully at 11:06 Nepal time.

The local deterministic integration preview at `runs/asset-import/asset-render-smoke/video.mp4` rendered three relevant subjects selected from real retrieval results: sketch abacus, OpenMoji microscope and Iconify prism. Its 548 frames are 1280×720 at 24 fps (22.833 seconds); H.264 video and AAC audio decode correctly. Six decoded frames were inspected during reveals and after motion. Colors/proportions are preserved and there are no fixed headers, footers or credits. Its selected manifest matches the exported project. The preview's narration and visual plans were hand-authored; its attribution metadata alone was updated after the render began, without changing the video. Exact commands, selection records and inspection notes remain in the ignored run folder.

One bounded live NIM director check offered the real scene shortlist without any previous visual plan. Kimi K3 did not return an HTTP response within the 150-second deadline. No fallback/retry was used and no model-selected IDs were accepted; live model selection therefore remains unverified. Sanitized input/result/provenance are in `runs/asset-import/live-director-*`. OpenAI was not called.

The initial website upload found Convex hosting's 1,800-file limit. The web build now retains 73 website files (including asset metadata and credits), while all 4,818 SVGs remain intact in the worker library. The corrected build, asset verification and build-script lint passed. This changes deployment packaging only.

This asset integration is separate from the unresolved provider-generated reference-quality acceptance recorded in `visual-acceptance-070.md`; a deterministic integration preview does not establish that acceptance. Production rollout is recorded below when verified.
