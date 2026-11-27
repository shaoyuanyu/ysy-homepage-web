"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import { PAPER_KINDS } from "@/lib/library/constants";
import type { PaperDetail } from "@/lib/library/types";

/** 论文元数据编辑：修正 PDF/检索导入时识别错的标题、年份、类型、citekey 等。 */
export function PaperMetadataDialog({ paper }: { paper: PaperDetail }) {
  const t = useTranslations("library");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(paper.title);
  const [kind, setKind] = useState(paper.kind);
  const [year, setYear] = useState(String(paper.year));
  const [citekey, setCitekey] = useState(paper.citekey);
  const [abstract, setAbstract] = useState(paper.abstract ?? "");
  const [volume, setVolume] = useState(paper.volume ?? "");
  const [issue, setIssue] = useState(paper.issue ?? "");
  const [pages, setPages] = useState(paper.pages ?? "");
  const [institution, setInstitution] = useState(paper.institution ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(paper.title);
    setKind(paper.kind);
    setYear(String(paper.year));
    setCitekey(paper.citekey);
    setAbstract(paper.abstract ?? "");
    setVolume(paper.volume ?? "");
    setIssue(paper.issue ?? "");
    setPages(paper.pages ?? "");
    setInstitution(paper.institution ?? "");
    setError(null);
  }, [open, paper]);

  const save = async () => {
    if (!title.trim() || !citekey.trim() || saving) return;
    const parsedYear = Number(year);
    if (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > 2100) {
      setError(t("invalidYear"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await libraryApi(`/papers/${paper.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          kind,
          year: parsedYear,
          citekey: citekey.trim(),
          abstract: abstract.trim() || null,
          volume: volume.trim() || null,
          issue: issue.trim() || null,
          pages: pages.trim() || null,
          institution: institution.trim() || null,
        }),
      });
      toast.add({ title: t("metadataSaved"), type: "success" });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground"
      >
        <Pencil /> {t("editMetadata")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-4" /> {t("editMetadata")}
            </DialogTitle>
            <DialogDescription>{t("editMetadataHint")}</DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[60svh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            <label className="block text-xs font-medium sm:col-span-2">
              {t("paperTitle")}
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1"
                autoFocus
              />
            </label>
            <label className="block text-xs font-medium">
              {t("kind")}
              <Select
                items={PAPER_KINDS.map((item) => ({ value: item, label: t(`kind_${item}`) }))}
                value={kind}
                onValueChange={(next) => setKind(next ?? kind)}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAPER_KINDS.map((item) => (
                    <SelectItem key={item} value={item} label={t(`kind_${item}`)}>
                      {t(`kind_${item}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block text-xs font-medium">
              {t("year")}
              <Input
                value={year}
                onChange={(event) => setYear(event.target.value)}
                inputMode="numeric"
                className="mt-1 tabular-nums"
              />
            </label>
            <label className="block text-xs font-medium">
              {t("citekey")}
              <Input
                value={citekey}
                onChange={(event) => setCitekey(event.target.value)}
                className="mt-1 font-mono text-xs"
              />
            </label>
            <label className="block text-xs font-medium">
              {t("volume")}
              <Input value={volume} onChange={(event) => setVolume(event.target.value)} className="mt-1" />
            </label>
            <label className="block text-xs font-medium">
              {t("issue")}
              <Input value={issue} onChange={(event) => setIssue(event.target.value)} className="mt-1" />
            </label>
            <label className="block text-xs font-medium">
              {t("pages")}
              <Input value={pages} onChange={(event) => setPages(event.target.value)} className="mt-1" />
            </label>
            <label className="block text-xs font-medium sm:col-span-2">
              {t("institution")}
              <Input
                value={institution}
                onChange={(event) => setInstitution(event.target.value)}
                className="mt-1"
              />
            </label>
            <label className="block text-xs font-medium sm:col-span-2">
              {t("abstract")}
              <textarea
                value={abstract}
                onChange={(event) => setAbstract(event.target.value)}
                rows={5}
                className="mt-1 w-full rounded-lg border-2 border-input bg-transparent p-2 text-sm leading-relaxed outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
              />
            </label>
            {error && <p role="alert" className="text-xs text-destructive sm:col-span-2">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={saving || !title.trim() || !citekey.trim()}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
