/**
 * 邮件接口错误的展示文案（2026-10-07 统一）。
 *
 * 规则来自 MAIL-AGENT.md 4.9：**不回显内部错误码**——`webmaild_unreachable` 这类字符串
 * 用户看不懂、也没法处理；但也不能把失败伪装成「没有数据」（那会让人以为真的没有邮件）。
 *
 * 分两类：
 * - **传输层错误**（代理层给的 `webmaild_unreachable` / `mailagentd_unreachable`、
 *   浏览器 fetch 的 `Failed to fetch`、读路径超时的 `timeout`、401）→ 换成友好文案；
 * - **服务端业务文案**（如「账号 x 找不到『已发送』文件夹」「邮箱地址非法」）→ **原样保留**，
 *   那是可操作的，抹掉反而让人无从下手。
 *
 * ⚠ **每个「读接口失败」的出口都必须经过这里**（2026-10-10 第十二轮补的洞）：邮件列表
 *   曾把错误文案硬编码成 `loadFailed/loadFailedHint`，于是 401（会话过期）被显示成
 *   「邮件服务暂时不可用，请稍后重试」——用户会一直点「重试」而永远好不了。
 */
export type MailErrorKind = "unreachable" | "unauthorized" | "business";

export function mailErrorKind(raw: string | null | undefined): MailErrorKind {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "unreachable";
  if (
    s === "webmaild_unreachable" ||
    s === "mailagentd_unreachable" ||
    s.includes("failed to fetch") ||
    s.includes("fetch failed") ||
    // 读路径的统一超时闸门（lib/mail/fetch-timeout.ts）抛的哨兵值
    s.includes("timeout") ||
    s.includes("aborted")
  ) {
    return "unreachable";
  }
  if (s === "unauthorized" || s === "401") return "unauthorized";
  return "business";
}

/** 展示文案：友好文案走 i18n，业务文案原样返回（`t` 只接受这三个键，避免调用方拼错） */
export function mailErrorText(
  raw: string | null | undefined,
  t: (key: "serverUnreachable" | "unauthorized" | "loadFailed") => string,
): string {
  const kind = mailErrorKind(raw);
  if (kind === "unreachable") return t("serverUnreachable");
  if (kind === "unauthorized") return t("unauthorized");
  return (raw ?? "").trim() || t("loadFailed");
}
