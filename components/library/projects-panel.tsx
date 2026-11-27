"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Folder, Pencil, Plus, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteDialog } from "@/components/library/delete-dialog";
import { ProjectCollectionsDialog } from "@/components/library/project-collections-dialog";
import { ProjectEditDialog } from "@/components/library/project-edit-dialog";
import { useLibraryOrganize } from "@/components/library/library-organize-context";
import { Link } from "@/lib/i18n/navigation";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import { flattenCollections } from "@/lib/library/projects";
import type { Project } from "@/lib/library/types";

export function ProjectsPanel({ projects }: { projects: Project[] }) {
  const t = useTranslations("library");
  const router = useRouter();
  const { collections } = useLibraryOrganize();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Project | null>(null);
  const [managing, setManaging] = useState<Project | null>(null);

  const collectionNames = useMemo(
    () => new Map(flattenCollections(collections).map((item) => [item.id, item.name])),
    [collections],
  );

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await libraryApi("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      });
      setName("");
      setDescription("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    // 错误交给 DeleteDialog 显示并保持弹窗打开；不要在这里吞掉，
    // 否则删除失败时弹窗会「成功关闭」，看起来像删掉了
    await libraryApi(`/projects/${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <section className="rounded-xl border bg-card/40 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plus className="size-4" /> {t("newProject")}</h3>
        <div className="flex flex-col gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("projectName")}
            aria-label={t("projectName")}
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("projectDescription")}
            aria-label={t("projectDescription")}
            rows={2}
            className="w-full rounded-lg border-2 border-input bg-transparent p-2 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
          />
          <Button
            type="button"
            variant={name.trim() ? "default" : "outline"}
            onClick={() => void create()}
            disabled={busy || !name.trim()}
          >
            {t("create")}
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </section>
      <section className="rounded-xl border p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Target className="size-4" /> {t("projects")}
          <span className="text-xs font-normal tabular-nums text-muted-foreground">
            {projects.length}
          </span>
        </h3>
        {projects.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed px-4 py-10 text-center">
            <Target className="size-5 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">{t("noProjects")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t("noProjectsHint")}</p>
          </div>
        ) : (
          <div className="divide-y text-sm">
            {projects.map((project) => {
              const linked = project.collectionIds
                .map((id) => collectionNames.get(id) ?? id.slice(0, 8))
                .filter(Boolean);
              return (
                <div
                  key={project.id}
                  className="flex flex-wrap items-start gap-2 py-3 transition-colors hover:bg-accent/20"
                >
                  <Target className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Link
                        href={`/library?project=${project.id}`}
                        className="min-w-0 truncate font-medium hover:underline hover:underline-offset-2"
                      >
                        {project.name}
                      </Link>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {t("countPapers", { count: project.paperCount })}
                      </span>
                    </div>
                    {project.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground/80">
                        {project.description}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {linked.length > 0 ? (
                        linked.map((collectionName) => (
                          <span key={collectionName} className="inline-flex items-center gap-1">
                            <Folder className="size-3" aria-hidden />
                            {collectionName}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground/60">{t("projectNoCollections")}</span>
                      )}
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setManaging(project)}
                      className="h-7 px-2 text-xs font-normal text-muted-foreground"
                    >
                      <Folder /> {t("projectCollections")}
                    </Button>
                    <a
                      href={`/library?project=${project.id}`}
                      className="px-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {t("open")}
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("editProject")}
                      title={t("editProject")}
                      onClick={() => setEditing(project)}
                    >
                      <Pencil />
                    </Button>
                    <DeleteDialog
                      label={project.name}
                      description={t("deleteProjectHint")}
                      onDelete={() => remove(project.id)}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editing && (
        <ProjectEditDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          project={editing}
        />
      )}
      {managing && (
        <ProjectCollectionsDialog
          open
          onOpenChange={(open) => {
            if (!open) setManaging(null);
          }}
          project={managing}
          collections={collections}
        />
      )}
    </div>
  );
}
