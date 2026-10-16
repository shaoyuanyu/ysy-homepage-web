"use client";

import { createContext, useContext } from "react";

/**
 * 详情页的两个「看这一栏」开关（2026-10-14 / 2026-10-16，状态都在 `MailShell`）：
 *
 * - **全屏查看**（`full` / `setFull`）：收起左侧列表，详情占满整个面板（两栏 → 一栏）。
 * - **专注模式**（`focus` / `setFocus`）：把站点外壳让开——顶栏 / 页脚 / 浮动导航 / 页头
 *   （标题 + 四个入口按钮）隐藏、页面上下留白归零，面板吃满视口高度。
 *
 * 两者**互相独立**（可单开、可同开），也都不持久化。
 *
 * 宽屏两栏布局是 `MailShell` 的事，而这两枚开关长在详情页一侧——布局的主人（Shell）与
 * 按钮的主人（MessageView）不是同一条导入链上的直接父子，用 context 传递。
 *
 * ⚠ 单独一个文件，**不要**并进 `mail-shell.tsx`：Shell → MailClient → MessageView 已经是
 *   一条导入链，MessageView 再反过来导入 Shell 就成环了（构建器容忍环，但 hook 的绑定
 *   在环里很容易拿到还没初始化完的模块）。
 * ⚠ 缺省值都是「关」且 setter 是空函数：详情页在 Shell 之外单独渲染时（理论上没有）
 *   也不会炸，只是按钮点了没反应。
 */
const MailFullscreenContext = createContext<{
  full: boolean;
  setFull: (v: boolean) => void;
  focus: boolean;
  setFocus: (v: boolean) => void;
}>({ full: false, setFull: () => {}, focus: false, setFocus: () => {} });

export const MailFullscreenProvider = MailFullscreenContext.Provider;

export function useMailFullscreen() {
  return useContext(MailFullscreenContext);
}
