"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { BookUserIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/mail/fetch-timeout";
import { formatMailbox, parseMailbox, splitAddressList } from "@/lib/mail/address";
import { Input } from "@/components/ui/input";
import type { MailContactSuggest, MailOwnAddress } from "@/lib/mail/types";

interface Suggestion {
  name: string;
  email: string;
  /** contact = 已保存联系人；known = 自动收录；own = 我自己的地址（4.10） */
  kind: "contact" | "known" | "own";
  times?: number;
}

/**
 * 地址串 ↔ 「已提交的收件人 + 正在输入的草稿」的换算（2026-10-29 第二轮改造）。
 *
 * 用户的要求：**一个收件人（备注名 + 邮箱）必须是一个整体，不能像纯文本那样被局部
 * 改掉几个字符**——否则 `张老师 <zhang@x>` 被光标插进去改一半，发出去的就是个四不像。
 * 于是收件人改成 **chip（胶囊）+ 输入框**：chip 只能整条删除，输入框里只放「下一个还
 * 没提交的地址」。
 *
 * 但父组件的契约仍然是**一个字符串**（草稿、回复预填、`?to=`、发送解析全都吃它），
 * 所以这里用一条约定把「已提交 / 草稿」编进字符串本身：
 * - **落在分隔符之后的 token = 已提交**（末尾的分隔符也算：`a@x, ` → a@x 已提交）；
 * - 最后一个没有分隔符的 token = 正在输入的草稿。
 *
 * 好处：组件里不需要第二份状态（父组件随时可以把整串换掉，chip 与输入框自动跟着
 * 重算），也就不会出现「chip 和字符串不同步」。
 */
function parseValue(value: string): { chips: string[]; draft: string } {
  const tokens = splitAddressList(value);
  if (tokens.length === 0) return { chips: [], draft: "" };
  if (/[,;，；]\s*$/.test(value.trimEnd())) return { chips: tokens, draft: "" };
  return { chips: tokens.slice(0, -1), draft: tokens[tokens.length - 1] };
}

/** parseValue 的逆运算：有 chip 且没有草稿时保留尾分隔符（那是「已提交」的标记） */
function serialize(chips: string[], draft: string): string {
  const tail = draft.trim();
  if (chips.length === 0) return tail;
  const joined = (tail ? [...chips, tail] : chips).join(", ");
  return tail ? joined : `${joined}, `;
}

/**
 * 收件人输入框：已提交的收件人显示为**不可局部编辑的 chip**，输入框只负责下一个地址。
 * 按当前 token 调 `/api/mail/contacts/suggest` 补全（自己的地址在前、已保存联系人其次、
 * 自动收录最后）。键盘：↓/↑ 移动，Enter/Tab 选中或提交，Backspace（输入框为空）删掉
 * 最后一个 chip，Esc 关闭建议。
 */
export function RecipientInput({
  id,
  value,
  onValueChange,
  placeholder,
  own,
  normalize,
  className,
}: {
  id: string;
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  /** 「我的账号」（4.10）：本地过滤、排在最前，且同样地址不再重复出现 */
  own?: MailOwnAddress[];
  /** 失焦时把裸地址补上备注名（由写信页传入，名字来自联系人 / 自动收录） */
  normalize?: (value: string) => string;
  /** 输入框样式透传（表单头行内用「无边框」覆写，见 compose-form 的 BARE_CONTROL） */
  className?: string;
}) {
  const t = useTranslations("mail");
  const { chips, draft } = useMemo(() => parseValue(value), [value]);
  const chipLabels = useMemo(
    () =>
      chips.map((token) => {
        const parsed = parseMailbox(token);
        return parsed ? parsed.name || parsed.address : token;
      }),
    [chips],
  );
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const fetchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seq = useRef(0);
  /** 输入框当前是否聚焦：失焦后迟到的查询结果不能再把建议列表重新打开
   *  （2026-10-29 实测：输入完点主题，150ms 的关闭定时器执行完，200ms 的查询
   *   才返回 → 列表又弹出来，盖住下面的字段） */
  const focusedRef = useRef(false);

  /** 提交若干 chip + 新草稿（唯一的状态出口：一律写回父组件的字符串） */
  const commit = useCallback(
    (nextChips: string[], nextDraft: string) => {
      onValueChange(serialize(nextChips, nextDraft));
    },
    [onValueChange],
  );

  const query = useCallback(
    (token: string) => {
      clearTimeout(fetchTimer.current);
      if (!token) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      // 自己的地址本地过滤（不走接口）：输入自己的地址是最常被漏掉的一种补全
      const needle = token.toLowerCase();
      const mine: Suggestion[] = (own ?? [])
        .filter(
          (o) => o.email.toLowerCase().includes(needle) || o.name.toLowerCase().includes(needle),
        )
        .map((o) => ({ name: o.name, email: o.email, kind: "own" as const }));
      const mineEmails = new Set((own ?? []).map((o) => o.email.toLowerCase()));

      fetchTimer.current = setTimeout(async () => {
        const mySeq = ++seq.current;
        try {
          const res = await fetchWithTimeout(`/api/mail/contacts/suggest?q=${encodeURIComponent(token)}`);
          if (!res.ok) return;
          const data = (await res.json()) as MailContactSuggest;
          if (mySeq !== seq.current) return; // 只采纳最后一次查询（防抖外的乱序保护）
          if (!focusedRef.current) return; // 失焦后返回的查询结果一律丢弃
          const items: Suggestion[] = [
            ...mine,
            ...data.contacts
              .filter((c) => !mineEmails.has(c.email.toLowerCase()))
              .map((c) => ({ name: c.name, email: c.email, kind: "contact" as const })),
            ...data.known
              .filter((k) => !mineEmails.has(k.email.toLowerCase()))
              .map((k) => ({ name: k.name, email: k.email, kind: "known" as const, times: k.times })),
          ];
          setSuggestions(items);
          setActive(items.length > 0 ? 0 : -1);
          setOpen(items.length > 0);
        } catch {
          // 网络失败：不弹建议，不打断输入
        }
      }, 200);
    },
    [own],
  );

  const pick = useCallback(
    (s: Suggestion) => {
      // 选中即提交：新 chip = 已有的 + 这个人（带备注名），输入框清空等下一个人
      commit([...chips, formatMailbox(s.name, s.email)], "");
      clearTimeout(fetchTimer.current);
      seq.current += 1; // 丢弃在途查询，避免它把列表重新打开
      setOpen(false);
      setSuggestions([]);
      inputRef.current?.focus();
    },
    [chips, commit],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (open && suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActive((a) => (a + 1) % suggestions.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
          return;
        }
        if ((e.key === "Enter" || e.key === "Tab") && active >= 0) {
          e.preventDefault();
          pick(suggestions[active]);
          return;
        }
        if (e.key === "Escape") {
          setOpen(false);
          return;
        }
      }
      // 输入框为空时 Backspace = 删掉最后一个 chip（chip 只能整体删除，见文件头）
      if (e.key === "Backspace" && !draft && chips.length > 0) {
        e.preventDefault();
        commit(chips.slice(0, -1), "");
        return;
      }
      // Enter/Tab：草稿是一个完整地址就提交成 chip（不完整就留在输入框里继续敲）
      if ((e.key === "Enter" || e.key === "Tab") && draft && parseMailbox(draft)) {
        e.preventDefault();
        commit([...chips, draft.trim()], "");
      }
    },
    [open, suggestions, active, pick, draft, chips, commit],
  );

  // 卸载时清掉挂起的防抖
  useEffect(
    () => () => {
      clearTimeout(fetchTimer.current);
      clearTimeout(blurTimer.current);
    },
    [],
  );

  return (
    <div className="relative">
      {/* 外层 = 输入框本体：chip 与输入框同排，换行时自然落到下一行；
          `className`（BARE_CONTROL）带来的 `-mx-1.5 px-1.5` 保持不变，
          文字起点仍与其它行的控件对齐 */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-1",
          className,
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((token, i) => {
          const parsed = parseMailbox(token);
          const invalid = !parsed;
          return (
            <span
              key={`${token}-${i}`}
              data-slot="recipient-chip"
              data-address={parsed?.address ?? ""}
              title={invalid ? t("recipientInvalid", { value: token }) : undefined}
              className={cn(
                "inline-flex h-6 max-w-full items-center gap-1 rounded-md pr-0.5 pl-2 text-xs",
                invalid
                  ? "bg-destructive/10 text-destructive ring-1 ring-destructive/30 ring-inset"
                  : "bg-muted text-foreground",
              )}
            >
              <span className="max-w-[24rem] truncate">
                {parsed?.name ? (
                  <>
                    <span className="font-medium">{parsed.name}</span>
                    <span className="ml-1 text-[11px] text-muted-foreground">{`<${parsed.address}>`}</span>
                  </>
                ) : (
                  <span className={invalid ? undefined : "text-muted-foreground"}>
                    {token.trim()}
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-label={t("removeRecipient", { name: chipLabels[i] })}
                title={t("removeRecipient", { name: chipLabels[i] })}
                className="grid size-4 shrink-0 place-items-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                // mousedown 先 preventDefault：别让浏览器把焦点先切走
                //（否则 chip 在被点掉之前先触发输入框 blur → 草稿提交，两件事挤在一起）
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  commit(
                    chips.filter((_, j) => j !== i),
                    draft,
                  );
                }}
              >
                <XIcon className="size-3" aria-hidden />
              </button>
            </span>
          );
        })}
        <Input
          ref={inputRef}
          id={id}
          value={draft}
          // 有 chip 时不再显示占位文案：它会被挤到 chip 右边，像一条对不齐的注释
          placeholder={chips.length > 0 ? "" : placeholder}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-suggestions`}
          aria-autocomplete="list"
          className="h-6 min-w-[7rem] flex-1 rounded-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:bg-transparent focus-visible:ring-0 dark:bg-transparent"
          onChange={(e) => {
            const text = e.target.value;
            // ⚠ 输入框里只有**草稿**：必须与已有 chip 重新拼回整串再写回父组件。
            //   直接把 e.target.value 当成整串会把前面选好的收件人全冲掉（实测踩到）。
            //   草稿里带分隔符（输入 / 粘贴 `a@x, b@y`）时，parseValue 会把分隔符前的收成 chip。
            const parts = parseValue(text);
            onValueChange(serialize([...chips, ...parts.chips], parts.draft));
            query(parts.draft);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            focusedRef.current = true;
            query(draft);
          }}
          onBlur={() => {
            // 失焦时：① 草稿是完整地址 → 提交成 chip；② 裸地址补备注名。
            // 两件事**一次算完再回写**，避免两次 onValueChange 互相覆盖。
            // ⚠ 同时取消在途查询：否则它稍后返回会把列表重新打开（见 focusedRef 注释）
            focusedRef.current = false;
            clearTimeout(fetchTimer.current);
            seq.current += 1;
            const valid = !!draft && !!parseMailbox(draft);
            const committed = valid ? [...chips, draft.trim()] : chips;
            const rest = valid ? "" : draft;
            const fixedChips = normalize ? committed.map((c) => normalize(c)) : committed;
            const fixedRest = normalize && rest ? normalize(rest) : rest;
            const next = serialize(fixedChips, fixedRest);
            if (next !== value) onValueChange(next);
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
        />
      </div>
      {open && (
        <ul
          id={`${id}-suggestions`}
          role="listbox"
          aria-label={t("contacts.suggestions")}
          // ⚠ 对齐的是**输入框**而不是外层 wrapper（2026-10-29 打磨）：裸输入框带
          //   `-mx-1.5`（BARE_CONTROL），实际盒子比 wrapper 左移 6px；inset-x-0 会让
          //   下拉整体右偏 6px、右缘探出输入框，浮层看着没对齐。`-left-1.5 right-1.5`
          //   正好落在输入框的左右边缘上。
          // ⚠ shadow-lg + ring：建议浮层会盖住下方「主题」行，投影不够时会被误读成
          //   「主题输入框旁边多出来的一块白底」——用户 2026-10-29 的报障截图即此观感。
          className="absolute top-full z-50 mt-1 -left-1.5 right-1.5 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 shadow-lg ring-1 ring-foreground/5"
          data-slot="recipient-suggestions"
        >
          {suggestions.map((s, i) => (
            <li key={`${s.kind}:${s.email}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
                  i === active ? "bg-accent" : "hover:bg-accent/50",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <BookUserIcon
                  className={cn(
                    "size-3.5 shrink-0",
                    s.kind === "own" ? "text-primary" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">
                  {s.name ? `${s.name} ` : ""}
                  <span className="text-muted-foreground">{s.name ? `<${s.email}>` : s.email}</span>
                </span>
                {s.kind === "own" ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t("contacts.ownBadge")}
                  </span>
                ) : null}
                {s.kind === "known" && s.times ? (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {t("contacts.knownTimes", { count: s.times })}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
