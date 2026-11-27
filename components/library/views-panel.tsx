"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, Loader2, Pencil, Plus } from "lucide-react";

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
import { DeleteDialog } from "@/components/library/delete-dialog";
import { ViewFilterEditor, type ViewFilter } from "@/components/library/view-filter-editor";
import { useLibraryOrganize } from "@/components/library/library-organize-context";
import { Link } from "@/lib/i18n/navigation";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import { flattenCollections } from "@/lib/library/projects";
import { toast } from "@/components/ui/toast";
import type { SavedView } from "@/lib/library/types";

const EMPTY_FILTER: ViewFilter = { version: 1, match: "all", rules: [] };

export function ViewsPanel({ views }: { views: SavedView[] }) {
  const t = useTranslations("library");
  const router = useRouter();
  const { collections } = useLibraryOrganize();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SavedView | null>(null);
  const [name, setName] = useState("");
  const [filter, setFilter] = useState<ViewFilter>(EMPTY_FILTER);
  const [valid, setValid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collectionNames = useMemo(
    () => new Map(flattenCollections(collections).map((item) => [item.id, item.name])),
    [collections],
  );

  const startCreate = () => {
    setEditing(null);
    setName("");
    setFilter(EMPTY_FILTER);
    setValid(true);
    setError(null);
    setOpen(true);
  };

  const startEdit = (view: SavedView) => {
    setEditing(view);
    setName(view.name);
    setFilter(view.filter as ViewFilter);
    setValid(true);
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim() || !valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await libraryApi(`/views/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim(), filter }),
        });
        toast.add({ title: t("viewUpdated"), type: "success" });
      } else {
        await libraryApi("/views", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), filter }),
        });
        toast.add({ title: t("viewSaved"), type: "success" });
      }
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof LibraryApiError
          ? `${t("invalidFilter")}: ${caught.message}`
          : t("actionFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    // 错误交给 DeleteDialog 显示并保持弹窗打开；不要在这里吞掉，
    // 否则删除失败时弹窗会「成功关闭」，看起来像删掉了
    await libraryApi(`/views/${id}`, { method: "DELETE" });
    router.refresh();
  };

  const ruleText = (value: unknown): string => {
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "boolean") return value ? t("yes") : t("no");
    return String(value);
  };

  const summarize = (viewFilter: ViewFilter): string => {
    if (viewFilter.groups && viewFilter.groups.length > 0) {
      return t("viewComplexFilter");
    }
    const rules = viewFilter.rules ?? [];
    if (rules.length === 0) return t("noConditions");
    return rules
      .slice(0, 3)
      .map((rule) => {
        const value =
          rule.field === "collection" && Array.isArray(rule.value)
            ? rule.value
                .map((id) => collectionNames.get(String(id)) ?? String(id).slice(0, 8))
                .join(", ")
            : rule.field === "status"
              ? t(`status_${ruleText(rule.value)}`)
              : rule.field === "kind"
                ? t(`kind_${ruleText(rule.value)}`)
                : ruleText(rule.value);
        const fieldLabel = t.has(rule.field) ? t(rule.field) : rule.field;
        const opLabel = t.has(`op_${rule.op}`) ? t(`op_${rule.op}`) : rule.op;
        return `${fieldLabel} ${opLabel} ${value}`;
      })
      .join(" · ")
      .concat(rules.length > 3 ? ` +${rules.length - 3}` : "");
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <section className="rounded-xl border bg-card/40 p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Plus className="size-4" /> {t("newView")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("newViewHint")}</p>
        <Button type="button" className="mt-3 w-full" onClick={startCreate}>
          <Plus /> {t("newView")}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground/70">{t("noViewsHint")}</p>
      </section>

      <section className="rounded-xl border p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="size-4" /> {t("views")}
          <span className="text-xs font-normal tabular-nums text-muted-foreground">
            {views.length}
          </span>
        </h3>
        {views.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed px-4 py-10 text-center">
            <BookOpen className="size-5 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">{t("noViews")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t("noViewsHint")}</p>
          </div>
        ) : (
          <div className="divide-y text-sm">
            {views.map((view) => (
              <div key={view.id} className="flex flex-wrap items-start gap-2 py-3 transition-colors hover:bg-accent/20">
                <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/library?view=${view.id}`}
                      className="min-w-0 truncate font-medium hover:underline hover:underline-offset-2"
                    >
                      {view.name}
                    </Link>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {t("countPapers", { count: view.count })}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {summarize(view.filter as ViewFilter)}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("editView")}
                    title={t("editView")}
                    onClick={() => startEdit(view)}
                  >
                    <Pencil />
                  </Button>
                  <DeleteDialog
                    label={view.name}
                    description={t("deleteViewHint")}
                    onDelete={() => remove(view.id)}
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? t("editView") : t("newView")}</DialogTitle>
            <DialogDescription>{t("viewEditorHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("viewName")}
              aria-label={t("viewName")}
              autoFocus
            />
            <ViewFilterEditor
              key={editing?.id ?? "new"}
              filter={filter}
              onChange={setFilter}
              onValidityChange={setValid}
            />
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={busy || !name.trim() || !valid}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
