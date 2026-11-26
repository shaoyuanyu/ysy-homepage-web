"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Activity, Check, Copy, Database, KeyRound, Link2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import type {
  ExportToken,
  ExportTokenCreated,
  Meta,
  Token,
  TokenCreated,
} from "@/lib/library/types";
import { shortDate } from "@/lib/library/format";

const personalScopes = [
  "papers:read",
  "papers:write",
  "organize:write",
  "pdf:read",
  "pdf:write",
  "annotations:write",
  "exports:read",
];

export function SettingsPanel({
  meta,
  tokens: initialTokens,
  exports: initialExports,
}: {
  meta: Meta | null;
  tokens: Token[];
  exports: ExportToken[];
}) {
  const t = useTranslations("library");
  const [tokens, setTokens] = useState(initialTokens);
  const [exportTokens, setExportTokens] = useState(initialExports);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(personalScopes);
  const [created, setCreated] = useState<TokenCreated | null>(null);
  const [exportCreated, setExportCreated] = useState<ExportTokenCreated | null>(null);
  const [exportName, setExportName] = useState("Zotero / Overleaf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const call = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const createToken = () => call(async () => {
    const token = await libraryApi<TokenCreated>("/tokens", {
      method: "POST",
      body: JSON.stringify({ name: name.trim() || "paperdb", scopes }),
    });
    setCreated(token);
    setTokens((current) => [{ ...token, token: undefined } as unknown as Token, ...current]);
    setName("");
  });

  const createExport = () => call(async () => {
    const token = await libraryApi<ExportTokenCreated>("/export-tokens", {
      method: "POST",
      body: JSON.stringify({
        name: exportName,
        scopeType: "library",
        includeAbstract: true,
      }),
    });
    setExportCreated(token);
    setExportTokens((current) => [
      {
        id: token.id,
        name: token.name,
        prefix: token.prefix,
        scopeType: token.scopeType,
        scopeId: token.scopeId,
        includeAbstract: true,
        createdAt: token.createdAt,
        lastAccessedAt: null,
        accessCount: 0,
        revokedAt: null,
      },
      ...current,
    ]);
  });

  const revokeToken = (id: string) => call(async () => {
    await libraryApi(`/tokens/${id}`, { method: "DELETE" });
    setTokens((current) => current.map((token) => token.id === id ? { ...token, revokedAt: new Date().toISOString() } : token));
  });

  const revokeExport = (id: string) => call(async () => {
    await libraryApi(`/export-tokens/${id}`, { method: "DELETE" });
    setExportTokens((current) => current.map((token) => token.id === id ? { ...token, revokedAt: new Date().toISOString() } : token));
  });

  const copy = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>}

      <section className="rounded-xl border p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4" /> {t("paperdbStatus")}
        </h2>
        {meta ? (
          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{t("version")}</dt>
              <dd className="font-mono text-sm">{meta.version}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{t("storage")}</dt>
              <dd className="text-sm">
                {meta.storage.backend} · {(meta.storage.bytesUsed / 1024 / 1024).toFixed(1)} MB
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-muted-foreground">{t("datasets")}</dt>
              <dd className="break-words text-sm">
                {meta.datasets.map((item) => `${item.scheme} ${item.version}`).join(" · ")}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t("backendError")}</p>
        )}
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4" /> {t("personalTokens")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("personalTokensHint")}</p>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{t("tokenName")}</span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-48"
                placeholder="raycast / scripts"
              />
            </label>
            <Button type="button" onClick={() => void createToken()} disabled={busy}>
              {t("createToken")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {personalScopes.map((scope) => {
              const active = scopes.includes(scope);
              return (
                <button
                  key={scope}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setScopes((current) =>
                      current.includes(scope)
                        ? current.filter((item) => item !== scope)
                        : [...current, scope],
                    )
                  }
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 font-mono text-xs transition-colors",
                    active
                      ? "border-foreground/30 bg-foreground/[0.07] font-medium text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {active && <Check className="size-3" />}
                  {scope}
                </button>
              );
            })}
          </div>
        </div>
        {created && (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs">
            <p className="font-medium">{t("tokenOnce")}</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-xs">{created.token}</code>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t("copy")}
                onClick={() => void copy(created.token, "token")}
                className="shrink-0"
              >
                {copied === "token" ? <Check /> : <Copy />}
              </Button>
            </div>
          </div>
        )}
        <div className="mt-3 divide-y text-xs">
          {tokens.map((token) => (
            // 两行：名称/前缀/时间/操作一行，权限列表独占一行（7 个 scope 挤在同一行
            // 会在手机上把名称和日期拆得七零八落）
            <div key={token.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
              <span className="font-medium">{token.name}</span>
              <code className="font-mono text-xs text-muted-foreground">{token.prefix}…</code>
              <span className="ml-auto text-muted-foreground">
                {token.lastUsedAt ? shortDate(token.lastUsedAt) : t("neverUsed")}
              </span>
              {token.revokedAt ? (
                <span className="text-destructive">{t("revoked")}</span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => void revokeToken(token.id)}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  {t("revoke")}
                </Button>
              )}
              <span className="basis-full text-muted-foreground">{token.scopes.join(", ")}</span>
            </div>
          ))}
          {tokens.length === 0 && <p className="py-2 text-muted-foreground">{t("noTokens")}</p>}
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="size-4" /> {t("exportLinks")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("exportLinksHint")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={exportName}
            onChange={(event) => setExportName(event.target.value)}
            className="w-56"
            aria-label={t("createExportLink")}
          />
          <Button type="button" onClick={() => void createExport()} disabled={busy}>
            {t("createExportLink")}
          </Button>
        </div>
        {exportCreated && (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-xs">{exportCreated.url}</code>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t("copy")}
                onClick={() => void copy(exportCreated.url, "export")}
                className="shrink-0"
              >
                {copied === "export" ? <Check /> : <Copy />}
              </Button>
            </div>
          </div>
        )}
        <div className="mt-3 divide-y text-xs">
          {exportTokens.map((token) => (
            <div key={token.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="font-medium">{token.name}</span>
              <span className="text-muted-foreground">{token.scopeType}</span>
              <span className="text-muted-foreground">{t("accessCount", { count: token.accessCount })}</span>
              <span className="ml-auto text-muted-foreground">{shortDate(token.createdAt)}</span>
              {token.revokedAt ? (
                <span className="text-destructive">{t("revoked")}</span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("revoke")}
                  onClick={() => void revokeExport(token.id)}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
          {exportTokens.length === 0 && <p className="py-2 text-muted-foreground">{t("noExportLinks")}</p>}
        </div>
      </section>

      {meta && (
        <section className="rounded-xl border p-4 text-xs">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Database className="size-4" /> {t("datasets")}
          </h2>
          <div className="mt-2 space-y-1">
            {meta.datasets.map((dataset) => (
              <div
                key={`${dataset.scheme}-${dataset.version}`}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="font-mono text-xs font-medium uppercase">{dataset.scheme}</span>
                <span className="tabular-nums">{dataset.version}</span>
                {/* label 与「scheme + version」重复时不再重复打印（上游就是这么给的） */}
                {dataset.label.trim().toLowerCase() !==
                  `${dataset.scheme} ${dataset.version}`.trim().toLowerCase() && (
                  <span className="text-muted-foreground">{dataset.label}</span>
                )}
                {dataset.isCurrent && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                    {t("current")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
