import "server-only";

import { PAPERDB_URL, paperdbToken } from "@/lib/library/config";
import type {
  Annotation,
  CitationPage,
  CollectionNode,
  FulltextSearch,
  ImportItem,
  ImportJob,
  ImportPage,
  Job,
  Meta,
  PaperDetail,
  PaperPage,
  PdfFile,
  Project,
  SavedView,
  TagNode,
  Token,
  ExportToken,
} from "@/lib/library/types";

export class PaperdbError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "PaperdbError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${PAPERDB_URL}/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${paperdbToken()}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new PaperdbError(
      error instanceof Error ? error.message : "paperdb unreachable",
      502,
      "unreachable",
    );
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new PaperdbError(
      problem.detail ?? problem.title ?? `paperdb returned ${response.status}`,
      response.status,
      problem.code,
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function listPapers(params: {
  q?: string;
  view?: string;
  collection?: string;
  tag?: string;
  status?: string;
  year?: number;
  kind?: string;
  venueId?: string;
  starred?: boolean;
  unfiled?: boolean;
  filter?: string;
  limit?: number;
  cursor?: string;
}): Promise<PaperPage> {
  return request<PaperPage>(`/papers${query(params)}`);
}

export function getPaper(ref: string): Promise<PaperDetail> {
  return request<PaperDetail>(`/papers/${encodeURIComponent(ref)}`);
}

export function getProjectPapers(projectId: string, limit = 50): Promise<PaperPage> {
  return request<PaperPage>(`/projects/${projectId}/papers${query({ limit })}`);
}

export function getProject(projectId: string): Promise<Project> {
  return request<Project>(`/projects/${projectId}`);
}

export function getView(viewId: string): Promise<SavedView> {
  return request<SavedView>(`/views/${viewId}`);
}

export function getMeta(): Promise<Meta> {
  return request<Meta>("/meta");
}

export function getCollectionTree(): Promise<CollectionNode[]> {
  return request<CollectionNode[]>("/collections/tree");
}

export function getTagTree(): Promise<TagNode[]> {
  return request<TagNode[]>("/tags/tree");
}

export function listViews(): Promise<SavedView[]> {
  return request<SavedView[]>("/views");
}

export function listProjects(): Promise<Project[]> {
  return request<Project[]>("/projects");
}

export function getPaperFiles(paperId: string): Promise<PdfFile[]> {
  return request<PdfFile[]>(`/papers/${paperId}/files`);
}

export function getAnnotations(paperId: string): Promise<Annotation[]> {
  return request<Annotation[]>(`/papers/${paperId}/annotations`);
}

export function fulltextSearch(q: string, limit = 20): Promise<FulltextSearch> {
  return request<FulltextSearch>(`/search/fulltext${query({ q, limit })}`);
}

export function listImports(limit = 20): Promise<ImportPage> {
  return request<ImportPage>(`/imports${query({ limit })}`);
}

export function getImport(importId: string): Promise<ImportJob> {
  return request<ImportJob>(`/imports/${importId}`);
}

export function getImportItems(importId: string): Promise<ImportItem[]> {
  return request<ImportItem[]>(`/imports/${importId}/items`);
}

export function getJob(jobId: string): Promise<Job> {
  return request<Job>(`/jobs/${jobId}`);
}


export function listTokens(): Promise<Token[]> {
  return request<Token[]>("/tokens");
}

export function listExportTokens(): Promise<ExportToken[]> {
  return request<ExportToken[]>("/export-tokens");
}


export function getReferences(paperId: string): Promise<CitationPage> {
  return request<CitationPage>(`/papers/${paperId}/references`);
}

export function getCitations(paperId: string): Promise<CitationPage> {
  return request<CitationPage>(`/papers/${paperId}/citations`);
}
