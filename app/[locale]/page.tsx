import type { Metadata } from "next";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowUpRightIcon,
  BrainCircuitIcon,
  CompassIcon,
  GraduationCapIcon,
  MailIcon,
  MapPinIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Hero } from "@/components/sections/hero";
import { PublicationCard } from "@/components/sections/publication-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/lib/i18n/navigation";
import { formatDate } from "@/lib/utils/format";
import { listPosts, profile, publications } from "@/lib/data";
import { isPinnedSelection, selectFeatured } from "@/lib/publications/featured";
import { getPinnedKeys } from "@/lib/publications/pinned";

// 本页读运行时置顶列表（data/preferences.json），不可预渲染
// （若被预渲染，置顶会冻结在构建时刻）。与 /deadlines 同一处理。
export const dynamic = "force-dynamic";

const interestIcons = {
  "ai-safety": ShieldCheckIcon,
  interpretability: BrainCircuitIcon,
  "continual-learning": RefreshCwIcon,
} as const;

// 首页标签页仅显示姓名（absolute 绕过父布局 template 的「%s | Yu Shaoyuan」后缀）
export async function generateMetadata(): Promise<Metadata> {
  return { title: { absolute: "Yu Shaoyuan" } };
}

/** 区块标题：左标题 + 右「查看全部」，底部细线把内容与标题分开 */
function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 border-b pb-2.5">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {action && (
        <Link
          href={action.href}
          className="group inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {action.label}
          <ArrowUpRightIcon className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

export default function HomePage() {
  const locale = useLocale();
  const t = useTranslations("home");
  const lang = locale === "zh" ? "zh" : "en";

  // 全部文章（缺当前语言版本时回退原文），按日期倒序取前 3 篇
  const latestPosts = listPosts(locale).slice(0, 3);

  // 首页论文区块：置顶优先，无置顶则最新 N 篇；完全没有论文时不渲染（见下方 JSX）
  const pinnedKeys = getPinnedKeys();
  const featuredPublications = selectFeatured(publications, pinnedKeys);
  const usingPinned = isPinnedSelection(featuredPublications, pinnedKeys);

  // Person 结构化数据：帮助搜索引擎（Google 学术等）正确索引个人主页
  const siteUrl = process.env.SITE_URL ?? "https://shaoyuanyu.cn";
  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.name,
    url: siteUrl,
    image: `${siteUrl}${profile.avatar}`,
    email: `mailto:${profile.email}`,
    jobTitle: profile.title[lang],
    affiliation: {
      "@type": "Organization",
      name: profile.institution[lang],
    },
    alumniOf: profile.education.map((edu) => ({
      "@type": "CollegeOrUniversity",
      name: edu.institution[lang],
    })),
    sameAs: Object.values(profile.socials).filter(Boolean),
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />
      <Hero />

      {/* 正文两栏：左侧内容流，右侧「教育 / 联系」信息卡（窄屏时落在内容下方） */}
      <div className="grid gap-8 pb-14 lg:grid-cols-[minmax(0,1fr)_272px] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-10">
          {/* 研究方向（暂无内容时不渲染） */}
          {profile.researchInterests.length > 0 && (
            <section>
              <SectionHeading title={t("researchInterests")} />
              <div className="grid gap-4 sm:grid-cols-3">
                {profile.researchInterests.map((interest) => {
                  const Icon =
                    interestIcons[interest.key as keyof typeof interestIcons] ?? BrainCircuitIcon;
                  return (
                    <Card key={interest.key} className="border-dashed">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Icon className="size-5 text-muted-foreground" />
                          {interest[lang]}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          {t(`interestDescriptions.${interest.key}`)}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* 论文：置顶优先，无置顶则最新 N 篇（N = PINNED_LIMIT）；
              **完全没有论文时不渲染该区块**（无空状态） */}
          {featuredPublications.length > 0 && (
            <section data-slot="home-publications">
              <SectionHeading
                title={t(usingPinned ? "featuredPublications" : "latestPublications")}
                action={{ href: "/publications", label: t("viewAllPublications") }}
              />
              <div className="flex flex-col gap-3">
                {featuredPublications.map((pub) => (
                  <PublicationCard
                    key={pub.key}
                    pub={pub}
                    myNames={[profile.name]}
                    pinned={pinnedKeys.includes(pub.key)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 最新博客 */}
          <section>
            <SectionHeading
              title={t("blog")}
              action={{ href: "/blog", label: t("viewAllBlog") }}
            />
            <div className="flex flex-col gap-3">
              {latestPosts.map((post) => (
                <Link key={post.slug} href={`/blog/${post.slug}`} className="group block">
                  <Card className="transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-foreground/20 group-hover:shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-start justify-between gap-3 text-base">
                        <span className="line-clamp-2 underline-offset-4 group-hover:underline">
                          {post.title}
                        </span>
                        <ArrowUpRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground/50 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </CardTitle>
                      {post.summary && (
                        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                          {post.summary}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <time className="font-mono tabular-nums">{formatDate(post.date, locale)}</time>
                        <span aria-hidden>·</span>
                        {post.tags.map((tag) => (
                          <Badge key={tag} variant="outline">{tag}</Badge>
                        ))}
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          {/* 教育经历 */}
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <GraduationCapIcon className="size-4 text-muted-foreground" />
                {t("education")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {profile.education.map((edu) => (
                <div key={edu.period} className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium">{edu[lang]}</p>
                  <p className="text-sm text-muted-foreground">{edu.institution[lang]}</p>
                  <p className="font-mono text-xs text-muted-foreground">{edu.period}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 联系方式 */}
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">{t("contact")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <a
                href={`mailto:${profile.email}`}
                className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <MailIcon className="size-4 shrink-0" />
                <span className="truncate">{profile.email}</span>
              </a>
              <p className="flex items-center gap-2 text-muted-foreground">
                <MapPinIcon className="size-4 shrink-0" />
                {profile.location[lang]}
              </p>
            </CardContent>
          </Card>

          <Link
            href="/nav"
            data-slot="button"
            className={buttonVariants({ variant: "outline", size: "sm", className: "w-full" })}
          >
            <CompassIcon data-icon="inline-start" />
            {t("quickLinks")}
          </Link>
        </aside>
      </div>
    </div>
  );
}
