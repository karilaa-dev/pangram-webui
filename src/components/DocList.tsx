import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Loader } from "@cloudflare/kumo/components/loader";
import { cn } from "@cloudflare/kumo/utils";
import { FilesIcon, PlusIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { formatRelativeTime } from "../lib/format";
import { navigate, routeHref, type Route } from "../lib/router";
import { store, useDocs } from "../lib/store";
import type { Doc } from "../lib/types";
import { ConfirmDialog, VerdictBadge } from "./common";

function searchText(doc: Doc) {
  return [doc.title, doc.notes, ...doc.tags, doc.versions[0]?.text.slice(0, 500)].join(" ").toLowerCase();
}

export function DocList({ route }: { route: Route }) {
  const docs = useDocs();
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const visible = useMemo(() => {
    const sorted = [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((d) => searchText(d).includes(q)) : sorted;
  }, [docs, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 p-3">
        <Button variant="primary" icon={PlusIcon} className="w-full justify-center" onClick={() => navigate({ tab: route.tab })}>
          New document
        </Button>
        <Input
          size="sm"
          type="search"
          placeholder="Search titles, tags, notes"
          aria-label="Search documents"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between px-4 pb-1.5 text-xs font-medium text-kumo-subtle">
        <span>
          Documents{docs.length ? ` · ${docs.length}` : ""}
        </span>
        {docs.length > 0 && (
          <button className="rounded px-1 hover:text-kumo-danger" onClick={() => setConfirmClear(true)}>
            Clear all
          </button>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Documents">
        {!docs.length ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-kumo-subtle">
            <FilesIcon size={28} />
            Your documents will appear here.
          </div>
        ) : !visible.length ? (
          <div className="px-4 py-8 text-center text-sm text-kumo-subtle">No documents match “{query}”.</div>
        ) : (
          visible.map((doc) => <DocItem key={doc.id} doc={doc} active={doc.id === route.docId} tab={route.tab} />)
        )}
      </nav>

      <div className="border-t border-kumo-hairline px-4 py-2.5 text-xs text-kumo-subtle">Stored in this browser only</div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Delete all documents?"
        description="Every document, version and report saved in this browser will be removed. This cannot be undone."
        confirmLabel="Delete all"
        onConfirm={() => {
          store.clear();
          navigate({ tab: route.tab });
        }}
      />
    </div>
  );
}

function DocItem({ doc, active, tab }: { doc: Doc; active: boolean; tab: Route["tab"] }) {
  const latestChecked = [...doc.versions].reverse().find((v) => v.pangram);
  const busy = doc.jobs.some((j) => !j.error);
  const failed = doc.jobs.some((j) => j.error);
  const count = doc.versions.length;

  return (
    <a
      href={routeHref({ tab, docId: doc.id })}
      aria-current={active ? "page" : undefined}
      className={cn(
        "mb-0.5 block rounded-lg px-3 py-2.5 transition-colors hover:bg-kumo-tint",
        active && "bg-kumo-tint ring-1 ring-kumo-hairline",
      )}
    >
      <div className="truncate text-sm font-medium text-kumo-default">{doc.title}</div>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-kumo-subtle">
        {latestChecked?.pangram && <VerdictBadge result={latestChecked.pangram.result} />}
        <span>
          {count} version{count === 1 ? "" : "s"}
        </span>
        {busy && <Loader size="sm" />}
        {failed && <span className="text-kumo-danger">Failed</span>}
        <span className="ml-auto shrink-0">{formatRelativeTime(doc.updatedAt)}</span>
      </div>
      {doc.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {doc.tags.map((t) => (
            <span key={t} className="rounded bg-kumo-recessed px-1.5 py-px text-[11px] text-kumo-subtle">
              {t}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}
