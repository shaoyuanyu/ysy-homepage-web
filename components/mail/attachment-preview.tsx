"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DownloadIcon, FileWarningIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { isPreviewImage, isPreviewText } from "@/lib/mail/attachment";
import { fetchWithTimeout } from "@/lib/mail/fetch-timeout";
import { formatSize } from "@/lib/mail/format";
import type { MailAttachmentMeta } from "@/lib/mail/types";
import { cn } from "@/lib/utils";

/**
 * 附件的原始字节地址（下载、图片预览、取 ics 原文共用）。
 *
 * ⚠ `index` 是**附件在清单里的序号**（不是数组下标）：补取整封原文后序号也不变
 *   （见 `MailAttachmentMeta.deferred` 的说明），所以推迟的附件也能直接拼这个地址。
 */
export function attachmentUrl(messageId: string, index: number): string {
  return `/api/mail/message/${encodeURIComponent(messageId)}/attachment/${index}`;
}

/** 文本预览的读取上限：再长的日志也不该让弹窗变成一个几十兆的 DOM */
const TEXT_MAX_CHARS = 200_000;
/** 取附件要连一次邮箱（推迟的附件尤其慢），给比普通读路径更宽的上限 */
const ATTACHMENT_TIMEOUT_MS = 60_000;

/**
 * 附件预览弹窗（2026-10-10）：图片就地看、纯文本就地读，其余类型不打开这个弹窗
 * （调用方仍给 `<a download>`）。
 *
 * 安全：文本一律走 `<pre>{text}</pre>`（React 会转义），**绝不** `dangerouslySetInnerHTML`
 * ——附件内容来自不受信任的发信人（见 webmaild `attachment.ts` 的加固说明）。
 */
export function AttachmentPreview({
  messageId,
  attachment,
  onClose,
}: {
  messageId: string;
  /** null = 关闭 */
  attachment: MailAttachmentMeta | null;
  onClose: () => void;
}) {
  const t = useTranslations("mail");
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const url = attachment ? attachmentUrl(messageId, attachment.index) : "";
  const isImage = !!attachment && isPreviewImage(attachment);
  const isText = !!attachment && !isImage && isPreviewText(attachment);

  // 文本内容在弹窗打开时才去取（一次几百 KB 也可能很慢，不能随列表一起拉）
  useEffect(() => {
    if (!attachment || !isText) {
      setText(null);
      setError(false);
      return;
    }
    let cancelled = false;
    setText(null);
    setError(false);
    void (async () => {
      try {
        const res = await fetchWithTimeout(url, undefined, ATTACHMENT_TIMEOUT_MS);
        if (!res.ok) throw new Error(`${res.status}`);
        const body = await res.text();
        if (!cancelled) setText(body.slice(0, TEXT_MAX_CHARS));
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment, isText, url]);

  // 换一个附件（或关闭）时把图片的错误态清掉，否则下一张图会继承上一张的失败态
  useEffect(() => {
    setImgFailed(false);
  }, [attachment]);

  return (
    <Dialog open={attachment !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-slot="mail-attachment-preview"
        className="gap-3 sm:max-w-2xl"
        aria-describedby={undefined}
      >
        {attachment && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate pr-8 text-sm font-medium">
                {attachment.filename}
              </DialogTitle>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatSize(attachment.size)}
              </p>
            </DialogHeader>

            {isImage && (
              <div className="flex max-h-[70vh] min-h-24 items-center justify-center overflow-auto rounded-lg border border-border bg-accent/20 p-2">
                {imgFailed ? (
                  <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <FileWarningIcon className="size-4" aria-hidden />
                    {t("previewFailed")}
                  </p>
                ) : (
                  /* 图片用 <img> 而不是 <object>/<iframe>：后端只对图片与纯文本放行 inline，
                     且带了 nosniff——非白名单类型这里根本走不到（isPreviewImage 与后端逐字一致）。
                     也不用 next/image：源是认证过的代理端点，优化器在这里只会多绕一层 */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={attachment.filename}
                    onError={() => setImgFailed(true)}
                    className="max-h-[66vh] w-auto max-w-full object-contain"
                  />
                )}
              </div>
            )}

            {isText && (
              <div className="max-h-[70vh] min-h-24 overflow-auto rounded-lg border border-border bg-accent/20">
                {error ? (
                  <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                    <FileWarningIcon className="size-4" aria-hidden />
                    {t("previewFailed")}
                  </p>
                ) : text === null ? (
                  <p className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                    <Spinner className="size-4" />
                    {t("previewLoading")}
                  </p>
                ) : (
                  <pre
                    data-slot="mail-attachment-text"
                    className="p-4 text-xs leading-relaxed whitespace-pre-wrap break-words"
                  >
                    {text}
                  </pre>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <a
                href={url}
                download={attachment.filename}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <DownloadIcon data-icon="default" />
                {t("previewDownload")}
              </a>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
