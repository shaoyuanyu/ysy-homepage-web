"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  FilePenLineIcon,
  InboxIcon,
  LogInIcon,
  MailCheckIcon,
  PaperclipIcon,
  RefreshCwIcon,
  SearchIcon,
  SquarePenIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Link, usePathname, useRouter } from "@/lib/i18n/navigation";
import { decodeMessageId, encodeMessageId, MAIL_LIST_ORDER_KEY } from "@/lib/mail/id";
import { formatDate } from "@/lib/mail/format";
import { mailNavOptions } from "@/lib/mail/nav";
import { useOwnAddresses } from "@/lib/mail/use-own-addresses";
import { MAIL_ACCOUNTS_CHANGED_EVENT } from "@/components/mail/accounts-dialog";
import { MAIL_DRAFTS_CHANGED_EVENT } from "@/components/mail/compose-form";
import { broadcastItemChange, MAIL_ITEM_CHANGED_EVENT, type MailItemChange } from "@/components/mail/message-view";
import { MAIL_UNREAD_EVENT } from "@/components/mail/new-mail-notifier";
import { AccountMenu } from "@/components/mail/account-menu";
import { MailBatchBar } from "@/components/mail/mail-batch-bar";
import { MailRow, ThreadChildRow } from "@/components/mail/mail-row";
import { accountDotProps } from "@/components/mail/account-dot";
import { accountName } from "@/components/mail/account-label";
import { MOTION_SIZE, TOOLBAR_MS } from "@/components/mail/motion";
import { usePublishMailBar } from "@/components/mail/mail-statusbar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchInput } from "@/components/ui/search-input";
import { type BackfillState } from "@/components/mail/sync-status";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { toast } from "@/components/ui/toast";
import { mailErrorKind, mailErrorText } from "@/lib/mail/error-text";
import { fetchWithTimeout } from "@/lib/mail/fetch-timeout";
import { insertByListOrder } from "@/lib/mail/order";
import { JUNK_UNDO_WINDOW_MS } from "@/lib/mail/undo";
import type {
  MailAccount,
  MailDraft,
  MailFolder,
  MailListItem,
  MailListResponse,
} from "@/lib/mail/types";

/**
 * 视图切换（2026-10-05 微调，用户定稿）：下划线 Tabs「全部 / 收件（默认）/ 发件 / 草稿 / 垃圾」——
 * 纯方向维度 + 独立的草稿箱（2026-10-06 用户指定：草稿不算入「全部」——草稿来自
 * webmaild /drafts，与 messages 完全分离，只有这个 tab 会读它）
 * + 独立的垃圾箱（2026-10-08 用户要求新增：垃圾是**文件夹**维度，但它是"我该看一眼"的
 * 少数几个位置之一，值一个 tab；见下方 junkFolders 的实现注记）。
 * 「星标」从视图降为与「未读」并列的独立开关，放在 tab 行右侧，
 * 可与任意方向叠加（星标 ∩ 收件 / 发件 / 全部都合法）。
 * - 收件（默认，邮箱的直觉入口）/ 发件 → 服务端 `direction` 参数；全部 → 不带方向参数
 * - 草稿 → 不查 /messages，单独 GET /drafts（行点击进 /mail/compose?draft=<id>）
 * - 垃圾 → 服务端 `folder` 参数（多个 = 并集）：路径先按账号探测（`GET /folders`），
 *   见 junkFolders
 * - 「未读」「星标」两个开关 → `filter` 逗号多值取交集（如 星标+未读 = `filter=flagged,unseen`）；
 *   未读计数「(n)」挂在「未读」开关上（2026-10-05 用户改：原在「收件」tab 徽标——
 *   「发件」不可能有未读，挂在方向 tab 上语义刻意；未读开关与方向无关，语义自然对齐）
 * - tab 下划线着色 = 方向配色（收件 emerald / 发件 amber，与头像方向角标、agent 页方向徽章同源）
 *
 * ⚠ 「文件夹」视图（按任意文件夹浏览）已于 2026-10-07 **删除**（用户定稿，勿加回）：
 * 它把「数据位置」混进「数据切片」，5 个 tab 把右侧两个开关挤到第二行。⚠ 但「垃圾」
 * 不是这个坑的重演——它是**一个固定的特殊用途**（服务商自己认定的 `\Junk`），语义上
 * 与「草稿」（另一个固定特殊用途）同级，不是"让用户随便挑一个文件夹看"。
 * 空间不够时的做法见下方 tab 条的注释（收进 chevron 下拉）。
 */
type ViewFilter = "all" | "received" | "sent" | "drafts" | "junk";

/** tab 落进 URL 的查询参数名（见 `view` 状态的注释） */
const VIEW_PARAM = "view";

/** 查询串里的 view 是否合法（非法值一律回落到默认 tab，避免手改 URL 把列表搞成空白） */
function isViewFilter(v: string | null): v is ViewFilter {
  return v === "all" || v === "received" || v === "sent" || v === "drafts" || v === "junk";
}

/**
 * 行 1 的固定开销：搜索图标 28 +「全部标为已读」28 + 刷新 28，加四个间距
 * （gap-1.5 = 6px × 4，五个子项之间）。账号触发器与「写邮件」分享剩下的宽
 * （分配规则见组件内「行 1 的宽度分配」注释）。
 * ⚠ 「选择」（多选批量）曾占这里的一个 28px 图标位（2026-10-07 ~ 2026-10-08），代价是
 *   账号触发器从 198 掉到 168：**邮箱那一行被裁掉 30px**（`me@mail.shaoyuanyu.cn` 需
 *   145、只剩 115，实测中英文各裁 30 / 24px）。2026-10-08 按用户要求把它搬进**行内
 *   悬浮气泡栏**（`mail-row-actions`，见列表行），账号这才拿回 198px 的完整宽。
 *   改这一行常量前先重量：`.cache/probe-select-pos.mjs` 会同时报账号宽与邮箱裁切量。
 */
const ROW_FIXED_W = 28 * 3 + 24;

/**
 * 「写邮件」缩为纯图标时的宽（边框 2 + 内边距 12 + 图标 14 = 28；与搜索/刷新图标钮对齐）。
 * ⚠ 行 1 分配里用它当「收窄后的写邮件宽」，完整态宽另由 `composeFullW` 实测。
 */
const COMPOSE_ICON_W = 28;

/**
 * 一次批量删除的**封数**上限（2026-10-11 用户定稿：一次不超过 20 封）。
 *
 * ⚠ 与 webmail 仓库 `webmail/src/api.ts` 的 `MAX_SCOPE_DELETE_MESSAGES` **是同一个数、
 *   各持一份**（两个独立包，不能互 import）——改一处必须改另一处。
 *   那边是**边界**（超了直接 400），这里只是按钮态（变灰 + 说明为什么）。
 */
const MAX_BATCH_DELETE = 20;

/** 加载占位：列表行骨架（4.9：不用居中 spinner 充数） */
function ListSkeleton() {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border lg:rounded-none lg:border-0" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3">
          <Skeleton className="size-8 shrink-0 self-center rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * 邮件合并视图：默认全部账号合并，工具栏可筛选账号与状态（4.2）。
 *
 * `backfill` / `firstSync`（2026-10-08）：由 MailShell 的同步状态轮询传下来——有新账号
 * 的**历史回填**（有 x/y 数字）或**首轮还没跑完**（数字还出不来）在跑时，列表每 15 秒
 * 静默重取一次（不带 loading，不闪），于是「最新优先」抓到的邮件会自己冒出来，
 * 用户不必反复手动刷新等结果。
 */
export function MailClient({
  backfill,
  firstSync,
}: {
  backfill?: BackfillState | null;
  firstSync?: boolean;
}) {
  const t = useTranslations("mail");
  const router = useRouter();
  const pathname = usePathname();
  // 右栏正在看哪一封（宽屏两栏布局下左栏据此高亮；窄屏列表被隐藏，无实际影响）
  const activeId = useMemo(
    () => (pathname.startsWith("/mail/message/") ? pathname.slice("/mail/message/".length) : null),
    [pathname],
  );
  /**
   * 右栏正在看的那一封的 **messageId**（`activeId` 是 base64url 编码形式，见 lib/mail/id）。
   * 列表行按它算一个 boolean 传下去——若把编码串直接传给每一行，任一次切换都会让
   * 全部行重渲（见 mail-row.tsx 的 memo 说明）。
   */
  const activeMessageId = useMemo(() => {
    if (!activeId) return null;
    try {
      return decodeMessageId(activeId);
    } catch {
      return null;
    }
  }, [activeId]);

  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  // 自己的地址（收件人视角的「双向邮件」判定：发件人与收件人都是我的账号，2026-10-06）
  const { ready: ownReady, emails: ownEmails } = useOwnAddresses();
  // 账号筛选（2026-10-05 用户定稿）：单选——"all"（全部账号）或某个账号 id；
  // 控件 = 工具栏行 1 首个下拉（完整显示名称/地址）；底栏只保留只读指示。
  const [accountFilter, setAccountFilter] = useState<string>("all");
  /**
   * 当前视图 tab。**默认「全部」**（2026-10-10 第七轮用户指定，此前是「收件」），
   * 并把 tab **落进 URL**（`?view=…`）——用户同一轮提的「刷新页面后不应该把 tab 重置为
   * 默认 tab」：刷新/书签/分享都回到同一个 tab。
   *
   * ⚠ 用原生 `history.replaceState` 而不是 `router.replace`：App Router 对只差查询串的
   *   替换会去取一次 RSC（列表在 layout 里不受影响，但右侧详情页会白重取一次、切 tab 时
   *   闪一下）。原生写法只改地址栏，`view` 由 state 驱动。
   * ⚠ 初值从 URL 读（服务端渲染时 URL 本来就带着查询串，因此不存在水合不一致）。
   */
  const searchParams = useSearchParams();
  const [view, setView] = useState<ViewFilter>(() => {
    const fromUrl = searchParams.get(VIEW_PARAM);
    return isViewFilter(fromUrl) ? fromUrl : "all";
  });
  /** 切 tab：改 state + 同步地址栏（默认 tab 不写参数，URL 保持干净） */
  const changeView = useCallback((next: ViewFilter) => {
    setView(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete(VIEW_PARAM);
    else url.searchParams.set(VIEW_PARAM, next);
    window.history.replaceState(null, "", url);
  }, []);
  const [unseenOnly, setUnseenOnly] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  /**
   * 垃圾视图（2026-10-08 用户要求新增「垃圾」tab）。
   *
   * 各家的垃圾文件夹名字不同（阿里云「垃圾邮件」、Gmail `[Gmail]/Spam`…），所以路径
   * **由服务端探测**（`GET /folders` 里 `specialUse === "\\Junk"` 的那些），前端只负责
   * 拼 `folder` 参数（每个账号一个，服务端取并集）。路径按账号缓存，账号配置变化时清空。
   * ⚠ 只有**在同步白名单里**的垃圾文件夹才查得到邮件——没同步的文件夹本地根本没有副本。
   *   这一点要作为空态文案说出来，否则「垃圾」页永远空白且没有解释（见 junkNote）。
   */
  const junkCacheRef = useRef<Map<string, { hasFolder: boolean; synced: string[] }>>(new Map());
  const [junkNote, setJunkNote] = useState<"none" | "unsynced" | null>(null);
  /**
   * 多选批量操作（2026-10-07，MAIL-AGENT.md 4.16）：`selectMode` 打开后列表行变成
   * "点一下 = 勾选/取消"（不再跳转），列表上方出现批量操作条。
   * - 选中集合按 **messageId** 记（跨账号合并视图里一行 = 一封邮件，与删除/移动的
   *   "全部副本一起动"口径一致）；
   * - 切换视图 / 账号 / 搜索词时**清空选择**——否则会对看不见的行动手（用户无从核对）；
   * - 草稿视图不参与（草稿有自己的行内删除，也不是 messages 数据源）。
   */
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** 批量操作进行中（禁用所有批量按钮，防连点重复提交） */
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  /**
   * 「全选」的两种范围（2026-10-11 用户定稿）：逐行勾选 = 只选这几封；点「全选」= 选中
   * **当前筛选范围内全部匹配**（服务端现算，不受已加载页数限制）。
   * - `allMatching` 是**模态标志**：为真时选中集合为空、批量动作走 `scope` 而不是 messageIds；
   * - `excluded` = 「全部匹配」里用户**逐行取消掉**的那几封（Gmail 同款：先全选、再点掉个别）。
   *   已加载的行勾选态 = `allMatching ? !excluded.has(id) : selected.has(id)`；
   *   名单会随请求发给服务端（`exclude`），保证「界面说的数」= 「真正动的数」；
   * - `matchCount` = 服务端给的范围封数（拉取中 / 失败时为 null）：既显示给用户，也用来判
   *   「删除是不是超了 20 封上限」；
   * - `listQuery` = 最近一次列表加载用的查询串（**不含 `before` 游标**），即「当前筛选」
   *   的完整定义。范围执行时原样交给服务端——口径只在 `load` 里构造一处，不可能漂移。
   *   ⚠ 类型是 `string | null`：**空串是合法范围**（「全部」tab + 全部账号 + 无筛选 = 不加
   *   任何参数）。用 `""` 当「还没加载」会让最常见的那个视图直接失效——真实界面上表现为
   *   「点了全选，一直显示 已选 0 封」（2026-10-11 用户截图报障）。
   */
  const [allMatching, setAllMatching] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [listQuery, setListQuery] = useState<string | null>(null);
  /**
   * 当前视图下「真正生效」的筛选值（2026-10-06 用户定稿）：「未读」在「发件」「草稿」
   * 不可用（「发件」不可能有未读——与「草稿」同规则；「星标」仅「草稿」不可用，
   * 发件加星是真实用例）。不可用 = 按钮禁用 + **查询不携带** + 显示为关；开关状态本身
   * 保留（收件里开着「未读」切到发件再切回来，仍是开的）。
   * ⚠ 查询与显示（含空态文案）都必须用这份生效值：若查询沿用原始开关，从收件带过来的
   *   「未读」会把发件列表静默压空，而按钮此刻已禁用、用户无法取消它。
   *
   * ⚠ 「垃圾」第九轮从"禁用"改为"**就地筛选**"（用户定稿）：垃圾邮件也有已读/未读
   * （协议上就是每份副本自己的 `\Seen`），所以「垃圾」tab 里打开「未读」= 只看垃圾箱里
   * 未读的那几封；服务端 `unseenClause` 在给了 `folder` 时按「收件箱优先、否则该范围」
   * 判定，与行的加粗同判据。
   * ⚠ 但**数字不跟着走**：开关上的计数（以及大标题角标 / 底栏 / 账号角标）永远只数收件箱
   *   ——「垃圾」tab 里因此**不显示**那个数字（见 ToggleGroupItem 的渲染），否则又回到
   *   第六轮那个「数字说 2、点开列出 7 封」的自相矛盾。
   */
  const unseenActive = unseenOnly && view !== "sent" && view !== "drafts";
  const flaggedActive = flaggedOnly && view !== "drafts";
  /** 已提交（触发加载）的搜索词；输入框的即时值另存 qInput（300ms 防抖后提交） */
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  /** 搜索展开态（2026-10-05 定稿）：收起时行 1 是一个图标按钮，展开时账号收窄为「色点 + ≤4 字名」 */
  const [searchOpen, setSearchOpen] = useState(false);
  /**
   * 搜索框「退场保留期」（2026-10-05 用户定稿「动画统一联动」）：关闭后让输入框再挂
   * TOOLBAR_MS 播完淡出动画、再卸载成图标——否则输入框会瞬碎，与其它组件的 300ms 联动动画割裂。
   */
  const [searchClosing, setSearchClosing] = useState(false);

  // ---- 行 1 的宽度分配（2026-10-05 定稿；2026-10-12 恢复「装不下就缩写邮件」）----
  // 两条规则：
  //   ① 搜索展开时「写邮件」缩为图标（2026-10-05 用户要求）——搜索框才是主角；
  //   ② **账号格真的装不下时**也缩（2026-10-12 用户要求：长地址也该显示全）：账号触发器的
  //      **实测**需求宽 > 「写邮件保持完整」时的可用宽 ⇒ 压成图标（让出 74−28 = 46px），
  //      账号地址随即完整上屏；切回短文案（「全部账号」、短备注名）自动恢复文字。
  // ⚠ 判据两边都必须是**稳定量**，否则会在「收窄 → 变宽 → 又不收窄」之间振荡：
  //   需求宽 = AccountMenu 探针实测的完整文案宽（与当前形态无关）；
  //   可用宽 = rowW − 固定开销 − composeFullW（写邮件**完整态**的缓存宽，不是当前形态）。
  // ⚠ 别再退回 2026-10-05 那版「账号需求宽按常量预算算」的写法：单行账号时代 `我<邮箱>` 就要
  //   233px，判据在英文（Compose 95px）下**恒为真** → 写邮件永远没文字、取消搜索也不恢复
  //   （用户两次报障后整条规则被删）。现在的判据只在选中长文案账号时为真，且与搜索态解耦。
  // ⚠ 2026-10-05 二稿：「缩为图标」不是瞬变，而是与账号同曲线动画（gap + grid 轨道 +
  //   文字透明度，见 motion.ts）——写邮件宽度本身就是搜索框（flex-1）宽度的来源之一，
  //   它的收窄与账号收窄是**同一段联动动画**的两个声部。
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowW, setRowW] = useState(384); // 初值 = 桌面左栏内容宽；挂载后按实测（窄屏行 1 是全宽）
  const [composeFullW, setComposeFullW] = useState(0);
  /** 账号触发器需要的宽（px；由 AccountMenu 的探针实测上报，0 = 还没量到） */
  const [accountWantW, setAccountWantW] = useState(0);
  /** 「写邮件保持完整文字」时账号格最多能有多大 */
  const accountAvailFull = Math.max(72, rowW - ROW_FIXED_W - composeFullW);
  /** + 1 是亚像素余量：恰好相等时不该判成「装不下」 */
  const accountSqueezed = accountWantW > 0 && accountWantW > accountAvailFull + 1;
  const composeCompact = searchOpen || accountSqueezed;
  /** 账号触发器的 max-width：除去固定开销与写邮件（按当前形态）的宽全给它 */
  const accountMaxW = Math.max(
    72,
    rowW - ROW_FIXED_W - (composeCompact ? COMPOSE_ICON_W : composeFullW),
  );

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const measure = () => setRowW(el.clientWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // 写邮件「完整态」宽实测（图标态 28px 不更新缓存；字体就绪 / 切语言后重测）
  const composeRef = useRef<HTMLAnchorElement>(null);
  const locale = useLocale();
  useEffect(() => {
    const el = composeRef.current;
    // ⚠ 收起态（含其 300ms 过渡中）不测量：图标态与中间值都会污染缓存，而缩窄判据
    //   要求这个输入与「当前是否已缩」无关（否则会逐帧振荡）
    if (!el || composeCompact) return;
    const measure = () => {
      // 展开过渡中量到的是中间值——getAnimations 排除，等 settle 后再复测终值
      if (el.getAnimations({ subtree: true }).length > 0) return;
      const w = el.offsetWidth;
      if (w > 40) setComposeFullW(w);
    };
    measure();
    const settle = window.setTimeout(measure, TOOLBAR_MS + 80);
    // 字体加载完成后重测（Inter 未就绪时量出的文字宽偏小）
    void (document.fonts?.ready ?? Promise.resolve()).then(measure).catch(() => {});
    return () => window.clearTimeout(settle);
    // ⚠ rowW 也是依赖（2026-10-05 隐藏挂载 bug）：直达 /mail/compose 时本组件在
    //   display:none 下挂载，量不到写邮件宽（offsetWidth = 0 被 `w > 40` 跳过）——
    //   composeFullW 停在 0 → 回邮箱后 accountMaxW 偏宽（384−108−0 = 276）。rowW 在
    //   恢复显示时由 ResizeObserver 从 0 报回实测值（行上已实证），那一刻触发本 effect
    //   重测。⚠ 勿给 rowW 的 measure 加「0 不写入」守卫：那个 0→384 的变化正是本 effect
    //   的重新触发信号（隐藏期的 rowW=0 不可见、无副作用）。
  }, [composeCompact, locale, rowW]);
  const [items, setItems] = useState<MailListItem[]>([]);

  /**
   * 乐观 UI 的三个基本动作（2026-10-10 用户要求「乐观 UI」）。
   *
   * 背景：**行为类**动作（标记 / 标为垃圾 / 移出垃圾 / 删除 / 撤销）的真实耗时是**一次
   * IMAP 往返**（建连 + SELECT + 命令；连接池上线前实测约 1 秒）。等它回来再改界面，
   * 用户点下去就是"卡一下"。改成**点下去立刻改列表**——用户的"完成"信号就是那一行变化
   * ——请求在后台跑，失败再用原数据还原并报错。
   *
   * ⚠ **内容类操作不走这一套**（发信、存草稿）：它们的失败会丢用户的字，必须等服务端
   *   确认（用户 2026-10-10 明确要求）。
   * ⚠ 放回必须按**服务端同一排序**插回（`insertByListOrder`），不是 push 到末尾：
   *   顺序错乱比"慢"更糟。
   * ⚠ 插回前查重：这期间用户可能刷新过列表，那一行可能已经在了。
   * ⚠ 回滚只回列表，**不回服务端**——服务端本来就没被改动（请求失败了），列表现状
   *   才是偏离真实状态的那一方。
   */
  const patchItem = useCallback((messageId: string, change: Partial<MailListItem>) => {
    setItems((prev) => prev.map((m) => (m.messageId === messageId ? { ...m, ...change } : m)));
  }, []);
  const removeRow = useCallback((messageId: string) => {
    setItems((prev) => prev.filter((x) => x.messageId !== messageId));
    setStaleIds((prev) => {
      if (!prev.has(messageId)) return prev;
      const next = new Set(prev);
      next.delete(messageId);
      return next;
    });
  }, []);
  const restoreRow = useCallback((m: MailListItem, stale = false) => {
    setItems((prev) => insertByListOrder(prev, m));
    if (stale) setStaleIds((prev) => new Set(prev).add(m.messageId));
  }, []);

  /**
   * 数据可能已过期的行（`MailRow` 的 `stale`）：乐观放回时手里那份 `copies` 是
   * **操作之前**的（uid 可能已失效），所以先不给行内操作条——否则用户再点一下就会
   * 拿着过期 uid 去搬**别的邮件**。下一次整表重取时清空。
   */
  const [staleIds, setStaleIds] = useState<Set<string>>(new Set());
  /** 草稿列表（「草稿」tab 专用；null = 尚未加载） */
  const [drafts, setDrafts] = useState<MailDraft[] | null>(null);
  /**
   * 草稿箱两段式读取（2026-10-10：草稿以服务商草稿文件夹为唯一事实源）：
   * ① 先读本地缓存（快）→ 立刻出列表；② 再 `?refresh=1` 去服务商那边对一遍（手机写的
   * 草稿由此进来、服务端删掉的从缓存清掉），回来后原地替换。实测 QQ 那 153 封草的核对
   * 要十几秒（跨境 IMAP），所以不能把它挡在首屏前面。
   */
  const [draftsSyncing, setDraftsSyncing] = useState(false);
  /** 核对失败的账号（下面显示"当前是本地缓存"，别让用户以为草稿箱空了） */
  const [draftErrors, setDraftErrors] = useState<string[]>([]);
  /** 「更早的草稿」折叠区（默认收起：QQ 草稿箱里有 141 封 2014 年起的旧草稿） */
  const [olderDraftsOpen, setOlderDraftsOpen] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  /**
   * 列表游标（草稿箱要视而不见）——2026-10-10：草稿的数据源是 `/drafts` 全量返回、根本没有
   * 分页，但 `next` 还留着上一个邮件视图的游标，于是**草稿列表下面会冒出一个「加载更多」**，
   * 点它只会去拉一页邮件追加到看不见的 `items` 上（哨兵还会自动续页）。
   */
  const pagedNext = view === "drafts" ? null : next;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** 「全部标为已读」执行中（按钮进 spinner） */
  const [markingAll, setMarkingAll] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MailListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** 待确认删除的草稿（草稿箱行内删除） */
  const [pendingDraftDelete, setPendingDraftDelete] = useState<MailDraft | null>(null);
  const [deletingDraft, setDeletingDraft] = useState(false);
  // 加载序号：只有「最后一次加载」的响应允许落地（连点 tab 时防旧响应覆盖新结果）
  const loadSeqRef = useRef(0);
  // 首次加载完成前显示骨架屏；之后重载保持旧内容（避免每次点筛选都闪一下骨架）
  const hasLoadedRef = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);
  /** 底部哨兵节点：用 **state** 而不是 `useRef` —— 节点被 React 重建时观察器必须重挂，
   *  见下方「无限滚动」的注释（旧实现用 ref、effect 依赖里看不见节点变化，无限滚动静默失效） */
  const [sentinelNode, setSentinelNode] = useState<HTMLDivElement | null>(null);
  /** 哨兵是否落在（含 300px 余量的）视口里 —— 自动续页由它驱动 */
  const [sentinelInView, setSentinelInView] = useState(false);

  const load = useCallback(
    async (opts: {
      account: string;
      view: ViewFilter;
      unseen: boolean;
      flagged: boolean;
      q: string;
      before?: string | null;
      append?: boolean;
      /** 垃圾视图：每个（账号, 路径）一项，服务端取并集（见 junkFolders） */
      folders?: { account: string; path: string }[];
    }) => {
      const params = new URLSearchParams();
      // 完整加载（非「加载更多」）递增序号：先发后到的旧响应会被丢弃（append 不递增，
      // 它只是给当前列表续页，不应作废进行中的刷新）
      const seq = opts.append ? loadSeqRef.current : ++loadSeqRef.current;
      // 账号单选：「全部账号」不传参数（服务端 account 仍支持逗号多值，前端只发单值）
      if (opts.account !== "all") params.set("account", opts.account);
      // 状态：星标 / 未读两个开关可叠加（逗号多值，服务端取交集）
      const status = [opts.flagged ? "flagged" : "", opts.unseen ? "unseen" : ""]
        .filter(Boolean)
        .join(",");
      if (status) params.set("filter", status);
      if (opts.view === "received") params.set("direction", "received");
      if (opts.view === "sent") params.set("direction", "sent");
      if (opts.q.trim()) params.set("q", opts.q.trim());
      // 垃圾视图：每个（账号, 路径）一个 `folder` 参数（服务端并集；⚠ 不用逗号拼，
      // 文件夹名里可以有逗号）
      for (const f of opts.folders ?? []) {
        params.append("folder", f.account ? `${f.account}|${f.path}` : f.path);
      }
      // 「全选全部匹配」的范围就是这一串（**不含 before 游标**）：即「当前筛选」的完整定义。
      // 存进 state 是为了让「匹配总数」随筛选变化重新拉取；范围执行时原样发给服务端。
      setListQuery(params.toString());
      if (opts.before) params.set("before", opts.before);
      // 读路径统一 20s 超时（fetchWithTimeout）：服务半死时不能再无限转骨架
      const res = await fetchWithTimeout(`/api/mail/messages?${params}`);
      if (seq !== loadSeqRef.current) return; // 过期响应：静默丢弃（连点筛选时的旧结果）
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `${res.status}`);
      const data = (await res.json()) as MailListResponse;
      if (seq !== loadSeqRef.current) return;
      setItems((prev) => {
        const merged = opts.append ? [...prev, ...data.items] : data.items;
        // 详情页「上一封 / 下一封」按此顺序导航（4.9）
        try {
          window.sessionStorage.setItem(
            MAIL_LIST_ORDER_KEY,
            JSON.stringify(merged.map((m) => m.messageId)),
          );
        } catch {
          // sessionStorage 不可用（隐私模式等）：跳过，详情页导航自动隐藏
        }
        return merged;
      });
      setNext(data.next);
    },
    [],
  );

  // 账号列表（筛选 chips、色点与未读数徽章）
  const loadAccounts = useCallback(() => {
    fetchWithTimeout("/api/mail/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: MailAccount[]) => setAccounts(data.filter((a) => a.enabled)))
      .catch(() => {});
  }, []);

  /** 草稿箱加载（「草稿」tab 与写信页保存广播共用；数据量小，整表拉取） */
  const loadDrafts = useCallback(async () => {
    // ① 本地缓存先出列表（快、断网也能看）
    try {
      const r = await fetchWithTimeout("/api/mail/drafts");
      const data = (await r.json()) as { items?: MailDraft[]; errors?: { error: string }[] };
      setDrafts(data.items ?? []);
      setDraftErrors((data.errors ?? []).map((e) => e.error));
    } catch {
      setDrafts([]);
      return;
    }
    // ② 再去服务商草稿箱对一遍（手机写的草稿由此进来）。TTL 在后端，来回切 tab 不会再刷。
    setDraftsSyncing(true);
    try {
      // 跨境 IMAP 核对可能要十几秒，给比普通读路径更宽的上限
      const r = await fetchWithTimeout("/api/mail/drafts?refresh=1", undefined, 60_000);
      const data = (await r.json()) as { items?: MailDraft[]; errors?: { error: string }[] };
      setDrafts(data.items ?? []);
      setDraftErrors((data.errors ?? []).map((e) => e.error));
    } catch {
      // 核对失败：留着缓存那份，不打扰（下面会显示"显示的是本地缓存"）
    } finally {
      setDraftsSyncing(false);
    }
  }, []);

  // 草稿视图：进入时加载 + 监听写信页的保存/删除广播（写完回来列表是新数据）
  useEffect(() => {
    if (view !== "drafts") return;
    loadDrafts();
    const onChanged = () => loadDrafts();
    window.addEventListener(MAIL_DRAFTS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(MAIL_DRAFTS_CHANGED_EVENT, onChanged);
  }, [view, loadDrafts]);

  useEffect(() => {
    loadAccounts();
    // 账号管理弹窗增删账号后广播，筛选 chips 随之刷新
    const onAccountsChanged = () => {
      // 同步文件夹白名单可能刚被改过（勾上「垃圾邮件」等）→ 垃圾视图的路径缓存作废
      junkCacheRef.current.clear();
      loadAccounts();
    };
    window.addEventListener(MAIL_ACCOUNTS_CHANGED_EVENT, onAccountsChanged);
    return () => window.removeEventListener(MAIL_ACCOUNTS_CHANGED_EVENT, onAccountsChanged);
  }, [loadAccounts]);

  // 账号被禁用/删除后，选择失效就回到「全部账号」（否则列表会被一个看不见的条件压空）
  useEffect(() => {
    setAccountFilter((prev) => (prev !== "all" && !accounts.some((a) => a.id === prev) ? "all" : prev));
  }, [accounts]);

  // 搜索收起（Esc / 失焦且为空）：一并清掉已提交的搜索词——避免「搜索框没了、
  // 列表却还停在搜索结果上」的无形状态（2026-10-05 定稿：收起 = 不再搜索）
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchClosing(true); // 输入框保留 TOOLBAR_MS 播完淡出再卸载（见下方计时 effect）
    setQInput("");
    setQ("");
  }, []);

  // 退场保留期计时：到点卸载输入框（换成图标按钮）；期间重新打开则随依赖变化取消
  useEffect(() => {
    if (!searchClosing || searchOpen) return;
    const timer = window.setTimeout(() => setSearchClosing(false), TOOLBAR_MS + 40);
    return () => window.clearTimeout(timer);
  }, [searchClosing, searchOpen]);

  /**
   * 垃圾视图的文件夹解析（2026-10-08）：当前账号范围内每个账号的 `\Junk` 路径，
   * **只取在同步白名单里的**（没同步的文件夹本地没有副本，查了也是空）。
   * 结果按账号缓存（会话内）；账号配置变化时清空（见 MAIL_ACCOUNTS_CHANGED_EVENT 监听）。
   * 顺带把「一个都没有」的原因写进 junkNote，供空态显示。
   */
  // ⚠ 账号 id 列表用**字符串**当依赖：`loadAccounts()` 每次都会给出新数组（同一批账号、
  //   新引用），若把 `accounts` 直接写进 junkFolders 的依赖，就会波及 loadCurrent →
  //   reload → 「条件变化即加载」的 effect，于是**每次未读计数刷新都会整表重取一次**
  //   （行内点星标后乐观更新被重取结果冲掉——2026-10-08 实测就是这样红的）。
  const accountIdsKey = useMemo(() => accounts.map((a) => a.id).join(","), [accounts]);

  const junkFolders = useCallback(async (): Promise<{ account: string; path: string }[]> => {
    if (view !== "junk") return [];
    const ids = accountFilter === "all" ? accountIdsKey.split(",").filter(Boolean) : [accountFilter];
    const out: { account: string; path: string }[] = [];
    let hasFolder = false;
    for (const id of ids) {
      let hit = junkCacheRef.current.get(id);
      if (!hit) {
        const res = await fetchWithTimeout(`/api/mail/folders?account=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `${res.status}`);
        const data = (await res.json()) as { folders: MailFolder[]; synced: string[] };
        const paths = data.folders
          .filter((f) => f.specialUse === "\\Junk" && f.selectable)
          .map((f) => f.path);
        hit = { hasFolder: paths.length > 0, synced: paths.filter((p) => data.synced.includes(p)) };
        junkCacheRef.current.set(id, hit);
      }
      hasFolder = hasFolder || hit.hasFolder;
      for (const path of hit.synced) out.push({ account: id, path });
    }
    setJunkNote(out.length ? null : hasFolder ? "unsynced" : "none");
    return out;
  }, [view, accountFilter, accountIdsKey]);

  /**
   * 拉取「当前筛选」的列表——四处调用（初次/筛选变化、刷新、全部标为已读、加载更多）
   * 共用：垃圾视图要先解析文件夹，解析不到就直接给空列表（不查 /messages，
   * 否则会退化成"查全部"）。
   */
  const loadCurrent = useCallback(
    async (opts?: { before?: string | null; append?: boolean }) => {
      const folders = await junkFolders();
      if (view === "junk" && folders.length === 0) {
        setItems([]);
        setNext(null);
        return;
      }
      await load({
        account: accountFilter,
        view,
        unseen: unseenActive,
        flagged: flaggedActive,
        q,
        before: opts?.before,
        append: opts?.append,
        folders,
      });
      // 整表重取成功 → 列表已经是服务端的真实状态，乐观操作留下的过期标记（stale）清空。
      // ⚠ 续页（append）不清：那一页是追加在旧数据后面的，已存在的 stale 行还没被换掉。
      if (!opts?.append) setStaleIds(new Set());
    },
    [accountFilter, view, unseenActive, flaggedActive, q, load, junkFolders],
  );

  // 拉取当前筛选下的列表（首次 / 筛选变化 / 错误态「重试」按钮共用）
  const reload = useCallback(() => {
    // 草稿视图不查 /messages（loadDrafts 负责）；切回其它 tab 时本 effect 会重跑
    if (view === "drafts") return;
    setLoading(true);
    setError(null);
    loadCurrent()
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        hasLoadedRef.current = true;
        setLoading(false);
      });
  }, [view, loadCurrent]);

  // 搜索词 300ms 防抖后提交（⚠ 防抖只在搜索上；tab / 开关 / 账号切换按下即加载，
  // 否则每次点击都要白等 300ms，观感卡顿——2026-10-05 用户报）
  useEffect(() => {
    const timer = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  // 条件变化即加载（延迟已在搜索词提交处完成，这里不再等待）
  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * 手动刷新（工具栏按钮）。
   *
   * 2026-10-08 修：`POST /sync` 以前会**阻塞到整轮跑完**才返回——新加账号的首轮
   * 抓取要十几分钟到几十分钟，按钮上的 spinner 就跟着转那么久（用户看到的
   * 「加载要很久」就是这个）。现在后端一次只吃一块（见 webmail 仓库 fetcher.ts），
   * 一轮几秒就回来了；同时这里用 AbortController 给它一个上限：无论后端多慢，
   * 按钮最多转 15 秒，之后照常重取列表——刷新按钮的职责是「催一下 + 看到最新」，
   * 不是「等后台干完」。
   */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      await fetch("/api/mail/sync", { method: "POST", signal: controller.signal });
    } catch {
      // 超时/中断不算失败：后台还在跑，进度由底栏状态条显示（不弹错误）
    } finally {
      window.clearTimeout(timer);
    }
    try {
      await loadCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, [loadCurrent]);

  /**
   * 抓取期间的列表自动刷新（2026-10-08）。
   *
   * 新账号的首轮是「最新优先、按块推进」的倒序回填：邮件是一批批冒出来的，
   * 不刷新就只能看见点进来那一刻已有的那些。这里在抓取期间每 15 秒**静默**重取
   * 当前列表（`loadCurrent` 不置 loading，不闪骨架、不打断滚动），抓完就停。
   * 两种「在跑」都算：有回填数字（`backfill`）与首轮刚起步、数字还没出来（`firstSync`）。
   * ⚠ 依赖用 boolean 而不是 `backfill` 对象：状态轮询每 5 秒给一个新对象，
   *   直接依赖它会让定时器每 5 秒重建一次（永远等不到 15 秒）。
   * ⚠ 搜索态不自动刷新：正在看搜索结果时列表自己变会让人困惑。
   */
  const syncing = !!backfill || !!firstSync;
  useEffect(() => {
    if (!syncing || view === "drafts" || q.trim()) return;
    const timer = window.setInterval(() => {
      void loadCurrent().catch(() => {});
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [syncing, view, q, loadCurrent]);

  /**
   * 「全部标为已读」（2026-10-05 用户定稿）：范围 = 当前账号筛选（「全部账号」= 全部账号）；
   * 方向 / 搜索 / 星标不参与——清未读按账号范围最直觉，也与「未读」开关的计数（账号未读
   * 之和）同一口径。
   *
   * ⚠ **作用域跟着 tab 走**（2026-10-10 第九轮用户定稿）：在「垃圾」tab 里它清的是**垃圾
   *   副本**（把这个 tab 里那些粗体行清干净），其余 tab 清收件箱——服务端 `markAllRead`
   *   按 `folders` 参数决定（同一套「承载已读状态的副本」判据，见 webmail `readCopiesOf`）。
   *   垃圾 tab 且一个垃圾文件夹都没同步时直接返回：不能退化成"清收件箱"。
   * 成功后计数（账号 unread）与列表都要重取：停在「未读」筛选下时列表会被清空。
   * 部分失败（skipped）不算成功：报错并让重取的列表展示真实状态。
   */
  const markAllRead = useCallback(async () => {
    // 乐观：列表里所有行**立刻**变已读；停在「未读」筛选下时列表会被清空——那些行
    // 不再匹配当前筛选（与服务端返回的结果一致）。失败则整体还原。
    const snapshot = items;
    setItems((prev) => (unseenActive ? [] : prev.map((m) => ({ ...m, seen: true }))));
    setMarkingAll(true);
    try {
      const folders = view === "junk" ? await junkFolders() : [];
      if (view === "junk" && folders.length === 0) {
        // 垃圾 tab 且一个垃圾文件夹都没同步：不能退化成"清收件箱"，当无事发生
        setItems(snapshot);
        return;
      }
      const res = await fetch("/api/mail/mark-all-read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accounts: accountFilter === "all" ? [] : [accountFilter],
          folders: folders.map((f) => `${f.account}|${f.path}`),
        }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { messages: number; skipped: unknown[] };
      if (data.skipped.length > 0) {
        toast.add({ title: t("actionFailed"), type: "error" });
      } else if (data.messages > 0) {
        toast.add({ title: t("markAllReadDone", { count: data.messages }), type: "success" });
      } else {
        toast.add({ title: t("markAllReadNone") });
      }
      void loadAccounts();
      void loadCurrent();
    } catch {
      setItems(snapshot);
      toast.add({ title: t("actionFailed"), type: "error" });
    } finally {
      setMarkingAll(false);
    }
  }, [items, unseenActive, accountFilter, view, junkFolders, loadCurrent, loadAccounts, t]);

  // 多选：选中的列表项（顺序按当前列表）
  const selectedItems = useMemo(
    () => items.filter((m) => selected.has(m.messageId)),
    [items, selected],
  );
  /**
   * 选中项的状态（2026-10-07 用户指定）：全都已读 → 「标为已读」无事可做（禁用）；
   * 全都未读 → 「标为未读」无事可做。混合选中时两个都可用。空选中时两个都为 false，
   * 由 count === 0 负责禁用。
   */
  const allSeen = selectedItems.length > 0 && selectedItems.every((m) => m.seen);
  const allUnseen = selectedItems.length > 0 && selectedItems.every((m) => !m.seen);

  /**
   * 「全选」的范围数字：进入选择模式后按当前筛选拉一次总数（`GET /messages/count`，
   * 与列表同一套参数）。拿不到时为 null —— 顺带成为「算不出封数就别删」的保险。
   * ⚠ 判「列表是否已加载」只能看 `listQuery === null`，**不能看空串**（见上面 listQuery 的注）。
   * ⚠ 筛选一变先把旧数字清掉：宁可先不给数，也不能拿上一筛选的数字去判 20 封上限。
   */
  useEffect(() => {
    if (!selectMode || view === "drafts" || listQuery === null) {
      setMatchCount(null);
      return;
    }
    setMatchCount(null);
    let cancelled = false;
    fetchWithTimeout(`/api/mail/messages/count?${listQuery}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ count: number }>) : null))
      .then((d) => {
        if (!cancelled && d) setMatchCount(d.count);
      })
      .catch(() => {
        // 计数拿不到不影响别的动作：显示退回不带数字的说法，删除按钮变灰（见 deleteBlocked）
      });
    return () => {
      cancelled = true;
    };
  }, [selectMode, listQuery, view]);

  // 视图 / 账号 / 搜索变化时清空选择（选择模式本身保留：用户可能想接着选下一批）
  // ⚠ 「全部匹配」也一并退出：那个范围是按上一个筛选算的，换了筛选必须重新点一次，
  //   否则用户以为还选着一批、实际含义已经变了（宁可多一次点击，也不对看不见的行下手）
  useEffect(() => {
    setSelected(new Set());
    setAllMatching(false);
    setExcluded(new Set());
  }, [view, accountFilter, q]);

  /**
   * 「将要删除的封数」= 全部匹配模式看服务端计数**减掉逐行取消掉的那些**，逐行模式看勾选数。
   * `deleteBlocked`：超过 20 封、或封数未知（计数没拉到时宁可不许删）
   * —— 上限常量与后端同一个数，见 `MAX_BATCH_DELETE`。
   */
  const excludedCount = allMatching ? excluded.size : 0;
  const matchedCount = allMatching
    ? matchCount === null
      ? null
      : Math.max(0, matchCount - excludedCount)
    : selected.size;
  const deleteBlocked = matchedCount === null || matchedCount > MAX_BATCH_DELETE;

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
    // ⚠ 「全部匹配」模态必须一起清：它是**这一次选择**的范围，留着会让下次进来时
    //   按钮直接显示「取消全选」、批量条挂着上一次的封数（E2E 抓到过：退出再进来，
    //   「全选」的名字找不到了，因为它已经变成「取消全选」）
    setAllMatching(false);
    setExcluded(new Set());
  }, []);

  /**
   * 全选 / 取消全选（2026-10-11 改口径）：选中**当前筛选范围内全部匹配**的邮件，而不是
   * 「已加载的那几页」。已全选时再点即清空。
   *
   * ⚠ 不再是「逐行选满一页也算全选」（旧判据 `prev.size === items.length`）：两种模态的含义
   *   不同——逐行选满只代表这一页，而按钮一旦显示成「全部匹配」再点一下就会动到看不见的信。
   */
  const toggleAll = useCallback(() => {
    if (allMatching) {
      setAllMatching(false);
      setSelected(new Set());
      setExcluded(new Set());
      return;
    }
    setAllMatching(true);
    setSelected(new Set());
    setExcluded(new Set());
  }, [allMatching]);

  /**
   * 行点击（选择模式下）：
   * - 逐行模式：照旧是勾选 / 取消这一封；
   * - 「全部匹配」模式：点一行 = **把这一封从范围内排除**（勾选态翻成未选、计数减一，
   *   排除名单随请求发给服务端）。⚠ 不能清空整个模态、只留这一封——那和用户点“取消这一行”
   *   的意图相反；也不能什么都不做——那这一下就是死交互（2026-10-11 用户报“列表完全没反映”，
   *   根源就是当时 `selected` 留空、行一律渲染成未选）。
   */
  const toggleSelect = useCallback(
    (messageId: string) => {
      if (allMatching) {
        setExcluded((prev) => {
          const next = new Set(prev);
          if (next.has(messageId)) next.delete(messageId);
          else next.add(messageId);
          return next;
        });
        return;
      }
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(messageId)) next.delete(messageId);
        else next.add(messageId);
        return next;
      });
    },
    [allMatching],
  );

  /**
   * 批量标记（已读 / 未读）。
   *
   * 两种范围（2026-10-11）：逐行勾选 → 走 `messageIds`（每账号一次连接、每文件夹一次
   * STORE）；「全选」→ 走 `scope`（把这串当前筛选原样交给服务端，由它现算全部匹配——
   * 几百上千封也不必物化 id 塞进请求体）。
   */
  const batchFlags = useCallback(
    async (change: { seen?: boolean; flagged?: boolean }) => {
      const scope = allMatching && listQuery !== null ? listQuery : null;
      if (scope === null && selected.size === 0) return;
      /** 「全部匹配」下被逐行取消掉的那几封：**非空才带**（空数组等于没排除，不必出现在 body 里） */
      const excludePatch = excluded.size > 0 ? { exclude: [...excluded] } : {};
      /**
       * `seen` 只作用于**有已读状态的**消息（`hasReadState`，判据在服务端 `readCopiesOf`：
       * 收件箱副本优先、没有收件箱副本时才认当前视图的副本）——选中项里混着发件 / 归档时，
       * 提示里的封数要按真正会变的那些算，否则又是一次「提示说改了 N 封、刷新后有几封没变」
       * （用户报过的不同步观感）。
       * ⚠ 「全部匹配」模式下 `selectedItems` 是空的，故乐观改的是**已加载的那些行**
       *   （去掉用户逐行取消掉的那几封）——它们正是匹配集合的前缀（同一套筛选、同一排序）。
       */
      const pool =
        scope !== null ? items.filter((m) => !excluded.has(m.messageId)) : selectedItems;
      const targets =
        change.seen !== undefined ? pool.filter((m) => m.hasReadState !== false) : pool;
      if (scope === null && targets.length === 0) {
        toast.add({ title: t("markAllReadNone") });
        return;
      }
      const targetIds = targets.map((m) => m.messageId);
      // 乐观：选中的行**立刻**变成目标状态（内容一个字不变，只改标记），请求在后台跑。
      // ⚠ 回滚按行逐一还原，不整表重取——用户这期间可能又选了别的 / 滚了页。
      const before = targets.map((m) => ({ messageId: m.messageId, seen: m.seen, flagged: m.flagged }));
      for (const m of targets) patchItem(m.messageId, change);
      // 右栏（若正看着其中一封）跟着变——批量条是列表侧的动作，详情页只能靠广播
      for (const id of targetIds) broadcastItemChange({ messageId: id, ...change, source: "list" });
      setBatchBusy(true);
      try {
        const res = await fetch("/api/mail/flags", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            scope !== null
              ? { scope, ...excludePatch, ...change }
              : { messageIds: targetIds, ...change },
          ),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `${res.status}`);
        const data = (await res.json()) as { updated: number; messages?: number; skipped: unknown[] };
        if (Array.isArray(data.skipped) && data.skipped.length > 0) {
          toast.add({ title: t("batchPartial"), type: "error" });
        } else {
          // 范围模式报服务端算出的封数（可能远多于已加载的那几行）
          const done = typeof data.messages === "number" ? data.messages : targetIds.length;
          toast.add({ title: t("batchDone", { count: done }), type: "success" });
        }
        setSelected(new Set());
        setAllMatching(false);
        void loadAccounts();
        // 生效中的筛选与本次变更相关（未读筛选中标了已读 / 星标筛选中改了星标）→ 整表重取，
        // 让不再匹配的行离开列表（只打补丁会让它们赖在列表里，见 applyItemChange 的说明）
        if ((unseenActive && change.seen !== undefined) || (flaggedActive && change.flagged !== undefined)) {
          void reload();
        }
      } catch {
        for (const p of before) patchItem(p.messageId, { seen: p.seen, flagged: p.flagged });
        for (const p of before) {
          broadcastItemChange({ messageId: p.messageId, seen: p.seen, flagged: p.flagged, source: "list" });
        }
        toast.add({ title: t("actionFailed"), type: "error" });
      } finally {
        setBatchBusy(false);
      }
    },
    [selected, selectedItems, items, allMatching, listQuery, excluded, reload, loadAccounts, t, patchItem, unseenActive, flaggedActive],
  );

  /**
   * 批量删除：确认后对该批消息的**全部副本**一起删（与单条删除同一接口同一口径）。
   *
   * 「全部匹配」模式下走 `scope`（服务端现算），UI 层已限死 ≤ `MAX_BATCH_DELETE` 封
   * （超了删除按钮变灰，进不到这里）——服务端还有一道同名上限兜底。
   */
  const batchDelete = useCallback(async () => {
    const scope = allMatching && listQuery !== null ? listQuery : null;
    const copies = selectedItems.flatMap((m) => m.copies);
    if (scope === null && copies.length === 0) return;
    /** 「全部匹配」下被逐行取消掉的那几封：**非空才带**（空数组等于没排除） */
    const excludePatch = excluded.size > 0 ? { exclude: [...excluded] } : {};
    // 乐观摘行。范围模式下匹配集合 ≤ 20 封（否则删除按钮已灰），首屏就能把它们全装下——
    // 摘掉「已加载的行里没被用户取消掉的那些」与真实结果一致；逐行模式摘的就是用户勾的那些。
    const removed = scope !== null ? items.filter((m) => !excluded.has(m.messageId)) : selectedItems;
    // 乐观：弹窗立刻关、选中项清空、那几行**立刻**摘掉，请求在后台跑
    // （选择模式本身留着——批量条退回「已选 0 封」，用户可以接着选下一批）
    setBatchDeleteOpen(false);
    setSelected(new Set());
    setAllMatching(false);
    for (const m of removed) removeRow(m.messageId);
    setBatchBusy(true);
    try {
      const res = await fetch("/api/mail/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(scope !== null ? { scope, ...excludePatch } : { copies }),
      });
      if (!res.ok) throw new Error();
      toast.add({ title: t("batchDeleted", { count: removed.length }), type: "success" });
      // 右栏若正看着被删的其中一封 → 退回列表（否则会留着一封已删邮件的正文）
      for (const m of removed) {
        broadcastItemChange({ messageId: m.messageId, deleted: true, source: "list" });
      }
      void loadAccounts();
    } catch {
      for (const m of removed) restoreRow(m);
      for (const m of removed) broadcastItemChange({ messageId: m.messageId, refresh: true, source: "list" });
      toast.add({ title: t("actionFailed"), type: "error" });
    } finally {
      setBatchBusy(false);
    }
  }, [selectedItems, items, allMatching, listQuery, excluded, loadAccounts, t, removeRow, restoreRow]);

  const loadMore = useCallback(async () => {
    // ⚠ `loading`（整体重载）也要拦：重载在飞时续页会把**旧游标**的下一页追加到即将被
    //   替换的列表上（新列表到货后再被覆盖，白下一次请求）
    if (!pagedNext || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      await loadCurrent({ before: pagedNext, append: true });
    } finally {
      setLoadingMore(false);
    }
  }, [pagedNext, loadingMore, loading, loadCurrent]);

  /**
   * 无限滚动（4.9）：底部哨兵进入（扩展）视口即取下一页，「加载更多」按钮保留兜底。
   *
   * ⚠ **2026-10-09 修：这一版必须用「state 驱动」而不是「回调里直接 loadMore」**。
   *   旧实现有两个静默失效点，实测（dev 1440×900）滚轮滑到列表底部 30 次、行数一次都
   *   没涨——**自动续页实际是坏的**，只能手点按钮：
   *   ① 观察目标会**换节点**：哨兵原先挂在 `{next && !loading && …}` 里，`loading` 每次
   *      变化都把哨兵卸载重建；而 effect 依赖是 `[next, loadMore]`，节点换了不会重跑 →
   *      观察器一直盯着**已脱离文档**的旧节点，永不回调（自建 IO 在同一个哨兵上报
   *      `intersecting=true ratio=1.00`，本组件的 IO 一次回调都没有 = 就是这个）；
   *   ② 若 effect 恰好跑在 `loading===true` 那一刻，`sentinelRef.current` 是 null，
   *      旧实现的 `if (!el) return` 直接放弃观察、之后也不会补挂。
   *   现在：哨兵**常驻**（只跟 `next` 走，不再受 `loading` 影响）+ ref 用 callback ref
   *   存进 state（节点变了 effect 必然重挂）+ 交集状态进 state。
   *   用 state 而不是「回调里直接取页」还有第二个好处：IO 只在**交集变化**时回调，
   *   「刷新期间滚到底、刷新完成后视口里还停着哨兵」这种情形回调式会漏（哨兵一直在视口
   *   里、没有新的交集变化），state 驱动会在 `loading` 落回 false 时补上这一次。
   */
  /**
   * 哨兵是否落在「视口 + 300px 余量」内。
   * ⚠ 这是给自动续页做**同步复查**用的：IntersectionObserver 的回调要等下一帧，而
   *   刚追加完一页时 `sentinelInView` 还是旧值（true）——只信 state 会在一瞬间连拉
   *   好几页（实测：把按钮滚进视野那一下连拉了 3 页）。落库前同步量一次 rect 即可
   *   精确判断"哨兵是不是真被上一页推出了余量"。判据与 IO 的 `rootMargin` 保持一致。
   */
  const sentinelNear = useCallback(() => {
    if (!sentinelNode) return false;
    const r = sentinelNode.getBoundingClientRect();
    const margin = 300;
    return r.top <= window.innerHeight + margin && r.bottom >= -margin;
  }, [sentinelNode]);

  useEffect(() => {
    if (!sentinelNode || !pagedNext) return;
    const ob = new IntersectionObserver(
      (entries) => setSentinelInView(entries.some((e) => e.isIntersecting)),
      { rootMargin: "300px" },
    );
    ob.observe(sentinelNode);
    return () => {
      ob.disconnect();
      setSentinelInView(false);
    };
    // `sentinelNode` 是 state（不是 ref 对象）：节点换了这个 effect 会重跑
  }, [pagedNext, sentinelNode]);

  // 哨兵在视口里 + 还有下一页 + 没有任何加载在跑 → 自动续页（同步复查，见 `sentinelNear`）
  useEffect(() => {
    if (!sentinelInView || !pagedNext || loading || loadingMore) return;
    if (!sentinelNear()) return;
    void loadMore();
  }, [sentinelInView, pagedNext, loading, loadingMore, loadMore, sentinelNear]);

  /**
   * 点**空白处**退出选择模式（2026-10-07 用户指定：不设专门的「退出」按钮）。
   * 判据是"点到的不是行、也不是任何可交互元素"——否则会误伤「加载更多」、行内快捷操作
   * （它们在 li 内、是行按钮的兄弟节点）、草稿行内的删除按钮，以及批量条自己。
   * ⚠ 挂在**整个左栏**（工具栏 + tab 行 + 列表）而不是只挂列表滚动区：列表长到填满面板时，
   *   行下方没有空白可点，而工具栏行/tab 行右侧永远留着空白——那是最容易点到的地方。
   */
  const onListBlankClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!selectMode) return;
      const el = e.target as HTMLElement;
      if (
        el.closest(
          '[data-mail-row], [data-slot="mail-batch-bar"], button, a, input, label, [role="button"], [role="menuitem"]',
        )
      ) {
        return;
      }
      exitSelectMode();
    },
    [selectMode, exitSelectMode],
  );

  // 键盘导航（4.9）：↓ 下一行，↑ 上一行；Enter 由按钮原生激活打开；
  // Esc 退出选择模式（⚠ 弹窗打开时不抢：删除确认弹窗的 Esc 归弹窗自己）
  // ⚠ **不支持 j / k**（2026-10-10 用户定稿：把它俩删掉，只留方向键）——E2E 里
  //   「j / k 走一行」那条用例因此改成 ↓ / ↑，别再按 vim 习惯加回来。
  const onListKeyDown = useCallback((e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "Escape" && selectMode) {
      if (typeof document !== "undefined" && document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      exitSelectMode();
      return;
    }
    const delta = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (delta === 0) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-mail-row]") ?? []);
    const idx = rows.indexOf(document.activeElement as HTMLElement);
    const target = rows[idx + delta];
    if (idx >= 0 && target) {
      e.preventDefault();
      target.focus();
    }
  }, [selectMode, exitSelectMode]);

  /**
   * 一格状态变更的统一落地（2026-10-06）：刷新未读计数（h1 角标 / 未读开关上标 /
   * 底栏 / 账号菜单）+ 更新列表行。详情页（MAIL_ITEM_CHANGED_EVENT）与列表行内
   * 快捷操作都走这里，两处不再各自漏刷。
   * - 删除 → 直接移除该行
   * - 生效中的筛选与变更相关（未读筛选中读了一封 / 星标筛选中改了星标）→ 整表重取，
   *   行该进/该出（只打补丁会让不再匹配筛选的行赖在列表里）
   * - 其余 → 只打补丁（不引网络往返）
   */
  const applyItemChange = useCallback(
    (change: MailItemChange) => {
      loadAccounts();
      if (change.refresh) {
        // 服务端做过本地补不了的变动（目前只有「撤销标为垃圾」的反向搬迁）：
        // 那封信回到了原文件夹，行该重新出现——`deleted` 只能摘行，表达不了「又回来」
        reload();
        return;
      }
      if (change.deleted) {
        setItems((prev) => prev.filter((m) => m.messageId !== change.messageId));
        return;
      }
      const affected =
        (unseenActive && change.seen !== undefined) ||
        (flaggedActive && change.flagged !== undefined);
      if (affected) {
        reload();
        return;
      }
      const patch: Partial<MailListItem> = {};
      if (change.seen !== undefined) patch.seen = change.seen;
      if (change.flagged !== undefined) patch.flagged = change.flagged;
      if (Object.keys(patch).length > 0) patchItem(change.messageId, patch);
    },
    [unseenActive, flaggedActive, loadAccounts, reload, patchItem],
  );

  // 状态变更事件（**双向**，2026-10-10 第七轮补齐反向）：详情页 ↔ 列表互相通知。
  // ⚠ 必须忽略 `source === "list"`——列表自己发的广播绕回来会重复刷新计数 / 整表重取
  //   （「未读筛选下改了未读」那条路径会变成两次 reload）；
  //   详情页发出的（source=detail 或旧版本不带 source）照旧处理。
  useEffect(() => {
    const onItemChanged = (e: Event) => {
      const change = (e as CustomEvent<MailItemChange>).detail;
      if (!change?.messageId) return;
      if (change.source === "list") return;
      applyItemChange(change);
    };
    window.addEventListener(MAIL_ITEM_CHANGED_EVENT, onItemChanged);
    return () => window.removeEventListener(MAIL_ITEM_CHANGED_EVENT, onItemChanged);
  }, [applyItemChange]);

  /**
   * 行内快捷操作（4.9）：星标 / 已读切换，乐观更新、失败回滚。
   *
   * ⚠ 两件事别漏（2026-10-10 第七轮用户报障）：
   * ① **要广播**：列表行内操作此前只改自己的 state，右栏详情页的工具栏因此不同步
   *    （「在列表点『标为未读』，悬浮条变成『标为已读』，查看页的工具栏没变」）；
   * ② **只在有已读状态时才发 seen**（`hasReadState`，第九轮起垃圾也有）：对发件 / 归档的
   *    行发 seen 会得到一个「成功但什么也没发生」的假象（服务端一次 IMAP 都不连）。
   */
  const postFlags = useCallback(
    async (m: MailListItem, change: { seen?: boolean; flagged?: boolean }) => {
      const payload =
        m.hasReadState === false && change.seen !== undefined ? { ...change, seen: undefined } : change;
      if (Object.keys(payload).every((k) => payload[k as "seen" | "flagged"] === undefined)) return;
      patchItem(m.messageId, change);
      // 乐观广播：右栏（若正看着这封）立即跟着变
      broadcastItemChange({ messageId: m.messageId, ...change, source: "list" });
      try {
        const res = await fetch("/api/mail/flags", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messageId: m.messageId, ...payload }),
        });
        if (!res.ok) throw new Error();
        // 计数与筛选跟随（此前只打补丁：h1 角标/底栏要等下个 30s 轮询才更新）
        applyItemChange({ messageId: m.messageId, ...change });
        // 写成功后再广播一次：服务端索引此时才更新（与详情页同一套语义，见 postFlags 注释）
        broadcastItemChange({ messageId: m.messageId, ...change, source: "list" });
      } catch {
        patchItem(m.messageId, { seen: m.seen, flagged: m.flagged });
        broadcastItemChange({
          messageId: m.messageId,
          seen: m.seen,
          flagged: m.flagged,
          source: "list",
        });
        toast.add({ title: t("actionFailed"), type: "error" });
      }
    },
    [patchItem, applyItemChange, t],
  );

  /**
   * 撤销刚做完的「标为垃圾」（2026-10-10 用户要求：这个动作此前既没有确认也没有撤销）。
   *
   * 要点后端 `/unmove` 而不是反向调 `/move`：MOVE 之后那封邮件在垃圾夹里的 **UID 已变**，
   * 手里的 `copies` 全是过期的；服务端用 `SEARCH HEADER Message-ID` 现场定位再搬回来。
   * `targets` 取的是**搬走前**那份 copies 的（账号, 文件夹）——即各自要回到的地方。
   *
   * ⚠ 搬回来之后**必须等一次同步**再重取列表：本地索引要等同步才会在原文件夹里
   *   建出那条副本行（`POST /sync` 是同步等待的，故这里 await 完再 reload）。
   */
  const undoJunk = useCallback(
    async (m: MailListItem) => {
      const accountIds = [...new Set(m.copies.map((c) => c.accountId))];
      try {
        const res = await fetch("/api/mail/unmove", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messageId: m.messageId,
            targets: m.copies.map((c) => ({ accountId: c.accountId, folder: c.folder })),
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `${res.status}`);
        const data = (await res.json()) as { restored: number; skipped?: { reason: string }[] };
        if (data.restored === 0) {
          toast.add({
            title: t("junkUndoFailed"),
            description: data.skipped?.[0]?.reason,
            type: "error",
          });
          return;
        }
        toast.add({ title: t("junkUndone"), type: "success" });
        // **乐观放回**：撤销后这封信回到了原文件夹，列表里该重新出现它（"已移回收件箱"
        // 的完成信号就是它回来）。
        // ⚠ 标记 `stale`：手里这份 `m.copies` 是**搬走前**的垃圾夹副本（uid 已失效），
        //   放回的那一行数据是过期的——操作条先不给，免得用户再点一下就把信搬到别的
        //   邮件上（见 `MailRow` 的 `stale`）。下一次整表重取会换成服务端的真实数据。
        restoreRow(m, true);
        void (async () => {
          await Promise.all(
            accountIds.map((accountId) =>
              fetch("/api/mail/sync", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ accountId }),
              }).catch(() => {}),
            ),
          );
          await reload();
        })();
      } catch (err) {
        toast.add({
          title: t("junkUndoFailed"),
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        });
      }
    },
    [reload, t, restoreRow],
  );

  /**
   * 「移出垃圾」（2026-10-10）：垃圾视图里那枚动作——把信从垃圾夹搬走。
   *
   * ⚠ **走普通的 `POST /move`、不用 `/unmove`**：这里前端手里的 `copies` 就是**当前**
   *   垃圾夹里那份副本，uid 是有效的——搬去 INBOX 而已。`/unmove` 那一套「按
   *   Message-ID 在垃圾夹里现场定位」是为**撤销**场景准备的（那里 MOVE 之后 uid 已变、
   *   前端手里的 copies 全是过期的），定位要拉整个垃圾夹的头，能不用就不用。
   *
   * ⚠ 成功后是**零等待**（2026-10-10 用户报「移出垃圾很慢」）：`/move` 已经把垃圾夹
   *   那一行从**本地索引**里删掉了（`applyCopiesOp`），而 INBOX 里的新副本要等下一轮
   *   同步才发现。所以：
   *   ① 那一行**先摘掉**——留着它反而是个能再点的「移出垃圾」，而手里的 copies
   *      （垃圾夹的 uid）已经失效，再点会搬到**别的邮件**上（危险）；
   *   ② 那一轮同步放到**后台**跑，完了再重取一次，让这封（现在在收件箱）回到它该在
   *      的视图里。
   *   ⚠ 曾经写成 `await Promise.all(同步)` 再 `reload()`——体感差了整整一个同步周期
   *     （`POST /sync` 是同步等待的，十秒起步），而「标为垃圾」那边一直是 `void` 不等。
   */
  const notJunkFromList = useCallback(
    async (m: MailListItem) => {
      const accountIds = [...new Set(m.copies.map((c) => c.accountId))];
      // 乐观：立刻摘行
      removeRow(m.messageId);
      try {
        const res = await fetch("/api/mail/move", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ copies: m.copies, to: "INBOX" }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `${res.status}`);
        const data = (await res.json()) as { affected: number; skipped?: { reason: string }[] };
        if (data.affected === 0) {
          restoreRow(m);
          toast.add({
            title: t("notJunkFailed"),
            description: data.skipped?.[0]?.reason,
            type: "error",
          });
          return;
        }
        toast.add({ title: t("notJunkDone"), type: "success" });
        void (async () => {
          await Promise.all(
            accountIds.map((accountId) =>
              fetch("/api/mail/sync", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ accountId }),
              }).catch(() => {}),
            ),
          );
          await reload();
        })();
      } catch (err) {
        restoreRow(m);
        toast.add({
          title: t("notJunkFailed"),
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        });
      }
    },
    [reload, t, removeRow, restoreRow],
  );

  /**
   * 行内「标为垃圾」（2026-10-10 第七轮用户要求：列表悬浮操作条也要有这个动作）。
   *
   * 与详情页的 `markJunk` 同一套：整封（全部副本）搬进该账号的 `\Junk`（目标文件夹由
   * 服务端自己探测），成功后该行从任何非垃圾视图里消失——所以这里直接把它从列表里摘掉，
   * 并广播 `deleted` 让右栏（若正看着它）退回列表。
   * ⚠ `affected < copies.length`（某些账号没有垃圾文件夹 → `skipped`）时**不能摘行**：
   *   那封邮件仍留在别的文件夹里，摘掉就成了「界面说没了、刷新又回来」（用户报过的
   *   「刷新后不一致」）。此时整表重取，以服务端为准。
   */
  const markJunkFromList = useCallback(
    async (m: MailListItem) => {
      // 乐观：立刻摘行（"已标为垃圾"的完成信号就是它消失），请求在后台跑
      removeRow(m.messageId);
      try {
        const res = await fetch("/api/mail/move", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ copies: m.copies, to: "\\Junk" }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `${res.status}`);
        const data = (await res.json()) as { affected: number; skipped?: { reason: string }[] };
        const skipped = data.skipped ?? [];
        if (data.affected === 0) {
          // 服务端一个副本都没动（本来就在垃圾里 / 该账号没有垃圾夹）→ 行放回去
          restoreRow(m);
          if (skipped.length === 0) toast.add({ title: t("moveSameFolder") });
          else toast.add({ title: t("junkFailed"), description: skipped[0].reason, type: "error" });
          return;
        }
        if (skipped.length > 0) {
          // 部分账号没搬（没有垃圾夹）：那种情况下信还在别的文件夹里，摘行就成了
          // 「界面说没了、刷新又回来」——放回去并按服务端重取
          restoreRow(m);
          toast.add({ title: t("junkFailed"), description: skipped[0].reason, type: "error" });
          await reload();
          return;
        }
        broadcastItemChange({ messageId: m.messageId, deleted: true, source: "list" });
        toast.add({
          title: t("junkDone"),
          type: "success",
          // 撤销窗口比默认的 5 秒宽（见 lib/mail/undo.ts）
          timeout: JUNK_UNDO_WINDOW_MS,
          actionProps: { children: t("junkUndo"), onClick: () => void undoJunk(m) },
        });
        loadAccounts();
        // 目标文件夹由下一轮同步发现（与详情页一致：主动催一次这些账号的同步）
        for (const accountId of [...new Set(m.copies.map((c) => c.accountId))]) {
          void fetch("/api/mail/sync", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ accountId }),
          }).catch(() => {});
        }
      } catch (err) {
        restoreRow(m);
        toast.add({
          title: t("junkFailed"),
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        });
      }
    },
    [loadAccounts, reload, t, undoJunk, removeRow, restoreRow],
  );

  const doDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    // 乐观：立刻摘行（删除的"完成"信号就是它消失）
    removeRow(pendingDelete.messageId);
    try {
      const res = await fetch("/api/mail/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ copies: pendingDelete.copies }),
      });
      if (!res.ok) throw new Error();
      toast.add({ title: t("deleted"), type: "success" });
      // 删的正好是右栏正在看的那封：右栏退回占位态（否则会留着一封已删邮件的正文）
      if (activeMessageId === pendingDelete.messageId) router.push("/mail");
      setPendingDelete(null);
      loadAccounts();
    } catch {
      restoreRow(pendingDelete);
      toast.add({ title: t("actionFailed"), type: "error" });
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, t, activeMessageId, router, removeRow, restoreRow, loadAccounts]);

  /** 草稿删除（草稿箱行内操作，ConfirmDialog 确认后执行） */
  const doDeleteDraft = useCallback(async () => {
    if (!pendingDraftDelete) return;
    const draft = pendingDraftDelete;
    // 乐观：这一行立刻消失（草稿的正文在服务端，删失败只是"列表少了一行"，
    // 不会丢用户的字——与发信/存草稿那类内容操作不同，用户 2026-10-10 明确区分过）
    setDrafts((prev) => (prev ?? []).filter((d) => d.id !== draft.id));
    setPendingDraftDelete(null);
    setDeletingDraft(true);
    try {
      const res = await fetch(`/api/mail/drafts/${encodeURIComponent(draft.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.add({ title: t("draftDeleted"), type: "success" });
    } catch {
      // 回滚：插回并按草稿列表的口径（服务端按 updatedAt 倒序）重排
      setDrafts((prev) => [...(prev ?? []), draft].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      toast.add({ title: t("actionFailed"), type: "error" });
    } finally {
      setDeletingDraft(false);
    }
  }, [pendingDraftDelete, t]);

  /**
   * 账号 id → 账号对象。
   * ⚠ 叫 `accountById` 而不是 `accountName`（2026-10-11 改名）：`account-label.ts` 里已经
   *   有一个 `accountName()`（给「显示用的名字」，没备注名时退回邮箱地址），两者同名不同物。
   */
  const accountById = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, a]));
    return (id: string) => map.get(id);
  }, [accounts]);

  /**
   * 列表行要用的账号索引。`MailRow` 是 memo 组件，传给它的每个 prop 都必须是稳定引用；
   * 行只读「显示用的名字」/ `color`，故按「id + 备注名 + 发件人姓名 + 颜色」组键缓存——
   * 未读数的轮询刷新会换掉 `accounts` 数组，但不该换掉这个 Map（否则每 30 秒全部行重渲一次）。
   * ⚠ 键必须覆盖 `accountName()` 读到的每个字段（显示名优先级 = 备注名 > 发件人姓名 > 地址）：
   *   少一个 `senderName`，改完发件人姓名后行内色点的 `title` 会停在旧值。
   */
  const accountsByColorKey = useMemo(
    () => accounts.map((a) => `${a.id}:${a.displayName}:${a.senderName ?? ""}:${a.color}`).join("|"),
    [accounts],
  );
  const accountsById = useMemo(() => {
    const map = new Map<string, MailAccount>();
    for (const a of accounts) map.set(a.id, a);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 键已覆盖行用到的字段，见上
  }, [accountsByColorKey]);
  /**
   * 列表分组（2026-10-10「列表会话聚合」）：同一会话的邮件只占一行，组内**最新**的那封
   * 当代表。分组的键是服务端给的 `threadKey`（会话根，引用链推导），不是主题。
   *
   * ⚠ **选择模式下不聚合**：多选要精确到某一封，把 5 封并成一行之后「勾选这一行」
   *   到底选中了谁就说不清了（后端批量操作是按 messageId 走的）。
   * ⚠ 组内顺序沿用 `items`（服务端 `date DESC`），故 `members[0]` 天然是最新那封；
   *   组的摆放位置也跟着它。新加载的一页里若有同会话的更早几封，会自动并进已有组。
   */
  const groupedItems = useMemo(() => {
    if (selectMode) return items.map((m) => ({ key: m.messageId, lead: m, members: [m] }));
    const groups = new Map<string, MailListItem[]>();
    for (const m of items) {
      const key = m.threadKey ?? m.messageId;
      const arr = groups.get(key);
      if (arr) arr.push(m);
      else groups.set(key, [m]);
    }
    return [...groups.entries()].map(([key, members]) => ({ key, lead: members[0], members }));
  }, [items, selectMode]);

  /**
   * 就地展开的会话（键 = **代表行的 messageId**）。
   *
   * 为什么不用 `threadKey`：那就要把 key 再传给 `MailRow`，而每行一个 `onToggleThread`
   * 闭包会直接打掉 `memo`（父组件每渲染一次、全部行重渲一次）。代表行本身是稳定的——
   * 它是会话里最新那封，新加载的一页里同会话的更早几封不会顶掉它。
   */
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const toggleThread = useCallback((messageId: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const openItem = useCallback(
    (m: MailListItem) => {
      router.push(`/mail/message/${encodeMessageId(m.messageId)}`, mailNavOptions());
    },
    [router],
  );
  const deleteRow = useCallback((m: MailListItem) => setPendingDelete(m), []);
  const enterSelectMode = useCallback(() => setSelectMode(true), []);

  /**
   * 底栏右侧统计 + 「未读」开关上的数字 + 大标题角标（unreadAll）：**同一个数字** =
   * 「当前账号筛选范围内**收件箱**未读之和」（不限账号 = 各账号之和）。
   *
   * ⚠ 口径（2026-10-10 第六轮定稿）：未读 = 收件箱未读。数字来自 `/accounts` 的
   *   `unread`（服务端只数 INBOX 副本），后端 `filter=unseen` 也改成同一口径——四处
   *   （角标 / 底栏 / 开关数字 / 筛选结果）必须永远一致。曾经的 bug 就是这里数收件箱、
   *   筛选数全部文件夹：开关写 2、点开列出 7 封（含 5 封垃圾箱里的未读）。
   */
  const unreadTotal = useMemo(
    () =>
      accounts
        .filter((a) => accountFilter === "all" || a.id === accountFilter)
        .reduce((sum, a) => sum + (a.unread ?? 0), 0),
    [accounts, accountFilter],
  );

  /**
   * 「全部标为已读」是不是无事可做（决定禁用与 title）。**范围跟着 tab 走**（第九轮用户
   * 定稿「跟着 tab 走：清空垃圾副本」）：
   * - 收件 / 全部 / 发件 / 搜索 → 看**收件箱**未读（`unreadTotal`，与角标同一个数）；
   * - 「垃圾」→ 看当前列表里有没有未读行（垃圾未读不进任何数字，只能就地判）。
   *   ⚠ 只判**已加载**的那一页：更靠后的未读行用户此刻也看不见，按钮亮着反而更奇怪。
   */
  const markAllNothing =
    view === "drafts" || (view === "junk" ? !items.some((m) => !m.seen) : unreadTotal === 0);

  /**
   * 草稿箱**先按账号筛、再按搜索词筛**（2026-10-10 用户报「草稿不区分所属账户，
   * 用户体验太混乱」）：其它视图都由服务端按 `account` 参数筛，草稿箱此前把两个账号的
   * 草稿混在一起、行上也不标归属——工具栏明明选着某个账号，列表里却出现另一个账号的草稿。
   * ⚠ 顺序很重要：账号是"数据范围"、搜索是"范围内的过滤"，底栏的「已加载 N 封」用前者
   *   （与邮件列表同口径：搜索命中数是列表内容，不是数据范围）。
   */
  const accountDrafts = useMemo(
    () => (drafts ?? []).filter((d) => accountFilter === "all" || d.accountId === accountFilter),
    [drafts, accountFilter],
  );

  /**
   * 「更早的草稿」分界：30 天前的旧草稿收进折叠区（默认收起）。
   * 起因（2026-10-10）：草稿改成以服务商草稿文件夹为唯一事实源之后，用户 QQ 账号里
   * 141 封 2014 年起的旧草稿会一次性进入列表——**数据一封都不少**，只是别拿它们糊住
   * 当前在写的那几封。折叠是展示层的分组，不是过滤（点开就见，不是隐藏）。
   */
  const OLD_DRAFT_MS = 30 * 24 * 60 * 60 * 1000;
  const recentDrafts = useMemo(() => {
    const cutoff = Date.now() - OLD_DRAFT_MS;
    return accountDrafts.filter((d) => Date.parse(d.updatedAt) >= cutoff);
  }, [accountDrafts]);
  const olderDrafts = useMemo(() => {
    const cutoff = Date.now() - OLD_DRAFT_MS;
    return accountDrafts.filter((d) => Date.parse(d.updatedAt) < cutoff);
  }, [accountDrafts]);

  /** 搜索命中的草稿（本地过滤：数据量小；匹配收件人 / 主题 / 正文） */
  const matchedDrafts = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return accountDrafts;
    return accountDrafts.filter(
      (d) =>
        d.to.toLowerCase().includes(kw) ||
        d.subject.toLowerCase().includes(kw) ||
        d.body.toLowerCase().includes(kw),
    );
  }, [accountDrafts, q]);

  /**
   * 列表里真正渲染的行：**搜索时不分「更早」**（否则搜到了却看不见），平时只显示最近 30 天。
   * 旧草稿在 `olderVisible` 里，由折叠区展示（默认收起）。
   */
  const draftSearching = q.trim().length > 0;
  const visibleDrafts = draftSearching ? matchedDrafts : recentDrafts;
  const olderVisible = draftSearching ? [] : olderDrafts;

  /** 全账号未读总数（与账号筛选无关）：广播给大标题的未读角标（读信后立即回正） */
  const unreadAll = useMemo(
    () => accounts.reduce((sum, a) => sum + (a.unread ?? 0), 0),
    [accounts],
  );
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(MAIL_UNREAD_EVENT, { detail: { total: unreadAll } }));
  }, [unreadAll]);

  /**
   * 列表空态文案（2026-10-05 用户指定）：有筛选时把条件说清楚——
   * `暂无「未读」邮件` / `「发件」中暂无「星标」邮件`；「全部」不作为条件显示，
   * 只有「全部 + 无筛选」才回到 `暂无邮件`。搜索词另走 emptySearch。
   * ⚠ 垃圾视图还要说清**为什么是空的**（2026-10-08）：没有垃圾文件夹、或垃圾文件夹
   *   还没进同步白名单——两者都不是"真的没有垃圾邮件"，不能只显示「暂无」。
   */
  const emptyText = useMemo(() => {
    // 草稿视图的空态另有文案（emptyDrafts，见渲染分支），不走邮件空态的键拼装——
    // 否则 `emptyFilter.scope.drafts` 查找落空，next-intl 会在控制台报 MISSING_MESSAGE
    if (view === "drafts") return "";
    if (view === "junk" && junkNote === "none") return t("junkNoFolder");
    if (view === "junk" && junkNote === "unsynced") return t("junkNotSynced");
    // ⚠ 状态键必须显式列出，勿用数组 join("And") 拼：`join` 拼出的是 `unseenAndflagged`
    //   （小写 f），与文案里的 `unseenAndFlagged` 大小写不符 → 查找落空后 next-intl
    //   会把 key 路径原样显示在页面上（2026-10-05 实测踩过，单一开关时不触发）。
    // ⚠ 用「生效值」而非原始开关：发件里带过来的「未读」不参与查询，文案也不能说
    //   「「发件」中暂无「未读」邮件」（失效值与生效值的规则见声明处）
    const statusKey =
      unseenActive && flaggedActive
        ? "unseenAndFlagged"
        : unseenActive
          ? "unseen"
          : flaggedActive
            ? "flagged"
            : "none";
    if (view === "all" && statusKey === "none") return t("empty");
    return t(`emptyFilter.scope.${view}`, { status: t(`emptyFilter.status.${statusKey}`) });
  }, [view, unseenActive, flaggedActive, junkNote, t]);

  // 发布到贯通底栏（5.5）：列表统计 + 账号一览 + 当前筛选，底栏挂在 MailShell
  // ⚠ 加载失败时按「加载中」发布：`已加载 0 封` 会让用户以为真的没有邮件（2026-10-04）
  // 底栏「加载中」：草稿箱有自己的数据源（/drafts），不能一律按邮件列表判
  const barLoading = view === "drafts" ? drafts === null : loading || !!error;
  usePublishMailBar({
    loading: barLoading,
    loaded: view === "drafts" ? accountDrafts.length : items.length,
    unread: view === "drafts" ? 0 : unreadTotal,
    accounts,
    accountFilter,
    // 列表**读不出来**（不是「刷新失败但旧数据还在」）时底栏要跟着变脸，
    // 否则会出现「左栏写着『加载失败』、底栏一片绿点『上次收到新邮件 x 前』」的自相矛盾
    // （2026-10-10 第十二轮，边界取证场景「半死：/health 活、列表接口死」）。
    // ⚠ 传原始错误串：底栏要能区分「会话过期」与「服务不可达」（两者说法不同）
    listFailed: view !== "drafts" && error && items.length === 0 ? error : null,
  });

  /**
   * 草稿行（2026-10-10 抽出来）：最近草稿与「更早的草稿」折叠区共用同一份渲染。
   *
   * ⚠ 草稿改成"服务商草稿文件夹 = 唯一事实源"之后，列表只用 IMAP envelope 拼出来，
   *   **没读过正文 ≠ 没有正文**（`contentLoaded === false`），行里必须如实区分这两件事。
   */
  const renderDraftRow = (d: MailDraft) => (
    <li key={d.id} className="group/row relative">
      <button
        type="button"
        data-mail-row
        onClick={() => router.push(`/mail/compose?draft=${encodeURIComponent(d.id)}`, mailNavOptions())}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
      >
        <span className="shrink-0 self-center">
          <Avatar>
            <AvatarFallback>
              <FilePenLineIcon className="size-4" aria-hidden />
            </AvatarFallback>
          </Avatar>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{d.to || t("draftNoRecipient")}</span>
            {/* 账号归属（多账号时）：与邮件列表行**同一套**——只给色点，账号名放 `title`
                （悬浮可见），不写可见文本。第三轮曾在点后面明写备注名（当时为了让
                「草稿不区分所属账户」一眼可见），结果只有这个 tab 多一截文字，用户
                2026-10-10 报「为什么包含账号的备注名？其他 tab 都不这样」——统一回色点。
                ⚠ 两处渲染必须同形：改这里请一并看邮件列表行的同名 marker（`m.accounts`）。 */}
            {accounts.length > 1 && (
              <span
                className="flex shrink-0 items-center gap-0.5"
                title={accountName(accountById(d.accountId), d.accountId)}
                data-slot="draft-account"
              >
                <span
                  className={cn(
                    "inline-block size-1.5 rounded-full",
                    accountDotProps(accountById(d.accountId)?.color ?? "").className,
                  )}
                  style={accountDotProps(accountById(d.accountId)?.color ?? "").style}
                />
              </span>
            )}
            {(d.attachments?.length ?? 0) > 0 && (
              <span
                className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground"
                title={d.attachments?.map((a) => a.filename).join("、")}
                data-slot="draft-attachments"
              >
                <PaperclipIcon className="size-3.5" aria-hidden />
                {d.attachments?.length}
              </span>
            )}
            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground group-hover/row:invisible group-has-[:focus-visible]/row:invisible">
              {formatDate(d.updatedAt, t("localeTag"))}
            </span>
          </span>
          <span className="block truncate text-sm">{d.subject || t("noSubject")}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {d.contentLoaded === false ? t("draftContentNotLoaded") : d.body || t("draftNoBody")}
          </span>
        </span>
      </button>
      {/* 行内操作：hover / 键盘聚焦时显现的删除（草稿没有星标 / 已读状态）。
          ⚠ 与邮件列表行同款：条件用 `:focus-visible`（`:focus-within` 会被鼠标点过的按钮
            钉住 → 悬浮别的行时两条并存），详见下方 mail-row-actions 的长注释 */}
      <span
        data-slot="mail-row-actions"
        className="absolute top-2 right-3 hidden items-center gap-0.5 rounded-lg border border-border bg-background p-0.5 shadow-sm group-hover/row:flex group-has-[:focus-visible]/row:flex"
      >
        <Button variant="ghost" size="icon-sm" aria-label={t("deleteDraft")} onClick={() => setPendingDraftDelete(d)}>
          <Trash2Icon />
        </Button>
      </span>
    </li>
  );

  return (
    // 整栏挂「点空白处退出多选」（见 onListBlankClick）：只读状态下这个 handler 直接返回
    // ⚠ `data-slot="mail-list-column"` 是 E2E 的钩子：面板自己的 padding 在**这个根之外**
    //   （点击不会冒泡到 handler），所以「点空白处」的用例必须点在根内部的空白上——
    //   取「工具栏块与批量条之间的行间隙」，那里命中的就是这个根元素
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1" data-slot="mail-list-column" onClick={onListBlankClick}>
      {/*
       * 工具栏（2026-10-05 用户定稿，方案 A：留在左侧栏）：
       *   行 1 = 账号下拉 + 搜索（收起/展开）+ 刷新 + 写邮件；
       *   行 2 = 视图与快捷筛选（下划线 Tabs + 未读/星标开关）。
       * ⚠ 行宽很小（桌面 = 左栏内容 384px）：账号与「写邮件」共享它——不够时账号截断、
       *   「写邮件」保持完整（分配规则见上方「行 1 的宽度分配」）。
       * 底栏只保留只读指示（选「全部账号」时列出合并了哪些账号），不承担筛选。
       */}
      <div className="flex shrink-0 flex-col gap-2">
        {/* 第一行（账号 + 查找 + 操作）：
            - 账号下拉放第一个（2026-10-05 用户定稿）——默认**完整显示**账号名/地址；
            - 搜索收起时是一个图标按钮，点击展开为输入框：账号同时收窄为「色点 + ≤4 字名」，
              搜索框「向左弹出」的观感由账号 / 写邮件两处收窄共同驱动（flex 宽度此消彼长）；
            - `flex-wrap` 是超窄屏的安全网 */}
        <div ref={rowRef} className="flex flex-wrap items-center gap-1.5">
          {accounts.length > 0 && (
            <AccountMenu
              accounts={accounts}
              value={accountFilter}
              onChange={setAccountFilter}
              collapsed={searchOpen}
              maxW={accountMaxW}
              onNeedWidth={setAccountWantW}
            />
          )}
          {/* 搜索区（2026-10-05 用户定稿）：`flex-1` 吸掉剩余空间，让**「搜索 / 刷新 / 写邮件」
              三件套固定在行右端**——切账号 / 搜索展开时它们不左右移动，点击位置稳定。
              代价是账号与搜索之间留一段空白（用户权衡后以此为先，勿再改成左排紧跟）。
              展开时输入框 w-full 占满该区、随账号收窄平滑变宽。
              ⚠ **不能给它固定最小宽**（曾用 min-w-40）：展开动画的每一帧都是「账号（渐变
              收窄中）+ 搜索框 + 固定项」共同布局，最小宽会在动画前半段把行 1 撑爆 →
              flex-wrap 把「写邮件」挤到第二行再弹回。flex-1 + min-w-0 会随账号收缩平滑变宽 */}
          <div className="relative flex min-h-7 min-w-0 flex-1 items-center justify-end">
            {/* 搜索图标（2026-10-05 用户定稿「统一联动」）：常挂载、绝对定位在区域右缘，
                与输入框交叉淡化——不再瞬切。展开时 inert + pointer-events-none：
                不可聚焦、不被读屏命中、不挡输入框/清除钮的点击 */}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setSearchClosing(false);
                setSearchOpen(true);
              }}
              aria-label={t("search")}
              title={t("search")}
              inert={searchOpen ? true : undefined}
              className={cn(
                // ⚠ 垂直居中用 `inset-y-0 my-auto`（不用 top-1/2 + -translate-y-1/2）：
                //   带 transform 的绝对定位元素会让 Playwright 的点击命中检查失效
                //   （E2E「合并视图」用例超时实锤：top:0 能点、top:50%+translate 点不到，
                //   hover 同样失败）——按钮的真实位置与命中框必须一致。
                "absolute inset-y-0 right-0 my-auto transition-opacity",
                MOTION_SIZE,
                searchOpen ? "pointer-events-none opacity-0" : "opacity-100",
              )}
            >
              <SearchIcon data-icon="default" />
            </Button>
            {/* 输入框：展开淡入；关闭后再挂 TOOLBAR_MS 播完淡出才卸载（searchClosing，
                fill-mode-forwards 把 0 透明度保持到卸载帧，避免动画结束回弹可见）。
                宽度 = 区域宽（w-full）——区域随账号/写邮件收窄平滑变宽，所以搜索框的
                「向左弹出」与它们的收窄是同一段动画（不加固定最小宽，见下方注释） */}
            {(searchOpen || searchClosing) && (
              <SearchInput
                autoFocus
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeSearch();
                }}
                onBlur={() => {
                  // 失焦且为空 = 放弃搜索：与 Esc 同一语义（含清词 + 退场动画）
                  if (!qInput.trim()) closeSearch();
                }}
                placeholder={t("searchPlaceholder")}
                clearLabel={t("clearSearch")}
                className={cn(
                  "w-full",
                  // ⚠ 退场态的 `motion-reduce:opacity-0` 不是可有可无：动画被关掉后，
                  //   `fill-mode-forwards` 那条「保持 0 透明度到卸载帧」的保障也一起失效，
                  //   元素本身仍可见——不加它，减弱动效的用户会在关闭后的 340ms 里看见
                  //   输入框原地闪一下再消失（比有动画还糟）。
                  !searchOpen && "pointer-events-none motion-reduce:opacity-0",
                  searchOpen ? "animate-in fade-in-0" : "animate-out fade-out-0 fill-mode-forwards",
                  "motion-reduce:animate-none!",
                  MOTION_SIZE,
                )}
                aria-label={t("searchPlaceholder")}
              />
            )}
          </div>
          {/* 「全部标为已读」（2026-10-05）：范围 = 当前账号筛选（「全部账号」= 全部账号），
              方向 / 搜索 / 星标不参与（未读本质是收件箱概念，见 markAllRead 注释）。
              位置 = 行 1 右端簇的**最左位**（搜索 / 刷新 / 写邮件都不因此移位，保「点击位置
              稳定」）。⚠ 不能放行 2：英文下 Tabs + 两个开关已占 380/384，再挤一个 28px
              图标必然换行（实测 en free = 4px；「未读」开关旁的空间中文够、英文不够）。
              无未读时禁用（title 换成原因说明，避免「点了没反应」）
              ⚠ 「选择」（多选批量）2026-10-07 曾同挂这一簇的最左位，2026-10-08 用户要求
                搬到**行内悬浮气泡栏**：它每行都在，账号邮箱才不再被裁（见 ROW_FIXED_W）。
                **勿加回行 1**——这一簇每多一个 28px 图标，账号选择器就少 28px。 */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={markAllRead}
            disabled={markingAll || markAllNothing}
            aria-label={t("markAllRead")}
            title={markAllNothing ? t("markAllReadNone") : t("markAllRead")}
          >
            {markingAll ? <Spinner /> : <MailCheckIcon data-icon="default" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={refresh}
            disabled={refreshing}
            aria-label={t("refresh")}
            title={t("refresh")}
          >
            {refreshing ? <Spinner /> : <RefreshCwIcon data-icon="default" />}
          </Button>
          {/* 「写邮件」：**搜索展开时**或者**账号格真的装不下时**缩为纯图标
              （2026-10-05 定稿 + 2026-10-12 恢复；判据见上方「行 1 的宽度分配」）；
              两种情况都消失后自动恢复完整文字。
              ⚠ 2026-10-05 二稿（用户定稿「动画统一联动」）：收起/展开**不再瞬切**——
              同一结构 + 过渡：文字段用 grid 轨道 1fr↔0fr 折叠（纯 CSS 自动宽，无需测量）、
              按钮 gap 同步收到 0、文字 opacity 同步淡出；三者与账号的 max-width 共用
              MOTION_SIZE（300ms ease-out）⇒ 逐帧「可见文字宽 = 全宽 × opacity」，
              是和账号/搜索框同一段运动（见 components/mail/motion.ts）。
              ⚠ 收起态宽 = 边框 2 + 内边距 12 + 图标 14 = 28px，与搜索/刷新图标钮对齐；
              形状保留 sm 的 h-7 与 14px 图标，避免 icon-sm 让图标 14↔16 跳变。
              ⚠ 文字段用 overflow-hidden 裁切而非 `truncate`——省略号会在收窄过程里闪一下
              「…」（账号组件踩过同样的坑）。可访问名恒为链接内文字（收起时仍在 DOM、
              只是被 0 宽裁掉）→ E2E/读屏稳定。
              紧凑内边距（px-1.5/gap-1，完整态中文 ≈74 / 英文 ≈68px）是为 384px 行宽算过的，
              改前先重算行 1 */}
          <Link
            ref={composeRef}
            href="/mail/compose"
            data-slot="button"
            title={composeCompact ? t("compose") : undefined}
            className={cn(
              buttonVariants({ size: "sm" }),
              "gap-1 px-1.5 transition-[gap]",
              MOTION_SIZE,
              composeCompact && "gap-0",
            )}
          >
            <SquarePenIcon data-icon="default" />
            <span
              data-slot="compose-label"
              className={cn(
                "grid transition-[grid-template-columns]",
                MOTION_SIZE,
                composeCompact ? "grid-cols-[0fr]" : "grid-cols-[1fr]",
              )}
            >
              <span
                className={cn(
                  "overflow-hidden whitespace-nowrap transition-opacity",
                  MOTION_SIZE,
                  composeCompact ? "opacity-0" : "opacity-100",
                )}
              >
                {t("compose")}
              </span>
            </span>
          </Link>
        </div>
        {/* 第二行（视图 + 快捷筛选）：左侧下划线 Tabs「全部 / 收件 / 发件」（纯方向视图）；
            右侧两个独立开关「未读」「星标」（2026-10-05 微调，用户定稿：星标不再是视图，
            可与方向叠加；未读从筛选行上提到这里并承接未读计数）。
            ⚠ 计数在两个开关的可访问名之外：aria-hidden，E2E 按名字精确匹配；
            计数形态的取舍见下方「未读」开关的注释 */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {/* ⚠ 加了「垃圾」tab 之后（2026-10-08），384px 左栏在**英文**下放不下 5 个 tab
              + 右侧两个开关。做法（用户指定"空间不够时做成一个 V 型符号下拉"）：
              给 tab 条套一层 `@container` 量宽盒 + 末尾一个 chevron 下拉，装放不下的视图。

              ⚠ **只在 lg 及以上生效**（两条容器查询前面都挂了 `max-lg:`）：窄屏本来就走
                「整页单栏 + 换行」那套（行上的 `flex-wrap` 是那里的安全网），tab 全部显示、
                chevron 不出现；lg 起左栏固定 26rem、量宽盒是 `lg:flex-1`（宽度确定），
                容器查询才有意义——否则"宽度由内容决定、内容又由宽度决定"会互相打架
                （隐藏 tab → 内容变窄 → 更该隐藏，浏览器只保证一轮求解，结果不可预期）。
              ⚠ 阈值按 lg 下实测的两种宽度取（留给 tab 的宽度：中文 234px / 英文 193px；
                5 个 tab 实测占 232 / 272px）：草稿 13rem（208px）、垃圾 14rem（224px）。
                于是中文 5 个全显示、英文自动收成 3 个 + chevron（3 个 tab + chevron = 190px）。
                ⚠ 改 tab 或开关文案后必须重量：`node .cache/probe-junk-tabs.mjs` */}
          {/* ⚠ `@container` 也必须挂 `lg:`：`container-type: inline-size` 自带**尺寸containment**，
              盒子宽度从此不再由内容决定——窄屏（<lg）下它就缩成 flex 剩余宽、内容溢出到
              右侧开关上（2026-10-08 实测 390px：「垃圾」和「未读」糊在一起）。挂上 `lg:`
              后窄屏是一个普通 div，回到「内容撑开 + flex-wrap 换行」的老行为。 */}
          <div className="flex items-center lg:@container lg:min-w-0 lg:flex-1">
            <Tabs value={view} onValueChange={(v) => changeView(v as ViewFilter)}>
              <TabsList variant="line" aria-label={t("viewSwitcherLabel")}>
                <TabsTrigger value="all">{t("filterAll")}</TabsTrigger>
                <TabsTrigger
                  value="received"
                  className="data-active:after:bg-emerald-600 dark:data-active:after:bg-emerald-400"
                >
                  {t("filterReceived")}
                </TabsTrigger>
                <TabsTrigger
                  value="sent"
                  className="data-active:after:bg-amber-600 dark:data-active:after:bg-amber-400"
                >
                  {t("filterSent")}
                </TabsTrigger>
                {/* 草稿箱（2026-10-06 用户指定）：不算入「全部」——草稿是独立数据源
                    （webmaild /drafts），不参与合并视图与未读统计 */}
                <TabsTrigger
                  value="drafts"
                  className="hidden max-lg:inline-flex @min-[13rem]:inline-flex"
                >
                  {t("filterDrafts")}
                </TabsTrigger>
                {/* 垃圾（2026-10-08 用户要求）：同样不算入「全部」；文件夹路径由服务端按
                    `\Junk` 探测（见 junkFolders），不算进任何方向视图 */}
                <TabsTrigger
                  value="junk"
                  className="hidden max-lg:inline-flex @min-[14rem]:inline-flex"
                >
                  {t("filterJunk")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {/* 溢出下拉：只在 lg 且 tab 条放不下时出现。⚠ 宽 24px（`w-6`）——英文下
                只剩 3px 余量，用 28px 的 `size-7` 就溢出了。触发器只放图标：带上文字标签
                （如「草稿」）会把宽度撑到 80px 以上，英文那一档立刻放不下。
                当前视图若正好是被收起来的那个，chevron 转成前景色 + 菜单项打勾来提示 */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    aria-label={t("moreViews")}
                    title={t("moreViews")}
                    aria-haspopup="menu"
                    className={cn(
                      "h-8 w-6 shrink-0 px-0 text-muted-foreground max-lg:hidden @min-[14rem]:hidden",
                      (view === "drafts" || view === "junk") && "text-foreground",
                    )}
                  >
                    <ChevronDownIcon className="size-4" aria-hidden />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="w-auto min-w-28">
                {(["drafts", "junk"] as const).map((v) => (
                  <DropdownMenuItem key={v} onClick={() => changeView(v)}>
                    {v === "drafts" ? t("filterDrafts") : t("filterJunk")}
                    {view === v && <CheckIcon className="ml-auto size-4" aria-hidden />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {/* 开关的「状态由图标本身承担」（2026-10-05 用户定稿，勿改回纯文字 chip——
              「未读」纯文字读不出开/关；也不用勾选框/开关组件，理由见 MAIL-AGENT.md 4.9）：
              未读 = 蓝点（亮起即开启，与头像未读点同色）；星标 = 星形线框 → 实心。
              ⚠ `multiple` 必须显式传：Base UI ToggleGroup 默认单选，不传则两开关互斥。
              ⚠ 值用「生效值」（2026-10-06 用户定稿，「垃圾」于 2026-10-10 第六轮加入）：
              「未读」在「发件」「草稿」「垃圾」禁用且显示为关——「发件」不可能有未读、
              「垃圾」里的未读不算收件箱未读（见 unseenActive 声明处） */}
          <ToggleGroup
            multiple
            value={[unseenActive ? "unseen" : "", flaggedActive ? "flagged" : ""].filter(Boolean)}
            onValueChange={(v) => {
              const nextUnseen = v.includes("unseen");
              /**
               * 在「全部」里打开「未读」时**切到「收件」tab**（2026-10-10 第九轮用户定稿：
               * 「在点击『未读』按钮后，应该跳转到『收件』tab 中筛选未读邮件」）。
               * 结果集其实完全相同（未读必然有收件箱副本，而「收件」= 有收件箱副本），
               * 跳过去只是把 tab 名字说对：未读是收件箱的概念，挂在「全部」下没有意义。
               * ⚠ 「垃圾」tab 里**不跳**：那里的未读开关是就地筛垃圾未读（同一个定稿）。
               */
              if (nextUnseen && !unseenOnly && view === "all") changeView("received");
              setUnseenOnly(nextUnseen);
              setFlaggedOnly(v.includes("flagged"));
            }}
            aria-label={t("filterQuickLabel")}
          >
            <ToggleGroupItem
              value="unseen"
              size="sm"
              disabled={view === "drafts" || view === "sent"}
              className="aria-pressed:bg-blue-600/10 aria-pressed:text-blue-700 dark:aria-pressed:bg-blue-400/15 dark:aria-pressed:text-blue-400"
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-blue-600 opacity-25 transition-opacity group-aria-pressed/toggle:opacity-100 dark:bg-blue-400"
              />
              {/* 未读计数（2026-10-05 用户定稿二稿「无胶囊角标」）：数量 = 当前账号
                  筛选范围内 INBOX 未读之和（与底栏统计同口径 unreadTotal）；0 不渲染。
                  ⚠ 口径（2026-10-10 第六轮起）：**未读 = 收件箱未读**，全站只有一个「未读」
                  数字——角标 / 底栏 / 本开关 / 后端 `filter=unseen` 四处同一口径。此前
                  `filter=unseen` 是「任一副本无 \Seen」，把垃圾箱里的未读也算进来，于是
                  开关写 2、点开却列出 7 封（用户 2026-10-10 报障）。搜索词生效时本数字
                  仍是「账号范围内的收件箱未读」这个统计量（不是当前搜索结果数）——这是
                  「全站同一个数」方案的代价，已知并接受。
                  形态：与标签同栖一个行内流，`align-super` 抬成「未读」右上角的上标角标——
                  **不带括号、不带胶囊底、不指定颜色**（继承开关文字色：未按下 = 普通前景，
                  按下 = 随标签变蓝）——继承色同时意味着对比度与标签同档（白底 ≈13:1、
                  按下态 ≈5.9:1），无需单独校准。
                  ⚠ 与标签之间没有 flex gap（那是 flex 容器子节点的间距，只在同一行内流的
                  两个行内盒之间不生效）——包裹 <span> 让文本与计数成为一个流，仅给 2px 间距。
                  ⚠ aria-hidden：开关可访问名保持「未读」（E2E 按名字精确匹配；计数另有
                  底栏「未读 n」文本供读屏） */}
              <span className="whitespace-nowrap">
                {t("filterUnseen")}
                {/* 「垃圾」tab 里不显示数字（第九轮）：那个数是**收件箱**未读，而这个 tab 里
                    筛的是垃圾未读——摆在一起就又成了第六轮那个「数字说 2、点开列出别的」 */}
                {view !== "junk" && unreadTotal > 0 && (
                  <span
                    data-slot="unseen-count"
                    aria-hidden="true"
                    className="ml-0.5 align-super text-xs leading-none tabular-nums"
                  >
                    {unreadTotal}
                  </span>
                )}
              </span>
            </ToggleGroupItem>
            <ToggleGroupItem value="flagged" size="sm" disabled={view === "drafts"}>
              <StarIcon className="transition-colors group-aria-pressed/toggle:fill-foreground" aria-hidden />
              {t("filterFlagged")}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* 多选批量操作条（多选批量）：只在选择模式下出现，位于列表之上、不随列表滚动。
          「退出多选」就在这条栏的最右端（✕，单实例）；另有隐式出口：点列表空白处、按 Esc */}
      {selectMode && view !== "drafts" && (
        <MailBatchBar
          count={matchedCount ?? 0}
          total={allMatching ? (matchedCount ?? 0) : items.length}
          allMatching={allMatching}
          matchCount={matchCount}
          excludedCount={excludedCount}
          deleteBlocked={deleteBlocked}
          deleteLimit={MAX_BATCH_DELETE}
          busy={batchBusy}
          allSeen={allSeen}
          allUnseen={allUnseen}
          onMarkSeen={() => void batchFlags({ seen: true })}
          onMarkUnseen={() => void batchFlags({ seen: false })}
          onDelete={() => setBatchDeleteOpen(true)}
          onToggleAll={toggleAll}
          onExit={exitSelectMode}
        />
      )}

      {/*
       * 列表滚动区（4.12）：宽屏下**始终**填满面板剩余高度——面板高度只由视口决定，
       * 与「全部 / 未读 / 星标」筛出的邮件多少无关（曾随筛选结果长短伸缩，用户反馈）。
       * 空态与加载骨架也在这块里居中，故少邮件时面板不会缩成一小条。
       * 右侧滚动条自带在面板内边距之内，与面板边框留出一段边距。
       */}
      <div
        data-slot="mail-list-scroll"
        className="flex min-h-0 flex-col lg:flex-1 lg:overflow-y-auto"
      >
        {/*
         * 「列表已在屏、这次刷新失败」（2026-10-10 第十二轮）：
         * 旧行为是**把已经加载出来的邮件整个换成错误空态**——用户只是点了一下刷新（或后台
         * 抖动了一下），正在读的列表就没了、滚动位置也丢了。现在改成「旧列表原地留着 +
         * 头顶一条说明」，失败的影响面缩成一行；真的没有旧数据时才走整块错误空态。
         */}
        {view !== "drafts" && error && items.length > 0 && (
          <p
            data-slot="mail-list-stale"
            className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          >
            <CircleAlertIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{t("staleList")}</span>
            <button
              type="button"
              onClick={reload}
              className="shrink-0 rounded-sm font-medium underline underline-offset-4 hover:text-foreground"
            >
              {t("retry")}
            </button>
          </p>
        )}
        {/* 加载态（2026-10-05 改）：骨架屏只用于**首次**加载；重载时保留旧列表并淡到 60%
            （与日历的更新中同一语言）——此前每次点 tab/开关都整个换成骨架、再换回来，
            用户报「列表闪烁抖动」；顺带把「加载中」的观感从「消失重来」变成「原地更新」 */}
        {view === "drafts" ? (
          // 草稿箱（2026-10-10 起：**服务商的草稿文件夹是唯一事实源**，本地表只是暂存 + 解析缓存）
          // - 先出本地缓存、再 `?refresh=1` 去服务端对一遍（手机写的草稿由此进来，见 loadDrafts）；
          // - 行点击进写信页继续编辑（站内打开时按需抓原文解析）；
          // - 30 天前的旧草稿收进折叠区（数据一封不少，只是不糊住当前在写的那几封）。
          drafts === null ? (
            <ListSkeleton />
          ) : visibleDrafts.length === 0 && olderVisible.length === 0 ? (
            <Empty>
              <EmptyMedia variant="icon">
                <FilePenLineIcon aria-hidden />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyDescription>{q ? t("emptySearch") : t("emptyDrafts")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              {(draftsSyncing || draftErrors.length > 0) && (
                <p
                  data-slot="drafts-sync-note"
                  className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground"
                >
                  {draftsSyncing ? (
                    <>
                      <Spinner /> {t("draftsSyncing")}
                    </>
                  ) : (
                    t("draftsCacheNote")
                  )}
                </p>
              )}
              <ul
                className="divide-y divide-border rounded-xl border border-border lg:rounded-none lg:border-0"
                data-slot="mail-draft-list"
              >
                {visibleDrafts.map(renderDraftRow)}
              </ul>
              {olderVisible.length > 0 && (
                <div className="mt-2">
                  <button
                    type="button"
                    data-slot="drafts-older-toggle"
                    aria-expanded={olderDraftsOpen}
                    onClick={() => setOlderDraftsOpen((o) => !o)}
                    className="flex items-center gap-1 rounded-md px-1 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {olderDraftsOpen ? (
                      <ChevronDownIcon className="size-3.5" aria-hidden />
                    ) : (
                      <ChevronRightIcon className="size-3.5" aria-hidden />
                    )}
                    {t("draftsOlder", { count: olderVisible.length })}
                  </button>
                  {olderDraftsOpen && (
                    <ul
                      className="divide-y divide-border rounded-xl border border-border lg:rounded-none lg:border-0"
                      data-slot="mail-draft-list-older"
                    >
                      {olderVisible.map(renderDraftRow)}
                    </ul>
                  )}
                </div>
              )}
            </>
          )
        ) : loading && !hasLoadedRef.current ? (
          <ListSkeleton />
        ) : error && items.length === 0 ? (
          /*
           * 加载失败（2026-10-04 用户反馈；2026-10-10 第十二轮补齐文案分档）：
           * **不回显 `webmaild_unreachable` 这类内部错误码**（用户看不懂也没法处理），
           * 也不能退化成「暂无邮件」空态——那会让人以为真的没有邮件。
           *
           * ⚠ 文案必须走 `mailErrorText`（第十二轮修的洞）：此前硬编码 `loadFailedHint`
           *   （「邮件服务暂时不可用」），于是**会话过期的 401 也被这么显示**——用户照着
           *   「稍后重试」点一百次也不会好，因为真正要做的是重新登录。
           * ⚠ 401 给「重新登录」而不是「重试」：重试对这个错误没有任何意义。
           */
          <Empty>
            <EmptyMedia variant="icon">
              <CircleAlertIcon aria-hidden />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{t("loadFailed")}</EmptyTitle>
              <EmptyDescription>{mailErrorText(error, t)}</EmptyDescription>
            </EmptyHeader>
            {mailErrorKind(error) === "unauthorized" ? (
              <Link
                href="/login"
                data-slot="button"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <LogInIcon data-icon="default" />
                {t("relogin")}
              </Link>
            ) : (
              <Button variant="outline" size="sm" onClick={reload}>
                <RefreshCwIcon data-icon="default" />
                {t("retry")}
              </Button>
            )}
          </Empty>
        ) : items.length === 0 ? (
          <Empty>
            <EmptyMedia variant="icon">
              <InboxIcon aria-hidden />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyDescription>{q ? t("emptySearch") : emptyText}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul
            ref={listRef}
            onKeyDown={onListKeyDown}
            aria-busy={loading || undefined}
            className={cn(
              "divide-y divide-border rounded-xl border border-border transition-opacity lg:rounded-none lg:border-0",
              loading && "opacity-60",
            )}
            data-slot="mail-list"
          >
          {groupedItems.map(({ lead, members }) => {
            // 展开键用**代表行的 messageId**（与 toggleThread 收到的一致）——
            // 分组的 key 是 threadKey，两者不是一回事，别混用
            const open = expandedThreads.has(lead.messageId);
            return (
              <Fragment key={lead.messageId}>
                <MailRow
                  item={lead}
                  active={activeMessageId === lead.messageId}
                  selected={allMatching ? !excluded.has(lead.messageId) : selected.has(lead.messageId)}
                  selectMode={selectMode}
                  showAccountDots={accounts.length > 1}
                  accountsById={accountsById}
                  ownEmails={ownEmails}
                  ownReady={ownReady}
                  localeTag={t("localeTag")}
                  onOpen={openItem}
                  onToggleSelect={toggleSelect}
                  onFlag={postFlags}
                  onJunk={markJunkFromList}
                  onNotJunk={notJunkFromList}
                  onDelete={deleteRow}
                  onEnterSelectMode={enterSelectMode}
                  threadCount={members.length}
                  threadOpen={open}
                  onToggleThread={toggleThread}
                  stale={staleIds.has(lead.messageId)}
                />
                {/* 就地展开（2026-10-10）：把组内**其它**几封排在代表行后面，
                    组内顺序 = 服务端给的 date DESC，故越往下越早 */}
                {open &&
                  members.slice(1).map((m) => (
                    <ThreadChildRow
                      key={m.messageId}
                      item={m}
                      localeTag={t("localeTag")}
                      showAccountDots={accounts.length > 1}
                      accountsById={accountsById}
                      onOpen={openItem}
                    />
                  ))}
              </Fragment>
            );
          })}
          </ul>
        )}

        {/* 无限滚动哨兵 + 「加载更多」兜底：随列表一起滚（不再固定在外壳底部）。
            ⚠ **哨兵常驻**（外层只判 `next`，**不判 `loading`**）：它一旦被 `loading` 卸载重建，
              IntersectionObserver 就会盯着旧节点失效（→ 无限滚动静默死掉，见上方「无限滚动」）。
              只有「加载更多」按钮跟随 `loading` 隐藏（重载期间列表在换，按钮没有意义）。 */}
        {pagedNext && (
          <div className="flex shrink-0 flex-col items-center gap-2">
            <div ref={setSentinelNode} className="h-px w-full" aria-hidden />
            {!loading && (
              /*
               * ⚠ 这一枚的观感有两条硬约束（2026-10-09 用户在真实浏览器里报「滚动到底弹出加载提示
               *   时先是深黑、再变浅灰，还叠影/卡顿」）：
               *   ① **不许用基类的 `disabled:opacity-50` 渐隐**：基类还带 `transition-all`，于是
               *      「1 → 0.5」的渐隐会被真的画出来（实测 opacity 1 → 0.82 → 0.5）——ghost 按钮
               *      本是透明底 + 近黑文字，看起来就是「深黑转浅灰」；`transition-colors` 只留
               *      颜色过渡，`disabled:opacity-100` 保住不透明度（禁用语义仍由 `disabled` 给）。
               *   ② **图标槽必须常驻、尺寸固定，但空闲时里面什么都不放**：旧写法
               *      `{loadingMore ? <Spinner/> : null}` 是条件插入第一个子节点 → 按钮宽度
               *      78 → 98px，又因 `items-center` 居中，x 跟着左跳 10px（实测 330.5 → 320.5）。
               *      续页快时 150ms 过渡被反复打断，深色图标与浅灰中间态同屏 = 用户说的
               *      「相互叠加」。现在槽位（14px）**永远在布局里**：空闲留白、加载时原地换成
               *      `Spinner` → 按钮盒子与文案位置**一格都不动**。
               *      ⚠ 空闲槽里**不要放任何图标**（2026-10-09 用户实测）：先放过一枚 `ChevronDownIcon`
               *      表示"下面还有"，用户看到的就是「加载完了这枚 ⌄ 怎么还在」——它会被当成
               *      "卡住的加载指示"。留白虽然让按钮比原来宽 34px，但按钮是 ghost（无底色边框），
               *      看不出盒子，只有文案的位置要紧。
               *   ③ **`pr-7`（28px）不是随手写的**：左侧固定开销 = `pl-2.5`(10) + 槽(14) + `gap-1`(4)
               *      = 28px。右内边距给同样的 28px，文案才真正居中（否则会偏右 9px，实测
               *      「文案中心 − 列中心 = +9px」）。且槽位永远占位、只换内容 → 空闲/加载两态
               *      文案位置**逐像素相同**（实测两态 rect 完全一致）。
               */
              <Button
                variant="ghost"
                size="sm"
                data-slot="mail-load-more"
                aria-busy={loadingMore || undefined}
                onClick={loadMore}
                disabled={loadingMore}
                className="pr-7 transition-colors disabled:opacity-100"
              >
                <span className="flex size-3.5 shrink-0 items-center justify-center" aria-hidden>
                  {loadingMore && <Spinner className="size-3.5" />}
                </span>
                {t("loadMore")}
              </Button>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t("deleteConfirmTitle")}
        description={t("deleteConfirmBody")}
        confirmLabel={t("delete")}
        pending={deleting}
        onConfirm={doDelete}
      />

      {/* 批量删除确认：与单条删除同一套站内确认弹窗（破坏性操作不用原生 confirm）。
          「全部匹配」模式下文案要点明**范围**（可能包含没加载出来的那些），
          且此时删除已被 20 封上限限住（超了按钮就进不到这里）。 */}
      <ConfirmDialog
        open={batchDeleteOpen}
        onOpenChange={setBatchDeleteOpen}
        title={
          allMatching
            ? t("batchDeleteAllTitle", { count: matchedCount ?? 0 })
            : t("batchDeleteTitle", { count: selected.size })
        }
        description={allMatching ? t("batchDeleteAllBody") : t("batchDeleteBody")}
        confirmLabel={t("delete")}
        pending={batchBusy}
        onConfirm={() => void batchDelete()}
      />

      {/* 草稿删除确认（草稿箱行内删除；破坏性操作不用原生 confirm） */}
      <ConfirmDialog
        open={pendingDraftDelete !== null}
        onOpenChange={(open) => !open && setPendingDraftDelete(null)}
        title={t("deleteDraftConfirmTitle")}
        description={t("deleteDraftConfirmBody")}
        confirmLabel={t("deleteDraft")}
        pending={deletingDraft}
        onConfirm={doDeleteDraft}
      />
    </div>
  );
}
