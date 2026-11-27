"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useLibraryOrganize } from "@/components/library/library-organize-context";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import { PAPER_KINDS, READING_STATUSES } from "@/lib/library/constants";
import { flattenCollections } from "@/lib/library/projects";
import type { TagNode } from "@/lib/library/types";

const kinds = PAPER_KINDS;

/** 筛选菜单：无边框、纯文字 + chevron，悬停才浮出底色。
 *  筛选栏里「选择」和「输入」用两种语言：搜索是唯一的填入式控件，两个筛选是
 *  轻量菜单——不再是一排描边输入框，避免把工具栏变成表单。
 *  弹层用 shadcn Select（Base UI），不再用系统原生下拉。 */
const selectTriggerClass =
  "h-8 gap-0.5 rounded-lg border-0 bg-transparent py-0 pl-2 pr-1 text-sm text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-transparent dark:hover:bg-accent [&_svg]:!size-3.5 [&_svg]:text-muted-foreground/60";

const ALL = "all";

function FilterSelect({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      items={items}
      value={value || ALL}
      onValueChange={(next) => onChange(next === ALL ? "" : (next ?? ""))}
    >
      <SelectTrigger aria-label={label} className={selectTriggerClass}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" className="min-w-36">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} label={item.label}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type ViewRule = {
  field: string;
  op: string;
  value: string | number | boolean | string[];
};

/** 把当前 URL 筛选翻译成视图 filter DSL；项目/视图上下文没有对应字段，不保存。 */
function filterFromSearch(params: URLSearchParams): ViewRule[] {
  const rules: ViewRule[] = [];
  const q = params.get("q")?.trim();
  if (q) rules.push({ field: "q", op: "contains", value: q });
  const status = params.get("status");
  if (status) rules.push({ field: "status", op: "eq", value: status });
  const kind = params.get("kind");
  if (kind) rules.push({ field: "kind", op: "eq", value: kind });
  const year = params.get("year");
  if (year) rules.push({ field: "year", op: "eq", value: Number(year) });
  const tag = params.get("tag");
  if (tag) rules.push({ field: "tag", op: "eq", value: tag });
  const collection = params.get("collection");
  if (collection) rules.push({ field: "collection", op: "in", value: [collection] });
  if (params.get("starred") === "1") rules.push({ field: "starred", op: "eq", value: true });
  if (params.get("unfiled") === "1") rules.push({ field: "unfiled", op: "eq", value: true });
  return rules;
}

function SaveViewButton({ rules }: { rules: ViewRule[] }) {
  const t = useTranslations("library");
  const router = useRouter();
  const { collections, tags } = useLibraryOrganize();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collectionName = (id: string) =>
    flattenCollections(collections).find((item) => item.id === id)?.name ?? id.slice(0, 8);
  const tagPath = (path: string) => {
    const walk = (nodes: TagNode[]): string | undefined => {
      for (const node of nodes) {
        if (node.path === path) return node.path;
        const found = walk(node.children);
        if (found) return found;
      }
      return undefined;
    };
    return walk(tags) ?? path;
  };
  const ruleLabel = (rule: ViewRule) => {
    const value = Array.isArray(rule.value) ? rule.value.join(", ") : String(rule.value);
    if (rule.field === "q") return `${t("searchPlaceholder")}: ${value}`;
    if (rule.field === "status") return `${t("status")}: ${t(`status_${value}`)}`;
    if (rule.field === "kind") return `${t("kind")}: ${t(`kind_${value}`)}`;
    if (rule.field === "collection")
      return `${t("collections")}: ${Array.isArray(rule.value) ? rule.value.map(collectionName).join(", ") : value}`;
    if (rule.field === "tag") return `${t("tags")}: ${tagPath(value)}`;
    if (rule.field === "starred") return t("starred");
    if (rule.field === "unfiled") return t("unfiled");
    return `${rule.field}: ${value}`;
  };

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const view = await libraryApi<{ id: string }>("/views", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          filter: { version: 1, match: "all", rules },
        }),
      });
      toast.add({ title: t("viewSaved"), type: "success" });
      setOpen(false);
      setName("");
      router.refresh();
      router.push(`/library?view=${view.id}`);
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (rules.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {t("saveAsView")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("saveAsView")}</DialogTitle>
            <DialogDescription>{t("saveAsViewHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("viewName")}
              aria-label={t("viewName")}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") void save();
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              {rules.map((rule, index) => (
                <span key={index} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {ruleLabel(rule)}
                </span>
              ))}
            </div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={busy || !name.trim()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
      if (target?.closest("input, textarea, select, [data-slot='select-trigger'], [contenteditable='true']")) return;
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
    next.delete("trail");
    router.push(`/library${next.size ? `?${next.toString()}` : ""}`);
  };

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    next.delete("trail");
    router.push(`/library${next.size ? `?${next.toString()}` : ""}`);
  };

  // 集合/项目/视图/标签是「当前在看什么」，不是筛选条件：清除筛选不能把
  // 用户从集合/项目里踢出去。q/status/kind/year/starred/unfiled 才是可清的筛选。
  const filterKeys = ["q", "status", "kind", "year", "starred", "unfiled"];
  const hasClearable = filterKeys.some((key) => searchParams.has(key));
  const viewRules = filterFromSearch(searchParams);
  const canSaveView = !searchParams.has("project") && !searchParams.has("view");
  const clearHref = (() => {
    const next = new URLSearchParams(searchParams.toString());
    for (const key of [...filterKeys, "cursor", "trail"]) next.delete(key);
    return `/library${next.size ? `?${next.toString()}` : ""}`;
  })();

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
            value={searchParams.get("status") ?? ""}
            items={[
              { value: ALL, label: t("statusAll") },
              ...READING_STATUSES.map((status) => ({
                value: status,
                label: t(`status_${status}`),
              })),
            ]}
            onChange={(value) => setParam("status", value)}
          />
          <FilterSelect
            label={t("kind")}
            value={searchParams.get("kind") ?? ""}
            items={[
              { value: ALL, label: t("kindAll") },
              ...kinds.map((kind) => ({ value: kind, label: t(`kind_${kind}`) })),
            ]}
            onChange={(value) => setParam("kind", value)}
          />
          <FilterSelect
            label={t("sort")}
            value={searchParams.get("sort") ?? "added"}
            items={[
              { value: "added", label: t("sortAdded") },
              { value: "year", label: t("sortYear") },
              { value: "title", label: t("sortTitle") },
              { value: "updated", label: t("sortUpdated") },
            ]}
            onChange={(value) => setParam("sort", value)}
          />
          {canSaveView && <SaveViewButton rules={viewRules} />}
          {hasClearable && (
            <button
              type="button"
              onClick={() => router.push(clearHref)}
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
