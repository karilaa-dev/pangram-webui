import { Select } from "@cloudflare/kumo/components/select";
import { pangramRate } from "../lib/pricing";
import { usePangramModels, usePreferences } from "../lib/settings";

/** Pangram detection model picker; the latest choice is remembered in this browser. */
export function ModelSelect({ className = "w-36" }: { className?: string }) {
  const [prefs, setPrefs] = usePreferences();
  const models = usePangramModels();
  return (
    <Select
      label="Model"
      hideLabel={false}
      size="sm"
      className={className}
      loading={!models.length}
      value={prefs.pangramModel}
      onValueChange={(v) => setPrefs({ ...prefs, pangramModel: v as string })}
      items={models.map((m) => ({
        value: m,
        label: (
          <span className="flex w-full items-center justify-between gap-4">
            {m}
            <span className="text-xs text-kumo-subtle">{pangramRate(m)}</span>
          </span>
        ),
      }))}
      renderValue={(v) => v as string}
    />
  );
}
