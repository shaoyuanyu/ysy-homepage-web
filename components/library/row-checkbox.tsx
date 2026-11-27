"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/** 自绘复选框：原生 checkbox 在 macOS 上偏大、边框呆板，和这一版的细线条不搭。
 *  input 仍保留（sr-only），可见的方块只是它的 peer。 */
export function RowCheckbox({
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
