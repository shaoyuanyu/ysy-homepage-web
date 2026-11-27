"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { DeleteDialog } from "@/components/library/delete-dialog";
import { toast } from "@/components/ui/toast";
import { libraryApi } from "@/lib/library/client";

export function DeletePaperButton({ paperId, title }: { paperId: string; title: string }) {
  const t = useTranslations("library");
  const router = useRouter();
  return (
    <DeleteDialog
      label={title}
      description={t("deletePaperHint")}
      onDelete={async () => {
        await libraryApi(`/papers/${paperId}`, { method: "DELETE" });
        toast.add({ title: t("paperDeleted"), type: "success" });
        router.push("/library/trash");
        router.refresh();
      }}
    />
  );
}
