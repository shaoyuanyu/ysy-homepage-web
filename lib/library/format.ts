import type { PaperDetail, PaperSummary, VenueRef } from "@/lib/library/types";

export function authorLine(authors: { displayName: string }[], limit = 3): string {
  if (!authors.length) return "—";
  const names = authors.slice(0, limit).map((author) => author.displayName);
  return authors.length > limit ? `${names.join(", ")} et al.` : names.join(", ");
}

export function venueLine(venue: VenueRef | null): string {
  if (!venue) return "—";
  const name = venue.abbrev ?? venue.fullName;
  return venue.edition ? `${name} ${venue.edition.year}` : name;
}

/** 列表里的发表信息：`CCS '24`。优先用 venue 缩写；年份取届次年份，
 *  没有届次时退回论文年份，统一成两位（`'24`）——列表里 venue 全名和
 *  「ICML 2024」两种写法混排会让这一列高度不齐、也看不出会议缩写。 */
export function venueShort(venue: VenueRef | null, fallbackYear?: number): string | null {
  if (!venue) return null;
  const year = venue.edition?.year ?? fallbackYear;
  const name = (venue.abbrev ?? venue.fullName).replace(/\s+(19|20)\d{2}\s*$/, "");
  return year ? `${name} '${String(year).slice(-2)}` : name;
}

export function ccfLevel(paper: PaperSummary): string | null {
  return paper.evaluation.ccf?.level ?? null;
}

export function casLevel(paper: PaperSummary): string | null {
  return paper.evaluation.cas?.level ?? null;
}

export function statusLabel(status: string): string {
  return (
    {
      unread: "未读",
      queued: "待读",
      reading: "在读",
      read: "已读",
      skimmed: "已略读",
    }[status] ?? status
  );
}

export function kindLabel(kind: string): string {
  return (
    {
      journal: "期刊",
      conference: "会议",
      preprint: "预印本",
      book: "书籍",
      book_chapter: "章节",
      thesis: "学位论文",
      tech_report: "技术报告",
      dataset: "数据集",
      other: "其他",
    }[kind] ?? kind
  );
}

export function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function shortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 列表里的添加日期：`2026-11-20`。固定 ISO 形态而非 locale 变体，
 *  让中英两种语言下的列宽与对齐一致（表格列不适合按语言变宽）。
 *  按 UTC 取日：容器是 UTC，浏览器可能是 UTC+8；若按本地时区格式化，
 *  SSR 与水合会算出不同的日期（React 文本不匹配），也让列表与详情页的
 *  服务端日期（`shortDate`）口径不一致。 */
export function compactDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function tagLabel(path: string): string {
  return path.replaceAll("/", " › ").replace(":", ": ");
}

export function paperHref(paper: Pick<PaperDetail, "id">): string {
  return `/library/papers/${paper.id}`;
}
