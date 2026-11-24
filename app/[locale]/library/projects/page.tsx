import { getTranslations } from "next-intl/server";

import { ProjectsPanel } from "@/components/library/projects-panel";
import { listProjects } from "@/lib/library/server";
import type { Project } from "@/lib/library/types";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const t = await getTranslations("library");
  const projects = await listProjects().catch(() => [] as Project[]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{t("projects")}</h2>
        <p className="text-xs text-muted-foreground">{t("projectsHint")}</p>
      </div>
      <ProjectsPanel projects={projects} />
    </div>
  );
}
