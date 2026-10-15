/**
 * 「未读」蓝 —— 全站唯一一档（2026-10-16 定稿）。
 *
 * 四处共用：列表行未读点（`mail-row.tsx`）/ 大标题角标（`new-mail-notifier.tsx`）/
 * 顶栏「邮箱」入口点（`owner-nav-item.tsx`）/ 「未读」开关激活态（`mail-client.tsx`）。
 * **别再各写各的颜色**——「几处未读颜色不统一」正是这么来的（2026-10-16 用户报障）。
 *
 * 配色：不用 Tailwind 的 `blue-600`（#155dfc 饱和度过高，用户 2026-10-16「深蓝色不好看，
 * 可不可以换一种饱和度没这么高的颜色」），改手工挑的低饱和靛蓝——浅色主题 `#4E74C8`、
 * 深色主题 `#8FADE8`（白底对比度 ≈4.5:1、白字压在浅色档上 ≈4.5:1，都过 WCAG AA，
 * 但不再是「刺眼的蓝」）。
 *
 * ⚠ 全部导出**完整的静态类名字面量**（含 `dark:` 与 `aria-*` / `group-aria-*` 变体前缀）：
 *   Tailwind 的扫描器是文本级的——类名必须是源码里出现的完整字符串，任何运行时拼接
 *   （`"bg-" + x`）都会让它生成不出 CSS。形态与 `account-dot.ts` 的 `ACCOUNT_DOT` 一致。
 */

/** 实心圆点：列表行未读点 / 顶栏「邮箱」入口点（尺寸与 ring 由调用处给） */
export const UNREAD_DOT_CLASS = "bg-[#4E74C8] dark:bg-[#8FADE8]";

/** 数字胶囊（`/mail` 大标题角标）：浅色档白字 / 深色档深字 */
export const UNREAD_BADGE_CLASS = "bg-[#4E74C8] text-white dark:bg-[#8FADE8] dark:text-blue-950";

/** 「未读」开关（激活态）：按钮底 = 10% 同色、文字 = 同色 */
export const UNREAD_TOGGLE_CLASS =
  "aria-pressed:bg-[#4E74C8]/10 aria-pressed:text-[#4E74C8] dark:aria-pressed:bg-[#8FADE8]/15 dark:aria-pressed:text-[#8FADE8]";

/** 「未读」开关的点：未激活 = 线框环（无蓝）、激活 = 实心蓝点（border 与 bg 同色） */
export const UNREAD_TOGGLE_DOT_CLASS =
  "group-aria-pressed/toggle:border-[#4E74C8] group-aria-pressed/toggle:bg-[#4E74C8] dark:group-aria-pressed/toggle:border-[#8FADE8] dark:group-aria-pressed/toggle:bg-[#8FADE8]";
