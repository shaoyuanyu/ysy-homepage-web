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
 *
 * 空态由三层组成（2026-10-18 重做）：
 *   1. 背景质地：纸面点阵 + 两圈极淡的同心圆。圆环层用 `mail-empty-rings` 的
 *      渐变遮罩向下淡出，不穿到标题与说明文字上。
 *   2. 插画：`MailPlaceholder`（打开的信 + 四封漂浮的信，12 秒一轮）。
 *   3. 文案与键位提示：选一封邮件做什么，以及「↑ / ↓ 浏览、Enter 打开」
 *      这两条真实存在的列表操作。
 */
export default async function MailboxPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("mail");

  // 宽屏下面板外壳（MailShell）已提供外框，这里只放居中内容，不再描虚线边
  return (
    <Empty className="relative min-h-[26rem] flex-1 overflow-hidden px-6 py-10 sm:px-8">
      {/* 背景质地：全部 aria-hidden，且 strict pointer-events-none，不参与交互 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="mail-empty-grid absolute inset-0" />
        <div className="mail-empty-rings absolute inset-0">
          <div className="absolute top-[40%] left-1/2 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70" />
          <div className="absolute top-[40%] left-1/2 size-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-border/50" />
        </div>
      </div>

      <EmptyMedia className="relative mb-0 w-full max-w-[32rem]">
        <MailPlaceholder className="w-full" />
      </EmptyMedia>

      <EmptyHeader className="relative max-w-md gap-3.5">
        <EmptyTitle className="text-xl font-semibold tracking-tight">
          {t("selectMessage")}
        </EmptyTitle>
        <span aria-hidden className="h-px w-10 bg-border" />
        <EmptyDescription className="max-w-[24rem] text-pretty">
          {t("selectMessageHint")}
        </EmptyDescription>
        {/* 键盘提示：只作一行脚注，不用键帽盒子——键帽+竖线会让空态看起来像
            组件库的快捷键演示。方向键与 Enter 用等宽字形区分，其余文字保持正文 */}
        <p className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono">↑ ↓</span>
          <span>{t("emptyHintBrowse")}</span>
          <span aria-hidden className="text-muted-foreground/40">
            ·
          </span>
          <span className="font-mono">Enter</span>
          <span>{t("emptyHintOpen")}</span>
        </p>
      </EmptyHeader>
    </Empty>
  );
}
