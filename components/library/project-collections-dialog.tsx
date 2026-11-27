"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Folder, Loader2, Search } from "lucide-react";

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
import { flattenCollections } from "@/lib/library/projects";
import type { CollectionNode, Project } from "@/lib/library/types";
import { cn } from "@/lib/utils";

/**
 * 项目 ↔ 集合的整组关联。
 *
 * 项目的论文成员 = 关联集合（含子集合）∪ 单独置顶的论文。之前网页只有论文侧
 * 的「归类」入口，项目自己关联了哪些集合完全看不到、也改不了，导致「经集合」
 * 的项目成员既不能移除也无法调整。这里用集合树勾选，保存 diff。
 */
export function ProjectCollectionsDialog({
  open,
  onOpenChange,
  project,
  collections,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  collections: CollectionNode[];
}) {
  const t = useTranslations("library");
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(project.collectionIds));
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelected(new Set(project.collectionIds));
      setQuery("");
      setError(null);
    }
  }, [open, project.collectionIds]);

  const options = useMemo(() => flattenCollections(collections), [collections]);
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter((option) => option.name.toLowerCase().includes(needle))
    : options;

  const adds = [...selected].filter((id) => !project.collectionIds.includes(id));
  const removes = project.collectionIds.filter((id) => !selected.has(id));
  const hasChanges = adds.length > 0 || removes.length > 0;

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (adds.length > 0) {
        await libraryApi(`/projects/${project.id}/collections`, {
          method: "POST",
          body: JSON.stringify({ collectionIds: adds }),
        });
      }
      if (removes.length > 0) {
        await libraryApi(`/projects/${project.id}/collections`, {
          method: "DELETE",
          body: JSON.stringify({ collectionIds: removes }),
        });
      }
      toast.add({ title: t("projectCollectionsSaved"), type: "success" });
      onOpenChange(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof LibraryApiError
          ? caught.message
          : t("projectCollectionsFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="size-4" /> {t("projectCollections")}
          </DialogTitle>
          <DialogDescription className="text-pretty">
            {project.name}
            <span className="mt-1 block text-xs text-muted-foreground/80">
              {t("projectCollectionsHint")}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("projectCollectionsSearch")}
              aria-label={t("projectCollectionsSearch")}
              className="h-8 pl-8"
            />
          </div>

          <div className="max-h-[52svh] space-y-0.5 overflow-y-auto pr-1">
            {options.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                {t("projectCollectionsEmpty")}
              </p>
            ) : visible.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {t("organizeNoMatch")}
              </p>
            ) : (
              visible.map((option) => {
                const checked = selected.has(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggle(option.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                      checked && "font-medium",
                    )}
                    style={{ paddingLeft: 8 + option.depth * 16 }}
                  >
                    <CheckBoxVisual state={checked} />
                    <Folder className="size-3.5 shrink-0 text-muted-foreground/80" />
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {t("countPapers", { count: option.totalCount })}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <p className="text-xs text-muted-foreground/70">
            {t("projectCollectionsCount", { count: selected.size })}
          </p>
        </div>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("cancel")}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || !hasChanges}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
