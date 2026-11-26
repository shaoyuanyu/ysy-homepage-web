"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/** 后端不可用时统一的重试入口：`router.refresh()` 重新跑当前页的 server fetch */
export function RetryButton({ className }: { className?: string }) {
  const t = useTranslations("library");
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => router.refresh()}
      className={className}
    >
      <RotateCw data-icon="inline-start" /> {t("retry")}
    </Button>
  );
}
