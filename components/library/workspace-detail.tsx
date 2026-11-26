"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Check, FlaskConical, MessageSquareText, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PaperMeta, VenueCell } from "@/components/library/paper-table";
import { Link } from "@/lib/i18n/navigation";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import { compactDate } from "@/lib/library/format";
import type {
  PaperSummary,
  ResearchWorkspaceDetail,
  ResearchWorkspacePaper,
} from "@/lib/library/types";

/** 工作区详情：页头是工作区自己的（名称/说明/批量操作），论文列表沿用
 *  「全部文献」的行解剖（14px 标题、作者/标签/附件、`缩写 'YY`、添加日期），
 *  只在最后一列换成工作区动作。 */
export function WorkspaceDetail({
  workspace,
  papers,
}: {
  workspace: ResearchWorkspaceDetail;
  papers: PaperSummary[];
}) {
  const t = useTranslations("library");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discardRefs, setDiscardRefs] = useState<string[] | null>(null);

  const pending = workspace.papers.filter((paper) => !paper.promoted);
  const closed = workspace.closedAt !== null;
  const pendingIds = pending.map((paper) => paper.paperId);
  const summaryById = new Map(papers.map((paper) => [paper.id, paper]));
  const rows = workspace.papers.map((workspacePaper) => ({
    workspacePaper,
    paper: summaryById.get(workspacePaper.paperId) ?? null,
  }));

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("workspaceActionFailed"));
    } finally {
      setBusy(null);
    }
  };

  const promote = (refs: string[]) =>
    run("promote", async () => {
      await libraryApi(`/workspaces/${workspace.id}/promote`, {
        method: "POST",
        body: JSON.stringify({ paperRefs: refs }),
      });
    });

  const discard = (refs: string[]) =>
    run("discard", async () => {
      await libraryApi(`/workspaces/${workspace.id}/discard`, {
        method: "POST",
        body: JSON.stringify({ paperRefs: refs }),
      });
      setDiscardRefs(null);
    });

  const closeWorkspace = () =>
    run("close", async () => {
      await libraryApi(`/workspaces/${workspace.id}/close`, {
        method: "POST",
        body: JSON.stringify({ discardUnpromoted: false }),
      });
    });

  const rowActions = (paper: ResearchWorkspacePaper) => {
    if (paper.promoted) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/[0.06] px-2 py-1 text-xs font-medium text-brand">
          <Check className="size-3" /> {t("promoted")}
        </span>
      );
    }
    if (closed) {
      return (
        <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs text-muted-foreground">
          {t("workspacePendingBadge")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            void promote([paper.paperId]);
          }}
          disabled={busy !== null}
        >
          {t("promote")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            setDiscardRefs([paper.paperId]);
          }}
          disabled={busy !== null}
          className="text-muted-foreground hover:text-destructive"
        >
          {t("discard")}
        </Button>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/library/workspaces"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" /> {t("backToWorkspaces")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-full bg-brand" />
              <h2 className="min-w-0 break-words text-2xl font-semibold tracking-tight">
                {workspace.name}
              </h2>
              {closed && (
                <span className="shrink-0 rounded border px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                  {t("workspaceClosed")}
                </span>
              )}
            </div>
            {workspace.description && (
              <p className="mt-2 text-sm text-muted-foreground">{workspace.description}</p>
            )}
            <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
              {t("workspaceStats", {
                total: workspace.paperCount,
                pending: workspace.pendingCount,
              })}
            </p>
          </div>
          {!closed && (
            <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void promote(pendingIds)}
                disabled={busy !== null || pendingIds.length === 0}
              >
                <Check /> {t("promoteAll")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDiscardRefs(pendingIds)}
                disabled={busy !== null || pendingIds.length === 0}
              >
                <Trash2 /> {t("discardAll")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void closeWorkspace()}
                disabled={busy !== null || workspace.pendingCount > 0}
                title={workspace.pendingCount > 0 ? t("closeWorkspaceHint") : undefined}
              >
                {t("closeWorkspace")}
              </Button>
            </div>
          )}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <section className="overflow-hidden rounded-2xl border bg-library-surface">
        {workspace.papers.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-14 text-center">
            <FlaskConical className="size-5 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">{t("workspaceEmpty")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t("workspaceEmptyHint")}</p>
          </div>
        ) : (
          <>
            {/* 桌面：和「全部文献」同样的表格列；最后一列放工作区动作 */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium whitespace-nowrap">{t("paper")}</th>
                    <th className="w-[150px] px-3 py-2.5 font-medium whitespace-nowrap">
                      {t("venueColumn")}
                    </th>
                    <th className="hidden w-[96px] px-3 py-2.5 font-medium whitespace-nowrap lg:table-cell">
                      {t("addedColumn")}
                    </th>
                    <th className="w-[200px] px-4 py-2.5 text-right font-medium whitespace-nowrap">
                      {t("workspaceActions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ workspacePaper, paper }) => (
                    <tr
                      key={workspacePaper.paperId}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest("a,button,input,select,label")) {
                          return;
                        }
                        router.push(
                          `/library/papers/${paper?.id ?? workspacePaper.citekey}`,
                        );
                      }}
                      className="group cursor-pointer border-b border-border/70 align-top transition-colors last:border-b-0 hover:bg-brand/[0.035] dark:hover:bg-brand/[0.06]"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/library/papers/${paper?.id ?? workspacePaper.citekey}`}
                          title={paper?.title ?? workspacePaper.title}
                          className="line-clamp-2 min-w-0 text-sm font-medium leading-[1.45] tracking-[-0.005em] transition-colors hover:text-foreground hover:underline hover:underline-offset-2"
                        >
                          {paper?.title ?? workspacePaper.title}
                        </Link>
                        {paper ? (
                          <PaperMeta paper={paper} showStaged={false} linkable={false} />
                        ) : (
                          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                            {workspacePaper.year} · {workspacePaper.citekey}
                          </p>
                        )}
                        {workspacePaper.note && (
                          <p
                            className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground"
                            title={workspacePaper.note}
                          >
                            <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
                            <span className="line-clamp-2">{workspacePaper.note}</span>
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {paper ? (
                          <VenueCell paper={paper} />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {`${t(`kind_${workspacePaper.kind}`)} '${String(workspacePaper.year).slice(-2)}`}
                          </span>
                        )}
                      </td>
                      <td className="hidden px-3 py-3 lg:table-cell">
                        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                          {paper ? compactDate(paper.createdAt) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{rowActions(workspacePaper)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 移动端：同一套信息，动作落在卡片底部 */}
            <ul className="divide-y md:hidden">
              {rows.map(({ workspacePaper, paper }) => (
                <li key={workspacePaper.paperId} className="space-y-2 p-4">
                  <Link
                    href={`/library/papers/${paper?.id ?? workspacePaper.citekey}`}
                    className="block text-sm font-medium leading-[1.45] tracking-[-0.005em]"
                  >
                    {paper?.title ?? workspacePaper.title}
                  </Link>
                  {paper ? (
                    <PaperMeta paper={paper} showStaged={false} linkable={false} stacked />
                  ) : (
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {workspacePaper.year} · {workspacePaper.citekey}
                    </p>
                  )}
                  {workspacePaper.note && (
                    <p
                      className="flex items-start gap-1.5 text-xs text-muted-foreground"
                      title={workspacePaper.note}
                    >
                      <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
                      <span className="line-clamp-2">{workspacePaper.note}</span>
                    </p>
                  )}
                  {paper ? (
                    <VenueCell paper={paper} compact />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {`${t(`kind_${workspacePaper.kind}`)} '${String(workspacePaper.year).slice(-2)}`}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    <span className="text-xs tabular-nums text-muted-foreground/60">
                      {paper ? compactDate(paper.createdAt) : ""}
                    </span>
                    {rowActions(workspacePaper)}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <Dialog
        open={discardRefs !== null}
        onOpenChange={(next) => {
          if (!next) setDiscardRefs(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("discardConfirmTitle", { name: workspace.name })}</DialogTitle>
            <DialogDescription>{t("discardConfirmHint")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDiscardRefs(null)}
              disabled={busy !== null}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => discardRefs && void discard(discardRefs)}
              disabled={busy !== null}
            >
              {t("discard")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
