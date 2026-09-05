/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as delivery from "../delivery.js";
import type * as generation from "../generation.js";
import type * as http from "../http.js";
import type * as icons from "../icons.js";
import type * as jobs from "../jobs.js";
import type * as lib_authoring from "../lib/authoring.js";
import type * as lib_critic from "../lib/critic.js";
import type * as lib_director from "../lib/director.js";
import type * as lib_directorEvidence from "../lib/directorEvidence.js";
import type * as lib_directorGlyphs from "../lib/directorGlyphs.js";
import type * as lib_directorLayout from "../lib/directorLayout.js";
import type * as lib_factCheck from "../lib/factCheck.js";
import type * as lib_generationConfig from "../lib/generationConfig.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_providers from "../lib/providers.js";
import type * as lib_repair from "../lib/repair.js";
import type * as lib_reviewCheckpoint from "../lib/reviewCheckpoint.js";
import type * as lib_reviewProse from "../lib/reviewProse.js";
import type * as lib_session from "../lib/session.js";
import type * as mailActions from "../mailActions.js";
import type * as mailWebhook from "../mailWebhook.js";
import type * as media from "../media.js";
import type * as planning from "../planning.js";
import type * as reviewActions from "../reviewActions.js";
import type * as reviews from "../reviews.js";
import type * as serviceReadiness from "../serviceReadiness.js";
import type * as sessions from "../sessions.js";
import type * as showcase from "../showcase.js";
import type * as testFixtures from "../testFixtures.js";
import type * as workers from "../workers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  delivery: typeof delivery;
  generation: typeof generation;
  http: typeof http;
  icons: typeof icons;
  jobs: typeof jobs;
  "lib/authoring": typeof lib_authoring;
  "lib/critic": typeof lib_critic;
  "lib/director": typeof lib_director;
  "lib/directorEvidence": typeof lib_directorEvidence;
  "lib/directorGlyphs": typeof lib_directorGlyphs;
  "lib/directorLayout": typeof lib_directorLayout;
  "lib/factCheck": typeof lib_factCheck;
  "lib/generationConfig": typeof lib_generationConfig;
  "lib/limits": typeof lib_limits;
  "lib/providers": typeof lib_providers;
  "lib/repair": typeof lib_repair;
  "lib/reviewCheckpoint": typeof lib_reviewCheckpoint;
  "lib/reviewProse": typeof lib_reviewProse;
  "lib/session": typeof lib_session;
  mailActions: typeof mailActions;
  mailWebhook: typeof mailWebhook;
  media: typeof media;
  planning: typeof planning;
  reviewActions: typeof reviewActions;
  reviews: typeof reviews;
  serviceReadiness: typeof serviceReadiness;
  sessions: typeof sessions;
  showcase: typeof showcase;
  testFixtures: typeof testFixtures;
  workers: typeof workers;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
