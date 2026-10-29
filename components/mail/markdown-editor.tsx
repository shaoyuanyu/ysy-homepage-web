"use client";

import { useEffect, useRef } from "react";

import { EditorSelection, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  keymap,
  placeholder as cmPlaceholder,
  type Command,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from "@codemirror/commands";
import { insertNewlineContinueMarkup, markdown, markdownKeymap } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";

import { cn } from "@/lib/utils";

/**
 * 写信页的 Markdown 编辑器（2026-10-29，CodeMirror 6）。
 *
 * 为什么是 CodeMirror 而不是 contenteditable 富文本：
 * - 源码与渲染完全分离，草稿里存的就是 Markdown（旧草稿直接兼容）；
 * - 中文 IME、撤销、选区、Tab 缩进这些「输入体验」的细节由成熟实现兜底；
 * - 发送时统一走 `renderMarkdown`，不存在「编辑器 HTML 与预览 HTML 不一致」。
 *
 * 交互约定：
 * - Tab：列表 / 多行选区 → 整体缩进一级；行首 → 两个全角空格（中文首行缩进）；
 *   行内 → 一个全角空格。**一律用 U+3000 而不是半角空格**：HTML 会把连续半角空格
 *   折叠成一个（行首直接吞掉），预览与收件人那边就是「按了 Tab 没反应」
 *   （2026-10-29 用户报）
 * - Shift+Tab：反向缩进；
 * - Enter：列表 / 引用续行；普通段落只换行，**不继承上一行的行首缩进**；
 * - Ctrl/Cmd+B / I：粗体 / 斜体；
 * - Esc：离开编辑器（Tab 被缩进占用，键盘用户需要一条退路）。
 *
 * ⚠ `id` 挂在 **contenteditable** 上（不是外层 div）：`FieldLabel htmlFor` 与既有 E2E
 *   的 `#mail-body` 选择器都指向它；CodeMirror 的 contenteditable 本身就是 role=textbox。
 */
const HIGHLIGHT = HighlightStyle.define([
  { tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading4], fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--color-primary)", textDecoration: "underline" },
  { tag: [tags.monospace, tags.quote], color: "var(--color-muted-foreground)" },
  { tag: tags.list, color: "var(--color-muted-foreground)" },
]);

const THEME = EditorView.theme({
  "&": { height: "100%", fontSize: "0.875rem" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "1.7",
    overflow: "auto",
    overscrollBehavior: "contain",
  },
  // min-height:100% 让空文档的 contenteditable 也填满正文区（高度契约 + 点击空白处可聚焦）
  ".cm-content": { padding: "12px 14px", minHeight: "100%", caretColor: "currentColor" },
  ".cm-line": { padding: "0" },
  ".cm-placeholder": { color: "var(--color-muted-foreground)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--color-primary) 18%, transparent)",
  },
  ".cm-cursor": { borderLeftColor: "currentColor" },
});

/** 中文段落行首的两格全角缩进（Markdown 不会把它当代码块） */
const CJK_INDENT = "　　";
/** 行内 Tab：一格全角空格——半角空格会被 HTML 折叠，用户会以为没反应 */
const CJK_SPACE = "　";

function wrapSelection(view: EditorView, mark: string): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (range.empty) {
    view.dispatch({
      changes: { from: range.from, insert: mark + mark },
      selection: { anchor: range.from + mark.length },
    });
  } else {
    const text = state.sliceDoc(range.from, range.to);
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: mark + text + mark },
      selection: EditorSelection.range(range.from + mark.length, range.to + mark.length),
    });
  }
  return true;
}

/** Shift+Tab：删掉行首已有的两格全角 / 一或两个半角空格 / 制表符 */
const outdent: Command = (view) => {
  const { state } = view;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  const match = line.text.match(/^(?:　{1,2}| {1,2}|\t)/);
  if (!match) return indentLess(view);
  view.dispatch({
    changes: { from: line.from, to: line.from + match[0].length },
    selection: { anchor: Math.max(line.from, range.head - match[0].length) },
  });
  return true;
};

const smartTab: Command = (view) => {
  // 中文输入法组合中不抢 Tab
  if (view.composing) return false;
  const { state } = view;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.head);
  const before = line.text.slice(0, range.head - line.from);
  const trimmed = line.text.trimStart();
  const isList = /^(?:[-*+]\s|\d+[.)]\s|>)/.test(trimmed);

  // 多行选区 / 列表行：整行缩进（Tab 在列表里是「嵌套一级」）
  const spansLines = state.doc.lineAt(range.from).number !== state.doc.lineAt(range.to).number;
  if (!range.empty && spansLines) return indentMore(view);
  if (isList) return indentMore(view);

  // 光标前只有空白 = 行首缩进（中文首行缩进两格）；否则当行内制表用，给一格全角。
  // ⚠ 不要用半角空格：HTML 会把它们折叠掉，预览里就成了「Tab 没反应」
  const insert = before.trim() === "" ? CJK_INDENT : CJK_SPACE;
  view.dispatch(state.replaceSelection(insert));
  return true;
};

/**
 * Enter：列表 / 引用按 `markdownKeymap` 续行；普通段落只插一个换行。
 *
 * ⚠ 不能让 Enter 落到 `defaultKeymap` 的 `insertNewlineAndIndent`：它会把当前行的
 *   行首缩进复制到新行——中文首行缩进（全角空格）会粘到下一段，半角空格还会逐段累加。
 */
const smartEnter: Command = (view) => {
  if (insertNewlineContinueMarkup(view)) return true;
  view.dispatch(view.state.replaceSelection("\n"), { scrollIntoView: true, userEvent: "input" });
  return true;
};

export function MarkdownEditor({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  /** 外部 value → 编辑器 的程序性替换：不能被当成「用户改了正文」
   *  （否则草稿恢复/自动签名会触发 bodyTouched，签名换账号时无法替换） */
  const applyingExternalRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          dropCursor(),
          indentOnInput(),
          bracketMatching(),
          markdown(),
          EditorView.lineWrapping,
          EditorState.tabSize.of(2),
          syntaxHighlighting(HIGHLIGHT),
          THEME,
          keymap.of([
            { key: "Enter", run: smartEnter },
            { key: "Tab", run: smartTab },
            { key: "Shift-Tab", run: outdent },
            { key: "Mod-b", run: (v) => wrapSelection(v, "**") },
            { key: "Mod-i", run: (v) => wrapSelection(v, "*") },
            {
              key: "Escape",
              run: (v) => {
                v.contentDOM.blur();
                return true;
              },
            },
            ...markdownKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          cmPlaceholder(placeholder ?? ""),
          EditorView.contentAttributes.of({
            id,
            role: "textbox",
            "aria-label": ariaLabel ?? "",
            "aria-multiline": "true",
            spellcheck: "true",
            autocapitalize: "off",
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const next = update.state.doc.toString();
            // contenteditable 没有 value：给 E2E / 调试一个精确的正文（innerText 会把
            // CodeMirror 的占位符也算进去，空正文会读成「写下邮件正文…」）
            update.view.contentDOM.dataset.value = next;
            if (applyingExternalRef.current) return;
            onChangeRef.current(next);
          }),
        ],
      }),
    });
    view.contentDOM.dataset.value = view.state.doc.toString();
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 编辑器只创建一次：后续 value 变化走下面的同步 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部值变化（草稿恢复 / 回复预填 / 切换邮件）：整文档替换，但值相同就不动光标
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    applyingExternalRef.current = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: value.length },
    });
    applyingExternalRef.current = false;
    view.contentDOM.dataset.value = value;
  }, [value]);

  return (
    <div
      ref={hostRef}
      data-slot="markdown-editor"
      className={cn("h-full min-h-0 min-w-0 overflow-hidden", className)}
    />
  );
}
