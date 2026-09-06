import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type Job = FunctionReturnType<typeof api.jobs.list>[number];
export type JobStatus = Job["status"];
export type StudioView = "chat" | "gallery";

export const statusLabels: Record<JobStatus, string> = {
  queued: "Queued",
  researching: "Researching sources",
  planning: "Planning the lesson",
  rendering: "Rendering the video",
  reviewing: "Reviewing the lesson",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

export function isActive(status: JobStatus): boolean {
  return status !== "completed" && status !== "cancelled" && status !== "failed";
}
