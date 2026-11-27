"use client";

import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

export type CheckState = boolean | "mixed";

function StateMark({ state }: { state: CheckState }) {
  if (state === true) return <Check className="size-3" strokeWidth={3} aria-hidden />;
  if (state === "mixed") return <Minus className="size-3" strokeWidth={3} aria-hidden />;
  return null;
}

/** 归类/项目集合弹窗里的勾选框视觉：整行是 button，方块本身只读。 */
export function CheckBoxVisual({
  state,
  disabled,
}: {
  state: CheckState;
  disabled?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
        state === true
          ? "border-foreground bg-foreground text-background"
          : state === "mixed"
            ? "border-foreground bg-foreground/10 text-foreground"
            : "border-muted-foreground/35 bg-transparent text-transparent",
        disabled && "opacity-50",
      )}
    >
      <StateMark state={state} />
    </span>
  );
}
