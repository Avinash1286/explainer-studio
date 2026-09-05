"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="error-page"><h1>Let’s reconnect your workspace.</h1><p>Your saved lesson briefs are still in the database. Check your connection and try again.</p><button className="primary-button" onClick={reset}>Try again</button></main>;
}
