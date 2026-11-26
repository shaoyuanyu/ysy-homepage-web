import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ProjectsPanel } from "@/components/library/projects-panel";
import { listProjects } from "@/lib/library/server";
import type { Project } from "@/lib/library/types";

export const dynamic = "force-dynamic";

/** 标签页标题（与文献库其它子页一致，勿依赖首页默认标题） */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "library" });
  return { title: t("projects") };
}

export default async function ProjectsPage() {
  const t = await getTranslations("library");
  const projects = await listProjects().catch(() => [] as Project[]);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t("manageProjects")}</h2>
        <p className="text-sm text-muted-foreground">{t("projectsHint")}</p>
      </div>
      <ProjectsPanel projects={projects} />
    </div>
  );
}
