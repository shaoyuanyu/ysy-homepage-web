"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FolderTree, Plus, Trash2 } from "lucide-react";

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

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await libraryApi(`/projects/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border p-3">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Plus className="size-4" /> {t("newProject")}</h3>
        <div className="flex gap-2">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("projectName")} className="h-8 flex-1 rounded-md border bg-background px-2 text-xs" />
          <button type="button" onClick={() => void create()} disabled={busy || !name.trim()} className="h-8 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50">{t("create")}</button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </section>
      <section className="rounded-xl border p-3">
        {projects.length === 0 ? <p className="text-xs text-muted-foreground">{t("noProjects")}</p> : (
          <div className="divide-y text-xs">
            {projects.map((project) => (
              <div key={project.id} className="flex flex-wrap items-center gap-2 py-2">
                <FolderTree className="size-3.5 text-muted-foreground" />
                <span className="font-medium">{project.name}</span>
                <span className="text-muted-foreground">{t("total", { count: project.paperCount })}</span>
                <a href={`/library?project=${project.id}`} className="text-muted-foreground hover:underline">{t("open")}</a>
                <button type="button" onClick={() => void remove(project.id)} className="ml-auto text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
