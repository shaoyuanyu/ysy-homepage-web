"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 领域多选筛选（CCF 目录 / Deadline 日历共用）。
 *
 * 旧版是 `Button` 组件拼的 `rounded-full` 药丸（`size="sm"`，高 28px、带默认
 * primary 实心选中态）。问题有三个：
 *   1. 与同一页的 `ccf-segmented` 分段控件、Tab 完全是两套形态；
 *   2. 选中态是**实心主色**，一行里出现两三个就像一排按钮，压过了列表本身；
 *   3. `text-xs` 标签放在 28px 高的圆角胶囊里，上下留白不均（中文尤其明显）。
 *
 * 现在的形态是**纯文字标签**：无描边、无底色，只有选中项有一块淡灰底 + 加粗文字。
 *
 * ⚠ 2026-10-29 第三次返工（用户：「描边和圆角也丑，哪哪都不协调」）：
 *   前面试过的三种都死了：
 *   1. 1px 描边 + 8px 圆角——一排大小不一的「空方框」，最像后台表单；
 *   2. 描边 + 4px 圆角 + 实心黑选中——方框感还在；
 *   3. 实心淡灰底胶囊（无描边）——干净但仍是「一排按钮」。
 *   现在的原则：**这一行是字，不是控件**。它是最低优先级的那一层筛选，视觉
 *   重量必须低于上面的搜索框与分段控件（那两者已经是「框」与「灰底」两种语言，
 *   再添一排方框就是三种）。文字行只靠字号/字重/一大块淡底区分选中，零描边。
 *   点击热区仍是 24px 高、px-2。
 *
 * ⚠ 单个领域名仍可能长过视口（英文尤其）：外层 `flex-wrap` + `max-w-full` +
 *   内层 `truncate`，绝不允许横向溢出（E2E 有 360px 视口的溢出用例）。
 */
export function ScholarFieldFilter({
  ariaLabel,
  allLabel,
  fields,
  selected,
  labelOf,
  titleOf,
  onToggle,
  onClear,
}: {
  ariaLabel: string;
  allLabel: string;
  fields: readonly string[];
  /** 已选中的领域（完整名称，与 `fields` 同源） */
  selected: readonly string[];
  labelOf: (field: string) => ReactNode;
  /** 完整领域名（悬停提示用；不传则不加 title） */
  titleOf?: (field: string) => string;
  onToggle: (field: string) => void;
  onClear: () => void;
}) {
  const chipClass = (active: boolean) =>
    cn(
      "inline-flex h-6 max-w-full shrink-0 items-center rounded-[4px] px-2 text-xs transition-colors",
      active
        ? "bg-muted font-medium text-foreground"
        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
    );

  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      <button
        type="button"
        className={chipClass(selected.length === 0)}
        aria-pressed={selected.length === 0}
        onClick={onClear}
      >
        <span className="truncate">{allLabel}</span>
      </button>
      {fields.map((field) => {
        const active = selected.includes(field);
        return (
          <button
            key={field}
            type="button"
            className={chipClass(active)}
            aria-pressed={active}
            title={titleOf?.(field)}
            onClick={() => onToggle(field)}
          >
            <span className="truncate">{labelOf(field)}</span>
          </button>
        );
      })}
    </div>
  );
}
