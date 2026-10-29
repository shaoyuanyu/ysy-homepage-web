"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BookOpenIcon, ExternalLinkIcon, RotateCcwIcon } from "lucide-react";

import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScholarFieldFilter } from "@/components/scholar/field-filter";
import {
  ScholarCount,
  ScholarFilter,
  ScholarFilterRow,
  ScholarPanel,
  ScholarPanelHeader,
  ScholarStats,
} from "@/components/scholar/scholar-shell";
import { useOwnerPreferences } from "@/lib/preferences/use-owner-preferences";
import { ccfChipClass, ccfDotClass, GRADE_CHIP_CLASS } from "@/lib/design/grade";
import { ccf, type CcfEntry } from "@/lib/data";

type TypeFilter = "all" | "conf" | "jour";
type LevelFilter = "all" | "A" | "B" | "C";

/* 领域 → URL 短键（避免中文过长与编码问题） */
const FIELD_KEYS: Record<string, string> = {
  计算机体系结构: "arch",
  计算机网络: "net",
  网络与信息安全: "sec",
  软件工程: "se",
  数据库: "db",
  计算机科学理论: "theory",
  计算机图形学与多媒体: "graphics",
  人工智能: "ai",
  人机交互与普适计算: "hci",
  交叉: "inter",
};

/** 领域英文名（数据中只有官方中文名） */
const FIELD_EN: Record<string, string> = {
  计算机体系结构: "Architecture, Parallel & Distributed Computing, Storage",
  计算机网络: "Computer Networks",
  网络与信息安全: "Network & Information Security",
  软件工程: "Software Engineering, System Software & Programming Languages",
  数据库: "Databases, Data Mining & Content Retrieval",
  计算机科学理论: "Computer Science Theory",
  计算机图形学与多媒体: "Computer Graphics & Multimedia",
  人工智能: "Artificial Intelligence",
  人机交互与普适计算: "HCI & Ubiquitous Computing",
  交叉: "Interdisciplinary & Emerging",
};

/**
 * 筛选标签用的英文短名（与 `/deadlines` 页同一套叫法）。
 * 全名（`FIELD_EN`）留给分组标题；标签要能排在一行里：全名版
 * 「Software Engineering, System Software & Programming Languages」
 * 单个就占 380px，十一个标签必然折成两行、右缘参差。
 */
const FIELD_EN_SHORT: Record<string, string> = {
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

/* 领域名以「/」为界拆分后的第一段即官方领域短名，便于做键与展示 */
const FIELD_KEY = (field: string) => field.split("/")[0];

/* 短键 → 完整领域名（模块级静态构建） */
const KEY_TO_FIELD = new Map<string, string>();
for (const e of [...ccf.conferences, ...ccf.journals]) {
  const key = FIELD_KEYS[FIELD_KEY(e.f)];
  if (key && !KEY_TO_FIELD.has(key)) KEY_TO_FIELD.set(key, e.f);
}

/* 合法领域名集合（校验 localStorage 恢复数据） */
const ALL_FIELDS = new Set(KEY_TO_FIELD.values());

/* 偏好持久化 key：游客存 localStorage（键名即此 key），主人存服务器（跨设备同步） */
const STORAGE_KEY = "ccf:filters";

type SavedFilters = {
  fields?: string[];
  type?: TypeFilter;
  level?: LevelFilter;
  q?: string;
};

/* 级别专属配色：见 lib/design/grade.ts（与 cas / deadlines / venues 同一事实来源）*/

/**
 * 等级徽章：与速查页 / Deadline 页**同一规格**（2026-10-28 统一）。
 *
 * 旧版这里是 28px 宽的方徽 + 单字母，速查页却是 `CCF-A` 药丸、Deadline 页
 * 又是另一种圆角；四页跳转时同一份评级换三张脸。现在固定为
 * `CCF-A` 文字 + `GRADE_CHIP_CLASS` 几何（18px 高小方徽、等级色板来自
 * grade.ts），名字与 aria-label 也与其它页对齐（`CCF A`）。
 */
function LevelBadge({ level }: { level: CcfEntry["l"] }) {
  const t = useTranslations("ccf.levels");
  return (
    <span
      className={`${GRADE_CHIP_CLASS} font-mono font-semibold ${ccfChipClass(level)}`}
      aria-label={`CCF ${level} ${t("class")}`}
    >
      CCF-{level}
    </span>
  );
}

/**
 * 目录行。
 *
 * 版式在两档之间切换：
 * - **桌面**（`sm` 起）：单行三列——缩写定宽 `w-32` → 全名（`flex-1`，单行截断）
 *   → 等级徽章 → DBLP。缩写列对齐后，全名的起始 x 在整页一致。
 * - **手机**：缩写列 128px 根本放不出来（390px 视口只剩 150px 给全名），若维持
 *   单行，缩写被截成 `ACM SIG…`、全名被截成 `ACM SIGOPS Annual Tec…`，两列都残。
 *   改为换行：第一行「缩写 + 等级徽章」，第二行全名整行（2 行封顶）。
 *
 * DOM 顺序按**手机**排（缩写 → 徽章 → 全名 → DBLP），桌面上用 `order` 重排回
 * 缩写 → 全名 → 徽章 → DBLP（即徽章仍贴在全名右侧）。
 */
function EntryRow({ entry }: { entry: CcfEntry }) {
  return (
    <li className="group flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2.5 transition-colors hover:bg-foreground/5 sm:flex-nowrap sm:gap-x-3">
      {/* 无缩写的条目（295 本期刊里有 47 本）：**保留列宽**并用一枚淡「—」占位。
          两种错误做法都试过：留白 128px 像「这一行渲染丢了」；让刊名顶到最左
          （铺满整行）会让 47 行突然脱离全表的刊名左缘，长列表里更刺眼。
          表格里空值就该有条空值的写法——占位、对齐、不参与朗读。
          ⚠ 手机不显示「—」也不占位（那份空白会变成 8px 的多余缩进）。 */}
      {entry.a ? (
        <span className="min-w-0 max-w-full truncate font-mono text-base font-semibold sm:order-1 sm:w-32 sm:shrink-0">
          {entry.a}
        </span>
      ) : (
        <span
          aria-hidden
          className="hidden shrink-0 font-mono text-base text-muted-foreground/40 sm:order-1 sm:block sm:w-32"
        >
          —
        </span>
      )}
      <span className="shrink-0 sm:order-3">
        <LevelBadge level={entry.l} />
      </span>
      <span
        className="line-clamp-2 w-full min-w-0 font-serif text-base text-foreground sm:order-2 sm:block sm:w-auto sm:flex-1 sm:overflow-hidden sm:text-ellipsis sm:whitespace-nowrap"
        data-proper-name=""
        title={entry.n}
      >
        {entry.n}
      </span>
      {entry.d && (
        <a
          href={entry.d}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${entry.a} on DBLP`}
          title="DBLP"
          className="-m-1 hidden shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:text-foreground sm:order-4 sm:flex"
        >
          <ExternalLinkIcon className="size-3.5" aria-hidden />
        </a>
      )}
    </li>
  );
}

/** 组内会议/期刊分区的小标题（仅当两者同时存在时出现） */
function TypeDivider({ type }: { type: "conf" | "jour" }) {
  const t = useTranslations("ccf");
  return (
    <li
      aria-hidden
      className="bg-muted/40 px-4 py-1.5 text-xs font-medium tracking-wide text-muted-foreground"
    >
      {type === "conf" ? t("typeConference") : t("typeJournal")}
    </li>
  );
}

export function CcfDirectory() {
  const t = useTranslations("ccf");
  const locale = useLocale();
  const isZh = locale === "zh";

  const { ready, prefs, setPref } = useOwnerPreferences();

  const [query, setQuery] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [level, setLevel] = useState<LevelFilter>("all");
  // 多选领域集合；空数组 = 全部领域
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  // 保持官方领域顺序去重
  const fields = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const e of [...ccf.conferences, ...ccf.journals]) {
      const key = FIELD_KEY(e.f);
      if (!seen.has(key)) {
        seen.add(key);
        list.push(e.f);
      }
    }
    return list;
  }, []);

  const fieldName = (f: string) => (isZh ? f : FIELD_EN[FIELD_KEY(f)] ?? f);
  /** 筛选标签用短名：中文取官方名「/」前的一段，英文用短名表（全名放 title） */
  const fieldShortName = (f: string) =>
    isZh
      ? f.split("/")[0].trim()
      : (FIELD_EN_SHORT[FIELD_KEY(f)] ?? fieldName(f));

  const toggleField = (f: string) => {
    setSelectedFields((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  };

  const { confs, jours } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (e: CcfEntry) => {
      if (level !== "all" && e.l !== level) return false;
      if (
        selectedFields.length > 0 &&
        !selectedFields.some((f) => FIELD_KEY(f) === FIELD_KEY(e.f))
      )
        return false;
      if (!q) return true;
      return e.a.toLowerCase().includes(q) || e.n.toLowerCase().includes(q);
    };
    return {
      confs: ccf.conferences.filter(match),
      jours: ccf.journals.filter(match),
    };
  }, [query, level, selectedFields]);

  // 按领域分组（保持官方顺序）；组内：会议在前（按级别、缩写），期刊在后
  const groups = useMemo(() => {
    const byField = (list: CcfEntry[]) => {
      const m = new Map<string, CcfEntry[]>();
      for (const e of list) {
        const key = FIELD_KEY(e.f);
        if (!m.has(key)) m.set(key, []);
        m.get(key)!.push(e);
      }
      return m;
    };
    const cm = byField(confs);
    const jm = byField(jours);
    return fields
      .map((f) => {
        const key = FIELD_KEY(f);
        const list =
          type === "all"
            ? [...(cm.get(key) ?? []), ...(jm.get(key) ?? [])]
            : type === "conf"
              ? (cm.get(key) ?? [])
              : (jm.get(key) ?? []);
        return { field: f, list };
      })
      .filter((g) => g.list.length > 0);
  }, [confs, jours, fields, type]);

  const total = ccf.conferences.length + ccf.journals.length;
  // 实际渲染条数（与分组结果一致）
  const shown = groups.reduce((acc, g) => acc + g.list.length, 0);
  const classACount =
    ccf.conferences.filter((e) => e.l === "A").length +
    ccf.journals.filter((e) => e.l === "A").length;

  const resetFilters = () => {
    setQuery("");
    setType("all");
    setLevel("all");
    setSelectedFields([]);
  };

  // 首次恢复筛选状态：URL 查询参数优先（可分享/可刷新）；
  // 无参数时恢复持久化偏好（主人：服务器同步 / 游客：localStorage 记忆）。
  // ready 前不恢复——偏好尚未加载完（主人需拉取服务器），避免用默认值覆盖。
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    const p = new URLSearchParams(window.location.search);
    const t = p.get("type");
    const l = p.get("level");
    const keys = (p.get("fields") ?? "").split(",").filter(Boolean);
    const q = p.get("q");

    if (t || l || keys.length || q !== null) {
      setQuery(q ?? "");
      if (t === "conf" || t === "jour") setType(t);
      if (l === "A" || l === "B" || l === "C") setLevel(l);
      setSelectedFields(
        keys
          .map((k) => KEY_TO_FIELD.get(k))
          .filter((f): f is string => Boolean(f)),
      );
      restored.current = true;
      return;
    }
    if (!ready) return; // 偏好加载中，等加载完成再恢复

    restored.current = true;
    const saved = prefs[STORAGE_KEY] as SavedFilters | undefined;
    if (saved) {
      setQuery(saved.q ?? "");
      if (saved.type === "conf" || saved.type === "jour") setType(saved.type);
      if (saved.level === "A" || saved.level === "B" || saved.level === "C")
        setLevel(saved.level);
      setSelectedFields(
        (saved.fields ?? []).filter((f) => ALL_FIELDS.has(f)),
      );
    }
  }, [ready, prefs]);

  // 筛选状态变化时同步：URL（可分享）+ 偏好持久化（主人服务器 / 游客 localStorage）。
  // 跳过首次渲染：客户端导航可能重复挂载组件，若首次就用默认 state 写入，
  // 会覆盖已保存的偏好，导致恢复失效。
  const hasPersisted = useRef(false);
  useEffect(() => {
    if (!hasPersisted.current) {
      hasPersisted.current = true;
      return;
    }
    const p = new URLSearchParams();
    if (selectedFields.length > 0) {
      p.set(
        "fields",
        selectedFields.map((f) => FIELD_KEYS[FIELD_KEY(f)]).join(","),
      );
    }
    if (type !== "all") p.set("type", type);
    if (level !== "all") p.set("level", level);
    const q = query.trim();
    if (q) p.set("q", q);
    const qs = p.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);

    setPref(STORAGE_KEY, {
      fields: selectedFields,
      type,
      level,
      q,
    } satisfies SavedFilters);
  }, [type, level, selectedFields, query, setPref]);

  return (
    <div className="flex flex-col gap-6">
      {/* 统计条（四页统一形态） */}
      <ScholarStats
        items={[
          { value: total, label: t("statsTotal") },
          { value: ccf.conferences.length, label: t("statsConferences") },
          { value: ccf.journals.length, label: t("statsJournals") },
          { value: classACount, label: t("statsClassA") },
        ]}
      />

      {/* 筛选面板：搜索 + 类型 + 等级 + 领域，全部收进同一块 sticky 面板 */}
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
            value={[type]}
            onValueChange={(v) => setType((v[0] as TypeFilter) ?? "all")}
            className="ccf-segmented flex-wrap"
          >
            <ToggleGroupItem value="all">{t("typeAll")}</ToggleGroupItem>
            <ToggleGroupItem value="conf">{t("typeConference")}</ToggleGroupItem>
            <ToggleGroupItem value="jour">{t("typeJournal")}</ToggleGroupItem>
          </ToggleGroup>

          <ToggleGroup
            size="sm"
            value={[level]}
            onValueChange={(v) => setLevel((v[0] as LevelFilter) ?? "all")}
            className="ccf-segmented flex-wrap"
          >
            <ToggleGroupItem value="all">{t("levelAll")}</ToggleGroupItem>
            {/* 圆点 = 该等级的颜色，与行内 `CCF-A/B/C` 徽章同一套（grade.ts）；
                等级名本来就写在这排控件里，染上色它就是图例，不必另起一行。 */}
            {(["A", "B", "C"] as const).map((l) => (
              <ToggleGroupItem key={l} value={l}>
                <span aria-hidden className={`size-1.5 rounded-full ${ccfDotClass(l)}`} />
                {l}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <ScholarCount>
            {shown} {t("items")}
          </ScholarCount>
        </ScholarFilterRow>

        <ScholarFieldFilter
          ariaLabel={t("fieldFilter")}
          allLabel={t("fieldAll")}
          fields={fields}
          selected={selectedFields}
          labelOf={fieldShortName}
          titleOf={fieldName}
          onToggle={toggleField}
          onClear={() => setSelectedFields([])}
        />
      </ScholarFilter>

      {groups.length === 0 ? (
        <Empty>
          <EmptyMedia variant="icon">
            <BookOpenIcon aria-hidden />
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
        /* 按领域分组：一个领域 = 一块面板，标题条即表头 */
        <div className="flex flex-col gap-6">
          {groups.map((g, gi) => (
            <ScholarPanel
              key={g.field}
              id={`ccf-field-${gi}`}
              labelledBy={`ccf-field-h-${gi}`}
              className="scroll-mt-40"
            >
              <ScholarPanelHeader
                id={`ccf-field-h-${gi}`}
                label={fieldName(g.field)}
                count={`${g.list.length} ${t("items")}`}
              />
              <ul className="divide-y divide-border/60">
                {g.list.map((e, ei) => {
                  const isConf = ccf.conferences.includes(e);
                  const prev = ei > 0 ? g.list[ei - 1] : null;
                  const prevIsConf = prev ? ccf.conferences.includes(prev) : null;
                  return (
                    <Fragment key={`${isConf ? "conf" : "jour"}-${e.a}-${e.l}-${e.n}`}>
                      {prev && prevIsConf !== isConf && (
                        <TypeDivider type={isConf ? "conf" : "jour"} />
                      )}
                      <EntryRow entry={e} />
                    </Fragment>
                  );
                })}
              </ul>
            </ScholarPanel>
          ))}
        </div>
      )}
    </div>
  );
}
