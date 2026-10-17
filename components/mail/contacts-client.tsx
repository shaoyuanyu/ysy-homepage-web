"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BookUserIcon,
  CircleAlertIcon,
  PencilIcon,
  SquarePenIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { mailErrorText } from "@/lib/mail/error-text";
import { fetchWithTimeout } from "@/lib/mail/fetch-timeout";
import { useOwnAddresses } from "@/lib/mail/use-own-addresses";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { MailContact, MailKnownSender } from "@/lib/mail/types";

/** 头像字母：姓名首字符，无姓名取邮箱首字符（与 message-view 的头像口径一致） */
function avatarLetter(name: string, email: string): string {
  return (name.trim() || email.trim()).charAt(0).toUpperCase() || "?";
}

interface DialogState {
  mode: "add" | "edit";
  /** edit 模式下的原联系人 */
  contact?: MailContact;
  name: string;
  email: string;
  note: string;
}

/** 通讯录客户端：联系人 CRUD + 自动收录地址一键存入 */
export function ContactsClient() {
  const t = useTranslations("mail");

  // 自己的收发地址（webmail 账号 + agent 信箱，4.10）：只读区块，直接写信入口。
  // ⚠ 去重（2026-10 用户指定）：自己的地址不属于「联系人」——联系人列表与自动收录
  // 都把它过滤掉（只出现在「我的账号」里），新增/存入时也会拦下。
  // ready 之前 emails 为空，先按不过滤渲染（数据本来也在加载中），避免闪动。
  const { ready, own, emails } = useOwnAddresses();

  const [contacts, setContacts] = useState<MailContact[] | null>(null);
  const [known, setKnown] = useState<MailKnownSender[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MailContact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingKnown, setSavingKnown] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /**
   * 搜索请求序号（2026-10-17 审计）：慢的旧响应不能覆盖新关键词的结果。
   * 300ms 防抖只能降低概率——快速输入时两个请求仍可能并发，而网络回来的顺序不保证。
   * 每次进入 `loadContacts` 递增；响应落地前比对，不是最后一次就丢掉（连错误也不报，
   * 否则旧请求的失败会在新结果上弹一条无关错误）。
   */
  const contactSeq = useRef(0);

  const loadContacts = useCallback(async (query: string) => {
    const seq = ++contactSeq.current;
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    try {
      const res = await fetchWithTimeout(`/api/mail/contacts?${params}`);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `${res.status}`);
      const data = (await res.json()) as { items: MailContact[] };
      if (seq !== contactSeq.current) return;
      setContacts(data.items);
    } catch (err) {
      // 过期请求的失败静默丢弃；只有最后一次请求的错误才交给调用方展示
      if (seq === contactSeq.current) throw err;
    }
  }, []);

  const loadKnown = useCallback(async () => {
    const res = await fetchWithTimeout("/api/mail/contacts/known?limit=30");
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `${res.status}`);
    const data = (await res.json()) as { items: MailKnownSender[] };
    setKnown(data.items);
  }, []);

  // 初始加载 + 搜索防抖（300ms，与邮件列表一致）
  useEffect(() => {
    setError(null);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      loadContacts(q).catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [q, loadContacts]);

  useEffect(() => {
    loadKnown().catch(() => setKnown([]));
  }, [loadKnown]);

  const openAdd = useCallback(() => {
    setDialog({ mode: "add", name: "", email: "", note: "" });
  }, []);

  // 自己的地址从「联系人」与「自动收录」里剔除（ready 前不过滤，见上）
  const visibleContacts = (contacts ?? []).filter(
    (c) => !ready || !emails.has(c.email.toLowerCase()),
  );
  const visibleKnown = (known ?? []).filter(
    (k) => !ready || !emails.has(k.email.toLowerCase()),
  );

  const openEdit = useCallback((contact: MailContact) => {
    setDialog({ mode: "edit", contact, name: contact.name, email: contact.email, note: contact.note });
  }, []);

  const save = useCallback(async () => {
    if (!dialog) return;
    if (!dialog.email.trim()) {
      toast.add({ title: t("contacts.saveFailed"), description: t("contacts.fieldEmail"), type: "error" });
      return;
    }
    // 自己的地址无需存进通讯录（已在「我的账号」里）——拦在请求发出之前
    if (emails.has(dialog.email.trim().toLowerCase())) {
      toast.add({ title: t("contacts.saveFailed"), description: t("contacts.ownBlocked"), type: "error" });
      return;
    }
    setSaving(true);
    /**
     * 乐观（2026-10-10）：弹窗立刻关、这一条**立刻**进列表；请求在后台跑。
     * ⚠ 新增用**临时 id**（`tmp-…`）：真 id 由服务端生成，完成后那次 `loadContacts`
     *   会用服务端的真实数据整个换掉列表（临时项随之消失）。
     * ⚠ 编辑沿用原 id（它就是同一条）。
     */
    const now = new Date().toISOString();
    const optimistic: MailContact = {
      id: dialog.mode === "add" ? `tmp-${Date.now()}` : dialog.contact!.id,
      name: dialog.name.trim(),
      email: dialog.email.trim(),
      note: dialog.note.trim(),
      account: dialog.contact?.account ?? "",
      createdAt: dialog.contact?.createdAt ?? now,
      updatedAt: now,
    };
    setDialog(null);
    setContacts((prev) =>
      prev ? [optimistic, ...prev.filter((c) => c.id !== optimistic.id)] : prev,
    );
    try {
      const res =
        dialog.mode === "add"
          ? await fetch("/api/mail/contacts", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name: dialog.name, email: dialog.email, note: dialog.note }),
            })
          : await fetch(`/api/mail/contacts/${encodeURIComponent(dialog.contact!.id)}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name: dialog.name, email: dialog.email, note: dialog.note }),
            });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `${res.status}`);
      toast.add({ title: t("contacts.saved"), type: "success" });
      // 收录区也要刷新：刚保存的地址会从「自动收录」里消失（不阻塞——界面已经是新样子了）
      void Promise.all([loadContacts(q), loadKnown()]);
    } catch (err) {
      // 回滚：把乐观项拿掉，并按服务端重取（顺序与内容以服务端为准）
      setContacts((prev) => (prev ? prev.filter((c) => c.id !== optimistic.id) : prev));
      void loadContacts(q);
      toast.add({
        title: t("contacts.saveFailed"),
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [dialog, q, emails, loadContacts, loadKnown, t]);

  const doDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    // 乐观：弹窗立刻关、这一行**立刻**消失（删失败再按服务端重取把它找回来）
    setPendingDelete(null);
    setContacts((prev) => (prev ? prev.filter((c) => c.id !== target.id) : prev));
    setDeleting(true);
    try {
      const res = await fetch(`/api/mail/contacts/${encodeURIComponent(target.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.add({ title: t("contacts.deleted"), type: "success" });
      // 删除后该地址可能重新出现在「自动收录」里
      void Promise.all([loadContacts(q), loadKnown()]);
    } catch {
      toast.add({ title: t("actionFailed"), type: "error" });
      void loadContacts(q);
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, q, loadContacts, loadKnown, t]);

  /** 自动收录 → 一键存入（姓名用邮件里的显示名预填） */
  const saveKnown = useCallback(
    async (sender: MailKnownSender) => {
      setSavingKnown(sender.email);
      /**
       * 乐观：这一条**立刻**从「自动收录」移走、并放进上面那个通讯录列表。
       * （临时 id 同上；后台那次 `loadContacts` 会用服务端的真实数据换掉。）
       */
      const now = new Date().toISOString();
      setKnown((prev) => (prev ?? []).filter((k) => k.email !== sender.email));
      setContacts((prev) =>
        prev
          ? [
              {
                id: `tmp-${Date.now()}`,
                name: sender.name,
                email: sender.email,
                note: "",
                account: "",
                createdAt: now,
                updatedAt: now,
              },
              ...prev,
            ]
          : prev,
      );
      try {
        const res = await fetch("/api/mail/contacts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: sender.name, email: sender.email }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `${res.status}`);
        toast.add({ title: t("contacts.savedToast"), type: "success" });
        void loadContacts(q);
      } catch (err) {
        // 回滚：从通讯录里拿掉、让收录区按服务端重取（顺序是按通信次数排的，不手推）
        void loadKnown();
        void loadContacts(q);
        toast.add({
          title: t("contacts.saveFailed"),
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        });
      } finally {
        setSavingKnown(null);
      }
    },
    [q, loadContacts, loadKnown, t],
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("contacts.searchPlaceholder")}
          clearLabel={t("clearSearch")}
          className="w-full sm:w-72"
          aria-label={t("contacts.searchPlaceholder")}
        />
        <Button size="sm" className="ml-auto" onClick={openAdd}>
          <UserPlusIcon data-icon="default" />
          {t("contacts.add")}
        </Button>
      </div>

      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <CircleAlertIcon className="size-4" aria-hidden />
          {mailErrorText(error, t)}
        </p>
      )}

      {/* 我的账号（4.10）：自己的收发地址（webmail 账号 + agent 信箱）。
          只读——不可编辑/删除（它们来自各自的账号注册表，不是通讯录里的人），
          但可以一键给自己写信。 */}
      {own.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{t("contacts.ownTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("contacts.ownDesc")}</p>
          </div>
          <ul
            className="divide-y divide-border rounded-xl border border-border"
            data-slot="own-address-list"
          >
            {own.map((o) => (
              <li key={`${o.kind}:${o.email}`} className="flex items-center gap-3 px-4 py-3">
                <Avatar className="size-9 shrink-0">
                  <AvatarFallback>{avatarLetter(o.name, o.email)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{o.name || o.email}</span>
                    {o.kind === "agent" && (
                      <Badge variant="outline" className="shrink-0 font-normal">
                        {t("contacts.ownAgentBadge")}
                      </Badge>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{o.email}</span>
                </span>
                <Link
                  href={`/mail/compose?to=${encodeURIComponent(o.email)}`}
                  data-slot="button"
                  className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                  aria-label={t("contacts.writeTo")}
                  title={t("contacts.writeTo")}
                >
                  <SquarePenIcon />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 联系人（手动维护）：自己的地址已被剔除，收在上方「我的账号」里 */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t("contacts.listTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("contacts.listDesc")}</p>
        </div>
        {contacts === null ? (
          <ul className="divide-y divide-border rounded-xl border border-border" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </li>
            ))}
          </ul>
        ) : visibleContacts.length === 0 ? (
          <Empty>
            <EmptyMedia variant="icon">
              <BookUserIcon aria-hidden />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{t("contacts.empty")}</EmptyTitle>
              <EmptyDescription>{t("contacts.emptyHint")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border" data-slot="contact-list">
            {visibleContacts.map((c) => (
            <li key={c.id} className="group/row relative flex items-center gap-3 px-4 py-3">
              <Avatar className="size-9 shrink-0">
                <AvatarFallback>{avatarLetter(c.name, c.email)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.name || c.email}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {c.name ? c.email : ""}
                  {c.note ? `${c.name ? " · " : ""}${c.note}` : ""}
                </span>
              </span>
              {/* ⚠ 显现条件用 `:focus-visible` 而非 `:focus-within`：鼠标点过的按钮**仍持有焦点**
                  （`matches(":focus-visible")` 为 false），`focus-within` 会把这一行的动作钉在
                  屏幕上——鼠标移到另一行就两行并存（邮件列表行同一处报障，详见 `mail-client.tsx`
                  的 `mail-row-actions` 长注释） */}
              <span className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover/row:opacity-100 sm:group-has-[:focus-visible]/row:opacity-100">
                <Link
                  href={`/mail/compose?to=${encodeURIComponent(c.email)}`}
                  data-slot="button"
                  className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                  aria-label={t("contacts.writeTo")}
                >
                  <SquarePenIcon />
                </Link>
                <Button variant="ghost" size="icon-sm" aria-label={t("contacts.edit")} onClick={() => openEdit(c)}>
                  <PencilIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("contacts.delete")}
                  onClick={() => setPendingDelete(c)}
                >
                  <Trash2Icon />
                </Button>
              </span>
            </li>
            ))}
          </ul>
        )}
      </section>

      {/* 未加入通讯录：通信过但未保存的地址（不写库，从 messages 现算）。
          自己的地址同样被剔除（自己的往来不该出现在这里）。
          ⚠ 视觉语言与「联系人」区刻意区分（2026-10-03 用户指定）：卡片用**虚线边框**
          + 淡底、头像用**虚线轮廓透明底**（而非联系人区的实线卡片 + 实心 muted 头像）——
          虚线 = 「临时/尚未收录」，一眼可辨。 */}
      {known !== null && visibleKnown.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{t("contacts.knownTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("contacts.knownDesc")}</p>
          </div>
          <ul className="divide-y divide-border rounded-xl border border-dashed border-border bg-muted/30" data-slot="known-sender-list">
            {visibleKnown.map((k) => (
              <li key={k.email} className="flex items-center gap-3 px-4 py-3">
                <Avatar className="size-9 shrink-0 [&::after]:border-dashed [&::after]:border-muted-foreground/40">
                  <AvatarFallback className="bg-transparent">{avatarLetter(k.name, k.email)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{k.name || k.email}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {k.name ? `${k.email} · ` : ""}
                    {t("contacts.knownTimes", { count: k.times })}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  disabled={savingKnown === k.email}
                  onClick={() => saveKnown(k)}
                >
                  {savingKnown === k.email ? <Spinner /> : <UserPlusIcon data-icon="default" />}
                  {t("contacts.saveToContacts")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 新增 / 编辑弹窗（关闭入口只有右上角 X，footer 只放主操作） */}
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit" ? t("contacts.dialogEditTitle") : t("contacts.dialogAddTitle")}
            </DialogTitle>
          </DialogHeader>
          {dialog && (
            <FieldGroup className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="contact-name">{t("contacts.fieldName")}</FieldLabel>
                <Input
                  id="contact-name"
                  value={dialog.name}
                  onChange={(e) => setDialog({ ...dialog, name: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="contact-email">{t("contacts.fieldEmail")}</FieldLabel>
                <Input
                  id="contact-email"
                  type="email"
                  required
                  value={dialog.email}
                  onChange={(e) => setDialog({ ...dialog, email: e.target.value })}
                  placeholder="someone@example.org"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="contact-note">{t("contacts.fieldNote")}</FieldLabel>
                <Textarea
                  id="contact-note"
                  rows={3}
                  value={dialog.note}
                  onChange={(e) => setDialog({ ...dialog, note: e.target.value })}
                />
              </Field>
            </FieldGroup>
          )}
          <DialogFooter>
            <Button onClick={save} disabled={saving || !dialog?.email.trim()}>
              {saving ? <Spinner /> : null}
              {saving ? t("contacts.saving") : t("contacts.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t("contacts.deleteConfirmTitle")}
        description={t("contacts.deleteConfirmBody", { email: pendingDelete?.email ?? "" })}
        confirmLabel={t("contacts.delete")}
        pending={deleting}
        onConfirm={doDelete}
      />
    </div>
  );
}
