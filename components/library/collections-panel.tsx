"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  FoldVertical,
  FolderPlus,
  FolderTree,
  SearchX,
  UnfoldVertical,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  CollectionCreateDialog,
  CollectionDeleteDialog,
  CollectionEditDialog,
  CollectionMoveDialog,
} from "@/components/library/collection-dialogs";
import {
  CollectionTree,
  type CollectionDropHint,
  type CollectionDropZone,
  type CollectionTreeActions,
} from "@/components/library/collection-tree";
import {
  createCollectionRequest,
  deleteCollectionRequest,
  persistPlacement,
  updateCollectionRequest,
} from "@/lib/library/collection-actions";
import {
  childrenOf,
  collectionOptions,
  countCollections,
  filterCollections,
  locateCollection,
  moveCollection,
  planPlacement,
  applyPositions,
  siblingTargetIndex,
  subtreeIds,
} from "@/lib/library/collection-tree";
import type { CollectionNode } from "@/lib/library/types";
import { cn } from "@/lib/utils";

type DialogState =
  | { kind: "create"; parentId: string | null }
  | { kind: "edit"; id: string }
  | { kind: "move"; id: string }
  | { kind: "delete"; id: string }
  | null;

function errorText(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

/**
 * 集合管理面板。
 *
 * 拖拽/移动的落位算法在 `lib/library/collection-tree.ts`（纯函数），写请求在
 * `lib/library/collection-actions.ts`。这里只做三件事：
 * 1. 维护「乐观树 + 忙碌锁」，失败整棵树回滚；
 * 2. 把拖拽事件换算成 `(集合, 目标父级, 下标)`；
 * 3. 串联新建/编辑/移动/删除四个弹窗。
 *
 * 交互取舍：桌面用原生 HTML5 拖拽（不引入 dnd-kit，项目此前刻意没有拖拽库）；
 * 触屏没有可靠的 HTML5 DnD，走行尾菜单的「上移/下移/移动到…」等价路径。
 */
export function CollectionsPanel({ tree }: { tree: CollectionNode[] }) {
  const t = useTranslations("library");
  const router = useRouter();

  const [nodes, setNodes] = useState<CollectionNode[]>(tree);
  const [query, setQuery] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<CollectionDropHint | null>(null);
  const [rootActive, setRootActive] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parent, setParent] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 服务端树在 router.refresh() 后换新；忙碌期间不能用它覆盖乐观树（会闪回旧顺序）。
  useEffect(() => {
    if (!busyRef.current) setNodes(tree);
  }, [tree]);

  const searching = query.trim().length > 0;
  const visible = filterCollections(nodes, query);
  const total = countCollections(nodes);
  const matches = countCollections(visible);

  const dialogNode =
    dialog && dialog.kind !== "create" ? locateCollection(nodes, dialog.id)?.node ?? null : null;
  const dialogParent =
    dialog?.kind === "create" && dialog.parentId
      ? locateCollection(nodes, dialog.parentId)?.node ?? null
      : null;

  const options = collectionOptions(nodes);
  const createParentItems = [
    { value: "root", label: t("rootCollection") },
    ...options.map((item) => ({ value: item.id, label: item.label })),
  ];

  const moveOptions = dialog?.kind === "move" && dialogNode
    ? collectionOptions(nodes, subtreeIds(dialogNode)).map((item) => ({
        id: item.id,
        label: item.label,
      }))
    : [];

  const expand = (id: string | null) => {
    if (!id) return;
    setCollapsedIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const toggle = (node: CollectionNode) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  };

  const refresh = () => router.refresh();

  const runMutation = async (task: () => Promise<void>, onError?: () => void) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
      refresh();
    } catch (caught) {
      onError?.();
      toast.add({ title: errorText(caught, t("actionFailed")), type: "error" });
      // 失败时也拉一次服务端状态：落位是多次请求，可能只成功了一部分，
      // 本地回滚的快照未必等于服务端现状。
      refresh();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** 把集合放进目标父级的第 rawIndex 位（下标以当前树、摘掉节点前计）。 */
  const applyMove = (id: string, parentId: string | null, rawIndex: number) => {
    if (busyRef.current) return;
    const located = locateCollection(nodes, id);
    if (!located) return;
    if (parentId !== null && subtreeIds(located.node).has(parentId)) return;

    let index = rawIndex;
    if (located.parentId === parentId && located.index < rawIndex) index -= 1;
    if (located.parentId === parentId && located.index === index) return;

    const snapshot = nodes;
    const moved = moveCollection(nodes, id, parentId, index);
    if (!moved) return;
    const plan = planPlacement(moved.tree, id, parentId);
    const next = applyPositions(moved.tree, plan.positions);
    setNodes(next);
    expand(parentId);
    setAnnouncement(t("collectionMoved", { name: located.node.name }));

    void runMutation(
      () => persistPlacement(id, parentId, plan),
      () => {
        setNodes(snapshot);
        setAnnouncement(t("moveFailed"));
      },
    );
  };

  const moveInParent = (node: CollectionNode, direction: -1 | 1) => {
    const target = siblingTargetIndex(nodes, node.id, direction);
    if (!target) return;
    applyMove(node.id, target.parentId, target.index);
  };

  const clearDrag = () => {
    setDraggingId(null);
    setDropHint(null);
    setRootActive(false);
  };

  const dragNode = draggingId ? locateCollection(nodes, draggingId)?.node ?? null : null;

  const zoneFor = (
    event: React.DragEvent<HTMLElement>,
    node: CollectionNode,
  ): CollectionDropZone | null => {
    if (!dragNode || node.id === dragNode.id) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.height <= 0) return null;
    const ratio = (event.clientY - rect.top) / rect.height;
    const zone: CollectionDropZone = ratio < 0.28 ? "before" : ratio > 0.72 ? "after" : "into";
    const located = locateCollection(nodes, node.id);
    const parentId = zone === "into" ? node.id : located?.parentId ?? null;
    if (parentId !== null && subtreeIds(dragNode).has(parentId)) return null;
    return zone;
  };

  const handleDragStart = (event: React.DragEvent<HTMLElement>, node: CollectionNode) => {
    if (busyRef.current || searching) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.id);
    const row = (event.currentTarget as HTMLElement).closest('[data-slot="collection-row"]');
    if (row instanceof HTMLElement) event.dataTransfer.setDragImage(row, 16, 16);
    setDraggingId(node.id);
    setDropHint(null);
    setRootActive(false);
  };

  const handleDragOver = (event: React.DragEvent<HTMLElement>, node: CollectionNode) => {
    const zone = zoneFor(event, node);
    if (!zone) {
      if (dropHint?.id === node.id) setDropHint(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (dropHint?.id !== node.id || dropHint.zone !== zone) {
      setDropHint({ id: node.id, zone });
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLElement>, node: CollectionNode) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setDropHint((current) => (current?.id === node.id ? null : current));
  };

  const dropOnNode = (event: React.DragEvent<HTMLElement>, node: CollectionNode) => {
    event.preventDefault();
    event.stopPropagation();
    const zone = dropHint?.id === node.id ? dropHint.zone : zoneFor(event, node);
    clearDrag();
    if (!zone || !dragNode) return;
    const located = locateCollection(nodes, node.id);
    if (!located) return;
    const parentId = zone === "into" ? node.id : located.parentId;
    const rawIndex =
      zone === "into" ? node.children.length : located.index + (zone === "after" ? 1 : 0);
    applyMove(dragNode.id, parentId, rawIndex);
  };

  const dropOnRoot = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!dragNode) return;
    const id = dragNode.id;
    clearDrag();
    applyMove(id, null, childrenOf(nodes, null).length);
  };

  const createInline = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setFormError(null);
    try {
      await createCollectionRequest({
        name: trimmed,
        parentId: parent || null,
        description,
      });
      setName("");
      setDescription("");
      expand(parent || null);
      toast.add({ title: t("collectionCreated"), type: "success" });
      refresh();
    } catch (caught) {
      setFormError(errorText(caught, t("actionFailed")));
    } finally {
      setCreating(false);
    }
  };

  const createInDialog = async (input: { name: string; description: string }) => {
    const parentId = dialog?.kind === "create" ? dialog.parentId : null;
    await createCollectionRequest({ ...input, parentId });
    expand(parentId);
    toast.add({ title: t("collectionCreated"), type: "success" });
    refresh();
  };

  const editInDialog = async (input: { name: string; description: string }) => {
    if (dialog?.kind !== "edit") return;
    const id = dialog.id;
    await updateCollectionRequest(id, input);
    const patch = (list: CollectionNode[]): CollectionNode[] =>
      list.map((node) =>
        node.id === id
          ? { ...node, name: input.name, description: input.description || null }
          : { ...node, children: patch(node.children) },
      );
    setNodes(patch);
    toast.add({ title: t("collectionUpdated"), type: "success" });
    refresh();
  };

  const moveInDialog = async (parentId: string | null) => {
    if (dialog?.kind !== "move") return;
    const id = dialog.id;
    const located = locateCollection(nodes, id);
    if (!located) return;
    const rawIndex = childrenOf(nodes, parentId).length;
    let index = rawIndex;
    if (located.parentId === parentId && located.index < rawIndex) index -= 1;
    if (located.parentId === parentId && located.index === index) return;
    const snapshot = nodes;
    const moved = moveCollection(nodes, id, parentId, index);
    if (!moved) return;
    const plan = planPlacement(moved.tree, id, parentId);
    setNodes(applyPositions(moved.tree, plan.positions));
    expand(parentId);
    try {
      await persistPlacement(id, parentId, plan);
      refresh();
    } catch (caught) {
      setNodes(snapshot);
      throw caught;
    }
  };

  const deleteInDialog = async (mode: "promote" | "discard") => {
    if (dialog?.kind !== "delete") return;
    const id = dialog.id;
    const label = dialogNode?.name ?? "";
    await deleteCollectionRequest(id, mode);
    // promote：子集合提升到父级（保持顺序）；discard：整棵子树一起消失。
    const nextTree = (list: CollectionNode[]): CollectionNode[] => {
      const next: CollectionNode[] = [];
      for (const node of list) {
        if (node.id === id) {
          if (mode === "promote") next.push(...node.children);
          continue;
        }
        next.push({ ...node, children: nextTree(node.children) });
      }
      return next;
    };
    setNodes(nextTree);
    setAnnouncement(t("collectionDeletedNamed", { name: label }));
    toast.add({ title: t("collectionDeleted"), type: "success" });
    refresh();
  };

  const actions: CollectionTreeActions = {
    onEdit: (node) => setDialog({ kind: "edit", id: node.id }),
    onCreateChild: (node) => setDialog({ kind: "create", parentId: node.id }),
    onMove: (node) => setDialog({ kind: "move", id: node.id }),
    onDelete: (node) => setDialog({ kind: "delete", id: node.id }),
    onMoveUp: (node) => moveInParent(node, -1),
    onMoveDown: (node) => moveInParent(node, 1),
    canMoveUp: (node) => {
      const located = locateCollection(nodes, node.id);
      return located ? located.index > 0 : false;
    },
    canMoveDown: (node) => {
      const located = locateCollection(nodes, node.id);
      if (!located) return false;
      return located.index < childrenOf(nodes, located.parentId).length - 1;
    },
    onToggle: toggle,
  };

  const collapseAll = () => {
    const ids = new Set<string>();
    const visit = (list: CollectionNode[]) => {
      for (const node of list) {
        if (node.children.length > 0) ids.add(node.id);
        visit(node.children);
      }
    };
    visit(nodes);
    setCollapsedIds(ids);
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <section className="rounded-xl border bg-card/40 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <FolderPlus className="size-4" /> {t("newCollection")}
        </h3>
        <form onSubmit={(event) => void createInline(event)} className="flex flex-col gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("collectionName")}
            aria-label={t("collectionName")}
          />
          <Select
            items={createParentItems}
            value={parent || "root"}
            onValueChange={(next) => setParent(next === "root" ? "" : next ?? "")}
          >
            <SelectTrigger aria-label={t("rootCollection")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {createParentItems.map((item) => (
                <SelectItem key={item.value} value={item.value} label={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("descriptionPlaceholder")}
            aria-label={t("descriptionLabel")}
            rows={2}
            className="min-h-14"
          />
          <Button
            type="submit"
            variant={name.trim() ? "default" : "outline"}
            disabled={creating || !name.trim()}
          >
            {t("create")}
          </Button>
        </form>
        {formError && <p className="mt-2 text-xs text-destructive">{formError}</p>}
      </section>

      <section className="min-w-0 rounded-xl border p-4">
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <FolderTree className="size-4" /> {t("collections")}
            <span className="text-xs font-normal tabular-nums text-muted-foreground">{total}</span>
          </h3>
          <div className="ml-auto flex min-w-0 items-center gap-1">
            <SearchInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("collectionSearchPlaceholder")}
              aria-label={t("collectionSearchPlaceholder")}
              clearLabel={t("clearCollectionSearch")}
              className="w-40 sm:w-56"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setCollapsedIds(new Set())}
              aria-label={t("expandAll")}
              title={t("expandAll")}
            >
              <UnfoldVertical aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={collapseAll}
              aria-label={t("collapseAll")}
              title={t("collapseAll")}
            >
              <FoldVertical aria-hidden />
            </Button>
          </div>
        </div>

        <p className="mb-2 text-xs text-muted-foreground">
          {t("dragHint")}
          {searching && (
            <span className="ml-1 tabular-nums">
              · {t("searchMatches", { count: matches })}
            </span>
          )}
        </p>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

        {nodes.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed px-4 py-10 text-center">
            <FolderTree className="size-5 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">{t("noCollections")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t("noCollectionsHint")}</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed px-4 py-10 text-center">
            <SearchX className="size-5 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">{t("collectionSearchEmpty")}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setQuery("")}
            >
              {t("clearCollectionSearch")}
            </Button>
          </div>
        ) : (
          <CollectionTree
            nodes={visible}
            collapsedIds={collapsedIds}
            searching={searching}
            draggingId={draggingId}
            dropHint={dropHint}
            busy={busy}
            actions={actions}
            onDragStart={handleDragStart}
            onDragEnd={clearDrag}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={dropOnNode}
          />
        )}

        {draggingId && (
          <div
            data-slot="collection-root-drop"
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setRootActive(true);
            }}
            onDragLeave={() => setRootActive(false)}
            onDrop={dropOnRoot}
            className={cn(
              "mt-2 rounded-lg border border-dashed px-3 py-2 text-center text-xs transition-colors",
              rootActive
                ? "border-brand bg-brand/[0.06] text-foreground"
                : "text-muted-foreground",
            )}
          >
            {t("dropRoot")}
          </div>
        )}
      </section>

      <CollectionCreateDialog
        open={dialog?.kind === "create"}
        onOpenChange={(open) => !open && setDialog(null)}
        parent={dialogParent}
        onSubmit={createInDialog}
      />
      <CollectionEditDialog
        open={dialog?.kind === "edit" && dialogNode !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        node={dialogNode}
        onSubmit={editInDialog}
      />
      <CollectionMoveDialog
        open={dialog?.kind === "move" && dialogNode !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        node={dialogNode}
        options={moveOptions}
        onSubmit={moveInDialog}
      />
      <CollectionDeleteDialog
        open={dialog?.kind === "delete" && dialogNode !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        node={dialogNode}
        onSubmit={deleteInDialog}
      />
    </div>
  );
}
