"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteDialog } from "@/components/library/delete-dialog";
import { RenameDialog } from "@/components/library/rename-dialog";
import { Link } from "@/lib/i18n/navigation";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import type { SavedView } from "@/lib/library/types";

const EXAMPLE_FILTER = `{
  "version": 1,
  "match": "all",
  "rules": [{ "field": "status", "op": "eq", "value": "unread" }]
}`;

export function ViewsPanel({ views }: { views: SavedView[] }) {
  const t = useTranslations("library");
  const router = useRouter();
  const [name, setName] = useState("");
  const [filter, setFilter] = useState(`{
  "version": 1,
  "match": "all",
  "rules": [
    { "field": "status", "op": "eq", "value": "unread" }
  ]
}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(filter);
    } catch {
      setError(t("invalidJson"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await libraryApi("/views", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), filter: parsed }),
      });
      setName("");
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

  const rename = async (id: string, next: string) => {
    await libraryApi(`/views/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: next }),
    });
    router.refresh();
  };

  const remove = async (id: string) => {
    // 错误交给 DeleteDialog 显示并保持弹窗打开；不要在这里吞掉，
    // 否则删除失败时弹窗会「成功关闭」，看起来像删掉了
    await libraryApi(`/views/${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <section className="rounded-xl border bg-card/40 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plus className="size-4" /> {t("newView")}</h3>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("viewName")}
          aria-label={t("viewName")}
          className="mb-2"
        />
        <textarea
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          rows={6}
          spellCheck={false}
          aria-label={t("filterJson")}
          className="w-full rounded-lg border-2 border-input bg-transparent p-2 font-mono text-xs leading-relaxed outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter(EXAMPLE_FILTER)}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("fillExample")}
          </button>
          <details className="min-w-0 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">
              {t("supportedFields")}
            </summary>
            <p className="mt-1 leading-relaxed text-muted-foreground/80">{t("filterHint")}</p>
            <p className="mt-1 break-words font-mono text-muted-foreground/70">
              status · year · kind · tag · collection · starred · hasPdf · venue.ccf.level · venue.cas.level · priority · rating · addedAt
            </p>
          </details>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            variant={name.trim() ? "default" : "outline"}
            onClick={() => void create()}
            disabled={busy || !name.trim()}
          >
            {t("create")}
          </Button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
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
              <div key={view.id} className="flex flex-wrap items-center gap-2 py-2.5 transition-colors hover:bg-accent/20">
                <BookOpen className="size-4 shrink-0 text-muted-foreground" />
                <Link
                  href={`/library?view=${view.id}`}
                  className="min-w-0 truncate font-medium hover:underline hover:underline-offset-2"
                >
                  {view.name}
                </Link>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t("countPapers", { count: view.count })}
                </span>
                <code className="max-w-[40%] truncate font-mono text-xs text-muted-foreground">{JSON.stringify(view.filter)}</code>
                <span className="ml-auto flex shrink-0 items-center gap-0.5">
                  <RenameDialog value={view.name} onRename={(name) => rename(view.id, name)} />
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
    </div>
  );
}
