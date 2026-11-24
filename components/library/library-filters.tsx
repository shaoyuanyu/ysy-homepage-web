"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { useState, type FormEvent } from "react";

const statuses = ["unread", "queued", "reading", "read", "reviewed", "archived"];
const kinds = ["journal", "conference", "preprint", "book", "book_chapter", "thesis", "tech_report"];

export function LibraryFilters({ total }: { total: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("library");
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = new URLSearchParams(searchParams.toString());
    if (q.trim()) next.set("q", q.trim());
    else next.delete("q");
    next.delete("cursor");
    router.push(`/library${next.size ? `?${next.toString()}` : ""}`);
  };

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    router.push(`/library${next.size ? `?${next.toString()}` : ""}`);
  };

  return (
    <div className="mb-3 flex flex-col gap-2 rounded-xl border bg-card/40 p-3 sm:flex-row sm:items-center">
      <form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-9 w-full rounded-md border bg-background pl-8 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {q && (
            <button
              type="button"
              aria-label={t("clearSearch")}
              onClick={() => {
                setQ("");
                setParam("q", "");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <button type="submit" className="h-9 rounded-md border px-3 text-xs hover:bg-accent">
          {t("search")}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={searchParams.get("status") ?? ""}
          onChange={(event) => setParam("status", event.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-xs"
          aria-label={t("status")}
        >
          <option value="">{t("statusAll")}</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {t(`status_${status}`)}
            </option>
          ))}
        </select>
        <select
          value={searchParams.get("kind") ?? ""}
          onChange={(event) => setParam("kind", event.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-xs"
          aria-label={t("kind")}
        >
          <option value="">{t("kindAll")}</option>
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kind_${kind}`)}
            </option>
          ))}
        </select>
        {searchParams.size > 0 && (
          <button
            type="button"
            onClick={() => router.push("/library")}
            className="h-9 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t("clearFilters")}
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {t("total", { count: total })}
        </span>
      </div>
    </div>
  );
}
