"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { Link } from "@/lib/i18n/navigation";
import { libraryApi } from "@/lib/library/client";
import { cn } from "@/lib/utils";

/**
 * 详情页右栏的标签列表（可移除）。
 *
 * 之前标签只能从操作条追加，加错/过时的标签在网页里没有任何移除入口，
 * 只能调 API。移除走 `DELETE /papers/{ref}/tags`（body `{paths}`）。
 */
export function PaperTags({ paperId, tags }: { paperId: string; tags: string[] }) {
  const t = useTranslations("library");
  const router = useRouter();
  const [items, setItems] = useState(tags);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setItems(tags);
  }, [tags]);

  const remove = async (path: string) => {
    if (busy) return;
    const previous = items;
    setItems((current) => current.filter((item) => item !== path));
    setBusy(path);
    try {
      await libraryApi(`/papers/${paperId}/tags`, {
        method: "DELETE",
        body: JSON.stringify({ paths: [path] }),
      });
      toast.add({ title: t("tagRemoved"), type: "success" });
      router.refresh();
    } catch (caught) {
      setItems(previous);
      toast.add({
        title: caught instanceof Error && caught.message ? caught.message : t("actionFailed"),
        type: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) {
    return <p className="text-muted-foreground">{t("noTags")}</p>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((path) => (
        <span
          key={path}
          className={cn(
            "inline-flex items-center gap-0.5 rounded bg-muted pr-0.5",
            busy === path && "opacity-50",
          )}
        >
          <Link
            href={`/library?tag=${encodeURIComponent(path)}`}
            title={path}
            className="max-w-40 truncate rounded-l px-1.5 py-0.5 hover:underline"
          >
            {path.split("/").join(" › ")}
          </Link>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void remove(path)}
            aria-label={t("removeTag", { name: path })}
            title={t("removeTag", { name: path })}
            className="rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:pointer-events-none"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}
