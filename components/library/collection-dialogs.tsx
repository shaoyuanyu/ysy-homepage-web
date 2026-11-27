"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CollectionNode } from "@/lib/library/types";

/**
 * 集合管理的四个弹窗：新建（含子集合）、编辑、移动、删除。
 *
 * 都做成受控组件、由 `CollectionsPanel` 决定开关；提交失败时保持打开并显示
 * 后端原文（同名冲突 409 之类），不做「关了弹窗但没生效」的假成功。
 * 移动与删除单独成窗：拖拽是快捷路径，键盘/触屏用户走弹窗这条等价路径。
 */

function errorText(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

interface CommonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CollectionCreateDialog({
  open,
  onOpenChange,
  parent,
  onSubmit,
}: CommonProps & {
  parent: CollectionNode | null;
  onSubmit: (input: { name: string; description: string }) => Promise<void>;
}) {
  const t = useTranslations("library");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setError(null);
    }
  }, [open]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: trimmed, description: description.trim() });
      onOpenChange(false);
    } catch (caught) {
      setError(errorText(caught, t("actionFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{parent ? t("addSubcollection") : t("newCollection")}</DialogTitle>
            <DialogDescription>
              {parent ? t("parentUnder", { name: parent.name }) : t("newCollectionHint")}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("collectionName")}
            aria-label={t("collectionName")}
            autoFocus
          />
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("descriptionPlaceholder")}
            aria-label={t("descriptionLabel")}
            rows={2}
            className="min-h-14"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CollectionEditDialog({
  open,
  onOpenChange,
  node,
  onSubmit,
}: CommonProps & {
  node: CollectionNode | null;
  onSubmit: (input: { name: string; description: string }) => Promise<void>;
}) {
  const t = useTranslations("library");
  const [name, setName] = useState(node?.name ?? "");
  const [description, setDescription] = useState(node?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && node) {
      setName(node.name);
      setDescription(node.description ?? "");
      setError(null);
    }
  }, [open, node]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: trimmed, description: description.trim() });
      onOpenChange(false);
    } catch (caught) {
      setError(errorText(caught, t("actionFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{t("editCollection")}</DialogTitle>
            <DialogDescription>{t("editCollectionHint")}</DialogDescription>
          </DialogHeader>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("collectionName")}
            aria-label={t("collectionName")}
            autoFocus
          />
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("descriptionPlaceholder")}
            aria-label={t("descriptionLabel")}
            rows={3}
            className="min-h-16"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ROOT_VALUE = "__root__";

export function CollectionMoveDialog({
  open,
  onOpenChange,
  node,
  options,
  onSubmit,
}: CommonProps & {
  node: CollectionNode | null;
  options: { id: string; label: string }[];
  onSubmit: (parentId: string | null) => Promise<void>;
}) {
  const t = useTranslations("library");
  const [target, setTarget] = useState(node?.parentId ?? ROOT_VALUE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && node) {
      setTarget(node.parentId ?? ROOT_VALUE);
      setError(null);
    }
  }, [open, node]);

  const items = [
    { value: ROOT_VALUE, label: t("rootLevel") },
    ...options.map((item) => ({ value: item.id, label: item.label })),
  ];

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parentId = target === ROOT_VALUE ? null : target;
    if (parentId === node?.parentId) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(parentId);
      onOpenChange(false);
    } catch (caught) {
      setError(errorText(caught, t("actionFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{t("moveCollectionTitle")}</DialogTitle>
            <DialogDescription>{t("moveCollectionHint")}</DialogDescription>
          </DialogHeader>
          <Select
            items={items}
            value={target}
            onValueChange={(next) => setTarget(next ?? ROOT_VALUE)}
          >
            <SelectTrigger aria-label={t("moveToParent")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value} label={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {t("moveAction")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CollectionDeleteDialog({
  open,
  onOpenChange,
  node,
  onSubmit,
}: CommonProps & {
  node: CollectionNode | null;
  onSubmit: (mode: "promote" | "discard") => Promise<void>;
}) {
  const t = useTranslations("library");
  const [mode, setMode] = useState<"promote" | "discard">("promote");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // 默认「保留子集合」：误删时最不容易丢结构。
      setMode("promote");
      setError(null);
    }
  }, [open]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(mode);
      onOpenChange(false);
    } catch (caught) {
      setError(errorText(caught, t("actionFailed")));
    } finally {
      setBusy(false);
    }
  };

  const childCount = node?.children.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle", { name: node?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("deleteCollectionHint")}</DialogDescription>
          </DialogHeader>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">{t("deleteMode")}</legend>
            {(
              [
                {
                  value: "promote" as const,
                  label: t("deleteModePromote"),
                  hint: t("deletePromoteHint"),
                },
                {
                  value: "discard" as const,
                  label: t("deleteModeDiscard"),
                  hint: t("deleteDiscardHint"),
                },
              ]
            ).map((option) => (
              <label
                key={option.value}
                data-slot="delete-mode"
                data-checked={mode === option.value ? "" : undefined}
                className="flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors hover:bg-accent/20 data-[checked]:border-brand/50 data-[checked]:bg-brand/[0.05]"
              >
                <input
                  type="radio"
                  name="delete-mode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                  className="mt-1 size-3.5 accent-brand"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {childCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("directChildCount", { count: childCount })}
            </p>
          )}
          {mode === "discard" && (
            <p className="text-xs text-destructive">{t("deleteDiscardWarning")}</p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {t("delete")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
