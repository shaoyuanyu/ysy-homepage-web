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
