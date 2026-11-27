import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { TrashPanel } from "@/components/library/trash-panel";
import { listTrash } from "@/lib/library/server";
import type { PaperPage } from "@/lib/library/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "library" });
  return { title: t("trash") };
}

export default async function TrashPage() {
  const t = await getTranslations("library");
  let page: PaperPage = { items: [], nextCursor: null, hasMore: false };
  let error = false;
  try {
    page = await listTrash();
  } catch {
    error = true;
  }
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t("trash")}</h2>
        <p className="text-sm text-muted-foreground">{t("trashHint")}</p>
      </div>
      {error ? (
        <p className="text-sm text-muted-foreground">{t("backendError")}</p>
      ) : (
        <TrashPanel papers={page.items} />
      )}
    </div>
  );
}
