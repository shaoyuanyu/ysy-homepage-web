"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Loader2,
  MessageSquareText,
  Moon,
  Search,
  Square,
  Sun,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { Link } from "@/lib/i18n/navigation";
import { libraryApi, patchJson } from "@/lib/library/client";
import type { Annotation, FulltextSearch, PaperDetail, PdfFile } from "@/lib/library/types";
import { cn } from "@/lib/utils";
import { isImeComposing } from "@/lib/utils/ime";

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
  // 从上次读到的页继续（progress_page 由 state API 持久化）
  const [page, setPage] = useState(() => {
    const saved = paper.state.progressPage;
    return saved && saved > 0 ? saved : 1;
  });
  const lastSavedPage = useRef<number | null>(paper.state.progressPage ?? null);
  // 默认单页 + 原色：阅读区宽度（含右侧批注栏）只有 ~540px，双页会缩到 240px/页；
  // 深色主题自动切反色（白色 PDF 在夜里刺眼），浅色保持原样。
  const [spread, setSpread] = useState(false);
  const [inverted, setInverted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [tab, setTab] = useState<Tab>("annotations");
  // 窄屏下批注/搜索栏默认收起；工具栏按钮打开覆盖在页面区域的抽屉
  const [panelOpen, setPanelOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FulltextSearch["hits"]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    // 首次进入按当前主题决定是否反色（PDF 加载是异步的，不会有可感知的闪烁）
    setInverted(window.document.documentElement.classList.contains("dark"));
  }, []);

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
          // progress_page 可能来自删过页的旧文件：夹到有效页码
          setPage((current) => Math.min(current, loaded.numPages));
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
    const availableWidth = Math.max(containerRef.current.clientWidth - 48, 320);
    const availableHeight = Math.max(containerRef.current.clientHeight - 48, 320);
    const first = await document.getPage(pages[0]);
    const base = first.getViewport({ scale: 1 });
    // 同时受宽、高约束：只按宽度铺满时，A4 竖版页面会比阅读区高 40~60px，
    // 页码与页脚落在初始视口外（实测 1440 下页面高 696 / 区域高 652）。
    const fit = Math.min(
      availableWidth / (base.width * pages.length + 24),
      availableHeight / base.height,
    );
    // zoom=1 时整页可见；放大后容器可滚动（手机上字太小只能靠它）
    const scale = Math.min(3, Math.max(0.35, fit * zoom));
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
  }, [document, page, spread, zoom]);

  useEffect(() => {
    void renderPages();
  }, [renderPages]);

  // 停留 1.2s 后把页码写回进度（翻页过程中不逐页写库）；失败静默
  useEffect(() => {
    if (!document || lastSavedPage.current === page) return;
    const timer = window.setTimeout(() => {
      lastSavedPage.current = page;
      patchJson(`/papers/${paper.id}/state`, { progress_page: page }).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [page, document, paper.id]);

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

  // 高度按 -11rem 算：-9rem 时阅读器底边会落到视口外 20~28px（文献库页头比旧版
  // 更高），页码/批注栏底部被裁掉；-11rem 在 1440/1024/390 实测都完整可见。
  return (
    <div className="flex h-[calc(100svh-11rem)] min-h-[520px] flex-col overflow-hidden rounded-xl border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Link href={`/library/papers/${paper.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> {t("backToPaper")}
        </Link>
        <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
        <span className="max-w-[40vw] truncate text-xs font-medium">{paper.title}</span>
        {file.pageCount ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("pagesCount", { count: file.pageCount })}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-expanded={panelOpen}
          aria-controls="reader-panel"
          aria-label={`${t("annotations")} (${annotations.length})`}
          title={t("annotations")}
          className="inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs transition-colors hover:bg-accent md:hidden"
        >
          <MessageSquareText className="size-3.5" />
          <span className="tabular-nums">{annotations.length}</span>
        </button>

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
          <span className="text-xs text-muted-foreground">/ {document?.numPages ?? "?"}</span>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(document?.numPages ?? 1, value + (spread ? 2 : 1)))}
            className="rounded border p-1.5 hover:bg-accent"
            aria-label={t("nextPage")}
          >
            <ChevronRight className="size-4" />
          </button>
          <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
          <div className="flex items-center rounded-lg border">
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}
              disabled={zoom <= 0.5}
              aria-label={t("zoomOut")}
              title={t("zoomOut")}
              className="inline-flex size-8 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <ZoomOut className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              title={t("zoomReset")}
              aria-label={t("zoomReset")}
              className="hidden h-8 min-w-11 items-center justify-center border-x px-1 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.25).toFixed(2))))}
              disabled={zoom >= 2.5}
              aria-label={t("zoomIn")}
              title={t("zoomIn")}
              className="inline-flex size-8 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <ZoomIn className="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSpread((value) => !value)}
            aria-pressed={spread}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs transition-colors hover:bg-accent",
              spread && "bg-accent",
            )}
            title={spread ? t("singlePage") : t("doublePage")}
          >
            {spread ? <Columns2 className="size-3.5" /> : <Square className="size-3.5" />}
            <span className="hidden sm:inline">{spread ? t("doublePage") : t("singlePage")}</span>
          </button>
          <button
            type="button"
            onClick={() => setInverted((value) => !value)}
            aria-pressed={inverted}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs transition-colors hover:bg-accent",
              inverted && "bg-accent",
            )}
            title={t("invert")}
          >
            {inverted ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
            <span className="hidden sm:inline">{t("invert")}</span>
          </button>
        </div>
      </div>

      {/* 阅读进度：比页码更直观地知道「读到哪里」 */}
      <div
        className="h-0.5 shrink-0 bg-muted/60"
        role="progressbar"
        aria-label={t("readingProgress")}
        aria-valuemin={1}
        aria-valuemax={document?.numPages ?? 1}
        aria-valuenow={page}
      >
        <div
          className="h-full rounded-r-full bg-foreground/40 transition-[width] duration-300 dark:bg-foreground/55"
          style={{ width: `${document ? (page / document.numPages) * 100 : 0}%` }}
        />
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div ref={containerRef} className="relative flex min-w-0 flex-1 items-start justify-center overflow-auto bg-muted/30 p-4">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> {t("readerLoading")}
            </div>
          )}
          {error && <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>}
          {/* my-auto：内容小于容器时垂直居中，放大超出时自动归零，顶部仍可滚到
              （flex 的 items-center + overflow 会把超出部分的上缘裁掉） */}
          {!error && (
            <div className="my-auto flex items-start gap-3">
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
                  <span className="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-0.5 text-xs text-white">
                    {pageNumber}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside
          id="reader-panel"
          className={cn(
            "z-20 flex-col bg-background md:static md:z-auto md:flex md:w-80 md:shrink-0 md:border-l md:bg-card/20",
            panelOpen ? "absolute inset-0 flex" : "hidden",
          )}
        >
          <div className="flex items-stretch border-b text-xs">
            <button
              type="button"
              onClick={() => setTab("annotations")}
              className={cn(
                "flex-1 border-b-2 -mb-px px-3 py-2.5 transition-colors",
                tab === "annotations"
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t("annotations")} ({annotations.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("search")}
              className={cn(
                "flex-1 border-b-2 -mb-px px-3 py-2.5 transition-colors",
                tab === "search"
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t("search")}
            </button>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              aria-label={t("close")}
              className="px-3 text-muted-foreground transition-colors hover:text-foreground md:hidden"
            >
              <X className="size-4" />
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
                      onClick={() => {
                        setPage(annotation.page);
                        setPanelOpen(false);
                      }}
                      className={cn(
                        "w-full rounded border-l-2 bg-background px-2 py-2 text-left text-xs hover:bg-accent/50",
                        colorClass[annotation.color] ?? colorClass.yellow,
                      )}
                    >
                      <p className="line-clamp-3">“{annotation.quote}”</p>
                      {annotation.comment && <p className="mt-1 text-xs text-muted-foreground">{annotation.comment}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">p.{annotation.page}</p>
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
                    // 中文检索词很常见：组字中按 Enter 是选候选词，不是发起搜索
                    if (isImeComposing(event.nativeEvent)) return;
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
                      onClick={() => {
                        setPage(hit.page);
                        setPanelOpen(false);
                      }}
                      className="mb-1 w-full rounded px-2 py-2 text-left text-xs hover:bg-accent"
                    >
                      <span className="text-xs text-muted-foreground">p.{hit.page}</span>
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
