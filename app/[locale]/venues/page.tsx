import Link from "next/link";
import { useTranslations } from "next-intl";

import { VenueExplorer } from "@/components/venues/venue-explorer";
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
  return pageMetadata(params, "venues");
}

export default function VenuesPage() {
  const t = useTranslations("venues");

  return (
    <ScholarPage
      title={t("title")}
      version={t("versionBadge")}
      description={t("description")}
      meta={
        <>
          {t("source")}{" "}
          <ScholarSourceLink href="https://www.ccf.org.cn/Academic_Evaluation/By_category/">
            CCF
          </ScholarSourceLink>
          {" · "}
          <ScholarSourceLink href="https://fenqubiao.com/">中科院分区表</ScholarSourceLink>
          {" · "}
          <ScholarSourceLink href="https://github.com/ccfddl/ccf-deadlines">
            ccfddl
          </ScholarSourceLink>
        </>
      }
    >
      <VenueExplorer />
      <ScholarNote>
        {t.rich("sourceNote", {
          ccf: (chunks) => (
            <Link href="/ccf" className="underline underline-offset-4 hover:text-foreground">
              {chunks}
            </Link>
          ),
          cas: (chunks) => (
            <Link href="/cas" className="underline underline-offset-4 hover:text-foreground">
              {chunks}
            </Link>
          ),
          deadlines: (chunks) => (
            <Link
              href="/deadlines"
              className="underline underline-offset-4 hover:text-foreground"
            >
              {chunks}
            </Link>
          ),
        })}
      </ScholarNote>
    </ScholarPage>
  );
}
