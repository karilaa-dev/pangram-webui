import { InputArea } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import type { ReactNode } from "react";
import { countWords, num } from "../lib/format";

/** Large text input for starting a new document. Ctrl/⌘+Enter submits. */
export function Composer({
  label,
  value,
  onChange,
  onSubmit,
  placeholder,
  footer,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  footer: ReactNode;
}) {
  return (
    <LayerCard>
      <LayerCard.Secondary className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="text-xs text-kumo-subtle">
          {num(countWords(value))} words · {num(value.length)} characters
        </span>
      </LayerCard.Secondary>
      <LayerCard.Primary className="flex flex-col gap-4">
        <InputArea
          aria-label={label}
          rows={14}
          autoFocus
          placeholder={placeholder}
          value={value}
          onValueChange={onChange}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSubmit();
          }}
          className="min-h-72 w-full resize-y text-[15px] leading-7"
        />
        <div className="flex flex-wrap items-end gap-3">{footer}</div>
      </LayerCard.Primary>
    </LayerCard>
  );
}
