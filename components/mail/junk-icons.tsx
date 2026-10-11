import type { ComponentProps } from "react";

/**
 * 「标为垃圾 / 移出垃圾」这一对图标（2026-10-11 用户选定）。
 *
 * 由来：这两枚此前一直借别人的图标——先是 `FolderInputIcon`，再是 `OctagonAlertIcon`，
 * 然后为凑"一对信封"把「全部标为已读」原有的 `MailCheckIcon` 挪了过来（用户 2026-10-11
 * 指出这是挪用，已还原）。用户的要求是明确的：**两枚要成一套、又要和「删除」区分开**。
 * lucide 里没有这样的成对图标（翻过盾牌 / 归档 / 消息框 / 昆虫 / 信封加减几组，都不贴切），
 * 故改用 Tabler 的 `shield-x` / `shield-check`：**同一盾形、一叉一勾**，与垃圾桶（有盖 + 提手
 * + 桶身）形态上毫不相干；线条粗细也与 lucide 最接近，混在一条动作条里不违和。
 *
 * ⚠ 为什么不用 `<Icon icon="tabler:shield-x" />`（项目里已装 `@iconify/react`）：
 *   `@iconify/react` 的图标数据默认是**运行时从 `api.iconify.design` 拉**的（首页那几个
 *   社交图标就是这么用的）。行内动作条是核心操作，CDN 抖一下按钮就空白，且大陆网络访问该
 *   CDN 并不稳定。这里把 Tabler 的原始路径**内联成本地 SVG 组件**：零网络、零新增依赖。
 *
 * 行为与 lucide 图标完全一致：`currentColor` 描边、接受任意 SVG 属性（含 `className` /
 * `data-icon`）、默认 24×24——实际尺寸由按钮的 `[&_svg:not([class*='size-'])]:size-*` 规则
 * 收紧到 16px / 14px（见 `components/ui/button.tsx`）。
 *
 * 图标来源：Tabler Icons（MIT），24×24 viewBox、2px 描边、圆角端点。
 * 对照预览：`/tmp/icon-preview/`（由 `gen-icon-preview2.mjs` 生成的临时对照页，组号 T1）。
 */

const SHIELD_BASE = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** 盾牌 + 叉 = Tabler `shield-x`：「标为垃圾」 */
export function JunkIcon(props: ComponentProps<"svg">) {
  return (
    <svg {...SHIELD_BASE} {...props}>
      <path d="M13.252 20.601q-.613.233-1.252.399A12 12 0 0 1 3.5 6A12 12 0 0 0 12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-.19 7.357M22 22l-5-5m0 5l5-5" />
    </svg>
  );
}

/** 盾牌 + 勾 = Tabler `shield-check`：「移出垃圾」 */
export function NotJunkIcon(props: ComponentProps<"svg">) {
  return (
    <svg {...SHIELD_BASE} {...props}>
      <path d="M11.46 20.846A12 12 0 0 1 3.5 6A12 12 0 0 0 12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-.09 7.06M15 19l2 2l4-4" />
    </svg>
  );
}
