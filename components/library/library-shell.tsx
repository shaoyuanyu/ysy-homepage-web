"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Import,
  Inbox,
  Library,
  Plus,
  Settings2,
  Star,
  Tags,
} from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Link } from "@/lib/i18n/navigation";
import type {
  CollectionNode,
  Meta,
  Project,
  SavedView,
  TagNode,
} from "@/lib/library/types";
import { cn } from "@/lib/utils";

interface LibraryShellProps {
  collections: CollectionNode[];
  views: SavedView[];
  projects: Project[];
  tags: TagNode[];
  meta: Meta | null;
  backendError: string | null;
  children: ReactNode;
}

function CollectionItems({ nodes, depth = 0 }: { nodes: CollectionNode[]; depth?: number }) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id}>
          <Link
            href={`/library?collection=${node.id}`}
            className={cn(
              "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground",
              depth > 0 && "ml-3",
            )}
          >
            <FolderTree className="size-3.5 shrink-0" />
            <span className="truncate">{node.name}</span>
            <span className="ml-auto text-[11px] tabular-nums opacity-60">
              {node.totalCount}
            </span>
          </Link>
          {node.children.length > 0 && <CollectionItems nodes={node.children} depth={depth + 1} />}
        </div>
      ))}
    </>
  );
}

function TagItems({ nodes }: { nodes: TagNode[] }) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id}>
          <Link
            href={`/library?tag=${encodeURIComponent(node.path)}`}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Tags className="size-3.5 shrink-0" />
            <span className="truncate">{node.name}</span>
            <span className="ml-auto text-[11px] tabular-nums opacity-60">{node.paperCount}</span>
          </Link>
          {node.children.length > 0 && <div className="ml-4"><TagItems nodes={node.children} /></div>}
        </div>
      ))}
    </>
  );
}

function Sidebar({ collections, views, projects, tags }: Omit<LibraryShellProps, "meta" | "backendError" | "children">) {
  const t = useTranslations("library");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeView = searchParams.get("view");
  const activeProject = searchParams.get("project");
  const activeTag = searchParams.get("tag");
  const onAll = pathname === "/library" && !searchParams.toString();

  return (
    <nav className="flex flex-col gap-5 px-3 py-4 text-sm">
      <div className="space-y-1">
        <Link
          href="/library"
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
            onAll && "bg-accent text-foreground",
          )}
        >
          <Library className="size-4" /> {t("allPapers")}
        </Link>
        <Link
          href="/library?unfiled=1"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Inbox className="size-4" /> {t("inbox")}
        </Link>
        <Link
          href="/library?starred=1"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Star className="size-4" /> {t("starred")}
        </Link>
        <Link
          href="/library/import"
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
            pathname === "/library/import" && "bg-accent text-foreground",
          )}
        >
          <Import className="size-4" /> {t("import")}
        </Link>
      </div>

      <section>
        <div className="mb-1 flex items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          <span>{t("collections")}</span>
          <Link href="/library/collections" aria-label={t("manageCollections")} className="hover:text-foreground">
            <Plus className="size-3.5" />
          </Link>
        </div>
        <CollectionItems nodes={collections} />
      </section>

      <section>
        <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {t("views")}
        </div>
        {views.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground/60">{t("noViews")}</p>
        ) : (
          views.map((view) => (
            <Link
              key={view.id}
              href={`/library?view=${view.id}`}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground",
                activeView === view.id && "bg-accent text-foreground",
              )}
            >
              <BookOpen className="size-3.5 shrink-0" />
              <span className="truncate">{view.name}</span>
              <span className="ml-auto text-[11px] tabular-nums opacity-60">{view.count}</span>
            </Link>
          ))
        )}
      </section>

      <section>
        <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {t("projects")}
        </div>
        {projects.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground/60">{t("noProjects")}</p>
        ) : (
          projects.map((project) => (
            <Link
              key={project.id}
              href={`/library?project=${project.id}`}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground",
                activeProject === project.id && "bg-accent text-foreground",
              )}
            >
              <FolderTree className="size-3.5 shrink-0" />
              <span className="truncate">{project.name}</span>
              <span className="ml-auto text-[11px] tabular-nums opacity-60">{project.paperCount}</span>
            </Link>
          ))
        )}
      </section>

      <section>
        <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {t("tags")}
        </div>
        {tags.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground/60">{t("noTags")}</p>
        ) : (
          <>
            <TagItems nodes={tags} />
            {activeTag && (
              <Link href="/library" className="mt-1 block px-2 text-xs text-muted-foreground underline-offset-4 hover:underline">
                {t("clearTag")}
              </Link>
            )}
          </>
        )}
      </section>
    </nav>
  );
}

export function LibraryShell({ collections, views, projects, tags, meta, backendError, children }: LibraryShellProps) {
  const t = useTranslations("library");
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
  }));
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="w-full mx-auto max-w-[1440px] px-3 py-4 sm:px-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen((value) => !value)}
              className="rounded-md border px-2 py-1 text-xs text-muted-foreground lg:hidden"
            >
              {mobileOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
            <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <Library className="size-5" /> {t("title")}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {meta ? `paperdb ${meta.version}` : "paperdb offline"}
            </span>
            <Link
              href="/library/settings"
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Settings2 className="size-3.5" /> {t("settings")}
            </Link>
          </div>
        </div>

        {backendError && (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t("backendError")}: {backendError}
          </div>
        )}

        <div className="flex items-start gap-4">
          <aside className={cn(
            "sticky top-20 hidden h-[calc(100svh-6rem)] w-60 shrink-0 overflow-y-auto rounded-xl border bg-card/40 lg:block",
          )}>
            <Sidebar collections={collections} views={views} projects={projects} tags={tags} />
          </aside>
          {mobileOpen && (
            <div className="fixed inset-x-3 top-20 z-30 max-h-[75svh] overflow-y-auto rounded-xl border bg-background shadow-xl lg:hidden">
              <Sidebar collections={collections} views={views} projects={projects} tags={tags} />
            </div>
          )}
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </QueryClientProvider>
  );
}
