import type { CollectionNode, PaperSummary, Project } from "./types";

export interface ProjectMembership {
  id: string;
  name: string;
  /** 直接置顶在项目里（`project_paper`） */
  pinned: boolean;
  /** 通过项目关联的集合（含子集合）加入 */
  viaCollection: boolean;
}

/**
 * 集合树 → 每个集合的子树 id 集合。
 *
 * 项目关联一个集合时，子集合里的论文也算项目成员（paperdb 的
 * `project_paper_ids` 就是这么算的），所以 UI 判断归属不能只比对直接 id。
 */
export function buildCollectionSubtrees(
  nodes: CollectionNode[],
): Map<string, Set<string>> {
  const subtrees = new Map<string, Set<string>>();
  const visit = (node: CollectionNode): Set<string> => {
    const ids = new Set<string>([node.id]);
    for (const child of node.children) {
      for (const id of visit(child)) ids.add(id);
    }
    subtrees.set(node.id, ids);
    return ids;
  };
  for (const node of nodes) visit(node);
  return subtrees;
}

/** 一篇论文在某个项目里的归属。置顶与集合两条路径相互独立，可能同时成立。 */
export function projectMembership(
  paper: Pick<PaperSummary, "id" | "collections">,
  project: Project,
  subtrees: Map<string, Set<string>>,
): { pinned: boolean; viaCollection: boolean; member: boolean } {
  const pinned = project.paperIds.includes(paper.id);
  const viaCollection = project.collectionIds.some((collectionId) => {
    const scoped = subtrees.get(collectionId);
    // 集合树没取到时退回直接匹配：宁可多显示一个项目，也别把已归属的论文
    // 误判成“未加入”，让用户重复置顶。
    if (!scoped) return paper.collections.includes(collectionId);
    return paper.collections.some((id) => scoped.has(id));
  });
  return { pinned, viaCollection, member: pinned || viaCollection };
}

export interface CollectionOption {
  id: string;
  name: string;
  depth: number;
  totalCount: number;
}

/** 集合树 → 按树顺序展开的选项（用于归类弹窗的层级勾选）。 */
export function flattenCollections(
  nodes: CollectionNode[],
  depth = 0,
  out: CollectionOption[] = [],
): CollectionOption[] {
  for (const node of nodes) {
    out.push({ id: node.id, name: node.name, depth, totalCount: node.totalCount });
    flattenCollections(node.children, depth + 1, out);
  }
  return out;
}

/** 列表行 / 详情页展示用的“这篇论文属于哪儿”。 */
export interface PaperMembershipRef {
  kind: "collection" | "project";
  id: string;
  name: string;
}

export function collectPaperMemberships(
  paper: Pick<PaperSummary, "id" | "collections">,
  collectionNames: Map<string, string>,
  projects: Project[],
  subtrees: Map<string, Set<string>>,
): PaperMembershipRef[] {
  const collections: PaperMembershipRef[] = paper.collections.map((id) => ({
    kind: "collection",
    id,
    name: collectionNames.get(id) ?? id.slice(0, 8),
  }));
  const projectRefs: PaperMembershipRef[] = projects
    .filter((project) => projectMembership(paper, project, subtrees).member)
    .map((project) => ({ kind: "project", id: project.id, name: project.name }));
  return [...collections, ...projectRefs];
}
