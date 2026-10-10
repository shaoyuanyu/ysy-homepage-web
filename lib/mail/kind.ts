import type { MailCopyRef } from "./types";

/**
 * 「已发送」类文件夹名（回退名单，与 webmail 端 `detectSentFolder` 一致，
 * 见 webmail/src/write.ts）。
 *
 * ⚠ 首选判据是服务端随 copies 给出的 `specialUse`（RFC 6154 标志位）——文件夹名各家不同，
 *   按名字猜在自定义命名的账号上会判错。这份名单只在服务端也给不出 special-use
 *   （客户端的库还没回填、或服务端不支持 SPECIAL-USE 且名字超出 imapflow 的推断名单）时兜底。
 *   回退不出结果时按「收件」显示：不会把收到的邮件误标成「已发送」。
 */
const SENT_FOLDER_NAMES = new Set([
  "sent",
  "sent items",
  "sent messages",
  "已发送邮件",
  "已发送",
]);

/** RFC 6154 的「已发送」标志位（JSON 里是带一个反斜杠的字符串） */
const SENT_USE = "\\Sent";

/**
 * 这封邮件是不是「我发出的」：全部副本都在「已发送」类文件夹。
 *
 * 收到的邮件必然有 INBOX 副本（webmail 只同步 INBOX + 已发送），
 * 故「副本全在已发送」= 自己发出的。用于列表行显示发件人还是「发给 X」、
 * 以及详情页隐藏「回复 / 快速回复」（2026-10-04 用户反馈后加的收件/发件区分）。
 */
export function isSentItem(copies: MailCopyRef[] | undefined): boolean {
  if (!copies?.length) return false;
  return copies.every((c) =>
    // 服务端给了 special-use 就以它为准；没给时才回退名字表（见 SENT_FOLDER_NAMES）
    c.specialUse ? c.specialUse === SENT_USE : SENT_FOLDER_NAMES.has(c.folder.trim().toLowerCase()),
  );
}
