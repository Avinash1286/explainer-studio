"use client";

import { ConvexError } from "convex/values";
import { AlertCircle, X } from "lucide-react";

export function friendlyError(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  return "We couldn’t finish that request. Check your connection and try again.";
}

export function StudioToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return <div className="studio-toast fixed right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-[80] flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl shadow-black/10 sm:right-5 sm:bottom-5 sm:left-auto sm:w-[min(28rem,calc(100vw-2.5rem))]" role="alert" aria-atomic="true">
    <AlertCircle size={20} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
    <div className="min-w-0 flex-1"><strong className="block text-sm font-semibold">Something needs your attention</strong><p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{message}</p></div>
    <button type="button" onClick={onDismiss} aria-label="Dismiss notification" className="-mt-1 -mr-1 flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><X size={18} aria-hidden="true" /></button>
  </div>;
}
