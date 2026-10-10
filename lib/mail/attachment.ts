import type { MailAttachmentMeta } from "@/lib/mail/types";

/**
 * 附件的「能不能就地看」判定（前端）。与 webmaild 的 `webmail/src/attachment.ts`
 * 白名单**故意保持一致**：那边决定浏览器肯不肯内联渲染，这边决定要不要给预览入口——
 * 两边不一致就会出现「点开是预览弹窗、图却渲染不出来」。
 *
 * ⚠ 图片列表**必须与后端逐字相同、且不含 SVG**：SVG 顶层文档会执行脚本，后端把它
 *   降级成下载，前端也不该给它的 `<img>` 预览（`<img src=*.svg>` 本身不执行脚本，
 *   但一来渲染结果与下载的原件观感不一致，二来没必要为一个被拒绝的类型开后门）。
 */

/** 附件 MIME 主类型（小写、去参数）；畸形/缺失返回空串 */
export function attachmentBaseType(contentType: string | null | undefined): string {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

/** 后端允许内联的图片类型（webmail/src/attachment.ts 的 INLINE_SAFE_TYPES 子集） */
const PREVIEW_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/avif",
  "image/tiff",
]);

/** 这些 `text/*` 不当「纯文本」预览：前两个是文档（该按下载处理），
 * calendar 走「加入日历」那条路（见 isCalendarAttachment） */
const NON_TEXT_PREVIEW_TYPES = new Set(["text/html", "text/xml", "text/calendar"]);

export function isPreviewImage(a: MailAttachmentMeta): boolean {
  return PREVIEW_IMAGE_TYPES.has(attachmentBaseType(a.contentType));
}

export function isPreviewText(a: MailAttachmentMeta): boolean {
  const type = attachmentBaseType(a.contentType);
  return type.startsWith("text/") && !NON_TEXT_PREVIEW_TYPES.has(type);
}

/**
 * 日历邀请（`text/calendar` 部件，或扩展名为 .ics 的附件）。
 *
 * ⚠ 扩展名也要认：不少客户端把邀请存成 `application/octet-stream` + `invite.ics`
 *   （QQ 邮箱实测如此），只看 MIME 会漏掉。
 */
export function isCalendarAttachment(a: MailAttachmentMeta): boolean {
  return attachmentBaseType(a.contentType) === "text/calendar" || /\.ics$/i.test(a.filename);
}
