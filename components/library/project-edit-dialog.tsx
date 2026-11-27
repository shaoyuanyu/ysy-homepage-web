"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Pencil } from "lucide-react";

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
import type { Project } from "@/lib/library/types";

/** 项目元信息编辑：名称、描述、citekey 模板、导出是否含摘要。 */
export function ProjectEditDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}) {
  const t = useTranslations("library");
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [citekeyTemplate, setCitekeyTemplate] = useState(project.citekeyTemplate ?? "");
  const [includeAbstract, setIncludeAbstract] = useState(project.exportIncludeAbstract);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setDescription(project.description ?? "");
    setCitekeyTemplate(project.citekeyTemplate ?? "");
    setIncludeAbstract(project.exportIncludeAbstract);
    setError(null);
  }, [open, project]);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await libraryApi(`/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          citekeyTemplate: citekeyTemplate.trim() || null,
          exportIncludeAbstract: includeAbstract,
        }),
      });
      toast.add({ title: t("projectSaved"), type: "success" });
      onOpenChange(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof LibraryApiError ? caught.message : t("actionFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4" /> {t("editProject")}
          </DialogTitle>
          <DialogDescription>{t("editProjectHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-xs font-medium">
            {t("projectName")}
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1"
              autoFocus
            />
          </label>
          <label className="block text-xs font-medium">
            {t("projectDescription")}
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border-2 border-input bg-transparent p-2 text-sm leading-relaxed outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
            />
          </label>
          <label className="block text-xs font-medium">
            {t("citekeyTemplate")}
            <Input
              value={citekeyTemplate}
              onChange={(event) => setCitekeyTemplate(event.target.value)}
              placeholder={t("citekeyTemplateHint")}
              className="mt-1 font-mono text-xs"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeAbstract}
              onChange={(event) => setIncludeAbstract(event.target.checked)}
              className="size-4 accent-foreground"
            />
            {t("exportIncludeAbstract")}
          </label>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("cancel")}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
