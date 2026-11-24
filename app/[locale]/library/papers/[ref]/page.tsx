import { getTranslations } from "next-intl/server";
import { ArrowLeft, ExternalLink, FileText, Star } from "lucide-react";

import { PaperActions } from "@/components/library/paper-actions";
import { Link } from "@/lib/i18n/navigation";
import {
  PaperdbError,
  getAnnotations,
  getCitations,
  getCollectionTree,
  getPaper,
  getPaperFiles,
  getReferences,
} from "@/lib/library/server";
import {
  authorLine,
  bytesLabel,
  kindLabel,
  shortDate,
  tagLabel,
  venueLine,
} from "@/lib/library/format";
import type { CollectionNode, PaperDetail } from "@/lib/library/types";

export const dynamic = "force-dynamic";

function flatten(nodes: CollectionNode[], map = new Map<string, string>()): Map<string, string> {
  for (const node of nodes) {
    map.set(node.id, node.name);
    flatten(node.children, map);
  }
  return map;
}

export default async function PaperPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const t = await getTranslations("library");
  let paper: PaperDetail;
  try {
    paper = await getPaper(ref);
  } catch (caught) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
        <p className="font-medium text-destructive">{t("paperNotFound")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {caught instanceof PaperdbError ? caught.message : t("backendError")}
        </p>
        <Link href="/library" className="mt-4 inline-block text-xs underline underline-offset-4">
          {t("backToLibrary")}
        </Link>
      </div>
    );
  }

  const [files, annotations, collections, references, citations] = await Promise.all([
    getPaperFiles(paper.id).catch(() => []),
    getAnnotations(paper.id).catch(() => []),
    getCollectionTree().catch(() => [] as CollectionNode[]),
    getReferences(paper.id).catch(() => ({ items: [], hasMore: false })),
    getCitations(paper.id).catch(() => ({ items: [], hasMore: false })),
  ]);
  const collectionNames = flatten(collections);

  return (
    <div className="min-w-0 space-y-4">
      <Link href="/library" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> {t("backToLibrary")}
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{kindLabel(paper.kind)}</span>
          <span>·</span>
          <span>{paper.year}</span>
          {paper.venue && <><span>·</span><span>{venueLine(paper.venue)}</span></>}
          {paper.state.starred && <Star className="size-3.5 fill-amber-400 text-amber-500" />}
          <span className="ml-auto font-mono text-[11px]">{paper.citekey}</span>
        </div>
        <h2 className="text-balance text-xl font-semibold leading-tight tracking-tight">{paper.title}</h2>
        <p className="text-sm text-muted-foreground">{authorLine(paper.authors, 12)}</p>
        <a
          href={`/api/library/papers/${paper.id}/bibtex`}
          className="inline-block text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {t("downloadBibtex")}
        </a>
        <div className="flex flex-wrap items-center gap-2">
          {paper.evaluation.ccf && (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[11px]">
              CCF {paper.evaluation.ccf.level} · {paper.evaluation.ccf.field}
            </span>
          )}
          {paper.evaluation.cas && (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px]">
              CAS {paper.evaluation.cas.level}{paper.evaluation.cas.isTop ? " Top" : ""} · {paper.evaluation.cas.majorField}
            </span>
          )}
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {t(`status_${paper.state.status}`)}
          </span>
          {paper.state.rating && <span className="text-xs text-amber-500">{"★".repeat(paper.state.rating)}</span>}
        </div>
      </header>

      <PaperActions paper={paper} />

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <section className="rounded-xl border p-4">
            <h3 className="mb-2 text-sm font-semibold">{t("abstract")}</h3>
            {paper.abstract ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{paper.abstract}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{t("noAbstract")}</p>
            )}
          </section>

          <section className="rounded-xl border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("files")}</h3>
              <span className="text-xs text-muted-foreground">{files.length}</span>
            </div>
            {files.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noFiles")}</p>
            ) : (
              <div className="space-y-2">
                {files.map((file) => (
                  <div key={file.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-2 text-xs">
                    <FileText className="size-3.5 shrink-0" />
                    <span className="font-medium">{file.originalFilename ?? `${file.id}.pdf`}</span>
                    <span className="text-muted-foreground">
                      {bytesLabel(file.byteSize)} · {file.pageCount ?? "?"}p · {file.textStatus}
                    </span>
                    {file.isPrimary && <span className="rounded bg-primary/10 px-1 text-[10px] text-primary">{t("primary")}</span>}
                    <Link
                      href={`/library/papers/${paper.id}/read`}
                      className="ml-auto inline-flex items-center gap-1 rounded border px-1.5 py-0.5 hover:bg-accent"
                    >
                      {t("read")}
                    </Link>
                    <a
                      href={`/api/library/files/${file.id}/content`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline underline-offset-4"
                    >
                      {t("openPdf")} <ExternalLink className="size-3" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("annotations")}</h3>
              <span className="text-xs text-muted-foreground">{annotations.length}</span>
            </div>
            {annotations.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noAnnotations")}</p>
            ) : (
              <div className="space-y-2">
                {annotations.map((annotation) => (
                  <div key={annotation.id} className="rounded-md border-l-2 border-amber-400 bg-muted/20 px-2.5 py-2">
                    <p className="text-xs leading-relaxed">“{annotation.quote}”</p>
                    {annotation.comment && <p className="mt-1 text-xs text-muted-foreground">{annotation.comment}</p>}
                    <p className="mt-1 text-[10px] text-muted-foreground">p.{annotation.page} · {annotation.color}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("references")}</h3>
              <span className="text-xs text-muted-foreground">{references.items.length}</span>
            </div>
            {references.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noReferences")}</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {references.items.map((item) => (
                  <li key={item.paper?.id ?? item.external?.id} className="flex gap-2">
                    <span className="text-muted-foreground">{item.paper?.year ?? item.external?.year ?? "—"}</span>
                    {item.paper ? (
                      <Link href={`/library/papers/${item.paper.id}`} className="hover:underline">{item.paper.title}</Link>
                    ) : item.external?.doi ? (
                      <a href={`https://doi.org/${item.external.doi}`} target="_blank" rel="noreferrer" className="hover:underline">
                        {item.external.title}
                      </a>
                    ) : (
                      <span>{item.external?.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("citations")}</h3>
              <span className="text-xs text-muted-foreground">{citations.items.length}</span>
            </div>
            {citations.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noCitations")}</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {citations.items.map((item) => (
                  <li key={item.paper?.id ?? item.external?.id} className="flex gap-2">
                    <span className="text-muted-foreground">{item.paper?.year ?? item.external?.year ?? "—"}</span>
                    {item.paper ? (
                      <Link href={`/library/papers/${item.paper.id}`} className="hover:underline">{item.paper.title}</Link>
                    ) : item.external?.doi ? (
                      <a href={`https://doi.org/${item.external.doi}`} target="_blank" rel="noreferrer" className="hover:underline">
                        {item.external.title}
                      </a>
                    ) : (
                      <span>{item.external?.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold">{t("metadata")}</h3>
            <dl className="space-y-1.5">
              {[
                [t("venue"), paper.venue ? venueLine(paper.venue) : "—"],
                [t("year"), String(paper.year)],
                [t("volume"), paper.volume ?? "—"],
                [t("pages"), paper.pages ?? "—"],
                [t("published"), paper.publicationDate ?? "—"],
                [t("added"), shortDate(paper.createdAt)],
                [t("updated"), shortDate(paper.updatedAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold">{t("tags")}</h3>
            {paper.tags.length === 0 ? (
              <p className="text-muted-foreground">{t("noTags")}</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {paper.tags.map((path) => (
                  <Link key={path} href={`/library?tag=${encodeURIComponent(path)}`} className="rounded bg-muted px-1.5 py-0.5 hover:underline">
                    {tagLabel(path)}
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold">{t("collections")}</h3>
            {paper.collections.length === 0 ? (
              <p className="text-muted-foreground">{t("uncollected")}</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {paper.collections.map((id) => (
                  <Link key={id} href={`/library?collection=${id}`} className="rounded bg-muted px-1.5 py-0.5 hover:underline">
                    {collectionNames.get(id) ?? id.slice(0, 8)}
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold">{t("identifiers")}</h3>
            <div className="space-y-1">
              {paper.identifiers.map((identifier) => (
                <div key={identifier.id} className="flex gap-2">
                  <span className="w-12 shrink-0 uppercase text-muted-foreground">{identifier.scheme}</span>
                  <span className="break-all font-mono text-[10px]">{identifier.value}</span>
                </div>
              ))}
              {paper.identifiers.length === 0 && <p className="text-muted-foreground">—</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
