"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Plus, Search } from "lucide-react";

import { CheckBoxVisual } from "@/components/library/tree-checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import type { PaperSummary } from "@/lib/library/types";
import { cn } from "@/lib/utils";

/** 从项目/工作区页直接挑论文加入（项目用 paperIds，工作区用 paperRefs）。 */
function PaperPickerButton({
  targetId,
  targetKind,
}: {
  targetId: string;
  targetKind: "project" | "workspace";
}) {
  const t = useTranslations("library");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setPicked(new Set());
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      libraryApi<{ items: PaperSummary[] }>(
        `/papers?limit=50${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}`,
      )
        .then((page) => {
          if (!cancelled) setPapers(page.items);
        })
        .catch((caught: unknown) => {
          if (!cancelled) {
            setError(
              caught instanceof LibraryApiError ? caught.message : t("actionFailed"),
            );
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, t]);

  const toggle = (id: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (picked.size === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await libraryApi<{ added: number }>(
        targetKind === "project"
          ? `/projects/${targetId}/papers`
          : `/workspaces/${targetId}/papers`,
        {
          method: "POST",
          body: JSON.stringify(
            targetKind === "project"
              ? { paperIds: [...picked] }
              : { paperRefs: [...picked] },
          ),
        },
      );
      toast.add({
        title:
          result.added > 0
            ? t("addPapersAdded", { count: result.added })
            : t("addPapersAlready"),
        type: "success",
      });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" /> {t("addPapers")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-4" /> {t("addPapers")}
            </DialogTitle>
            <DialogDescription>
              {targetKind === "project" ? t("addPapersHint") : t("addPapersWorkspaceHint")}
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("addPapersSearch")}
              aria-label={t("addPapersSearch")}
              className="h-8 pl-8"
              autoFocus
            />
          </div>

          <div className="max-h-[50svh] space-y-0.5 overflow-y-auto pr-1">
            {loading ? (
              <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> {t("loading")}
              </p>
            ) : papers.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                {t("addPapersEmpty")}
              </p>
            ) : (
              papers.map((paper) => {
                const checked = picked.has(paper.id);
                return (
                  <button
                    key={paper.id}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggle(paper.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                      checked && "bg-accent/40",
                    )}
                  >
                    <span className="mt-0.5">
                      <CheckBoxVisual state={checked} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 font-medium">{paper.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {paper.year}
                        {paper.venue?.abbrev ? ` · ${paper.venue.abbrev}` : ""}
                        {paper.citekey ? ` · ${paper.citekey}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <span className="mr-auto text-xs tabular-nums text-muted-foreground">
              {t("addPapersSelected", { count: picked.size })}
            </span>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving || picked.size === 0}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {t("add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


export function ProjectAddPapersButton({ projectId }: { projectId: string }) {
  return <PaperPickerButton targetId={projectId} targetKind="project" />;
}

export function WorkspaceAddPapersButton({ workspaceId }: { workspaceId: string }) {
  return <PaperPickerButton targetId={workspaceId} targetKind="workspace" />;
}
