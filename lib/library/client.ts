"use client";

import type { ApiProblem } from "@/lib/library/types";

export class LibraryApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "LibraryApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/library${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as ApiProblem;
    throw new LibraryApiError(
      problem.detail ?? problem.title ?? `Request failed (${response.status})`,
      response.status,
      problem.code,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function libraryApi<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init);
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function patchJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteJson<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "DELETE",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function uploadPdf(paperId: string, file: File): Promise<{ file: { id: string }; jobId: string | null }> {
  const form = new FormData();
  form.append("file", file);
  return request(`/papers/${paperId}/files`, { method: "POST", body: form });
}

export async function waitForJob(
  jobId: string,
  { intervalMs = 900, timeoutMs = 60_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<{ id: string; status: string; lastError: string | null }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await request<{ id: string; status: string; lastError: string | null }>(
      `/jobs/${jobId}`,
    );
    if (job.status === "succeeded" || job.status === "failed" || job.status === "dead") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new LibraryApiError("任务超时，请稍后在导入记录中查看", 408, "timeout");
}


export function importPdf(file: File): Promise<import("@/lib/library/types").PdfImportCreated> {
  const form = new FormData();
  form.append("file", file);
  return request("/imports/pdf", { method: "POST", body: form });
}
