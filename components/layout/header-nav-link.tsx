"use client";

import { usePathname } from "@/lib/i18n/navigation";
import { Link } from "@/lib/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 当前路径是否命中某个导航项（首页精确匹配，其余允许子路径） */
function useActive(href: string) {
  const pathname = usePathname();
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * 顶部导航项：当前页高亮（aria-current + 浅底），桌面内联导航与移动 Sheet 共用。
 *
 * ⚠ 必须是客户端组件：`usePathname` 不能在 Server Component 里调用，而
 * `site-header.tsx` 本身是服务端组件（只导出静态结构 + 客户端交互组件）。
 */
export function HeaderNavLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  const active = useActive(href);
  return (
    <Link
      href={href}
      data-slot="button"
      aria-current={active ? "page" : undefined}
      className={buttonVariants({
        variant: "ghost",
        size: "sm",
        className: cn(className, active && "bg-muted font-medium text-foreground"),
      })}
    >
      {label}
    </Link>
  );
}
