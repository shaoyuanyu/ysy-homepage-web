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
 * 论文详情右侧的「集合」成员列表（可移除）。
 *
 * 之前这里只是只读 chip：能加入（操作条的「加入集合」），却没有任何入口把论文
 * 移出集合——只能整篇重导。移除走 `DELETE /papers/{id}/collections`
 * （body `{collectionIds}`），先乐观移除，失败回滚并 toast。
 */
export function PaperCollections({
  paperId,
  collectionIds,
  names,
}: {
  paperId: string;
  collectionIds: string[];
  names: Record<string, string>;
}) {
  const t = useTranslations("library");
  const router = useRouter();
  const [ids, setIds] = useState(collectionIds);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setIds(collectionIds);
  }, [collectionIds]);

  const remove = async (id: string) => {
    if (busy) return;
    const previous = ids;
    setIds((current) => current.filter((item) => item !== id));
    setBusy(id);
    try {
      await libraryApi(`/papers/${paperId}/collections`, {
        method: "DELETE",
        body: JSON.stringify({ collectionIds: [id] }),
      });
      toast.add({ title: t("collectionRemoved"), type: "success" });
      router.refresh();
    } catch (caught) {
      setIds(previous);
      toast.add({
        title: caught instanceof Error && caught.message ? caught.message : t("actionFailed"),
        type: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  if (ids.length === 0) {
    return <p className="text-muted-foreground">{t("uncollected")}</p>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => {
        const name = names[id] ?? id.slice(0, 8);
        return (
          <span
            key={id}
            className={cn(
              "group/chip inline-flex items-center gap-0.5 rounded bg-muted pr-0.5",
              busy === id && "opacity-50",
            )}
          >
            <Link
              href={`/library?collection=${id}`}
              title={name}
              className="max-w-40 truncate rounded-l px-1.5 py-0.5 hover:underline"
            >
              {name}
            </Link>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void remove(id)}
              aria-label={t("removeFromCollection", { name })}
              title={t("removeFromCollection", { name })}
              className="rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:pointer-events-none"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        );
      })}
    </div>
  );
}
