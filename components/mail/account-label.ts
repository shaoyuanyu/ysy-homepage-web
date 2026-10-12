import type { MailAccount } from "@/lib/mail/types";

/**
 * 账号的**名字**：**备注名 > 发件人姓名 > 空**（2026-10-11 用户定稿的优先级）。
 *
 * - 备注名（`displayName`）= 本地备注，给自己看的辨识名；
 * - 没备注名时退到**发件人姓名**（`senderName`）——它是这个账号对外发出的名字，认得出是谁
 *   （用户原话：「按 `备注名+地址` > `发件人姓名+地址` > `地址` 的优先级显示」）；
 * - 两者都没有 → 空串，由调用方决定「只剩地址」怎么渲染。
 *
 * ⚠ 与 `senderLabel()`（写信页发件人下拉）不是一回事：那个**只认发件人姓名**
 * （外发身份，绝不能回落到仅站内可见的备注名），这里只解决「站内怎么称呼这个账号」。
 */
export function accountDisplayName(
  account: Pick<MailAccount, "displayName" | "senderName">,
): string {
  return account.displayName || account.senderName || "";
}

/**
 * 账号显示文案（2026-10-05 用户定稿，尖括号形式）：
 * - 有名字（备注名 / 发件人姓名）→ 「名字<邮箱>」——只显示名字无法辨识是哪个邮箱；
 * - 都没有 → 直接显示邮箱。
 * 工具栏账号下拉（触发器 + 菜单项）、底栏账号一览的悬浮提示共用同一格式。
 */
export function accountLabel(
  account: Pick<MailAccount, "displayName" | "senderName" | "email">,
): string {
  const name = accountDisplayName(account);
  return name ? `${name}<${account.email}>` : account.email;
}

/**
 * 账号**名字**（2026-10-11）：备注名 → 发件人姓名 → 退回**邮箱地址**。
 *
 * 起因：备注名以前是后端必填（`缺少显示名称`），想「让账号显示成邮箱地址」的用户只能
 * 把邮箱填进备注名里。现在允许留空，于是「没有备注名」必须在**每一个**显示账号名的
 * 地方都有个落点——漏一处就是一片空白（底栏账号一览、账号管理列表、底栏告警里的
 * 账号名都飘过这种空）。
 *
 * ⚠ 与 `accountLabel()` 的分工：那个是「名字<邮箱>」的完整形态（工具下拉、悬浮提示
 * 用，信息量大）；这个是**只放一行名字**的地方（色点图例、账号列表标题、告警文案）。
 * `fallback` 给「查不到这个 id」时兜底（旧写法是 `?? id`）。
 */
export function accountName(
  account: Pick<MailAccount, "displayName" | "senderName" | "email"> | null | undefined,
  fallback = "",
): string {
  return account ? accountDisplayName(account) || account.email : fallback;
}

/**
 * 发件人显示文案（写信页的「发件人」下拉，2026-10-06 用户定稿）：**实际外发身份**——
 * 发件人姓名（senderName）随邮件发出，写信页所见即收件人所见；无发件人姓名时只
 * 显示邮箱地址（**从不会回落到备注名**——那是仅站内可见的本地信息，见 types.ts 的
 * senderName 注释）。
 */
export function senderLabel(account: Pick<MailAccount, "senderName" | "email">): string {
  return account.senderName ? `${account.senderName}<${account.email}>` : account.email;
}
