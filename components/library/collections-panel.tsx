"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FolderPlus, Trash2 } from "lucide-react";

import { LibraryApiError, libraryApi } from "@/lib/library/client";
import type { CollectionNode } from "@/lib/library/types";

function flatten(nodes: CollectionNode[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${"  ".repeat(depth)}${node.name}` },
    ...flatten(node.children, depth + 1),
  ]);
}

function Rows({ nodes, onDelete }: { nodes: CollectionNode[]; onDelete: (id: string) => void }) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id}>
          <div className="flex items-center gap-2 border-t py-2 text-sm">
            <span className="font-medium">{node.name}</span>
            <span className="text-xs text-muted-foreground">{node.totalCount} 篇</span>
            <button type="button" onClick={() => onDelete(node.id)} className="ml-auto text-muted-foreground hover:text-destructive" aria-label="delete">
              <Trash2 className="size-3.5" />
            </button>
          </div>
          {node.children.length > 0 && (
            <div className="ml-4 border-l pl-3">
              <Rows nodes={node.children} onDelete={onDelete} />
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

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await libraryApi(`/collections/${id}?mode=promote`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border p-3">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FolderPlus className="size-4" /> {t("newCollection")}</h3>
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("collectionName")} className="h-8 w-52 rounded-md border bg-background px-2 text-xs" />
          <select value={parent} onChange={(event) => setParent(event.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="">{t("rootCollection")}</option>
            {options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <button type="button" onClick={() => void create()} disabled={busy || !name.trim()} className="h-8 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50">{t("create")}</button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </section>
      <section className="rounded-xl border p-3">
        {tree.length === 0 ? <p className="text-xs text-muted-foreground">{t("noCollections")}</p> : <Rows nodes={tree} onDelete={(id) => void remove(id)} />}
      </section>
    </div>
  );
}
