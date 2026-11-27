import type { TagNode } from "./types";

/** 标签树 → 完整路径列表（用于输入补全与批量移出）。 */
export function flattenTagPaths(nodes: TagNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    out.push(node.path);
    flattenTagPaths(node.children, out);
  }
  return out;
}
