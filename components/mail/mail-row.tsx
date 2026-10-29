"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowDownLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
  MailIcon,
  MailOpenIcon,
  PaperclipIcon,
  SquareCheckBigIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/mail/format";
import { hasJunkCopy, isSentItem } from "@/lib/mail/kind";
import { accountDotProps } from "@/components/mail/account-dot";
import { accountName } from "@/components/mail/account-label";
import { JunkIcon, NotJunkIcon } from "@/components/mail/junk-icons";
import { MailRowCheckbox } from "@/components/mail/mail-batch-bar";
import { UNREAD_DOT_CLASS } from "@/components/mail/unread-color";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { MailAccount, MailListItem } from "@/lib/mail/types";

/**
 * 拼「可访问名」用的连接符（`Intl.ListFormat`，随 `localeTag` 走）。
 *
 * 为什么不 `join("、")`：站点是中英双语——中文该用顿号、英文该用逗号，写死哪一种都会在
 * 另一种语言里别扭。
 *
 * ⚠ `style` / `type` 这一对是**试出来**的，别凭直觉改：
 *   - `type: "unit"` 看着最像「一串并列的名词」，但**zh-CN 的 unit 模式没有分隔符**，
 *     `format(["未读","收件","张老师"])` 直接连成「未读收件张老师」——等于没拼。
 *   - `type: "conjunction"` + `style: "long"` 会给「未读、收件和张老师」/「…, and …」，
 *     多出来的「和 / and」把一串标签读成了一句通顺的话，语义是错的。
 *   - `type: "conjunction"` + `style: "narrow"` 才两头都对：zh-CN「未读、收件、张老师」、
 *     en-US「未读, 收件, 张老师」——只有分隔符，没有连接词。
 *   （实测见 E2E「列表行：可访问名是短句…」，它锁了中文那顿号。）
 *
 * ⚠ 按 `localeTag` 缓存：`new Intl.*` 每次都要走一遍 locale 解析，而首屏一次渲染几百行，
 *   每行每渲染都新建一个就是纯粹的浪费。
 */
const LIST_FORMATS = new Map<string, Intl.ListFormat>();
function rowLabelFormat(localeTag: string): Intl.ListFormat {
  let format = LIST_FORMATS.get(localeTag);
  if (!format) {
    format = new Intl.ListFormat(localeTag, { style: "narrow", type: "conjunction" });
    LIST_FORMATS.set(localeTag, format);
  }
  return format;
}

/**
 * 列表行（从 `mail-client.tsx` 抽出来的 `memo` 组件）。
 *
 * 为什么要 memo：列表分页到几百行后，父组件的任何 state 变化（搜索框每敲一个字符、
 * 展开/收起筛选、切换选择模式、刷新按钮转动）都会让 `items.map` 里内联的全部行跟着
 * 重渲。行只在自身涉及的字段变化时才需要重画，故把每个字段作为独立 prop 传进来，
 * 由 `memo` 的浅比较挡掉无关重渲。
 *
 * ⚠ 传进来的回调必须是稳定引用（父组件用 `useCallback` 固定），否则 memo 失效。
 *   `accountsById` 同理：父组件按「id + 显示名 + 颜色」做键缓存，未读数的轮询刷新
 *   不会换掉这个 Map 的引用。
 * ⚠ 每个字段都单独传（`active` / `selected` 等算成 boolean），而不是把整个
 *   `activeId` / `selected` 传进来：前者只让真变化的那一两行重渲，后者会让全部行重渲。
 */
export interface MailRowProps {
  item: MailListItem;
  /** 宽屏右栏正在看这一封 */
  active: boolean;
  /** 选择模式下这一行已勾选 */
  selected: boolean;
  selectMode: boolean;
  /** 多账号时才显示账号色点 */
  showAccountDots: boolean;
  accountsById: Map<string, MailAccount>;
  /** 站主自己的地址（判定「双向邮件」） */
  ownEmails: Set<string>;
  ownReady: boolean;
  localeTag: string;
  onOpen: (item: MailListItem) => void;
  onToggleSelect: (messageId: string) => void;
  onFlag: (item: MailListItem, change: { seen?: boolean; flagged?: boolean }) => void;
  onJunk: (item: MailListItem) => void;
  /** 这封**有垃圾副本**时的动作（标为垃圾的逆操作）；判断见 lib/mail/kind.ts 的 hasJunkCopy */
  onNotJunk: (item: MailListItem) => void;
  onDelete: (item: MailListItem) => void;
  onEnterSelectMode: () => void;
  /**
   * 同一会话在**已加载列表**里的封数（2026-10-10 列表聚合）。>1 时行尾出现计数与
   * 展开箭头，`<=1` 时整行与从前逐像素一致（不占位、不动布局）。
   * ⚠ 传的是**已加载**的封数而不是服务端总数：分页里更靠后的几封还没拿到，
   *   数字会随滚动增长——这与列表本身是同一口径（"当前列表"）。
   */
  threadCount: number;
  /** 这一行的会话已就地展开（子行由父组件渲染在它后面） */
  threadOpen: boolean;
  onToggleThread: (messageId: string) => void;
  /**
   * 这一行的**数据可能已过期**（乐观放回后还没跟服务端对齐，2026-10-10）→ 不渲染
   * 行内操作条。
   *
   * 为什么必须有它在：乐观放回时手里那份 `copies` 是**操作之前**的（比如撤销后放回的
   * 那一行，`copies` 还指着垃圾夹、uid 已经失效）。留着操作条，用户再点一下
   * 「标为垃圾」，服务端就会拿着那个过期 uid 在**别的文件夹**里搬——搬错的是另一封。
   * 下一次整表重取会把这一行换成服务端的真实数据，标记随之消除。
   */
  stale?: boolean;
}

function MailRowImpl({
  item: m,
  active,
  selected,
  selectMode,
  showAccountDots,
  accountsById,
  ownEmails,
  ownReady,
  localeTag,
  onOpen,
  onToggleSelect,
  onFlag,
  onJunk,
  onNotJunk,
  onDelete,
  onEnterSelectMode,
  threadCount,
  threadOpen,
  onToggleThread,
  stale = false,
}: MailRowProps) {
  const t = useTranslations("mail");
  /** 有会话才给行尾留出箭头的位置（无会话时行布局与从前逐像素一致） */
  const showsThread = threadCount > 1;
  /**
   * 行尾常驻的会话计数按钮是否渲染（选择模式下不渲染——见下方气泡栏注释）。
   * ⚠ 它**不是**只占 20px 的小箭头：`「N 封」+ 箭头 + px-1` 实测 **55px**（三位数 ≈65px），
   *   加 `right-3` 后从行右缘往左吃掉 **≈67px**。日期与悬浮动作条都得按这个**真实**宽度让位
   *   （2026-10-12 用户截图报「日期被挤成一团」：日期右缘在 right-40、按钮左缘在 right-67，
   *   非悬浮时二者叠印成「10月10日封」；悬浮时动作条右端的「删除」也被它压掉一半）。
   */
  const hasThreadToggle = showsThread && !stale && !selectMode;
  /** 这封有垃圾副本 → 整理动作换成「移出垃圾」（见 hasJunkCopy 的注释） */
  const junkOnly = hasJunkCopy(m.copies);
  const sent = isSentItem(m.copies);
  const dual =
    ownReady &&
    ownEmails.has(m.fromAddr.toLowerCase()) &&
    (m.to ?? []).some((a) => !!a.address && ownEmails.has(a.address.toLowerCase()));

  /**
   * 首行名字位显示的「对方」：收件 = 发件人；发件 = 收件人（多人补「等 N 人」）。
   * 方向由头像右下角的箭头角标（↙ 收件 / ↗ 发件）表达，名字位只放名字——
   * 不带「发给 」前缀（2026-10-04 用户反馈：文字前缀让列表密密麻麻，改用视觉语言）。
   */
  const peerName = (): string =>
    sent && m.to?.length ? m.to[0].name || m.to[0].address || "" : m.fromName || m.fromAddr;
  const peerLabel = (): string =>
    sent && m.to?.length
      ? (m.to[0].name || m.to[0].address || "") +
        (m.to.length > 1 ? ` ${t("andOthers", { count: m.to.length })}` : "")
      : m.fromName || m.fromAddr;

  /** 主题与时间各算一次，可见文本与可访问名共用（免得同名两处各调一次 `formatDate`） */
  const subjectText = m.subject || t("noSubject");
  const dateText = formatDate(m.date, localeTag);

  /**
   * 整行按钮的**可访问名**（2026-10-11，原改进清单第 9 条「列表行的可访问名太长」）。
   *
   * 不给 `aria-label` 时，名字由**全部后代文本**按 DOM 顺序拼出来：方向角标 + 未读角标
   * + 对方 + 日期 + 主题 + **摘要**。摘要是「预览」，在列表里逐字念完（几十个字）恰好把
   * 「这是谁、什么事、什么时候」淹没掉——读屏用户靠名字扫列表时最先失去的就是它。
   *
   * 这里显式给一份短名字，顺序 = 状态 → 方向 → 对方 → 主题 → 时间 → 附件 → 星标。
   * ⚠ 显式名字会**整体覆盖**后代的可访问名，所以未读 / 方向 / 附件 / 星标这四件事必须
   *   在这里手动补回来——下面角标上的 `aria-label` 从此对读屏不再生效（保留只是给 E2E
   *   与排障看），别以为删掉它们就能连带删掉名字里的状态。
   * ⚠ 摘要**不进名字**是要点，不是漏写：它仍然在可见文本里。
   * ⚠ 已读的行不提「未读」（与 Gmail 同一取舍：只有异常态才占名字里的位置），但方向、
   *   附件、星标是「是 / 否」都影响扫读，故按布尔补。
   * ⚠ 代价：名字里从此有「未读」「含附件」「已加星标」这些词，而 Playwright 的
   *   `getByRole({ name })` / `getByLabel()` 默认**子串匹配**——行里那枚回形针图标
   *   （`aria-label="含附件"`）、行内动作按钮（`aria-label="加星标"`，是「已加星标」的
   *   子串）都会变成第二个命中（严格模式直接报错，实测踩到过一次）。凡按名字找行内元素
   *   的定位器一律补 `exact: true`，见 4.22。
   */
  const rowLabel = rowLabelFormat(localeTag).format(
    [
      m.seen ? "" : t("filterUnseen"),
      // 双向（收 / 发都是我的账号）在名字里用短说法：`directionBoth` 是一整句话，塞进名字太吵
      dual ? t("directionBothShort") : sent ? t("filterSent") : t("filterReceived"),
      peerLabel(),
      subjectText,
      dateText,
      m.hasAttach ? t("hasAttachment") : "",
      m.flagged ? t("flagged") : "",
    ].filter(Boolean),
  );

  return (
    <li className="group/row relative">
      <button
        type="button"
        data-mail-row
        aria-label={rowLabel}
        aria-current={active || undefined}
        aria-pressed={selectMode ? selected : undefined}
        onClick={() => (selectMode ? onToggleSelect(m.messageId) : onOpen(m))}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none",
          // 会话行尾要摆展开箭头，文字区让出它的宽度（无会话时不多占一像素）
          showsThread && "pr-10",
          active && "bg-accent/60",
        )}
      >
        {/* 选择模式：行首一个复选框（纯视觉，勾选由整行按钮承担——触屏上点整行
            比点 16px 的方框可靠得多；`aria-pressed` 在按钮上，读屏与 E2E 用它） */}
        {selectMode && <MailRowCheckbox checked={selected} />}
        {/* 左列：发件人头像（每行都有，结构整齐）+ 两个角标，各占一角互不重叠：
            - 右上 = 未读蓝点（勿改回 bg-primary 灰点、勿改回独立圆点列）
            - 右下 = 方向角标（2026-10-04 用户定稿）：↙ 收件 / ↗ 发件，双向都标
              （用户指定「收件也需要标记」）；徽章底中性，箭头按方向着色
              （收件 emerald / 发件 amber，与 tab 下划线、agent 页徽章同色） */}
        <span className="relative shrink-0 self-center">
          <Avatar>
            <AvatarFallback>{peerName().charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          {!m.seen && (
            <span
              data-slot="mail-unread-badge"
              aria-label={t("filterUnseen")}
              className={cn(
                "absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background",
                UNREAD_DOT_CLASS,
              )}
            />
          )}
          <span
            data-slot="mail-direction-badge"
            data-direction={dual ? "both" : sent ? "sent" : "received"}
            role="img"
            aria-label={dual ? t("directionBoth") : sent ? t("filterSent") : t("filterReceived")}
            className="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
          >
            {dual ? (
              /* 双向（收 / 发都是我的账号，2026-10-06 用户指定）：双色双向箭头——
                 同一枚 ArrowLeftRight 叠两次，**按横向中线**切（上支 = 收件色 / 下支 = 发件色），
                 每支箭头各自保持单色；整体再 **-45° 斜过来**，与单箭头角标同斜向
                 （转后 = 绿 ↙ 收件 + 橙 ↗ 发件，与 ArrowDownLeft / ArrowUpRight 一致）。
                 ⚠ 勿改回「按竖向中线」切：图标是上下两支箭头组成（上支 y∈[2,12]、
                    下支 y∈[12,22]，中线 y=12 恰好是两支之间的空白），竖向切会把
                    两支箭头各自劈成半绿半橙（绿头橙尾 / 橙头绿尾），14px 下像一张
                    颜色断开的坏图（2026-10-06 用户报障，截图取证后修正）。
                 ⚠ 旋转必须 -45°（逆时针）：+45° 会转成绿 ↖ / 橙 ↘，与「收到 ↙ /
                    发出 ↗」反向；转后两支箭头墨迹 9.2px、间距 5px，均在 12px 盒内不溢出 */
              <span className="relative block size-3 -rotate-45" aria-hidden>
                <ArrowLeftRightIcon
                  className="absolute inset-0 size-3 text-emerald-600 dark:text-emerald-400"
                  style={{ clipPath: "inset(0 0 50% 0)" }}
                />
                <ArrowLeftRightIcon
                  className="absolute inset-0 size-3 text-amber-600 dark:text-amber-400"
                  style={{ clipPath: "inset(50% 0 0 0)" }}
                />
              </span>
            ) : sent ? (
              <ArrowUpRightIcon className="size-2.5 text-amber-600 dark:text-amber-400" aria-hidden />
            ) : (
              <ArrowDownLeftIcon className="size-2.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            )}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            {/* 已读/未读三通道区分（勿只靠颜色）：未读 = 蓝角标 + 加粗 + 前景色时间；已读整行次要色退到背景。
                ⚠ 首行名字位永远是「对方」：收件 = 发件人、发件 = 收件人（方向看头像角标，见 peerLabel）
                ⚠ 名字行分区（2026-10-16 归列，用户报「邮件列表 UI 有点乱」）：名字**前**只放账号色点
                   （固定列，多行的色点竖直对齐），名字**后**只放右簇（附件 / 星标 / 日期，右对齐成一串）。
                   别把色点 / 星标 / 回形针放回名字后面——它们会跟着名字长度浮动，每行停在不同位置，
                   名字长的行里还会被顶到日期旁边（这正是「乱」的来源）。 */}
            {showAccountDots && (
              <span
                className="flex shrink-0 items-center gap-0.5 self-center"
                title={m.accounts.map((id) => accountName(accountsById.get(id), id)).join("、")}
              >
                {m.accounts.map((id) => (
                  <span
                    key={id}
                    className={cn("inline-block size-1.5 rounded-full", accountDotProps(accountsById.get(id)?.color ?? "").className)}
                    style={accountDotProps(accountsById.get(id)?.color ?? "").style}
                  />
                ))}
              </span>
            )}
            <span className={cn("truncate text-sm", m.seen ? "text-muted-foreground" : "font-semibold")}>
              {peerLabel()}
            </span>
            {/* 右簇：附件 / 星标 / 日期（2026-10-16 归列）。三件同进同隐——hover 时整簇让位给
                行内操作条；只让日期的话，★/📎 会被操作条直接盖住（它们现在就在操作条的下方区域）。 */}
            <span
              className={cn(
                "ml-auto flex shrink-0 items-baseline gap-2 group-hover/row:invisible group-has-[:focus-visible]/row:invisible",
                // 会话行：计数按钮常驻在行尾，整簇再往左让 40px（行本身已 pr-10 让了 40）
                // —— 合计 80px ≥ 按钮的 ≈67px（三位数 ≈77px），两者不再叠印
                hasThreadToggle && "mr-10",
              )}
            >
              {m.hasAttach && (
                <PaperclipIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("hasAttachment")} />
              )}
              {m.flagged && <StarIcon className="size-3.5 shrink-0 fill-foreground" aria-label={t("flagged")} />}
              <span className={cn("text-xs tabular-nums", m.seen ? "text-muted-foreground" : "font-medium text-foreground")}>
                {dateText}
              </span>
            </span>
          </span>
          {/* 主题 + 摘要合并成一行（2026-10-16 用户报「列表有点乱」）：主题在前、摘要随其后，
              同一行截断。三行文本里主题与摘要常是同一句话的两版（列表里重复感强），合并后
              每行只剩两行文本，扫视快一档（Gmail / Superhuman 同款语言）。
              ⚠ 主题与摘要在同一行里靠**颜色**分层：未读 = 主题加粗前景色；已读 = 主题
                `text-foreground/80`（**别再退回「已读主题次要色」——那样主题与摘要同为灰、
                同一行里糊成一片，两边都读不出来**）；摘要恒为次要色。
              ⚠ 这是**一个** `span.truncate`（主题与摘要文本流连续、在行尾统一截断）——
                E2E 的 rowStyle 用 `span.truncate` 前两个取「名字 / 主题块」，新增独立
                truncate 的 span 会把它错位。 */}
          <span className="block truncate text-sm">
            <span className={cn(m.seen ? "text-foreground/80" : "font-semibold")}>{subjectText}</span>
            {m.snippet && (
              <>
                {" "}
                <span className="text-muted-foreground">{m.snippet}</span>
              </>
            )}
          </span>
        </span>
      </button>
      {/* 行内快捷操作（4.9）：hover / 键盘聚焦时显现（日期同时让位）；
          与行主按钮是兄弟节点，避免嵌套交互元素。
          ⚠ 「选择」（多选批量）2026-10-08 按用户要求从工具栏行 1 **搬到这里**
            （行 1 那 28px 挤掉了账号选择器里的邮箱地址）——**它只是入口**，
            退出在批量条最右端那枚 ✕。
          ⚠ **选择模式下整条气泡栏不渲染**（含这里的 ☑ 与星标/已读/删除）：此刻整行
            点击 = 勾选，摆一排行内动作会打架。⚠ 曾试过「选中模式只留 ☑ 当出口」——
            那个位置是 **per-row** 的：桌面端「点进来那行保有焦点 + 鼠标移到另一行」
            会同时冒两枚，触屏端气泡栏常显、每行一枚（6 行 = 6 枚「退出多选」），
            用户 2026-10-08 截图报障。单例动作必须挂在单例容器里。
          ⚠ 用条件渲染而非 `hidden` 属性：`globals.css` 里那条
            `[data-slot="mail-row-actions"][hidden] { display: none !important }`
            已随之删除（类选择器优先级高于 `[hidden]` 的 UA 规则，属性写法压不住
            hover），**别改回属性写法**。`@media (hover:none)` 的常显规则与结构无关，
            仍然有效（触屏上这条气泡栏一直可见，也是触屏进多选的入口）。
          ⚠ **显现条件是 `:focus-visible` 而不是 `:focus-within`**（2026-10-10 第十一轮
            用户截图报障「对一行操作之后，悬浮另一行会出现两条悬浮操作条」）：鼠标点过的按钮
            **仍持有焦点**（实测 `document.activeElement` 就是那一行的按钮、且
            `matches(":focus-visible") === false`），`focus-within` 把那一行的气泡栏
            **钉在屏幕上**——鼠标移到别的行就两条并存。键盘 Tab 进这一行时按钮是
            `:focus-visible`，气泡栏照旧出现、可继续 Tab 进去，可达性不变。
            ⚠ 日期的 `invisible` 必须用**同一个触发条件**（否则鼠标点完那行的日期被永久藏掉） */}
      {!selectMode && !stale && (
        <span
          data-slot="mail-row-actions"
          className={cn(
            "absolute top-2 right-3 hidden items-center gap-0.5 rounded-lg border border-border bg-background p-0.5 shadow-sm group-hover/row:flex group-has-[:focus-visible]/row:flex",
            // 会话行尾的计数按钮常驻在 right-3（「N 封」实宽 ≈55px，含 right-3 共吃掉 ≈67px）
            // ——悬浮操作条整体再左移一档到 right-20（80px），间隙 ≥ 3px。
            // ⚠ 旧的 right-10（40px）是按「箭头只有 20px」估的，实际把右端的「删除」
            //   压在按钮下面（点不到、还叠印），2026-10-12 一并修正
            hasThreadToggle && "right-20",
          )}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("batchEnter")}
            title={t("batchEnter")}
            onClick={onEnterSelectMode}
          >
            <SquareCheckBigIcon />
          </Button>
          {/* 分隔线：把「选择」（模式的开关，作用于整张列表）与后面几个**作用于本行**
              的动作分开——否则图标并排，☑ 会被读成「又一个行内动作」。
              形态抄批量条里「计数 | 动作」那道分隔线（h-4 w-px bg-border）
              ⚠ 分隔线之后四个动作的顺序与详情页工具栏**逐字一致**（2026-10-10 第七轮
              用户指定）：加星标 → 标为未读/已读 → 标为垃圾 → 删除。
              改这里必须同步改 `message-view.tsx` 的详情动作栏。 */}
          <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={m.flagged ? t("unflag") : t("flag")}
            aria-pressed={m.flagged}
            onClick={() => onFlag(m, { flagged: !m.flagged })}
          >
            <StarIcon className={cn(m.flagged && "fill-foreground")} />
          </Button>
          {/* 已读/未读：**只在有 INBOX 副本时才渲染**（「未读」仅针对正常收件箱，
              垃圾 / 发件 / 归档没有已读语义，服务端也不会写它们——用户 2026-10-10
              定稿：「垃圾邮件不需要已读/未读的概念」） */}
          {m.hasReadState !== false && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={m.seen ? t("markUnread") : t("markRead")}
              title={m.seen ? t("markUnread") : t("markRead")}
              onClick={() => onFlag(m, { seen: !m.seen })}
            >
              {m.seen ? <MailOpenIcon /> : <MailIcon />}
            </Button>
          )}
          {/* 「标为垃圾 ⇄ 移出垃圾」（2026-10-10）：这封**只在垃圾夹里**时给的是「移出垃圾」
              ——按副本位置判，不按当前 tab（理由见 lib/mail/kind.ts 的 isJunkOnly）。
              ⚠ 两个动作**互斥**（同一行只会出现一枚），所以它们不必须“成对”。
              ⚠ 图标 2026-10-11 起用 Tabler 盾牌系列（`shield-x` / `shield-check`）：
                用户要求「两枚成一套、又要和删除区分开」。此前依次用过八边形感叹号、
                信封打叉/打勾——后者那枚「信封打勾」是「全部已读」原有的图标，属挪用，
                已还原。详见 components/mail/junk-icons.tsx。 */}
          {junkOnly ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("notJunk")}
              title={t("notJunk")}
              onClick={() => onNotJunk(m)}
            >
              <NotJunkIcon />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("moveToJunk")}
              title={t("moveToJunk")}
              onClick={() => onJunk(m)}
            >
              <JunkIcon />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label={t("delete")} onClick={() => onDelete(m)}>
            <Trash2Icon />
          </Button>
        </span>
      )}
      {/* 会话展开箭头（2026-10-10）：常驻在行尾、与行主按钮**平级**（不能嵌在按钮里
          ——HTML 不允许嵌套 button，读屏也会把两枚按钮的意思混在一起）。
          日期在悬浮时让位（与行内动作条同一规则），箭头始终可点。 */}
      {hasThreadToggle && (
        <button
          type="button"
          data-slot="mail-thread-toggle"
          aria-expanded={threadOpen}
          aria-label={threadOpen ? t("threadCollapse") : t("threadExpand", { count: threadCount })}
          onClick={() => onToggleThread(m.messageId)}
          className={cn(
            "absolute top-3 right-3 flex items-center gap-0.5 rounded-md px-1 py-0.5 text-xs tabular-nums",
            "text-muted-foreground hover:bg-accent hover:text-foreground",
            "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            threadOpen && "text-foreground",
          )}
        >
          {t("threadBadge", { count: threadCount })}
          <ChevronDownIcon
            className={cn("size-3.5 transition-transform duration-300 ease-out", threadOpen && "rotate-180")}
            aria-hidden
          />
        </button>
      )}
    </li>
  );
}

export const MailRow = memo(MailRowImpl);

/**
 * 会话里的**其它**邮件（就地展开时渲染在代表行之后）。
 *
 * 有意做得比 `MailRow` 简单：只有「发件人 / 主题 / 时间」三个信息加整行点击——
 * 就地展开是快速扫一眼，真要整理还得进详情页（那里有完整工具栏与会话区块）。
 * 不做行内动作条，也就不必再吵“悬浮条互推”那一堆细节。
 */
export interface ThreadChildRowProps {
  item: MailListItem;
  localeTag: string;
  showAccountDots: boolean;
  accountsById: Map<string, MailAccount>;
  onOpen: (item: MailListItem) => void;
}

function ThreadChildRowImpl({ item: m, localeTag, showAccountDots, accountsById, onOpen }: ThreadChildRowProps) {
  const t = useTranslations("mail");
  const sent = isSentItem(m.copies);
  const peer = sent && m.to?.length ? m.to[0].name || m.to[0].address || "" : m.fromName || m.fromAddr;
  const subjectText = m.subject || t("noSubject");
  const dateText = formatDate(m.date, localeTag);
  /**
   * 同 `MailRow`：显式给短名字，别让后代文本拼成一句（见上方 `rowLabel` 的长注释）。
   * ⚠ 这里**不提方向 / 附件 / 星标**——子行本来就没渲染那几枚角标，「听到的」与「看到的」
   *   要一致；它们的状态由展开它的代表行负责说。
   */
  const rowLabel = rowLabelFormat(localeTag).format(
    [m.seen ? "" : t("filterUnseen"), peer, subjectText, dateText].filter(Boolean),
  );
  return (
    <li data-slot="mail-thread-child" className="bg-accent/20">
      <button
        type="button"
        data-mail-row
        aria-label={rowLabel}
        onClick={() => onOpen(m)}
        className="flex w-full items-center gap-3 py-2 pr-4 pl-16 text-left text-sm transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
      >
        {/* 账号色点与代表行同一套分区（2026-10-16 归列）：放在名字**前**的固定列，
            不与右侧日期挤在一起 */}
        {showAccountDots && (
          <span className="flex shrink-0 items-center gap-0.5">
            {m.accounts.map((id) => (
              <span
                key={id}
                className={cn(
                  "inline-block size-1.5 rounded-full",
                  accountDotProps(accountsById.get(id)?.color ?? "").className,
                )}
                style={accountDotProps(accountsById.get(id)?.color ?? "").style}
              />
            ))}
          </span>
        )}
        <span className={cn("shrink-0 truncate", m.seen ? "text-muted-foreground" : "font-semibold")}>
          {peer}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {subjectText}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {dateText}
        </span>
      </button>
    </li>
  );
}

export const ThreadChildRow = memo(ThreadChildRowImpl);
