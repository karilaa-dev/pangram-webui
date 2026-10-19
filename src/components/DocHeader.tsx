import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { Input, InputArea } from "@cloudflare/kumo/components/input";
import { TagInput } from "@cloudflare/kumo/components/tag-input";
import { DotsThreeIcon, DownloadSimpleIcon, NotePencilIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { download, formatDate } from "../lib/format";
import { usd } from "../lib/pricing";
import { navigate } from "../lib/router";
import { store } from "../lib/store";
import type { Doc, Tab } from "../lib/types";
import { ConfirmDialog } from "./common";

export function DocHeader({ doc, tab }: { doc: Doc; tab: Tab }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const humanized = doc.versions.filter((v) => v.kind !== "original").length;
  const checked = doc.versions.filter((v) => v.pangram).length;

  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-semibold tracking-tight text-kumo-strong" title={doc.title}>
          {doc.title}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-kumo-subtle">
          <span>Created {formatDate(doc.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {humanized} rewrite{humanized === 1 ? "" : "s"}, {checked} Pangram check{checked === 1 ? "" : "s"}
          </span>
          {!!doc.spentUsd && (
            <>
              <span aria-hidden="true">·</span>
              <span title="Estimated from the configured rates, including re-checks">≈ {usd(doc.spentUsd)} spent</span>
            </>
          )}
          {doc.tags.map((t) => (
            <span key={t} className="rounded bg-kumo-recessed px-1.5 py-px text-[11px]">
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="no-print flex shrink-0 items-center gap-1">
        <Button size="sm" icon={NotePencilIcon} onClick={() => setEditing(true)}>
          <span className="hidden sm:inline">Details</span>
        </Button>
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={<Button size="sm" variant="ghost" shape="square" icon={DotsThreeIcon} aria-label="Document actions" />}
          />
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item
              icon={DownloadSimpleIcon}
              onClick={() =>
                download(
                  `zamwriter-${doc.title.slice(0, 40).replace(/[^\w-]+/g, "-").toLowerCase()}.json`,
                  JSON.stringify(doc, null, 2),
                  "application/json",
                )
              }
            >
              Export document (JSON)
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item icon={TrashIcon} variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete document
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>

      {editing && <DetailsDialog doc={doc} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this document?"
        description="The original text, every humanized version and all Pangram reports will be removed from this browser."
        confirmLabel="Delete"
        onConfirm={() => {
          store.remove(doc.id);
          navigate({ tab });
        }}
      />
    </div>
  );
}

function DetailsDialog({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const [title, setTitle] = useState(doc.title);
  const [tags, setTags] = useState(doc.tags);
  const [notes, setNotes] = useState(doc.notes);

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog size="lg" className="p-6">
        <Dialog.Title className="text-lg font-semibold">Document details</Dialog.Title>
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            store.update(doc.id, (d) => ({ ...d, title: title.trim() || d.title, tags, notes }));
            onClose();
          }}
        >
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TagInput
            label="Tags"
            placeholder="Add a tag and press Enter"
            value={tags}
            onValueChange={(v) => setTags(v.map((t) => t.slice(0, 32)))}
          />
          <InputArea label="Notes" rows={5} value={notes} onValueChange={setNotes} placeholder="Notes about this document…" />
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}
