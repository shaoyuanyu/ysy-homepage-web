"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Link } from "@/lib/i18n/navigation";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import { venueLine } from "@/lib/library/format";
import type { PaperSummary } from "@/lib/library/types";

/** 回收站：软删除的论文在这里恢复（POST /papers/{ref}/restore）。 */
export function TrashPanel({ papers }: { papers: PaperSummary[] }) {
  const t = useTranslations("library");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const restore = async (paper: PaperSummary) => {
    setBusy(paper.id);
    setError(null);
    try {
      await libraryApi(`/papers/${paper.id}/restore`, { method: "POST" });
      toast.add({ title: t("paperRestored"), type: "success" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  if (papers.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
        <Trash2 className="size-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">{t("trashEmpty")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("trashEmptyHint")}</p>
        <Link
          href="/library"
          className="mt-5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("backToLibrary")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <ul className="divide-y rounded-xl border bg-library-surface">
        {papers.map((paper) => (
          <li key={paper.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium">{paper.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {paper.year}
                {paper.venue ? ` · ${venueLine(paper.venue)}` : ""}
                {paper.citekey ? ` · ${paper.citekey}` : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => void restore(paper)}
            >
              {busy === paper.id ? <RotateCcw className="animate-spin" /> : <RotateCcw />}
              {t("restore")}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
