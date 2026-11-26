"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FolderPlus, FolderTree } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteDialog } from "@/components/library/delete-dialog";
import { RenameDialog } from "@/components/library/rename-dialog";
import { Link } from "@/lib/i18n/navigation";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import type { CollectionNode } from "@/lib/library/types";

function flatten(nodes: CollectionNode[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((node) => [
    // <option> 里的连续空格会被浏览器折叠，用「— 」显式表达层级
    { id: node.id, label: `${"— ".repeat(depth)}${node.name}` },
    ...flatten(node.children, depth + 1),
  ]);
}

function Rows({
  nodes,
  onDelete,
  onRename,
}: {
  nodes: CollectionNode[];
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
}) {
  const t = useTranslations("library");
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id}>
          <div className="flex items-center gap-2 border-t py-2 text-sm transition-colors first:border-t-0 hover:bg-accent/20">
            <FolderTree className="size-4 shrink-0 text-muted-foreground" />
            <Link
              href={`/library?collection=${node.id}`}
              className="min-w-0 truncate font-medium hover:underline hover:underline-offset-2"
            >
              {node.name}
            </Link>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {t("countPapers", { count: node.totalCount })}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-0.5">
              <RenameDialog value={node.name} onRename={(name) => onRename(node.id, name)} />
              <DeleteDialog
                label={node.name}
                description={t("deleteCollectionHint")}
                onDelete={() => onDelete(node.id)}
              />
            </span>
          </div>
          {node.children.length > 0 && (
            <div className="ml-4 border-l pl-3">
              <Rows nodes={node.children} onDelete={onDelete} onRename={onRename} />
            </div>
          )}
        </div>
      ))}
    </>
  );
}

export function CollectionsPanel({ tree }: { tree: CollectionNode[] }) {
  const t = useTranslations("library");
  const router = useRouter();
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = flatten(tree);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await libraryApi("/collections", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), parentId: parent || null }),
      });
      setName("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id: string, next: string) => {
    await libraryApi(`/collections/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: next }),
    });
    router.refresh();
  };

  const remove = async (id: string) => {
    await libraryApi(`/collections/${id}?mode=promote`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <section className="rounded-xl border bg-card/40 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FolderPlus className="size-4" /> {t("newCollection")}</h3>
        <div className="flex flex-col gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("collectionName")}
            aria-label={t("collectionName")}
          />
          <select
            value={parent}
            onChange={(event) => setParent(event.target.value)}
            aria-label={t("rootCollection")}
            className="h-8 w-full rounded-lg border-2 border-input bg-transparent px-2 pr-6 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
          >
            <option value="">{t("rootCollection")}</option>
            {options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
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
          <FolderTree className="size-4" /> {t("collections")}
          <span className="text-xs font-normal tabular-nums text-muted-foreground">
            {options.length}
          </span>
        </h3>
        {tree.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed px-4 py-10 text-center">
            <FolderTree className="size-5 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">{t("noCollections")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t("noCollectionsHint")}</p>
          </div>
        ) : (
          <Rows nodes={tree} onDelete={remove} onRename={rename} />
        )}
      </section>
    </div>
  );
}
