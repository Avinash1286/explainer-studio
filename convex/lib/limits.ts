import { RateLimiter, DAY, HOUR } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";
import { LIMITS } from "../../packages/contracts";

export const limits = new RateLimiter(components.rateLimiter, {
  sessionJobs: { kind: "fixed window", rate: LIMITS.jobsPerSessionPerDay, period: DAY, start: 0 },
  allJobs: { kind: "fixed window", rate: LIMITS.jobsPerDay, period: DAY, start: 0 },
  sessions: { kind: "fixed window", rate: 100, period: HOUR, start: 0 },
  emailRequests: { kind: "fixed window", rate: 3, period: HOUR, start: 0 },
  allEmailRequests: { kind: "fixed window", rate: 50, period: HOUR, start: 0 },
  providerChecks: { kind: "fixed window", rate: 20, period: HOUR, start: 0 },
  allProviderChecks: { kind: "fixed window", rate: 300, period: HOUR, start: 0 },
  lessonResumes: { kind: "fixed window", rate: 5, period: HOUR, start: 0 },
  allLessonResumes: { kind: "fixed window", rate: 50, period: HOUR, start: 0 },
});
