"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CopyIcon, DownloadIcon, ImageOffIcon, PenLineIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { accountDisplayName } from "@/components/mail/account-label";
import { signatureHtmlToMarkdown } from "@/lib/mail/signature-import";
import { fetchWithTimeout } from "@/lib/mail/fetch-timeout";
import { PREFERENCE_KEYS } from "@/lib/preferences/registry";
import { useOwnerPreferences } from "@/lib/preferences/use-owner-preferences";
import type { MailAccount } from "@/lib/mail/types";

/**
 * 邮件设置页的主体（2026-10-14 用户要求：「设置」入口跳转到独立页面、列表要好看——
 * 弹窗版本与首版页面都被打回）。
 *
 * 目前只有一节：远程图片白名单（4.4）。版式 = **一整张设置卡片**（`max-w-2xl`）：
 * 头部放「标题 + 说明 + 添加行」，下方一条分隔线接域名列表（`divide-y`，行
 * `px-4 py-2.5`，行尾「移除」按钮常显、次要色）。
 * ⚠ 头部与列表同在卡片的内容宽度里——右缘严格对齐（首版输入行比列表短一截，
 *   是被打回的直接原因之一）。空态用 `Empty`、加载态用骨架行。
 *
 * 白名单是**全站设置**、不属于任何账号。改动即时 `PUT /remote-image-domains` 全量数组
 * （服务端归一化），页面上没有「保存」按钮；保存失败 toast 且本地列表不变。
 */
export function SettingsClient() {
  const t = useTranslations("mail");
  // null = 还没读到（显示骨架）、[] = 读到了但没有条目（显示空态）
  const [domains, setDomains] = useState<string[] | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchWithTimeout("/api/mail/remote-image-domains");
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `${res.status}`);
    setDomains(((await res.json()) as { domains: string[] }).domains);
  }, []);

  useEffect(() => {
    load().catch(() => toast.add({ title: t("remoteImages.failed"), type: "error" }));
  }, [load, t]);

  /** 白名单变更即时保存（PUT 全量数组，服务端归一化）；失败 toast 且本地列表不变 */
  const save = useCallback(
    async (next: string[]): Promise<boolean> => {
      setSaving(true);
      try {
        const res = await fetch("/api/mail/remote-image-domains", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ domains: next }),
        });
        if (!res.ok) {
          throw new Error((await res.json().catch(() => null))?.error ?? `${res.status}`);
        }
        setDomains(((await res.json()) as { domains: string[] }).domains);
        return true;
      } catch (err) {
        toast.add({
          title: t("remoteImages.failed"),
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [t],
  );

  const addDomain = useCallback(async () => {
    const d = draft.trim().toLowerCase();
    if (!d || !domains || domains.includes(d)) return;
    if (await save([...domains, d])) setDraft("");
  }, [draft, domains, save]);

  const removeDomain = useCallback(
    async (d: string) => {
      if (!domains) return;
      await save(domains.filter((x) => x !== d));
    },
    [domains, save],
  );

  return (
    <div className="flex flex-col gap-6">
      <section
        data-slot="remote-image-whitelist"
        className="max-w-2xl overflow-hidden rounded-xl border border-border"
      >
      {/* 头部：标题 + 说明 + 添加行——与下方列表同一个内容宽度，右缘严格对齐 */}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">{t("remoteImages.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("remoteImages.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            placeholder={t("remoteImages.placeholder")}
            aria-label={t("remoteImages.placeholder")}
            inputMode="url"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addDomain();
              }
            }}
          />
          <Button
            className="shrink-0"
            disabled={saving || !draft.trim()}
            onClick={() => void addDomain()}
          >
            {t("remoteImages.add")}
          </Button>
        </div>
      </div>
      {/* 列表区（白底） */}
      {domains === null ? (
        <div className="border-t border-border" aria-busy="true">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex items-center px-4 py-2.5">
              <Skeleton className="h-3.5 w-1/3" />
            </div>
          ))}
        </div>
      ) : domains.length === 0 ? (
        <Empty className="rounded-none border-t border-solid border-border">
          <EmptyMedia variant="icon">
            <ImageOffIcon aria-hidden />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t("remoteImages.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("remoteImages.emptyHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {domains.map((d) => (
            <li key={d} className="flex items-center gap-2 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={d}>
                {d}
              </span>
              {/* 移除：常显、安静（次要色；hover 变前景）——行内容少，隐身会让行右侧空落 */}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("remoteImages.remove", { domain: d })}
                title={t("remoteImages.remove", { domain: d })}
                disabled={saving}
                onClick={() => void removeDomain(d)}
                className="text-muted-foreground hover:text-foreground"
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
      <SignatureSettings />
    </div>
  );
}

/**
 * 邮件签名（2026-10-29 用户要求）：**按发件账号**保存，写邮件选中该账号时自动插入。
 *
 * - 存储走主人偏好 `mail:signatures`（跨设备同步；设置与写信页通过同一 hook 读取）；
 * - 文本是 Markdown，与正文一起渲染/发送；
 * - 自动保存（hook 内部 500ms 防抖），没有「保存」按钮。
 *
 * ⚠ 服务商网页端/企业邮箱的「默认签名」没有 IMAP/SMTP 标准接口可读，这里只存本站自己的
 *   签名；从服务商导入需要另开一条（例如把签名发到指定邮箱再解析）的方案。
 */
/**
 * 一次性签名导入校验码（客户端生成，8 位大写字母/数字，避开易混淆字符）。
 * 不落盘：它只出现在用户自己复制到服务商网页端的主题里；服务端按「15 分钟内、
 * 发件人是该账号」匹配，码本身猜不到。
 */
function makeImportCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `SIG-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}

function SignatureSettings() {
  const t = useTranslations("mail");
  const { ready, prefs, setPref } = useOwnerPreferences();
  const [accounts, setAccounts] = useState<MailAccount[] | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const loadedRef = useRef(false);
  /** 用户已经开始编辑：偏好异步到货时不要再灌一次（会吞掉刚输入的字） */
  const dirtyRef = useRef(false);
  /** 正在导入的账号 / 本次校验码 / 请求进行中 */
  const [importFor, setImportFor] = useState<string | null>(null);
  const [importCode, setImportCode] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchWithTimeout("/api/mail/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: MailAccount[]) => setAccounts(data.filter((a) => a.enabled)))
      .catch(() => setAccounts([]));
  }, []);

  // 偏好到货后灌入一次；之后本组件是编辑中的事实源（输入不被回写打断）
  useEffect(() => {
    if (!ready || loadedRef.current) return;
    loadedRef.current = true;
    if (dirtyRef.current) return;
    const saved = (prefs[PREFERENCE_KEYS.MAIL_SIGNATURES] ?? {}) as Record<string, string>;
    setTexts(saved);
  }, [ready, prefs]);

  const update = useCallback(
    (accountId: string, text: string) => {
      dirtyRef.current = true;
      const next = { ...texts, [accountId]: text };
      setTexts(next);
      setPref(PREFERENCE_KEYS.MAIL_SIGNATURES, next);
    },
    [texts, setPref],
  );

  const startImport = useCallback((accountId: string) => {
    setImportFor(accountId);
    setImportCode(makeImportCode());
    setImporting(false);
  }, []);

  const copySubject = useCallback(
    async (subject: string) => {
      try {
        await navigator.clipboard.writeText(subject);
        toast.add({ title: t("signatures.copied"), type: "success" });
      } catch {
        toast.add({ title: t("signatures.copyFailed"), type: "error" });
      }
    },
    [t],
  );

  const runImport = useCallback(
    async (a: MailAccount) => {
      if (!importCode) return;
      setImporting(true);
      try {
        const res = await fetchWithTimeout(
          "/api/mail/signature/import",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ accountId: a.id, code: importCode }),
          },
          60_000,
        );
        const data = (await res.json().catch(() => null)) as {
          found?: boolean;
          signature?: string;
          html?: string;
          reason?: string;
        } | null;
        if (!res.ok) throw new Error(data?.reason ?? `${res.status}`);
        if (data?.found && (data.signature || data.html)) {
          // 后端已把 cid 内嵌图落盘为站内资源；转 Markdown 时把相对图片地址补成绝对 URL
          const fromHtml = data.html
            ? signatureHtmlToMarkdown(data.html, window.location.origin)
            : "";
          const signature = (fromHtml || data.signature || "").slice(0, 5000).trim();
          if (!signature) {
            toast.add({ title: t("signatures.importEmpty"), type: "error" });
            return;
          }
          update(a.id, signature);
          setImportFor(null);
          toast.add({ title: t("signatures.imported"), type: "success" });
          return;
        }
        const message =
          data?.reason === "from_mismatch"
            ? t("signatures.importFromMismatch")
            : data?.reason === "empty"
              ? t("signatures.importEmpty")
              : data?.reason === "sync_failed"
                ? t("signatures.importSyncFailed")
                : t("signatures.importNotFound");
        toast.add({ title: message, type: "error" });
      } catch (err) {
        toast.add({
          title: t("signatures.importError"),
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        });
      } finally {
        setImporting(false);
      }
    },
    [importCode, t, update],
  );

  return (
    <section
      data-slot="mail-signatures"
      className="max-w-2xl overflow-hidden rounded-xl border border-border"
    >
      <div className="flex flex-col gap-1 p-4">
        <h2 className="text-base font-semibold">{t("signatures.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("signatures.description")}</p>
      </div>
      {accounts === null ? (
        <div className="border-t border-border" aria-busy="true">
          {Array.from({ length: 1 }, (_, i) => (
            <div key={i} className="flex items-center px-4 py-2.5">
              <Skeleton className="h-3.5 w-1/3" />
            </div>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <Empty className="rounded-none border-t border-solid border-border">
          <EmptyMedia variant="icon">
            <PenLineIcon aria-hidden />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t("signatures.empty")}</EmptyTitle>
            <EmptyDescription>{t("signatures.emptyHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  {accountDisplayName(a) ? (
                    <span className="text-sm font-medium">{accountDisplayName(a)}</span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">{a.email}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startImport(a.id)}
                  disabled={importing}
                  data-slot="signature-import-trigger"
                >
                  <DownloadIcon data-icon="default" />
                  {t("signatures.import")}
                </Button>
              </div>
              <Textarea
                value={texts[a.id] ?? ""}
                onChange={(e) => update(a.id, e.target.value)}
                placeholder={t("signatures.placeholder")}
                rows={4}
                className="min-h-24 text-sm"
              />
              <p className="text-xs text-muted-foreground">{t("signatures.hint")}</p>

              {importFor === a.id && (
                <div
                  data-slot="signature-import-panel"
                  className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground"
                >
                  <p>{t("signatures.importStep", { email: a.email })}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="select-all rounded bg-background px-1.5 py-0.5 font-mono text-xs text-foreground">
                      [webmail-signature] {importCode}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void copySubject(`[webmail-signature] ${importCode}`)
                      }
                    >
                      <CopyIcon data-icon="default" />
                      {t("signatures.copySubject")}
                    </Button>
                  </div>
                  <p>{t("signatures.importBodyHint")}</p>
                  <p>{t("signatures.importPlain")}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => void runImport(a)} disabled={importing}>
                      {importing ? <Spinner /> : <DownloadIcon data-icon="default" />}
                      {importing ? t("signatures.importing") : t("signatures.importButton")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setImportFor(null)}
                      disabled={importing}
                    >
                      {t("signatures.importCancel")}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
