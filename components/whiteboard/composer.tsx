"use client";

import { useId, type FormEvent } from "react";
import { ArrowUp, Clock3, Ratio, SlidersHorizontal, Sparkles } from "lucide-react";
import { DURATION_PRESETS, LIMITS } from "@/packages/contracts";
import { PROVIDER_LABELS, type GenerationProvider } from "@/packages/contracts/provider";
import { Textarea } from "@/components/ui/textarea";

export type ProviderAvailability = Record<GenerationProvider, { enabled: boolean; message: string }>;
export function Composer({ prompt, onPromptChange, duration, onDurationChange, audience, onAudienceChange, provider, onProviderChange, providers, onSubmit, disabled, submitting, placeholder = "Ask Chalk to explain anything…", saveBriefOnly = false }: {
  prompt: string; onPromptChange: (value: string) => void;
  duration: number; onDurationChange: (value: number) => void;
  audience: "beginner" | "student"; onAudienceChange: (value: "beginner" | "student") => void;
  provider: GenerationProvider; onProviderChange: (value: GenerationProvider) => void;
  providers?: ProviderAvailability; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  disabled: boolean; submitting: boolean; placeholder?: string; saveBriefOnly?: boolean;
}) {
  const promptId = useId(), hintId = useId(), providerId = useId();
  const canSend = prompt.trim().length >= LIMITS.topicMin && !disabled && !submitting;
  return <form onSubmit={event => { if (!canSend) { event.preventDefault(); return; } onSubmit(event); }} aria-busy={submitting} className="rounded-3xl border border-border bg-card p-2.5 shadow-lg shadow-black/[0.03]">
    <label htmlFor={promptId} className="sr-only">Topic or question for your explainer video</label>
    <Textarea id={promptId} data-topic-composer value={prompt} onChange={event => onPromptChange(event.target.value)} onKeyDown={event => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (canSend) event.currentTarget.form?.requestSubmit(); }
    }} placeholder={placeholder} minLength={LIMITS.topicMin} maxLength={LIMITS.topicMax} required rows={3} aria-describedby={hintId} className="px-3 pt-2 text-[15px]" />
    <div className="flex flex-wrap items-center gap-2 px-1 pb-1">
      <span className="flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-muted-foreground" aria-label="Video aspect ratio: 16 by 9"><Ratio className="size-3.5" />16:9</span>
      <label className="flex min-h-10 items-center gap-1 rounded-full border border-border px-2.5 text-xs text-muted-foreground"><Clock3 className="size-3.5" /><span className="sr-only">Lesson length</span><select aria-label="Lesson length" value={duration} onChange={event => onDurationChange(Number(event.target.value))} disabled={submitting} className="min-h-10 cursor-pointer bg-transparent pr-1 text-foreground">{DURATION_PRESETS.map(seconds => <option value={seconds} key={seconds}>{seconds}s</option>)}</select></label>
      <label className="flex min-h-10 max-w-[min(100%,260px)] items-center gap-1.5 rounded-full border border-border px-2.5 text-xs text-muted-foreground"><Sparkles className="size-3.5 shrink-0" /><span className="sr-only">Generate with</span><select id={providerId} aria-label="Generate with" value={provider} onChange={event => onProviderChange(event.target.value as GenerationProvider)} disabled={submitting} className="min-h-10 min-w-0 max-w-full cursor-pointer bg-transparent pr-1 text-foreground"><option value="nim">NIM + Workers AI</option><option value="openai">OpenAI{providers && !providers.openai.enabled ? " · Setup needed" : ""}</option></select></label>
      <button type="submit" disabled={!canSend} aria-label={saveBriefOnly ? "Save lesson brief" : "Generate video"} className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-secondary disabled:text-muted-foreground disabled:cursor-not-allowed"><ArrowUp className="size-4" /></button>
    </div>
    <details className="group mx-1 border-t border-border/70 pt-1">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 px-2 text-xs text-muted-foreground"><SlidersHorizontal className="size-3.5" />Lesson settings<span className="ml-auto tabular-nums">{prompt.length}/{LIMITS.topicMax}</span></summary>
      <div className="space-y-3 px-2 pb-3 pt-1 text-xs text-muted-foreground">
        <label className="flex flex-wrap items-center justify-between gap-2">Explain it for<select aria-label="Explain it for" value={audience} onChange={event => onAudienceChange(event.target.value as "beginner" | "student")} disabled={submitting} className="min-h-11 rounded-xl border border-input bg-card px-3 text-foreground"><option value="beginner">A curious beginner</option><option value="student">A school student</option></select></label>
        <p>{PROVIDER_LABELS[provider]} plans and reviews this lesson. {providers && !providers[provider].enabled ? providers[provider].message : "Narration, captions and clean whiteboard animation are included. Duration is a target."}</p>
        <p id={hintId}>Enter to generate · Shift + Enter for a new line</p>
      </div>
    </details>
  </form>;
}
