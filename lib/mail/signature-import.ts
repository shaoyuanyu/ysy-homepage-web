import TurndownService from "turndown";

/**
 * 服务商签名 HTML → Markdown（2026-10-29）。
 *
 * 为什么要转：我们的签名模型是 Markdown，写信页会把它和正文一起渲染成 HTML 发出。
 * 直接取邮件纯文本会丢掉 logo；这里用 Turndown 保留：
 * - 图片（`<img>`，含 webmaild 已落盘的 cid 内嵌图）→ `![alt](绝对 URL)`；
 * - 链接 / 粗体 / 斜体 / 列表 / 引用 / 标题；
 * - 复杂布局（表格、内联样式）会被简化——邮件客户端本来也会各显神通。
 *
 * ⚠ 后端返回的站内图片是相对路径 `/api/mail-signature-asset/…`：必须补成绝对 URL，
 *   否则收件人的邮件客户端（不是本站）解析不了。origin 由调用方给 `location.origin`。
 */
export function signatureHtmlToMarkdown(html: string, origin: string): string {
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
    codeBlockStyle: "fenced",
  });

  const absolute = (url: string): string => {
    const u = url.trim();
    if (!u) return "";
    if (u.startsWith("/")) {
      try {
        return new URL(u, origin).toString();
      } catch {
        return u;
      }
    }
    return u;
  };

  td.addRule("mailImage", {
    filter: "img",
    replacement: (_content, node) => {
      const el = node as HTMLImageElement;
      const src = absolute(el.getAttribute("src") ?? "");
      if (!src) return "";
      const alt = (el.getAttribute("alt") ?? "").replace(/[[\]\n\r]/g, " ").trim();
      return `![${alt}](${src})`;
    },
  });

  td.addRule("mailLink", {
    filter: "a",
    replacement: (content, node) => {
      const href = absolute((node as HTMLAnchorElement).getAttribute("href") ?? "");
      return href ? `[${content}](${href})` : content;
    },
  });

  return td
    .turndown(html)
    // 导入说明用的占位行 / 标准签名分隔线不留在签名里
    .replace(/^(?:签名导入|导入签名|signature import)\s*\n+/i, "")
    .replace(/^\s*--\s*$\n?/m, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
