import { libraryApi } from "@/lib/library/client";
import type { PositionPlan } from "@/lib/library/collection-tree";

/**
 * 集合的写操作封装。
 *
 * 拖拽排序在 paperdb 侧没有批量接口（只有 `POST /collections/{id}/move`
 * 设置单个集合的 parent + position），所以一次落位可能包含：
 * 1. 目标父级里需要补空隙的兄弟（首次拖拽时重排该层）；
 * 2. 被拖拽的集合本身。
 * 顺序执行、失败即抛出：调用方用整棵树的快照回滚，不会留下半套乐观状态。
 */

export function createCollectionRequest(input: {
  name: string;
  parentId: string | null;
  description?: string;
}): Promise<unknown> {
  return libraryApi("/collections", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      parentId: input.parentId,
      description: input.description?.trim() || null,
    }),
  });
}

export function updateCollectionRequest(
  id: string,
  input: { name: string; description: string },
): Promise<unknown> {
  return libraryApi(`/collections/${id}`, {
    method: "PATCH",
    // 后端只在字段非 null 时写入；清空描述用空串（UI 把空串当未描述）。
    body: JSON.stringify({ name: input.name, description: input.description.trim() }),
  });
}

export function moveCollectionRequest(
  id: string,
  parentId: string | null,
  position: number,
): Promise<unknown> {
  return libraryApi(`/collections/${id}/move`, {
    method: "POST",
    body: JSON.stringify({ parentId, position }),
  });
}

export function deleteCollectionRequest(id: string, mode: "promote" | "discard"): Promise<unknown> {
  return libraryApi(`/collections/${id}?mode=${mode}`, { method: "DELETE" });
}

/** 把一次落位计划写进 paperdb（先补空隙，再移动目标集合）。 */
export async function persistPlacement(
  id: string,
  parentId: string | null,
  plan: PositionPlan,
): Promise<void> {
  for (const update of plan.updates) {
    await moveCollectionRequest(update.id, parentId, update.position);
  }
  await moveCollectionRequest(id, parentId, plan.position);
}
