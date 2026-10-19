import { Select } from "@cloudflare/kumo/components/select";
import { usePangramModels, usePreferences } from "../lib/settings";

/** Pangram detection model picker; the choice is remembered in preferences. */
export function ModelSelect({ className = "w-36" }: { className?: string }) {
  const [prefs, setPrefs] = usePreferences();
  const models = usePangramModels();
  return (
    <Select
      label="Model"
      hideLabel={false}
      size="sm"
      className={className}
      value={models.includes(prefs.pangramModel) ? prefs.pangramModel : models[0]}
      onValueChange={(v) => setPrefs({ ...prefs, pangramModel: v as string })}
      items={Object.fromEntries(models.map((m) => [m, m]))}
    />
  );
}
