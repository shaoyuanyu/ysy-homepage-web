import { useTranslations } from "next-intl";

import { CcfDirectory } from "@/components/ccf/ccf-directory";
import {
  ScholarNote,
  ScholarPage,
  ScholarSourceLink,
} from "@/components/scholar/scholar-shell";
import { pageMetadata } from "@/lib/i18n/metadata";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  return pageMetadata(params, "ccf");
}

export default function CcfPage() {
  const t = useTranslations("ccf");

  return (
    <ScholarPage
      title={t("title")}
      version={t("versionBadge")}
      description={t("description")}
      meta={
        <>
          {t("source")}{" "}
          <ScholarSourceLink href="https://ccf.atom.im/">ccf.atom.im</ScholarSourceLink>
          {" · "}
          <ScholarSourceLink href="https://www.ccf.org.cn/Academic_Evaluation/By_category/">
            CCF
          </ScholarSourceLink>
        </>
      }
    >
      <CcfDirectory />
      <ScholarNote>{t("sourceNote")}</ScholarNote>
    </ScholarPage>
  );
}
