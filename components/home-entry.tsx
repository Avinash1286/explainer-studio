"use client";
import { Suspense, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LandingPage } from "./landing-page";
import { PublicShowcase } from "./public-showcase";
import { StudioApp } from "./studio-app";

type EntryRoute = "landing" | "studio" | "showcase";
function readRoute(): EntryRoute {
  const { pathname, search } = window.location;
  // Static hosting can return the root document for these pretty URLs.
  if (pathname === "/chalk" || pathname === "/chalk/") return "studio";
  if (pathname === "/showcase" || pathname === "/showcase/") return "showcase";
  const query = new URLSearchParams(search);
  return query.has("job") || query.get("view") === "chat" || query.get("view") === "gallery" ? "studio" : "landing";
}
const serverRoute = (): EntryRoute => "landing";

function RoutedHomeEntry() {
  const pathname = usePathname(), search = useSearchParams();
  const refresh = useRef<(() => void) | null>(null);
  const subscribe = useCallback((callback: () => void) => {
    refresh.current = callback;
    window.addEventListener("popstate", callback);
    return () => { if (refresh.current === callback) refresh.current = null; window.removeEventListener("popstate", callback); };
  }, []);
  const route = useSyncExternalStore(subscribe, readRoute, serverRoute);
  // Next Link changes do not emit popstate. Read the actual URL after its commit,
  // including when a fallback document remains mounted through that navigation.
  useEffect(() => { refresh.current?.(); }, [pathname, search]);
  if (route === "studio") return <StudioApp />;
  if (route === "showcase") return <PublicShowcase />;
  return <LandingPage />;
}

export function HomeEntry() {
  // Match the root document during hydration, then resolve its browser URL.
  return <Suspense fallback={<LandingPage />}><RoutedHomeEntry /></Suspense>;
}
