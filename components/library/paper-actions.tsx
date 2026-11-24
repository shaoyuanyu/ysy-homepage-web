"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Star, Upload } from "lucide-react";

import {
  LibraryApiError,
  libraryApi,
  patchJson,
  uploadPdf,
  waitForJob,
} from "@/lib/library/client";
import type { PaperDetail, ReadingStatus } from "@/lib/library/types";
import { cn } from "@/lib/utils";

const statuses: ReadingStatus[] = ["unread", "queued", "reading", "read", "reviewed", "archived"];

export function PaperActions({
  paper,
  collections,
}: {
  paper: PaperDetail;
  collections: { id: string; name: string }[];
}) {
  const t = useTranslations("library");
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tag, setTag] = useState("");
  const [collectionId, setCollectionId] = useState("");

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await work();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const updateState = (patch: Record<string, unknown>) =>
    run(async () => {
      await patchJson(`/papers/${paper.id}/state`, patch);
    });

  const addTag = () =>
    run(async () => {
      if (!tag.trim()) return;
      await libraryApi(`/papers/${paper.id}/tags`, {
        method: "POST",
        body: JSON.stringify({ paths: [tag.trim()] }),
      });
      setTag("");
    });

  const addToCollection = () =>
    run(async () => {
      if (!collectionId) return;
      await libraryApi(`/papers/${paper.id}/collections`, {
        method: "POST",
        body: JSON.stringify({ collectionIds: [collectionId] }),
      });
      setCollectionId("");
      setMessage(t("collectionAdded"));
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
    <div className="rounded-xl border bg-card/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={paper.state.status}
          disabled={busy}
          onChange={(event) => void updateState({ status: event.target.value })}
          className="h-8 rounded-md border bg-background px-2 text-xs"
          aria-label={t("status")}
        >
          {statuses.map((status) => (
            <option key={status} value={status}>{t(`status_${status}`)}</option>
          ))}
        </select>
        <select
          value={paper.state.rating ?? ""}
          disabled={busy}
          onChange={(event) => void updateState({ rating: event.target.value ? Number(event.target.value) : null })}
          className="h-8 rounded-md border bg-background px-2 text-xs"
          aria-label={t("rating")}
        >
          <option value="">{t("noRating")}</option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>{"★".repeat(value)}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => void updateState({ starred: !paper.state.starred })}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs",
            paper.state.starred && "border-amber-400/50 bg-amber-400/10 text-amber-700 dark:text-amber-300",
          )}
        >
          <Star className={cn("size-3.5", paper.state.starred && "fill-current")} />
          {t("starred")}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={collectionId}
            disabled={busy}
            onChange={(event) => setCollectionId(event.target.value)}
            className="h-8 max-w-40 rounded-md border bg-background px-2 text-xs"
            aria-label={t("addToCollection")}
          >
            <option value="">{t("addToCollection")}</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>{collection.name}</option>
            ))}
          </select>
          <button type="button" disabled={busy || !collectionId} onClick={() => void addToCollection()} className="h-8 rounded-md border px-2 text-xs disabled:opacity-40">
            {t("add")}
          </button>
          <input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addTag();
            }}
            placeholder={t("addTagPlaceholder")}
            className="h-8 w-40 rounded-md border bg-background px-2 text-xs"
          />
          <button type="button" disabled={busy} onClick={() => void addTag()} className="h-8 rounded-md border px-2 text-xs disabled:opacity-40">
            {t("addTag")}
          </button>
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
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {t("uploadPdf")}
          </button>
        </div>
      </div>
      {message && <p className="mt-2 text-xs text-muted-foreground">{message}</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
