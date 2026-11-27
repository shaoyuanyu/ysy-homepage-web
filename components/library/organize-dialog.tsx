"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Folder, FolderCog, Loader2, Search, Target } from "lucide-react";

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
import { Link } from "@/lib/i18n/navigation";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import {
  buildCollectionSubtrees,
  flattenCollections,
  projectMembership,
} from "@/lib/library/projects";
import type { CollectionNode, PaperSummary, Project } from "@/lib/library/types";
import { CheckBoxVisual, type CheckState } from "@/components/library/tree-checkbox";
import { cn } from "@/lib/utils";

export type OrganizePaper = Pick<PaperSummary, "id" | "title" | "collections">;

interface ProjectChange {
  id: string;
  paperIds: string[];
}

/**
 * 统一的「归类」弹窗：把一篇/多篇论文的集合与项目归属放在同一张表里，
 * 勾选即加入、取消勾选即移出，一次保存。
 *
 * 之前详情页是两个“加入集合 / 加入项目”单选下拉、列表批量条也是两个下拉：
 * 看不到已属关系、一次只能加一个，且要反复操作。这个弹窗用三态勾选表达
 * 多选场景（全选/部分/未选），并把项目的“经关联集合加入”单独标出来。
 */
export function OrganizeDialog({
  open,
  onOpenChange,
  papers,
  collections,
  projects,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  papers: OrganizePaper[];
  collections: CollectionNode[];
  projects: Project[];
  /** 保存成功后通知调用方（列表用来清空选择）。刷新由弹窗自己负责。 */
  onSaved?: () => void;
}) {
  const t = useTranslations("library");
  const router = useRouter();
  const [collectionChanges, setCollectionChanges] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [projectChanges, setProjectChanges] = useState<Map<string, boolean>>(new Map());
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creating, setCreating] = useState<"collection" | "project" | null>(null);

  // 关闭时清空草稿：下一次打开必然是干净状态；打开中不用 papers 引用做依赖，
  // 否则父组件一次普通 re-render（如输入标签）就会把正在勾的选项重置。
  useEffect(() => {
    if (!open) {
      setCollectionChanges(new Map());
      setProjectChanges(new Map());
      setQuery("");
      setError(null);
      setSaving(false);
      setNewCollectionOpen(false);
      setNewCollectionName("");
      setNewProjectOpen(false);
      setNewProjectName("");
    }
  }, [open]);

  const subtrees = useMemo(() => buildCollectionSubtrees(collections), [collections]);
  const collectionOptions = useMemo(() => flattenCollections(collections), [collections]);

  const perPaper = useMemo(
    () =>
      papers.map((paper) => ({
        paper,
        collections: new Set(paper.collections),
        projects: new Map(
          projects.map((project) => [project.id, projectMembership(paper, project, subtrees)]),
        ),
      })),
    [papers, projects, subtrees],
  );

  const collectionInitial = (id: string): CheckState => {
    let members = 0;
    for (const item of perPaper) if (item.collections.has(id)) members += 1;
    if (members === 0) return false;
    return members === perPaper.length ? true : "mixed";
  };

  const projectInitial = (id: string): CheckState => {
    let members = 0;
    for (const item of perPaper) {
      if (item.projects.get(id)?.member) members += 1;
    }
    if (members === 0) return false;
    return members === perPaper.length ? true : "mixed";
  };

  const collectionState = (id: string): CheckState =>
    collectionChanges.has(id) ? collectionChanges.get(id)! : collectionInitial(id);

  const projectState = (id: string): CheckState =>
    projectChanges.has(id) ? projectChanges.get(id)! : projectInitial(id);

  const projectMetrics = (id: string) => {
    let via = 0;
    for (const item of perPaper) {
      if (item.projects.get(id)?.viaCollection) via += 1;
    }
    return { via, total: perPaper.length };
  };

  const toggleCollection = (id: string) => {
    const initial = collectionInitial(id);
    const next = collectionState(id) === true ? false : true;
    setCollectionChanges((previous) => {
      const changes = new Map(previous);
      // 勾回初始状态 = 没有改动；三态（部分）无论设成 true/false 都是改动
      if (initial !== "mixed" && next === initial) changes.delete(id);
      else changes.set(id, next);
      return changes;
    });
  };

  const toggleProject = (id: string) => {
    const metrics = projectMetrics(id);
    // 全部经关联集合加入时，从论文侧取消置顶不会让它离开项目 —— 只读
    if (metrics.via === metrics.total) return;
    const initial = projectInitial(id);
    const next = projectState(id) === true ? false : true;
    setProjectChanges((previous) => {
      const changes = new Map(previous);
      if (initial !== "mixed" && next === initial) changes.delete(id);
      else changes.set(id, next);
      return changes;
    });
  };

  const collectionAdds = [...collectionChanges]
    .filter(([, next]) => next)
    .map(([id]) => id);
  const collectionRemoves = [...collectionChanges]
    .filter(([, next]) => !next)
    .map(([id]) => id);

  const projectAdds: ProjectChange[] = [...projectChanges]
    .filter(([, next]) => next)
    .map(([id]) => ({
      id,
      paperIds: perPaper
        .filter((item) => !item.projects.get(id)?.member)
        .map((item) => item.paper.id),
    }))
    .filter((change) => change.paperIds.length > 0);

  const projectRemoves: ProjectChange[] = [...projectChanges]
    .filter(([, next]) => !next)
    .map(([id]) => ({
      id,
      paperIds: perPaper
        .filter((item) => item.projects.get(id)?.pinned)
        .map((item) => item.paper.id),
    }))
    .filter((change) => change.paperIds.length > 0);

  const hasChanges =
    collectionAdds.length > 0 ||
    collectionRemoves.length > 0 ||
    projectAdds.length > 0 ||
    projectRemoves.length > 0;

  const needle = query.trim().toLowerCase();
  const visibleCollections = needle
    ? collectionOptions.filter((option) => option.name.toLowerCase().includes(needle))
    : collectionOptions;
  const visibleProjects = needle
    ? projects.filter((project) => project.name.toLowerCase().includes(needle))
    : projects;
  const hasViaMembership = projects.some((project) => projectMetrics(project.id).via > 0);

  const createCollection = async () => {
    const name = newCollectionName.trim();
    if (!name || creating) return;
    setCreating("collection");
    setError(null);
    try {
      const created = await libraryApi<{ id: string }>("/collections", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setCollectionChanges((current) => new Map(current).set(created.id, true));
      toast.add({ title: t("collectionCreated"), type: "success" });
      setNewCollectionName("");
      setNewCollectionOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
    } finally {
      setCreating(null);
    }
  };

  const createProject = async () => {
    const name = newProjectName.trim();
    if (!name || creating) return;
    setCreating("project");
    setError(null);
    try {
      const created = await libraryApi<{ id: string }>("/projects", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setProjectChanges((current) => new Map(current).set(created.id, true));
      toast.add({ title: t("projectCreated"), type: "success" });
      setNewProjectName("");
      setNewProjectOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
    } finally {
      setCreating(null);
    }
  };

  const save = async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (collectionAdds.length > 0 || collectionRemoves.length > 0) {
        await libraryApi("/papers/bulk", {
          method: "PATCH",
          body: JSON.stringify({
            ids: papers.map((paper) => paper.id),
            patch: {
              addCollections: collectionAdds,
              removeCollections: collectionRemoves,
            },
          }),
        });
      }
      await Promise.all([
        ...projectAdds.map((change) =>
          libraryApi(`/projects/${change.id}/papers`, {
            method: "POST",
            body: JSON.stringify({ paperIds: change.paperIds }),
          }),
        ),
        ...projectRemoves.map((change) =>
          libraryApi(`/projects/${change.id}/papers`, {
            method: "DELETE",
            body: JSON.stringify({ paperIds: change.paperIds }),
          }),
        ),
      ]);
      toast.add({ title: t("organizeSaved"), type: "success" });
      onOpenChange(false);
      onSaved?.();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("organizeFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderCog className="size-4" /> {t("organize")}
          </DialogTitle>
          <DialogDescription className="text-pretty">
            {papers.length === 1
              ? papers[0].title
              : t("organizeSelected", { count: papers.length })}
            <span className="mt-1 block text-xs text-muted-foreground/80">
              {t("organizeHint")}
            </span>
            {papers.length > 1 && (
              <span className="mt-0.5 block text-xs text-muted-foreground/60">
                {t("organizeLegend")}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("organizeSearch")}
              aria-label={t("organizeSearch")}
              className="h-8 pl-8"
            />
          </div>

          <div className="max-h-[52svh] space-y-4 overflow-y-auto pr-1">
            <section>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Folder className="size-3.5" /> {t("organizeCollections")}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCollectionOpen((value) => !value)}
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {t("newCollection")}
                  </button>
                  <Link
                    href="/library/collections"
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {t("manageCollections")}
                  </Link>
                </div>
              </div>
              {newCollectionOpen && (
                <div className="mb-1.5 flex items-center gap-1">
                  <Input
                    value={newCollectionName}
                    onChange={(event) => setNewCollectionName(event.target.value)}
                    placeholder={t("collectionName")}
                    aria-label={t("newCollection")}
                    className="h-7 text-xs"
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void createCollection();
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void createCollection()}
                    disabled={!newCollectionName.trim() || creating !== null}
                  >
                    {t("create")}
                  </Button>
                </div>
              )}
              {collectionOptions.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                  {t("organizeNoCollections")}
                </p>
              ) : visibleCollections.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {t("organizeNoMatch")}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {visibleCollections.map((option) => {
                    const state = collectionState(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="checkbox"
                        aria-checked={state === "mixed" ? "mixed" : state}
                        onClick={() => toggleCollection(option.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                          state !== false && "font-medium",
                        )}
                        style={{ paddingLeft: 8 + option.depth * 16 }}
                      >
                        <CheckBoxVisual state={state} />
                        <Folder className="size-3.5 shrink-0 text-muted-foreground/80" />
                        <span className="min-w-0 flex-1 truncate">{option.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Target className="size-3.5" /> {t("organizeProjects")}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNewProjectOpen((value) => !value)}
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {t("newProject")}
                  </button>
                  <Link
                    href="/library/projects"
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {t("manageProjects")}
                  </Link>
                </div>
              </div>
              {newProjectOpen && (
                <div className="mb-1.5 flex items-center gap-1">
                  <Input
                    value={newProjectName}
                    onChange={(event) => setNewProjectName(event.target.value)}
                    placeholder={t("projectName")}
                    aria-label={t("newProject")}
                    className="h-7 text-xs"
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void createProject();
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void createProject()}
                    disabled={!newProjectName.trim() || creating !== null}
                  >
                    {t("create")}
                  </Button>
                </div>
              )}
              {projects.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                  {t("organizeNoProjects")}
                </p>
              ) : visibleProjects.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {t("organizeNoMatch")}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {visibleProjects.map((project) => {
                    const state = projectState(project.id);
                    const metrics = projectMetrics(project.id);
                    const locked = metrics.via === metrics.total;
                    return (
                      <button
                        key={project.id}
                        type="button"
                        role="checkbox"
                        aria-checked={state === "mixed" ? "mixed" : state}
                        disabled={locked}
                        title={locked ? t("organizeViaLocked") : undefined}
                        onClick={() => toggleProject(project.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                          state !== false && "font-medium",
                          locked && "cursor-not-allowed opacity-60 hover:bg-transparent",
                        )}
                      >
                        <CheckBoxVisual state={state} disabled={locked} />
                        <Target className="size-3.5 shrink-0 text-muted-foreground/80" />
                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                        {metrics.via > 0 && (
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {t("organizeViaShort")}
                          </span>
                        )}
                        <span className="shrink-0 text-xs whitespace-nowrap tabular-nums text-muted-foreground">
                          {t("countPapers", { count: project.paperCount })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {hasViaMembership && (
                <p className="mt-1 px-2 text-xs leading-relaxed text-muted-foreground/70">
                  {t("organizeViaHint")}
                </p>
              )}
            </section>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {t("organizeFailed")}: {error}
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
