"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Link, usePathname } from "@/lib/i18n/navigation";

/**
 * 「学术数据」四页的共同导航（2026-10-28 设计统一）。
 *
 * 期刊会议速查 / CCF 推荐目录 / 中科院分区表 / 会议 Deadline 日历是**同一份数据的
 * 四个视图**（速查是另外三份数据的合并检索），此前四页各写一套页头、互不相连，
 * 看起来像四个互不相干的站点。这里把它们收成一条下划线 tab（形态与邮箱页的
 * 「全部 / 收件 / 发件」一致）：
 *
 * - 当前页 `aria-current="page"` + 前景色下划线，其余为次要色、hover 才出现边线；
 * - 右侧 `actions` 放本页专属动作（目前只有 /deadlines 的「立即同步」）——
 *   本页专属动作**不放这里**（`/deadlines` 的「立即同步」在页头右上，见
 *   `ScholarPage`）：动作是「页面」的，不是「导航」的；钉在 tab 行右侧会把
 *   窄屏的 tab 条挤到只剩两三个（390px 实测当前 tab 直接被挤出视口）。
 * - 窄屏横向滚动（四项中文总宽 ≈ 330px，360px 视口放得下；英文略宽，
 * ⚠ `usePathname` 来自 next-intl 的包装，返回值**不带 locale 前缀**（`/en/ccf`
 *   在英文页面里同样得到 `/ccf`），所以直接与 href 比较即可。
 */
const ITEMS = [
  { href: "/venues", key: "venues" },
  { href: "/ccf", key: "ccf" },
  { href: "/cas", key: "cas" },
  { href: "/deadlines", key: "deadlines" },
] as const;

export function ScholarNav() {
  const t = useTranslations("scholarNav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("label")}
      // `-ml-2.5` 抵消首个 tab 的左内边距：页面级导航必须与 h1 / 正文左缘对齐
      // （否则整条导航看起来比页面「缩进」了 10px；邮箱页的 tab 在面板内，
      //   有自身 padding 托底，不适用这条）。
      className="-ml-2.5 flex items-center gap-0.5 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-2.5 py-2 text-sm whitespace-nowrap transition-colors",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
