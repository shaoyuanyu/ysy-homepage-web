"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BookMarkedIcon, RotateCcwIcon } from "lucide-react";

import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ScholarCount,
  ScholarFilter,
  ScholarFilterRow,
  ScholarStats,
} from "@/components/scholar/scholar-shell";
import { useOwnerPreferences } from "@/lib/preferences/use-owner-preferences";
import { cas, formatIssn, shortSubjectName, type CasEntry, type CasZone } from "@/lib/data";
import { casChipClass, casDotClass, casZoneTextClass, GRADE_CHIP_CLASS, TOP_CHIP_CLASS } from "@/lib/design/grade";

type ZoneFilter = "all" | "1" | "2" | "3" | "4";
type TopFilter = "all" | "top" | "non";

/* ---- 分区专属配色：见 lib/design/grade.ts（与 ccf / deadlines / venues 同一事实来源）---- */

/** Top 期刊徽章（几何与分区徽章同源；用中性前景色实底与等级色区分） */
function TopBadge({ show }: { show: boolean }) {
  const t = useTranslations("cas");
  if (!show) return null;
  return (
    <span
      className={`${GRADE_CHIP_CLASS} font-mono font-semibold ${TOP_CHIP_CLASS}`}
    >
      {t("topBadge")}
    </span>
  );
}

/** 期刊名里的 WoS 收录（ESCI 等灰色、SCIE 主色、On Hold 警示色） */
function WosChip({ w }: { w: string }) {
  const t = useTranslations("cas");
  const clean = w.replace(/OnHold|Suppressed/g, "").trim();
  const onHold = /OnHold|Suppressed/.test(w);
  const isS = clean.includes("SCIE") || clean.includes("SSCI");
  return (
    <span
      className={`shrink-0 text-xs whitespace-nowrap ${
        onHold
          ? "font-medium text-amber-700 dark:text-amber-500"
          : isS
            ? "font-medium text-foreground/70"
            : "text-muted-foreground"
      }`}
    >
      {clean || w}
      {onHold ? ` · ${t("wosOnHold")}` : ""}
    </span>
  );
}

/* ---- 小类（JCR 学科）：嵌在刊名下面的一行知识点，随行宽自动换行 ---- */

/**
 * 期刊行 = 左对齐的三行文本块 + 右上角状态徽章。
 *
 * 结构上的关键决定：**小类是「挂在刊名下面的子列表」，不是平行的一列。**
 * 每本刊挂 1–4 个学科，条数不定；把变长的子列表放到右侧独立一列，会同时出现
 * 两个毛病（2026-10-29 用户指着截图问「这种排版你自己觉得没问题吗」）：
 *   1. **左半行 L 形空白**——刊名 + 元信息只占顶部，而那一竖列要等最长的子列表
 *      走完：一本挂 4 个小类的刊，行高 100px，左边 60px 是空的；
 *   2. **子列表的数字被推到列右缘，紧贴徽章**——`1区 19/352 [Top] [1区]` 四个
 *      深色 token 挤在 180px 里，看着像渲染重复。
 * 子列表归属父项，就应该缩在父项下面：整行变成一条左对齐的文本流，行高也稳
 * （小类几乎总能在 1 行内铺完，758 行行高基本一致，不再忽高忽低）。
 */
function SubjectLine({ entry, mainZone }: { entry: CasEntry; mainZone: CasZone }) {
  const t = useTranslations("cas");
  const isZh = useLocale() === "zh";
  if (!entry.s.length) return null;

  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs">
      {/* 一个行级标签，而不是列头：它解释了下面一串东西是什么（小类），
          而 `大类` 那个概念由元信息行的「大类排名」与徽章的 aria-label 负责。
          ⚠ 不要用 `text-muted-foreground/70`：实测对比度 2.82:1（AA 需 4.5）。 */}
      <span className="shrink-0 text-muted-foreground">{t("subjectsLabel")}</span>
      {entry.s.map((sub, i) => {
        const deviates = sub.l !== mainZone;
        const zoneLabel = t("zoneBadge", { zone: sub.l });
        return (
          <Fragment key={sub.en}>
            {i > 0 ? (
              <span aria-hidden className="shrink-0 text-muted-foreground">
                ·
              </span>
            ) : null}
            <span
              className="flex min-w-0 items-baseline gap-x-1.5"
              title={t(deviates ? "subjectTooltipDeviates" : "subjectTooltip", {
                zh: sub.zh,
                en: sub.en,
                zone: zoneLabel,
                main: t("zoneBadge", { zone: mainZone }),
                rank: sub.r,
                total: sub.t,
              })}
            >
              <span className="text-muted-foreground">
                {shortSubjectName(sub, cas.mainField, isZh)}
              </span>
              {/* 分区着色只在「与所属大类不一致」时出现：同一行里 90% 的小类与
                  大类同区，若逐条上色，一行会出现三四个色点，颜色反而不携带信息。
                  改后颜色 = 异常值信号（小类 2区 但大类 1区），正常条目一律次要色。 */}
              <span
                className={`shrink-0 tabular-nums ${
                  deviates ? casZoneTextClass(sub.l) : "text-muted-foreground"
                }`}
              >
                {zoneLabel}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {sub.r}/{sub.t}
              </span>
            </span>
          </Fragment>
        );
      })}
    </span>
  );
}

/* ---- 分区徽章（大类分区号；与 CCF 等级徽章同规格：`1区` 而非裸数字） ---- */
function ZoneBadge({ zone }: { zone: CasZone }) {
  const t = useTranslations("cas");
  return (
    <span
      className={`${GRADE_CHIP_CLASS} font-mono font-semibold ${casChipClass(zone)}`}
      aria-label={t("zoneAria", { zone })}
    >
      {t("zoneBadge", { zone })}
    </span>
  );
}

/* ---- 数据展示主表行 ---- */
function EntryRow({ entry }: { entry: CasEntry }) {
  const t = useTranslations("cas");
  // entry.m = [大类中文名, 分区, 大类内排名, 大类内总数]
  const [, mainZone, mainRank, mainTotal] = entry.m;
  return (
    <li className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-foreground/5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="min-w-0 truncate font-serif text-base" data-proper-name="" title={entry.n}>
          {entry.n}
        </span>
        {/* 小类紧贴刊名：它是这张表的主角（分区/排名），ISSN 那行是身份信息，放最后。 */}
        <SubjectLine entry={entry} mainZone={mainZone} />
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          {entry.i ? (
            <span className="shrink-0 font-mono">{formatIssn(entry.i)}</span>
          ) : null}
          {entry.i ? <span className="shrink-0" aria-hidden>·</span> : null}
          <span className="shrink-0 whitespace-nowrap">
            {t("rank")} <span className="tabular-nums">{mainRank}/{mainTotal}</span>
          </span>
          {/* WoS 收录用 `·` 与前面两项同规格分隔：只靠颜色深浅区分时，
              `1/758 SCIE` 会被读成一个 token。 */}
          {entry.w ? <span className="shrink-0" aria-hidden>·</span> : null}
          <WosChip w={entry.w} />
        </span>
      </span>
      {/* 状态徽章：右上角一列，右缘固定。小类不再占右侧一列，
          所以这里只放「这本刊整体是什么档」的两个标记。 */}
      <span className="flex shrink-0 items-start gap-1.5">
        <TopBadge show={entry.top} />
        <ZoneBadge zone={mainZone} />
      </span>
    </li>
  );
}

/* ---- 统计条由 ScholarStats 统一渲染（原四张大卡片已移除） ---- */

export function CasDirectory() {
  const t = useTranslations("cas");

  const { ready, prefs, setPref } = useOwnerPreferences();

  const [query, setQuery] = useState("");
  const [zone, setZone] = useState<ZoneFilter>("all");
  const [top, setTop] = useState<TopFilter>("all");

  /** 期刊是否命中某分区（大类） */
  const entryInZone = (e: CasEntry, z: string) => e.m[1] === z;

  /** 期刊名 → ISSN 搜索词（数据无缩写字段，ISSN 兜底） */
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return cas.rows.filter((e) => {
      if (zone !== "all" && !entryInZone(e, zone)) return false;
      if (top === "top" && !e.top) return false;
      if (top === "non" && e.top) return false;
      if (!q) return true;
      return (
        norm(e.n).includes(q) ||
        norm(e.i).includes(q) ||
        norm(e.w).includes(q) ||
        e.s.some((s) => norm(s.en).includes(q) || norm(s.zh).includes(q))
      );
    });
  }, [query, zone, top]);

  const shown = filtered.length;
  const zones = useMemo(() => {
    const count: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0 };
    for (const e of cas.rows) count[e.m[1]] += 1;
    return count;
  }, []);

  const resetFilters = () => {
    setQuery("");
    setZone("all");
    setTop("all");
  };

  // 偏好持久化 key（与 ccf:filters 同模式：游客 localStorage / 主人服务器）
  const STORAGE_KEY = "cas:filters";

  type SavedFilters = {
    q?: string;
    zone?: ZoneFilter;
    top?: TopFilter;
  };

  // 首次恢复：URL 参数优先 → 偏好
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    const p = new URLSearchParams(window.location.search);
    const z = p.get("zone");
    const tp = p.get("top");
    const q = p.get("q");
    if (z || tp || q !== null) {
      if (q !== null) setQuery(q);
      if (z === "1" || z === "2" || z === "3" || z === "4") setZone(z);
      if (tp === "top" || tp === "non") setTop(tp);
      restored.current = true;
      return;
    }
    if (!ready) return; // 偏好加载中
    restored.current = true;
    const saved = prefs[STORAGE_KEY] as SavedFilters | undefined;
    if (saved) {
      setQuery(saved.q ?? "");
      if (saved.zone === "1" || saved.zone === "2" || saved.zone === "3" || saved.zone === "4")
        setZone(saved.zone);
      if (saved.top === "top" || saved.top === "non") setTop(saved.top);
    }
  }, [ready, prefs]);

  // 状态变化 → URL + 偏好（跳过首次挂载，避免覆盖已存偏好）
  const hasPersisted = useRef(false);
  useEffect(() => {
    if (!hasPersisted.current) {
      hasPersisted.current = true;
      return;
    }
    const p = new URLSearchParams();
    if (zone !== "all") p.set("zone", zone);
    if (top !== "all") p.set("top", top);
    const q = query.trim();
    if (q) p.set("q", q);
    const qs = p.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
    setPref(STORAGE_KEY, { q, zone, top } satisfies SavedFilters);
  }, [zone, top, query, setPref]);

  const statsZ1 = zones["1"];
  const total = cas.rows.length;
  const topCount = cas.rows.filter((e) => e.top).length;
  const scieCount = cas.rows.filter((e) => e.w.includes("SCIE")).length;

  return (
    <div className="flex flex-col gap-6">
      {/* 统计条（四页统一形态） */}
      <ScholarStats
        items={[
          { value: total, label: t("statsTotal") },
          { value: statsZ1, label: t("statsZone1") },
          { value: topCount, label: t("statsTop") },
          { value: scieCount, label: t("statsSCIE") },
        ]}
      />

      {/* 筛选面板：搜索 + 分区 + Top */}
      <ScholarFilter>
        <ScholarFilterRow>
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full sm:w-64"
            clearLabel={t("clearSearch")}
            aria-label={t("searchPlaceholder")}
          />

          <ToggleGroup
            size="sm"
            value={[zone]}
            onValueChange={(v) => setZone((v[0] as ZoneFilter) ?? "all")}
            className="ccf-segmented flex-wrap"
            aria-label={t("zoneAllLabel")}
          >
            <ToggleGroupItem value="all">{t("zoneAll")}</ToggleGroupItem>
            {(["1", "2", "3", "4"] as const).map((z) => (
              <ToggleGroupItem key={z} value={z}>
                {/* 圆点 = 该分区的颜色，跟行尾徽章/小类色点同一套（grade.ts）。
                    图例不单独占一行：分区名已经写在这个控件里，染上色它就是图例，
                    而且筛选面板吸顶常驻——比列表页脚的图例永远看得见。 */}
                <span
                  aria-hidden
                  className={`size-1.5 rounded-full ${casDotClass(z)}`}
                />
                {t(`zone${z}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <ToggleGroup
            size="sm"
            value={[top]}
            onValueChange={(v) => setTop((v[0] as TopFilter) ?? "all")}
            className="ccf-segmented flex-wrap"
            aria-label={t("topFilter")}
          >
            <ToggleGroupItem value="all">{t("topAll")}</ToggleGroupItem>
            <ToggleGroupItem value="top">{t("topOnly")}</ToggleGroupItem>
            <ToggleGroupItem value="non">{t("topNone")}</ToggleGroupItem>
          </ToggleGroup>

          <ScholarCount>
            {shown} {t("items")}
          </ScholarCount>
        </ScholarFilterRow>
      </ScholarFilter>

      {shown === 0 ? (
        <Empty>
          <EmptyMedia variant="icon">
            <BookMarkedIcon aria-hidden />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t("empty")}</EmptyTitle>
          </EmptyHeader>
          <Button variant="outline" size="sm" onClick={resetFilters}>
            <RotateCcwIcon />
            {t("resetFilters")}
          </Button>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <ul className="divide-y divide-border/60">
            {filtered.map((e) => (
              <EntryRow key={e.n} entry={e} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
