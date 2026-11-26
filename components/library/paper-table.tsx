"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Check,
  ChevronDown,
  FileText,
  MessageSquareText,
  Star,
  Upload,
  X,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import { authorLine, casLevel, ccfLevel, venueLine } from "@/lib/library/format";
import { READING_STATUSES } from "@/lib/library/constants";
import type { PaperSummary } from "@/lib/library/types";
import { cn } from "@/lib/utils";

/** 状态点：未读是空心圈（默认态不该抢眼），其余状态才用实色。 */
const statusDot: Record<string, string> = {
  unread: "border border-muted-foreground/50 bg-transparent",
  queued: "bg-amber-500",
  reading: "bg-sky-500",
  read: "bg-emerald-500",
  skimmed: "bg-violet-500",
};

/** 自绘复选框：原生 checkbox 在 macOS 上偏大、边框呆板，和这一版的细线条不搭。
 *  input 仍保留（sr-only），可见的方块只是它的 peer。 */
function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  className?: string;
}) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center justify-center p-1", className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="flex size-4 items-center justify-center rounded-[4px] border border-muted-foreground/35 bg-transparent text-transparent transition-colors peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-2 peer-focus-visible:ring-ring/40 peer-hover:border-muted-foreground/60"
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
    </label>
  );
}

/** 作者 + 主题标签，同一行：标签是文本入口（#tag），不再是彩色药丸。
 *  列表里每篇都挂 2–3 个「jailbreak-attack」药丸会让右缘变成一条噪声带。 */
function AuthorLine({ paper, tagLimit = 1 }: { paper: PaperSummary; tagLimit?: number }) {
  const authors = authorLine(paper.authors, 2);
  return (
    <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      {authors && authors !== "—" && (
        <span className="min-w-0 truncate" title={authorLine(paper.authors, 12)}>
          {authors}
        </span>
      )}
      <TopicTags tags={paper.tags} limit={tagLimit} linkable />
    </div>
  );
}


/** 主题标签：`status/*` 已由「状态」列表达；只显示末段，整串放 title。 */
function TopicTags({
  tags,
  limit,
  className,
  linkable = false,
}: {
  tags: string[];
  limit: number;
  className?: string;
  /** 桌面表格里可点（按标签筛选）；移动端整卡已是 <a>，不能再嵌套 <a> */
  linkable?: boolean;
}) {
  const topics = tags.filter((path) => !path.startsWith("status/"));
  if (topics.length === 0) return null;
  const shown = topics.slice(0, limit);
  const rest = topics.length - shown.length;
  return (
    <span className={cn("flex min-w-0 shrink-0 items-center gap-1.5", className)}>
      {shown.map((path) => {
        const label = `#${path.split("/").pop()}`;
        return linkable ? (
          <Link
            key={path}
            href={`/library?tag=${encodeURIComponent(path)}`}
            title={path}
            className="max-w-40 truncate text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-2"
          >
            {label}
          </Link>
        ) : (
          <span
            key={path}
            title={path}
            className="max-w-40 truncate text-xs text-muted-foreground"
          >
            {label}
          </span>
        );
      })}
      {rest > 0 && (
        <span className="shrink-0 text-xs text-muted-foreground/70" title={topics.join(", ")}>
          +{rest}
        </span>
      )}
    </span>
  );
}

/** 桌面列表的星标快捷开关：默认淡出，悬停整行或已星标时出现；移动端整卡是 <a>，不能用按钮 */
function StarToggle({
  paper,
  alwaysVisible = false,
  className,
}: {
  paper: PaperSummary;
  alwaysVisible?: boolean;
  className?: string;
}) {
  const t = useTranslations("library");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await libraryApi(`/papers/${paper.id}/state`, {
        method: "PATCH",
        body: JSON.stringify({ starred: !paper.state.starred }),
      });
      router.refresh();
    } catch {
      // 保持当前状态；失败时刷新会回到服务端值
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={paper.state.starred}
      aria-label={t("starred")}
      title={t("starred")}
      onClick={(event) => {
        event.stopPropagation();
        void toggle();
      }}
      className={cn(
        "shrink-0 rounded-md p-1 transition-all focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
        paper.state.starred
          ? "text-amber-500 hover:bg-amber-500/10"
          : alwaysVisible
            ? "text-muted-foreground/40 hover:bg-accent hover:text-amber-500"
            : "text-muted-foreground/30 opacity-0 hover:bg-accent hover:text-amber-500 focus-visible:opacity-100 group-hover/row:opacity-100",
      )}
    >
      <Star className={cn("size-3.5", paper.state.starred && "fill-amber-400")} />
    </button>
  );
}

/** 桌面表格里的状态可直接改（书架场景最高频的操作）；移动端整卡是 <a>，
 *  交互控件不能嵌进去，仍用只读 StatusLabel。 */
function StatusSelect({ paper }: { paper: PaperSummary }) {
  const t = useTranslations("library");
  const router = useRouter();
  const [status, setStatus] = useState(paper.state.status);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(paper.state.status);
  }, [paper.state.status]);

  const change = async (next: string) => {
    const previous = status;
    setStatus(next as PaperSummary["state"]["status"]);
    setBusy(true);
    try {
      await libraryApi(`/papers/${paper.id}/state`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      router.refresh();
    } catch {
      setStatus(previous);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="group/status relative -ml-1 inline-flex items-center">
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1.5 size-1.5 rounded-full",
          statusDot[status] ?? "bg-muted-foreground/40",
        )}
      />
      <select
        value={status}
        disabled={busy}
        onChange={(event) => void change(event.target.value)}
        aria-label={`${t("status")}: ${paper.title}`}
        title={t("status")}
        className={cn(
          "h-7 appearance-none rounded-md bg-transparent pl-4 pr-4 text-xs outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50",
          status === "unread"
            ? "text-muted-foreground hover:text-foreground"
            : "text-foreground/80 hover:text-foreground",
        )}
      >
        {READING_STATUSES.map((item) => (
          <option key={item} value={item}>
            {t(`status_${item}`)}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-0.5 size-3 text-muted-foreground/40 transition-opacity group-hover/status:opacity-100"
      />
    </span>
  );
}

/** 发表列：会议/期刊名 + 等级。原来把 CCF / 中科院拆成两列，页面上大半是
 *  空折线，右半边像没填完的表；合并成一列后，等级只作为论文的注脚出现。 */
function VenueCell({ paper, compact = false }: { paper: PaperSummary; compact?: boolean }) {
  const t = useTranslations("library");
  const venue = paper.venue ? venueLine(paper.venue) : "";
  const ccf = ccfLevel(paper);
  const cas = casLevel(paper);
  const yearInVenue = /\b(19|20)\d{2}\b/.test(venue);
  const meta = [
    venue ? null : t(`kind_${paper.kind}`),
    yearInVenue ? null : String(paper.year),
    ccf ? `${t("ccf")} ${ccf}` : null,
    cas ? `${t("cas")} ${cas}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="min-w-0">
      {venue && (
        <div
          className={cn(
            "text-xs leading-relaxed text-foreground/75",
            compact ? "line-clamp-1" : "line-clamp-2",
          )}
          title={venue}
        >
          {venue}
        </div>
      )}
      <div className={cn("text-xs text-muted-foreground", venue && "mt-0.5")}>
        {meta.map((item, index) => {
          // A 级 / 1 区用暖色标出：几十行里通常只有几篇顶会，等级就是列表里
          // 最有信息量的差异；B/C 保持灰阶，避免满屏彩色徽章。
          const highlighted =
            (item === `${t("ccf")} A` || item === `${t("cas")} 1`) && "font-medium text-brand";
          return (
            <span key={item} className={cn(index > 0 && "before:mx-1 before:text-muted-foreground/40 before:content-['·']", highlighted)}>
              {item}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function FileCount({ pdfs, annotations }: { pdfs: number; annotations: number }) {
  const t = useTranslations("library");
  // 没有 PDF / 批注时留白：整列 0 只会把「没有」重复 14 次，反而看不出谁有
  if (pdfs === 0 && annotations === 0) return null;
  return (
    <span className="inline-flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
      {annotations > 0 && (
        <span className="inline-flex items-center gap-0.5" title={`${t("annotations")} ${annotations}`}>
          <MessageSquareText className="size-3.5" /> {annotations}
        </span>
      )}
      {pdfs > 0 && (
        <span className="inline-flex items-center gap-0.5" title={`${t("files")} ${pdfs}`}>
          <FileText className="size-3.5" /> {pdfs}
        </span>
      )}
    </span>
  );
}

export function PaperTable({ items, filtered = false }: { items: PaperSummary[]; filtered?: boolean }) {
  const router = useRouter();
  const t = useTranslations("library");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allSelected = items.length > 0 && selected.size === items.length;
  const allStarred =
    selected.size > 0 &&
    items.filter((item) => selected.has(item.id)).every((item) => item.state.starred);

  const selectedIds = useMemo(() => [...selected], [selected]);
  // 当前页没有值的列整列隐藏：空列只会把「没有」重复十几遍，还占掉标题宽度
  const showFiles = items.some(
    (paper) => paper.counts.pdfFiles > 0 || paper.counts.annotations > 0,
  );

  // 筛选/翻页/刷新后列表变了：清掉跨列表的选中项（否则「已选 N」里混着看不见的论文）
  useEffect(() => {
    setSelected(new Set());
  }, [items]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulk = async (patch: Record<string, unknown>) => {
    if (!selectedIds.length) return;
    setBusy(true);
    setError(null);
    try {
      await libraryApi("/papers/bulk", {
        method: "PATCH",
        body: JSON.stringify({ ids: selectedIds, patch }),
      });
      setSelected(new Set());
      setTag("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof LibraryApiError ? caught.message : t("bulkFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center px-6 py-16 text-center">
        <FileText className="mb-4 size-6 text-muted-foreground/40" />
        <h2 className="text-base font-medium">{filtered ? t("noResults") : t("emptyTitle")}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {filtered ? t("noResultsHint") : t("emptyBody")}
        </p>
        {filtered ? (
          <Link
            href="/library"
            data-slot="button"
            className={buttonVariants({ variant: "outline", size: "sm", className: "mt-5" })}
          >
            <X data-icon="inline-start" /> {t("clearFilters")}
          </Link>
        ) : (
          <Link
            href="/library/import"
            data-slot="button"
            className={buttonVariants({ size: "sm", className: "mt-5" })}
          >
            <Upload data-icon="inline-start" /> {t("import")}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* 批量操作条：粘在顶栏下方。放在列表**上方**——若放在表格末尾，用户选中
          第一行后要滚到 1700px 之外才能操作（个人库几十篇时尤其别扭）。 */}
      {selected.size > 0 && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 border-b bg-brand/[0.045] px-3 py-2 shadow-sm backdrop-blur sm:px-4 dark:bg-brand/[0.08]">
          <span className="inline-flex items-center gap-2 text-xs font-medium tabular-nums">
            {t("selected", { count: selected.size })}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              aria-label={t("clearSelection")}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </span>
          <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />
          <select
            className="h-7 rounded-md border border-border bg-background px-2 text-xs outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) void bulk({ state: { status: event.target.value } });
            }}
            aria-label={t("bulkStatus")}
          >
            <option value="">{t("bulkStatus")}</option>
            {READING_STATUSES.map((status) => (
              <option key={status} value={status}>{t(`status_${status}`)}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            aria-pressed={allStarred}
            onClick={() => void bulk({ state: { starred: !allStarred } })}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs transition-colors hover:bg-accent disabled:opacity-50"
          >
            <Star className={cn("size-3.5", allStarred && "fill-amber-400 text-amber-500")} />
            {t("starred")}
          </button>
          <div className="flex min-w-0 items-center gap-1">
            <input
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              placeholder={t("bulkTagPlaceholder")}
              className="h-7 w-32 rounded-md border border-border bg-background px-2 text-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-40"
            />
            <button
              type="button"
              disabled={!tag.trim() || busy}
              onClick={() => void bulk({ addTags: [tag.trim()] })}
              className="h-7 rounded-md border border-border px-2 text-xs transition-colors hover:bg-accent disabled:opacity-40"
            >
              {t("bulkAddTag")}
            </button>
          </div>
          {busy && <span className="text-xs text-muted-foreground">…</span>}
          {error && <span className="basis-full text-xs text-destructive">{error}</span>}
        </div>
      )}

      {/* ---- 桌面：表格 ---- */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allSelected}
                    onChange={() =>
                      setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))
                    }
                    label={t("selectAll")}
                    className="-ml-1"
                  />
                  <span>{t("paper")}</span>
                </div>
              </th>
              <th className="w-[190px] px-3 py-2.5 font-medium whitespace-nowrap">
                {t("venueColumn")}
              </th>
              <th className="w-[76px] px-2 py-2.5 font-medium whitespace-nowrap">{t("status")}</th>
              {showFiles && (
                <th className="w-[58px] px-4 py-2.5 text-right font-medium whitespace-nowrap">
                  {t("files")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((paper) => (
              <tr
                key={paper.id}
                onClick={(event) => {
                  // 整行可点（标题仍是真链接，可右键/新标签打开）；排除行内控件
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  if ((event.target as HTMLElement).closest("a,button,input,select,label")) return;
                  // 拖选标题文字准备复制时不要跳转
                  if (window.getSelection()?.toString()) return;
                  router.push(`/library/papers/${paper.id}`);
                }}
                className={cn(
                  "group/row cursor-pointer border-b border-border/70 align-top transition-colors last:border-b-0 hover:bg-brand/[0.035] dark:hover:bg-brand/[0.06]",
                  selected.has(paper.id) && "bg-brand/[0.06] dark:bg-brand/[0.09]",
                )}
              >
                <td className="px-4 py-3.5">
                  <div className="flex min-w-0 items-start gap-2">
                    <Checkbox
                      checked={selected.has(paper.id)}
                      onChange={() => toggle(paper.id)}
                      label={`${t("select")} ${paper.title}`}
                      className="-ml-1 mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start gap-1">
                        <Link
                          href={`/library/papers/${paper.id}`}
                          title={paper.title}
                          className="line-clamp-2 min-w-0 flex-1 text-base font-semibold leading-snug tracking-tight transition-colors hover:text-foreground hover:underline hover:underline-offset-2"
                        >
                          {paper.title}
                        </Link>
                        <StarToggle paper={paper} className="mt-0.5" />
                      </div>
                      <AuthorLine paper={paper} />
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <VenueCell paper={paper} />
                </td>
                <td className="px-2 py-3.5">
                  <StatusSelect paper={paper} />
                </td>
                {showFiles && (
                  <td className="px-4 py-3.5 text-right">
                    <FileCount pdfs={paper.counts.pdfFiles} annotations={paper.counts.annotations} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- 移动端：卡片列表（860px 宽表格在手机上只能横向拖，信息也看不全） ---- */}
      <ul className="divide-y md:hidden">
        {items.map((paper) => (
          <li
            key={paper.id}
            className={cn(
              "flex gap-3 p-4 transition-colors active:bg-brand/[0.04]",
              selected.has(paper.id) && "bg-brand/[0.055]",
            )}
          >
            <Checkbox
              checked={selected.has(paper.id)}
              onChange={() => toggle(paper.id)}
              label={`${t("select")} ${paper.title}`}
              className="-ml-1 mt-1 shrink-0 self-start"
            />
            <div className="min-w-0 flex-1">
              {/* 只有标题区是链接；状态/星标/标签放在链接外，手机上也能直接操作
                  （把交互控件放进 <a> 是非法嵌套，点了会同时触发导航） */}
              <Link href={`/library/papers/${paper.id}`} className="block">
                <span className="block text-base font-semibold leading-snug tracking-tight">
                  {paper.title}
                </span>
                {authorLine(paper.authors, 2) !== "—" && (
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {authorLine(paper.authors, 2)}
                  </span>
                )}
                <span className="mt-1.5 block">
                  <VenueCell paper={paper} compact />
                </span>
              </Link>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusSelect paper={paper} />
                {paper.counts.pdfFiles > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                    <FileText className="size-3.5" /> {paper.counts.pdfFiles}
                  </span>
                )}
                {paper.counts.annotations > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                    <MessageSquareText className="size-3.5" /> {paper.counts.annotations}
                  </span>
                )}
                {paper.state.starred && (
                  <StarToggle paper={paper} alwaysVisible className="ml-auto" />
                )}
              </div>
              <TopicTags tags={paper.tags} limit={2} linkable className="mt-1.5" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
