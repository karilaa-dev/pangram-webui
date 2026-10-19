export const pct = (v: number | null | undefined, digits = 0) =>
  v === undefined || v === null || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(digits)}%`;

export const num = (n: number | null | undefined) =>
  n === undefined || n === null || Number.isNaN(n) ? "—" : Number(n).toLocaleString("en-US");

export function countWords(text: string) {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function formatDate(ts: number) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelativeTime(ts: number) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function titleFromText(text: string) {
  const words = text.trim().split(/\s+/).slice(0, 8).join(" ");
  return words.length > 60 ? `${words.slice(0, 57)}…` : words || "Untitled";
}

/** Only http(s) links from API responses are rendered as hrefs. */
export const safeUrl = (url: unknown) => (typeof url === "string" && /^https?:\/\//i.test(url) ? url : undefined);

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
