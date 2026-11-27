"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteDialog } from "@/components/library/delete-dialog";
import { RenameDialog } from "@/components/library/rename-dialog";
import { Link } from "@/lib/i18n/navigation";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import type { Project } from "@/lib/library/types";

export function ProjectsPanel({ projects }: { projects: Project[] }) {
  const t = useTranslations("library");
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await libraryApi("/projects", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      setName("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id: string, next: string) => {
    await libraryApi(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: next }),
    });
    router.refresh();
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
            {projects.map((project) => (
              <div key={project.id} className="flex flex-wrap items-center gap-2 py-2.5 transition-colors hover:bg-accent/20">
                <Target className="size-4 shrink-0 text-muted-foreground" />
                <Link
                  href={`/library?project=${project.id}`}
                  className="min-w-0 truncate font-medium hover:underline hover:underline-offset-2"
                >
                  {project.name}
                </Link>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t("countPapers", { count: project.paperCount })}
                </span>
                <a href={`/library?project=${project.id}`} className="ml-auto text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("open")}</a>
                <span className="flex shrink-0 items-center gap-0.5">
                  <RenameDialog value={project.name} onRename={(name) => rename(project.id, name)} />
                  <DeleteDialog
                    label={project.name}
                    description={t("deleteProjectHint")}
                    onDelete={() => remove(project.id)}
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
