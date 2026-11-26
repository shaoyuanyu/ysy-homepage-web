import type { ReactNode } from "react";

import { requireOwner } from "@/lib/auth/owner";
import { LibraryShell } from "@/components/library/library-shell";
import {
  PaperdbError,
  getCollectionTree,
  getMeta,
  getTagTree,
  listProjects,
  listViews,
  listWorkspaces,
} from "@/lib/library/server";
import type {
  CollectionNode,
  Meta,
  Project,
  ResearchWorkspace,
  SavedView,
  TagNode,
} from "@/lib/library/types";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

async function safe<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

export default async function LibraryLayout({ children }: { children: ReactNode }) {
  await requireOwner();
  let backendError: string | null = null;
  const metaPromise = getMeta().catch((error: unknown) => {
    backendError = error instanceof PaperdbError ? error.message : "paperdb unreachable";
    return null;
  });
  const [meta, collections, views, projects, tags, workspaces] = await Promise.all([
    metaPromise,
    safe<CollectionNode[]>(getCollectionTree, []),
    safe<SavedView[]>(listViews, []),
    safe<Project[]>(listProjects, []),
    safe<TagNode[]>(getTagTree, []),
    safe<ResearchWorkspace[]>(() => listWorkspaces(), []),
  ]);
  const metaValue = meta as Meta | null;
  return (
    <LibraryShell
      collections={collections}
      views={views}
      projects={projects}
      workspaces={workspaces}
      tags={tags}
      meta={metaValue}
      backendError={backendError}
    >
      {children}
    </LibraryShell>
  );
}
