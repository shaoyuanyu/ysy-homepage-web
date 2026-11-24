"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Loader2,
  Moon,
  Search,
  Square,
  Sun,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { Link } from "@/lib/i18n/navigation";
import { libraryApi } from "@/lib/library/client";
import type { Annotation, FulltextSearch, PaperDetail, PdfFile } from "@/lib/library/types";
import { cn } from "@/lib/utils";

type Tab = "annotations" | "search";

const colorClass: Record<string, string> = {
  yellow: "border-amber-400 bg-amber-300/25",
  green: "border-emerald-400 bg-emerald-300/20",
  blue: "border-sky-400 bg-sky-300/20",
  pink: "border-pink-400 bg-pink-300/20",
  purple: "border-violet-400 bg-violet-300/20",
};

export function PdfReader({
  paper,
  file,
}: {
  paper: PaperDetail;
  file: PdfFile;
}) {
  const t = useTranslations("library");
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const rightRef = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [spread, setSpread] = useState(true);
  const [inverted, setInverted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [tab, setTab] = useState<Tab>("annotations");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FulltextSearch["hits"]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const loadingTask = pdfjs.getDocument({
          url: `/api/library/files/${file.id}/content`,
          withCredentials: true,
        });
        task = loadingTask;
        const loaded = await loadingTask.promise;
        if (!cancelled) {
          setDocument(loaded);
          setLoading(false);
        }
      } catch (caught) {
        if (!cancelled) {
          setLoading(false);
          setError(caught instanceof Error ? caught.message : t("readerLoadFailed"));
        }
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [file.id, t]);

  useEffect(() => {
    libraryApi<Annotation[]>(`/papers/${paper.id}/annotations`)
      .then((items) => setAnnotations(items.filter((item) => item.pdfFileId === file.id)))
      .catch(() => setAnnotations([]));
  }, [paper.id, file.id]);

  const renderPages = useCallback(async () => {
    if (!document || !leftRef.current || !containerRef.current) return;
    const pages = spread ? [page, page + 1].filter((value) => value <= document.numPages) : [page];
    const canvases = [leftRef.current, rightRef.current];
    const available = Math.max(containerRef.current.clientWidth - 48, 320);
    const first = await document.getPage(pages[0]);
    const base = first.getViewport({ scale: 1 });
    const scale = Math.min(2.4, Math.max(0.35, available / (base.width * pages.length + 24)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let index = 0; index < pages.length; index += 1) {
      const canvas = canvases[index];
      if (!canvas) continue;
      const pdfPage = await document.getPage(pages[index]);
      const viewport = pdfPage.getViewport({ scale });
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const context = canvas.getContext("2d");
      if (!context) continue;
      await pdfPage.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      }).promise;
    }
  }, [document, page, spread]);

  useEffect(() => {
    void renderPages();
  }, [renderPages]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const step = spread ? 2 : 1;
      if (event.key === "ArrowLeft") setPage((value) => Math.max(1, value - step));
      if (event.key === "ArrowRight") setPage((value) => Math.min(document?.numPages ?? 1, value + step));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [document?.numPages, spread]);

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setTab("search");
    try {
      const result = await libraryApi<FulltextSearch>(
        `/files/${file.id}/search?q=${encodeURIComponent(query.trim())}&limit=30`,
      );
      setHits(result.hits);
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  };

  const visibleAnnotations = annotations.filter((item) => {
    if (spread) return item.page === page || item.page === page + 1;
    return item.page === page;
  });
  const spreadPages = spread
    ? [page, ...(document && page + 1 <= document.numPages ? [page + 1] : [])]
    : [page];

  return (
    <div className="flex h-[calc(100svh-9rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Link href={`/library/papers/${paper.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> {t("backToPaper")}
        </Link>
        <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
        <span className="max-w-[40vw] truncate text-xs font-medium">{paper.title}</span>
        <span className="text-[11px] text-muted-foreground">{file.pageCount ?? "?"}p</span>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - (spread ? 2 : 1)))}
            className="rounded border p-1.5 hover:bg-accent"
            aria-label={t("previousPage")}
          >
            <ChevronLeft className="size-4" />
          </button>
          <input
            type="number"
            min={1}
            max={document?.numPages ?? 1}
            value={page}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) setPage(Math.max(1, Math.min(document?.numPages ?? 1, value)));
            }}
            className="h-8 w-14 rounded border bg-background px-1 text-center text-xs"
            aria-label={t("pageNumber")}
          />
          <span className="text-[11px] text-muted-foreground">/ {document?.numPages ?? "?"}</span>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(document?.numPages ?? 1, value + (spread ? 2 : 1)))}
            className="rounded border p-1.5 hover:bg-accent"
            aria-label={t("nextPage")}
          >
            <ChevronRight className="size-4" />
          </button>
          <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
          <button
            type="button"
            onClick={() => setSpread((value) => !value)}
            className={cn("inline-flex items-center gap-1 rounded border px-2 py-1.5 text-[11px]", spread && "bg-accent")}
            title={t("doublePage")}
          >
            {spread ? <Columns2 className="size-3.5" /> : <Square className="size-3.5" />}
            <span className="hidden sm:inline">{spread ? t("doublePage") : t("singlePage")}</span>
          </button>
          <button
            type="button"
            onClick={() => setInverted((value) => !value)}
            className={cn("inline-flex items-center gap-1 rounded border px-2 py-1.5 text-[11px]", inverted && "bg-accent")}
            title={t("invert")}
          >
            {inverted ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
            <span className="hidden sm:inline">{t("invert")}</span>
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div ref={containerRef} className="relative flex min-w-0 flex-1 items-start justify-center overflow-auto bg-muted/30 p-4">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> {t("readerLoading")}
            </div>
          )}
          {error && <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>}
          {!error && (
            <div className="flex items-start gap-3">
              {spreadPages.map((pageNumber, index) => (
                <div key={pageNumber} className="relative shadow-lg">
                  <canvas
                    ref={index === 0 ? leftRef : rightRef}
                    className={cn("block max-w-full bg-white", inverted && "brightness-[.92] invert hue-rotate-180")}
                  />
                  <div className="pointer-events-none absolute inset-0">
                    {visibleAnnotations.filter((item) => item.page === pageNumber).map((item) => (
                      <div key={item.id}>
                        {item.rects.map((rect, rectIndex) => (
                          <div
                            key={rectIndex}
                            className={cn("absolute border-2", colorClass[item.color] ?? colorClass.yellow)}
                            style={{
                              left: `${rect.x * 100}%`,
                              top: `${rect.y * 100}%`,
                              width: `${rect.w * 100}%`,
                              height: `${rect.h * 100}%`,
                            }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                  <span className="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                    {pageNumber}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="hidden w-80 shrink-0 flex-col border-l bg-card/20 md:flex">
          <div className="flex border-b text-xs">
            <button
              type="button"
              onClick={() => setTab("annotations")}
              className={cn("flex-1 px-3 py-2", tab === "annotations" && "bg-accent font-medium")}
            >
              {t("annotations")} ({annotations.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("search")}
              className={cn("flex-1 px-3 py-2", tab === "search" && "bg-accent font-medium")}
            >
              {t("search")}
            </button>
          </div>

          {tab === "annotations" ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {annotations.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("noAnnotations")}</p>
              ) : (
                <div className="space-y-2">
                  {annotations.map((annotation) => (
                    <button
                      key={annotation.id}
                      type="button"
                      onClick={() => setPage(annotation.page)}
                      className={cn(
                        "w-full rounded border-l-2 bg-background px-2 py-2 text-left text-xs hover:bg-accent/50",
                        colorClass[annotation.color] ?? colorClass.yellow,
                      )}
                    >
                      <p className="line-clamp-3">“{annotation.quote}”</p>
                      {annotation.comment && <p className="mt-1 text-[11px] text-muted-foreground">{annotation.comment}</p>}
                      <p className="mt-1 text-[10px] text-muted-foreground">p.{annotation.page}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex gap-1 border-b p-2">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void runSearch();
                  }}
                  placeholder={t("searchInPdf")}
                  className="h-8 min-w-0 flex-1 rounded border bg-background px-2 text-xs"
                />
                <button type="button" onClick={() => void runSearch()} className="rounded border px-2 text-xs hover:bg-accent">
                  {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {hits.length === 0 ? (
                  <p className="p-1 text-xs text-muted-foreground">{t("noSearchResults")}</p>
                ) : (
                  hits.map((hit, index) => (
                    <button
                      key={`${hit.page}-${index}`}
                      type="button"
                      onClick={() => setPage(hit.page)}
                      className="mb-1 w-full rounded px-2 py-2 text-left text-xs hover:bg-accent"
                    >
                      <span className="text-[10px] text-muted-foreground">p.{hit.page}</span>
                      <p className="mt-0.5 line-clamp-3">{hit.snippet}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
