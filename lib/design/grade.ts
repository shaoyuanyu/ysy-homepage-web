/**
 * CCF 等级 / 中科院分区 的配色（单一事实来源）。
 *
 * ccf · cas · deadlines · venues 四页此前各自内联重复定义了同一套色板，
 * 改一处颜色需要同步四个文件（且极易漏改）。现统一收敛到此处。
 *
 * ---- 配色原则（可访问性）----
 * 徽章都是「小字号 + 彩色」的组合，最容易被忽略的对比度陷阱，故固定为：
 *   浅色：`text-*-700` on `bg-*-50`  → 对比度 4.9~6.4:1（达 WCAG AA 正文 4.5:1）
 *   深色：`text-*-400` on `bg-*-500/15` → 对比度 ≥ 6:1
 * 此前用 `text-*-600` + `bg-*-500/10`，浅色下只有 3.2~4.1:1（未达 AA），
 * 且半透明底叠加在灰底上会进一步变脏，故改为实色 50 号底。
 *
 * ⚠ Tailwind 按字面扫描，以下类名必须**整串静态写出**，不可用模板字符串拼接
 *   （如 `text-${tone}-700` 会被漏掉导致样式丢失）。
 *
 * ⚠ 色相语义固定，勿随意调换：A/1区=红（最高）→ B/2区=蓝 → C/3区=绿 → 4区=琥珀。
 *   `none`（未收录）必须用中性灰，不得借用彩色——否则游客会误读为「有等级」。
 */

/** 等级色相 */
export type GradeTone = "red" | "blue" | "emerald" | "amber" | "neutral";

/**
 * 徽章通用几何（ccf / cas / deadlines / venues 四页共用）。
 *
 * ⚠ 2026-10-29：此前的 `h-5` + `rounded-md` 是**最直接的丑源**——本主题里
 *   `--radius-md` = 8px，压在 20px 高的胶囊上等于 40% 高度起弧，看着像
 *   「糖豆按钮」而不是标签；再叠一圈同色 `ring-1 ring-inset`，浅底 + 浅描边
 *   + 深字三层同色相糊在一起，边界发虚。现在固定为 18px 高 + 4px 圆角
 *   （≈22%），是印刷标签的比例，四页所有小徽章共用这一串。
 *
 * 只放**几何**，颜色交给 TONE_CHIP；字重/字族由调用方决定（`CCF-A` 用
 * mono + semibold，「未收录」这类自然语言用 sans + normal）。
 */
export const GRADE_CHIP_CLASS =
  "inline-flex h-[18px] shrink-0 items-center rounded-[4px] px-1.5 text-xs leading-none tracking-[0.02em] whitespace-nowrap";

/** 徽章配色：实色浅底 + 深色字，**不描边**（描边让 20px 元素显胖、且同色相加糊）；深浅色模式各一套 */
export const TONE_CHIP: Record<GradeTone, string> = {
  red: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  amber:
    "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400",
  neutral: "bg-muted text-muted-foreground",
};

/**
 * Top 期刊「荣誉章」：中性前景色实底（深色模式下自动反相为浅底深字）。
 *
 * 为什么不复用等级色：Top 是**荣誉标记**，不是分区等级；4 区已经占用了琥珀，
 * 若 Top 也用琥珀，同一行出现 `Top + 4区` 时会出现两枚同色徽章。中性前景色
 * 不与任何等级色相撞，且视觉重量最重——正好对应它「比分区更高一层」的语义。
 *
 * 深色模式例外地降为「15% 前景底」：前景色在深色主题里是近白色，逐行铺满
 * 758 行时会成为整页唯一的亮块（夜里尤其刺眼）；淡底仍不借用等级色相，
 * 语义不变。
 */
export const TOP_CHIP_CLASS =
  "bg-foreground text-background dark:bg-foreground/15 dark:text-foreground";

/** 行首 hover 色条（3px 竖条） */
export const TONE_BAR: Record<GradeTone, string> = {
  red: "bg-red-500",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  neutral: "bg-border",
};

/** 学科分区圆点（列表里的极小标识） */
export const TONE_DOT: Record<GradeTone, string> = {
  red: "bg-red-500",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  neutral: "bg-muted-foreground/40",
};

/** 文字色（不包底色，用于「与所属大类分区不一致」这类行内轻量标注） */
export const TONE_TEXT: Record<GradeTone, string> = {
  red: "text-red-700 dark:text-red-400",
  blue: "text-blue-700 dark:text-blue-400",
  emerald: "text-emerald-700 dark:text-emerald-400",
  amber: "text-amber-700 dark:text-amber-400",
  neutral: "text-muted-foreground",
};

/** CCF 推荐等级 → 色相 */
export const CCF_LEVEL_TONE: Record<string, GradeTone> = {
  A: "red",
  B: "blue",
  C: "emerald",
  none: "neutral",
};

/** 中科院分区 → 色相 */
export const CAS_ZONE_TONE: Record<string, GradeTone> = {
  1: "red",
  2: "blue",
  3: "emerald",
  4: "amber",
};

/** 取 CCF 等级徽章类名（未收录 → 中性） */
export function ccfChipClass(level: string | null | undefined): string {
  return TONE_CHIP[CCF_LEVEL_TONE[level ?? "none"] ?? "neutral"];
}

/** 取中科院分区徽章类名（无分区 → 中性） */
export function casChipClass(zone: number | string | null | undefined): string {
  return TONE_CHIP[CAS_ZONE_TONE[String(zone ?? "")] ?? "neutral"];
}

/** 取中科院分区圆点类名（无分区 → 中性） */
export function casDotClass(zone: number | string | null | undefined): string {
  return TONE_DOT[CAS_ZONE_TONE[String(zone ?? "")] ?? "neutral"];
}

/** 取中科院分区文字色类名（无分区 → 中性） */
export function casZoneTextClass(zone: number | string | null | undefined): string {
  return TONE_TEXT[CAS_ZONE_TONE[String(zone ?? "")] ?? "neutral"];
}

/** 取 CCF 等级圆点类名（未收录 → 中性） */
export function ccfDotClass(level: string | null | undefined): string {
  return TONE_DOT[CCF_LEVEL_TONE[level ?? "none"] ?? "neutral"];
}

/** 取行首色条类名（CCF 等级） */
export function ccfBarClass(level: string | null | undefined): string {
  return TONE_BAR[CCF_LEVEL_TONE[level ?? "none"] ?? "neutral"];
}

/** 取行首色条类名（中科院分区） */
export function casBarClass(zone: number | string | null | undefined): string {
  return TONE_BAR[CAS_ZONE_TONE[String(zone ?? "")] ?? "neutral"];
}
