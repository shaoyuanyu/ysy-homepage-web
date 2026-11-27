"use client";

import { useTranslations } from "next-intl";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  FolderInput,
  FolderPlus,
  FolderTree,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/lib/i18n/navigation";
import type { CollectionNode } from "@/lib/library/types";
import { cn } from "@/lib/utils";

export type CollectionDropZone = "before" | "into" | "after";

export interface CollectionDropHint {
  id: string;
  zone: CollectionDropZone;
}

export interface CollectionTreeActions {
  onEdit: (node: CollectionNode) => void;
  onCreateChild: (node: CollectionNode) => void;
  onMove: (node: CollectionNode) => void;
  onDelete: (node: CollectionNode) => void;
  onMoveUp: (node: CollectionNode) => void;
  onMoveDown: (node: CollectionNode) => void;
  canMoveUp: (node: CollectionNode) => boolean;
  canMoveDown: (node: CollectionNode) => boolean;
  onToggle: (node: CollectionNode) => void;
}

export interface CollectionTreeProps {
  nodes: CollectionNode[];
  collapsedIds: ReadonlySet<string>;
  searching: boolean;
  draggingId: string | null;
  dropHint: CollectionDropHint | null;
  /** 拖拽/排序请求进行中：锁住第二笔操作，避免两套乐观状态互相覆盖。 */
  busy: boolean;
  actions: CollectionTreeActions;
  onDragStart: (event: React.DragEvent<HTMLElement>, node: CollectionNode) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLElement>, node: CollectionNode) => void;
  onDragLeave: (event: React.DragEvent<HTMLElement>, node: CollectionNode) => void;
  onDrop: (event: React.DragEvent<HTMLElement>, node: CollectionNode) => void;
}

/**
 * 集合树。
 *
 * 拖拽交互约定（与 `CollectionsPanel` 的 `zoneFor` 对应）：
 * - 行的上 28% = 放到该行**前面**（成为同一父级的兄弟）；
 * - 中间 44% = **移入**该集合成为子级；
 * - 下 28% = 放到该行**后面**。
 * 只把事件挂在「标题行」上，子级列表是它的兄弟节点，不会因冒泡误命中父行。
 */
export function CollectionTree(props: CollectionTreeProps) {
  const { nodes, ...rest } = props;
  if (nodes.length === 0) return null;
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => (
        <CollectionBranch key={node.id} node={node} {...rest} />
      ))}
    </ul>
  );
}

function CollectionBranch({
  node,
  collapsedIds,
  searching,
  draggingId,
  dropHint,
  busy,
  actions,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: Omit<CollectionTreeProps, "nodes"> & { node: CollectionNode }) {
  const t = useTranslations("library");
  const expanded = searching || !collapsedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const dragging = draggingId === node.id;
  const hint = dropHint?.id === node.id ? dropHint.zone : null;
  const canMoveUp = actions.canMoveUp(node);
  const canMoveDown = actions.canMoveDown(node);
  const label = node.name;

  return (
    <li>
      <div
        data-slot="collection-row"
        data-collection-id={node.id}
        data-drop-zone={hint ?? undefined}
        onDragOver={(event) => onDragOver(event, node)}
        onDragLeave={(event) => onDragLeave(event, node)}
        onDrop={(event) => onDrop(event, node)}
        className={cn(
          "group/collection relative flex items-start gap-1 rounded-lg border border-transparent py-1.5 pr-1 pl-0.5 transition-colors",
          "hover:bg-accent/25",
          dragging && "opacity-45",
          hint === "into" && "border-brand/40 bg-brand/[0.06] hover:bg-brand/[0.06]",
        )}
      >
        {hint === "before" && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded-full bg-brand"
          />
        )}
        {hint === "after" && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-brand"
          />
        )}

        {/* 拖拽把手只是鼠标/触屏板的手势入口：键盘与触屏请走行尾菜单，
            因此不进入 Tab 序列（避免一个按了没反应的焦点停靠点）。 */}
        <span
          draggable={!busy && !searching}
          onDragStart={(event) => onDragStart(event, node)}
          onDragEnd={onDragEnd}
          aria-hidden="true"
          title={searching ? t("dragDisabledHint") : t("dragHint")}
          className={cn(
            "mt-1 hidden shrink-0 rounded p-0.5 text-muted-foreground/40 select-none sm:inline-flex",
            "hover:bg-accent hover:text-foreground",
            busy || searching ? "cursor-not-allowed opacity-40" : "cursor-grab active:cursor-grabbing",
          )}
        >
          <GripVertical className="size-3.5" />
        </span>

        {hasChildren ? (
          <button
            type="button"
            onClick={() => actions.onToggle(node)}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? t("collapseCollection", { name: label })
                : t("expandCollection", { name: label })
            }
            className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            <ChevronRight
              aria-hidden
              className={cn("size-3.5 transition-transform", expanded && "rotate-90")}
            />
          </button>
        ) : (
          <span aria-hidden className="size-5 shrink-0" />
        )}

        <FolderTree aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

        <div className="min-w-0 flex-1">
          <Link
            href={`/library?collection=${node.id}`}
            title={node.name}
            className="block truncate text-sm font-medium underline-offset-2 hover:underline"
          >
            {node.name}
          </Link>
          {node.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground/80" title={node.description}>
              {node.description}
            </p>
          )}
        </div>

        <span
          className="mt-0.5 shrink-0 text-xs tabular-nums text-muted-foreground"
          title={t("paperCountHint", { total: node.totalCount, own: node.paperCount })}
        >
          {t("countPapers", { count: node.totalCount })}
        </span>

        <span className="mt-0.5 ml-0.5 flex shrink-0 items-center gap-0.5">
          <span className="hidden items-center gap-0.5 sm:flex">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("editCollectionNamed", { name: label })}
              title={t("editCollection")}
              onClick={() => actions.onEdit(node)}
            >
              <Pencil aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("deleteNamed", { name: label })}
              title={t("delete")}
              onClick={() => actions.onDelete(node)}
            >
              <Trash2 aria-hidden />
            </Button>
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("collectionActions", { name: label })}
                  title={t("collectionActions", { name: label })}
                  aria-haspopup="menu"
                >
                  <MoreHorizontal aria-hidden />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => actions.onEdit(node)}>
                <Pencil aria-hidden /> {t("editCollection")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.onCreateChild(node)}>
                <FolderPlus aria-hidden /> {t("addSubcollection")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.onMove(node)}>
                <FolderInput aria-hidden /> {t("moveCollection")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!canMoveUp}
                onClick={() => actions.onMoveUp(node)}
              >
                <ArrowUp aria-hidden /> {t("moveUp")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canMoveDown}
                onClick={() => actions.onMoveDown(node)}
              >
                <ArrowDown aria-hidden /> {t("moveDown")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => actions.onDelete(node)}>
                <Trash2 aria-hidden /> {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>

      {hasChildren && expanded && (
        <ul className="ml-3 border-l pl-2">
          {node.children.map((child) => (
            <CollectionBranch
              key={child.id}
              node={child}
              collapsedIds={collapsedIds}
              searching={searching}
              draggingId={draggingId}
              dropHint={dropHint}
              busy={busy}
              actions={actions}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
