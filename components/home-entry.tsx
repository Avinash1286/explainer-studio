"use client";
import { useSyncExternalStore } from "react";
import { LandingPage } from "./landing-page";
import { StudioApp } from "./studio-app";

const subscribe = (callback: () => void) => { window.addEventListener("popstate", callback); return () => window.removeEventListener("popstate", callback); };
const read = () => { const query = new URLSearchParams(window.location.search); return query.has("job") || query.get("view") === "chat" || query.get("view") === "gallery"; };
// Keep previously shared workspace bookmarks functional on the new landing URL.
export function HomeEntry() {
  const workspace = useSyncExternalStore(subscribe, read, () => false);
  return workspace ? <StudioApp /> : <LandingPage />;
}
