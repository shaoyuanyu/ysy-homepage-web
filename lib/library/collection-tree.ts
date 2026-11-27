import type { CollectionNode } from "@/lib/library/types";

/**
 * 集合树的纯函数工具（无 React、无 fetch）。
 *
 * 集合管理的拖拽排序 / 层级移动 / 搜索 / 删除确认都建立在这组函数上：
 * 先把 UI 的意图算成一棵**新树**（乐观更新），再把顺序差异换算成 paperdb 的
 * `POST /collections/{id}/move` 调用。逻辑留在这里是为了能脱离组件推理，
 * 也让 `CollectionsPanel` 只负责状态与事件。
 */

/** 排序位置的步长。拖拽时插到相邻两者中间取中点，避免每次都重排所有兄弟。 */
export const POSITION_GAP = 1000;

export interface LocatedCollection {
  node: CollectionNode;
  parentId: string | null;
  index: number;
  depth: number;
}

/** 在树里定位一个集合（含父级 id、在兄弟中的下标、深度）。 */
export function locateCollection(
  nodes: CollectionNode[],
  id: string,
  parentId: string | null = null,
  depth = 0,
): LocatedCollection | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === id) return { node, parentId, index, depth };
    const found = locateCollection(node.children, id, node.id, depth + 1);
    if (found) return found;
  }
  return null;
}

/** 某个父级下的直接子集合（parentId 为 null 即根级）。 */
export function childrenOf(
  nodes: CollectionNode[],
  parentId: string | null,
): CollectionNode[] {
  if (parentId === null) return nodes;
  return locateCollection(nodes, parentId)?.node.children ?? [];
}

export function walkCollections(
  nodes: CollectionNode[],
  visit: (node: CollectionNode, depth: number, parentId: string | null) => void,
  depth = 0,
  parentId: string | null = null,
): void {
  for (const node of nodes) {
    visit(node, depth, parentId);
    walkCollections(node.children, visit, depth + 1, node.id);
  }
}

export function countCollections(nodes: CollectionNode[]): number {
  let total = 0;
  walkCollections(nodes, () => {
    total += 1;
  });
  return total;
}

/** 自身 + 全部后代 id：拖拽时用来禁止把集合放进自己的子树。 */
export function subtreeIds(node: CollectionNode): Set<string> {
  const ids = new Set<string>([node.id]);
  walkCollections(node.children, (child) => ids.add(child.id));
  return ids;
}

/** 从树里摘掉一个节点，返回新树与被摘下的节点（不改原树）。 */
export function removeCollection(
  nodes: CollectionNode[],
  id: string,
): { tree: CollectionNode[]; removed: CollectionNode | null } {
  let removed: CollectionNode | null = null;
  const visit = (list: CollectionNode[]): CollectionNode[] => {
    const next: CollectionNode[] = [];
    for (const node of list) {
      if (node.id === id) {
        removed = node;
        continue;
      }
      next.push({ ...node, children: visit(node.children) });
    }
    return next;
  };
  const tree = visit(nodes);
  return { tree, removed };
}

function insertAt(list: CollectionNode[], node: CollectionNode, index: number): CollectionNode[] {
  const next = [...list];
  const at = Math.max(0, Math.min(index, next.length));
  next.splice(at, 0, node);
  return next;
}

/** 把节点插进指定父级的下标处（index 以插入前的兄弟列表计），返回新树。 */
export function insertCollection(
  nodes: CollectionNode[],
  node: CollectionNode,
  parentId: string | null,
  index: number,
): CollectionNode[] {
  if (parentId === null) return insertAt(nodes, node, index);
  return nodes.map((item) => ({
    ...item,
    children:
      item.id === parentId
        ? insertAt(item.children, node, index)
        : insertCollection(item.children, node, parentId, index),
  }));
}

/**
 * 移动节点：`index` 是**摘掉节点之后**目标兄弟列表里的下标。
 * 返回新树与移动后的节点；节点不存在时返回 null。
 */
export function moveCollection(
  nodes: CollectionNode[],
  id: string,
  parentId: string | null,
  index: number,
): { tree: CollectionNode[]; node: CollectionNode } | null {
  const { tree, removed } = removeCollection(nodes, id);
  if (!removed) return null;
  return { tree: insertCollection(tree, removed, parentId, index), node: removed };
}

/** 搜索集合：自身命中则保留整棵子树；仅后代命中则只保留命中的分支。 */
export function filterCollections(nodes: CollectionNode[], query: string): CollectionNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return nodes;
  const result: CollectionNode[] = [];
  for (const node of nodes) {
    const selfMatches =
      node.name.toLowerCase().includes(needle) ||
      (node.description ?? "").toLowerCase().includes(needle);
    const children = filterCollections(node.children, query);
    if (selfMatches) result.push(node);
    else if (children.length > 0) result.push({ ...node, children });
  }
  return result;
}

export interface CollectionOption {
  id: string;
  label: string;
  name: string;
  depth: number;
}

/** 父集合下拉的选项：用「— 」显式表达层级（文本节点里的连续空格会被折叠）。 */
export function collectionOptions(
  nodes: CollectionNode[],
  excludeIds?: Set<string>,
): CollectionOption[] {
  const options: CollectionOption[] = [];
  walkCollections(nodes, (node, depth) => {
    if (excludeIds?.has(node.id)) return;
    options.push(
      { id: node.id, label: `${"— ".repeat(depth)}${node.name}`, name: node.name, depth },
    );
  });
  // 拖拽排序的信息在树里更直观，但下拉需要深度优先顺序；上面的遍历已是深度优先。
  return options;
}

export interface PositionPlan {
  /** 被移动集合的新位置。 */
  position: number;
  /** 目标父级下（不含被移动集合）需要改位置的兄弟。 */
  updates: { id: string; position: number }[];
  /**
   * 目标父级移动完成后的完整位置表（含被移动集合）。
   * 乐观更新时一次性写回本地树，之后的拖拽就能继续按真实位置取中点。
   */
  positions: Record<string, number>;
}

/**
 * 计算 `tree` 里已经落到 `parentId` 下的集合 `id` 需要的新 position。
 *
 * paperdb 只接受整数 position，且 `move` 不会重排兄弟。这里用 1000 的步长留出
 * 插入空间：通常只需移动一个集合；只有相邻两者之间没有空隙（首次拖拽，创建时
 * 位置是 0/1/2…）才把该层重排成 0/1000/2000…（最多 N 次请求，仅一次）。
 */
export function planPlacement(
  tree: CollectionNode[],
  id: string,
  parentId: string | null,
): PositionPlan {
  const siblings = childrenOf(tree, parentId);
  const index = siblings.findIndex((node) => node.id === id);
  if (index < 0) {
    return { position: 0, updates: [], positions: {} };
  }
  const prev = index > 0 ? siblings[index - 1] : undefined;
  const next = index < siblings.length - 1 ? siblings[index + 1] : undefined;
  let position: number | null = null;
  if (!prev && !next) position = 0;
  else if (!prev && next) position = next.position - POSITION_GAP;
  else if (prev && !next) position = prev.position + POSITION_GAP;
  else if (prev && next && next.position - prev.position > 1) {
    position = Math.floor((prev.position + next.position) / 2);
  }

  if (position === null) {
    // 没有空隙：整层重排。新位置按当前顺序 * POSITION_GAP。
    const positions: Record<string, number> = {};
    siblings.forEach((node, order) => {
      positions[node.id] = order * POSITION_GAP;
    });
    return {
      position: positions[id],
      updates: siblings
        .filter((node) => node.id !== id && node.position !== positions[node.id])
        .map((node) => ({ id: node.id, position: positions[node.id] })),
      positions,
    };
  }

  const positions: Record<string, number> = {};
  siblings.forEach((node) => {
    positions[node.id] = node.position;
  });
  positions[id] = position;
  return { position, updates: [], positions };
}

/** 把 `positions` 写回树（用于乐观更新后保持本地位置与服务器一致）。 */
export function applyPositions(
  nodes: CollectionNode[],
  positions: Record<string, number>,
): CollectionNode[] {
  return nodes.map((node) => ({
    ...node,
    position: positions[node.id] ?? node.position,
    children: applyPositions(node.children, positions),
  }));
}

/** 行内「上移/下移」的落位目标（下标的语义与 `applyMove` 的 rawIndex 一致）。 */
export function siblingTargetIndex(
  nodes: CollectionNode[],
  id: string,
  direction: -1 | 1,
): { parentId: string | null; index: number; label: string } | null {
  const located = locateCollection(nodes, id);
  if (!located) return null;
  const siblings = childrenOf(nodes, located.parentId);
  const target = located.index + direction;
  if (target < 0 || target >= siblings.length) return null;
  const sibling = siblings[target];
  // 返回「摘掉自身前」的落位下标（`applyMove` 会按同父级再做一次左移修正）：
  // 上移 = 插到 target 之前（target）；下移 = 插到 target 之后（target + 1）。
  return {
    parentId: located.parentId,
    index: direction === 1 ? target + 1 : target,
    label: sibling.name,
  };
}
