import { useTranslations } from "next-intl";

export function SiteFooter() {
  const t = useTranslations("footer");

  return (
    // data-slot：邮件的「专注模式」按它隐藏页脚（`html[data-mail-focus]`，见 globals.css）。
    // ⚠ 不能直接用 `footer` 元素选择器：邮件正文里完全可能有 <footer>，那会被一起隐藏。
    <footer data-slot="site-footer" className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
        <p>{t("copyright", { year: new Date().getFullYear() })}</p>
        <p>
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground hover:underline"
          >
            {t("icp")}
          </a>
        </p>
      </div>
    </footer>
  );
}
