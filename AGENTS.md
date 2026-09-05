<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project validation

Do not create or run GitHub Actions for this project. The owner has selected Vercel Git integration on the Hobby plan for automated validation. `vercel.json` runs `npm run check` before publishing its static validation preview. Keep the primary hackathon app on Convex hosting. Provider credentials belong only in Convex; Vercel receives the public Convex URL.

## Model providers

The owner now authorizes an explicit per-lesson choice between NVIDIA NIM + Cloudflare Workers AI (the default) and OpenAI. Persist the chosen route and use it for planning, factual/visual review and repairs without silently switching to the other route. Missing credentials or unavailable models must produce clear user-facing errors. Keep credentials server-side. Retain local Kokoro-82M TTS and deterministic Remotion rendering for both routes. Firecrawl research and AgentMail delivery are shared non-model services. Record real sponsor usage and acceptance evidence; an implemented integration alone does not prove live use or event eligibility.

## Visual direction

The owner explicitly requested substantially richer illustrated explanations matching the visual grammar of the local reference videos in `F:\cai\target`, on a clean canvas with no fixed header or footer. New lessons should use recognizable objects, meaningful relationships, progressive drawing and narration-aligned actions rather than repeated word-card slides. Do not add persistent collection titles, branding, scene counters, takeaway banners, credits or burned caption strips to the video canvas. Short subject labels and purposeful in-board headings are allowed. Keep captions and attribution available outside the canvas.

Use the bounded visual plan and original local illustration library; do not accept model-supplied SVG, executable drawing code or arbitrary remote artwork. Counts, charges, bonds, direction, proportion and motion must preserve the researched explanation. Inspect evolving sequences as well as end frames. Keep hand-authored calibration renders distinct from provider-generated output, and do not claim visual acceptance until a real generated lesson has been reviewed against the references. See `docs/visual-direction-070.md` for the fresh sampling record and acceptance criteria.
