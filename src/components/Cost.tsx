import { Tooltip } from "@cloudflare/kumo/components/tooltip";
import { countWords } from "../lib/format";
import { humanizeCost, humanizeRate, pangramCost, pangramRate, usd } from "../lib/pricing";
import { HUMANIZER_MODELS } from "../lib/settings";
import type { Doc, Version } from "../lib/types";

const modelName = (model: string) => HUMANIZER_MODELS[model as keyof typeof HUMANIZER_MODELS] ?? model;

/** "Est. cost ≈ $0.16 humanize + $0.25 Pangram" for actions about to run on `words` words. */
export function CostEstimate({
  words,
  humanizeModel,
  pangramModel,
  label = "Est. cost",
}: {
  words: number;
  humanizeModel?: string;
  pangramModel?: string;
  label?: string;
}) {
  if (!words || (!humanizeModel && !pangramModel)) return null;
  const parts: { name: string; cost: number; basis: string }[] = [];
  if (humanizeModel) {
    parts.push({
      name: "humanize",
      cost: humanizeCost(humanizeModel, words),
      basis: `StealthGPT ${modelName(humanizeModel)}: ${humanizeRate(humanizeModel)}, counting input + output words. Assumes the rewrite is about as long as the input.`,
    });
  }
  if (pangramModel) {
    parts.push({
      name: "Pangram",
      cost: pangramCost(pangramModel, words),
      basis: `Pangram ${pangramModel}: ${pangramRate(pangramModel)}, rounded up per check.`,
    });
  }

  const amount = parts.length === 1 ? usd(parts[0]!.cost) : parts.map((x) => `${usd(x.cost)} ${x.name}`).join(" + ");
  return (
    <Tooltip
      className="text-xs text-kumo-subtle underline decoration-dotted underline-offset-2"
      content={
        <div className="flex max-w-72 flex-col gap-1 text-xs">
          {parts.map((x) => (
            <span key={x.name}>{x.basis}</span>
          ))}
        </div>
      }
    >
      {label} ≈ {amount}
    </Tooltip>
  );
}

/** What a version's humanize run and Pangram check cost, from the actual word counts. */
export function versionCosts(doc: Doc, version: Version) {
  const source = version.sourceId ? doc.versions.find((v) => v.id === version.sourceId) : undefined;
  const h = version.humanize;
  const humanize = h && (h.costUsd ?? (source ? humanizeCost(h.settings.model, countWords(source.text), countWords(version.text)) : undefined));
  const pangram = version.pangram && (version.pangram.costUsd ?? pangramCost(version.pangram.model, countWords(version.text)));
  return { humanize, pangram };
}
