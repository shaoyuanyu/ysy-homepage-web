import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  Download,
  ExternalLink,
  FileQuestion,
  FileText,
  MessageSquareText,
  Quote,
} from "lucide-react";

import { CopyBibtexButton } from "@/components/library/copy-bibtex";
import { PaperActions } from "@/components/library/paper-actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "@/lib/i18n/navigation";
import {
  PaperdbError,
  getAnnotations,
  getCitations,
  getCollectionTree,
  getPaper,
  getPaperFiles,
  getReferences,
} from "@/lib/library/server";
import {
  authorLine,
  bytesLabel,
  shortDate,
  tagLabel,
  venueLine,
} from "@/lib/library/format";
import type { CollectionNode, PaperDetail } from "@/lib/library/types";

export const dynamic = "force-dynamic";

/** 标识符 → 外部链接（只映射格式确定的 scheme；S2 的哈希没有稳定 URL 规则） */
function identifierHref(scheme: string, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  switch (scheme.toLowerCase()) {
    case "doi":
      return `https://doi.org/${v}`;
    case "arxiv":
      return `https://arxiv.org/abs/${v}`;
    case "acl":
      return `https://aclanthology.org/${v}/`;
    case "openalex":
      return `https://openalex.org/${v}`;
    case "dblp":
      return v.startsWith("http") ? v : `https://dblp.org/rec/${v}.html`;
    default:
      return null;
  }
}

/** 批注颜色 → 左边框 + 淡底色（颜色名本身不展示：`yellow/green` 是数据枚举，不是给用户看的文案） */
const annotationTone: Record<string, string> = {
  yellow: "border-amber-400 bg-amber-50/70 dark:border-amber-400/70 dark:bg-amber-950/25",
  green: "border-emerald-400 bg-emerald-50/70 dark:border-emerald-400/70 dark:bg-emerald-950/25",
  blue: "border-sky-400 bg-sky-50/70 dark:border-sky-400/70 dark:bg-sky-950/25",
  pink: "border-pink-400 bg-pink-50/70 dark:border-pink-400/70 dark:bg-pink-950/25",
  purple: "border-violet-400 bg-violet-50/70 dark:border-violet-400/70 dark:bg-violet-950/25",
};

function flatten(nodes: CollectionNode[], map = new Map<string, string>()): Map<string, string> {
  for (const node of nodes) {
    map.set(node.id, node.name);
    flatten(node.children, map);
  }
  return map;
}

/** 标签页标题用论文题名而非站点首页标题；取不到时退回家常的「论文不存在」。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}): Promise<Metadata> {
  const { locale, ref } = await params;
  const t = await getTranslations({ locale, namespace: "library" });
  try {
    const paper = await getPaper(ref);
    return {
      title: paper.title,
      description: paper.abstract?.replace(/\s+/g, " ").trim().slice(0, 180) || undefined,
    };
  } catch (caught) {
    // 404 才是「论文不存在」；后端故障时退回中性标题，不要误报成文章被删了
    const notFound = caught instanceof PaperdbError && caught.status === 404;
    return { title: notFound ? t("paperNotFound") : t("paper") };
  }
}

export default async function PaperPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const t = await getTranslations("library");
  let paper: PaperDetail;
  try {
    paper = await getPaper(ref);
  } catch (caught) {
    // 404 不是「错误」，是内容不在了：用中性空状态而不是红色报错块；
    // 其余失败才显示后端原文（小号、等宽），标题与提示走本地化文案。
    const notFound = caught instanceof PaperdbError && caught.status === 404;
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
        <FileQuestion className="size-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">
          {notFound ? t("paperNotFound") : t("paperLoadFailed")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {notFound
            ? t("paperNotFoundHint")
            : caught instanceof PaperdbError
              ? t("backendErrorHint")
              : t("backendError")}
        </p>
        {!notFound && caught instanceof PaperdbError && caught.message && (
          <p className="mt-2 max-w-md break-words font-mono text-xs text-muted-foreground/60">
            {caught.message}
          </p>
        )}
        <Link
          href="/library"
          data-slot="button"
          className={buttonVariants({ variant: "outline", size: "sm", className: "mt-5" })}
        >
          <ArrowLeft data-icon="inline-start" /> {t("backToLibrary")}
        </Link>
      </div>
    );
  }

  const [files, annotations, collections, references, citations] = await Promise.all([
    getPaperFiles(paper.id).catch(() => []),
    getAnnotations(paper.id).catch(() => []),
    getCollectionTree().catch(() => [] as CollectionNode[]),
    getReferences(paper.id).catch(() => ({ items: [], hasMore: false })),
    getCitations(paper.id).catch(() => ({ items: [], hasMore: false })),
  ]);
  const collectionMap = flatten(collections);
  const collectionNames = collectionMap;
  // 文件/批注/参考文献/被引全空时，四张空卡片会占掉半屏——合并成一条紧凑清单
  const recordsEmpty =
    files.length === 0 &&
    annotations.length === 0 &&
    references.items.length === 0 &&
    citations.items.length === 0;
  const emptyRecords = [
    { Icon: FileText, label: t("files"), empty: t("noFiles") },
    { Icon: MessageSquareText, label: t("annotations"), empty: t("noAnnotations") },
    { Icon: BookMarked, label: t("references"), empty: t("noReferences") },
    { Icon: Quote, label: t("citations"), empty: t("noCitations") },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <Link href="/library" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" /> {t("backToLibrary")}
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{t(`kind_${paper.kind}`)}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{paper.year}</span>
          {paper.venue && (
            <>
              <span aria-hidden>·</span>
              <span className="min-w-0">{venueLine(paper.venue)}</span>
            </>
          )}
        </div>
        <h2 className="text-balance font-serif text-2xl font-semibold leading-snug sm:text-3xl">
          {paper.title}
        </h2>
        {paper.authors.length > 0 && (
          <p className="text-sm text-muted-foreground">{authorLine(paper.authors, 20)}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {paper.evaluation.ccf && (
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-xs",
                paper.evaluation.ccf.level === "A"
                  ? "border-brand/25 bg-brand/[0.045] text-brand"
                  : "border-border bg-muted/35 text-muted-foreground",
              )}
            >
              CCF {paper.evaluation.ccf.level} · {paper.evaluation.ccf.field}
            </span>
          )}
          {paper.evaluation.cas && (
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-xs",
                paper.evaluation.cas.level === "1"
                  ? "border-brand/25 bg-brand/[0.045] text-brand"
                  : "border-border bg-muted/35 text-muted-foreground",
              )}
            >
              CAS {paper.evaluation.cas.level}{paper.evaluation.cas.isTop ? " Top" : ""} · {paper.evaluation.cas.majorField}
            </span>
          )}
          <span className="flex items-center gap-1.5 sm:ml-auto">
            {files.length > 0 && (
              <Link
                href={`/library/papers/${paper.id}/read`}
                data-slot="button"
                className={buttonVariants({ size: "sm" })}
              >
                <BookOpen data-icon="inline-start" /> {t("read")}
              </Link>
            )}
            <CopyBibtexButton paperId={paper.id} />
            <a
              href={`/api/library/papers/${paper.id}/bibtex`}
              data-slot="button"
              className={buttonVariants({ variant: "outline", size: "xs" })}
            >
              <Download data-icon="inline-start" /> {t("downloadBibtex")}
            </a>
          </span>
        </div>
      </header>

      <PaperActions
        paper={paper}
        hasFile={files.length > 0}
        collections={[...collectionMap.entries()].map(([id, name]) => ({ id, name }))}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <section className="rounded-xl border bg-library-surface p-4">
            <h3 className="mb-2 text-sm font-semibold">{t("abstract")}</h3>
            {paper.abstract ? (
              <p
                data-longform
                className="max-w-[72ch] whitespace-pre-line font-serif text-base leading-relaxed text-foreground/90"
              >
                {paper.abstract}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t("noAbstract")}</p>
            )}
          </section>

          {recordsEmpty ? (
            <section className="rounded-xl border bg-library-surface p-4">
              <h3 className="mb-1 text-sm font-semibold">{t("records")}</h3>
              <ul className="divide-y text-sm">
                {emptyRecords.map(({ Icon, label, empty }) => (
                  <li key={label} className="flex items-center gap-2 py-2">
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span>{label}</span>
                    <span className="ml-auto text-right text-xs text-muted-foreground">{empty}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <>
            <section className="rounded-xl border bg-library-surface p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t("files")}</h3>
                <span className="text-xs text-muted-foreground">{files.length}</span>
              </div>
              {files.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("noFiles")}</p>
              ) : (
                <div className="space-y-2">
                  {files.map((file) => (
                    <div key={file.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-2 text-xs">
                      <FileText className="size-3.5 shrink-0" />
                      <span className="font-medium">{file.originalFilename ?? `${file.id}.pdf`}</span>
                      <span className="text-muted-foreground">
                        {bytesLabel(file.byteSize)}
                        {file.pageCount ? ` · ${t("pagesCount", { count: file.pageCount })}` : ""}
                        {` · ${t(`textStatus_${file.textStatus}`)}`}
                      </span>
                      {file.isPrimary && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                          {t("primary")}
                        </span>
                      )}
                      {paper.state.progressPage ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {t("readProgress", { page: paper.state.progressPage })}
                        </span>
                      ) : null}
                      <div className="ml-auto flex items-center gap-1.5">
                        <Link
                          href={`/library/papers/${paper.id}/read`}
                          data-slot="button"
                          className={buttonVariants({ variant: "outline", size: "xs" })}
                        >
                          {t("read")}
                        </Link>
                        <a
                          href={`/api/library/files/${file.id}/content`}
                          target="_blank"
                          rel="noreferrer"
                          data-slot="button"
                          className={buttonVariants({ variant: "ghost", size: "xs" })}
                        >
                          {t("openPdf")} <ExternalLink data-icon="inline-end" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border bg-library-surface p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t("annotations")}</h3>
                <span className="text-xs text-muted-foreground">{annotations.length}</span>
              </div>
              {annotations.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("noAnnotations")}</p>
              ) : (
                <div className="space-y-2">
                  {annotations.map((annotation) => (
                    <div
                      key={annotation.id}
                      className={cn(
                        "rounded-md border-l-2 px-2.5 py-2",
                        annotationTone[annotation.color] ??
                          "border-amber-400 bg-amber-50/70 dark:border-amber-400/70 dark:bg-amber-950/25",
                      )}
                    >
                      <p className="text-sm leading-relaxed">“{annotation.quote}”</p>
                      {annotation.comment && (
                        <p className="mt-1 text-xs text-muted-foreground">{annotation.comment}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">p.{annotation.page}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border bg-library-surface p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t("references")}</h3>
                <span className="text-xs text-muted-foreground">{references.items.length}</span>
              </div>
              {references.items.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("noReferences")}</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {references.items.map((item) => (
                    <li key={item.paper?.id ?? item.external?.id} className="flex gap-2">
                      <span className="text-muted-foreground">{item.paper?.year ?? item.external?.year ?? "—"}</span>
                      {item.paper ? (
                        <Link href={`/library/papers/${item.paper.id}`} className="hover:underline">{item.paper.title}</Link>
                      ) : item.external?.doi ? (
                        <a href={`https://doi.org/${item.external.doi}`} target="_blank" rel="noreferrer" className="hover:underline">
                          {item.external.title}
                        </a>
                      ) : (
                        <span>{item.external?.title}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border bg-library-surface p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t("citations")}</h3>
                <span className="text-xs text-muted-foreground">{citations.items.length}</span>
              </div>
              {citations.items.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("noCitations")}</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {citations.items.map((item) => (
                    <li key={item.paper?.id ?? item.external?.id} className="flex gap-2">
                      <span className="text-muted-foreground">{item.paper?.year ?? item.external?.year ?? "—"}</span>
                      {item.paper ? (
                        <Link href={`/library/papers/${item.paper.id}`} className="hover:underline">{item.paper.title}</Link>
                      ) : item.external?.doi ? (
                        <a href={`https://doi.org/${item.external.doi}`} target="_blank" rel="noreferrer" className="hover:underline">
                          {item.external.title}
                        </a>
                      ) : (
                        <span>{item.external?.title}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            </>
          )}

        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-xl border bg-library-surface p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold">{t("metadata")}</h3>
            {/* 左标签 + 左对齐值：长期刊名在 260px 宽的侧栏里右对齐会碎成参差的锯齿，
                左对齐 + 定宽标签列读起来才像一张信息表 */}
            <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
              {([
                [t("venue"), paper.venue ? venueLine(paper.venue) : null],
                [t("year"), String(paper.year)],
                [t("volume"), paper.volume],
                [t("pages"), paper.pages],
                [t("published"), paper.publicationDate],
                [t("citekey"), paper.citekey],
                [t("added"), shortDate(paper.createdAt)],
                [t("updated"), shortDate(paper.updatedAt)],
              ] as [string, string | null | undefined][])
                .filter(([, value]) => Boolean(value))
                .flatMap(([label, value]) => [
                  <dt key={`${label}-k`} className="text-muted-foreground">{label}</dt>,
                  <dd
                    key={`${label}-v`}
                    className="line-clamp-3 min-w-0 break-words"
                    title={value ?? undefined}
                  >
                    {value}
                  </dd>,
                ])}
            </dl>
          </section>

          <section className="rounded-xl border bg-library-surface p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold">{t("tags")}</h3>
            {paper.tags.length === 0 ? (
              <p className="text-muted-foreground">{t("noTags")}</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {paper.tags.map((path) => (
                  <Link key={path} href={`/library?tag=${encodeURIComponent(path)}`} className="rounded bg-muted px-1.5 py-0.5 hover:underline">
                    {tagLabel(path)}
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-library-surface p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold">{t("collections")}</h3>
            {paper.collections.length === 0 ? (
              <p className="text-muted-foreground">{t("uncollected")}</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {paper.collections.map((id) => (
                  <Link key={id} href={`/library?collection=${id}`} className="rounded bg-muted px-1.5 py-0.5 hover:underline">
                    {collectionNames.get(id) ?? id.slice(0, 8)}
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-library-surface p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold">{t("identifiers")}</h3>
            <div className="space-y-1">
              {paper.identifiers.map((identifier) => {
                const href = identifierHref(identifier.scheme, identifier.value);
                return (
                  <div key={identifier.id} className="flex gap-2">
                    <span className="w-12 shrink-0 uppercase text-muted-foreground">
                      {identifier.scheme}
                    </span>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all font-mono text-xs underline decoration-border underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
                      >
                        {identifier.value}
                      </a>
                    ) : (
                      <span className="break-all font-mono text-xs">{identifier.value}</span>
                    )}
                  </div>
                );
              })}
              {paper.identifiers.length === 0 && <p className="text-muted-foreground">—</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
