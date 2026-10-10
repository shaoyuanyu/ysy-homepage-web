import { NextRequest, NextResponse } from "next/server";

import { isOwner } from "@/lib/auth/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** webmaild 绑回环或容器网络、不对公网开放（MAIL-AGENT.md 4.6：信任边界在本机/网络隔离），守卫在这一层 */
const WEBMAIL_URL = process.env.WEBMAIL_URL ?? "http://127.0.0.1:9710";
/**
 * 与 webmaild 共享的内部密钥（webmaild 侧读 WEBMAIL_INTERNAL_KEY）：转发时以
 * `x-internal-key` 注入。两侧同一个值；webmaild 绑非回环地址时缺了它就会拒绝启动。
 */
const INTERNAL_KEY = process.env.WEBMAIL_INTERNAL_KEY ?? "";

async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { path } = await params;
  const target = `${WEBMAIL_URL}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: {
        "content-type": req.headers.get("content-type") ?? "application/json",
        ...(INTERNAL_KEY ? { "x-internal-key": INTERNAL_KEY } : {}),
      },
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
      // @ts-expect-error Node fetch 需要 duplex 才能带 body 流
      duplex: "half",
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "webmaild_unreachable" }, { status: 502 });
  }

  const headers = new Headers();
  // ⚠ 附件响应头必须原样转发（2026-10-07）：webmaild 在附件端点做了类型白名单
  // 与 nosniff / CSP 加固（webmail/src/attachment.ts），代理漏转发这几个头就等于
  // 加固没做——发信人可用一封 inline text/html 附件在站点源上执行脚本。
  for (const name of [
    "content-type",
    "content-disposition",
    "content-length",
    "x-content-type-options",
    "content-security-policy",
  ]) {
    const v = upstream.headers.get(name);
    if (v) headers.set(name, v);
  }
  // 兜底：即使上游没给（旧版 webmaild），也不允许浏览器嗅探改写类型
  if (!headers.has("x-content-type-options")) {
    headers.set("x-content-type-options", "nosniff");
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export const GET = proxy;
export const POST = proxy;
// ⚠ PUT 是草稿自动保存（PUT /drafts/:id）与账号修改（PUT /accounts/:id）要用的——
// 漏导出会得到 405（E2E 全走 stub、拦不到真实代理层，曾因此漏过一轮）
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
