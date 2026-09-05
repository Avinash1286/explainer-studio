"use client";

import { ConvexError } from "convex/values";
import { AlertCircle, X } from "lucide-react";

export function friendlyError(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  return "We couldn’t finish that request. Check your connection and try again.";
}

export function StudioToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return <div className="studio-toast" role="alert" aria-atomic="true">
    <AlertCircle size={20} aria-hidden="true" />
    <div><strong>Something needs your attention</strong><p>{message}</p></div>
    <button type="button" onClick={onDismiss} aria-label="Dismiss notification"><X size={18} aria-hidden="true" /></button>
  </div>;
}
