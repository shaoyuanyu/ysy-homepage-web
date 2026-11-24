import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { LibraryFilters } from "@/components/library/library-filters";
import { PaperTable } from "@/components/library/paper-table";
import { Link } from "@/lib/i18n/navigation";
import {
  PaperdbError,
  getProject,
  getProjectPapers,
  getView,
  listPapers,
} from "@/lib/library/server";
import type { PaperPage } from "@/lib/library/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LibraryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = one(params.q);
  const view = one(params.view);
  const project = one(params.project);
  const collection = one(params.collection);
  const tag = one(params.tag);
  const status = one(params.status);
  const starred = one(params.starred) === "1";
  const unfiled = one(params.unfiled) === "1";
  const kind = one(params.kind);
  const year = one(params.year);
  const cursor = one(params.cursor);
  const t = await getTranslations("library");

  let page: PaperPage = { items: [], nextCursor: null, hasMore: false };
  let error: string | null = null;
  let heading: string = t("allPapers");

  try {
    if (project) {
      const data = await getProject(project);
      heading = data.name;
      page = await getProjectPapers(project, 50);
    } else if (view) {
      const data = await getView(view);
      heading = data.name;
      page = await listPapers({ view, q, status, kind, starred: starred || undefined, unfiled: unfiled || undefined, year: year ? Number(year) : undefined, cursor });
    } else {
      page = await listPapers({
        q,
        collection,
        tag,
        status,
        kind,
        starred: starred || undefined,
        unfiled: unfiled || undefined,
        year: year ? Number(year) : undefined,
        cursor,
      });
      if (unfiled) heading = t("unfiled");
      else if (starred) heading = t("starred");
      else if (tag) heading = `#${tag}`;
      else if (q) heading = `${t("searchResults")}: ${q}`;
      else if (collection) heading = t("collection");
      if (status) heading = `${heading} · ${t(`status_${status}`)}`;
    }
  } catch (caught) {
    error = caught instanceof PaperdbError ? caught.message : t("backendError");
  }

  const nextParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const item = one(value);
    if (item && key !== "cursor") nextParams.set(key, item);
  }
  if (page.nextCursor) nextParams.set("cursor", page.nextCursor);

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{heading}</h2>
          <p className="text-xs text-muted-foreground">
            {t("pageHint", { count: page.items.length })}
          </p>
        </div>
        <Link
          href="/library/import"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          {t("import")}
        </Link>
      </div>

      <LibraryFilters total={page.items.length} />

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
          <p className="font-medium text-destructive">{t("backendError")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        </div>
      ) : (
        <PaperTable items={page.items} />
      )}

      {(cursor || page.nextCursor) && (
        <div className="mt-3 flex items-center justify-between text-xs">
          {cursor ? (
            <Link
              href={(() => {
                const back = new URLSearchParams(nextParams);
                back.delete("cursor");
                return `/library${back.size ? `?${back.toString()}` : ""}`;
              })()}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 hover:bg-accent"
            >
              <ArrowLeft className="size-3.5" /> {t("previousPage")}
            </Link>
          ) : <span />}
          {page.nextCursor && (
            <Link
              href={`/library?${nextParams.toString()}`}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 hover:bg-accent"
            >
              {t("nextPage")} <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
