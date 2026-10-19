import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Loader } from "@cloudflare/kumo/components/loader";
import { ArrowRightIcon, ScanIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { countWords } from "../lib/format";
import { STAGE_LABELS, pangramJobFor, retryJob, startPangram } from "../lib/jobs";
import { navigate } from "../lib/router";
import { usePreferences } from "../lib/settings";
import { versionLabel } from "../lib/store";
import type { Doc, Services, Version } from "../lib/types";
import { CostEstimate } from "./Cost";
import { ModelSelect } from "./ModelSelect";

export function MissingKey({ name, what }: { name: string; what: string }) {
  return (
    <Banner
      variant="alert"
      icon={<WarningIcon weight="fill" />}
      title={`${what} is not configured`}
      description={`Set ${name} in the server's .env file and restart ZamWriter.`}
    />
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  return <>{Math.max(0, Math.floor((now - since) / 1000))}s</>;
}

/**
 * Pangram actions for a version: check it, follow a running check, or retry.
 * Results themselves live in the Pangram tab's report and the version header.
 */
export function PangramCard({ doc, version, services }: { doc: Doc; version: Version; services: Services }) {
  const [prefs] = usePreferences();
  const job = pangramJobFor(doc, version.id);
  const label = versionLabel(doc, version);
  const words = countWords(version.text);

  let body;
  if (!services.pangram) {
    body = <MissingKey name="PANGRAM_API_KEY" what="Pangram" />;
  } else if (job && !job.error) {
    body = (
      <div className="flex items-center gap-3 py-2 text-sm">
        <Loader />
        <div>
          <div className="font-medium">Checking {label}</div>
          <div className="text-kumo-subtle">
            {STAGE_LABELS[job.status] ?? "Working…"} · <Elapsed since={job.startedAt} />
          </div>
        </div>
      </div>
    );
  } else if (version.pangram) {
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="primary"
            icon={ArrowRightIcon}
            className="flex-1 justify-center"
            onClick={() => navigate({ tab: "pangram", docId: doc.id, versionId: version.id })}
          >
            Open report
          </Button>
          <Button size="sm" onClick={() => startPangram(doc.id, version.id, prefs.pangramModel)}>
            Re-check
          </Button>
        </div>
        <CostEstimate words={words} pangramModel={prefs.pangramModel} label="Re-check" />
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
        <div className="flex items-end gap-2">
          <ModelSelect className="w-36" />
          <Button
            size="sm"
            variant="primary"
            icon={ScanIcon}
            className="flex-1 justify-center"
            onClick={() => startPangram(doc.id, version.id, prefs.pangramModel)}
          >
            Check {label}
          </Button>
        </div>
        <CostEstimate words={words} pangramModel={prefs.pangramModel} />
      </div>
    );
  }

  return (
    <LayerCard>
      <LayerCard.Secondary className="flex items-center gap-2">
        <ScanIcon size={16} />
        Pangram
      </LayerCard.Secondary>
      <LayerCard.Primary>{body}</LayerCard.Primary>
    </LayerCard>
  );
}
