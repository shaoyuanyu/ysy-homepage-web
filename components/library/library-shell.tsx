"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ChevronDown,
  FlaskConical,
  FolderOpen,
  Import,
  Library,
  Menu,
  Plus,
  Settings2,
  Star,
} from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";
import type {
  CollectionNode,
  Meta,
  Project,
  ResearchWorkspace,
  SavedView,
  TagNode,
} from "@/lib/library/types";
import { cn } from "@/lib/utils";

interface LibraryShellProps {
  collections: CollectionNode[];
  views: SavedView[];
  projects: Project[];
  workspaces: ResearchWorkspace[];
  tags: TagNode[];
  meta: Meta | null;
  backendError: string | null;
  children: ReactNode;
}

/** 侧栏条目统一样式：桌面 32px 行高，可点区域铺满整行 */
const navItem =
  "group relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-foreground/70 transition-colors hover:bg-accent hover:text-foreground";
const navItemActive =
  "bg-brand/[0.06] font-medium text-foreground before:absolute before:left-0.5 before:top-1/2 before:h-3.5 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-brand [&_svg]:text-brand";

function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2 px-2.5 pt-1">
      <span className="text-xs font-medium tracking-wide text-muted-foreground">{children}</span>
      {action}
    </div>
  );
}

/** 父标签的 paperCount 只统计直接挂载的论文（线上 `status`/`topic` 直接为 0，子标签却有 12/24），
 *  侧栏按「子树合计」显示，否则父行看起来像空文件夹。 */
function tagPaperTotal(node: TagNode): number {
  return node.paperCount + node.children.reduce((sum, child) => sum + tagPaperTotal(child), 0);
}

function Count({ children }: { children: number }) {
  // 0 不显示：侧栏里的「0」既没有信息量，又会和真正有内容的计数混在一起
  if (!children) return null;
  return <span className="ml-auto text-xs tabular-nums text-muted-foreground">{children}</span>;
}

function CollectionItems({
  nodes,
  activeId,
  depth = 0,
}: {
  nodes: CollectionNode[];
  activeId: string | null;
  depth?: number;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id}>
          <Link
            href={`/library?collection=${node.id}`}
            aria-current={activeId === node.id ? "page" : undefined}
            title={node.name}
            className={cn(navItem, depth > 0 && "ml-3", activeId === node.id && navItemActive)}
          >
            <span className="truncate">{node.name}</span>
            <Count>{node.totalCount}</Count>
          </Link>
          {node.children.length > 0 && (
            <CollectionItems nodes={node.children} activeId={activeId} depth={depth + 1} />
          )}
        </div>
      ))}
    </>
  );
}

function TagItems({ nodes, activePath }: { nodes: TagNode[]; activePath: string | null }) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id}>
          <Link
            href={`/library?tag=${encodeURIComponent(node.path)}`}
            aria-current={activePath === node.path ? "page" : undefined}
            title={node.path}
            className={cn(navItem, activePath === node.path && navItemActive)}
          >
            <span className="truncate">{node.name}</span>
            <Count>{tagPaperTotal(node)}</Count>
          </Link>
          {node.children.length > 0 && (
            <div className="ml-3 border-l pl-1">
              <TagItems nodes={node.children} activePath={activePath} />
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function Sidebar({
  collections,
  views,
  projects,
  workspaces,
  tags,
}: Omit<LibraryShellProps, "meta" | "backendError" | "children">) {
  const t = useTranslations("library");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeView = searchParams.get("view");
  const activeProject = searchParams.get("project");
  const activeTag = searchParams.get("tag");
  const activeCollection = searchParams.get("collection");
  const unfiled = searchParams.get("unfiled") === "1";
  const starred = searchParams.get("starred") === "1";
  const onAll = pathname === "/library" && !searchParams.toString();

  return (
    <nav className="flex flex-col gap-5 px-1 py-1 text-sm">
      <div className="space-y-0.5">
        <Link href="/library" className={cn(navItem, onAll && navItemActive)}>
          <Library className="size-4 shrink-0 opacity-70" /> {t("allPapers")}
        </Link>
        <Link
          href="/library?unfiled=1"
          aria-current={unfiled ? "page" : undefined}
          className={cn(navItem, unfiled && navItemActive)}
        >
          <FolderOpen className="size-4 shrink-0 opacity-70" /> {t("unfiled")}
        </Link>
        <Link
          href="/library?starred=1"
          aria-current={starred ? "page" : undefined}
          className={cn(navItem, starred && navItemActive)}
        >
          <Star className="size-4 shrink-0 opacity-70" /> {t("starred")}
        </Link>
        <Link
          href="/library/import"
          className={cn(navItem, pathname === "/library/import" && navItemActive)}
        >
          <Import className="size-4 shrink-0 opacity-70" /> {t("import")}
        </Link>
      </div>

      <section>
        <SectionLabel
          action={
            <Link
              href="/library/collections"
              aria-label={t("manageCollections")}
              title={t("manageCollections")}
              className="rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </Link>
          }
        >
          {t("collections")}
        </SectionLabel>
        {collections.length === 0 ? (
          <p className="px-2.5 text-xs text-muted-foreground/70">{t("noCollections")}</p>
        ) : (
          <CollectionItems nodes={collections} activeId={activeCollection} />
        )}
      </section>

      <section>
        <SectionLabel
          action={
            <Link
              href="/library/views"
              aria-label={t("manageViews")}
              title={t("manageViews")}
              className="rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </Link>
          }
        >
          {t("views")}
        </SectionLabel>
        {views.length === 0 ? (
          <p className="px-2.5 text-xs text-muted-foreground/70">{t("noViews")}</p>
        ) : (
          views.map((view) => (
            <Link
              key={view.id}
              href={`/library?view=${view.id}`}
              className={cn(navItem, activeView === view.id && navItemActive)}
            >
              <span className="truncate">{view.name}</span>
              <Count>{view.count}</Count>
            </Link>
          ))
        )}
      </section>

      <section>
        <SectionLabel
          action={
            <Link
              href="/library/projects"
              aria-label={t("manageProjects")}
              title={t("manageProjects")}
              className="rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </Link>
          }
        >
          {t("projects")}
        </SectionLabel>
        {projects.length === 0 ? (
          <p className="px-2.5 text-xs text-muted-foreground/70">{t("noProjects")}</p>
        ) : (
          projects.map((project) => (
            <Link
              key={project.id}
              href={`/library?project=${project.id}`}
              className={cn(navItem, activeProject === project.id && navItemActive)}
            >
              <span className="truncate">{project.name}</span>
              <Count>{project.paperCount}</Count>
            </Link>
          ))
        )}
      </section>

      <section>
        <SectionLabel
          action={
            <Link
              href="/library/workspaces"
              aria-label={t("manageWorkspaces")}
              title={t("manageWorkspaces")}
              className="rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </Link>
          }
        >
          {t("researchWorkspaces")}
        </SectionLabel>
        {workspaces.length === 0 ? (
          <p className="px-2.5 text-xs text-muted-foreground/70">{t("noWorkspaces")}</p>
        ) : (
          workspaces.map((workspace) => (
            <Link
              key={workspace.id}
              href={`/library/workspaces/${workspace.id}`}
              aria-current={
                pathname === `/library/workspaces/${workspace.id}` ? "page" : undefined
              }
              className={cn(
                navItem,
                pathname === `/library/workspaces/${workspace.id}` && navItemActive,
              )}
            >
              <FlaskConical className="size-4 shrink-0 opacity-70" />
              <span className="truncate">{workspace.name}</span>
              <Count>{workspace.pendingCount}</Count>
            </Link>
          ))
        )}
      </section>

      <section>
        <SectionLabel>{t("tags")}</SectionLabel>
        {tags.length === 0 ? (
          <p className="px-2.5 text-xs text-muted-foreground/70">{t("noTags")}</p>
        ) : (
          <>
            <TagItems nodes={tags} activePath={activeTag} />
            {activeTag && (
              <Link
                href="/library"
                className="mt-1 block px-2.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("clearTag")}
              </Link>
            )}
          </>
        )}
      </section>
    </nav>
  );
}

export function LibraryShell({ collections, views, projects, workspaces, tags, meta, backendError, children }: LibraryShellProps) {
  const t = useTranslations("library");
  const pathname = usePathname();
  const onSettings = pathname === "/library/settings";
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
  }));
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchParams = useSearchParams();
  // meta.counts.papers 把调研区论文也算进「N 篇文献」；页头给出「N 篇在调研区」，
  // 既可一键进入各工作区，也说明列表行尾那些「调研中」从哪来。
  const stagedTotal = workspaces.reduce((sum, workspace) => sum + workspace.pendingCount, 0);

  // 移动端「目录」面板在选中集合/标签/视图/项目后应自动收起：
  // 它渲染在内容上方，导航后仍展开会把新页面挤到下面看不见
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, searchParams]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* 与站内其它页面同一列宽与内边距（max-w-6xl / px-4 sm:px-6），
          让文献库看起来仍是本站的一部分，而不是嵌进来的另一个应用。 */}
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        {/* 页头只留「页名 + 库规模 + 工具」：原来的通用副标题再叠一行灰色说明，
            两行小字互相稀释；规模数字更能说明这个库的状态。 */}
        <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-border/60 pb-6">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
            <p
              className="mt-2 text-sm tabular-nums text-muted-foreground"
              title={meta ? `paperdb ${meta.version}` : undefined}
            >
              {meta
                ? t("libraryStats", {
                    papers: meta.counts.papers ?? 0,
                    pdfs: meta.storage.files ?? 0,
                  })
                : t("backendOffline")}
              {meta && stagedTotal > 0 && (
                <>
                  <span aria-hidden className="mx-1.5 text-muted-foreground/35">·</span>
                  <Link
                    href="/library/workspaces"
                    title={t("stagedHint")}
                    className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground/40"
                  >
                    {t("stagedCount", { count: stagedTotal })}
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/library/settings"
              data-slot="button"
              aria-current={onSettings ? "page" : undefined}
              className={buttonVariants({
                variant: onSettings ? "secondary" : "ghost",
                size: "sm",
                className: "text-muted-foreground",
              })}
            >
              <Settings2 data-icon="inline-start" /> {t("settings")}
            </Link>
            {!backendError && (
              <button
                type="button"
                onClick={() => setMobileOpen((value) => !value)}
                aria-expanded={mobileOpen}
                aria-controls="library-sidebar-mobile"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "xl:hidden",
                )}
              >
                <Menu data-icon="inline-start" />
                {t("browse")}
                <ChevronDown
                  data-icon="inline-end"
                  className={cn("transition-transform", mobileOpen && "rotate-180")}
                />
              </button>
            )}
          </div>
        </header>

        {/* 窄屏（<xl）是纵向排布：侧栏收起后，展开的「目录」面板落在内容上方，
            不能作为 flex-row 的兄弟节点——那会把内容列挤成右侧一条竖条 */}
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          {/* 1024–1279 也收起侧栏：这段宽度下「侧栏 224 + 表格最小 720」会把标题列
              压到 ~320px，标题普遍折成三行；收起后内容列 +224px，表格回到舒适宽度。
              入口由页头的「目录」按钮提供（下方 mobileOpen 面板）。 */}
          {!backendError && (
            <aside className="sticky top-20 hidden max-h-[calc(100svh-6rem)] w-52 shrink-0 overflow-y-auto xl:block">
              <Sidebar collections={collections} views={views} projects={projects} workspaces={workspaces} tags={tags} />
            </aside>
          )}

          {!backendError && mobileOpen && (
            <div
              id="library-sidebar-mobile"
              className="max-h-[60svh] w-full overflow-y-auto rounded-xl border bg-card p-1 xl:hidden"
            >
              <Sidebar collections={collections} views={views} projects={projects} workspaces={workspaces} tags={tags} />
            </div>
          )}

          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </QueryClientProvider>
  );
}
