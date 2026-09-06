"use client";
import { useState, useSyncExternalStore } from "react";
import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
const readExample = () => new URLSearchParams(window.location.search).get("example") || "";
const subscribe = () => () => {};
const readToken = () => new URLSearchParams(window.location.search).get("share") || "";
export function SharedLesson() {
  const [client] = useState(() => process.env.NEXT_PUBLIC_CONVEX_URL ? new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL) : null);
  return client ? <ConvexProvider client={client}><Lesson /></ConvexProvider> : <p>Lesson service is unavailable.</p>;
}
function Lesson() {
  const token = useSyncExternalStore(subscribe, readToken, () => "");
  const slug = useSyncExternalStore(subscribe, readExample, () => "");
  const shared = useQuery(api.delivery.shared, token ? { token } : "skip");
  const example = useQuery(api.showcase.get, slug ? { slug } : "skip");
  const lesson = slug ? example : shared;
  return <main className="shared-lesson"><Link href="/">Explainer Studio</Link>{lesson === undefined && (token || slug) ? <p>Loading lesson…</p> : !lesson ? <><h1>Lesson link unavailable</h1><p>This link may have expired or be incomplete.</p></> : <><h1>{lesson.title}</h1><p>Revision {lesson.revision} · Passed automated source and sampled-frame review</p><video controls src={lesson.video || undefined} crossOrigin="anonymous" aria-label={lesson.title}>{lesson.captions ? <track kind="captions" src={lesson.captions} srcLang="en" label="English" /> : null}</video><h2>Sources</h2><ul>{lesson.sources.map(s => <li key={s.url}><a href={s.url} rel="noreferrer" target="_blank">{s.title}</a></li>)}</ul><p>Original diagrams and catalog artwork. <a href="https://openmoji.org/" rel="noreferrer">OpenMoji</a> assets: <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noreferrer">CC BY-SA 4.0</a>. <a href="/lesson-assets/NOTICE.md">Artwork credits</a>.</p></>}</main>;
}
