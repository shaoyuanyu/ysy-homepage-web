"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * 集合 / 视图 / 项目的重命名弹窗。
 *
 * 为什么用弹窗而不是行内输入：三处列表的行结构不同（集合行没有 flex-wrap、
 * 视图行还有一段 JSON 预览），行内输入在窄屏会把计数/删除挤到看不见的地方；
 * 重命名是低频操作，一个只有名称字段的弹窗更稳。保存失败时保持打开并显示错误，
 * 不做「关了弹窗但没生效」的假成功。
 */
export function RenameDialog({
  value,
  onRename,
}: {
  value: string;
  onRename: (name: string) => Promise<void>;
}) {
  const t = useTranslations("library");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = draft.trim();
    if (!next || next === value) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onRename(next);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft(value);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            aria-label={`${t("rename")} ${value}`}
            title={t("rename")}
          >
            <Pencil />
          </button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{t("rename")}</DialogTitle>
            <DialogDescription>{t("renameHint")}</DialogDescription>
          </DialogHeader>
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={t("rename")}
            autoFocus
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy || !draft.trim()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
