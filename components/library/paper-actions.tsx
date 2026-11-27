"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FolderCog, Loader2, Star, Upload } from "lucide-react";

import { OrganizeDialog } from "@/components/library/organize-dialog";
import { useLibraryOrganize } from "@/components/library/library-organize-context";
import { flattenTagPaths } from "@/lib/library/tags";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LibraryApiError,
  libraryApi,
  patchJson,
  uploadPdf,
  waitForJob,
} from "@/lib/library/client";
import { READING_STATUSES } from "@/lib/library/constants";
import type { CollectionNode, PaperDetail, Project } from "@/lib/library/types";
import { cn } from "@/lib/utils";
import { isImeComposing } from "@/lib/utils/ime";

/** 属性选择器（状态/评分）用无边框的 muted chip 风格：与列表筛选栏一致，
 *  文本框（标签路径）保留 2px 描边——「选择」和「输入」用两种视觉语言区分。
 *  弹层用 shadcn Select（Base UI），不再用系统原生下拉。 */
const controlClass =
  "h-8 max-w-full rounded-lg border-0 bg-muted/60 py-0 pl-2.5 pr-1 text-sm text-muted-foreground shadow-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/40 dark:hover:bg-input/50 [&_svg]:!size-3.5";

export function PaperActions({
  paper,
  collections,
  projects,
  hasFile,
}: {
  paper: PaperDetail;
  collections: CollectionNode[];
  projects: Project[];
  hasFile: boolean;
}) {
  const t = useTranslations("library");
  const { tags } = useLibraryOrganize();
  const tagPaths = useMemo(() => flattenTagPaths(tags), [tags]);
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tag, setTag] = useState("");
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [status, setStatus] = useState(paper.state.status);
  const [rating, setRating] = useState<number | null>(paper.state.rating);

  useEffect(() => {
    setStatus(paper.state.status);
    setRating(paper.state.rating);
  }, [paper.state.status, paper.state.rating]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await work();
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const updateState = (patch: Record<string, unknown>) =>
    run(async () => {
      await patchJson(`/papers/${paper.id}/state`, patch);
    });

  const changeStatus = async (next: string) => {
    const previous = status;
    setStatus(next as typeof status);
    if (!(await updateState({ status: next }))) setStatus(previous);
  };

  const changeRating = async (next: number | null) => {
    const previous = rating;
    setRating(next);
    if (!(await updateState({ rating: next }))) setRating(previous);
  };

  const statusItems = READING_STATUSES.map((item) => ({
    value: item,
    label: t(`status_${item}`),
  }));
  const ratingItems = [
    { value: "none", label: t("noRating") },
    ...[1, 2, 3, 4, 5].map((value) => ({
      value: String(value),
      label: "★".repeat(value),
    })),
  ];
  const addTag = () =>
    run(async () => {
      if (!tag.trim()) return;
      await libraryApi(`/papers/${paper.id}/tags`, {
        method: "POST",
        body: JSON.stringify({ paths: [tag.trim()] }),
      });
      setTag("");
    });

  const upload = (file: File) =>
    run(async () => {
      const result = await uploadPdf(paper.id, file);
      if (result.jobId) {
        setMessage(t("extracting"));
        const job = await waitForJob(result.jobId);
        if (job.status !== "succeeded") throw new LibraryApiError(job.lastError ?? t("extractFailed"), 500);
      }
      setMessage(t("uploadDone"));
    });

  return (
    <div className="rounded-xl border bg-card/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 hidden text-xs text-muted-foreground sm:inline">{t("readingGroup")}</span>
          <Select
            items={statusItems}
            value={status}
            onValueChange={(next) => {
              if (next) void changeStatus(next);
            }}
          >
            <SelectTrigger disabled={busy} className={controlClass} aria-label={t("status")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {statusItems.map((item) => (
                <SelectItem key={item.value} value={item.value} label={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={ratingItems}
            value={rating == null ? "none" : String(rating)}
            onValueChange={(next) => {
              if (!next) return;
              void changeRating(next === "none" ? null : Number(next));
            }}
          >
            <SelectTrigger disabled={busy} className={controlClass} aria-label={t("rating")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {ratingItems.map((item) => (
                <SelectItem key={item.value} value={item.value} label={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            disabled={busy}
            aria-pressed={paper.state.starred}
            onClick={() => void updateState({ starred: !paper.state.starred })}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border-2 border-input px-2.5 text-sm transition-colors hover:bg-accent disabled:opacity-50",
              paper.state.starred &&
                "border-amber-400/50 bg-amber-400/10 text-amber-700 dark:text-amber-300",
            )}
          >
            <Star className={cn("size-4", paper.state.starred && "fill-current")} />
            {t("starred")}
          </button>
        </div>

        <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />

        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
          <span className="mr-0.5 hidden text-xs text-muted-foreground sm:inline">{t("organizeGroup")}</span>
          <Button
            type="button"
            variant="outline"
            size="default"
            onClick={() => setOrganizeOpen(true)}
          >
            <FolderCog className="size-4" /> {t("organize")}
          </Button>
          <datalist id="library-tag-options-detail">
            {tagPaths.map((path) => (
              <option key={path} value={path} />
            ))}
          </datalist>
          <input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            list="library-tag-options-detail"
            onKeyDown={(event) => {
              // 组字中的 Enter 属于输入法（确认候选词），不能顺带添加标签——
              // 中文标签很常见，判据见 lib/utils/ime.ts
              if (isImeComposing(event.nativeEvent)) return;
              if (event.key === "Enter") void addTag();
            }}
            placeholder={t("addTagPlaceholder")}
            aria-label={t("addTagPlaceholder")}
            className="h-8 w-28 rounded-lg border-2 border-input bg-transparent px-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
          />
          <Button type="button" variant="outline" size="default" disabled={busy} onClick={() => void addTag()}>
            {t("addTag")}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            size="default"
            variant={hasFile ? "outline" : "default"}
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="w-full sm:w-auto"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {t("uploadPdf")}
          </Button>
        </div>
      </div>
      {message && <p className="mt-2 text-xs text-muted-foreground">{message}</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <OrganizeDialog
        open={organizeOpen}
        onOpenChange={setOrganizeOpen}
        papers={[paper]}
        collections={collections}
        projects={projects}
      />
    </div>
  );
}
