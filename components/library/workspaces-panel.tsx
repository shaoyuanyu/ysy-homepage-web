"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FlaskConical, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/lib/i18n/navigation";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import type { ResearchWorkspace } from "@/lib/library/types";

export function WorkspacesPanel({ workspaces }: { workspaces: ResearchWorkspace[] }) {
  const t = useTranslations("library");
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await libraryApi("/workspaces", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      });
      setName("");
      setDescription("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <section className="rounded-xl border bg-card/40 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Plus className="size-4" /> {t("newWorkspace")}
        </h3>
        <div className="flex flex-col gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("workspaceName")}
            aria-label={t("workspaceName")}
          />
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("workspaceDescription")}
            aria-label={t("workspaceDescription")}
          />
          <Button
            type="button"
            variant={name.trim() ? "default" : "outline"}
            onClick={() => void create()}
            disabled={busy || !name.trim()}
          >
            {t("create")}
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </section>

      <section className="rounded-xl border p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <FlaskConical className="size-4" /> {t("researchWorkspaces")}
          <span className="text-xs font-normal tabular-nums text-muted-foreground">
            {workspaces.length}
          </span>
        </h3>
        {workspaces.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed px-4 py-10 text-center">
            <FlaskConical className="size-5 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">{t("noWorkspaces")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t("noWorkspacesHint")}</p>
          </div>
        ) : (
          <div className="divide-y text-sm">
            {workspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="flex flex-wrap items-center gap-2 py-2.5 transition-colors hover:bg-accent/20"
              >
                <FlaskConical className="size-4 shrink-0 text-muted-foreground" />
                <Link
                  href={`/library/workspaces/${workspace.id}`}
                  className="min-w-0 truncate font-medium hover:underline hover:underline-offset-2"
                >
                  {workspace.name}
                </Link>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t("workspacePendingShort", { count: workspace.pendingCount })} ·{" "}
                  {t("workspaceTotalShort", { count: workspace.paperCount })}
                </span>
                <Link
                  href={`/library/workspaces/${workspace.id}`}
                  className="ml-auto text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {t("open")}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
