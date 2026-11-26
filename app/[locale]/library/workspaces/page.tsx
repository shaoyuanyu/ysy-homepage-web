import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { WorkspacesPanel } from "@/components/library/workspaces-panel";
import { listWorkspaces } from "@/lib/library/server";
import type { ResearchWorkspace } from "@/lib/library/types";

export const dynamic = "force-dynamic";

/** 标签页标题（与文献库其它子页一致，勿依赖首页默认标题） */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "library" });
  return { title: t("researchWorkspaces") };
}

export default async function WorkspacesPage() {
  const t = await getTranslations("library");
  const workspaces = await listWorkspaces().catch(() => [] as ResearchWorkspace[]);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t("manageWorkspaces")}</h2>
        <p className="text-sm text-muted-foreground">{t("workspacesHint")}</p>
      </div>
      <WorkspacesPanel workspaces={workspaces} />
    </div>
  );
}
