import { useLocale, useTranslations } from "next-intl";
import { ExternalLinkIcon, FolderGit2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { pageMetadata } from "@/lib/i18n/metadata";
import { projects } from "@/lib/data";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  return pageMetadata(params, "projects");
}

export default function ProjectsPage() {
  const t = useTranslations("projects");
  const locale = useLocale();
  const lang = locale === "zh" ? "zh" : "en";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-12 sm:px-6">
      <header className="mb-8 flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </header>

      {projects.length === 0 && (
        <Empty className="mx-auto my-auto min-h-60 w-full max-w-sm flex-none rounded-2xl border border-dashed border-border/80 px-6 py-12">
          <EmptyMedia variant="icon">
            <FolderGit2Icon aria-hidden />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t("empty")}</EmptyTitle>
            <EmptyDescription>{t("emptyHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((project) => (
          <Card key={project.name} className="flex flex-col transition-colors hover:border-primary/40">
            <CardHeader>
              <CardTitle className="font-mono text-base">
                <a
                  href={project.github ?? project.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {project.name}
                </a>
              </CardTitle>
              <CardDescription className="text-sm">{project.description[lang]}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                {project.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
              <div className="flex gap-1">
                {project.github && (
                  <a
                    href={project.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <FolderGit2Icon className="size-3.5" />
                    GitHub
                  </a>
                )}
                {project.url && (
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <ExternalLinkIcon className="size-3.5" />
                    Link
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
