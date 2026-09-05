# Continuous validation without GitHub Actions

Per the owner's request, GitHub Actions is disabled for this repository and its workflow file has been removed.

Vercel project `explainer-studio-checks`, under `avinash1286s-projects` on the Hobby plan, is connected directly to `Avinash1286/explainer-studio`. Git pushes trigger Vercel builds. `vercel.json` sets `npm ci` and `npm run check`, which runs TypeScript, lint, all unit/integration tests, frontend export and the media-worker build. Any failed command stops the deployment.

The output directory is `out`. This is a validation preview; the primary app and backend remain on Convex, with media execution on Zerops. Vercel receives only `NEXT_PUBLIC_CONVEX_URL`, never model-provider credentials or the media worker token. `.vercelignore` excludes local credentials, model environments, generated videos and caches. Automated GitHub comments are disabled through the Vercel Git setting; commit deployment/check status remains available.

Hobby is being used for this personal hackathon project. No paid plan or trial was enabled. Plan limits apply. Reference: https://vercel.com/docs/plans/hobby

To validate locally, run `npm run check`. To inspect remote builds, use the connected Vercel project dashboard or `vercel inspect <deployment-url> --logs`. Do not restore the old Actions workflow.
