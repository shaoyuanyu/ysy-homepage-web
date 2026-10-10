/**
 * 邮件日期的显示格式（列表行 / 草稿行 / agent 时间线共用）。
 *
 * 列表里的日期按粒度分三档：今天给时刻、今年给月日、跨年补上年份。
 * 跨年必须带年份——QQ 草稿箱里有 2014 年起的旧草稿，只写「1月5日」看不出是哪一年。
 */
export function formatDate(dateIso: string | null, locale: string): string {
  if (!dateIso) return "";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleString(locale, { month: "short", day: "numeric" });
  }
  return d.toLocaleString(locale, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * 日期 + 时刻（详情页 / agent 台账）：读信场景要确切时间点，年年月月日时分全给。
 * 不用「1 天前」这类相对措辞。
 */
export function formatDateTime(dateIso: string | null, locale: string): string {
  if (!dateIso) return "";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
