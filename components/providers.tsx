"use client";

import { useEffect } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { MailNewMailWatcher } from "@/components/mail/new-mail-notifier";

/**
 * 应用根部的客户端 Providers（挂在 `app/[locale]/layout.tsx` 内）。
 *
 * ⚠ `<html data-hydrated="true">` 是给 E2E 的**机器可校验就绪信号**，勿删：
 * SSR 出的 HTML 在 `domcontentloaded` 时已完整可见，但此刻 React 合成事件尚未
 * 挂载——此时 click / fill 会被**静默丢弃**（不报错、无 console 警告，Playwright
 * 的 click 本身还会正常返回），后续断言就变得莫名其妙。
 * 本机（离 VPS 近）hydration 约在 DCL 后 ~100ms 完成，恰好盖住这个窗口，测试
 * 侥幸全过；CI runner 在海外、站点在国内 VPS，JS chunk 晚到数秒，首个交互必丢
 * （曾致 CD Smoke Test 3 条用例红：语言切换菜单、/venues 搜索 ×2）。
 * Providers 是 hydration 提交中最外层的客户端组件，effect 在已 hydration 的子
 * 组件之后执行，故属性置位即代表整棵树可交互。
 *
 * 局限：只在**整页加载**时置位；客户端路由跳转后的新树不会重新置位（同一页面内
 * 仍是 SPA，交互能力本就在，故无需重置）。
 */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        {children}
        {/* 新邮件全局提醒（2026-10-06）：全站轮询未读，新邮件到达时发一条 toast +
            广播事件（/mail 大标题的未读角标订阅它）。游客自动不轮询。
            ⚠ 这里**不要**再挂 toast 的 provider / viewport（2026-10-11 删掉的那对）：
            toast 的落点是 `app/[locale]/layout.tsx` 的 `<Toaster />`（provider + portal +
            viewport + list 一体）。两处都挂会在 DOM 里留下**两个**
            `role="region" aria-label="Notifications"` 的 polite live region——一个永远
            空着（读屏的地标列表里凭空多一个同名空区域），而「新邮件到达」的播报正是靠
            这个 region（toast 插进去即播报），多一个就是给将来埋一次双份播报。
            这里只需要能调到全局 `toast.add()`，不需要 provider。 */}
        <MailNewMailWatcher />
      </TooltipProvider>
    </ThemeProvider>
  );
}
