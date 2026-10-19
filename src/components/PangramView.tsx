import { Button } from "@cloudflare/kumo/components/button";
import { ScanIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { countWords, titleFromText } from "../lib/format";
import { startPangram } from "../lib/jobs";
import { navigate } from "../lib/router";
import { usePreferences } from "../lib/settings";
import { store } from "../lib/store";
import type { Doc, Services, Version } from "../lib/types";
import { Composer } from "./Composer";
import { CostEstimate } from "./Cost";
import { Columns, TEXT_CLASS, TextPanel } from "./Layout";
import { ModelSelect } from "./ModelSelect";
import { MissingKey, PangramCard } from "./PangramCard";
import { CopyButton, PageHeading } from "./common";
import { PangramReport } from "./report/Report";

export function NewCheck({ services }: { services: Services }) {
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
        description="Pangram rates each part of your text as human, AI-assisted or AI-generated. The text is kept as a document, so you can humanize it later."
      />
      {!services.pangram && (
        <div className="mb-4">
          <MissingKey name="PANGRAM_API_KEY" what="Pangram" />
        </div>
      )}
      <Composer
        label="Original text"
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
    </div>
  );
}

/** Pangram tab for an open document: the report once checked, otherwise the plain text and a check action. */
export function PangramColumns({ doc, version, services }: { doc: Doc; version: Version; services: Services }) {
  if (version.pangram) return <PangramReport doc={doc} version={version} check={version.pangram} />;
  return (
    <Columns
      text={
        <TextPanel actions={<CopyButton text={version.text} />}>
          <div className={TEXT_CLASS}>{version.text}</div>
        </TextPanel>
      }
      side={<PangramCard doc={doc} version={version} services={services} />}
    />
  );
}
