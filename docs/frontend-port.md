# Chalk frontend port

The owner requested the frontend design and UX from `F:\wbev` for this project. The source project was read without modifying it. The port retains this project's Convex contracts, anonymous workspace token, lesson IDs, provider selection and review/delivery gates.

## Design and routes

- `/`: Chalk's handwritten landing treatment, subtle graph-paper background, yellow accents, outlined cards, house illustrations and supplied studio screenshot. The demo links to this project's existing qualified solar example.
- `/chalk/`: the source's clean chat layout, iris brand mark, desktop sidebar/collapsed rail, mobile navigation drawer, centered prompt composer, suggestion pills and lesson thread.
- `/chalk/?view=gallery`: searchable completed videos belonging to the current browser workspace, using real poster/video records.
- `/showcase/`: operator-published examples from the existing showcase API.
- Existing `/?job=…`, root gallery/chat bookmarks and `/lesson/index.html?...` remain functional. Browser back/forward observes URL selection. New chat on a legacy root bookmark keeps the workspace open with `?view=chat`.

Convex's static host returns the root document for pretty paths. `HomeEntry` also resolves `/chalk/` and `/showcase/` from the browser location so direct visits and refreshes select the intended screen without a backend routing change.

The font, screenshot and sixteen UI illustrations are copied from the supplied project. UI primitives and Tailwind styles follow its implementation. Source/font/artwork notices are linked from `ATTRIBUTIONS.md`.

## Backend behavior preserved

The composer keeps NIM + Workers AI as the default and OpenAI as a separately selected route. Missing setup and model-check failures surface as toasts before a new lesson is created. OpenAI remains intentionally disabled. Duration/audience controls live in the composer; Enter submits, Shift+Enter inserts a line and IME composition does not submit. Duplicate clicks are fenced and retrying an uncertain create reuses the request ID.

Threads show actual pipeline stages, source links, rendered media, review findings, supported retries and scene edits. Share/email actions remain gated by approval and explicit recipient consent. The gallery is private to the browser workspace; it does not publish lessons.

Only supported source interactions were mapped. Account controls, HLS previews and exact queue percentages are not presented because this backend does not provide them. Video output stays 16:9 with a clean canvas; the landing page's graph-paper styling is confined to the frontend.

## Verification

Browser verification covered the landing page and studio at desktop and 390-pixel mobile sizes, sidebar collapse, drawer focus/Escape cleanup, gallery navigation, old job URLs, new-chat routing, multiline input and the disabled OpenAI submission path. The OpenAI attempt showed the setup toast and created no lesson. The mobile drawer released background inert state and restored focus to its trigger. No new model inference, email or public lesson publication was performed for the frontend checks.

A temporary local fixture additionally checked populated history search, completed/failed lesson states and delayed requests. Completion preserved a newer draft and respected gallery navigation; an unchanged request opened its new thread normally. The fixture route was removed before the release build. The legacy About Chalk link uses full navigation because Next's same-page link transition did not notify the custom query-string store in the browser check.

Local `npm run check` passed on September 6, 2026: all 4,818 assets verified, TypeScript and ESLint passed, 305 isolated tests passed across 31 files, and web/worker builds completed. The source font, favicon and UI images are included in the static export. Frontend deployment uses the production Convex URL through the existing build script and `--skip-convex`; no media-worker rollout is required for this UI port.

The frontend was published to the existing production Convex site. Browser checks loaded existing private lesson history, a completed lesson with its review/share/recipient-consent controls, the private gallery and the public solar lesson with five sources. The live disabled-OpenAI submission displayed its setup toast and left history unchanged. The port commit `792f3ad` also passed the Vercel Git integration's full clean-install validation.

This port is a frontend change. It does not establish reference-level video quality or close the open live-provider and hackathon acceptance items in the existing evidence records.
