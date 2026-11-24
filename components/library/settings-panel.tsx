"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, KeyRound, Link2, Trash2 } from "lucide-react";

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
        <h2 className="text-sm font-semibold">{t("paperdbStatus")}</h2>
        {meta ? (
          <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
            <div><span className="text-muted-foreground">{t("version")}</span> {meta.version}</div>
            <div><span className="text-muted-foreground">{t("storage")}</span> {meta.storage.backend} · {(meta.storage.bytesUsed / 1024 / 1024).toFixed(1)} MB</div>
            <div><span className="text-muted-foreground">{t("datasets")}</span> {meta.datasets.map((item) => `${item.scheme} ${item.version}`).join(" · ")}</div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t("backendError")}</p>
        )}
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4" /> {t("personalTokens")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("personalTokensHint")}</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">{t("tokenName")}</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="h-8 w-48 rounded-md border bg-background px-2 text-xs" placeholder="raycast / scripts" />
          </label>
          <div className="flex flex-wrap gap-1">
            {personalScopes.map((scope) => (
              <label key={scope} className="inline-flex items-center gap-1 rounded border px-1.5 py-1 text-[10px]">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope])}
                />
                {scope}
              </label>
            ))}
          </div>
          <button type="button" onClick={() => void createToken()} disabled={busy} className="h-8 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50">{t("createToken")}</button>
        </div>
        {created && (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs">
            <p className="font-medium">{t("tokenOnce")}</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-[11px]">{created.token}</code>
              <button type="button" onClick={() => void copy(created.token, "token")} className="shrink-0 rounded border p-1">
                {copied === "token" ? <Check className="size-3" /> : <Copy className="size-3" />}
              </button>
            </div>
          </div>
        )}
        <div className="mt-3 divide-y text-xs">
          {tokens.map((token) => (
            <div key={token.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="font-medium">{token.name}</span>
              <code className="font-mono text-[10px] text-muted-foreground">{token.prefix}…</code>
              <span className="text-muted-foreground">{token.scopes.join(", ")}</span>
              <span className="ml-auto text-muted-foreground">{token.lastUsedAt ? shortDate(token.lastUsedAt) : t("neverUsed")}</span>
              {token.revokedAt ? (
                <span className="text-destructive">{t("revoked")}</span>
              ) : (
                <button type="button" onClick={() => void revokeToken(token.id)} className="text-destructive hover:underline">{t("revoke")}</button>
              )}
            </div>
          ))}
          {tokens.length === 0 && <p className="py-2 text-muted-foreground">{t("noTokens")}</p>}
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="size-4" /> {t("exportLinks")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("exportLinksHint")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={exportName} onChange={(event) => setExportName(event.target.value)} className="h-8 w-56 rounded-md border bg-background px-2 text-xs" />
          <button type="button" onClick={() => void createExport()} disabled={busy} className="h-8 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50">{t("createExportLink")}</button>
        </div>
        {exportCreated && (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-[11px]">{exportCreated.url}</code>
              <button type="button" onClick={() => void copy(exportCreated.url, "export")} className="shrink-0 rounded border p-1">
                {copied === "export" ? <Check className="size-3" /> : <Copy className="size-3" />}
              </button>
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
                <button type="button" onClick={() => void revokeExport(token.id)} className="text-destructive hover:underline"><Trash2 className="size-3" /></button>
              )}
            </div>
          ))}
          {exportTokens.length === 0 && <p className="py-2 text-muted-foreground">{t("noExportLinks")}</p>}
        </div>
      </section>

      {meta && (
        <section className="rounded-xl border p-4 text-xs">
          <h2 className="text-sm font-semibold">{t("datasets")}</h2>
          <div className="mt-2 space-y-1">
            {meta.datasets.map((dataset) => (
              <div key={`${dataset.scheme}-${dataset.version}`} className="flex flex-wrap gap-2">
                <span className="font-medium uppercase">{dataset.scheme}</span>
                <span>{dataset.version}</span>
                <span className="text-muted-foreground">{dataset.label}</span>
                {dataset.isCurrent && <span className="rounded bg-primary/10 px-1 text-primary">{t("current")}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
