"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  CalendarDaysIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  Globe2Icon,
  MapPinIcon,
  SearchIcon,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SearchInput } from "@/components/ui/search-input";
import {
  ScholarCount,
  ScholarFilter,
  ScholarFilterRow,
  ScholarPanel,
  ScholarPanelHeader,
  ScholarStats,
} from "@/components/scholar/scholar-shell";
import { cn } from "@/lib/utils";
import {
  casChipClass,
  casDotClass,
  ccfChipClass,
  GRADE_CHIP_CLASS,
  TONE_CHIP,
  TOP_CHIP_CLASS,
} from "@/lib/design/grade";
import {
  FIELD_EN,
  normSearch,
  venueConferences,
  venueJournals,
  venueStats,
  type VenueConference,
  type VenueJournal,
} from "@/lib/data/venue";
import { formatIssn, type DeadlineTimelineEntry, type DeadlineYear } from "@/lib/data";
import { localTzOffset, zonedToUtcMs } from "@/lib/utils/tz";

/** 本地化日期时间格式器（模块级缓存） */
const dateFmtCache = new Map<string, Intl.DateTimeFormat>();
function fmtDateTime(utc: number, isZh: boolean): string {
  const key = isZh ? "zh-CN" : "en-US";
  let f = dateFmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(key, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    dateFmtCache.set(key, f);
  }
  return f.format(new Date(utc));
}

/** 「月日」短格式（默认态热门行的截稿日期）；与上面共用一套缓存策略 */
const shortFmtCache = new Map<string, Intl.DateTimeFormat>();
function fmtShortDate(utc: number, isZh: boolean): string {
  const key = isZh ? "zh-CN" : "en-US";
  let f = shortFmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(key, { month: "short", day: "numeric" });
    shortFmtCache.set(key, f);
  }
  return f.format(new Date(utc));
}

/* ---------------- 领域展示（en 精简名，与 /deadlines 页一致） ---------------- */

const FIELD_EN_SHORT: Record<string, string> = {
  计算机体系结构: "Architecture",
  计算机网络: "Networks",
  网络与信息安全: "Security",
  软件工程: "Software Eng.",
  数据库: "Databases & Mining",
  计算机科学理论: "Theory",
  计算机图形学与多媒体: "Graphics & MM",
  人工智能: "AI",
  人机交互与普适计算: "HCI",
  交叉: "Interdisciplinary",
};

/** 徽章/色条配色：见 lib/design/grade.ts */

/**
 * 等级 / 分区徽章：与 CCF 目录、分区表、Deadline 页**同一规格**
 * （20px 高小方徽、`font-mono` 11px、等级色板来自 grade.ts）。
 *
 * ⚠ 速查页此前是 `CCF-A` 药丸 + 28px 宽的裸数字方徽，同一份评级在四页里
 *   有三种长相；现在统一为 `CCF-A` 与 `1区`，aria-label 保持不变
 *   （E2E 依赖 `CCF A` / `中科院 1 区`）。
 */
const GRADE_BADGE_CLASS = `${GRADE_CHIP_CLASS} font-mono font-semibold`;

function CcfLevelBadge({
  level,
  notRankedLabel,
  notRankedTitle,
}: {
  level: "A" | "B" | "C" | "";
  notRankedLabel: string;
  notRankedTitle: string;
}) {
  if (!level) {
    return (
      <span
        className={`${GRADE_CHIP_CLASS} font-sans font-normal ${TONE_CHIP.neutral}`}
        aria-label={notRankedLabel}
        title={notRankedTitle}
      >
        {notRankedLabel}
      </span>
    );
  }
  return (
    <span
      className={`${GRADE_BADGE_CLASS} ${ccfChipClass(level)}`}
      aria-label={`CCF ${level}`}
      title={`CCF ${level}`}
    >
      CCF-{level}
    </span>
  );
}

/** 中科院大类分区方徽（期刊） */
function CasZoneBadge({ zone }: { zone?: string }) {
  const t = useTranslations("venues");
  if (!zone) {
    return (
      <span
        className={`${GRADE_CHIP_CLASS} font-sans font-normal ${TONE_CHIP.neutral}`}
        aria-label={t("casNotRanked")}
        title={t("casNotRankedTitle")}
      >
        {t("casNotRanked")}
      </span>
    );
  }
  return (
    <span
      className={`${GRADE_BADGE_CLASS} ${casChipClass(zone)}`}
      aria-label={t("zoneAria", { zone })}
      title={t("zoneAria", { zone })}
    >
      {t("zoneBadge", { zone })}
    </span>
  );
}

/** Top 期刊徽章（与分区表的 TopBadge 同源：中性前景色实底荣誉章） */
function TopBadge() {
  const t = useTranslations("venues");
  return (
    <span className={`${GRADE_CHIP_CLASS} font-mono font-semibold ${TOP_CHIP_CLASS}`}>
      {t("top")}
    </span>
  );
}

/* ---------------- deadline 信息计算 ---------------- */

type MainDeadline = {
  utc: number;
  entry: DeadlineTimelineEntry;
  labelKey: "abstract" | "paper";
};

type ConfDeadline = {
  /** 未来最近 deadline（跨年份） */
  future: { utc: number; main: MainDeadline; year: DeadlineYear } | null;
  /** 已过最近 deadline */
  past: { utc: number; main: MainDeadline; year: DeadlineYear } | null;
};

/** 会议整体（跨年份）deadline 摘要：未来最近 + 已过最近 */
function confDeadline(conf: VenueConference, now = Date.now()): ConfDeadline {
  let best: ConfDeadline["future"] = null;
  let bestPast: ConfDeadline["past"] = null;
  for (const year of conf.years) {
    for (const entry of year.timeline) {
      const utc = zonedToUtcMs(entry.t, year.tz);
      const main: MainDeadline = { utc, entry, labelKey: entry.k ?? "paper" };
      if (utc >= now) {
        if (!best || utc < best.utc) best = { utc, main, year };
      } else if (!bestPast || utc > bestPast.utc) {
        bestPast = { utc, main, year };
      }
    }
  }
  return { future: best, past: bestPast };
}

/* ---------------- 搜索 ---------------- */

const RESULT_CAP = 24;

function matchScore(q: string, abbr: string, name: string, extra: string[]) {
  const a = normSearch(abbr);
  const n = normSearch(name);
  if (a === q) return 0;
  if (n === q) return 0;
  if (a.startsWith(q)) return 1;
  if (n.startsWith(q)) return 2;
  if (a.includes(q) || n.includes(q)) return 3;
  for (const e of extra) {
    if (e && normSearch(e).includes(q)) return 4;
  }
  return null;
}

/* ================================================================ */
/* 主组件                                                            */
/* ================================================================ */

export function VenueExplorer() {
  const t = useTranslations("venues");
  const locale = useLocale();
  const isZh = locale === "zh";

  const [query, setQuery] = useState("");
  const [openConf, setOpenConf] = useState<VenueConference | null>(null);

  /* URL ?q= 恢复（可分享/刷新） */
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
  }, []);

  /* 输入即同步 URL（不做偏好持久化——打开页面即旧搜索词不友好） */
  useEffect(() => {
    const q = query.trim();
    const url = q
      ? `${window.location.pathname}?q=${encodeURIComponent(q)}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [query]);

  const { confs, jours, hasQuery } = useMemo(() => {
    const q = normSearch(query.trim());
    if (!q) return { confs: [], jours: [], hasQuery: false };

    const confs = venueConferences
      .map((c) => ({
        c,
        score: matchScore(q, c.a, c.n, [c.f, FIELD_EN[c.f] ?? ""]),
      }))
      .filter((x): x is { c: VenueConference; score: number } => x.score !== null)
      .sort((x, y) => x.score - y.score || x.c.a.localeCompare(y.c.a))
      .slice(0, RESULT_CAP)
      .map((x) => x.c);

    const jours = venueJournals
      .map((j) => ({
        j,
        score: matchScore(q, j.a ?? "", j.n, [
          j.f ?? "",
          FIELD_EN[j.f ?? ""] ?? "",
          j.issn ?? "",
          ...(j.subs ?? []).flatMap((s) => [s.zh, s.en]),
        ]),
      }))
      .filter((x): x is { j: VenueJournal; score: number } => x.score !== null)
      .sort((x, y) => x.score - y.score || x.j.n.localeCompare(y.j.n))
      .slice(0, RESULT_CAP)
      .map((x) => x.j);

    return { confs, jours, hasQuery: true };
  }, [query]);

  /* 热门速查：即将截稿的 CCF-A 会议 + 双顶期刊（CCF-A ∩ 中科院 1 区 Top） */
  const hotConfs = useMemo(() => {
    const now = Date.now();
    return venueConferences
      .map((c) => ({ c, dl: confDeadline(c, now) }))
      .filter((x): x is { c: VenueConference; dl: ConfDeadline } => x.dl.future !== null)
      .filter((x) => x.c.l === "A")
      .sort((x, y) => x.dl.future!.utc - y.dl.future!.utc)
      .slice(0, 6)
      .map((x) => x.c);
  }, []);

  const hotJours = useMemo(
    () =>
      venueJournals
        .filter((j) => j.l === "A" && j.zone === "1" && j.top)
        .sort((x, y) => (x.rank ?? 1e9) - (y.rank ?? 1e9))
        .slice(0, 6),
    [],
  );

  const applyQuery = (v: string) => {
    setQuery(v);
    setOpenConf(null);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 统计条（四页统一形态） */}
      <ScholarStats
        items={[
          { value: venueStats.conferences, label: t("statConferences") },
          { value: venueStats.journals, label: t("statJournals") },
          { value: venueStats.ccfConferences, label: t("statCcfConferences") },
          { value: venueStats.dualRankedJournals, label: t("statDualRanked") },
        ]}
      />

      {/* 搜索面板 */}
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
          {/* 本页工具栏只有搜索框，右端留白会让面板看起来「没做完」；
              一句能力说明占住右端，也告诉游客能搜 ISSN / 领域。 */}
          <ScholarCount>{t("searchHint")}</ScholarCount>
          {/* 命中数不在这里重复：结果态两栏的标题行各自已经写了「N matches」，
              同一组数字在一屏里出现两次会把筛选行的右端变成噪音。 */}
        </ScholarFilterRow>
      </ScholarFilter>

      {!hasQuery ? (
        /* ---------- 默认态：热门速查（会议 / 期刊两块面板） ---------- */
        <div className="grid gap-4 md:grid-cols-2">
          {/* 即将截稿的 CCF-A 会议 */}
          <ScholarPanel labelledBy="venue-hot-confs">
            <ScholarPanelHeader id="venue-hot-confs" label={t("hotConfLabel")} />
            <ul className="divide-y divide-border/60">
              {hotConfs.map((c) => (
                <HotConfRow
                  key={c.a}
                  conf={c}
                  isZh={isZh}
                  onPick={() => applyQuery(c.a)}
                />
              ))}
            </ul>
          </ScholarPanel>

          {/* 双顶期刊 */}
          <ScholarPanel labelledBy="venue-hot-jours">
            <ScholarPanelHeader id="venue-hot-jours" label={t("hotJourLabel")} />
            <ul className="divide-y divide-border/60">
              {hotJours.map((j) => (
                <HotJournalRow
                  key={j.n}
                  jour={j}
                  onPick={() => applyQuery(j.a || j.n)}
                />
              ))}
            </ul>
          </ScholarPanel>
        </div>
      ) : confs.length === 0 && jours.length === 0 ? (
        /* ---------- 两栏皆空：只留一个总空态 ---------- */
        <Empty className="py-12">
          <EmptyMedia variant="icon">
            <SearchIcon aria-hidden />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t("noResults")}</EmptyTitle>
            <EmptyDescription>{t("noResultsHint")}</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" size="sm" onClick={() => applyQuery("")}>
            {t("resetFilters")}
          </Button>
        </Empty>
      ) : (
        /* ---------- 结果态：会议 | 期刊 两栏并排 ----------
         * ⚠ 只有**两边都有结果**时才分两栏。搜 “transactions” 时会议 0 条、期刊
         *   24 条，若仍沿用两栏，左半屏是一个只剩空态的空白列（占用 50% 宽却
         *   没有任何信息）；单列后结果行能铺满，空的那侧退化成一行说明。 */
        <div
          className={cn(
            "grid grid-cols-1 gap-6",
            confs.length > 0 && jours.length > 0 && "lg:grid-cols-2",
          )}
        >
          {/* 会议栏 */}
          <div className="flex min-w-0 flex-col gap-2">
            <ScholarPanel labelledBy="venue-confs">
              <ScholarPanelHeader
                id="venue-confs"
                label={t("confsHeading")}
                count={`${confs.length} ${t("confItems")}`}
              />
              {/* 空的一侧只保留标题里的「0 个」——再加一行「未找到匹配的会议」
                  就是两行说同一件事，且把另一栏的结果推下去。 */}
              {confs.length > 0 ? (
                <ul className="divide-y divide-border/60">
                  {confs.map((c) => (
                    <ConferenceCard
                      key={`${c.a}-${c.n}`}
                      conf={c}
                      isZh={isZh}
                      onOpen={() => setOpenConf(c)}
                    />
                  ))}
                </ul>
              ) : null}
            </ScholarPanel>
            {confs.length === RESULT_CAP && (
              <p className="px-1 text-xs text-muted-foreground">
                {t("tooMany", { n: RESULT_CAP })}
              </p>
            )}
          </div>

          {/* 期刊栏 */}
          <div className="flex min-w-0 flex-col gap-2">
            <ScholarPanel labelledBy="venue-jours">
              <ScholarPanelHeader
                id="venue-jours"
                label={t("joursHeading")}
                count={`${jours.length} ${t("jourItems")}`}
              />
              {jours.length > 0 ? (
                <ul className="divide-y divide-border/60">
                  {jours.map((j) => (
                    <JournalCard key={j.n} jour={j} isZh={isZh} />
                  ))}
                </ul>
              ) : null}
            </ScholarPanel>
            {jours.length === RESULT_CAP && (
              <p className="px-1 text-xs text-muted-foreground">
                {t("tooMany", { n: RESULT_CAP })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 会议详情 Dialog */}
      <ConfDialog conf={openConf} isZh={isZh} onClose={() => setOpenConf(null)} />
    </div>
  );
}

/* ---------------- 默认态：热门速查行 ---------------- */

function HotConfRow({
  conf,
  isZh,
  onPick,
}: {
  conf: VenueConference;
  isZh: boolean;
  onPick: () => void;
}) {
  const { future } = confDeadline(conf);
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        title={conf.n}
        className="group flex w-full flex-col gap-0.5 px-4 py-2 text-left transition-colors hover:bg-foreground/5"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-sm font-semibold">
            {conf.a}
          </span>
          {future ? (
            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
              {fmtShortDate(future.utc, isZh)}
            </span>
          ) : null}
          <ChevronRightIcon
            className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            aria-hidden
          />
        </span>
        <span className="truncate font-serif text-sm text-foreground" data-proper-name="">
          {conf.n}
        </span>
      </button>
    </li>
  );
}

function HotJournalRow({
  jour,
  onPick,
}: {
  jour: VenueJournal;
  onPick: () => void;
}) {
  const t = useTranslations("venues");
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        title={jour.n}
        className="group flex w-full flex-col gap-0.5 px-4 py-2 text-left transition-colors hover:bg-foreground/5"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-sm font-semibold">
            {jour.a || jour.n}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <CcfLevelBadge
              level={jour.l}
              notRankedLabel={t("jourNotRanked")}
              notRankedTitle={t("jourNotRankedTitle")}
            />
            <CasZoneBadge zone={jour.zone} />
          </span>
          <ChevronRightIcon
            className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            aria-hidden
          />
        </span>
        <span className="truncate font-serif text-sm text-foreground" data-proper-name="">
          {jour.n}
        </span>
      </button>
    </li>
  );
}

/* ---------------- 会议卡 ---------------- */

function ConferenceCard({
  conf,
  isZh,
  onOpen,
}: {
  conf: VenueConference;
  isZh: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations("venues");
  const { future, past } = confDeadline(conf);
  const main = future ?? past;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors hover:bg-foreground/5"
      >
        {/* L1：缩写 + 主届年份 + 等级徽章 + 领域 */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {conf.a ? (
            <span className="truncate font-mono text-sm font-semibold">
              {conf.a}
            </span>
          ) : (
            <span
              className="min-w-0 truncate font-serif text-base"
              data-proper-name=""
              title={conf.n}
            >
              {conf.n}
            </span>
          )}
          {main ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {main.year.y}
            </span>
          ) : null}
          <CcfLevelBadge
            level={conf.l}
            notRankedLabel={t("confNotRanked")}
            notRankedTitle={t("confNotRankedTitle")}
          />
          {conf.f ? (
            <span className="ml-auto flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <span className="truncate">
                {isZh ? conf.f : FIELD_EN_SHORT[conf.f] ?? conf.f}
              </span>
            </span>
          ) : null}
        </span>
        {/* L2：全称（无简称时已作标题行，不重复） */}
        {conf.a ? (
          <span
            className="truncate font-serif text-sm text-foreground"
            data-proper-name=""
            title={conf.n}
          >
            {conf.n}
          </span>
        ) : null}
        {/* L3：最近一次会议举办时间（截稿节点在 Dialog 中查看） */}
        {main?.year.date ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDaysIcon className="size-3 shrink-0" aria-hidden />
            <span className="tabular-nums">{main.year.date}</span>
          </span>
        ) : null}
      </button>
    </li>
  );
}

/* ---------------- 期刊卡 ---------------- */

/**
 * 期刊行：与 `ConferenceCard` 同为一屏内的列表行，三层结构对称——
 * 主标识（14px）、副标识 / 元信息（12px）、分类（12px）。
 *
 * ⚠ 主标识是**刊名**，不是缩写（会议卡相反）：`TACL` / `TKDE` 这类缩写单独
 *   占一行时上半行几乎全空，而期刊的识别锁点本来就是刊名（与 `/cas` 页一致）。
 *   会议缩写（CVPR / SIGCOMM）在日常语言里已经替了全名，期刊没有这个习惯。
 *
 * 整行点击 → 期刊没有站内详情（无 deadline 可看），落到 DBLP 是唯一合理的去处；
 * 有 DBLP 时整行用 `<a>` 包裹（内部不能再嵌 `<a>`，所以右端图标只作视觉路标）。
 */
function JournalCard({ jour, isZh }: { jour: VenueJournal; isZh: boolean }) {
  const t = useTranslations("venues");
  const subs = jour.subs ?? [];
  const issn = formatIssn(jour.issn);

  const body = (
    <>
      {/* L1：刊名 + Top + 双评级。
          ⚠ 期刊**不以缩写为主**（与会议卡相反）：`TACL` / `TKDE` 这类缩写单独一行
            时上半行几乎是空的，而期刊的识别锚点本来就是刊名；缩写退到 L2 做辅助
            检索线索，与 `/cas` 页的期刊行同一条规则。 */}
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-serif text-base" data-proper-name="">
          {jour.n}
        </span>
        {jour.top ? <TopBadge /> : null}
        <CcfLevelBadge
          level={jour.l}
          notRankedLabel={t("jourNotRanked")}
          notRankedTitle={t("jourNotRankedTitle")}
        />
        <CasZoneBadge zone={jour.zone} />
        {/* DBLP 路标放在**第一行**：第二行纯粹是 ISSN / 排名等数字信息，
            外链图标漂在那里会与上方的徽章列错位。 */}
        {jour.d ? (
          <ExternalLinkIcon
            className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            aria-hidden
          />
        ) : null}
      </span>
      {/* L2：缩写 / ISSN / CAS 排名（纯数字信息，不再挂图标） */}
      <span className="flex items-center gap-x-2 overflow-hidden text-xs tabular-nums text-muted-foreground">
        {jour.a ? (
          <span className="shrink-0 font-mono font-semibold">{jour.a}</span>
        ) : null}
        {issn ? <span className="shrink-0 font-mono">{issn}</span> : null}
        {jour.rank != null && jour.casTotal != null ? (
          <span className="shrink-0">
            {t("rank", { rank: jour.rank, total: jour.casTotal })}
          </span>
        ) : null}
      </span>
      {/* L3：小类学科（最多 2 个 + 溢出计数，title 看全量）。
          无学科的期刊少一行（卡片自然变矮）——内容确实少一层，不该用空白撑高。 */}
      {subs.length > 0 ? (
        <span
          className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
          title={t("subjectsTitle", {
            list: subs.map((s) => (isZh ? s.zh : s.en)).join(" · "),
          })}
        >
          {subs.slice(0, 2).map((s) => (
            <span key={s.en} className="flex min-w-0 items-center gap-1">
              <span
                aria-hidden
                className={`size-1.5 shrink-0 rounded-full ${casDotClass(s.l)}`}
              />
              <span className="truncate">{isZh ? s.zh : s.en}</span>
            </span>
          ))}
          {subs.length > 2 ? (
            <span className="shrink-0">{t("subjectMore", { n: subs.length - 2 })}</span>
          ) : null}
        </span>
      ) : null}
    </>
  );

  const shellClass =
    "group flex flex-col gap-1 px-4 py-2.5 transition-colors hover:bg-foreground/5";

  return (
    <li>
      {jour.d ? (
        <a
          href={jour.d}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${jour.a || jour.n} on DBLP`}
          title={`${jour.a || jour.n} on DBLP`}
          className={shellClass}
        >
          {body}
        </a>
      ) : (
        <div className="flex flex-col gap-1 px-4 py-2.5">{body}</div>
      )}
    </li>
  );
}

/* ---------------- 会议详情 Dialog ---------------- */

function ConfDialog({
  conf,
  isZh,
  onClose,
}: {
  conf: VenueConference | null;
  isZh: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("venues");
  const now = Date.now();

  /* 年份：未来仍有截稿的在前，其余按年份降序（最多展示 3 届） */
  const years = useMemo(() => {
    if (!conf) return [];
    const byFuture = (y: DeadlineYear) =>
      y.timeline.some((e) => zonedToUtcMs(e.t, y.tz) >= Date.now());
    return [...conf.years]
      .sort((x, y) => Number(byFuture(y)) - Number(byFuture(x)) || y.y - x.y)
      .slice(0, 3);
  }, [conf]);

  return (
    <Dialog open={conf !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {conf && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
                {conf.a ? (
                  <span className="font-mono">{conf.a}</span>
                ) : (
                  <span className="min-w-0">{conf.n}</span>
                )}
                <CcfLevelBadge
                  level={conf.l}
                  notRankedLabel={t("confNotRanked")}
                  notRankedTitle={t("confNotRankedTitle")}
                />
              </DialogTitle>
              {conf.a && <DialogDescription>{conf.n}</DialogDescription>}
            </DialogHeader>

            <div className="space-y-4">
              {conf.f && (
                <p className="text-xs text-muted-foreground">
                  {isZh
                    ? conf.fFull ?? conf.f
                    : FIELD_EN[conf.f] ?? FIELD_EN_SHORT[conf.f] ?? conf.f}
                </p>
              )}

              {years.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noDeadlineInfo")}</p>
              ) : (
                years.map((year) => {
                  const entries = [...year.timeline]
                    .map((e) => ({ e, utc: zonedToUtcMs(e.t, year.tz) }))
                    .sort((x, y) => x.utc - y.utc);
                  const hasFuture = entries.some((x) => x.utc >= now);
                  return (
                    <div key={year.y} className="rounded-xl border p-3.5">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold tabular-nums">{year.y}</h3>
                        {hasFuture && (
                          <span
                            className={`${GRADE_CHIP_CLASS} font-medium bg-muted text-muted-foreground`}
                          >
                            {t("upcoming")}
                          </span>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {t("localTz", { tz: localTzOffset() })}
                        </span>
                      </div>
                      {(year.date || year.place) && (
                        <p className="mb-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {year.date && (
                            <span className="flex items-center gap-1">
                              <CalendarDaysIcon className="size-3.5" aria-hidden />
                              {year.date}
                            </span>
                          )}
                          {year.place && (
                            <span className="flex min-w-0 items-center gap-1">
                              <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
                              <span className="truncate">{year.place}</span>
                            </span>
                          )}
                        </p>
                      )}
                      <ul className="space-y-1.5">
                        {entries.map(({ e, utc }, i) => {
                          const passed = utc < now;
                          return (
                            <li
                              key={`${e.t}-${i}`}
                              className={`flex flex-wrap items-baseline gap-x-2 text-sm ${
                                passed ? "opacity-55" : ""
                              }`}
                            >
                              <span
                                className={`${GRADE_CHIP_CLASS} font-normal ${TONE_CHIP.neutral}`}
                              >
                                {t(e.k ?? "paper")}
                              </span>
                              <span className="tabular-nums">
                                {fmtDateTime(utc, isZh)}
                              </span>
                              {e.c && (
                                <span className="text-xs text-muted-foreground">
                                  · {e.c}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      {year.link && (
                        <p className="mt-2 flex min-w-0 items-center gap-1 text-xs">
                          <Globe2Icon className="size-3.5 shrink-0" aria-hidden />
                          <a
                            href={year.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-primary underline-offset-4 hover:underline"
                          >
                            {year.link}
                          </a>
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <DialogFooter>
              {conf.d && (
                <a
                  href={conf.d}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-slot="button"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <ExternalLinkIcon data-icon="inline-start" />
                  DBLP
                </a>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
