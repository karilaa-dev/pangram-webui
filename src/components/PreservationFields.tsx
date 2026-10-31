import { Input } from "@cloudflare/kumo/components/input";
import { Select } from "@cloudflare/kumo/components/select";
import { Switch } from "@cloudflare/kumo/components/switch";
import { useId } from "react";
import { PRESERVATION_DEFAULTS, preservationError, preservationMarkers } from "../lib/preservation";
import type { Preferences } from "../lib/settings";

export function PreservationFields({ prefs, setPrefs, text }: {
  prefs: Preferences;
  setPrefs: (p: Preferences) => void;
  text: string;
}) {
  const id = useId();
  const p = { ...PRESERVATION_DEFAULTS, ...prefs };
  const error = p.preservation ? preservationError(p) : null;
  const count = preservationMarkers(text, p).length;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 text-sm">
      <Switch
        label="Preserve marked text"
        size="sm"
        checked={p.preservation}
        onCheckedChange={(checked) => setPrefs({ ...prefs, preservation: checked })}
        aria-describedby={p.preservation ? `${id}-help` : undefined}
      />
      {p.preservation && (
        <>
          <p id={`${id}-help`} className="text-kumo-subtle">
            Markers such as <code className="break-all text-[0.9em]">{p.preservationOpen}T1{p.preservationClose}</code> stay unchanged.
            Text between separate markers is still rewritten. Replace a whole link, heading or longer passage with one marker to keep it, then restore it yourself afterward.
          </p>
          <p className="text-kumo-subtle" aria-live="polite">
            {!error && (count ? `${count} marker${count === 1 ? "" : "s"} found.` : "No markers found. Add markers to the text or check the delimiters and length below.")}
          </p>
          <details open={error ? true : undefined}>
            <summary className="cursor-pointer rounded text-kumo-default focus-visible:outline-2 focus-visible:outline-kumo-brand">
              Preservation settings
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <Select
                label="Preservation mode"
                hideLabel={false}
                size="sm"
                className="w-full"
                value={p.preservationMode}
                onValueChange={(v) => setPrefs({ ...prefs, preservationMode: v as "inline" | "split" })}
                items={{ inline: "Inline (recommended)", split: "Split" }}
              />
              <p className="text-kumo-subtle">
                {p.preservationMode === "inline"
                  ? "Rewrites in one pass for natural flow, with a fallback if a marker moves."
                  : "Rewrites each stretch between markers separately. Short fragments can read less naturally."}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Opening delimiter" value={p.preservationOpen} maxLength={10}
                  onChange={(e) => setPrefs({ ...prefs, preservationOpen: e.target.value })} />
                <Input label="Closing delimiter" value={p.preservationClose} maxLength={10}
                  onChange={(e) => setPrefs({ ...prefs, preservationClose: e.target.value })} />
              </div>
              <Input label="Maximum marker length" type="number" min={1} max={64} step={1}
                value={Number.isNaN(p.preservationMaxLookahead) ? "" : p.preservationMaxLookahead}
                onChange={(e) => setPrefs({ ...prefs, preservationMaxLookahead: e.target.value === "" ? NaN : Number(e.target.value) })} />
              <p className="text-kumo-subtle">Count only characters between the delimiters (1–64). Longer spans are rewritten.</p>
            </div>
          </details>
          {error && <p role="alert" className="text-kumo-danger">{error}</p>}
        </>
      )}
    </div>
  );
}
