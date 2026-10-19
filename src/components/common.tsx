import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { cn } from "@cloudflare/kumo/utils";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { LABELS, verdictClass, type SegClass } from "../lib/pangram";
import { toasts } from "../lib/store";
import type { PangramResult } from "../lib/types";

export const SEG_BADGE: Record<SegClass, "orange" | "warning" | "green"> = {
  ai: "orange",
  assisted: "warning",
  human: "green",
};

export const SWATCH: Record<SegClass | "plag", string> = {
  ai: "bg-zw-ai",
  assisted: "bg-zw-assisted",
  human: "bg-zw-human",
  plag: "bg-zw-plag",
};

export function Swatch({ cls, className }: { cls: SegClass | "plag"; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2.5 shrink-0 rounded-[3px]", SWATCH[cls], className)} />;
}

export function VerdictBadge({ result, className }: { result: PangramResult; className?: string }) {
  const cls = verdictClass(result);
  return (
    <Badge variant={SEG_BADGE[cls]} className={className}>
      {result.prediction_short || LABELS[cls]}
    </Badge>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3 text-xs font-semibold tracking-wide text-kumo-subtle uppercase">
      <span>{children}</span>
      {aside && <span className="font-normal tracking-normal normal-case">{aside}</span>}
    </div>
  );
}

export function CopyButton({ text, label = "Copy", size = "sm" }: { text: string; label?: string; size?: "xs" | "sm" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size={size}
      variant="ghost"
      icon={copied ? CheckIcon : CopyIcon}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toasts.add({ title: "Could not access the clipboard", variant: "error" });
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="sm" className="p-6">
        <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm text-kumo-subtle">{description}</Dialog.Description>
        <div className="mt-6 flex justify-end gap-2">
          <Dialog.Close render={(p) => <Button {...p}>Cancel</Button>} />
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

export function PageHeading({ title, description }: { title: string; description: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-kumo-strong">{title}</h1>
      <p className="mt-1 text-sm text-kumo-subtle">{description}</p>
    </div>
  );
}
