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

/**
 * 「垃圾邮件」类文件夹名（回退名单，与 webmail 端 `JUNK_FOLDER_NAMES` 同一份，
 * 见 webmail/src/write.ts）。回退条件同 `SENT_FOLDER_NAMES`。
 */
const JUNK_FOLDER_NAMES = new Set([
  "junk",
  "junk e-mail",
  "spam",
  "bulk mail",
  "垃圾邮件",
  "垃圾箱",
]);

/** RFC 6154 的「垃圾邮件」标志位（JSON 里是带一个反斜杠的字符串） */
const JUNK_USE = "\\Junk";

/**
 * 单个副本是否在垃圾邮件夹里（special-use 优先，名字回退）。
 */
export function isJunkCopy(c: MailCopyRef): boolean {
  return c.specialUse ? c.specialUse === JUNK_USE : JUNK_FOLDER_NAMES.has(c.folder.trim().toLowerCase());
}

/**
 * 这封邮件是否**含有**垃圾副本——界面据此把整理动作换成「移出垃圾」。
 *
 * 2026-10-29 用户报障：在「垃圾」tab 里，一封同时有收件箱副本的邮件仍然显示「标为垃圾」，
 * 点击后服务端把收件箱那份也搬进垃圾（它本来就在垃圾里）→ 看起来毫无反应。
 * 现在改为 **any**：只要有垃圾副本，动作就是「移出垃圾」。
 *
 * ⚠ 移出时**不能**把全部副本都搬去 INBOX（有收件箱副本时会造出重复）：调用方要按
 *   `junkCopies = copies.filter(isJunkCopy)` 只处理垃圾副本；如果还有非垃圾副本，
 *   就删掉垃圾副本而不是搬回 INBOX（见 mail-client / message-view 的 notJunk 实现）。
 */
export function hasJunkCopy(copies: MailCopyRef[] | undefined): boolean {
  return !!copies?.length && copies.some(isJunkCopy);
}

/**
 * 这封邮件是不是「只躺在垃圾邮件夹里」——仅用于需要区分「唯一副本」的场景。
 *
 * ⚠ 界面动作请用 `hasJunkCopy`（2026-10-29 起）：同一封邮件可能同时有收件箱与垃圾
 *   副本，只躺在垃圾里只是其中一种。
 */
export function isJunkOnly(copies: MailCopyRef[] | undefined): boolean {
  return !!copies?.length && copies.every(isJunkCopy);
}
