import { useEffect, useSyncExternalStore } from "react";

// Kumo switches palettes via <html data-mode="dark">. The saved choice (if any)
// is applied before first paint by the inline script in index.html.
const KEY = "zamwriter_theme";
type Mode = "light" | "dark";

const media = matchMedia("(prefers-color-scheme: dark)");

function saved(): Mode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

const current = (): Mode => saved() ?? (media.matches ? "dark" : "light");
const listeners = new Set<() => void>();
const apply = () => {
  document.documentElement.dataset.mode = current();
  for (const l of listeners) l();
};

export function useTheme(): [Mode, () => void] {
  const mode = useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, current);

  useEffect(() => {
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const toggle = () => {
    try {
      localStorage.setItem(KEY, mode === "dark" ? "light" : "dark");
    } catch {}
    apply();
  };
  return [mode, toggle];
}
