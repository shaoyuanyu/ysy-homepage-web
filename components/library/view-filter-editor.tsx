"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLibraryOrganize } from "@/components/library/library-organize-context";
import { PAPER_KINDS, READING_STATUSES } from "@/lib/library/constants";
import { flattenCollections } from "@/lib/library/projects";
import { cn } from "@/lib/utils";

type Rule = { field: string; op: string; value: string };
export type ViewFilter = {
  version?: number;
  match?: "all" | "any";
  rules?: { field: string; op: string; value: unknown }[];
  groups?: unknown[];
};

const FIELD_OPTIONS = [
  "q",
  "status",
  "kind",
  "year",
  "rating",
  "priority",
  "tag",
  "collection",
  "starred",
  "hasPdf",
  "unfiled",
] as const;

const OPS: Record<string, string[]> = {
  q: ["contains"],
  status: ["eq", "ne"],
  kind: ["eq"],
  year: ["eq", "gte", "lte"],
  rating: ["gte", "lte"],
  priority: ["gte", "lte"],
  tag: ["eq", "contains"],
  collection: ["in"],
  starred: ["eq"],
  hasPdf: ["eq"],
  unfiled: ["eq"],
};

const BOOL_FIELDS = new Set(["starred", "hasPdf", "unfiled"]);
const NUMBER_FIELDS = new Set(["year", "rating", "priority"]);

function rowsFromFilter(filter: ViewFilter): Rule[] | null {
  if (filter.groups && filter.groups.length > 0) return null;
  const rules = filter.rules ?? [];
  if (!Array.isArray(rules)) return null;
  const rows: Rule[] = [];
  for (const raw of rules) {
    if (!raw || typeof raw !== "object") return null;
    const rule = raw as { field?: unknown; op?: unknown; value?: unknown };
    const field = typeof rule.field === "string" ? rule.field : "";
    const op = typeof rule.op === "string" ? rule.op : "";
    if (!(FIELD_OPTIONS as readonly string[]).includes(field)) return null;
    if (!OPS[field]?.includes(op)) return null;
    let value = "";
    if (Array.isArray(rule.value)) value = rule.value.map(String).join(",");
    else if (rule.value !== undefined && rule.value !== null) value = String(rule.value);
    rows.push({ field, op, value });
  }
  return rows;
}

/**
 * 视图筛选条件编辑器：常见字段用「字段 / 操作 / 值」三列，复杂结构可切回 JSON。
 * 之前只能手写整段 JSON，用户既要记字段名又要记数组/布尔写法。
 */
export function ViewFilterEditor({
  filter,
  onChange,
  onValidityChange,
}: {
  filter: ViewFilter;
  onChange: (filter: ViewFilter) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const t = useTranslations("library");
  const { collections } = useLibraryOrganize();
  const collectionOptions = flattenCollections(collections);
  const initialRows = rowsFromFilter(filter);
  const [rows, setRows] = useState<Rule[]>(initialRows ?? []);
  const [match, setMatch] = useState<"all" | "any">(filter.match === "any" ? "any" : "all");
  const [advanced, setAdvanced] = useState(initialRows === null);
  const [raw, setRaw] = useState(() => JSON.stringify(filter, null, 2));
  const [rawError, setRawError] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const built = useMemo<ViewFilter | null>(() => {
    if (advanced) {
      try {
        const parsed = JSON.parse(raw) as ViewFilter;
        return { ...parsed, version: 1 };
      } catch {
        return null;
      }
    }
    return {
      version: 1,
      match,
      rules: rows
        .filter((row) => row.value.trim() !== "")
        .map((row) => {
          let value: unknown = row.value.trim();
          if (NUMBER_FIELDS.has(row.field)) value = Number(value);
          if (BOOL_FIELDS.has(row.field)) value = value === "true";
          if (row.field === "collection") value = [value];
          return { field: row.field, op: row.op, value };
        }),
    };
  }, [advanced, raw, match, rows]);

  useEffect(() => {
    onValidityChange?.(built !== null);
    if (built) onChangeRef.current(built);
  }, [built, onValidityChange]);

  const update = (index: number, patch: Partial<Rule>) => {
    setRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        if (patch.field && patch.field !== row.field) {
          next.op = OPS[patch.field]?.[0] ?? "eq";
          next.value = BOOL_FIELDS.has(patch.field) ? "true" : "";
        }
        if (patch.op && (patch.op === "eq" || patch.op === "ne") && BOOL_FIELDS.has(next.field)) {
          next.value = "true";
        }
        return next;
      }),
    );
  };

  const valueControl = (row: Rule, index: number) => {
    if (row.field === "status") {
      return (
        <Select
          items={READING_STATUSES.map((status) => ({ value: status, label: t(`status_${status}`) }))}
          value={row.value}
          onValueChange={(next) => update(index, { value: next ?? "" })}
        >
          <SelectTrigger className="h-8 w-full" aria-label={t("status")}>
            <SelectValue placeholder={t("status")} />
          </SelectTrigger>
          <SelectContent>
            {READING_STATUSES.map((status) => (
              <SelectItem key={status} value={status} label={t(`status_${status}`)}>
                {t(`status_${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (row.field === "kind") {
      return (
        <Select
          items={PAPER_KINDS.map((kind) => ({ value: kind, label: t(`kind_${kind}`) }))}
          value={row.value}
          onValueChange={(next) => update(index, { value: next ?? "" })}
        >
          <SelectTrigger className="h-8 w-full" aria-label={t("kind")}>
            <SelectValue placeholder={t("kind")} />
          </SelectTrigger>
          <SelectContent>
            {PAPER_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind} label={t(`kind_${kind}`)}>
                {t(`kind_${kind}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (row.field === "collection") {
      return (
        <Select
          items={collectionOptions.map((option) => ({
            value: option.id,
            label: `${"— ".repeat(option.depth)}${option.name}`,
          }))}
          value={row.value}
          onValueChange={(next) => update(index, { value: next ?? "" })}
        >
          <SelectTrigger className="h-8 w-full" aria-label={t("collection")}>
            <SelectValue placeholder={t("collection")} />
          </SelectTrigger>
          <SelectContent>
            {collectionOptions.map((option) => (
              <SelectItem
                key={option.id}
                value={option.id}
                label={`${"— ".repeat(option.depth)}${option.name}`}
              >
                {`${"— ".repeat(option.depth)}${option.name}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (BOOL_FIELDS.has(row.field)) {
      return (
        <Select
          items={[
            { value: "true", label: t("yes") },
            { value: "false", label: t("no") },
          ]}
          value={row.value || "true"}
          onValueChange={(next) => update(index, { value: next ?? "true" })}
        >
          <SelectTrigger className="h-8 w-full" aria-label={row.field}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true" label={t("yes")}>{t("yes")}</SelectItem>
            <SelectItem value="false" label={t("no")}>{t("no")}</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        value={row.value}
        onChange={(event) => update(index, { value: event.target.value })}
        className="h-8"
        inputMode={NUMBER_FIELDS.has(row.field) ? "numeric" : undefined}
        placeholder={row.field === "tag" ? "topic/subtopic" : ""}
        aria-label={row.field}
      />
    );
  };

  return (
    <div className="space-y-2">
      {advanced ? (
        <div>
          <textarea
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              try {
                JSON.parse(event.target.value);
                setRawError(null);
              } catch {
                setRawError(t("invalidJson"));
              }
            }}
            rows={8}
            spellCheck={false}
            aria-label={t("filterJson")}
            className={cn(
              "w-full rounded-lg border-2 bg-transparent p-2 font-mono text-xs leading-relaxed outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30",
              rawError ? "border-destructive/60" : "border-input",
            )}
          />
          {rawError && <p className="mt-1 text-xs text-destructive">{rawError}</p>}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{t("matchLabel")}</span>
              <Select
                items={[
                  { value: "all", label: t("matchAll") },
                  { value: "any", label: t("matchAny") },
                ]}
                value={match}
                onValueChange={(next) => setMatch((next as "all" | "any") ?? "all")}
              >
                <SelectTrigger className="h-7 w-20 text-xs" aria-label={t("matchLabel")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" label={t("matchAll")}>{t("matchAll")}</SelectItem>
                  <SelectItem value="any" label={t("matchAny")}>{t("matchAny")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" size="xs" onClick={() => setRows((current) => [...current, { field: "status", op: "eq", value: "unread" }])}>
              <Plus /> {t("addCondition")}
            </Button>
          </div>
          {rows.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              {t("noConditions")}
            </p>
          ) : (
            <div className="space-y-1.5">
              {rows.map((row, index) => (
                <div key={index} className="flex items-start gap-1.5">
                  <Select
                    items={FIELD_OPTIONS.map((field) => ({ value: field, label: t(field) }))}
                    value={row.field}
                    onValueChange={(next) => update(index, { field: next ?? row.field })}
                  >
                    <SelectTrigger className="h-8 w-32 shrink-0 text-xs" aria-label={t("filterField")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((field) => (
                        <SelectItem key={field} value={field} label={t(field)}>
                          {t(field)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    items={(OPS[row.field] ?? ["eq"]).map((op) => ({ value: op, label: t(`op_${op}`) }))}
                    value={row.op}
                    onValueChange={(next) => update(index, { op: next ?? "eq" })}
                  >
                    <SelectTrigger className="h-8 w-24 shrink-0 text-xs" aria-label={t("filterOp")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(OPS[row.field] ?? ["eq"]).map((op) => (
                        <SelectItem key={op} value={op} label={t(`op_${op}`)}>
                          {t(`op_${op}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="min-w-0 flex-1">{valueControl(row, index)}</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("removeCondition")}
                    onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    className="shrink-0 text-muted-foreground"
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <button
        type="button"
        onClick={() => {
          if (advanced) {
            try {
              const parsed = rowsFromFilter(JSON.parse(raw || "{}") as ViewFilter);
              if (parsed) {
                setRows(parsed);
                setAdvanced(false);
              }
            } catch {
              setRawError(t("invalidJson"));
            }
          } else {
            setRaw(JSON.stringify(built ?? filter, null, 2));
            setAdvanced(true);
          }
        }}
        className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {advanced ? t("backToBuilder") : t("advancedJson")}
      </button>
    </div>
  );
}
