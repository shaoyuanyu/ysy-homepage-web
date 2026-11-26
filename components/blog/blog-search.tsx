"use client";

import { useMemo, useState } from "react";
import Fuse from "fuse.js";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRightIcon, SearchIcon } from "lucide-react";

import { SearchInput } from "@/components/ui/search-input";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Link } from "@/lib/i18n/navigation";
import { formatDate } from "@/lib/utils/format";

export type PostMeta = {
  title: string;
  date: string;
  tags: string[];
  summary?: string;
  slug: string;
};

export function BlogSearch({ posts }: { posts: PostMeta[] }) {
  const t = useTranslations("blog");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("all");

  const allTags = useMemo(
    () => [...new Set(posts.flatMap((p) => p.tags))].sort(),
    [posts],
  );

  const fuse = useMemo(
    () =>
      new Fuse(posts, {
        keys: [
          { name: "title", weight: 0.5 },
          { name: "summary", weight: 0.3 },
          { name: "tags", weight: 0.2 },
        ],
        threshold: 0.35,
      }),
    [posts],
  );

  const results = useMemo(() => {
    const tagFiltered = tag === "all" ? posts : posts.filter((p) => p.tags.includes(tag));
    if (!query.trim()) return tagFiltered;
    return fuse.search(query).map((r) => r.item).filter((p) => tagFiltered.includes(p));
  }, [posts, fuse, query, tag]);

  return (
    <div className="flex flex-col gap-6">
      {/* 搜索 + 标签 */}
      <div className="flex flex-col gap-4">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          clearLabel={t("clearSearch")}
          aria-label={t("searchPlaceholder")}
        />
        {allTags.length > 1 && (
          <ToggleGroup
            value={[tag]}
            onValueChange={(v) => v[0] && setTag(v[0])}
            aria-label={t("tags")}
          >
            <ToggleGroupItem value="all">{t("allTags")}</ToggleGroupItem>
            {allTags.map((t) => (
              <ToggleGroupItem key={t} value={t}>{t}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      {/* 结果 */}
      {results.length === 0 && (
        <Empty className="mx-auto my-auto min-h-56 w-full max-w-sm flex-none rounded-2xl border border-dashed border-border/80 px-6 py-10">
          <EmptyMedia variant="icon">
            <SearchIcon aria-hidden />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t("noResults")}</EmptyTitle>
            <EmptyDescription>{t("noResultsHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <div className="flex flex-col gap-3">
        {results.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="group block">
            <Card className="transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-foreground/20 group-hover:shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-3 text-lg">
                  <span className="line-clamp-2 underline-offset-4 group-hover:underline">
                    {post.title}
                  </span>
                  <ArrowUpRightIcon className="mt-1.5 size-4 shrink-0 text-muted-foreground/50 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
                </CardTitle>
                {post.summary && (
                  <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {post.summary}
                  </p>
                )}
                <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <time className="font-mono tabular-nums">{formatDate(post.date, locale)}</time>
                  {post.tags.map((tag) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
