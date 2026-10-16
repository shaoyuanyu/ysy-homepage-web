/**
 * 邮件「专注模式」的持久化键与读写（MAIL-AGENT.md 4.12）。
 *
 * 2026-10-16 第二轮（用户：「在关闭查看邮件时，也应该有『专注模式』的按钮，且能保持该模式」）：
 * 先前它是**详情页的临时形态**——离开详情路由就复位、刷新即失效，于是「读信 → 关闭 →
 * 回列表」之后连开关本身都没了。现在它是一个**记住了的阅读偏好**：
 *
 * - 写 localStorage，页面加载时读回（`MailShell` 的 state）；
 * - 邮件页的**每个视图**（列表 / 详情 / 撰写）都挂着同一枚中缝把手，不只在详情页；
 * - 根 layout 的**首帧内联脚本**（`app/layout.tsx`）在 paint 前就把它挂到 `<html>`
 *   上，刷新时不会先闪一下顶栏 / 页脚再收起来（与 theme / owner 缓存同一套路）。
 *
 * ⚠ 值只有 `"1"` 与「键不存在」两种，不用 JSON 包装：首帧脚本只能做最简单的字符串比较，
 *   两边读的必须是同一个键（`MAIL_FOCUS_KEY` 由 layout.tsx 插值进脚本，只有这一处定义）。
 * ⚠ **不进** `lib/preferences/registry.ts` 的主人偏好（跨设备同步那套）：① 首帧必须**同步**
 *   读到，而偏好系统是异步拉 `/api/preferences`，只能等回来再挂属性——那就白闪一下；
 *   ② 邮箱页至今一个偏好请求都不发，别为这个开头；③ 这是「**这台设备上**怎么读信」的
 *   口味（大屏、看长信），不是账号级设置。
 */
export const MAIL_FOCUS_KEY = "mail:focusMode";

/**
 * 当前是否在邮箱页（`/mail`、`/mail/compose`、`/mail/message/:id`）。
 * 路由段判定而非前缀匹配：`/mailbox` 这类不该算邮件页（`app/layout.tsx` 的首帧脚本
 * 用的是同一套「按 `/` 切段」判据）。
 *
 * 用途：专注模式是**邮箱页的形态**，属性挂在 `<html>` 上却是全局的——从邮件页跳到
 * 别的页面时，若外壳一时半会儿还没卸载，这条判据保证属性立刻撤掉，别的页面不会
 * 莫名其妙少一截顶栏。
 */
export function isMailPath(pathname: string): boolean {
  return pathname.split("/").includes("mail");
}

/** 读持久化的专注模式；localStorage 不可用（隐私模式等）时按「关」 */
export function readStoredMailFocus(): boolean {
  try {
    return window.localStorage.getItem(MAIL_FOCUS_KEY) === "1";
  } catch {
    return false;
  }
}

/** 写持久化的专注模式（关 = 删键，不留 "0" 这类残渣） */
export function storeMailFocus(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(MAIL_FOCUS_KEY, "1");
    else window.localStorage.removeItem(MAIL_FOCUS_KEY);
  } catch {
    // 写入失败静默：本次会话内照样生效，只是刷新后忘掉
  }
}
