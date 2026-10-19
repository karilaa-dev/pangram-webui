import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Empty } from "@cloudflare/kumo/components/empty";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Loader } from "@cloudflare/kumo/components/loader";
import { ScanIcon, WarningCircleIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { countWords, titleFromText } from "../lib/format";
import { STAGE_LABELS, pangramJobFor, retryJob, startPangram } from "../lib/jobs";
import { LABELS } from "../lib/pangram";
import { navigate, type Route } from "../lib/router";
import { usePreferences } from "../lib/settings";
import { store, useDoc, versionLabel } from "../lib/store";
import type { Doc, Services, Version } from "../lib/types";
import { Composer } from "./Composer";
import { CostEstimate } from "./Cost";
import { DocHeader } from "./DocHeader";
import { ModelSelect } from "./ModelSelect";
import { PageHeading, Swatch } from "./common";
import { Report } from "./report/Report";
import { VersionStrip } from "./VersionStrip";

export function PangramView({ route, services }: { route: Route; services: Services }) {
  const doc = useDoc(route.docId);
  if (!doc) return <NewCheck services={services} />;
  // Default to the newest version that has a report, else the newest version.
  const selected =
    doc.versions.find((v) => v.id === route.versionId) ??
    [...doc.versions].reverse().find((v) => v.pangram) ??
    doc.versions[doc.versions.length - 1]!;
  return <DocCheck doc={doc} selected={selected} services={services} />;
}

function MissingPangram() {
  return (
    <Banner
      variant="alert"
      icon={<WarningIcon weight="fill" />}
      title="Pangram is not configured"
      description="Set PANGRAM_API_KEY in the server's .env file and restart ZamWriter."
    />
  );
}

function NewCheck({ services }: { services: Services }) {
  const [text, setText] = useState("");
  const [prefs] = usePreferences();

  function submit() {
    const value = text.trim();
    if (!value || !services.pangram) return;
    const doc = store.create(value, titleFromText(value));
    startPangram(doc.id, doc.versions[0]!.id, prefs.pangramModel);
    navigate({ tab: "pangram", docId: doc.id });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeading
        title="Check for AI"
        description="Paste text to get Pangram's segment-by-segment report of human, AI-assisted and AI-generated writing."
      />
      {!services.pangram && (
        <div className="mb-4">
          <MissingPangram />
        </div>
      )}
      <Composer
        label="Text to check"
        value={text}
        onChange={setText}
        onSubmit={submit}
        placeholder="Paste or type the text you want to check…"
        footer={
          <>
            <ModelSelect />
            <div className="flex-1" />
            <div className="flex h-9 items-center">
              <CostEstimate words={countWords(text)} pangramModel={prefs.pangramModel} />
            </div>
            <Button variant="primary" icon={ScanIcon} disabled={!text.trim() || !services.pangram} onClick={submit}>
              Check for AI
            </Button>
          </>
        }
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {(
          [
            ["ai", "Text produced by a language model with little or no human editing."],
            ["assisted", "Human writing that was edited, polished or paraphrased with AI tools."],
            ["human", "Text with no detectable signs of AI involvement."],
          ] as const
        ).map(([cls, desc]) => (
          <div key={cls} className="rounded-lg bg-kumo-base p-4 ring-1 ring-kumo-hairline">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Swatch cls={cls} />
              {LABELS[cls]}
            </div>
            <p className="text-xs text-kumo-subtle">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocCheck({ doc, selected, services }: { doc: Doc; selected: Version; services: Services }) {
  const [prefs] = usePreferences();
  const job = pangramJobFor(doc, selected.id);
  const label = versionLabel(doc, selected);

  let content;
  if (job && !job.error) {
    content = <Pending status={job.status} startedAt={job.startedAt} label={label} />;
  } else if (selected.pangram) {
    content = (
      <>
        {job?.error && (
          <div className="mb-3">
            <Banner variant="error" icon={<WarningCircleIcon weight="fill" />} title="Re-check failed" description={job.error} />
          </div>
        )}
        <Report key={selected.id} doc={doc} version={selected} check={selected.pangram} model={prefs.pangramModel} />
      </>
    );
  } else {
    content = (
      <LayerCard>
        <LayerCard.Primary className="py-10">
          <Empty
            icon={<ScanIcon size={40} />}
            title={job?.error ? "Pangram check failed" : `${label} hasn't been checked yet`}
            description={job?.error ?? "Run a Pangram check to see which parts of this version read as AI-generated, AI-assisted or human."}
            contents={
              services.pangram ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-end gap-2">
                    <ModelSelect />
                    <Button
                      variant="primary"
                      icon={ScanIcon}
                      onClick={() => (job?.error ? retryJob(doc.id, job.id) : startPangram(doc.id, selected.id, prefs.pangramModel))}
                    >
                      {job?.error ? "Retry" : `Check ${label}`}
                    </Button>
                  </div>
                  <CostEstimate words={countWords(selected.text)} pangramModel={prefs.pangramModel} />
                </div>
              ) : (
                <MissingPangram />
              )
            }
          />
        </LayerCard.Primary>
      </LayerCard>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <DocHeader doc={doc} tab="pangram" />
      <VersionStrip doc={doc} selectedId={selected.id} onSelect={(versionId) => navigate({ tab: "pangram", docId: doc.id, versionId })} />
      {content}
    </div>
  );
}

function Pending({ status, startedAt, label }: { status: string; startedAt: number; label: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));

  return (
    <LayerCard>
      <LayerCard.Primary className="flex flex-col items-center gap-3 py-14 text-center">
        <Loader size="lg" />
        <div className="text-base font-medium">Checking {label} with Pangram</div>
        <div className="text-sm text-kumo-subtle">
          {STAGE_LABELS[status] ?? "Working…"} · {seconds}s
        </div>
        {seconds > 10 && <div className="text-xs text-kumo-subtle">Longer texts take a bit more time.</div>}
      </LayerCard.Primary>
    </LayerCard>
  );
}
