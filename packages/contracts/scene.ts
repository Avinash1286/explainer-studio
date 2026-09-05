import { z } from "zod";

export const FPS = 24;
export const FIXTURE_VERSION = "plant-energy-v1";
export const sceneSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  layout: z.enum(["process", "comparison", "relationship"]),
  title: z.string().min(1).max(64),
  narration: z.string().min(10).max(600),
  nodes: z.array(z.object({ icon: z.string().regex(/^[A-F0-9-]+$/), label: z.string().min(1).max(24), cue: z.string().min(1).max(24).optional() })).min(2).max(3),
  takeaway: z.string().max(90),
});
export const projectSchema = z.object({
  version: z.literal(1), id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/), title: z.string().min(1).max(100),
  targetDuration: z.number().min(60).max(90).optional(),
  origin: z.enum(["generated", "validation"]).optional(),
  voice: z.literal("af_heart"), speed: z.number().min(0.7).max(1.2),
  scenes: z.array(sceneSchema).min(3).max(8),
  sources: z.array(z.object({ title: z.string(), url: z.string().url() })).max(10),
});
export type Scene = z.infer<typeof sceneSchema>;
export type Project = z.infer<typeof projectSchema>;
export type TimedScene = Scene & { startFrame: number; durationInFrames: number; audioFile: string; audioSeconds: number; cueFrames: number[]; words: { text: string; start: number; end: number }[] };
export type RenderProject = Omit<Project, "scenes"> & { fps: number; width: number; height: number; durationInFrames: number; scenes: TimedScene[]; attribution: string; timingMethod: string };
