import { getTranslations, setRequestLocale } from "next-intl/server";

import { decodeMessageId } from "@/lib/mail/id";
import { MessageView } from "@/components/mail/message-view";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "mail" });
  return {
    title: t("title"),
    robots: { index: false, follow: false },
  };
}

/**
 * 单封邮件（主人专属）；id 为 base64url 编码的 messageId（`lib/mail/id.ts`）。
 *
 * 只渲染右栏内容——外壳（页面标题、入口、左栏列表、两栏布局）在
 * `(mailbox)/layout.tsx` 的 `MailShell` 里，`requireOwner` 也由那儿统一守卫。
 */
export default async function MailMessagePage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const messageId = decodeMessageId(id);

  return (
    // ⚠ `key`（2026-10-17 审计）：App Router 在 `/mail/message/:id` 之间导航时复用同一个
    // 页面/组件实例——不加 key，MessageView 里所有「按封」状态都会跨信遗留：快速回复
    // 里写给 A 的文字会出现在 B 的输入框里（发送时用的却是 B 的收件人）、A 的错误页会
    // 粘在 B 上、对 A 点过「显示图片」后 B 就没有那个按钮了。见 MAIL-AGENT.md 4.12。
    <MessageView key={messageId} messageId={messageId} />
  );
}
