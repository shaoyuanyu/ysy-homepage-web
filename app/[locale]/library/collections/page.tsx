import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CollectionsPanel } from "@/components/library/collections-panel";
import { getCollectionTree } from "@/lib/library/server";
import type { CollectionNode } from "@/lib/library/types";

export const dynamic = "force-dynamic";

/** 标签页标题（与文献库其它子页一致，勿依赖首页默认标题） */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "library" });
  return { title: t("collections") };
}

export default async function CollectionsPage() {
  const t = await getTranslations("library");
  let tree: CollectionNode[] = [];
  try {
    tree = await getCollectionTree();
  } catch {
    tree = [];
  }
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t("manageCollections")}</h2>
        <p className="text-sm text-muted-foreground">{t("collectionsHint")}</p>
      </div>
      <CollectionsPanel tree={tree} />
    </div>
  );
}
