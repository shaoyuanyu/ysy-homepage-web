import { getTranslations } from "next-intl/server";
import { BookOpen } from "lucide-react";

import { PdfReader } from "@/components/library/pdf-reader";
import { Link } from "@/lib/i18n/navigation";
import { PaperdbError, getPaper, getPaperFiles } from "@/lib/library/server";
import type { PaperDetail, PdfFile } from "@/lib/library/types";

export const dynamic = "force-dynamic";

export default async function ReadPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const t = await getTranslations("library");
  let paper: PaperDetail;
  let files: PdfFile[] = [];
  try {
    paper = await getPaper(ref);
    files = await getPaperFiles(paper.id);
  } catch (caught) {
    return (
      <div className="rounded-xl border p-6 text-sm">
        <p className="font-medium">{t("paperNotFound")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {caught instanceof PaperdbError ? caught.message : t("backendError")}
        </p>
        <Link href="/library" className="mt-4 inline-block text-xs underline">{t("backToLibrary")}</Link>
      </div>
    );
  }
  const file = files.find((item) => item.isPrimary) ?? files[0];
  if (!file) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <BookOpen className="mx-auto mb-3 size-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">{t("noFiles")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("readerUploadHint")}</p>
        <Link href={`/library/papers/${paper.id}`} className="mt-4 inline-block text-xs underline">
          {t("backToPaper")}
        </Link>
      </div>
    );
  }
  return <PdfReader paper={paper} file={file} />;
}
