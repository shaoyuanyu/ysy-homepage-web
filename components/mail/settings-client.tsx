"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ImageOffIcon, XIcon } from "lucide-react";

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
import { toast } from "@/components/ui/toast";
import { fetchWithTimeout } from "@/lib/mail/fetch-timeout";

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
  );
}
