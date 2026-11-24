"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, Plus, Trash2 } from "lucide-react";

import { LibraryApiError, libraryApi } from "@/lib/library/client";
import type { SavedView } from "@/lib/library/types";

export function ViewsPanel({ views }: { views: SavedView[] }) {
  const t = useTranslations("library");
  const router = useRouter();
  const [name, setName] = useState("");
  const [filter, setFilter] = useState('{\n  "version": 1,\n  "match": "all",\n  "rules": []\n}');
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
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await libraryApi(`/views/${id}`, { method: "DELETE" });
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
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Plus className="size-4" /> {t("newView")}</h3>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("viewName")} className="mb-2 h-8 w-full rounded-md border bg-background px-2 text-xs" />
        <textarea value={filter} onChange={(event) => setFilter(event.target.value)} rows={7} spellCheck={false} className="w-full rounded-md border bg-background p-2 font-mono text-[11px]" />
        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={() => void create()} disabled={busy || !name.trim()} className="h-8 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50">{t("create")}</button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      </section>

      <section className="rounded-xl border p-3">
        {views.length === 0 ? <p className="text-xs text-muted-foreground">{t("noViews")}</p> : (
          <div className="divide-y text-xs">
            {views.map((view) => (
              <div key={view.id} className="flex flex-wrap items-center gap-2 py-2">
                <BookOpen className="size-3.5 text-muted-foreground" />
                <span className="font-medium">{view.name}</span>
                <span className="text-muted-foreground">{t("total", { count: view.count })}</span>
                <code className="max-w-[40%] truncate text-[10px] text-muted-foreground">{JSON.stringify(view.filter)}</code>
                <button type="button" onClick={() => void remove(view.id)} className="ml-auto text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
