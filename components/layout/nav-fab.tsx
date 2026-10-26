"use client";

import { useEffect, useRef } from "react";
import { CompassIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/lib/i18n/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * 导航悬浮球：除导航页外全站显示。
 * 固定在视口右下角（垂直位置不随页面内容高度变化），
 * 当页脚（版权/备案栏）滚入视口时自动上移避让，永不遮挡页脚。
 */
export function NavFab() {
  const t = useTranslations("navPage");
  const pathname = usePathname();
  const fabRef = useRef<HTMLDivElement>(null);

  // 导航页自身不显示悬浮球
  const isNavPage = pathname === "/nav";

  useEffect(() => {
    if (isNavPage) return;

    // ⚠ 必须用 data-slot 精确取「站点页脚」：`document.querySelector("footer")` 拿的是
    //   文档里**第一个** <footer>——邮件正文、以后新增的组件都可能带一个，取错了页脚，
    //   避让距离就是按别人的位置算的（SiteFooter 组件注释里也是同一条约定）。
    const footer = document.querySelector('[data-slot="site-footer"]');
    if (!footer) return;

    const GAP = 12; // 悬浮球与页脚保持的间距

    let raf = 0;
    const update = () => {
      raf = 0;
      // 每次实时取节点：导航页会卸载该 div，切回时是全新节点，
      // 不能复用 effect 开头捕获的旧引用（否则 transform 一直写在已脱离文档的节点上）
      const el = fabRef.current;
      if (!el) return;
      // 停靠边距取计算值（`bottom-5` = 20px，`sm:bottom-6` = 24px），别写死一个常量
      const restBottom = parseFloat(getComputedStyle(el).bottom) || 0;
      const rect = footer.getBoundingClientRect();
      // ⚠ 页脚「没被渲染」（专注模式 / 打印把它 display:none 了）时 rect 全是 0。
      //   不挡这一条，就会把 0 当成「页脚跑到视口顶端」，算出最大上移量，悬浮球被顶到
      //   屏幕顶部；而它此刻自己也隐藏着（同一条专注模式规则），等**退出专注模式**才露馅，
      //   并且宽屏邮箱页整页锁高、不产生 window scroll → 再没有任何一次校正机会。
      //   页脚根本看不见时，没有「避让」可言：原地停靠即可。
      if (rect.height === 0) {
        el.style.transform = "";
        return;
      }
      // 悬浮球底部需停在页脚顶部上方 GAP 处；页脚未进入视口时 offset 为 0（贴视口底部）
      const offset = Math.max(
        0,
        Math.min(window.innerHeight - rect.top - restBottom + GAP, window.innerHeight - 96),
      );
      // 不写 `translateY(0px)`：留一个恒等的 transform 会无端建合成层
      el.style.transform = offset > 0 ? `translateY(${-offset}px)` : "";
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    // ⚠ 只监听 scroll/resize 不够：这个位置依赖的是**页脚的位置**，而页脚会因为
    //   「内容长出来 / 收起」「专注模式把整块外壳藏掉又放出来」而移动，这些都不派发
    //   scroll 事件（宽屏邮箱页甚至一次都不滚）→ 位置会一直停在旧值上。补两类观察：
    //   · ResizeObserver(body)：内容增高 / 缩短（列表加载、字体、图片）→ 页脚跟着走；
    //   · MutationObserver(<html>)：专注模式切换时 body 高度不变（页面容器同时从
    //     「视口 − 顶栏 − 页脚」改成 100dvh），只有这个属性是最可靠的信号。
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mail-focus"],
    });

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
    // pathname 进依赖：客户端路由切换后（新页面的页脚位置可能完全不同）立刻重算一次
  }, [isNavPage, pathname]);

  if (isNavPage) {
    return null;
  }

  return (
    <div
      ref={fabRef}
      // data-slot：邮件的「专注模式」按它隐藏浮动钮（`html[data-mail-focus]`，见 globals.css）
      data-slot="nav-fab"
      // data-print="hide"：浮动入口不参与打印（否则每张打印件右下角都盖一个圆钮）
      data-print="hide"
      className="fixed right-5 bottom-5 z-40 transition-transform duration-200 ease-out sm:right-6 sm:bottom-6"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href="/nav"
              aria-label={t("fabLabel")}
              className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/85 text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-white/20 transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-primary/30 active:scale-95"
            />
          }
        >
          <CompassIcon className="size-5" />
        </TooltipTrigger>
        <TooltipContent side="left">{t("fabLabel")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
