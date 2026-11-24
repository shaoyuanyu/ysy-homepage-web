import { getTranslations } from "next-intl/server";

import { ViewsPanel } from "@/components/library/views-panel";
import { listViews } from "@/lib/library/server";
import type { SavedView } from "@/lib/library/types";

export const dynamic = "force-dynamic";

export default async function ViewsPage() {
  const t = await getTranslations("library");
  const views = await listViews().catch(() => [] as SavedView[]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{t("views")}</h2>
        <p className="text-xs text-muted-foreground">{t("viewsHint")}</p>
      </div>
      <ViewsPanel views={views} />
    </div>
  );
}
