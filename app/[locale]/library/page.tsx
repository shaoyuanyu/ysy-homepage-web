import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight, CloudOff, Download, FileQuestion, Upload } from "lucide-react";

import { LibraryFilters } from "@/components/library/library-filters";
import { PaperTable } from "@/components/library/paper-table";
import { ProjectAddPapersButton } from "@/components/library/project-add-papers";
import { RetryButton } from "@/components/library/retry-button";
import { buttonVariants } from "@/components/ui/button";
import { READING_STATUSES } from "@/lib/library/constants";
import { Link } from "@/lib/i18n/navigation";
import {
  PaperdbError,
  getCollectionTree,
  getProject,
  getProjectPapers,
  getView,
  listPapers,
} from "@/lib/library/server";
import type { CollectionNode, PaperPage, Project } from "@/lib/library/types";
import { flattenCollections } from "@/lib/library/projects";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** 标签页标题：此前文献库所有页面都沿用首页标题（「首页 | Yu Shaoyuan」），
 *  浏览器标签无法区分当前所在页面。子页面各自声明标题，由 locale 布局的
 *  `%s | Yu Shaoyuan` 模板拼接。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "library" });
  return { title: t("title") };
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** 在集合树里找名字：打开某个集合时标题应显示集合名，而不是泛泛的「集合」 */
function findCollection(nodes: CollectionNode[], id: string): CollectionNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findCollection(node.children, id);
    if (found) return found;
  }
  return undefined;
}

export default async function LibraryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = one(params.q);
  const view = one(params.view);
  const project = one(params.project);
  const collection = one(params.collection);
  const tag = one(params.tag);
  // 只接受服务端支持的阅读状态：旧书签 / 手改 URL 里的 reviewed/archived
  // 会让 paperdb 直接 422，整页变成「后端连接失败」——静默忽略更合理。
  // 合法值见 lib/library/constants.ts（含 skimmed）。
  const rawStatus = one(params.status);
  const status =
    rawStatus && (READING_STATUSES as readonly string[]).includes(rawStatus)
      ? rawStatus
      : undefined;
  const starred = one(params.starred) === "1";
  const unfiled = one(params.unfiled) === "1";
  const kind = one(params.kind);
  const year = one(params.year);
  const rawSort = one(params.sort);
  const sort =
    rawSort && ["added", "year", "title", "updated"].includes(rawSort)
      ? rawSort
      : "added";
  const cursor = one(params.cursor);
  const t = await getTranslations("library");

  let page: PaperPage = { items: [], nextCursor: null, hasMore: false };
  let error: string | null = null;
  let notFound: "project" | "view" | null = null;
  let heading: string = t("allPapers");
  let activeCollection: CollectionNode | undefined;
  let projectInfo: Project | null = null;
  let projectCollectionNames: string[] = [];

  try {
    if (project) {
      const data = await getProject(project);
      projectInfo = data;
      heading = data.name;
      if (data.collectionIds.length > 0) {
        const tree = await getCollectionTree().catch(() => [] as CollectionNode[]);
        const names = new Map(flattenCollections(tree).map((item) => [item.id, item.name]));
        projectCollectionNames = data.collectionIds.map(
          (id) => names.get(id) ?? id.slice(0, 8),
        );
      }
      page = await getProjectPapers(project, {
        q,
        collection,
        tag,
        status,
        kind,
        starred: starred || undefined,
        unfiled: unfiled || undefined,
        year: year ? Number(year) : undefined,
        sort,
        cursor,
      });
    } else if (view) {
      const data = await getView(view);
      heading = data.name;
      page = await listPapers({
        view,
        q,
        status,
        kind,
        starred: starred || undefined,
        unfiled: unfiled || undefined,
        year: year ? Number(year) : undefined,
        sort,
        cursor,
      });
    } else {
      page = await listPapers({
        q,
        collection,
        tag,
        status,
        kind,
        starred: starred || undefined,
        unfiled: unfiled || undefined,
        year: year ? Number(year) : undefined,
        sort,
        cursor,
      });
      if (unfiled) heading = t("unfiled");
      else if (starred) heading = t("starred");
      else if (tag) heading = `#${tag}`;
      else if (q) heading = `${t("searchResults")}: ${q}`;
      else if (collection) {
        const tree = await getCollectionTree().catch(() => [] as CollectionNode[]);
        activeCollection = findCollection(tree, collection);
        heading = activeCollection?.name ?? t("collection");
      }
      if (status) heading = `${heading} · ${t(`status_${status}`)}`;
    }
  } catch (caught) {
    if (caught instanceof PaperdbError && caught.status === 404) {
      notFound = project ? "project" : view ? "view" : null;
    }
    if (!notFound) {
      error = caught instanceof PaperdbError ? caught.message : t("backendError");
    }
  }

  // 有关键字/筛选条件时，空结果不能提示「还没有文献」（会误导成库是空的）
  const hasFilters = Boolean(q || collection || tag || status || kind || year || starred || unfiled || view);

  // cursor 分页只能向前；trail 记录走过的 cursor，才能让「上一页」真的回上一页。
  // 只有当前页不是第一页时才有上一页，此时 trail 至少有一个元素。
  const trail = (one(params.trail) ?? "").split(",").filter(Boolean);
  const prevCursor = trail.length > 0 ? trail[trail.length - 1] : null;
  const prevTrail = trail.slice(0, -1);

  const baseParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const item = one(value);
    if (item && key !== "cursor" && key !== "trail") baseParams.set(key, item);
  }

  const nextParams = new URLSearchParams(baseParams);
  if (page.nextCursor) {
    nextParams.set("cursor", page.nextCursor);
    const nextTrail = cursor ? [...trail, cursor] : trail;
    if (nextTrail.length > 0) nextParams.set("trail", nextTrail.join(","));
  }

  const prevParams = new URLSearchParams(baseParams);
  if (prevCursor) {
    prevParams.set("cursor", prevCursor);
    if (prevTrail.length > 0) prevParams.set("trail", prevTrail.join(","));
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
        <FileQuestion className="size-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">
          {t(notFound === "project" ? "projectNotFound" : "viewNotFound")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(notFound === "project" ? "projectNotFoundHint" : "viewNotFoundHint")}
        </p>
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

  // 后端不可用时不要渲染工具栏/「共 0 篇」/空列表：那会让「连不上」看起来像
  // 「文献库是空的」。只给一张带重试的错误态。
  if (error) {
    // 只保留有信息量的 API 错误；连接层的 fetch failed / ECONNREFUSED 对用户没有意义
    const detail = /fetch failed|failed to fetch|ECONNREFUSED|ENOTFOUND|aborted|timed out/i.test(error)
      ? null
      : error;
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
        <CloudOff className="size-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">{t("backendError")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("backendErrorHint")}</p>
        {detail && (
          <p className="mt-2 max-w-md break-words font-mono text-xs text-muted-foreground/60">
            {detail}
          </p>
        )}
        <RetryButton className="mt-5" />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {/* 列表页只有「标题 → 一张卡」两层：标题行不再套卡片，筛选与表格共用同一张
          卡片（中间一条分隔线），避免标题、筛选、表头三层圆角框互相打架。 */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-full bg-brand" />
            <h2 className="truncate text-2xl font-semibold tracking-tight">{heading}</h2>
            {/* 未筛选时库的总量已在页头统计里，标题旁再写一次「14 篇」是重复；
                只有筛过/还有下一页时才在标题旁补本页数量。 */}
            {(hasFilters || page.hasMore || cursor) && (
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {t("pageHint", { count: page.items.length })}
              </span>
            )}
            {activeCollection && (
              <>
                <a
                  href={`/api/library/collections/${activeCollection.id}/bibtex`}
                  className="shrink-0 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  {t("downloadBibtex")}
                </a>
                <Link
                  href="/library/collections"
                  className="shrink-0 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  {t("manageCollections")}
                </Link>
              </>
            )}
          </div>
          {activeCollection?.description && (
            <p className="min-w-0 truncate pl-[calc(0.1875rem+0.625rem)] text-xs text-muted-foreground sm:max-w-[52ch]">
              {activeCollection.description}
            </p>
          )}
          {projectInfo && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pl-[calc(0.1875rem+0.625rem)] text-xs text-muted-foreground">
              {projectInfo.description && (
                <span className="min-w-0 max-w-[52ch] truncate" title={projectInfo.description}>
                  {projectInfo.description}
                </span>
              )}
              <span className="min-w-0">
                {t("projectCollectionsLabel")}：
                {projectCollectionNames.length > 0
                  ? projectCollectionNames.join("、")
                  : t("projectNoCollections")}
              </span>
              <Link
                href="/library/projects"
                className="shrink-0 underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                {t("manageProjects")}
              </Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {projectInfo && (
            <a
              href={`/api/library/projects/${projectInfo.id}/bibtex`}
              data-slot="button"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download data-icon="inline-start" /> BibTeX
            </a>
          )}
          {projectInfo && <ProjectAddPapersButton projectId={projectInfo.id} />}
          <Link
            href="/library/import"
            data-slot="button"
            className={buttonVariants({ variant: "brand", size: "sm" })}
          >
            <Upload data-icon="inline-start" /> {t("import")}
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-library-surface">
        <div className="border-b px-3 py-2.5 sm:px-4">
          <LibraryFilters />
        </div>
        <PaperTable items={page.items} filtered={hasFilters} />
      </div>

      {(cursor || page.nextCursor) && (
        <div className="mt-4 flex items-center justify-between gap-3">
          {cursor ? (
            <Link
              href={`/library${prevParams.size ? `?${prevParams.toString()}` : ""}`}
              data-slot="button"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ArrowLeft data-icon="inline-start" /> {t("previousPage")}
            </Link>
          ) : <span />}
          {page.nextCursor && (
            <Link
              href={`/library?${nextParams.toString()}`}
              data-slot="button"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t("nextPage")} <ArrowRight data-icon="inline-end" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
