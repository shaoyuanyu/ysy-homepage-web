import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 服务商签名里的图片（2026-10-29）：**公开**资源。
 *
 * 为什么不能挂在 owner 守卫的 `/api/mail/*` 代理下：这些图片会出现在 **发给别人的邮件
 * HTML** 里，收件人的邮件客户端加载 `<img>` 时没有站主 Cookie——必须公开。
 *
 * 安全：
 * - 文件名是 webmaild 导入时生成的 16 字节随机 hex + 光栅图扩展名，不可枚举；
 * - 这里再做一次严格的白名单，只转发 png/jpg/gif/webp；
 * - 仍走内部密钥访问 webmaild，webmaild 不直接对公网开放。
 */
const WEBMAIL_URL = process.env.WEBMAIL_URL ?? "http://127.0.0.1:9710";
const INTERNAL_KEY = process.env.WEBMAIL_INTERNAL_KEY ?? "";

const FILE_RE = /^[a-f0-9]{32}\.(png|jpe?g|gif|webp)$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  if (!FILE_RE.test(file)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${WEBMAIL_URL}/signature-asset/${encodeURIComponent(file)}`,
      {
        headers: INTERNAL_KEY ? { "x-internal-key": INTERNAL_KEY } : {},
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const headers = new Headers();
  for (const name of [
    "content-type",
    "content-length",
    "cache-control",
    "x-content-type-options",
  ]) {
    const v = upstream.headers.get(name);
    if (v) headers.set(name, v);
  }
  if (!headers.has("x-content-type-options")) {
    headers.set("x-content-type-options", "nosniff");
  }
  return new NextResponse(upstream.body, { status: 200, headers });
}
