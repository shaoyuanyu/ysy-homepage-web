import MarkdownIt from "markdown-it";

/**
 * 写信页的 Markdown 渲染（2026-10-29）。
 *
 * 设计约束：
 * - **不允许原始 HTML**（`html: false`）：写邮件的人只有站主，但邮件会发给外部收件人，
 *   且预览用 `dangerouslySetInnerHTML`——直接从源头堵住注入面；
 * - `breaks: true`：单个换行也换行，与现有纯文本写信的直觉一致（GFM 风格）；
 * - `linkify: true`：裸 URL / 邮箱自动变成链接；
 * - 链接统一加 `target=_blank` + `rel=noopener noreferrer`（预览里点链接不会把站内页面
 *   带走；收件人的客户端会按自己的策略处理）。
 *
 * 发送时同时给 `text`（`markdownToPlainText`）与 `html`，见 compose-form。
 */
const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: false,
});

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener noreferrer");
  return self.renderToken(tokens, idx, options);
};

/**
 * Markdown 会吞掉行首空白（最多 3 个空格是段落缩进，U+3000 也常被当作空白）：
 * 写信页 Tab 插入的中文段落缩进（两个全角空格）先换成 `&emsp;` 实体再渲染，
 * 否则预览和收件人看到的正文会顶格。
 * 源码 / 草稿保持用户输入的全角空格，只影响渲染结果。
 */
function protectCjkIndent(source: string): string {
  return source.replace(/^(\u3000+)/gm, (m) => "&emsp;".repeat(m.length));
}

/** Markdown → HTML（用于实时预览与发送的 html 部分） */
export function renderMarkdown(source: string): string {
  return md.render(protectCjkIndent(source));
}

/** HTML 实体解码（Markdown 会把 `<`、`&` 等转义） */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

/**
 * Markdown → 纯文本（发送 multipart/alternative 的 text 部分）。
 *
 * 不是「把源码原样发出去」：收件人用纯文本客户端时看到 `**粗体**` 这种源码很怪。
 * 这里用渲染后的 HTML 去标签，保留段落/换行/表格/链接地址；足以读，也不引入额外依赖。
 */
export function markdownToPlainText(source: string): string {
  const text = renderMarkdown(source)
    // 链接保留地址：`<a href="url">文字</a>` → `文字 (url)`
    .replace(
      /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, label: string) => `${label} (${href})`,
    )
    // 图片 → `[图片: alt] (src)`（没有 alt 时用「图片」）
    .replace(
      /<img\b[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi,
      (_m, src: string, alt: string) => (alt ? `[图片: ${alt}] (${src})` : `[图片] (${src})`),
    )
    .replace(/<img\b[^>]*src="([^"]*)"[^>]*>/gi, (_m, src: string) => `[图片] (${src})`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre|table|ul|ol)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<hr[^>]*>/gi, "\n---\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 引用原文（回复 / 转发）→ Markdown 引用块。
 *
 * - 逐行加 `> `，原文里的 Markdown 符号仍可能生效（例如原文自带 `**`）——这与各家邮件
 *   客户端「引用原文」的观感一致，不做逐字符转义（转义会把原文变得难以阅读）；
 * - 空行用 `>` 保留段落。
 */
export function quoteAsMarkdown(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

/** 预览区为空时的判断（用于显示占位文案，而不是一大片空白） */
export function isEmptyMarkdown(source: string): boolean {
  return source.trim().length === 0;
}
