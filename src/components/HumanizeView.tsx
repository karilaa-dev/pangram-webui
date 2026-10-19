import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { InputArea } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Meter } from "@cloudflare/kumo/components/meter";
import { Select } from "@cloudflare/kumo/components/select";
import { Switch } from "@cloudflare/kumo/components/switch";
import {
  ArrowRightIcon,
  ArrowsLeftRightIcon,
  MagicWandIcon,
  PencilSimpleIcon,
  ScanIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { countWords, formatDate, num, titleFromText } from "../lib/format";
import { STAGE_LABELS, humanizeJobs, pangramJobFor, retryJob, startHumanize, startPangram } from "../lib/jobs";
import { aiShare, computeStats, buildSegments } from "../lib/pangram";
import { navigate, type Route } from "../lib/router";
import {
  HUMANIZER_MODELS,
  OUTPUT_FORMATS,
  QUALITY_MODES,
  humanizeSettings,
  usePreferences,
  type Preferences,
} from "../lib/settings";
import { KIND_LABELS, store, useDoc, versionLabel } from "../lib/store";
import type { Doc, Services, Version } from "../lib/types";
import { Composer } from "./Composer";
import { DocHeader } from "./DocHeader";
import { ModelSelect } from "./ModelSelect";
import { CopyButton, PageHeading, SectionTitle, Swatch, VerdictBadge } from "./common";
import { VersionStrip } from "./VersionStrip";

export function HumanizeView({ route, services }: { route: Route; services: Services }) {
  const doc = useDoc(route.docId);
  if (!doc) return <NewHumanize services={services} />;
  const selected = doc.versions.find((v) => v.id === route.versionId) ?? doc.versions[doc.versions.length - 1]!;
  return <DocHumanize doc={doc} selected={selected} services={services} />;
}

function MissingKey({ name, what }: { name: string; what: string }) {
  return (
    <Banner
      variant="alert"
      icon={<WarningIcon weight="fill" />}
      title={`${what} is not configured`}
      description={`Set ${name} in the server's .env file and restart ZamWriter.`}
    />
  );
}

function SettingsFields({
  prefs,
  setPrefs,
  fill = false,
}: {
  prefs: Preferences;
  setPrefs: (p: Preferences) => void;
  fill?: boolean;
}) {
  return (
    <>
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
        label="Model"
        hideLabel={false}
        size="sm"
        className={fill ? "w-full" : "w-36"}
        value={prefs.model}
        onValueChange={(v) => setPrefs({ ...prefs, model: v as string })}
        items={HUMANIZER_MODELS}
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

function NewHumanize({ services }: { services: Services }) {
  const [text, setText] = useState("");
  const [prefs, setPrefs] = usePreferences();

  function submit() {
    const value = text.trim();
    if (!value || !services.humanizer) return;
    const doc = store.create(value, titleFromText(value));
    startHumanize(doc.id, doc.versions[0]!.id, humanizeSettings(prefs), prefs.thenCheck && services.pangram ? prefs.pangramModel : undefined);
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
              <Switch
                label="Then check with Pangram"
                size="sm"
                checked={prefs.thenCheck && services.pangram}
                disabled={!services.pangram}
                onCheckedChange={(checked) => setPrefs({ ...prefs, thenCheck: checked })}
              />
            </div>
            <div className="flex-1" />
            <Button variant="primary" icon={MagicWandIcon} disabled={!text.trim() || !services.humanizer} onClick={submit}>
              Humanize
            </Button>
          </>
        }
      />
    </div>
  );
}

function DocHumanize({ doc, selected, services }: { doc: Doc; selected: Version; services: Services }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <DocHeader doc={doc} tab="humanize" />
      <VersionStrip
        doc={doc}
        selectedId={selected.id}
        onSelect={(versionId) => navigate({ tab: "humanize", docId: doc.id, versionId })}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <VersionText key={selected.id} doc={doc} version={selected} />
        <div className="flex flex-col gap-4">
          <HumanizeCard doc={doc} version={selected} services={services} />
          <PangramCard doc={doc} version={selected} services={services} />
          <DetailsCard doc={doc} version={selected} />
        </div>
      </div>
    </div>
  );
}

function VersionText({ doc, version }: { doc: Doc; version: Version }) {
  const source = version.sourceId ? doc.versions.find((v) => v.id === version.sourceId) : undefined;
  const [mode, setMode] = useState<"view" | "compare" | "edit">("view");
  const [draft, setDraft] = useState(version.text);
  const label = versionLabel(doc, version);

  function saveEdit() {
    const edited: Version = {
      id: crypto.randomUUID(),
      kind: "edited",
      text: draft.trim(),
      createdAt: Date.now(),
      sourceId: version.id,
    };
    store.update(doc.id, (d) => ({ ...d, versions: [...d.versions, edited] }));
    navigate({ tab: "humanize", docId: doc.id, versionId: edited.id });
  }

  return (
    <LayerCard className="min-w-0">
      <LayerCard.Secondary className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-kumo-strong">{label}</span>
        {source && (
          <span className="text-xs text-kumo-subtle">
            {KIND_LABELS[version.kind]} from {versionLabel(doc, source)}
          </span>
        )}
        <div className="no-print ml-auto flex items-center gap-1">
          {mode === "edit" ? (
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
              {source && (
                <Button
                  size="sm"
                  variant={mode === "compare" ? "secondary" : "ghost"}
                  icon={ArrowsLeftRightIcon}
                  aria-pressed={mode === "compare"}
                  onClick={() => setMode(mode === "compare" ? "view" : "compare")}
                >
                  Compare
                </Button>
              )}
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
          )}
        </div>
      </LayerCard.Secondary>
      <LayerCard.Primary>
        {mode === "edit" ? (
          <div className="flex flex-col gap-2">
            <InputArea
              aria-label={`Edit ${label}`}
              autoResize
              minRows={12}
              maxRows={40}
              value={draft}
              onValueChange={setDraft}
              className="w-full text-[15px] leading-7"
            />
            <p className="text-xs text-kumo-subtle">
              Saving creates a new version; {label} stays unchanged.
            </p>
          </div>
        ) : mode === "compare" && source ? (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="min-w-0">
              <SectionTitle>{versionLabel(doc, source)}</SectionTitle>
              <div className="whitespace-pre-wrap text-[15px] leading-7 text-kumo-subtle">{source.text}</div>
            </div>
            <div className="min-w-0 md:border-l md:border-kumo-hairline md:pl-5">
              <SectionTitle>{label}</SectionTitle>
              <div className="whitespace-pre-wrap text-[15px] leading-7">{version.text}</div>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-[15px] leading-7 [overflow-wrap:anywhere]">{version.text}</div>
        )}
      </LayerCard.Primary>
    </LayerCard>
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
            <div className="grid grid-cols-2 gap-3">
              <SettingsFields prefs={prefs} setPrefs={setPrefs} fill />
            </div>
            <Switch
              label="Then check with Pangram"
              size="sm"
              checked={prefs.thenCheck && services.pangram}
              disabled={!services.pangram}
              onCheckedChange={(checked) => setPrefs({ ...prefs, thenCheck: checked })}
            />
            <Button
              variant="primary"
              icon={MagicWandIcon}
              className="w-full justify-center"
              onClick={() =>
                startHumanize(doc.id, version.id, humanizeSettings(prefs), prefs.thenCheck && services.pangram ? prefs.pangramModel : undefined)
              }
            >
              {version.kind === "original" ? "Humanize" : `Humanize ${label} again`}
            </Button>
            <p className="text-xs text-kumo-subtle">
              {running
                ? `${running} run${running === 1 ? "" : "s"} in progress from ${label}.`
                : "Creates a new version. Uses StealthGPT credits."}
            </p>
          </>
        )}
      </LayerCard.Primary>
    </LayerCard>
  );
}

function PangramCard({ doc, version, services }: { doc: Doc; version: Version; services: Services }) {
  const [prefs] = usePreferences();
  const job = pangramJobFor(doc, version.id);
  const check = version.pangram;
  const openReport = () => navigate({ tab: "pangram", docId: doc.id, versionId: version.id });

  let body;
  if (!services.pangram) {
    body = <MissingKey name="PANGRAM_API_KEY" what="Pangram" />;
  } else if (job && !job.error) {
    body = (
      <div className="flex items-center gap-2 text-sm text-kumo-subtle">
        <Loader size="sm" />
        {STAGE_LABELS[job.status] ?? "Checking…"}
      </div>
    );
  } else if (check) {
    const stats = computeStats(check.result, buildSegments(check.result, version.text));
    const f = stats.fractions;
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <VerdictBadge result={check.result} />
          {check.result.headline !== check.result.prediction_short && (
            <span className="truncate text-sm font-medium">{check.result.headline || check.result.prediction}</span>
          )}
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-kumo-recessed" role="img" aria-label="Composition">
          {f.ai > 0 && <div className="bg-zw-ai" style={{ width: `${f.ai * 100}%` }} />}
          {f.assisted > 0 && <div className="bg-zw-assisted" style={{ width: `${f.assisted * 100}%` }} />}
          {f.human > 0 && <div className="bg-zw-human" style={{ width: `${f.human * 100}%` }} />}
        </div>
        <div className="flex justify-between text-xs text-kumo-subtle">
          <span className="flex items-center gap-1">
            <Swatch cls="ai" />
            AI {Math.round(f.ai * 100)}%
          </span>
          <span className="flex items-center gap-1">
            <Swatch cls="assisted" />
            Assisted {Math.round(f.assisted * 100)}%
          </span>
          <span className="flex items-center gap-1">
            <Swatch cls="human" />
            Human {Math.round(f.human * 100)}%
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" icon={ArrowRightIcon} className="flex-1 justify-center" onClick={openReport}>
            Open report
          </Button>
          <Button size="sm" onClick={() => startPangram(doc.id, version.id, prefs.pangramModel)}>
            Re-check
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        {job?.error && (
          <Banner
            size="sm"
            variant="error"
            description={job.error}
            action={<Banner.Action onClick={() => retryJob(doc.id, job.id)}>Retry</Banner.Action>}
          />
        )}
        <p className="text-sm text-kumo-subtle">{versionLabel(doc, version)} hasn't been checked yet.</p>
        <div className="flex items-end gap-2">
          <ModelSelect className="w-32" />
          <Button
            size="sm"
            variant="primary"
            icon={ScanIcon}
            className="flex-1 justify-center"
            onClick={() => {
              startPangram(doc.id, version.id, prefs.pangramModel);
            }}
          >
            Check with Pangram
          </Button>
        </div>
      </div>
    );
  }

  return (
    <LayerCard>
      <LayerCard.Secondary className="flex items-center gap-2">
        <ScanIcon size={16} />
        Pangram check
        {check && <span className="ml-auto text-xs font-normal text-kumo-subtle">{Math.round(aiShare(check.result) * 100)}% AI</span>}
      </LayerCard.Secondary>
      <LayerCard.Primary>{body}</LayerCard.Primary>
    </LayerCard>
  );
}

function DetailsCard({ doc, version }: { doc: Doc; version: Version }) {
  const h = version.humanize;
  const source = version.sourceId ? doc.versions.find((v) => v.id === version.sourceId) : undefined;
  const rows: [string, string][] = [
    ["Created", formatDate(version.createdAt)],
    ["Words", num(countWords(version.text))],
    ["Characters", num(version.text.length)],
  ];
  if (source) rows.push(["Source", versionLabel(doc, source)]);
  if (h) {
    rows.push([
      "Settings",
      `${QUALITY_MODES[h.settings.qualityMode]} · ${HUMANIZER_MODELS[h.settings.model as keyof typeof HUMANIZER_MODELS] ?? h.settings.model} · ${OUTPUT_FORMATS[h.settings.outputFormat]}`,
    ]);
    if (h.creditsSpent !== null) rows.push(["Credits spent", num(h.creditsSpent)]);
  }

  return (
    <LayerCard>
      <LayerCard.Secondary>Version details</LayerCard.Secondary>
      <LayerCard.Primary className="flex flex-col gap-3">
        {h && typeof h.score === "number" && (
          <Meter label="StealthGPT human score" value={h.score} customValue={`${Math.round(h.score)} / 100`} />
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-kumo-subtle">{k}</dt>
              <dd className="text-right text-kumo-default">{v}</dd>
            </div>
          ))}
        </dl>
      </LayerCard.Primary>
    </LayerCard>
  );
}

