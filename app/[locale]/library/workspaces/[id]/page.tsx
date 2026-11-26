import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, FileQuestion } from "lucide-react";

import { WorkspaceDetail } from "@/components/library/workspace-detail";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";
import { PaperdbError, getWorkspace, listPapers } from "@/lib/library/server";
import type { PaperSummary, ResearchWorkspaceDetail } from "@/lib/library/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "library" });
  try {
    const workspace = await getWorkspace(id);
    return { title: workspace.name };
  } catch (caught) {
    const notFound = caught instanceof PaperdbError && caught.status === 404;
    return { title: notFound ? t("workspaceNotFound") : t("researchWorkspaces") };
  }
}

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("library");
  let workspace: ResearchWorkspaceDetail;
  let papers: PaperSummary[] = [];
  try {
    // 工作区接口只带 title/year/citekey；列表页需要的作者、venue、标签、日期
    // 都来自 paperdb 的 paper summary。workspace 过滤会把 pending（staged）也算进来。
    const [detail, page] = await Promise.all([
      getWorkspace(id),
      listPapers({ workspace: id, includeStaged: true, limit: 100 }),
    ]);
    workspace = detail;
    papers = page.items;
  } catch (caught) {
    const notFound = caught instanceof PaperdbError && caught.status === 404;
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
        <FileQuestion className="size-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">
          {notFound ? t("workspaceNotFound") : t("workspaceLoadFailed")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {notFound
            ? t("workspaceNotFoundHint")
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
          href="/library/workspaces"
          data-slot="button"
          className={buttonVariants({ variant: "outline", size: "sm", className: "mt-5" })}
        >
          <ArrowLeft data-icon="inline-start" /> {t("backToWorkspaces")}
        </Link>
      </div>
    );
  }

  return <WorkspaceDetail workspace={workspace} papers={papers} />;
}
