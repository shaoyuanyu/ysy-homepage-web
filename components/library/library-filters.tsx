"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { READING_STATUSES } from "@/lib/library/constants";

const kinds = ["journal", "conference", "preprint", "book", "book_chapter", "thesis", "tech_report"];

/** 筛选菜单：无边框、纯文字 + chevron，悬停才浮出底色。
 *  筛选栏里「选择」和「输入」用两种语言：搜索是唯一的填入式控件，两个筛选是
 *  轻量菜单——不再是一排描边输入框，避免把工具栏变成表单。 */
const selectClass =
  "h-8 appearance-none rounded-lg bg-transparent pl-2 pr-6 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50";

/** 两个筛选项共用同一形态：原生 select 保留平台菜单/键盘行为，
 *  只去掉浏览器默认的边框与箭头，换成统一的 chevron。 */
function FilterSelect({
  label,
  allLabel,
  value,
  onChange,
  children,
}: {
  label: string;
  allLabel: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <span className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={selectClass}
        aria-label={label}
      >
        <option value="">{allLabel}</option>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-1.5 size-3.5 text-muted-foreground/60"
      />
    </span>
  );
}

export function LibraryFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("library");
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  // URL 上的 q 变化（前进/后退、侧栏切筛选、清空筛选）时同步输入框；
  // 否则客户端组件被复用，输入框会显示上一次的关键词
  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
  }, [searchParams]);

  // 「/」聚焦搜索（GitHub / Linear 同款工具意图）：输入框/文本域里按 / 不拦截
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  // 已生效的筛选（URL 为准，不是输入框里的草稿）做成可单独移除的 chip
  const appliedQuery = searchParams.get("q")?.trim();
  const appliedStatus = searchParams.get("status");
  const appliedKind = searchParams.get("kind");
  const chips: { key: string; label: string; value: string; onClear: () => void }[] = [];
  if (appliedQuery) {
    chips.push({
      key: "q",
      label: t("q"),
      value: appliedQuery,
      onClear: () => {
        setQ("");
        setParam("q", "");
      },
    });
  }
  if (appliedStatus) {
    chips.push({
      key: "status",
      label: t("status"),
      value: t(`status_${appliedStatus}`),
      onClear: () => setParam("status", ""),
    });
  }
  if (appliedKind) {
    chips.push({
      key: "kind",
      label: t("kind"),
      value: t(`kind_${appliedKind}`),
      onClear: () => setParam("kind", ""),
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <form onSubmit={submit} className="min-w-0 flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
            <input
              ref={inputRef}
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="h-9 w-full rounded-lg bg-muted/55 pl-9 pr-16 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 hover:bg-muted/70 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/25 dark:bg-muted/35 dark:focus-visible:bg-background"
            />
            {!q && (
              <kbd
                aria-hidden
                className="pointer-events-none absolute right-2.5 top-1/2 hidden h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded border border-border/70 bg-background px-1 font-mono text-xs text-muted-foreground/60 sm:flex"
              >
                /
              </kbd>
            )}
            {q && (
              <button
                type="button"
                aria-label={t("clearSearch")}
                onClick={() => {
                  setQ("");
                  setParam("q", "");
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-1">
          <FilterSelect
            label={t("status")}
            allLabel={t("statusAll")}
            value={searchParams.get("status") ?? ""}
            onChange={(value) => setParam("status", value)}
          >
            {READING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`status_${status}`)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label={t("kind")}
            allLabel={t("kindAll")}
            value={searchParams.get("kind") ?? ""}
            onChange={(value) => setParam("kind", value)}
          >
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {t(`kind_${kind}`)}
              </option>
            ))}
          </FilterSelect>
          {searchParams.size > 0 && (
            <button
              type="button"
              onClick={() => router.push("/library")}
              className="h-8 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {t("clearFilters")}
            </button>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-muted/70 pl-2.5 pr-1 text-xs"
            >
              <span className="shrink-0 text-muted-foreground">{chip.label}</span>
              <span aria-hidden className="text-muted-foreground/40">·</span>
              <span className="min-w-0 truncate">{chip.value}</span>
              <button
                type="button"
                onClick={chip.onClear}
                aria-label={`${t("clearFilters")}: ${chip.label} ${chip.value}`}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
