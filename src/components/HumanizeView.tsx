import { Button } from "@cloudflare/kumo/components/button";
import { InputArea } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Select } from "@cloudflare/kumo/components/select";
import { Switch } from "@cloudflare/kumo/components/switch";
import { cn } from "@cloudflare/kumo/utils";
import { ArrowsLeftRightIcon, MagicWandIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { countWords, titleFromText } from "../lib/format";
import { humanizeJobs, startHumanize } from "../lib/jobs";
import { humanizeRate } from "../lib/pricing";
import { navigate } from "../lib/router";
import { HUMANIZER_MODELS, OUTPUT_FORMATS, QUALITY_MODES, humanizeSettings, usePreferences, type Preferences } from "../lib/settings";
import { store, versionLabel } from "../lib/store";
import type { Doc, Services, Version } from "../lib/types";
import { Composer } from "./Composer";
import { CostEstimate } from "./Cost";
import { Columns, TEXT_CLASS, TextPanel } from "./Layout";
import { MissingKey, PangramCard } from "./PangramCard";
import { CopyButton, PageHeading, SectionTitle } from "./common";

// Each option shows its price; the closed select shows just the name.
const MODEL_ITEMS = Object.entries(HUMANIZER_MODELS).map(([value, name]) => ({
  value,
  label: (
    <span className="flex w-full items-center justify-between gap-4">
      {name}
      <span className="text-xs text-kumo-subtle">{humanizeRate(value)}</span>
    </span>
  ),
}));

function SettingsFields({ prefs, setPrefs, fill = false }: { prefs: Preferences; setPrefs: (p: Preferences) => void; fill?: boolean }) {
  return (
    <>
      <Select
        label="Model"
        hideLabel={false}
        size="sm"
        className={fill ? "w-full" : "w-36"}
        value={prefs.model}
        onValueChange={(v) => setPrefs({ ...prefs, model: v as string })}
        items={MODEL_ITEMS}
        renderValue={(v) => HUMANIZER_MODELS[v as keyof typeof HUMANIZER_MODELS] ?? v}
      />
      <Select
        label="Quality"
        hideLabel={false}
        size="sm"
        className={fill ? "w-full" : "w-32"}
        value={prefs.qualityMode}
        onValueChange={(v) => setPrefs({ ...prefs, qualityMode: v as Preferences["qualityMode"] })}
        items={QUALITY_MODES}
      />
      <Select
        label="Output"
        hideLabel={false}
        size="sm"
        className={fill ? "w-full" : "w-32"}
        value={prefs.outputFormat}
        onValueChange={(v) => setPrefs({ ...prefs, outputFormat: v as Preferences["outputFormat"] })}
        items={OUTPUT_FORMATS}
      />
    </>
  );
}

function ThenCheckSwitch({ services }: { services: Services }) {
  const [prefs, setPrefs] = usePreferences();
  return (
    <Switch
      label="Then check with Pangram"
      size="sm"
      checked={prefs.thenCheck && services.pangram}
      disabled={!services.pangram}
      onCheckedChange={(checked) => setPrefs({ ...prefs, thenCheck: checked })}
    />
  );
}

const thenCheckModel = (prefs: Preferences, services: Services) =>
  prefs.thenCheck && services.pangram ? prefs.pangramModel : undefined;

export function NewHumanize({ services }: { services: Services }) {
  const [text, setText] = useState("");
  const [prefs, setPrefs] = usePreferences();

  function submit() {
    const value = text.trim();
    if (!value || !services.humanizer) return;
    const doc = store.create(value, titleFromText(value));
    startHumanize(doc.id, doc.versions[0]!.id, humanizeSettings(prefs), thenCheckModel(prefs, services));
    navigate({ tab: "humanize", docId: doc.id });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeading
        title="Humanize text"
        description="StealthGPT rewrites your text to read naturally. The original and every rewrite are kept as separate versions, each with its own Pangram result."
      />
      {!services.humanizer && (
        <div className="mb-4">
          <MissingKey name="STEALTHGPT_API_KEY" what="StealthGPT" />
        </div>
      )}
      <Composer
        label="Original text"
        value={text}
        onChange={setText}
        onSubmit={submit}
        placeholder="Paste or type the text you want to humanize…"
        footer={
          <>
            <SettingsFields prefs={prefs} setPrefs={setPrefs} />
            <div className="flex h-8 items-center">
              <ThenCheckSwitch services={services} />
            </div>
            <div className="flex-1" />
            <div className="flex h-9 items-center">
              <CostEstimate words={countWords(text)} humanizeModel={prefs.model} pangramModel={thenCheckModel(prefs, services)} />
            </div>
            <Button variant="primary" icon={MagicWandIcon} disabled={!text.trim() || !services.humanizer} onClick={submit}>
              Humanize
            </Button>
          </>
        }
      />
    </div>
  );
}

/** Humanize tab for an open document: the version's text, plus humanize and Pangram actions. */
export function HumanizeColumns({ doc, version, services }: { doc: Doc; version: Version; services: Services }) {
  const source = version.sourceId ? doc.versions.find((v) => v.id === version.sourceId) : undefined;
  const [mode, setMode] = useState<"view" | "compare" | "edit">("view");
  const [draft, setDraft] = useState(version.text);
  const label = versionLabel(doc, version);

  function saveEdit() {
    const edited: Version = { id: crypto.randomUUID(), kind: "edited", text: draft.trim(), createdAt: Date.now(), sourceId: version.id };
    store.update(doc.id, (d) => ({ ...d, versions: [...d.versions, edited] }));
    navigate({ tab: "humanize", docId: doc.id, versionId: edited.id });
  }

  const text = (
    <TextPanel
      toolbar={
        mode === "edit" ? (
          <span className="text-xs text-kumo-subtle">Saving creates a new version; {label} stays unchanged.</span>
        ) : (
          source && (
            <Button
              size="sm"
              variant={mode === "compare" ? "secondary" : "ghost"}
              icon={ArrowsLeftRightIcon}
              aria-pressed={mode === "compare"}
              onClick={() => setMode(mode === "compare" ? "view" : "compare")}
            >
              Compare with {versionLabel(doc, source)}
            </Button>
          )
        )
      }
      actions={
        mode === "edit" ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setMode("view")}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" disabled={!draft.trim() || draft.trim() === version.text} onClick={saveEdit}>
              Save as new version
            </Button>
          </>
        ) : (
          <>
            <CopyButton text={version.text} />
            <Button
              size="sm"
              variant="ghost"
              icon={PencilSimpleIcon}
              onClick={() => {
                setDraft(version.text);
                setMode("edit");
              }}
            >
              Edit
            </Button>
          </>
        )
      }
    >
      {mode === "edit" ? (
        <InputArea
          aria-label={`Edit ${label}`}
          autoResize
          minRows={12}
          maxRows={40}
          value={draft}
          onValueChange={setDraft}
          className={cn("w-full", TEXT_CLASS)}
        />
      ) : mode === "compare" && source ? (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="min-w-0">
            <SectionTitle>{versionLabel(doc, source)}</SectionTitle>
            <div className={cn(TEXT_CLASS, "text-kumo-subtle")}>{source.text}</div>
          </div>
          <div className="min-w-0 md:border-l md:border-kumo-hairline md:pl-5">
            <SectionTitle>{label}</SectionTitle>
            <div className={TEXT_CLASS}>{version.text}</div>
          </div>
        </div>
      ) : (
        <div className={TEXT_CLASS}>{version.text}</div>
      )}
    </TextPanel>
  );

  return (
    <Columns
      text={text}
      side={
        <>
          <HumanizeCard doc={doc} version={version} services={services} />
          <PangramCard doc={doc} version={version} services={services} />
        </>
      }
    />
  );
}

function HumanizeCard({ doc, version, services }: { doc: Doc; version: Version; services: Services }) {
  const [prefs, setPrefs] = usePreferences();
  const running = humanizeJobs(doc).filter((j) => !j.error && j.sourceId === version.id).length;
  const label = versionLabel(doc, version);

  return (
    <LayerCard>
      <LayerCard.Secondary className="flex items-center gap-2">
        <MagicWandIcon size={16} />
        Humanize {label}
      </LayerCard.Secondary>
      <LayerCard.Primary className="flex flex-col gap-3">
        {!services.humanizer ? (
          <MissingKey name="STEALTHGPT_API_KEY" what="StealthGPT" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <SettingsFields prefs={prefs} setPrefs={setPrefs} fill />
            </div>
            <ThenCheckSwitch services={services} />
            <Button
              variant="primary"
              icon={MagicWandIcon}
              className="w-full justify-center"
              onClick={() => startHumanize(doc.id, version.id, humanizeSettings(prefs), thenCheckModel(prefs, services))}
            >
              {version.kind === "original" ? "Humanize" : `Humanize ${label} again`}
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-kumo-subtle">
              <span>{running ? `${running} run${running === 1 ? "" : "s"} in progress from ${label}` : "Creates a new version"}</span>
              <CostEstimate words={countWords(version.text)} humanizeModel={prefs.model} pangramModel={thenCheckModel(prefs, services)} />
            </div>
          </>
        )}
      </LayerCard.Primary>
    </LayerCard>
  );
}
