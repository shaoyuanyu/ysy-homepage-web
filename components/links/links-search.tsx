"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CompassIcon } from "lucide-react";

import { SearchInput } from "@/components/ui/search-input";
import { Card } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Link } from "@/lib/i18n/navigation";
import type { NavLinkGroup } from "@/lib/data";

type NavLink = NavLinkGroup["links"][number];

/** 站内页面链接（url 以 / 开头）：用本站罗盘图标，不做 favicon 探测 */
function isInternal(url: string) {
  return url.startsWith("/");
}

/**
 * 外部链接图标：已由 scripts/fetch-favicons.mjs 抓取并存放在本站
 * /favicons/{hostname}.{svg|png}（图标随仓库提交，构建环境不需要联网），
 * 运行时不再依赖 Google/iconify 境外服务。
 *
 * 加载失败时退化为「首字母标记」——比清一色的地球图标更有辨识度，
 * 也不会让整页看起来像图片全部加载失败。
 *
 * 注意：SSR 输出的 <img> 若在 React hydration 绑定 onError 之前就 404，
 * error 事件会被错过，因此 mount 后还需主动检查一次破图状态。
 */
function LinkIcon({ link, label }: { link: NavLink; label: string }) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth === 0) {
      setFailed(true);
    }
  }, []);

  if (isInternal(link.url)) {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground">
        <CompassIcon className="size-4" />
      </span>
    );
  }

  // 站点图标位置固定为 28px 方块：有缓存图标显示图标，缺图标时退化为
  // 「首字母标记」而不是清一色的地球——17 个地球图标会让整页失去辨识度。
  return (
    // 深色下用白色小方块垫底：缓存图标既有纯黑单色的 simple-icons，也有带白底的
    // PNG（如 Paper Digest）。统一垫白底是唯一能让两类图标都保持原色的方案；
    // 若在深色里直接 invert，带白底的图标会变成实心色块；不加处理则黑图标看不见。
    <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 dark:border-white/10 dark:bg-white/90">
      {failed ? (
        <span aria-hidden className="text-xs font-semibold uppercase text-muted-foreground">
          {label.trim().charAt(0)}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={
            link.icon
              ? `/favicons/${new URL(link.url).hostname}.svg`
              : `/favicons/${new URL(link.url).hostname}.png`
          }
          alt=""
          width={16}
          height={16}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-4 object-contain"
        />
      )}
    </span>
  );
}

export function LinksSearch({ groups }: { groups: NavLinkGroup[] }) {
  const t = useTranslations("navPage");
  const locale = useLocale();
  const lang = locale === "zh" ? "zh" : "en";
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        links: g.links.filter(
          (l) =>
            l.name.zh.toLowerCase().includes(q) ||
            l.name.en.toLowerCase().includes(q) ||
            (l.desc?.[lang] ?? "").toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.links.length > 0);
  }, [groups, query, lang]);

  return (
    <div className="flex flex-col gap-7">
      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="max-w-md"
        clearLabel={t("clearSearch")}
        aria-label={t("searchPlaceholder")}
      />

{filtered.length === 0 && (
              <Empty>
                <EmptyMedia variant="icon">
                  <CompassIcon aria-hidden />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>{t("noResults")}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}

      {filtered.map((group) => (
        <section key={group.group[lang]} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{group.group[lang]}</h2>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {group.links.map((link) => {
              /*
               * 整卡即链接（用户预期）：卡片有 hover:border-primary/40 的悬停反馈，
               * 若只有标题文字可点，用户悬停后点卡片空白处会「没反应」。
               * 站点内外链分别用 <a> / i18n <Link> 包裹整卡；卡内不含其它交互元素，
               * 故不会出现嵌套链接/按钮。整卡可点同时带来「右键新标签打开」与更大的
               * 触摸目标。
               */
              const card = (
                <Card
                  size="sm"
                  className="h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-foreground/20 group-hover:shadow-sm"
                >
                  <div className="flex items-start gap-3 px-3">
                    <LinkIcon link={link} label={link.name[lang]} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium underline-offset-4 group-hover:underline">
                        {link.name[lang]}
                      </p>
                      {link.desc && (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {link.desc[lang]}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              );
              return isInternal(link.url) ? (
                <Link key={link.url} href={link.url} className="group block">
                  {card}
                </Link>
              ) : (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  {card}
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
