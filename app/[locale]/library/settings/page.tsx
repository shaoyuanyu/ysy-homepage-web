import { getTranslations } from "next-intl/server";

import { SettingsPanel } from "@/components/library/settings-panel";
import {
  getMeta,
  listExportTokens,
  listTokens,
} from "@/lib/library/server";
import type { ExportToken, Meta, Token } from "@/lib/library/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const t = await getTranslations("library");
  const [meta, tokens, exports] = await Promise.all([
    getMeta().catch(() => null),
    listTokens().catch(() => [] as Token[]),
    listExportTokens().catch(() => [] as ExportToken[]),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{t("settingsTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("settingsHint")}</p>
      </div>
      <SettingsPanel meta={meta as Meta | null} tokens={tokens} exports={exports} />
    </div>
  );
}
