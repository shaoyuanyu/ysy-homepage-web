import { NextRequest, NextResponse } from "next/server";

import { isOwner } from "@/lib/auth/owner";
import {
  PAPERDB_PROXY_ROOTS,
  PAPERDB_RESPONSE_HEADERS,
  PAPERDB_URL,
  paperdbToken,
} from "@/lib/library/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { path } = await params;
  if (!path.length || !PAPERDB_PROXY_ROOTS.has(path[0])) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // CSRF：带 Origin 的非安全请求必须是同源；无 Origin 的 CLI 请求仍由
  // TOTP 会话 + 服务端 cookie 保护。
  if (UNSAFE.has(req.method)) {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) {
      return NextResponse.json({ error: "cross_origin" }, { status: 403 });
    }
  }

  const target = `${PAPERDB_URL}/v1/${path
    .map((segment) => encodeURIComponent(segment))
    .join("/")}${req.nextUrl.search}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${paperdbToken()}`,
        ...(req.headers.get("content-type")
          ? { "Content-Type": req.headers.get("content-type") as string }
          : {}),
        ...(req.headers.get("range") ? { Range: req.headers.get("range") as string } : {}),
        ...(req.headers.get("if-none-match")
          ? { "If-None-Match": req.headers.get("if-none-match") as string }
          : {}),
      },
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      // @ts-expect-error Node fetch 需要 duplex 才能带流式 body
      duplex: "half",
      cache: "no-store",
      signal: AbortSignal.timeout(300_000),
    });
  } catch {
    return NextResponse.json({ error: "paperdb_unreachable" }, { status: 502 });
  }

  const headers = new Headers();
  for (const name of PAPERDB_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("x-content-type-options")) {
    headers.set("x-content-type-options", "nosniff");
  }
  // 代理路径本身也禁止被任意站点嵌入；PDF 只允许本站 frame。
  if (headers.get("content-type")?.includes("application/pdf")) {
    headers.set("content-security-policy", "sandbox; frame-ancestors 'self'");
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
