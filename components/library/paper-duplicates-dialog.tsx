"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GitMerge, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import type { DuplicateCandidate } from "@/lib/library/types";

/** 查重并合并：候选论文合并进当前论文（source → 当前 target）。 */
export function PaperDuplicatesDialog({
  paperId,
  paperTitle,
}: {
  paperId: string;
  paperTitle: string;
}) {
  const t = useTranslations("library");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DuplicateCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    libraryApi<DuplicateCandidate[]>(`/papers/${paperId}/duplicates`)
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, paperId, t]);

  const merge = async (candidate: DuplicateCandidate) => {
    setMerging(candidate.paper.id);
    setError(null);
    try {
      await libraryApi(`/papers/${candidate.paper.id}/merge`, {
        method: "POST",
        body: JSON.stringify({ into: paperId }),
      });
      toast.add({ title: t("paperMerged"), type: "success" });
      setItems((current) => current.filter((item) => item.paper.id !== candidate.paper.id));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("mergeFailed"));
    } finally {
      setMerging(null);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground"
      >
        <GitMerge /> {t("findDuplicates")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="size-4" /> {t("findDuplicates")}
            </DialogTitle>
            <DialogDescription>
              {t("duplicatesHint", { title: paperTitle })}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> {t("loading")}
            </p>
          ) : items.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              {t("noDuplicates")}
            </p>
          ) : (
            <ul className="max-h-[50svh] space-y-1 overflow-y-auto">
              {items.map((candidate) => (
                <li
                  key={candidate.paper.id}
                  className="flex items-start gap-2 rounded-md border p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{candidate.paper.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {candidate.paper.year}
                      {candidate.paper.citekey ? ` · ${candidate.paper.citekey}` : ""}
                      {candidate.reasons.length > 0 ? ` · ${candidate.reasons.join(", ")}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={merging !== null}
                    onClick={() => void merge(candidate)}
                  >
                    {merging === candidate.paper.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <GitMerge />
                    )}
                    {t("mergeIntoThis")}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
