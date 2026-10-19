import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Table } from "@cloudflare/kumo/components/table";
import { countWords, num, pct } from "../../lib/format";
import { pangramJobFor, startPangram } from "../../lib/jobs";
import { KIND_LABELS, versionLabel } from "../../lib/store";
import type { Doc } from "../../lib/types";
import { VerdictBadge } from "../common";

/** Every version of the document side by side: StealthGPT score and Pangram result. */
export function Versions({
  doc,
  selectedId,
  onSelect,
  model,
}: {
  doc: Doc;
  selectedId: string;
  onSelect: (versionId: string) => void;
  model: string;
}) {
  const unchecked = doc.versions.filter((v) => !v.pangram && !pangramJobFor(doc, v.id));

  return (
    <div className="py-4">
      <div className="overflow-x-auto">
        <Table className="text-sm">
          <Table.Header>
            <Table.Row>
              <Table.Head>Version</Table.Head>
              <Table.Head title="StealthGPT human score">Score</Table.Head>
              <Table.Head>Pangram</Table.Head>
              <Table.Head className="text-right">AI</Table.Head>
              <Table.Head className="text-right">Human</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {doc.versions.map((v) => {
              const job = pangramJobFor(doc, v.id);
              const r = v.pangram?.result;
              return (
                <Table.Row
                  key={v.id}
                  variant={v.id === selectedId ? "selected" : "default"}
                  className="cursor-pointer"
                  onClick={() => onSelect(v.id)}
                >
                  <Table.Cell>
                    <div className="font-medium">{versionLabel(doc, v)}</div>
                    <div className="text-xs text-kumo-subtle">
                      {v.kind === "original" ? `${num(countWords(v.text))} words` : KIND_LABELS[v.kind]}
                    </div>
                  </Table.Cell>
                  <Table.Cell>{typeof v.humanize?.score === "number" ? Math.round(v.humanize.score) : "—"}</Table.Cell>
                  <Table.Cell>
                    {r ? (
                      <VerdictBadge result={r} />
                    ) : job && !job.error ? (
                      <Loader size="sm" />
                    ) : (
                      <span className="text-xs text-kumo-subtle">{job?.error ? "Failed" : "Not checked"}</span>
                    )}
                  </Table.Cell>
                  <Table.Cell className="text-right">{r ? pct((r.fraction_ai || 0) + (r.fraction_ai_assisted || 0)) : "—"}</Table.Cell>
                  <Table.Cell className="text-right">{r ? pct(r.fraction_human) : "—"}</Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      </div>
      <p className="mt-3 px-5 text-xs text-kumo-subtle">
        AI = AI-generated + AI-assisted share. Score is StealthGPT's human-likeness estimate (0–100, higher reads more human).
      </p>
      {unchecked.length > 0 && (
        <div className="no-print mt-3 px-5">
          <Button size="sm" onClick={() => unchecked.forEach((v) => startPangram(doc.id, v.id, model))}>
            Check {unchecked.length} unchecked version{unchecked.length === 1 ? "" : "s"}
          </Button>
        </div>
      )}
    </div>
  );
}
