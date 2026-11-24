import { getTranslations } from "next-intl/server";

import { ImportForm } from "@/components/library/import-form";
import { listImports } from "@/lib/library/server";
import { shortDate } from "@/lib/library/format";
import type { ImportJob } from "@/lib/library/types";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const t = await getTranslations("library");
  let imports: ImportJob[] = [];
  try {
    imports = (await listImports(10)).items;
  } catch {
    imports = [];
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{t("importTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("importHint")}</p>
      </div>
      <ImportForm />
      <section className="rounded-xl border p-3">
        <h3 className="mb-2 text-sm font-semibold">{t("recentImports")}</h3>
        {imports.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noImports")}</p>
        ) : (
          <div className="divide-y text-xs">
            {imports.map((job) => (
              <div key={job.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-mono text-[11px]">{job.kind}</span>
                <span className="rounded bg-muted px-1.5 py-0.5">{job.status}</span>
                <span className="text-muted-foreground">
                  {t("importStats", {
                    created: job.stats.created ?? 0,
                    duplicate: job.stats.duplicate ?? 0,
                    failed: job.stats.failed ?? 0,
                  })}
                </span>
                <span className="ml-auto text-muted-foreground">{shortDate(job.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
