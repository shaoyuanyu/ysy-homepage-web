import { useTranslations } from "next-intl";

import { CasDirectory } from "@/components/cas/cas-directory";
import {
  ScholarNote,
  ScholarPage,
  ScholarSourceLink,
} from "@/components/scholar/scholar-shell";
import { cas } from "@/lib/data";
import { pageMetadata } from "@/lib/i18n/metadata";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  return pageMetadata(params, "cas");
}

export default function CasPage() {
  const t = useTranslations("cas");

  return (
    <ScholarPage
      title={t("title")}
      version={t("versionBadge")}
      description={t("description")}
      meta={
        <>
          {t("source")}{" "}
          <ScholarSourceLink href="https://advanced.fenqubiao.com/">
            fenqubiao.com
          </ScholarSourceLink>
          {" · "}
          {t("updatedAt")} <span className="tabular-nums">{cas.fetchedAt}</span>
        </>
      }
    >
      <CasDirectory />
      <ScholarNote>{t("sourceNote")}</ScholarNote>
    </ScholarPage>
  );
}
