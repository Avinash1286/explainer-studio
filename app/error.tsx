"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10"><div className="w-full max-w-lg space-y-4 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8"><h1 className="text-2xl font-semibold tracking-tight">Let’s reconnect your workspace.</h1><p className="text-sm leading-6 text-muted-foreground">Your saved lesson briefs are still in the database. Check your connection and try again.</p><button className="primary-button" onClick={reset}>Try again</button></div></main>;
}
