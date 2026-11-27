"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { CollectionNode, Project } from "@/lib/library/types";

/**
 * 文献库的“归类数据”上下文：集合树与项目列表在 layout 里已经加载过一次，
 * 列表行、批量条、归类弹窗都用同一份，避免每行/每次操作重复请求。
 *
 * `router.refresh()` 会连同 layout 一起刷新，所以这里的数据在保存后是新的。
 */
interface LibraryOrganizeValue {
  collections: CollectionNode[];
  projects: Project[];
}

const LibraryOrganizeContext = createContext<LibraryOrganizeValue>({
  collections: [],
  projects: [],
});

export function LibraryOrganizeProvider({
  collections,
  projects,
  children,
}: LibraryOrganizeValue & { children: ReactNode }) {
  return (
    <LibraryOrganizeContext.Provider value={{ collections, projects }}>
      {children}
    </LibraryOrganizeContext.Provider>
  );
}

export function useLibraryOrganize(): LibraryOrganizeValue {
  return useContext(LibraryOrganizeContext);
}
