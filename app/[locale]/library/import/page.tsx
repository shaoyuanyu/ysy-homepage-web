import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { History } from "lucide-react";

import { ImportForm } from "@/components/library/import-form";
import { listImports } from "@/lib/library/server";
import { shortDate } from "@/lib/library/format";
import type { ImportJob } from "@/lib/library/types";

export const dynamic = "force-dynamic";

/** 标签页标题（与文献库其它子页一致，勿依赖首页默认标题） */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "library" });
  return { title: t("importTitle") };
}

export default async function ImportPage() {
  const t = await getTranslations("library");
  let imports: ImportJob[] = [];
  try {
    imports = (await listImports(10)).items;
  } catch {
    imports = [];
  }
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t("importTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("importHint")}</p>
      </div>
      <ImportForm />
      <section className="rounded-xl border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4" /> {t("recentImports")}
          </h3>
          <span className="text-xs tabular-nums text-muted-foreground">{imports.length}</span>
        </div>
        {imports.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noImports")}</p>
        ) : (
          <div className="divide-y text-xs">
            {imports.map((job) => (
              <div key={job.id} className="flex flex-wrap items-center gap-2 py-2.5 transition-colors hover:bg-accent/20">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {t.has(`importKind_${job.kind}`) ? t(`importKind_${job.kind}`) : job.kind}
                </span>
                <span
                  className={
                    job.status === "succeeded"
                      ? "rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300"
                      : job.status === "failed"
                        ? "rounded bg-destructive/10 px-1.5 py-0.5 text-destructive"
                        : "rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
                  }
                >
                  {t.has(`importStatus_${job.status}`) ? t(`importStatus_${job.status}`) : job.status}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {t("importStats", {
                    created: job.stats.created ?? 0,
                    duplicate: job.stats.duplicate ?? 0,
                    failed: job.stats.failed ?? 0,
                  })}
                </span>
                <span className="shrink-0 text-muted-foreground">{shortDate(job.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
