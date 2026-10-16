"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Maximize2Icon, Minimize2Icon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { usePathname } from "@/lib/i18n/navigation";
import { isMailPath, readStoredMailFocus, storeMailFocus } from "@/lib/mail/focus";
import { MailClient } from "@/components/mail/mail-client";
import { MailContactsPane } from "@/components/mail/mail-contacts-pane";
import { MailBarProvider, MailStatusbar } from "@/components/mail/mail-statusbar";
import { useSyncStatus } from "@/components/mail/sync-status";

/**
 * 信箱两栏外壳（MAIL-AGENT.md 4.12）。
 *
 * - **≥lg**：左右两栏收进**同一个带边框的面板**（中缝 `border-l` 分隔），像真正的
 *   邮件客户端；左「列表」固定 26rem + 右「详情」自适应。grid 默认 `align-items: stretch`，
 *   两栏同高——左列表再长，右栏的 sticky 容器也有行程可走，于是能「边翻列表边看信」。
 *   右栏自带 `overflow-y-auto`：长邮件在右栏内部滚动，不影响左侧列表位置。
 * - **<lg**：不套面板（单列卡片列表 + 整页详情 / 撰写），只显示当前路由该显示的那一栏，
 *   列表 ⇄ 子页面整页切换，与手机邮件客户端一致。
 *
 * ⚠ 面板模式下列表自己的卡片边框被摘掉（`lg:border-0`，见 MailClient），由外壳统一描边；
 *   两栏各自带内边距（lg:p-4 / lg:p-6），内容不碰面板边缘，故**无需 overflow-hidden**——
 *   那会把右栏的 sticky 圈进不滚动的裁剪盒里，「边翻列表边看信」立刻失效。
 * ⚠ 用 `hidden lg:flex` 而非条件渲染：SSR 与首帧结构固定，无 hydration 跳变；
 *   两栏都在 DOM 里，客户端导航时 layout 不会重新挂载，列表的
 *   滚动位置 / 已加载分页 / 筛选 / 搜索词全部保留（这正是列表挂在 layout 上的原因）。
 * ⚠ 宽屏下外壳由页面锁死高度（4.12），故两栏都改成「撑满 + 内部滚动」：
 *   左栏滚动区在 MailClient 内部（工具栏固定、列表滚动），右栏自带 `overflow-y-auto`。
 *   旧的 `sticky` 方案是给「页面会滚动」准备的，页面不再滚动后它已无意义。
 * ⚠ 行模板用 `minmax(0,1fr)` 而非默认 `auto`：auto 行会被内容顶高（长列表/长邮件
 *   又把外壳撑出可视区），`minmax(0,1fr)` 把行高钉死为容器高，超出的部分交给内部滚动。
 * ⚠ 贯通底栏（5.5）：面板边框移到了外层包裹 div（网格不再自己描边），底栏是网格
 *   下方的 `shrink-0` 行、`border-t` 贯通整个面板宽度——列表滚动区让出这一行，
 *   面板总高不变（E2E「面板高度」锁定）。窄屏详情视图下底栏整体隐藏（与右栏同规则）。
 * ⚠ `useSyncStatus()` 提到这里调用（唯一轮询点），status/rel 下传底栏——两处各调
 *   一次会变成双份定时器 + 双份请求。状态**只在底栏显示**（2026-10-04 用户指定：
 *   底栏已经是状态条，不再在面板顶部另开一条告警栏）。
 */
export function MailShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // 「右栏子页面」= 详情（/mail/message/:id）与撰写（/mail/compose）：桌面端显示在右栏，
  // 窄屏整页占满（列表隐藏）；其余路由（/mail）只显示列表栏。
  const isSubpage =
    pathname.startsWith("/mail/message/") || pathname.startsWith("/mail/compose");
  // 撰写路由：左栏换成联系人面板（4.14）
  const isCompose = pathname.startsWith("/mail/compose");
  // 邮件详情路由（窄屏整页详情、底栏没有位置）
  const isMessage = pathname.startsWith("/mail/message/");
  const { status, rel, backfill, firstSync } = useSyncStatus();
  const t = useTranslations("mail");

  /**
   * 「全屏查看」（2026-10-14 用户要求）：把左栏列表整块收起，详情占满整个面板。
   * 开关是**中缝把手**（见下方 `data-slot="mail-pane-fullscreen"`；第四轮从主题行右上角
   * 挪来，原因写在那个按钮的注释里）。
   *
   * - 只在**详情路由**生效：`/mail` 与撰写页没有「详情占满」这回事。
   * - 离开详情路由就复位（下面的 effect）：否则「点开一封 → 回复 → 回来」会莫名其妙
   *   又一次全屏，而用户根本没按过那枚开关。
   * - 不持久化（刷新回到普通形态）：与「快速回复」的折叠同一个口径——这是临时的
   *   阅读形态，不是设置。⚠ 专注模式**相反**：它是记住的（见下）。
   */
  const [fullscreen, setFullscreen] = useState(false);
  const full = isMessage && fullscreen;
  /**
   * 「专注模式」（2026-10-16 用户要求；第二轮改成**持久 + 全邮件页可用**）：
   * 把**站点外壳**让开，好让邮件内容区更高。
   *
   * 起因：「在 mac 上邮件内容区（尤其高度）太小」——900 高的视口里，顶栏 57 + 页脚 65 +
   * 页面上下留白 96 + 页头（标题 + 描述 + 四颗入口）~100 之后，右栏只剩 ~420px。
   * 打开它：顶栏 / 页脚 / 浮动导航钮 / 页头全部隐藏、留白从 48px 收到 8px，面板直接
   * 吃满视口（~740px）。
   *
   * 第二轮（用户：「在关闭查看邮件时，也应该有『专注模式』的按钮，且能保持该模式」）：
   * - **记住**：写 localStorage（`lib/mail/focus.ts` 的 `MAIL_FOCUS_KEY`），刷新回原样；
   *   根 layout 的首帧内联脚本在 paint 前就把属性挂好，所以刷新也不会闪一下外壳。
   * - **关掉右栏（按「关闭」回列表）之后照样在**：开关不再只在详情页长着，邮件页的每个
   *   视图（列表 / 详情 / 撰写，`lg` 起）都挂同一枚中缝把手——中缝是专注模式下**唯一
   *   还活着的外壳**，放这儿每个视图都够得着，也不会被自己藏掉。
   * - 与「全屏查看」（收左栏）仍是**两个独立开关**：两个都开时只剩邮件本体，Esc 一次全还原。
   */
  const [focus, setFocus] = useState(false);
  /**
   * localStorage 读回是否已完成。⚠ 读回**之前**一个字节都别动 `<html>`：首帧那一下是根
   * layout 内联脚本的活，这里若拿初始值 `false` 去 delete，正好把人家挂好的属性擦了
   * ——刷新时白闪一次外壳。
   */
  const [focusLoaded, setFocusLoaded] = useState(false);
  useEffect(() => {
    setFocus(readStoredMailFocus());
    setFocusLoaded(true);
  }, []);
  /**
   * 改专注模式（按钮与 Esc 都走这里）：state 与 localStorage 一起动，别绕过第二个
   * ——否则「Esc 退出 → 刷新又自己回来」。读回时用 `setFocus`（那是盘上的值，不是用户动作）。
   */
  const applyFocus = useCallback((next: boolean) => {
    setFocus(next);
    storeMailFocus(next);
  }, []);
  /** 邮件页判定（`isMailPath`）：属性挂的是全站的 `<html>`，跳到别的页面必须立刻撤掉 */
  const onMailPath = isMailPath(pathname);
  const focused = onMailPath && focus;
  useEffect(() => {
    if (!isMessage) {
      setFullscreen(false);
    }
  }, [isMessage]);
  /**
   * 专注模式靠**挂在 `<html>` 上的属性**生效（规则在 `app/globals.css`）：
   * 要隐藏的顶栏 / 页脚在根 layout、页头在 `(mailbox)/layout.tsx`——都是服务端组件，
   * 够不着这个客户端 state；`documentElement` 是它们共同的祖先，一条属性全局通吃。
   * ⚠ 只能在 effect 里挂（SSR 时没有 document）：**首帧**那一份由根 layout 的内联脚本
   *   负责，这里只做「之后的同步」（水合、切换、离开邮件页）。
   */
  useEffect(() => {
    if (!focusLoaded) return;
    const root = document.documentElement;
    if (focused) root.dataset.mailFocus = "";
    else delete root.dataset.mailFocus;
    return () => {
      delete root.dataset.mailFocus;
    };
  }, [focused, focusLoaded]);
  /**
   * Esc 还原（2026-10-14 写在详情页，2026-10-16 第二轮**上移到外壳**）。
   * 两个开关的 state 都在这里，监听器跟着来——顺带解决了「在列表页开着专注模式时
   * 按 Esc 没反应」（详情页的监听器只在详情路由挂着）。
   *
   * ⚠ 弹窗 / 菜单开着时 Esc 归它们（Base UI 自己处理），此时不抢——否则在删除确认框上
   *   按 Esc 会顺手把全屏也退掉。其余不拦：快速回复输入框里按 Esc 退出全屏不丢任何东西
   *   （文字在组件 state 里）。
   * ⚠ 两个开关都开着时**一次 Esc 全还原**（都是「退出临时阅读形态」的同一个动作）。
   * ⚠ Esc 退专注模式要**落盘**（`applyFocus`）：这是「关掉」而不是「先躲一下」。
   * ⚠ **不要判 `e.defaultPrevented`**（最初写了，实测在浏览器里按 Esc 完全没反应）：
   *   真按键走到 window 监听器时这个标记已经是 true，而全页**没有任何 JS** 调用过
   *   preventDefault（打桩 `Event.prototype.preventDefault` 记录不到调用）——是宿主
   *   浏览器自己把 Escape 当默认动作处理了。弹窗 / 菜单那两种真实冲突用下面的选择器挡住。
   */
  useEffect(() => {
    if (!full && !focused) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (
        document.querySelector(
          '[data-slot="dialog-content"][data-open], [data-slot="dropdown-menu-content"][data-open]',
        )
      ) {
        return;
      }
      setFullscreen(false);
      applyFocus(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [full, focused, applyFocus]);

  return (
    <MailBarProvider>
      <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
        <div className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:flex-1 lg:gap-0 lg:rounded-xl lg:border lg:border-border">
          {/* ⚠ 全屏查看只改**列模板**（单列）并把列表那栏 display:none：列表保持挂载，
              滚动位置 / 已加载分页 / 筛选状态都留着，退出全屏立刻回到原样 */}
          <div
            className={cn(
              "grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-rows-[minmax(0,1fr)] lg:gap-0",
              full ? "lg:grid-cols-[minmax(0,1fr)]" : "lg:grid-cols-[26rem_minmax(0,1fr)]",
            )}
          >
      <div
        data-slot="mail-pane-list"
        className={cn(
          "min-w-0 lg:min-h-0 lg:flex-col lg:p-4",
          full ? "hidden" : cn("lg:flex", isSubpage && "hidden lg:flex"),
        )}
      >
        {/* 邮件列表：撰写路由下让位给联系人面板（4.14），但**保持挂载**（display:none）——
            滚动位置 / 筛选 / 搜索词都留着，写完回来不用重来。
            ⚠ compose 时整个包装 div 用 `hidden`：它没有 lg:flex，任何宽度都不显示。 */}
        <div className={cn(isCompose ? "hidden" : "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col")}>
          <MailClient backfill={backfill} firstSync={firstSync} />
        </div>
        {isCompose && <MailContactsPane />}
      </div>
      <div
        data-slot="mail-pane-detail"
        className={cn(
          "relative min-w-0 lg:flex lg:min-h-0 lg:flex-col lg:border-l lg:border-border",
          !isSubpage && "hidden lg:flex",
          // 全屏时左栏已收起：中缝线没有分隔对象，留着会变成面板内缘的一条杂线
          full && "lg:border-l-0",
        )}
      >
        {/* 「专注模式」（2026-10-16 用户要求）：与下面的「全屏查看」**同一列、同一形态**
            （中缝把手，竖直居中处往上 52px——`-mt-12` + 自己的 `-translate-y-1/2` 平移，
            正好与它下面那枚留 4px 间隙），鼠标沿中缝扫过两个开关都在手里。
            ⚠ **不动下面那枚的位置**：中缝把手「竖直居中」是 2026-10-14 用户定的，
               E2E 也按「中心与 pane-detail 中心对齐（±2px）」钉着（所以这里是上枚偏移、
               而不是把两枚当成一组居中）。
            ⚠ **为什么放中缝而不是操作栏 / 页头**：① 操作栏宽度账已满（中文 613 / 英文 622
               ≤ 可用 637，再挤一枚就一定折行）；② 页头正是本模式要隐藏的东西，
               把开关放进去就等于它一点下去自己也消失（没有退出路径）；
               ③ 中缝还是专注模式下**唯一没被藏起来的外壳**。
            ⚠ **渲染条件比下面那枚宽**（2026-10-16 第二轮）：不再限详情路由，邮件页的
               列表 / 详情 / 撰写三个视图都挂它——用户按「关闭」回列表后，开关得还在
               （还要能把「上一次点开的形态」保持住）。窄屏（<lg）仍不渲染：
               那里专注模式的 CSS 规则本来就不生效（`@media (min-width:64rem)`）。 */}
        <button
          type="button"
          data-slot="mail-focus-mode"
          data-print="hide"
          aria-label={focused ? t("exitFocusMode") : t("focusMode")}
          title={focused ? t("exitFocusMode") : t("focusMode")}
          onClick={() => applyFocus(!focus)}
          className="absolute top-1/2 left-0 z-10 -mt-12 hidden h-11 w-5 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-border bg-background text-muted-foreground transition-colors before:absolute before:inset-y-0 before:-inset-x-1 before:content-[''] hover:bg-accent hover:text-foreground lg:flex"
        >
          {focused ? (
            <Minimize2Icon className="size-3.5" aria-hidden />
          ) : (
            <Maximize2Icon className="size-3.5" aria-hidden />
          )}
        </button>
        {/* 「全屏查看」把手（2026-10-14 第四轮：从主题行右上角挪到中缝上；
            第五轮按用户要求**竖直居中**——「分隔条把手」的形态，鼠标扫过中缝就能碰到）。
            ⚠ **为什么是中缝**：它管的就是「左栏要不要收起来」，贴在两栏分界线上名实相符；
              主题行右上角那个版本被用户点名「飘在标题上、不顺手」。
            ⚠ 贴着中线、不骑上去：`left-0` 让把手落在中缝右缘（全屏态落在面板左内缘），
              `border-l-0` 借用中缝 / 面板自己的边框当左边界——两种状态下都不会缺一条边。
            ⚠ 宽 20px 是量出来的：右栏内容从 `lg:px-6`（24px）起，留 4px 不碰正文；
              20px < 24px 的无障碍点击下限，用 `before:-inset-x-1` 把命中区左右各扩 4px
              （28px 宽）——扩进左栏的 4px 是它的 padding 区（内容距右缘 16px），安全。
            ⚠ 只在详情路由渲染（非详情没有「列表可收」）、`lg` 起才显示（窄屏详情本来
              就是整页，工具栏里有「返回列表」，不放第二份）；也不持久化。 */}
        {isMessage && (
          <button
            type="button"
            data-slot="mail-pane-fullscreen"
            data-print="hide"
            aria-label={full ? t("exitFullscreen") : t("fullscreen")}
            title={full ? t("exitFullscreen") : t("fullscreen")}
            onClick={() => setFullscreen((v) => !v)}
            className="absolute top-1/2 left-0 z-10 hidden h-11 w-5 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-border bg-background text-muted-foreground transition-colors before:absolute before:inset-y-0 before:-inset-x-1 before:content-[''] hover:bg-accent hover:text-foreground lg:flex"
          >
            {full ? (
              <PanelLeftOpenIcon className="size-3.5" aria-hidden />
            ) : (
              <PanelLeftCloseIcon className="size-3.5" aria-hidden />
            )}
          </button>
        )}
        {/* ⚠ 垂直内边距与左栏一致（py-4）：两栏首行（筛选组 / 操作栏）同一水平线 */}
        <div className="min-w-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:px-6 lg:py-4">
          {children}
        </div>
      </div>
          </div>
          {/* 底栏显示规则（2026-10-05 定稿）：邮件详情（窄屏整页）隐藏；/mail 与撰写页都显示
              ——撰写页的底栏承载草稿状态（已自动保存 / 保存失败），见 MailStatusbar 与 ComposeForm */}
          <MailStatusbar
            status={status}
            rel={rel}
            backfill={backfill}
            firstSync={firstSync}
            className={isMessage ? "hidden lg:block" : undefined}
          />
        </div>
      </div>
    </MailBarProvider>
  );
}
