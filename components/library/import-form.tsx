"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, CircleAlert, Loader2, Upload } from "lucide-react";

import { LibraryApiError, libraryApi } from "@/lib/library/client";
import type { ImportCreated, ImportItem, ImportJob } from "@/lib/library/types";

type Mode = "identifiers" | "bibtex";

function terminal(status: string): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

export function ImportForm() {
  const t = useTranslations("library");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("identifiers");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [items, setItems] = useState<ImportItem[]>([]);

  const poll = async (importId: string) => {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const current = await libraryApi<ImportJob>(`/imports/${importId}`);
      setJob(current);
      if (terminal(current.status)) {
        const detail = await libraryApi<ImportItem[]>(`/imports/${importId}/items`);
        setItems(detail);
        router.refresh();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    setError(t("importTimeout"));
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setJob(null);
    setItems([]);
    try {
      let created: ImportCreated;
      if (mode === "bibtex") {
        if (!file) throw new LibraryApiError(t("chooseBibtex"), 400);
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/library/imports/bibtex", {
          method: "POST",
          body: form,
          credentials: "same-origin",
        });
        if (!response.ok) {
          const problem = await response.json().catch(() => ({}));
          throw new LibraryApiError(problem.detail ?? problem.title ?? t("importFailed"), response.status);
        }
        created = (await response.json()) as ImportCreated;
      } else {
        const values = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        if (!values.length) throw new LibraryApiError(t("needIdentifiers"), 400);
        created = await libraryApi<ImportCreated>("/imports/identifiers", {
          method: "POST",
          body: JSON.stringify({
            items: values,
            options: { onDuplicate: "skip", defaultTags: [] },
          }),
        });
      }
      await poll(created.importId);
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("importFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg border p-1 text-xs">
        <button
          type="button"
          onClick={() => setMode("identifiers")}
          className={`flex-1 rounded-md px-3 py-1.5 ${mode === "identifiers" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
        >
          {t("importIdentifiers")}
        </button>
        <button
          type="button"
          onClick={() => setMode("bibtex")}
          className={`flex-1 rounded-md px-3 py-1.5 ${mode === "bibtex" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
        >
          {t("importBibtex")}
        </button>
      </div>

      {mode === "identifiers" ? (
        <div>
          <label className="mb-1 block text-xs font-medium">{t("identifiersLabel")}</label>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            placeholder={"arXiv:1706.03762\n10.1145/3290605.3300233\nhttps://openreview.net/forum?id=..."}
            className="w-full rounded-md border bg-background p-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">{t("identifiersHint")}</p>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-xs font-medium">{t("bibtexLabel")}</label>
          <input
            type="file"
            accept=".bib,text/plain,application/x-bibtex"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full rounded-md border bg-background p-2 text-xs"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">{t("bibtexHint")}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        {busy ? t("importing") : t("startImport")}
      </button>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>}

      {job && (
        <div className="rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">{t("importProgress")}</span>
            <span className="rounded bg-muted px-1.5 py-0.5">{job.status}</span>
            <span className="text-muted-foreground">
              {t("importStats", {
                created: job.stats.created ?? 0,
                duplicate: job.stats.duplicate ?? 0,
                failed: job.stats.failed ?? 0,
              })}
            </span>
            {job.errorSummary && <span className="text-destructive">{job.errorSummary}</span>}
          </div>
          {items.length > 0 && (
            <div className="mt-2 divide-y text-xs">
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-2 py-1.5">
                  {item.status === "created" || item.status === "linked" ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 text-emerald-500" />
                  ) : item.status === "duplicate" ? (
                    <CircleAlert className="mt-0.5 size-3.5 text-amber-500" />
                  ) : (
                    <CircleAlert className="mt-0.5 size-3.5 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[11px]">{item.rawInput}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.status}
                      {item.error ? ` · ${item.error}` : ""}
                    </p>
                  </div>
                  {item.paperId && (
                    <a href={`/library/papers/${item.paperId}`} className="shrink-0 text-[11px] underline underline-offset-4">
                      {t("open")}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
