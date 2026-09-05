/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as generation from "../generation.js";
import type * as http from "../http.js";
import type * as icons from "../icons.js";
import type * as jobs from "../jobs.js";
import type * as lib_generationConfig from "../lib/generationConfig.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_providers from "../lib/providers.js";
import type * as lib_session from "../lib/session.js";
import type * as media from "../media.js";
import type * as planning from "../planning.js";
import type * as serviceReadiness from "../serviceReadiness.js";
import type * as sessions from "../sessions.js";
import type * as testFixtures from "../testFixtures.js";
import type * as workers from "../workers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  generation: typeof generation;
  http: typeof http;
  icons: typeof icons;
  jobs: typeof jobs;
  "lib/generationConfig": typeof lib_generationConfig;
  "lib/limits": typeof lib_limits;
  "lib/providers": typeof lib_providers;
  "lib/session": typeof lib_session;
  media: typeof media;
  planning: typeof planning;
  serviceReadiness: typeof serviceReadiness;
  sessions: typeof sessions;
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
