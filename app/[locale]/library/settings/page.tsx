import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SettingsPanel } from "@/components/library/settings-panel";
import {
  getMeta,
  listExportTokens,
  listTokens,
} from "@/lib/library/server";
import type { ExportToken, Meta, Token } from "@/lib/library/types";

export const dynamic = "force-dynamic";

/** 标签页标题（与文献库其它子页一致，勿依赖首页默认标题） */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "library" });
  return { title: t("settingsTitle") };
}

export default async function SettingsPage() {
  const t = await getTranslations("library");
  const [meta, tokens, exports] = await Promise.all([
    getMeta().catch(() => null),
    listTokens().catch(() => [] as Token[]),
    listExportTokens().catch(() => [] as ExportToken[]),
  ]);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t("settingsTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("settingsHint")}</p>
      </div>
      <SettingsPanel meta={meta as Meta | null} tokens={tokens} exports={exports} />
    </div>
  );
}
