import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScholarNav } from "@/components/scholar/scholar-nav";

/**
 * 学术数据四页的统一页头 + 页框（2026-10-28）。
 *
 * 版式对齐邮箱页（`mail-page-header` / `/mail` 的页头）：`h1` + 版本徽章、
 * 一行描述、一行来源/更新时间，间距固定。四页此前描述字号、版本徽章变体、
 * 「数据来源」行的位置各不相同（有的在右上放动作、有的没有），跳转时标题与
 * 正文左缘会轻微横移；收敛到这里后四页的基线、字号、间距完全一致。
 *
 * - 版本徽章统一 `outline` + 次要色：它是**数据版本**（第七版 / 2025 升级版 /
 *   自动同步），不是状态，不该用 `secondary` 的实心底抢标题。
 *   2026-10-29：几何改为与行内等级徽章同一套（18px 高 + 4px 圆角）。原本是
 *   `rounded-full` 药丸——标题 30px、紧挨着的 20px 全圆角小丸子把页头拉回了
 *   「卡片式 SaaS」的语气；4px 方角才是本站在用的「印刷标签」。
 *   `Badge` 内部走 `cn()`（tailwind-merge），后写的 `rounded-[4px]` 会顶掉
 *   base 的 `rounded-full`，不需要改 `ui/badge.tsx`。
 * - `meta` 放来源链接与更新时间（`text-xs` 次要色）；统计数字不放这里——
 *   它们自成一整条 `ScholarStats`，与工具栏同宽。
 * - `actions` 交给 `ScholarNav` 的右端（页头本身不放按钮，标题基线才稳）。
 */
export function ScholarPage({
  title,
  version,
  description,
  meta,
  actions,
  children,
}: {
  title: string;
  version?: string;
  description: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6">
      {/* `gap-2.5`：描述行（16px/24 行高）与来源行（12px）之间 8px 太挤，
          看起来像同一段的第三行；10px 才让「来源」显出是附属信息。 */}
      <header className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-3xl font-bold">{title}</h1>
          {version ? (
            <Badge
              variant="outline"
              className="h-[18px] rounded-[4px] px-1.5 text-xs leading-none font-normal text-muted-foreground"
            >
              {version}
            </Badge>
          ) : null}
          {actions ? <div className="ml-auto shrink-0">{actions}</div> : null}
        </div>
        <p className="max-w-3xl text-muted-foreground">{description}</p>
        {meta ? (
          <p className="text-xs text-muted-foreground">{meta}</p>
        ) : null}
      </header>
      <ScholarNav />
      {children}
    </div>
  );
}

/**
 * 数据面板：四页共用的「一块数据」外壳（`rounded-xl border bg-card`）。
 *
 * 2026-10-30 统一：此前 `/deadlines` 是卡片网格、`/cas` 是一整块面板、
 * `/ccf` 是「h2 + 细线 + 计数」漂在面板上方、`/venues` 又是另一套
 * 「h2 + 图标 + 计数」——同一批数据页有四种「章节」写法。现在把「章节」收敛成
 * **面板 + 标题条**：标题条是面板内部的第一行（灰底、下边框），标题本身就是
 * 列表的表头，不再游离在面板之外。
 *
 * 为什么标题条在面板**内部**：脱离面板的标题只剩一条 16px 粗字 + 一根细线，
 * 与下方的数据行同号同重，读者要靠间距判断谁是标题；进了面板，灰底条天然是
 * 「表头」，且 `overflow-hidden` 会把它的四角裁成面板的圆角。
 *
 * ⚠ 面板一律渲染成 `<section>`：`/ccf` 靠 `section[id^="ccf-field"]` 挂
 *   `content-visibility: auto`（681 行列表的离屏跳过），改成 div 会让那套
 *   性能优化静默失效。
 * ⚠ 标题必须是 `<h2>`：E2E「功能性 UI 一律无衬线」以 `/ccf` 的 `h2` 为探针，
 *   文档大纲也要求章节有标题。
 */
export function ScholarPanel({
  id,
  labelledBy,
  className,
  children,
}: {
  id?: string;
  /** 与 `ScholarPanelHeader` 的 id 配套，供读屏播报章节名 */
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn("overflow-hidden rounded-xl border bg-card", className)}
    >
      {children}
    </section>
  );
}

/**
 * 面板标题条：左标题（`h2`）、右计数，灰底 + 下边框。
 *
 * 高度刻意压到 34px（`py-2` + 14px 行高）：它是**表头**，不是区块大标题，
 * 一旦长到 44px 以上，十个领域叠起来就是十块横幅，页面会被切成碎片。
 * 标题允许截断（领域官方名长达 20 字），计数永远 `shrink-0` 留在右端。
 */
export function ScholarPanelHeader({
  id,
  label,
  count,
}: {
  id?: string;
  label: ReactNode;
  /** 计数或其它右端次要信息（`tabular-nums` 由调用方拼好） */
  count?: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 border-b bg-muted/40 px-4 py-2">
      <h2 id={id} className="min-w-0 truncate text-sm font-semibold">
        {label}
      </h2>
      {count != null ? (
        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      ) : null}
    </div>
  );
}

/** 页头来源行里的外链：四页同一形态（下划线 + hover 到前景色） */
export function ScholarSourceLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-4 transition-colors hover:text-foreground"
    >
      {children}
    </a>
  );
}

/**
 * 统一的数据说明脚注（四页共用）。
 *
 * 原先四页各写一份 `mt-14 border-t pt-4 text-xs`，间距与分隔线位置不一；
 * 这里固定为「面板下方 12 + 分隔线 + 10」——比页面主体的 24 间距更大，
 * 说明文字与操作区自然分开，又不会像旧版那样飘出一大段空白。
 */
export function ScholarNote({ children }: { children: ReactNode }) {
  return (
    <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * 紧凑统计条：替代四页各自那排「大图标 + 大数字」卡片。
 *
 * 卡片形态（`rounded-xl` + 图标方块 + hover 上浮 + 阴影）是首页 / 落地页的
 * 语言；在数据页里它占了首屏 100px，却只装四个数字，还要跟下面的筛选栏
 * 抢注意力。邮箱页的做法是「一条状态栏」：数字与标签并排、细分隔线、无图标、
 * 无 hover。这里照搬：
 *
 * - 一条面板，`gap-px` + `bg-border` 画出 1px 网格线（不需要给每格算边框）；
 * - 数字 `text-lg font-semibold tabular-nums`，标签 `text-xs` 次要色；
 * - 2 列（手机）/ 4 列（sm 起），行高固定，不随内容跳动。
 *
 * `hint` 用于统计口径的**例外说明**（如「共 446 会议」里的「其中 210 本双评级」），
 * 不再单独占一行页头小字。
 */
export type ScholarStat = {
  value: ReactNode;
  label: ReactNode;
  /** 第一项（总量）用前景色；其余默认也是前景色，此字段保留给未来强调项 */
  emphasis?: boolean;
};

export function ScholarStats({
  items,
  className,
}: {
  items: ScholarStat[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4",
        className,
      )}
    >
      {items.map((item, i) => (
        <div
          key={i}
          // `px-4` 与列表行（`px-4` + 1px 边框）同值：统计数字、列表首列文字、
          // 筛选面板里的控件左缘落在同一条 16px 栅格上。
          className="flex flex-col-reverse gap-1 bg-card px-4 py-2.5"
        >
          <dt className="truncate text-xs text-muted-foreground">{item.label}</dt>
          <dd
            className={cn(
              "text-xl leading-none font-semibold tabular-nums",
              item.emphasis && "text-primary",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * 统一筛选面板（四页共用外壳）。
 *
 * 邮箱工具栏：细分隔、无毛玻璃、控件同一行、无阴影。
 * 旧版四页是 `rounded-2xl border bg-background/85 px-3 py-3 shadow-sm`——
 * 圆角比面板（`rounded-xl`）大一号、还多一层阴影，跳转时能明显看出「换了套设计」。
 *
 * ⚠ **背景必须不透明**：吸顶时列表行会从面板下方穿过，半透明 + 毛玻璃会把
 *   那些字糊成一团脏色（顶边尤其明显）。无阴影、纯描边，靠 1px 边框分层。
 *
 * ⚠ 内层控件统一 32px 高（`SearchInput` 的 `h-8` + `ccf-segmented` 的
 *   `p-0.5` 包 `h-7` 项），别混用默认 `h-8` 的 ToggleGroupItem（会高 4px）。
 * ⚠ **手机不 sticky**（`max-md:static`）：窄屏上搜索 + 两组分段 + 领域 chips
 *   会折成 4~7 行、高 250px+，sticky 会长期遮住半个视口。桌面宽度下所有控件
 *   基本压在一两行内（≈90px），sticky 才有意义。
 * ⚠ 横向内边距 `sm:px-4`（= 列表行 / 统计格的 16px）：面板自身还有 1px 边框，
 *   所以内部控件的**边框**正好落在与列表文字相同的 x 上。手机降到 12px 换
 *   内容宽度（窄屏上差 4px 看不出来，但每行能多放半个 chip）。
 *
 * ⚠ **吸顶时要与头栏拉开距离（2026-10-29）**：`sticky top-14` 会让面板顶边压在
 *   头栏底线上（56 压 57），吸顶后两块粘成一条、双线重叠。改 `top-16`（64px）
 *   即可——`top` 是吸顶后的停靠位置，`mt-` 不参与（普通流里的外边距）。
 *
 *   ⚠ 这 7px 必须**透明**：曾经在外套一层 `bg-background py-2` 的 wrapper 把缝
 *   刷成实白（理由是不想让半截字从缝里穿过去），用户立刻反馈「这里之前有点透明，
 *   怎么变成纯色看不到背景了」——吸顶工具条的可信度恰恰来自「底下的内容确实在
 *   滚」，刷掉它就把悬浮中岛变回一块死白。半截字是代价，而且缝只有 7px，看起来
 *   就是内容从条下面滑过去。
 */
export function ScholarFilter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-16 z-30 flex flex-col gap-2 rounded-xl border bg-background px-3 py-2 sm:px-4 max-md:static",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 筛选面板第一行：搜索 + 分段控件 + 右侧计数 */
export function ScholarFilterRow({ children }: { children: ReactNode }) {
  return (
    // `[&_input]:rounded-[6px]`：`ui/input.tsx` 的默认圆角是 `rounded-lg`（10px），
    // 32px 高的搜索框与同高的分段控件容器（6px）并排时，一个像药丸一个像方块。
    // 这是全站 Input 的默认值，在邮箱等表单里是合适的，故只在学术四页的工具条里收窄。
    <div className="flex flex-wrap items-center gap-1.5 [&_input]:rounded-[6px]">
      {children}
    </div>
  );
}

/**
 * 筛选行右端的次要信息位：结果计数（「681 项」）或输入提示
 * （`/venues` 只有搜索框时会显得空，用一句「可搜缩写 / 全称 / ISSN」把右端填住）。
 * 窄屏隐藏：手机上工具栏已经占满宽度，右端文字会挤掉控件。
 *
 * ⚠ 不要用 `font-mono`：本元素含中文（「项 / 本 / 个会议」），等宽族一旦
 *   出现中文就会拉取 1.3MB 的 cjk 分片（见 `scripts/subset-fonts.mjs`）。
 *   数字对齐用 `tabular-nums` 即可。
 */
export function ScholarCount({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto hidden shrink-0 px-1 text-xs tabular-nums text-muted-foreground md:inline">
      {children}
    </span>
  );
}
