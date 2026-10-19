import { useSyncExternalStore } from "react";
import type { Tab } from "./types";

// Routes live in the hash: #/<tab>/<docId>/<versionId>
export interface Route {
  tab: Tab;
  docId?: string;
  versionId?: string;
}

function parse(hash: string): Route {
  const [tab, docId, versionId] = hash.replace(/^#\/?/, "").split("/");
  return {
    tab: tab === "pangram" ? "pangram" : "humanize",
    docId: docId || undefined,
    versionId: (docId && versionId) || undefined,
  };
}

export const currentRoute = () => parse(location.hash);

export const routeHref =(r: Route) => `#/${[r.tab, r.docId, r.docId && r.versionId].filter(Boolean).join("/")}`;

export function navigate(route: Route) {
  const href = routeHref(route);
  if (location.hash !== href) location.hash = href;
}

const subscribe = (fn: () => void) => {
  addEventListener("hashchange", fn);
  return () => removeEventListener("hashchange", fn);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return parse(hash);
}
