"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Check, FlaskConical, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "@/lib/i18n/navigation";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import type { ResearchWorkspaceDetail } from "@/lib/library/types";

export function WorkspaceDetail({ workspace }: { workspace: ResearchWorkspaceDetail }) {
  const t = useTranslations("library");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discardRefs, setDiscardRefs] = useState<string[] | null>(null);

  const pending = workspace.papers.filter((paper) => !paper.promoted);
  const closed = workspace.closedAt !== null;
  const pendingIds = pending.map((paper) => paper.paperId);

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

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/library/workspaces"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" /> {t("backToWorkspaces")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <FlaskConical className="size-5 text-brand" />
              <span className="min-w-0 break-words">{workspace.name}</span>
              {closed && (
                <span className="rounded border px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                  {t("workspaceClosed")}
                </span>
              )}
            </h2>
            {workspace.description && (
              <p className="text-sm text-muted-foreground">{workspace.description}</p>
            )}
            <p className="text-xs tabular-nums text-muted-foreground">
              {t("workspaceStats", {
                total: workspace.paperCount,
                pending: workspace.pendingCount,
              })}
            </p>
          </div>
          {!closed && (
            <div className="flex flex-wrap items-center gap-2">
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

      <section className="rounded-2xl border bg-library-surface">
        {workspace.papers.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-14 text-center">
            <FlaskConical className="size-5 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">{t("workspaceEmpty")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t("workspaceEmptyHint")}</p>
          </div>
        ) : (
          <div className="divide-y">
            {workspace.papers.map((paper) => (
              <div
                key={paper.paperId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/library/papers/${paper.citekey}`}
                    className="block truncate text-sm font-medium hover:underline hover:underline-offset-2"
                    title={paper.title}
                  >
                    {paper.title}
                  </Link>
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {paper.year} · {paper.citekey}
                  </p>
                </div>
                {paper.promoted ? (
                  <span className="rounded border border-brand/40 px-1.5 py-0.5 text-xs text-brand">
                    {t("promoted")}
                  </span>
                ) : closed ? (
                  <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                    {t("workspacePendingBadge")}
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void promote([paper.paperId])}
                      disabled={busy !== null}
                    >
                      {t("promote")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDiscardRefs([paper.paperId])}
                      disabled={busy !== null}
                    >
                      {t("discard")}
                    </Button>
                  </span>
                )}
              </div>
            ))}
          </div>
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
