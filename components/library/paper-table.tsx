"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ExternalLink, FileText, Star } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import { authorLine, casLevel, ccfLevel, kindLabel, venueLine } from "@/lib/library/format";
import type { PaperSummary, ReadingStatus } from "@/lib/library/types";
import { cn } from "@/lib/utils";

const bulkStatuses: ReadingStatus[] = ["unread", "queued", "reading", "read", "reviewed", "archived"];

function LevelBadge({ label, level }: { label: string; level: string | null }) {
  if (!level) return <span className="text-muted-foreground/40">—</span>;
  const tone =
    level === "A" || level === "1"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : level === "B" || level === "2"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium", tone)}>
      {label} {level}
    </span>
  );
}

export function PaperTable({ items }: { items: PaperSummary[] }) {
  const router = useRouter();
  const t = useTranslations("library");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allSelected = items.length > 0 && selected.size === items.length;

  const selectedIds = useMemo(() => [...selected], [selected]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulk = async (patch: Record<string, unknown>) => {
    if (!selectedIds.length) return;
    setBusy(true);
    setError(null);
    try {
      await libraryApi("/papers/bulk", {
        method: "PATCH",
        body: JSON.stringify({ ids: selectedIds, patch }),
      });
      setSelected(new Set());
      setTag("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("bulkFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <FileText className="mx-auto mb-3 size-8 text-muted-foreground/40" />
        <h2 className="text-sm font-medium">{t("emptyTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("emptyBody")}</p>
        <Link href="/library/import" className="mt-4 inline-block text-xs underline underline-offset-4">
          {t("import")}
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-9 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))}
                  aria-label={t("selectAll")}
                />
              </th>
              <th className="px-2 py-2">{t("paper")}</th>
              <th className="px-2 py-2">{t("venue")}</th>
              <th className="px-2 py-2">{t("ccf")}</th>
              <th className="px-2 py-2">{t("cas")}</th>
              <th className="px-2 py-2">{t("status")}</th>
              <th className="px-2 py-2 text-right">{t("files")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((paper) => (
              <tr key={paper.id} className="border-t align-top hover:bg-accent/30">
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(paper.id)}
                    onChange={() => toggle(paper.id)}
                    aria-label={`${t("select")} ${paper.title}`}
                  />
                </td>
                <td className="max-w-[520px] px-2 py-3">
                  <Link href={`/library/papers/${paper.id}`} className="font-medium leading-snug hover:underline">
                    {paper.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{paper.year}</span>
                    <span>·</span>
                    <span>{kindLabel(paper.kind)}</span>
                    <span>·</span>
                    <span className="line-clamp-1">{authorLine(paper.authors)}</span>
                    {paper.state.starred && <Star className="size-3 fill-amber-400 text-amber-500" />}
                  </div>
                  {paper.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {paper.tags.slice(0, 6).map((path) => (
                        <span key={path} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {path}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="max-w-[180px] px-2 py-3 text-xs text-muted-foreground">{venueLine(paper.venue)}</td>
                <td className="px-2 py-3"><LevelBadge label="CCF" level={ccfLevel(paper)} /></td>
                <td className="px-2 py-3"><LevelBadge label="CAS" level={casLevel(paper)} /></td>
                <td className="px-2 py-3 text-xs">{t(`status_${paper.state.status}`)}</td>
                <td className="px-2 py-3 text-right text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <FileText className="size-3" /> {paper.counts.pdfFiles}
                  </span>
                  {paper.counts.annotations > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1">
                      <ExternalLink className="size-3" /> {paper.counts.annotations}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t bg-muted/40 px-3 py-2">
          <span className="text-xs text-muted-foreground">{t("selected", { count: selected.size })}</span>
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) void bulk({ state: { status: event.target.value } });
            }}
          >
            <option value="">{t("bulkStatus")}</option>
            {bulkStatuses.map((status) => (
              <option key={status} value={status}>{t(`status_${status}`)}</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <input
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              placeholder={t("bulkTagPlaceholder")}
              className="h-8 w-40 rounded-md border bg-background px-2 text-xs"
            />
            <button
              type="button"
              disabled={!tag.trim() || busy}
              onClick={() => void bulk({ addTags: [tag.trim()] })}
              className="h-8 rounded-md border px-2 text-xs disabled:opacity-40"
            >
              {t("bulkAddTag")}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent"
          >
            {t("clearSelection")}
          </button>
          {error && <span className="basis-full text-xs text-destructive">{error}</span>}
        </div>
      )}
    </div>
  );
}
