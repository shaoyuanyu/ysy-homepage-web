"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, CircleAlert, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LibraryApiError,
  importPdf,
  libraryApi,
  waitForJob,
} from "@/lib/library/client";
import type {
  ImportCreated,
  ImportItem,
  ImportJob,
  PdfImportCreated,
} from "@/lib/library/types";

type Mode = "identifiers" | "bibtex" | "pdf";

function terminal(status: string): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

export function ImportForm() {
  const t = useTranslations("library");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("identifiers");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfResult, setPdfResult] = useState<PdfImportCreated | null>(null);
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

  const submitBibtexFile = async (bibFile: File): Promise<ImportCreated> => {
    const form = new FormData();
    form.append("file", bibFile);
    const response = await fetch("/api/library/imports/bibtex", {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      throw new LibraryApiError(
        problem.detail ?? problem.title ?? t("importFailed"),
        response.status,
      );
    }
    return (await response.json()) as ImportCreated;
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setJob(null);
    setItems([]);
    setPdfResult(null);
    try {
      if (mode === "pdf") {
        if (!pdfFile) throw new LibraryApiError(t("choosePdf"), 400);
        const result = await importPdf(pdfFile);
        setPdfResult(result);
        if (result.jobId) await waitForJob(result.jobId);
        router.refresh();
        return;
      }
      let created: ImportCreated;
      if (mode === "bibtex") {
        if (!file) throw new LibraryApiError(t("chooseBibtex"), 400);
        created = await submitBibtexFile(file);
      } else if (
        // 防止把整段 BibTeX 粘进「标识符」框：那会按行拆成几十个标题检索。
        // 识别到 BibTeX 头后自动走 BibTeX 端点，而不是逐行 resolve。
        /^\s*@[A-Za-z]+\s*[{(]/m.test(text)
      ) {
        const pasted = new File([text], "pasted.bib", {
          type: "application/x-bibtex",
        });
        created = await submitBibtexFile(pasted);
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
            options: { onDuplicate: "link", defaultTags: [] },
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
      <div className="rounded-xl border bg-card/40 p-4">
        {/* 与邮箱页 / 学术数据四页同一条「下划线 tab」：切模式不跳页，只换下方表单 */}
        <div
          role="tablist"
          aria-label={t("importTitle")}
          className="-ml-2.5 flex items-center gap-0.5 border-b"
        >
          {([
            ["identifiers", "importIdentifiers"],
            ["bibtex", "importBibtex"],
            ["pdf", "importPdf"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-2.5 py-2 text-sm whitespace-nowrap transition-colors",
                mode === value
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {t(label)}
            </button>
          ))}
        </div>

        {mode === "identifiers" ? (
          <div>
            <label className="mb-1.5 mt-3 block text-sm font-medium">{t("identifiersLabel")}</label>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              placeholder={"arXiv:1706.03762\n10.1145/3290605.3300233\nhttps://openreview.net/forum?id=..."}
              className="w-full rounded-lg border-2 border-input bg-transparent p-2.5 font-mono text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{t("identifiersHint")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("bibtexPasteHint")}</p>
          </div>
        ) : mode === "bibtex" ? (
          <div>
            <label className="mb-1.5 mt-3 block text-sm font-medium">{t("bibtexLabel")}</label>
            <input
              type="file"
              accept=".bib,text/plain,application/x-bibtex"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-lg border-2 border-input bg-transparent p-2 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm dark:bg-input/30"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{t("bibtexHint")}</p>
          </div>
        ) : null}

        {mode === "pdf" && (
          <div>
            <label className="mb-1.5 mt-3 block text-sm font-medium">{t("pdfLabel")}</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-lg border-2 border-input bg-transparent p-2 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm dark:bg-input/30"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{t("pdfHint")}</p>
          </div>
        )}

        <div className="flex items-center gap-2 pt-3">
          <Button type="button" onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            {busy ? t("importing") : t("startImport")}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {pdfResult && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <p className="font-medium">{t("pdfImported")}</p>
          <a
            href={`/library/papers/${pdfResult.paperId}`}
            className="mt-1 block underline underline-offset-4"
          >
            {pdfResult.title}
          </a>
          {pdfResult.warnings.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{pdfResult.warnings.join("；")}</p>
          )}
        </div>
      )}

      {job && (
        <div className="rounded-xl border p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-sm font-medium">{t("importProgress")}</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5",
                job.status === "succeeded"
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : job.status === "failed"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {t.has(`importStatus_${job.status}`) ? t(`importStatus_${job.status}`) : job.status}
            </span>
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
            <div className="mt-2 divide-y">
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-2 py-2">
                  {item.status === "created" || item.status === "linked" ? (
                    <CheckCircle2 className="mt-0.5 size-4 text-emerald-500" />
                  ) : item.status === "duplicate" ? (
                    <CircleAlert className="mt-0.5 size-4 text-amber-500" />
                  ) : (
                    <CircleAlert className="mt-0.5 size-4 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs">{item.rawInput}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.has(`importItem_${item.status}`) ? t(`importItem_${item.status}`) : item.status}
                      {item.error ? ` · ${item.error}` : ""}
                    </p>
                  </div>
                  {item.paperId && (
                    <a
                      href={`/library/papers/${item.paperId}`}
                      className="shrink-0 text-xs underline underline-offset-4"
                    >
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
