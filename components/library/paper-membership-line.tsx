"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Folder, FolderCog, Target } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Link } from "@/lib/i18n/navigation";
import type { PaperMembershipRef } from "@/lib/library/projects";
import { cn } from "@/lib/utils";

const chipClass =
  "inline-flex max-w-32 min-w-0 items-center gap-1 rounded-md border border-border/70 bg-muted/25 px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none";

const PER_KIND = 2;

function iconFor(kind: PaperMembershipRef["kind"]) {
  return kind === "collection" ? Folder : Target;
}

function hrefFor(item: PaperMembershipRef): string {
  return item.kind === "collection"
    ? `/library?collection=${item.id}`
    : `/library?project=${item.id}`;
}

function MembershipLink({ item }: { item: PaperMembershipRef }) {
  const Icon = iconFor(item.kind);
  return (
    <Link
      href={hrefFor(item)}
      title={item.name}
      className="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{item.name}</span>
    </Link>
  );
}

function MembershipGroup({
  label,
  items,
}: {
  label: string;
  items: PaperMembershipRef[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="px-1.5 pb-0.5 text-xs font-medium text-muted-foreground/70">{label}</p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <MembershipLink key={`${item.kind}:${item.id}`} item={item} />
        ))}
      </div>
    </div>
  );
}

/**
 * 列表行/卡片里的归属 chip：论文属于哪些集合、哪些项目。
 *
 * 之前列表只看得到标签，看不到集合/项目，用户只能点进详情才知道它在哪；
 * 行内最多露 3 个（集合在前、项目在后），其余收进 +N 弹层。
 */
export function PaperMembershipLine({
  memberships,
  onOrganize,
}: {
  memberships: PaperMembershipRef[];
  onOrganize: () => void;
}) {
  const t = useTranslations("library");
  const [open, setOpen] = useState(false);

  // 两类各露 2 个：只按总数截断时，集合多的时候项目会整个被藏进 +N，
  // 而“在哪些项目里”恰恰是写作时最需要一眼看到的。
  const collections = memberships.filter((item) => item.kind === "collection");
  const projects = memberships.filter((item) => item.kind === "project");
  const visible = [...collections.slice(0, PER_KIND), ...projects.slice(0, PER_KIND)];
  const hidden = [...collections.slice(PER_KIND), ...projects.slice(PER_KIND)];

  return (
    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
      {visible.map((item) => {
        const Icon = iconFor(item.kind);
        return (
          <Link
            key={`${item.kind}:${item.id}`}
            href={hrefFor(item)}
            title={`${t(item.kind)} · ${item.name}`}
            className={chipClass}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{item.name}</span>
          </Link>
        );
      })}
      {hidden.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={t("organizeMore", { count: hidden.length })}
                title={t("organizeMore", { count: hidden.length })}
                className={cn(chipClass, "tabular-nums")}
              />
            }
          >
            +{hidden.length}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <div className="space-y-2">
              <MembershipGroup
                label={t("organizeCollections")}
                items={memberships.filter((item) => item.kind === "collection")}
              />
              <MembershipGroup
                label={t("organizeProjects")}
                items={memberships.filter((item) => item.kind === "project")}
              />
            </div>
          </PopoverContent>
        </Popover>
      )}
      <button
        type="button"
        onClick={onOrganize}
        aria-label={t("organize")}
        title={t("organize")}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-border/80 px-1.5 py-0.5 text-xs text-muted-foreground/80 transition-colors hover:border-foreground/25 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <FolderCog className="size-3" aria-hidden /> {t("organize")}
      </button>
    </div>
  );
}
