"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  CalendarDaysIcon,
  CalendarPlusIcon,
  ChevronDownIcon,
  ClockIcon,
  ExternalLinkIcon,
  Globe2Icon,
  MapPinIcon,
  RotateCcwIcon,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SearchInput } from "@/components/ui/search-input";
import { Spinner } from "@/components/ui/spinner";
import { ccfChipClass, ccfDotClass, GRADE_CHIP_CLASS, TONE_CHIP } from "@/lib/design/grade";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/components/ui/toast";
import { ScholarFieldFilter } from "@/components/scholar/field-filter";
import {
  ScholarCount,
  ScholarFilter,
  ScholarFilterRow,
  ScholarStats,
} from "@/components/scholar/scholar-shell";
import { useOwnerPreferences } from "@/lib/preferences/use-owner-preferences";
import { buildIcsText, deadlineEventUid, icsEventSummary, toIcsUtc } from "@/lib/ical";
import type { DeadlineConf, DeadlineTimelineEntry, DeadlineYear } from "@/lib/data";
import { localTzOffset, zonedToUtcMs } from "@/lib/utils/tz";

/* ---------------- 领域常量（与 ccf-directory 保持一致） ---------------- */

const FIELD_EN: Record<string, string> = {
  计算机体系结构: "Architecture",
  计算机网络: "Networks",
  网络与信息安全: "Security",
  软件工程: "Software",
  数据库: "Databases",
  计算机科学理论: "Theory",
  计算机图形学与多媒体: "Graphics",
  人工智能: "AI",
  人机交互与普适计算: "HCI",
  交叉: "Interdisciplinary",
};

const FIELD_KEY = (f: string) => f.split("/")[0];

const DAY_MS = 86_400_000;

type LevelFilter = "all" | "A" | "B" | "C" | "none";
// 时间轴：去年以来 → 今年以来 → 全部未来 → 未来 30 天 → 未来 90 天
type RangeFilter = "last-year" | "this-year" | "all" | "30" | "90";

function LevelBadge({ level }: { level: "A" | "B" | "C" | "none" }) {
  const t = useTranslations("deadlines.levels");
  const tRoot = useTranslations("deadlines");
  // 全拼显示（CCF-A）而非缩写：后期可能收录 CCF 目录之外的会议
  // （如 CORE 评级），届时可按来源扩展前缀。
  // 未收录不用 `·`：一个 20px 小方器里的中点没有任何可读含义（读者只能
  // 靠位置猜它是徽章），用与筛选按钮同一个词（“未收录 / Not ranked”）。
  const text = level === "none" ? tRoot("levelNone") : `CCF-${level}`;
  // `CCF-A` 是代码式标签（mono / semibold）；「未收录」是自然语言，改用 sans /
  // normal —— 与速查页的 `Non-CCF` 徽章同一个处理。
  const typeClass =
    level === "none"
      ? "font-sans font-normal"
      : "font-mono font-semibold";
  return (
    <span
      className={`${GRADE_CHIP_CLASS} ${typeClass} ${ccfChipClass(level)}`}
      aria-label={level === "none" ? t("none") : `${text} ${t("class")}`}
    >
      {text}
    </span>
  );
}

/** 主 deadline 信息（该年份内未来/已过最近的） */
type MainDeadline = {
  utc: number;
  entry: DeadlineTimelineEntry;
  labelKey: "abstract" | "paper";
};

/** 展平条目：会议 × 年份（同一会议不同年份独立成卡） */
type FlatItem = {
  conf: DeadlineConf;
  year: DeadlineYear;
  /** 该年份未来最近的 deadline */
  best: MainDeadline | null;
  /** 该年份已过最近的 deadline */
  bestPast: MainDeadline | null;
};

/** ---- 统计条由 ScholarStats 统一渲染（原四张大卡片已移除） ---- */
/** Google 日历「新建日程」链接（一次性快照；Google 无 X- 属性可承载会期，描述只留全称） */
function googleCalendarUrl(
  conf: DeadlineConf,
  year: DeadlineYear,
  main: MainDeadline,
): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    // 标题带节点词：外部客户端仅看标题，不写会被误读成会议举办时间
    text: icsEventSummary(conf.a, year.y, main.labelKey, main.entry.c),
    dates: `${toIcsUtc(main.utc)}/${toIcsUtc(main.utc + 3_600_000)}`,
    details: conf.n,
    location: year.place ?? "",
    ctz: "UTC",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** 单个节点的事件文本（游客下载 .ics 用；字段与 CalDAV 写入同源） */
function nodeIcsText(
  conf: DeadlineConf,
  year: DeadlineYear,
  main: MainDeadline,
): string {
  return buildIcsText({
    // UID 与 CalDAV 写入同源（含截止日期）：同一节点重复导入不重复，
    // 同届同类型的不同轮次也各自独立
    uid: `${deadlineEventUid({
      abbr: conf.a,
      year: year.y,
      labelKey: main.labelKey,
      round: main.entry.c,
      day: main.entry.t.slice(0, 10),
      utc: main.utc,
    })}@shaoyuanyu.cn`,
    // 与 CalDAV 写入保持同一格式：标题带英文节点词 + 洁净标题另存
    summary: icsEventSummary(conf.a, year.y, main.labelKey, main.entry.c),
    confTitle: `${conf.a} ${year.y}`,
    confName: conf.n,
    // 一次性快照（不会回写本站）：保留全称在 DESCRIPTION 里，
    // 导入的客户端才能在「备注/描述」框看到它
    description: conf.n,
    location: year.place,
    confDates: year.date,
    url: year.link,
    categories: [main.labelKey],
    start: main.utc,
    end: main.utc + 3_600_000,
  });
}

/** 触发浏览器下载（Blob → 临时 <a>） */
function downloadIcs(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * 游客的日历动作：**选项式下拉**（把日程带到站外）——「Google 日历」「下载 .ics」。
 *
 * ⚠ 站主侧不渲染它（用户指定）：站主已有本站日历（`/calendar` 能双向同步、能写备注），
 *   站外导出对站主只是噪音；站主侧对应的是「添加到我的日历」+ 节点勾选。
 * ⚠ 菜单项必须 `e.stopPropagation()`：菜单渲染在卡片组件树内，
 *   React 合成事件会按组件树冒泡到卡片的 onClick（打开详情 Dialog）。
 */
function GuestCalendarMenu({
  conf,
  year,
  main,
  iconOnly = false,
}: {
  conf: DeadlineConf;
  year: DeadlineYear;
  main: MainDeadline;
  /** true = 卡片上的纯图标触发器；false = 弹窗底部的带文字按钮 */
  iconOnly?: boolean;
}) {
  const t = useTranslations("deadlines");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={iconOnly ? "ghost" : "outline"}
            size={iconOnly ? "icon-sm" : "sm"}
            aria-label={t("addToCalendar")}
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <CalendarPlusIcon data-icon={iconOnly ? "default" : "inline-start"} />
        {!iconOnly && (
          <>
            {t("addToCalendar")}
            <ChevronDownIcon data-icon="inline-end" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            window.open(googleCalendarUrl(conf, year, main), "_blank");
          }}
        >
          {t("googleCalendar")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            downloadIcs(
              `${conf.a.toLowerCase()}-${year.y}.ics`,
              nodeIcsText(conf, year, main),
            );
          }}
        >
          {t("icsDownload")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DeadlinesList({
  deadlines,
}: {
  deadlines: DeadlineConf[];
}) {
  const t = useTranslations("deadlines");
  const locale = useLocale();
  const isZh = locale === "zh";
  const { isOwner } = useOwnerPreferences();

  /** 领域全名（悬停提示用） */
  const fieldFullName = (f: string) => (isZh ? f : FIELD_EN[FIELD_KEY(f)] ?? f);
  /** 筛选标签用短名：官方名以「/」分段（英文用「,」），头一段就是领域短名 */
  const fieldShortName = (f: string) =>
    fieldFullName(f).split(isZh ? "/" : ",")[0].trim();

  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [range, setRange] = useState<RangeFilter>("all");
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [openItem, setOpenItem] = useState<FlatItem | null>(null);
  /**
   * 详情 Dialog 是否处于「勾选节点」态（站主专属）。
   * - 点**卡片** → false：普通详情（底部是「添加到我的日历」/ 游客的选项式下拉）
   * - 点卡片右下角**日历图标** → true：直接进勾选态
   * - 在普通详情里点「添加到我的日历」 → 切到 true
   */
  const [picking, setPicking] = useState(false);
  /** 勾选要加入日历的节点（下标指 `timelineNodes`；默认全选） */
  const [picked, setPicked] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);

  const toggleField = (f: string) => {
    setSelectedFields((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  };

  /** 当前打开会议的投稿节点（按时间升序；与 Dialog 里的列表同序） */
  const timelineNodes = useMemo(() => {
    if (!openItem) return [];
    return openItem.year.timeline
      .map((e) => ({ e, utc: zonedToUtcMs(e.t, openItem.year.tz) }))
      .sort((x, y) => x.utc - y.utc);
  }, [openItem]);

  /**
   * 弹窗是否处于「勾选节点」态（站主专属）：只有此时节点列表才出现复选框、
   * 底部才出现「添加选中的 N 个」。点**卡片**进的是普通详情（用户指定）。
   */
  const pickingMode = isOwner && picking;
  /** 游客在弹窗里导出用的那个节点（与卡片显示一致：未来最近，无则已过最近） */
  const dialogMain = openItem?.best ?? openItem?.bestPast ?? null;

  // 每次打开 Dialog 都重置为「全选」——**含已过节点**（用户指定：已过节点默认也勾上）。
  // 只在切换会议时重置，故依赖 timelineNodes（它随 openItem 变化、开合期间稳定）。
  useEffect(() => {
    setPicked(timelineNodes.map((_, i) => i));
  }, [timelineNodes]);

  /**
   * 把勾选的节点写入站主专属 CalDAV 日历（一次可写多个；UID 稳定，重复添加覆盖）。
   * ⚠ 必须由用户勾选而不是「整届全塞」：一届会议常有多个赛道（ADMA 的
   *   Main/Industry/Poster/Encore）或一年多个投稿窗口（ASPLOS/FAST/NSDI 的一年两轮），
   *   用户通常只投其中一部分。
   */
  const handleAddPicked = async () => {
    if (!openItem || picked.length === 0) return;
    const { conf, year } = openItem;
    setAdding(true);
    try {
      const r = await fetch("/api/deadlines/caldav", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          a: conf.a,
          n: conf.n,
          year: year.y,
          date: year.date,
          place: year.place,
          link: year.link,
          nodes: picked.flatMap((i) => {
            const hit = timelineNodes[i];
            if (!hit) return [];
            return [
              {
                utc: hit.utc,
                labelKey: hit.e.k ?? "paper",
                // 轮次备注（如 "Poster Paper"）：服务端清洗后并入 UID 与标题
                round: hit.e.c,
                // 会议本地日期进 UID——ccfddl 的轮次备注常为空（NSDI/FAST 的一年两轮），
                // 同届同类型只能靠日期区分，否则会互相覆盖
                day: hit.e.t.slice(0, 10),
              },
            ];
          }),
        }),
      });
      const data = (await r.json().catch(() => null)) as
        | { added?: number; failed?: number; error?: string }
        | null;
      if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`);
      const added = data?.added ?? picked.length;
      const failed = data?.failed ?? 0;
      toast.add({
        title:
          failed > 0
            ? t("caldavPartial", { added, failed })
            : t("caldavAddedCount", { conf: `${conf.a} ${year.y}`, n: added }),
        type: failed > 0 ? "error" : "success",
      });
      // 全部成功后关掉弹窗：勾选窗口的职责已经完成，留着它只会挡住日历与结果提示。
      // ⚠ 有失败时保持打开，便于用户重试。
      // ⚠ 必须以受控方式关闭：程序把 `open` 置 false 不会触发 onOpenChange，
      //   故 `picking` 要在这里一并复位（否则下次点卡片会直接进勾选态）。
      if (failed === 0) {
        setOpenItem(null);
        setPicking(false);
      }
    } catch (err) {
      console.error("[caldav] 添加失败", err);
      toast.add({
        title: t("caldavFailed"),
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setAdding(false);
    }
  };

  /* 展平：会议 × 年份 独立条目（同一会议不同年份不再合并） */
  const { items, total, count30, count90, countYear } = useMemo(() => {
    const now = Date.now();
    const items: FlatItem[] = [];
    for (const conf of deadlines) {
      for (const year of conf.years) {
        let best: MainDeadline | null = null;
        let bestPast: MainDeadline | null = null;
        for (const entry of year.timeline) {
          const utc = zonedToUtcMs(entry.t, year.tz);
          const candidate: MainDeadline = {
            utc,
            entry,
            labelKey: entry.k ?? "paper",
          };
          if (utc >= now) {
            if (!best || utc < best.utc) best = candidate;
          } else if (!bestPast || utc > bestPast.utc) {
            bestPast = candidate;
          }
        }
        if (best || bestPast) items.push({ conf, year, best, bestPast });
      }
    }
    const upcoming = items.filter((i) => i.best);
    return {
      items,
      total: deadlines.length,
      count30: upcoming.filter((i) => i.best!.utc - now < 30 * DAY_MS).length,
      count90: upcoming.filter((i) => i.best!.utc - now < 90 * DAY_MS).length,
      countYear: upcoming.filter((i) => i.best!.utc - now < 365 * DAY_MS).length,
    };
  }, [deadlines]);

  const fields = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const c of deadlines) {
      if (!c.f) continue;
      const key = FIELD_KEY(c.f);
      if (!seen.has(key)) {
        seen.add(key);
        list.push(c.f);
      }
    }
    return list;
  }, [deadlines]);

  const filtered = useMemo(() => {
    const now = Date.now();
    // 本地时区的年初（历史档窗口起点）
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    const lastYearStart = new Date(new Date().getFullYear() - 1, 0, 1).getTime();
    const q = query.trim().toLowerCase();
    return items
      .filter((i): i is FlatItem => {
        const { conf } = i;
        const isPastRange = range === "last-year" || range === "this-year";
        if (isPastRange) {
          // 历史档：该年份最近一次已过 deadline 落在窗口内才显示
          const start = range === "last-year" ? lastYearStart : yearStart;
          if (!i.bestPast || i.bestPast.utc < start || i.bestPast.utc >= now)
            return false;
        } else {
          // 未来档：只显示未截止；时间范围作用于 deadline
          if (!i.best) return false;
          if (range !== "all" && i.best.utc - now >= Number(range) * DAY_MS)
            return false;
        }
        if (level === "none" ? conf.l !== "" : level !== "all" && conf.l !== level)
          return false;
        if (
          selectedFields.length > 0 &&
          !selectedFields.some((f) => FIELD_KEY(f) === FIELD_KEY(conf.f))
        )
          return false;
        if (q) {
          const a = conf.a.toLowerCase();
          const n = conf.n.toLowerCase();
          if (!a.includes(q) && !n.includes(q)) return false;
        }
        return true;
      })
      .sort((x, y) => {
        const isPastRange = range === "last-year" || range === "this-year";
        if (isPastRange) {
          // 历史档：最近截止的在前（降序）
          return (y.bestPast?.utc ?? 0) - (x.bestPast?.utc ?? 0);
        }
        // 未来档：截止时间升序
        return (x.best?.utc ?? 0) - (y.best?.utc ?? 0);
      });
  }, [items, query, level, range, selectedFields]);

  const resetFilters = () => {
    setQuery("");
    setLevel("all");
    setRange("all");
    setSelectedFields([]);
  };

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [isZh],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* 统计条（四页统一形态） */}
      <ScholarStats
        items={[
          { value: total, label: t("statsTotal") },
          { value: count30, label: t("stats30") },
          { value: count90, label: t("stats90") },
          { value: countYear, label: t("statsUpcoming") },
        ]}
      />

      {/* 筛选面板：搜索 + 等级 + 时间范围 + 领域，全部 sticky */}
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
            value={[level]}
            onValueChange={(v) => setLevel((v[0] as LevelFilter) ?? "all")}
            className="ccf-segmented flex-wrap"
          >
            <ToggleGroupItem value="all">{t("levelAll")}</ToggleGroupItem>
            {/* 圆点 = 等级色（与行内 CCF 徽章同一套），让筛选控件本身当图例 */}
            {(["A", "B", "C"] as const).map((l) => (
              <ToggleGroupItem key={l} value={l}>
                <span aria-hidden className={`size-1.5 rounded-full ${ccfDotClass(l)}`} />
                {l}
              </ToggleGroupItem>
            ))}
            <ToggleGroupItem value="none">{t("levelNone")}</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            size="sm"
            value={[range]}
            onValueChange={(v) => setRange((v[0] as RangeFilter) ?? "all")}
            // ⚠ 手机端**独占一行**（order-last + w-full + flex-wrap）：短标签
            //   （去年/今年/全部/30 天/90 天）总宽 ≈ 240px，放得下一行；若让它挤在
            //   等级组右侧的剩余宽度里，390px 视口只剩 ~70px，第一屏只能看见
            //   「去年 今」半截（隐藏滚动条让人以为坏了）。md 起回到不换行的内容宽。
            className="ccf-segmented max-w-full flex-wrap max-md:order-last max-md:w-full md:flex-nowrap"
          >
            <ToggleGroupItem value="last-year">
              <span className="lg:hidden">{t("rangeLastYearShort")}</span>
              <span className="hidden lg:inline">{t("rangeLastYear")}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="this-year">
              <span className="lg:hidden">{t("rangeThisYearShort")}</span>
              <span className="hidden lg:inline">{t("rangeThisYear")}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="all">
              <span className="lg:hidden">{t("rangeAllShort")}</span>
              <span className="hidden lg:inline">{t("rangeAll")}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="30">
              <span className="lg:hidden">{t("range30Short")}</span>
              <span className="hidden lg:inline">{t("range30")}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="90">
              <span className="lg:hidden">{t("range90Short")}</span>
              <span className="hidden lg:inline">{t("range90")}</span>
            </ToggleGroupItem>
          </ToggleGroup>
          <ScholarCount>
            {filtered.length} {t("items")}
          </ScholarCount>
        </ScholarFilterRow>

        {/* 领域多选：空 = 全部；与 CCF 页同一组件 */}
        <ScholarFieldFilter
          ariaLabel={t("fieldFilter")}
          allLabel={t("fieldAll")}
          fields={fields}
          selected={selectedFields}
          labelOf={fieldShortName}
          titleOf={fieldFullName}
          onToggle={toggleField}
          onClear={() => setSelectedFields([])}
        />
      </ScholarFilter>

      {/* 会议卡片网格（倒计时醒目 + 地点/会议时间直接展示） */}
      {filtered.length === 0 ? (
        <Empty>
          <EmptyMedia variant="icon">
            <CalendarDaysIcon aria-hidden />
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ conf, year, best, bestPast }) => {
            const levelKey = conf.l === "" ? "none" : conf.l;
            // 历史档（去年以来/今年以来）强制展示最近一次已过 deadline；未来档展示未来最近的
            const isPast =
              range === "last-year" || range === "this-year" || !best;
            const main = isPast ? (bestPast ?? best!) : best!;
            const daysLeft = Math.ceil((main.utc - Date.now()) / DAY_MS);
            const countdown = isPast
              ? t("pastDue")
              : daysLeft <= 0
                ? t("dueToday")
                : daysLeft === 1
                  ? t("dueTomorrow")
                  : t("daysLeft", { days: daysLeft });
            // 倒计时 urgency 配色（≤7 天红 / ≤30 天琥珀 / 其余弱化 / 已截止弱化）。
            // 旧版是 ≤3 红 / ≤7 橙 / ≤14 琥珀四档，但 orange-700 与 amber-700 在
            // 12px 上几乎分辨不出（都是“偏黄的深色”），等于只读得出两档。
            // 合并为三档后每个档位都对应一个能一句话说清的语义：这周 / 这个月 / 以后。
            const urgencyClass = isPast
              ? "text-muted-foreground"
              : daysLeft <= 7
                ? "text-red-700 dark:text-red-400"
                : daysLeft <= 30
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-muted-foreground";
            const fieldKey = conf.f ? FIELD_KEY(conf.f) : "";
            return (
              <div
                key={`${conf.a}-${year.y}`}
                data-slot="card"
                className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/25 hover:bg-foreground/5 focus-within:ring-2 focus-within:ring-ring/60 ${
                  isPast ? "opacity-70 hover:opacity-100" : ""
                }`}
                onClick={() => setOpenItem({ conf, year, best, bestPast })}
              >
                {/*
                 * 键盘可达性：整卡可点（鼠标走容器的 onClick），但卡片里已经嵌了
                 * 「会议官网」链接与日历按钮，把卡片本身做成 role="button" 会造成
                 * 嵌套交互元素（AT 语义混乱）。这里铺一个真正的 <button> 覆盖整卡作为
                 * 键盘入口，内容层（z-10）在它之上，故鼠标点击仍命中内容并冒泡到容器；
                 * 键盘 Tab 到的就是这个按钮（名称 = 会议缩写 + 年份）。
                 * ⚠ 焦点环画在卡片容器的 focus-within 上（overflow-hidden 会裁掉
                 *   覆盖层自己的外扩 ring）。
                 */}
                <button
                  type="button"
                  data-slot="deadline-card-open"
                  aria-label={`${conf.a} ${year.y}`}
                  onClick={() => setOpenItem({ conf, year, best, bestPast })}
                  className="absolute inset-0 z-0 rounded-xl outline-none"
                />
                <div className="relative z-10 flex flex-1 flex-col gap-2 p-4">
                  {/* 顶行：缩写 + 年份 + 等级 · 倒计时 */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        data-slot="deadline-card-title"
                        className="truncate font-mono text-sm font-semibold"
                      >
                        {conf.a} {year.y}
                      </span>
                      <LevelBadge level={levelKey} />
                    </div>
                    {/* ⚠ 不要用 font-mono：倒计时含中文（还剩/天/明天截止）。
                        用 tabular-nums 保持数字等宽对齐，避免拉取 cjk 分片。 */}
                    <span className={`shrink-0 text-xs font-medium tabular-nums ${urgencyClass}`}>
                      {countdown}
                    </span>
                  </div>
                  {/* 全称：卡片内唯一的多行文本；衬线专名（字体策略 2c），
                      与缩写（等宽）分层 */}
                  <p
                    className="line-clamp-2 font-serif text-sm leading-snug text-foreground"
                    data-proper-name=""
                    title={conf.n}
                  >
                    {conf.n}
                  </p>
                  {/* 截止时间 / 地点 / 会期 */}
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <ClockIcon className="size-3.5 shrink-0" aria-hidden />
                      <span className="font-medium tabular-nums text-foreground">
                        {dateFmt.format(new Date(main.utc))}
                      </span>
                    </span>
                    {year.place && (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate" title={year.place}>
                          {year.place}
                        </span>
                      </span>
                    )}
                    {year.date && (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <CalendarDaysIcon className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate" title={year.date}>
                          {year.date}
                        </span>
                      </span>
                    )}
                  </div>
                  {/* 底部：领域（左） + 官网 / 日历（右） */}
                  <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2">
                    {conf.f ? (
                      <span
                        className={`flex min-w-0 items-center gap-1 text-xs ${
                          selectedFields.length > 0
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {/* 领域是**文字**，不挂图标：同一张卡片里已经有截止时间 /
                            地点 / 会期三个「数据行」图标，再加一个装饰图标会让
                            底栏与数据行同一视觉层级（图标不表示数据或动作时就不该出现）。 */}
                        <span className="truncate">
                          {isZh ? fieldKey : FIELD_EN[fieldKey] ?? conf.f}
                        </span>
                      </span>
                    ) : (
                      <span />
                    )}
                    <div className="flex shrink-0 items-center gap-1">
                      {year.link ? (
                        <a
                          href={year.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t("website")}
                          title={t("website")}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Globe2Icon className="size-3.5" aria-hidden />
                        </a>
                      ) : null}
                      {isOwner ? (
                        /*
                         * 站主：图标点击 → 打开详情 Dialog 并**直接进入勾选态**（不写数据、不弹菜单）。
                         * ⚠ Google 日历 / 下载 .ics 只给游客（用户指定）：站主已有本站日历
                         *   （`/calendar` 能双向同步、能写备注），站外导出对站主只是噪音。
                         */
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("addToCaldav")}
                          onClick={(e) => {
                            // 阻止冒泡：否则会再触发卡片的 onClick（进普通详情态）
                            e.stopPropagation();
                            setOpenItem({ conf, year, best, bestPast });
                            setPicking(true);
                          }}
                        >
                          <CalendarPlusIcon data-icon="default" />
                        </Button>
                      ) : (
                        <GuestCalendarMenu
                          conf={conf}
                          year={year}
                          main={main}
                          iconOnly
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 会议详情 Dialog（仅展示点击的会议年份） */}
      <Dialog
        open={openItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenItem(null);
            // 下次重新打开从「普通详情」开始（勾选态只在点图标 / 点「添加到我的日历」后出现）
            setPicking(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {openItem && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                  {openItem.conf.a} {openItem.year.y}
                  <LevelBadge level={openItem.conf.l === "" ? "none" : openItem.conf.l} />
                </DialogTitle>
                <DialogDescription>{openItem.conf.n}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-xl border p-3.5">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {openItem.best && (
                      <span
                        className={`${GRADE_CHIP_CLASS} font-medium bg-muted text-muted-foreground`}
                      >
                        {t("upcoming")}
                      </span>
                    )}
                    <span className="text-xs font-normal text-muted-foreground">
                      {t("localTime", { tz: localTzOffset() })}
                    </span>
                    {/* 站主 + 勾选态：节点可勾选（默认全选），只把要投的那些加入日历 */}
                    {pickingMode && timelineNodes.length > 0 && (
                      <span className="ml-auto flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setPicked(timelineNodes.map((_, i) => i))}
                        >
                          {t("selectAll")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setPicked([])}
                        >
                          {t("selectNone")}
                        </Button>
                      </span>
                    )}
                  </div>
                  <ul className="space-y-1.5">
                    {timelineNodes.map(({ e, utc }, i) => {
                      const past = utc < Date.now();
                      // py-0.5：行高从 20 → 24px，整行是 <label>（点击区域 = 整行宽），
                      // 窄屏上更容易点中
                      const rowClass =
                        "flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5 text-sm";
                      const row = (
                        <>
                          {pickingMode && (
                            <input
                              type="checkbox"
                              checked={picked.includes(i)}
                              onChange={() =>
                                setPicked((prev) =>
                                  prev.includes(i)
                                    ? prev.filter((x) => x !== i)
                                    : [...prev, i],
                                )
                              }
                              className="size-3.5 shrink-0 accent-primary"
                            />
                          )}
                          <span
                            className={`${GRADE_CHIP_CLASS} font-normal ${TONE_CHIP.neutral}`}
                          >
                            {t(e.k ?? "paper")}
                          </span>
                          <span className="tabular-nums">
                            {dateFmt.format(new Date(utc))}
                          </span>
                          {e.c && (
                            <span className="text-xs text-muted-foreground">· {e.c}</span>
                          )}
                          {pickingMode && past && (
                            <span className="text-xs text-muted-foreground">
                              {t("pastDue")}
                            </span>
                          )}
                        </>
                      );
                      return (
                        <li key={`${e.t}-${i}`}>
                          {/* 整行可点：label 包裹后复选框的可访问名即整行文字 */}
                          {pickingMode ? (
                            <label className={`${rowClass} cursor-pointer select-none`}>
                              {row}
                            </label>
                          ) : (
                            <div className={rowClass}>{row}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {(openItem.year.date || openItem.year.place) && (
                    <p className="mt-2.5 text-xs text-muted-foreground">
                      {[openItem.year.date, openItem.year.place].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter className="flex-wrap gap-2">
                {openItem.conf.d && (
                  <a
                    href={openItem.conf.d}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-slot="button"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <ExternalLinkIcon data-icon="inline-start" />
                    DBLP
                  </a>
                )}
                {openItem.year.link && (
                  <a
                    href={openItem.year.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-slot="button"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Globe2Icon data-icon="inline-start" />
                    {t("website")}
                  </a>
                )}
                {pickingMode ? (
                  <Button
                    size="sm"
                    disabled={adding || picked.length === 0}
                    onClick={handleAddPicked}
                  >
                    {adding ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <CalendarPlusIcon data-icon="inline-start" />
                    )}
                    {t("addSelected", { n: picked.length })}
                  </Button>
                ) : isOwner ? (
                  /* 普通详情：先给「添加到我的日历」，点它才进勾选态（用户指定） */
                  <Button size="sm" onClick={() => setPicking(true)}>
                    <CalendarPlusIcon data-icon="inline-start" />
                    {t("addToCaldav")}
                  </Button>
                ) : dialogMain ? (
                  /* 游客：选项式下拉（Google 日历 / 下载 .ics） */
                  <GuestCalendarMenu
                    conf={openItem.conf}
                    year={openItem.year}
                    main={dialogMain}
                  />
                ) : null}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
