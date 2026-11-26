import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ViewsPanel } from "@/components/library/views-panel";
import { listViews } from "@/lib/library/server";
import type { SavedView } from "@/lib/library/types";

export const dynamic = "force-dynamic";

/** 标签页标题（与文献库其它子页一致，勿依赖首页默认标题） */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "library" });
  return { title: t("views") };
}

export default async function ViewsPage() {
  const t = await getTranslations("library");
  const views = await listViews().catch(() => [] as SavedView[]);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t("manageViews")}</h2>
        <p className="text-sm text-muted-foreground">{t("viewsHint")}</p>
      </div>
      <ViewsPanel views={views} />
    </div>
  );
}
