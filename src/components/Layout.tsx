import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import type { ReactNode } from "react";

/** Text styling shared by both tabs, so the text sits in exactly the same place. */
export const TEXT_CLASS = "whitespace-pre-wrap text-[15px] leading-8 text-kumo-default [overflow-wrap:anywhere]";

export function Columns({ text, side }: { text: ReactNode; side: ReactNode }) {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      {text}
      {/* The side column scrolls on its own so tall reports stay reachable while it sticks. */}
      <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-4 xl:-m-1 xl:max-h-[calc(100dvh-88px)] xl:overflow-y-auto xl:p-1">
        {side}
      </div>
    </div>
  );
}

export function TextPanel({ toolbar, actions, children }: { toolbar?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <LayerCard className="min-w-0">
      <LayerCard.Secondary className="no-print flex min-h-13 flex-wrap items-center gap-1.5 py-2">
        {toolbar}
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      </LayerCard.Secondary>
      <LayerCard.Primary className="px-5 py-5 sm:px-6">{children}</LayerCard.Primary>
    </LayerCard>
  );
}
