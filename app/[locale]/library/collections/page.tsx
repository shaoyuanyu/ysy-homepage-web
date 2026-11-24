import { getTranslations } from "next-intl/server";

import { CollectionsPanel } from "@/components/library/collections-panel";
import { getCollectionTree } from "@/lib/library/server";
import type { CollectionNode } from "@/lib/library/types";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const t = await getTranslations("library");
  let tree: CollectionNode[] = [];
  try {
    tree = await getCollectionTree();
  } catch {
    tree = [];
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{t("collectionsTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("collectionsHint")}</p>
      </div>
      <CollectionsPanel tree={tree} />
    </div>
  );
}
