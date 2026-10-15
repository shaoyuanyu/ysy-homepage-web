import { getTranslations, setRequestLocale } from "next-intl/server";

import { requireOwner } from "@/lib/auth/owner";
import { MailPageHeader } from "@/components/mail/mail-page-header";
import { SettingsClient } from "@/components/mail/settings-client";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "mail" });
  return {
    title: t("settings.title"),
    robots: { index: false, follow: false },
  };
}

/**
 * 邮件设置（主人专属）：全站范围的邮件设置，目前一节——远程图片白名单（4.4）。
 *
 * 2026-10-14 用户要求「『设置』入口跳转到邮件设置页面，无需挤在一个小弹窗里」——
 * 此前它是一颗弹窗按钮（白名单挤在 `max-w-md` 的小窗里）。现在与通讯录 / agent 邮件
 * 同规格：独立整页 + 共享页头（返回入口 / h1 / 描述，见 4.13）；页面按「节」排列，
 * 日后新的全站邮件设置往下加节。
 */
export default async function MailSettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requireOwner();

  const t = await getTranslations("mail");

  return (
    <div className="w-full mx-auto max-w-6xl px-4 py-12 sm:px-6">
      {/* 页头（左上角返回 / 标题 / 描述）由共享组件统一，见 MAIL-AGENT.md 4.13 */}
      <MailPageHeader title={t("settings.title")} description={t("settings.description")} />
      <SettingsClient />
    </div>
  );
}
