import { getTranslations, setRequestLocale } from "next-intl/server";

import { MailPlaceholder } from "@/components/mail/mail-placeholder";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { pageMetadata } from "@/lib/i18n/metadata";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  return {
    ...(await pageMetadata(params, "mail")),
    robots: { index: false, follow: false },
  };
}

/**
 * `/mail` 的右栏（MAIL-AGENT.md 4.12）。
 * 窄屏不显示——`MailShell` 在详情路由以外会给这一栏 `hidden`，列表单独占满屏。
 */
export default async function MailboxPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("mail");

  // 宽屏下面板外壳（MailShell）已提供外框，这里只放居中内容，不再描虚线边
  return (
    <Empty className="relative min-h-[24rem] overflow-hidden">
      <EmptyMedia>
        <MailPlaceholder />
      </EmptyMedia>
      {/* 文字压在自己的底色上，不让扩散中的轮廓穿过字面 */}
      <EmptyHeader className="relative gap-3 bg-background px-8">
        <EmptyTitle className="text-lg">{t("selectMessage")}</EmptyTitle>
        <span className="h-px w-10 bg-border" />
        <EmptyDescription>{t("selectMessageHint")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
