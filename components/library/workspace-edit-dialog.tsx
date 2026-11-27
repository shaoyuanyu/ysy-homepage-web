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
import type { ResearchWorkspaceDetail } from "@/lib/library/types";

export function WorkspaceEditDialog({ workspace }: { workspace: ResearchWorkspaceDetail }) {
  const t = useTranslations("library");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(workspace.name);
    setDescription(workspace.description ?? "");
    setError(null);
  }, [open, workspace]);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await libraryApi(`/workspaces/${workspace.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      toast.add({ title: t("workspaceSaved"), type: "success" });
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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground"
      >
        <Pencil /> {t("editWorkspace")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-4" /> {t("editWorkspace")}
            </DialogTitle>
            <DialogDescription>{t("editWorkspaceHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs font-medium">
              {t("workspaceName")}
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1"
                autoFocus
              />
            </label>
            <label className="block text-xs font-medium">
              {t("workspaceDescription")}
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border-2 border-input bg-transparent p-2 text-sm leading-relaxed outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
              />
            </label>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
