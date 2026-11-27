"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link2, X } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { Link } from "@/lib/i18n/navigation";
import { libraryApi } from "@/lib/library/client";
import type { ProjectMembership } from "@/lib/library/projects";
import { cn } from "@/lib/utils";

/**
 * 论文详情右侧的「项目」成员列表（可移除）。
 *
 * 项目归属有两条路径：`project_paper` 里单独置顶的论文，以及项目关联集合
 * （含子集合）带来的论文。这里把两者都显示出来，但只有前者能取消——
 * 后者要改集合关系，不能从论文这侧“移除”，否则删了置顶条目、chip 又回来了。
 */
export function PaperProjects({
  paperId,
  memberships,
}: {
  paperId: string;
  memberships: ProjectMembership[];
}) {
  const t = useTranslations("library");
  const router = useRouter();
  const [items, setItems] = useState(memberships);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setItems(memberships);
  }, [memberships]);

  const remove = async (id: string) => {
    if (busy) return;
    const previous = items;
    setItems((current) => current.filter((item) => item.id !== id));
    setBusy(id);
    try {
      await libraryApi(`/projects/${id}/papers`, {
        method: "DELETE",
        body: JSON.stringify({ paperIds: [paperId] }),
      });
      toast.add({ title: t("projectRemoved"), type: "success" });
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
    return <p className="text-muted-foreground">{t("unprojected")}</p>;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {items.map((project) => {
        // 同时经集合归属时，取消置顶不会让它离开项目，所以不给移除按钮
        const removable = project.pinned && !project.viaCollection;
        return (
          <span
            key={project.id}
            className={cn(
              "inline-flex items-center gap-0.5 rounded bg-muted pr-0.5",
              busy === project.id && "opacity-50",
            )}
          >
            <Link
              href={`/library?project=${project.id}`}
              title={project.name}
              className="max-w-40 truncate rounded-l px-1.5 py-0.5 hover:underline"
            >
              {project.name}
            </Link>
            {removable ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void remove(project.id)}
                aria-label={t("removeFromProject", { name: project.name })}
                title={t("removeFromProject", { name: project.name })}
                className="rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:pointer-events-none"
              >
                <X className="size-3" aria-hidden />
              </button>
            ) : (
              <span
                title={t("projectViaCollection")}
                className="inline-flex items-center gap-0.5 px-1 text-xs text-muted-foreground/70"
              >
                <Link2 className="size-3" aria-hidden />
                {t("organizeViaShort")}
              </span>
            )}
          </span>
        );
      })}
      </div>
      {items.some((project) => project.viaCollection) && (
        <p className="text-xs leading-relaxed text-muted-foreground/70">
          {t("organizeViaLocked")}
        </p>
      )}
    </div>
  );
}
