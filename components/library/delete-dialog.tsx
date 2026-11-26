"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";

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

/**
 * 删除集合 / 视图 / 项目前的确认弹窗。
 *
 * 这三处原来点一下垃圾桶就直接 DELETE（集合会连带层级消失），误触代价不小；
 * 删除接口不可撤回，确认一次的成本远低于恢复成本。失败时保持打开并显示原因。
 */
export function DeleteDialog({
  label,
  description,
  onDelete,
}: {
  label: string;
  description: string;
  onDelete: () => Promise<void>;
}) {
  const t = useTranslations("library");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
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
        if (next) setError(null);
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            aria-label={`${t("delete")} ${label}`}
            title={t("delete")}
          >
            <Trash2 />
          </button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("deleteConfirmTitle", { name: label })}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void confirm()} disabled={busy}>
            {t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
