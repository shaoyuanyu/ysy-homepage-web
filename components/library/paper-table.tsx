"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Check,
  FileText,
  FlaskConical,
  FolderCog,
  MessageSquareText,
  Star,
  Upload,
  X,
} from "lucide-react";

import { useLibraryOrganize } from "@/components/library/library-organize-context";
import { OrganizeDialog } from "@/components/library/organize-dialog";
import { PaperMembershipLine } from "@/components/library/paper-membership-line";
import { buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@/lib/i18n/navigation";
import { LibraryApiError, libraryApi } from "@/lib/library/client";
import { authorLine, casLevel, ccfLevel, compactDate, venueShort } from "@/lib/library/format";
import { READING_STATUSES } from "@/lib/library/constants";
import {
  buildCollectionSubtrees,
  collectPaperMemberships,
  flattenCollections,
} from "@/lib/library/projects";
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

/** 论文的第二行：作者 + 一级主题 + 附件/批注 + 调研状态。
 *  信息都收在这一行里，不再为「文件」「标签」各开一列——表格的固定列越少，
 *  标题列就能越宽（14px 下大部分题名可以单行收住）。 */
export function PaperMeta({
  paper,
  showStaged = true,
  linkable = true,
  stacked = false,
}: {
  paper: PaperSummary;
  /** 工作区本身已经在「调研中」，行内不必再打一次标记 */
  showStaged?: boolean;
  /** 工作区里标签不做筛选入口，避免把用户带离当前工作区 */
  linkable?: boolean;
  /** 窄屏：作者独占一行，标签/附件换到下一行，作者才不会被标签挤断 */
  stacked?: boolean;
}) {
  const authors = authorLine(paper.authors, 2);
  if (stacked) {
    return (
      <div className="mt-1 min-w-0 text-xs text-muted-foreground">
        {authors !== "—" && (
          <span className="block truncate" title={authorLine(paper.authors, 12)}>
            {authors}
          </span>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <TopicTags tags={paper.tags} limit={1} linkable={linkable} wrap />
          <FileCount pdfs={paper.counts.pdfFiles} annotations={paper.counts.annotations} />
          {showStaged && paper.staged && <StagedMark />}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-1 flex min-w-0 items-center gap-x-2.5 text-xs text-muted-foreground">
      {authors !== "—" && (
        <span className="min-w-0 flex-1 truncate" title={authorLine(paper.authors, 12)}>
          {authors}
        </span>
      )}
      <TopicTags tags={paper.tags} limit={1} linkable={linkable} />
      <FileCount pdfs={paper.counts.pdfFiles} annotations={paper.counts.annotations} />
      {showStaged && paper.staged && <StagedMark />}
    </div>
  );
}

/** 调研工作区里的论文：列表现在会显式说明它们尚未入库，
 *  而不是让「14 篇文献」和 2 行结果互相矛盾。 */
function StagedMark() {
  const t = useTranslations("library");
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground/75"
      title={t("stagedHint")}
    >
      <FlaskConical className="size-3 text-muted-foreground/55" />
      {t("staged")}
    </span>
  );
}

/** 主题标签：`status/*` 已由「状态」列表达；只显示末段，整串放 title。 */
function TopicTags({
  tags,
  limit,
  className,
  linkable = false,
  wrap = false,
}: {
  tags: string[];
  limit: number;
  className?: string;
  /** 桌面表格里可点（按标签筛选）；移动端整卡已是 <a>，不能再嵌套 <a> */
  linkable?: boolean;
  /** 移动端标签可换行：320px 下两个长标签并排会被各自截成半截 */
  wrap?: boolean;
}) {
  const topics = tags.filter((path) => !path.startsWith("status/"));
  if (topics.length === 0) return null;
  const shown = topics.slice(0, limit);
  const rest = topics.length - shown.length;
  return (
    <span
      className={cn(
        "flex min-w-0 shrink-0 items-center gap-1.5",
        wrap && "flex-wrap gap-y-1",
        className,
      )}
    >
      {shown.map((path) => {
        const label = `#${path.split("/").pop()}`;
        return linkable ? (
          <Link
            key={path}
            href={`/library?tag=${encodeURIComponent(path)}`}
            title={path}
            className={cn(
              "truncate text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-2",
              wrap ? "max-w-full" : "max-w-40",
            )}
          >
            {label}
          </Link>
        ) : (
          <span
            key={path}
            title={path}
            className={cn(
              "truncate text-xs text-muted-foreground",
              wrap ? "max-w-full" : "max-w-40",
            )}
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
function StatusSelect({
  paper,
  align = "start",
}: {
  paper: PaperSummary;
  /** 桌面状态列在表格最右，弹层向右会跑出卡片；左对齐到触发器的右缘更稳 */
  align?: "start" | "end";
}) {
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

  const items = READING_STATUSES.map((item) => ({
    value: item,
    label: t(`status_${item}`),
  }));

  return (
    <Select
      items={items}
      value={status}
      onValueChange={(next) => {
        if (next) void change(next);
      }}
    >
      <SelectTrigger
        disabled={busy}
        aria-label={`${t("status")}: ${paper.title}`}
        title={t("status")}
        className={cn(
          "relative -ml-1 h-7 w-fit gap-0 rounded-md border-0 bg-transparent py-0 pl-4 pr-0.5 text-xs shadow-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 data-[size=default]:h-7 dark:bg-transparent dark:hover:bg-accent [&_svg]:!size-3",
          status === "unread"
            ? "text-muted-foreground hover:text-foreground"
            : "text-foreground/80 hover:text-foreground",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-1.5 size-1.5 rounded-full",
            statusDot[status] ?? "bg-muted-foreground/40",
          )}
        />
        <SelectValue />
      </SelectTrigger>
      {/* 行内状态触发器就在表格最右缘：让弹层在触发器下方展开并靠右对齐，
          不要用「选中项盖住触发器」的原生式对齐，否则 768px 下会顶到视口边 */}
      <SelectContent align={align} alignItemWithTrigger={false} className="min-w-36">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} label={item.label}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** 发表列：会议/期刊名 + 等级。原来把 CCF / 中科院拆成两列，页面上大半是
 *  空折线，右半边像没填完的表；合并成一列后，等级只作为论文的注脚出现。 */
export function VenueCell({ paper, compact = false }: { paper: PaperSummary; compact?: boolean }) {
  const t = useTranslations("library");
  // 列表统一 `缩写 'YY`；没有 venue 的预印本退回「预印本 '26」，不再打印长全名
  const venue =
    venueShort(paper.venue, paper.year) ??
    `${t(`kind_${paper.kind}`)} '${String(paper.year).slice(-2)}`;
  const venueTitle = paper.venue?.fullName;
  const ccf = ccfLevel(paper);
  const cas = casLevel(paper);
  const meta = [
    ccf ? `${t("ccf")} ${ccf}` : null,
    cas ? `${t("cas")} ${cas}` : null,
  ].filter(Boolean) as string[];

  // A 级 / 1 区用暖色标出：几十行里通常只有几篇顶会，等级就是列表里
  // 最有信息量的差异；B/C 保持灰阶，避免满屏彩色徽章。
  const metaItems = (inline: boolean) =>
    meta.map((item, index) => {
      const highlighted =
        (item === `${t("ccf")} A` || item === `${t("cas")} 1`) && "font-medium text-brand";
      // 桌面是上下两行（第一项不点分隔号）；手机是同一行，venue 与第一项之间也要点
      const separated = inline ? true : index > 0;
      return (
        <span
          key={item}
          className={cn(
            separated &&
              "before:mx-1 before:text-muted-foreground/40 before:content-['·']",
            highlighted,
          )}
        >
          {item}
        </span>
      );
    });

  if (compact) {
    return (
      <div className="min-w-0 text-xs leading-relaxed text-muted-foreground">
        <span
          className="inline-block max-w-full truncate align-bottom text-foreground/75"
          title={venueTitle ?? venue}
        >
          {venue}
        </span>
        {metaItems(true)}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="line-clamp-2 text-xs leading-relaxed text-foreground/75" title={venueTitle ?? venue}>
        {venue}
      </div>
      {meta.length > 0 && (
        <div className="mt-0.5 text-xs text-muted-foreground">{metaItems(false)}</div>
      )}
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

/** 列表里的评分：静态五颗星，个人库里大多数论文没打分，留一条安静的短横。
 *  不在行内做可点评分——点击目标太小、又会和整行跳转抢事件。 */
function RatingCell({ rating }: { rating: number | null }) {
  const t = useTranslations("library");
  if (!rating) {
    return (
      <span className="text-xs text-muted-foreground/40" title={t("noRating")}>
        —
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${t("rating")} ${rating}/5`}
      title={`${t("rating")} ${rating}/5`}
    >
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={cn(
            "size-3",
            value <= rating
              ? "fill-amber-400 text-amber-500"
              : "text-muted-foreground/20",
          )}
        />
      ))}
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
  // 归类弹窗的目标：批量条传当前选中的论文，行内入口传单篇。
  const [organizePapers, setOrganizePapers] = useState<PaperSummary[] | null>(null);
  const { collections, projects } = useLibraryOrganize();
  const collectionSubtrees = useMemo(
    () => buildCollectionSubtrees(collections),
    [collections],
  );
  const collectionNames = useMemo(
    () => new Map(flattenCollections(collections).map((option) => [option.id, option.name])),
    [collections],
  );
  // 每行的集合/项目归属一次算好，避免 50 行各自重复遍历集合树。
  const memberships = useMemo(
    () =>
      new Map(
        items.map((paper) => [
          paper.id,
          collectPaperMemberships(paper, collectionNames, projects, collectionSubtrees),
        ]),
      ),
    [items, collectionNames, projects, collectionSubtrees],
  );
  const allSelected = items.length > 0 && selected.size === items.length;
  const allStarred =
    selected.size > 0 &&
    items.filter((item) => selected.has(item.id)).every((item) => item.state.starred);

  const selectedIds = useMemo(() => [...selected], [selected]);
  // 没人评分时整列收起：14 行「—」不提供任何信息，还会吃掉标题宽度。
  // 给任意一篇打分后列自动出现（与原先文件列的按需显隐一致）。
  const showRating = items.some((paper) => paper.state.rating);

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
          <Select
            items={READING_STATUSES.map((item) => ({
              value: item,
              label: t(`status_${item}`),
            }))}
            value={null}
            onValueChange={(next) => {
              if (next) void bulk({ state: { status: next } });
            }}
          >
            <SelectTrigger
              aria-label={t("bulkStatus")}
              className="h-7 w-fit gap-1 rounded-md border border-border bg-background px-2 py-0 text-xs shadow-none hover:bg-accent data-[size=default]:h-7 dark:bg-background dark:hover:bg-accent [&_svg]:!size-3.5"
            >
              <SelectValue placeholder={t("bulkStatus")} />
            </SelectTrigger>
            <SelectContent align="start">
              {READING_STATUSES.map((status) => (
                <SelectItem key={status} value={status} label={t(`status_${status}`)}>
                  {t(`status_${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setOrganizePapers(items.filter((paper) => selected.has(paper.id)))
            }
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs transition-colors hover:bg-accent disabled:opacity-50"
          >
            <FolderCog className="size-3.5" /> {t("organize")}
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
              <th className="w-[150px] px-3 py-2.5 font-medium whitespace-nowrap">
                {t("venueColumn")}
              </th>
              {/* 收录 / 评分是次要信息：md 宽度先让给标题与发表，lg 起再出现 */}
              <th className="hidden w-[96px] px-3 py-2.5 font-medium whitespace-nowrap lg:table-cell">
                {t("addedColumn")}
              </th>
              <th className="w-[78px] px-2 py-2.5 font-medium whitespace-nowrap">{t("status")}</th>
              {showRating && (
                <th className="hidden w-[84px] px-2 py-2.5 font-medium whitespace-nowrap lg:table-cell">
                  {t("rating")}
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
                <td className="px-4 py-3">
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
                          className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-[1.45] tracking-[-0.005em] transition-colors hover:text-foreground hover:underline hover:underline-offset-2"
                        >
                          {paper.title}
                        </Link>
                        <StarToggle paper={paper} className="mt-px" />
                      </div>
                      <PaperMeta paper={paper} />
                      <PaperMembershipLine
                        memberships={memberships.get(paper.id) ?? []}
                        onOrganize={() => setOrganizePapers([paper])}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <VenueCell paper={paper} />
                </td>
                <td className="hidden px-3 py-3 lg:table-cell">
                  <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {compactDate(paper.createdAt)}
                  </span>
                </td>
                <td className="px-2 py-3">
                  <StatusSelect paper={paper} align="end" />
                </td>
                {showRating && (
                  <td className="hidden px-2 py-3 lg:table-cell">
                    <RatingCell rating={paper.state.rating} />
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
                <span className="block text-sm font-medium leading-[1.45] tracking-[-0.005em]">
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
                {paper.state.rating && <RatingCell rating={paper.state.rating} />}
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
                {paper.staged && <StagedMark />}
                <span className="text-xs tabular-nums text-muted-foreground/60">
                  {compactDate(paper.createdAt)}
                </span>
                {paper.state.starred && (
                  <StarToggle paper={paper} alwaysVisible className="ml-auto" />
                )}
              </div>
              <TopicTags tags={paper.tags} limit={2} linkable wrap className="mt-1.5" />
              <PaperMembershipLine
                memberships={memberships.get(paper.id) ?? []}
                onOrganize={() => setOrganizePapers([paper])}
              />
            </div>
          </li>
        ))}
      </ul>

      <OrganizeDialog
        open={organizePapers !== null}
        onOpenChange={(open) => {
          if (!open) setOrganizePapers(null);
        }}
        papers={organizePapers ?? []}
        collections={collections}
        projects={projects}
      />
    </div>
  );
}
