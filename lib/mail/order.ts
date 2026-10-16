import type { MailListItem } from "@/lib/mail/types";

/**
 * 列表排序：与服务端 `GET /messages` 的 `ORDER BY m.date DESC, m.message_id DESC`
 * **同一口径**。
 *
 * 为什么要有这个函数：乐观 UI 会把行"放回"列表（撤销、操作失败回滚），插回的位置必须
 * 与服务端给的一致——否则用户会看到同一封邮件在列表里跳来跳去，比"慢"更糟。
 */
export function byListOrder(a: MailListItem, b: MailListItem): number {
  return (b.date ?? "").localeCompare(a.date ?? "") || b.messageId.localeCompare(a.messageId);
}

/** 按列表口径插回一封邮件（已存在则原样返回，不重排、不重复） */
export function insertByListOrder(list: MailListItem[], item: MailListItem): MailListItem[] {
  if (list.some((x) => x.messageId === item.messageId)) return list;
  return [...list, item].sort(byListOrder);
}

/**
 * 「静默刷新」用的列表合并（2026-10-16）：以服务端刚返回的**首屏**为准更新列表，
 * 但**保留比首屏更老的那些已加载页**（用户点过「加载更多」或哨兵自动续过页的行）。
 *
 * 为什么需要它：后台自己动了数据（抓进新邮件、手机端标已读/删信、自己在别处发了一封）
 * 时列表必须跟上，但用户可能正滚在第 3 页上——直接整表替换会把他弹回第一页，
 * 他什么都没点。合并的规则就一条：
 *   - 首屏范围内的行**完全以服务端为准**（新增的进来、改过的更新、消失的滚蛋）；
 *   - 首屏之外（比首屏最后一封更老）的行原样留着。
 *
 * ⚠ `hasMore` 必须传服务端这次返回的「还有更多」游标是否存在：服务端说「没有更多」时
 *   本次首屏就是全部匹配，旧列表里多出来的行一律作废（否则删掉的邮件会赖在列表上）。
 * ⚠ 首屏为空时返回空列表——服务端说这个筛选下什么都没有，列表就该是空的。
 * ⚠ 边界行（首屏最后一封）自己：`byListOrder(m, oldest) > 0` 严格更老才算「首屏之外」，
 *   等于它自己的那行会被服务端版本替换掉。
 */
export function reconcileRows(
  prev: MailListItem[],
  next: MailListItem[],
  hasMore: boolean,
): MailListItem[] {
  if (next.length === 0) return [];
  if (!hasMore) return next;
  const oldest = next[next.length - 1];
  return [...next, ...prev.filter((m) => byListOrder(m, oldest) > 0)];
}
