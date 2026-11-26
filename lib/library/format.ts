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

export function tagLabel(path: string): string {
  return path.replaceAll("/", " › ").replace(":", ": ");
}

export function paperHref(paper: Pick<PaperDetail, "id">): string {
  return `/library/papers/${paper.id}`;
}
