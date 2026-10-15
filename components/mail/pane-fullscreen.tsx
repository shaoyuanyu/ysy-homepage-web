"use client";

import { createContext, useContext } from "react";

/**
 * 「全屏查看」开关（2026-10-14 用户要求）：详情页隐藏左侧列表、占满整个面板。
 *
 * 宽屏两栏布局是 `MailShell` 的事，而这枚开关长在详情页的工具栏上——
 * 布局的主人（Shell）与按钮的主人（MessageView）不是同一条导入链上的直接父子，
 * 用 context 传递。
 *
 * ⚠ 单独一个文件，**不要**并进 `mail-shell.tsx`：Shell → MailClient → MessageView 已经是
 *   一条导入链，MessageView 再反过来导入 Shell 就成环了（构建器容忍环，但 hook 的绑定
 *   在环里很容易拿到还没初始化完的模块）。
 * ⚠ 缺省值是「关」并且 `setFull` 是空函数：详情页在 Shell 之外单独渲染时（理论上没有）
 *   也不会炸，只是按钮点了没反应。
 */
const MailFullscreenContext = createContext<{
  full: boolean;
  setFull: (v: boolean) => void;
}>({ full: false, setFull: () => {} });

export const MailFullscreenProvider = MailFullscreenContext.Provider;

export function useMailFullscreen() {
  return useContext(MailFullscreenContext);
}
