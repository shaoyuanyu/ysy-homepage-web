/**
 * 类型安全的数据访问层。
 *
 * Velite 将「文件结构」作为集合条目输出（Array<_output>），
 * YAML 数据文件是 { key: [...] } 包装结构，这里统一解包为
 * 可直接消费的数组，页面/组件只依赖本模块。
 *
 * 类型从 Velite schema 自动推导：
 * 例如 Publication = 集合条目中的数组元素类型。
 */
import {
  navLinks as rawNavLinks,
  profile,
  publications as rawPublications,
  projects as rawProjects,
  talks as rawTalks,
} from "@velite/index";

import {
  blogArticles,
  blogStaticParams,
  getPost,
  listPosts,
  resolvePost,
} from "@/lib/data/blog";

export { profile };
// 博客文章：多语言聚合（同一 slug 的 zh/en 视为同一篇文章的翻译版本）
export { blogArticles, blogStaticParams, getPost, listPosts, resolvePost };
export type { BlogArticle, LocalizedPost } from "@/lib/data/blog";

type RawEntry<T> = (T extends readonly (infer E)[] ? E : never) | undefined;
type Field<T, K extends string> = T extends Record<K, infer V> ? V : never;

// 集合条目中的元素类型：{ publications: Publication[] } → Publication
// RawEntry 处理 `rawX[0]` 可能 undefined 的情况（非数组时直接取值）
type Publication = NonNullable<RawEntry<typeof rawPublications>> extends infer E
  ? Field<E, "publications"> extends readonly (infer P)[]
    ? P
    : never
  : never;

type Talk = NonNullable<RawEntry<typeof rawTalks>> extends infer E
  ? Field<E, "talks"> extends readonly (infer T)[]
    ? T
    : never
  : never;

type Project = NonNullable<RawEntry<typeof rawProjects>> extends infer E
  ? Field<E, "projects"> extends readonly (infer P)[]
    ? P
    : never
  : never;

type NavLinkGroup = NonNullable<RawEntry<typeof rawNavLinks>> extends infer E
  ? Field<E, "groups"> extends readonly (infer G)[]
    ? G
    : never
  : never;

export type { NavLinkGroup, Project, Publication, Talk };
export type { Post, Profile } from "@velite/index";

export const publications: Publication[] =
  rawPublications[0]?.publications ?? [];
export const talks: Talk[] = rawTalks[0]?.talks ?? [];
export const projects: Project[] = rawProjects[0]?.projects ?? [];
export const navLinks: NavLinkGroup[] = rawNavLinks[0]?.groups ?? [];

// ---- CCF 推荐目录（静态数据，来源 https://ccf.atom.im/ 2026 第七版）----
import ccfData from "./ccf-2026.json";

export type CcfEntry = {
  /** 缩写 */
  a: string;
  /** 全称 */
  n: string;
  /** 级别 A/B/C */
  l: "A" | "B" | "C";
  /** 专业领域（官方中文名） */
  f: string;
  /** DBLP venue 页链接（脚本生成，可能为空） */
  d?: string;
};

export const ccf = ccfData as {
  version: string;
  edition: number;
  conferences: CcfEntry[];
  journals: CcfEntry[];
};

// ---- 中科院分区表（升级版，静态数据，来源：fenqubiao.com 官方发布）----
import casData from "./cas-2025.json";

/** 中科院大类分区 1/2/3/4 */
export type CasZone = "1" | "2" | "3" | "4";

/** 小类（JCR 学科）分区信息 */
export type CasSub = {
  /** JCR 学科（规范英文名） */
  en: string;
  /** 官方中文名（如「计算机：人工智能」） */
  zh: string;
  /** 该学科下分区 1-4 */
  l: CasZone;
  /** 该学科内排名（按影响因子） */
  r: number;
  /** 该学科期刊总数 */
  t: number;
};

export type CasEntry = {
  /** 期刊名 */
  n: string;
  /** ISSN/EISSN（"xxxx-xxxx/yyyy-yyyy"） */
  i: string;
  /** WoS 收录类型（SCIE / SSCI / ESCI / AHCI 等，可为复合） */
  w: string;
  /** 是否 Top 期刊（升级版 Top 标识） */
  top: boolean;
  /** [大类中文名, 分区, 大类内排名, 大类内总数] */
  m: [string, CasZone, number, number];
  /** 小类（JCR 学科）分区列表 */
  s: CasSub[];
};

export type CasSubject = {
  /** 官方中文名 */
  zh: string;
  /** 规范英文名 */
  en: string;
};

type RawCasRow = Omit<CasEntry, "s"> & {
  m: [string, CasZone, number, number];
  s: [string, string, CasZone, number, number][];
};

const rawCas = casData as unknown as {
  fetchedAt: string;
  version: string;
  source: string;
  rows: RawCasRow[];
  subjects: CasSubject[];
  stats: { zones: Partial<Record<CasZone, number>>; top: number };
};

/** 虚词：非句首时一律小写 */
const TITLE_STOP = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of",
  "on", "or", "the", "to", "via", "with",
]);

/** 必须保持全大写的缩写（其余全大写词一律按普通单词转 Title Case） */
const TITLE_KEEP = new Set([
  "ACM", "AEU", "AI", "ASME", "CCF", "ETRI", "ICGA", "IEEE", "IEICE",
  "IETE", "IMA", "INFORMS", "ISA", "RAIRO", "SIAM", "SIGMOD", "VLDB",
]);

/** 行内紧凑数组 → CasSub 对象（调用方按需展开，避免运行时解析开销） */
function unpackSub(sub: [string, string, CasZone, number, number]): CasSub {
  return { en: sub[0], zh: sub[1], l: sub[2], r: sub[3], t: sub[4] };
}

/** 中科院分区表（仅计算机科学大类，2025 升级版） */
export const cas = {
  fetchedAt: rawCas.fetchedAt,
  version: rawCas.version,
  rows: rawCas.rows.map((row) => ({
    ...row,
    n: displayTitle(row.n),
    m: row.m as CasEntry["m"],
    s: row.s.map(unpackSub),
  })),
  /** 全量 JCR 学科词表（按中文名排序，供筛选 chips 使用） */
  subjects: rawCas.subjects,
  stats: rawCas.stats,
  /** 中科院大类名称（中文，数据唯一值） */
  mainField: rawCas.rows[0]?.m[0] ?? "",
};

/**
 * 小类学科名的显示缩写：去掉与期刊所属大类重复的前缀。
 *
 * 数据里的中文名自带大类前缀（`计算机：信息系统`），英文名同理
 * （`Computer Science, Information Systems`）。本页只收「计算机科学」大类，
 * 1292 条小类里有 779 条前缀就是它 —— 每行都重复一遍「计算机：」是纯噪音，
 * 而且把真正要看的学科名挤到右边，英文界面下被截成
 * `Computer Science, Informa…`（截掉的部分恰好就是信息所在）。
 *
 * 前缀**不是**本大类时保留（`工程：电子与电气`）—— 它携带「跨大类」信息，
 * 是这一列难得的不重复内容。完整中英名仍在行内 tooltip 里。
 */
export function shortSubjectName(sub: CasSub, mainField: string, isZh: boolean) {
  const colon = sub.zh.indexOf("：");
  const zhPrefix = colon > 0 ? sub.zh.slice(0, colon) : "";
  const sameField = zhPrefix !== "" && mainField.startsWith(zhPrefix);
  if (!sameField) return isZh ? sub.zh : sub.en;
  return isZh ? sub.zh.slice(colon + 1) : sub.en.replace(/^[^,]+, ?/, "");
}

// ---- 会议 deadline 日历（自动同步自 ccfddl + 本地覆盖层合并）----
import deadlineData from "./deadlines.json";
import { deadlinesOverrides as rawDeadlinesOverrides } from "@velite/index";

export type DeadlineTimelineEntry = {
  /** 截止时间 "YYYY-MM-DD HH:mm:ss" */
  t: string;
  /** 轮次备注（如 "first round"） */
  c?: string;
  /** "abstract" = 摘要截止；"paper" / 缺省 = 全文截止 */
  k?: "abstract" | "paper";
};

export type DeadlineYear = {
  y: number;
  link?: string;
  /** 归一化 IANA 时区（fetch 脚本已处理 AoE/UTC±X/缩写） */
  tz: string;
  date?: string;
  place?: string;
  timeline: DeadlineTimelineEntry[];
};

export type DeadlineConf = {
  /** 缩写 */
  a: string;
  /** 全称 */
  n: string;
  /** CCF 等级 A/B/C；"" = 未收录 */
  l: "A" | "B" | "C" | "";
  /** 领域（CCF 官方中文名，与 ccf 数据同词表） */
  f: string;
  /** DBLP 链接 */
  d?: string;
  years: DeadlineYear[];
};

type OverrideConf = NonNullable<typeof rawDeadlinesOverrides>["conferences"][number];

/** 覆盖层原始数据（API 手动同步时与最新拉取数据重新合并） */
export const deadlinesOverrides: OverrideConf[] =
  rawDeadlinesOverrides?.conferences ?? [];

const rawDeadlines = deadlineData as {
  fetchedAt: string;
  source: string;
  conferences: DeadlineConf[];
};

/**
 * 合并：覆盖层按缩写整体替换自动数据（大小写不敏感）。
 * 构建时合并一次得到静态 `deadlines`；手动同步 API 拉取最新数据后
 * 用同一函数重新合并，保证运行时数据与覆盖层规则一致。
 *
 * ⚠ `years` 省略时**保留自动数据的届别/时间线**（覆盖层只想修正名称等字段时
 *   不必复制整份 timeline）；显式提供 `years` 时才以覆盖层为准。
 */
export function mergeDeadlines(
  raw: DeadlineConf[],
  overrides: OverrideConf[],
): DeadlineConf[] {
  const map = new Map<string, DeadlineConf>();
  for (const c of raw) map.set(c.a.toLowerCase(), c);
  for (const o of overrides) {
    const base = map.get(o.a.toLowerCase());
    map.set(o.a.toLowerCase(), {
      ...(base ?? { a: o.a, n: "", l: "", f: "" }),
      ...o,
      l: o.l ?? base?.l ?? "",
      f: o.f ?? base?.f ?? "",
      // 省略 years（或给空数组）时保留自动数据的届别/时间线
      years: o.years?.length ? o.years : (base?.years ?? []),
    });
  }
  return [...map.values()].sort((x, y) => x.a.localeCompare(y.a));
}

export const deadlines: DeadlineConf[] = mergeDeadlines(
  rawDeadlines.conferences,
  deadlinesOverrides,
);
export const deadlinesFetchedAt = rawDeadlines.fetchedAt;

/**
 * 「喊叫式」全大写刊名的规范化（仅作用于**整串全大写**的名称）。
 *
 * 中科院分区表原始数据里有 269/758 条刊名是整串大写（`IEEE TRANSACTIONS ON
 * PATTERN ANALYSIS AND MACHINE INTELLIGENCE`），其余是正常 Title Case。同一
 * 列表里两种写法混排，大写那批会比周围粗一圈、并抢走 Top 徽章的注意力——
 * 看起来既像数据脏，又像样式坏了。
 *
 * 规则：逐词首字母大写、其余小写；虚词（of / the / on / and …）小写；
 * 缩写白名单（IEEE / ACM / VLDB …）与含数字的词（3D）原样保留；连字符与斜杠
 * 分段处理，所以 `KNOWLEDGE-BASED` → `Knowledge-Based`、`IEEE-ACM` → `IEEE-ACM`。
 *
 * 已经是正常大小写（含全小写、含中文）的名称**原样返回**，故可安全地对全量
 * 数据调用。
 */
export function displayTitle(raw: string): string {
  if (!raw) return raw;
  const letters = raw.replace(/[^A-Za-z]/g, "");
  if (!letters || raw !== raw.toUpperCase()) return raw;
  return raw
    .split(/\s+/)
    .map((token, wi) =>
      token
        .split(/([/&-])/)
        .map((part, pi) => {
          if (!/[A-Za-z]/.test(part)) return part;
          if (/\d/.test(part)) return part;
          if (TITLE_KEEP.has(part)) return part;
          const lower = part.toLowerCase();
          if (wi > 0 && pi === 0 && TITLE_STOP.has(lower)) return lower;
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(""),
    )
    .join(" ");
}

/**
 * 期刊 ISSN 展示串。
 *
 * 数据里的 ISSN 字段是「印刷版/电子版」（`"1553-877X/1553-877X"`），
 * 大量期刊两者相同。原样拼进列表行就成了 `ISSN 1553-877X/1553-877X`——
 * 同一串号写两遍，读者会以为是数据错了。这里去重后再输出。
 */
export function formatIssn(raw: string | null | undefined): string {
  if (!raw) return "";
  const list = raw
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  const uniq = list.filter((s, i) => list.indexOf(s) === i);
  return uniq.length > 0 ? `ISSN ${uniq.join(" / ")}` : "";
}
