"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * 复制 BibTeX（详情页）：从同源 API 拉取文本再写剪贴板。
 *
 * 为什么不用现成的下载链接做「复制」：下载是浏览器导航行为，拿不到内容；
 * 这里必须读文本。失败时静默保持原按钮（剪贴板权限被拒时不做假成功）。
 */
export function CopyBibtexButton({ paperId }: { paperId: string }) {
  const t = useTranslations("library");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      const response = await fetch(`/api/library/papers/${paperId}/bibtex`, {
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("bibtex fetch failed");
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // 剪贴板不可用 / 网络异常：保持原按钮，不伪造成功
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={() => void copy()}
      aria-live="polite"
    >
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {copied ? t("copied") : t("copyBibtex")}
    </Button>
  );
}
