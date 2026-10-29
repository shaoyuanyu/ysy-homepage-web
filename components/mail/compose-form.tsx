"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeftIcon,
  Columns2Icon,
  EyeIcon,
  PaperclipIcon,
  PencilLineIcon,
  SendIcon,
  XIcon,
} from "lucide-react";

import { Link, useRouter } from "@/lib/i18n/navigation";
import { useOwnAddresses } from "@/lib/mail/use-own-addresses";
import { useMailDirectory } from "@/lib/mail/use-mail-directory";
import { addressesOf, formatMailbox, normalizeAddressList, parseMailbox, splitAddressList } from "@/lib/mail/address";
import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/mail/fetch-timeout";
import { usePublishDraftBar, type MailDraftBarState } from "@/components/mail/mail-statusbar";
import { senderLabel } from "@/components/mail/account-label";
import { accountDotProps } from "@/components/mail/account-dot";
import { RecipientInput } from "@/components/mail/recipient-input";
import { MarkdownEditor } from "@/components/mail/markdown-editor";
import { markdownToPlainText, quoteAsMarkdown, renderMarkdown } from "@/lib/mail/markdown";
import { PREFERENCE_KEYS } from "@/lib/preferences/registry";
import { useOwnerPreferences } from "@/lib/preferences/use-owner-preferences";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import type { MailAccount, MailAddress, MailDetail, MailDraft, SendAttachmentInput } from "@/lib/mail/types";

// 事件名统一在 `lib/mail/events.ts`（详情页 / 顶栏 / 自己的地址集合也订阅它们）；
// 这里 re-export，既有 import 不需要改。
import { MAIL_COMPOSE_SENDER_EVENT, MAIL_DRAFTS_CHANGED_EVENT, MAIL_SENT_EVENT } from "@/lib/mail/events";
export { MAIL_DRAFTS_CHANGED_EVENT, MAIL_SENT_EVENT };

/** 自动保存提交的载荷（写信页 → webmaild /drafts；地址串保原文） */
interface DraftPayload {
  kind: MailDraft["kind"];
  kindRef: string;
  accountId: string;
  /** 临时发件人姓名（2026-10-16）：随草稿一起存，写一半离开再回来看得到自己署的名 */
  fromName: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  readReceipt: boolean;
  inReplyTo: string;
  references: string[];
}

/** 附件大小上限（与 webmaild 的 40MB body 上限配套，留 base64 膨胀余量） */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** 表单头（2026-10-06 重设计）行：标签固定 3.5rem 列 + 控件占满剩余
 *  （minmax(0,1fr)：长地址不撑破行；3.5rem 容得下「发件人」3 字） */
const HEADER_ROW =
  "group grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2 px-3.5 py-1";

/** 表单头标签：行内控件聚焦时由次要色转主色（无线条的聚焦反馈） */
const HEADER_LABEL = "text-muted-foreground transition-colors group-focus-within:text-foreground";

/** 表单头行内控件的「无边框」覆写：描边属于外层容器，控件自己不画任何轮廓。
 *  ⚠ `-mx-1.5` 抵消 `px-1.5`：文字位置与其它行对齐，同时给聚焦底色留出余量
 *  ⚠ 2026-10-29 晚改：**这里不再画任何聚焦装饰**（原来 ring-2 ring-ring/40，中间试过
 *    淡底色）。表单头已经是「1px 外框 + 逐行发丝线」的嵌套结构：控件再自画一个圆角环，
 *    就是第三层轮廓；改铺淡底色又会和 chip 的 `bg-muted` 撞成一片。用户报「边缘线条描边
 *    之间还是比较冲突」——最干净的解法是**控件零装饰**：只留光标作为聚焦提示，着色只
 *    交给 chip（全表单唯一有填充的元素）。
 *    —— 全站普通输入框仍然是 ring-2 规范（CLAUDE.md「输入框边框」），只此处例外。 */
const BARE_CONTROL =
  "rounded-md border-0 bg-transparent px-1.5 -mx-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent";

/** 选项 chip（表单头右侧）：收起 = 灰描边 + 次要色；开启 = 主色淡底。
 *  ⚠ 2026-10-29 打磨：描边降为 `border-border/70`、补过渡与聚焦环——原样式与
 *    发件人下拉贴在同一行时描边偏重，四个 chip 像四枚小按钮挤在输入框右侧 */
const OPTION_CHIP =
  "h-7 rounded-full border-border/70 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 aria-pressed:border-primary/30 aria-pressed:bg-primary/10 aria-pressed:text-primary";

/** 地址串里的地址个数（分隔符口径与发送解析一致），选项 chip 的上标计数用 */
function countAddrs(value: string): number {
  return splitAddressList(value).length;
}

/**
 * 去掉地址串末尾的分隔符（2026-10-29 第二轮）。
 *
 * 收件人输入框用「尾分隔符」表示「这一条已提交成 chip」（见 recipient-input 文件头），
 * 但**草稿里不该存这枚逗号**——手机端打开草稿就能看见「a@x, b@y, 」这种尾巴。
 */
function trimAddressTail(value: string): string {
  return value.replace(/[,;，；]\s*$/, "");
}

/**
 * 程序化填入的地址串一律标成「已提交」（尾分隔符 = chip 标记，见 recipient-input 文件头）。
 *
 * 回复预填 / 草稿恢复 / 通讯录点「写信」都是「已经选定的人」，不应该先以一条能被光标
 * 插进去改一半的纯文本出现——直接渲染成 chip（2026-10-29 用户要求）。
 */
function asCommitted(value: string): string {
  const v = value.trim();
  if (!v) return value;
  if (/[,;，；]\s*$/.test(v)) return value;
  return `${v}, `;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** base64 长度 → 原始字节数（附件条上显示大小用） */
function base64Bytes(contentBase64: string): number {
  return Math.round((contentBase64.length * 3) / 4);
}

/** base64 → 字节（写邮件附件预览用） */
function base64ToBytes(contentBase64: string): Uint8Array {
  const binary = atob(contentBase64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** 字节 → base64（转发时把原附件装回附件列表；FileReader 那条路只适用于用户拖进来的 File） */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000; // 分块拼接：一次 apply 太多参数会爆栈
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fmtAddress(a: MailAddress): string {
  return a.name ? `${a.name} <${a.address ?? ""}>` : (a.address ?? "");
}

/** 写邮件：选发件身份；回复 / 回复全部 / 转发时带入原信内容；
 *  草稿自动保存到服务器（2026-10-06，500ms 防抖；草稿箱在 /mail 的「草稿」tab） */
export function ComposeForm() {
  const t = useTranslations("mail");
  const router = useRouter();
  const searchParams = useSearchParams();
  const replyTo = searchParams.get("replyTo");
  const replyAll = searchParams.get("all") === "1";
  const forwardId = searchParams.get("forward");
  // 通讯录「写信」入口预填收件人
  const toParam = searchParams.get("to");
  /**
   * 默认发件账号（2026-10-16 用户要求；2026-10-17 收紧为「只认入口」）：
   * - `?from=<账号 id>`：写邮件入口（左栏账号筛选跟着进来）与详情页的回信 / 转发都带它
   *   ——「我现在是谁」由入口决定；
   * - ⚠ **没带 `?from=` 就留空**（左栏选「全部账号」、通讯录「写信」、直接开本页）：不再
   *   回落账号列表第一个（用户 2026-10-17：「选择『全部账号』时点击『写邮件』，不应该有
   *   默认发件人」）——发件人是「以谁的身份发信」，替用户猜一个等于替他决定这件事。
   * - 只当**默认值**：草稿里存的 accountId 优先（见下方恢复 effect 与 accounts effect 的
   *   `prev ||` 写法），用户手动改过也不覆盖。
   */
  const fromParam = searchParams.get("from");
  /** 从草稿箱进入（?draft=<id>）：显式编辑该草稿（只加载它的内容，不做回复/转发预填） */
  const urlDraftId = searchParams.get("draft");
  // 自己的地址（4.10）：补全第一位用，回复全部时还要据此把自己的地址从收件人里剔掉
  const { ready: ownReady, own, emails: ownEmails } = useOwnAddresses();
  /** 联系人 / 往来对象的名字（2026-10-29）：把裸邮箱显示成「备注名 <邮箱>」。
   *  与左栏联系人面板共享同一份缓存，不会重复请求 */
  const { nameOf } = useMailDirectory();
  /** 输入框失焦时把裸邮箱补上备注名（已带名字的保留原样） */
  const normalizeAddr = useCallback(
    (value: string) => normalizeAddressList(value, nameOf),
    [nameOf],
  );

  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  /** 请求已结束（成功或失败）：用来区分「还在加载」与「真的一个账号都没有」——
   *  后者此前什么都不显示，只剩一个孤零零的箭头，看起来像控件坏了 */
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [fromId, setFromId] = useState("");
  /**
   * 临时发件人姓名（2026-10-16 用户要求）：「在给不同的人发件时，我的身份自述可能有变化」。
   * 只作用于**这一封**，不写回账号设置（账号级的 senderName 是长期身份，这里是本封邮件的署名）。
   * 空串 = 用账号自己的发件人姓名（回落逻辑在 webmail 的 send.ts / draft-mirror.ts）。
   */
  const [fromName, setFromName] = useState("");
  /** 「显示名」行是否展开（与「抄送 / 密送」同构：chip 展开对应输入行，收起时不占高度） */
  const [fromNameShown, setFromNameShown] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  // 抄送 / 密送行默认收起（2026-10-06 重设计），由选项条 chips 展开；
  // 草稿恢复时若对应字段有内容则自动展开（见恢复 effect）
  const [ccShown, setCcShown] = useState(false);
  const [bccShown, setBccShown] = useState(false);
  /** 邮件回执（MDN）：请求对方阅读后发送回执，写 Disposition-Notification-To 头 */
  const [readReceipt, setReadReceipt] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  /** 正文视图模式（2026-10-29）：宽屏默认分栏；窄屏 CSS 只显示编辑区，按钮可切到预览。
   *  ⚠ 不用 matchMedia 决定默认值——SSR/水合会闪一下；用 CSS 断点让「分栏」在窄屏
   *    自然退化成「编辑」，用户仍可用按钮切到预览。 */
  const [bodyMode, setBodyMode] = useState<"split" | "write" | "preview">("write");
  /** 用户手动选过模式后，不再被「宽屏默认分栏」的初始化覆盖 */
  const bodyModeChosenRef = useRef(false);
  const chooseBodyMode = useCallback((mode: "split" | "write" | "preview") => {
    bodyModeChosenRef.current = true;
    setBodyMode(mode);
  }, []);
  useEffect(() => {
    if (bodyModeChosenRef.current) return;
    // SSR 首帧统一按「编辑」渲染（避免水合不一致）；宽屏在挂载后切到分栏。
    // 窄屏保持编辑，用户可用工具栏按钮切到预览。
    if (window.matchMedia("(min-width: 64rem)").matches) setBodyMode("split");
  }, []);
  /** 预览用延迟值：大文档逐键 render 会卡输入，React 的 deferred value 足够 */
  const deferredBody = useDeferredValue(body);
  const previewHtml = useMemo(() => renderMarkdown(deferredBody), [deferredBody]);
  /** 邮件签名（设置页按账号保存；走主人偏好，跨设备同步） */
  const { ready: prefsReady, prefs } = useOwnerPreferences();
  // useMemo：prefs 未变时保持引用不变——否则这个 effect 会每次渲染都跑，
  // 用户在正文里删掉签名后又被自动插回去
  const signatures = useMemo(
    () => (prefs[PREFERENCE_KEYS.MAIL_SIGNATURES] ?? {}) as Record<string, string>,
    [prefs],
  );
  /** 上一次自动插入的签名：换发件账号时只在正文仍「只有签名」的情况下替换/移除 */
  const lastSignatureRef = useRef("");
  /** 用户是否亲自改过正文：异步到货的签名/换账号都不能再往正文里写字 */
  const bodyTouchedRef = useRef(false);
  const handleBodyChange = useCallback((next: string) => {
    bodyTouchedRef.current = true;
    setBody(next);
  }, []);
  useEffect(() => {
    if (!prefsReady || !fromId || bodyTouchedRef.current) return;
    const sig = (signatures[fromId] ?? "").trim();
    if (!sig) {
      // 换成没有签名的账号：正文如果还是上一份自动签名，一并清掉；用户改过就不动
      setBody((prev) => {
        const current = prev.trim();
        if (lastSignatureRef.current && current === lastSignatureRef.current.trim()) {
          lastSignatureRef.current = "";
          return "";
        }
        return prev;
      });
      return;
    }
    setBody((prev) => {
      const current = prev.trim();
      // 正文已有用户内容（草稿/回复/手写）→ 不插入；只有「空」或「上一份自动签名」才动
      if (current && current !== lastSignatureRef.current.trim()) return prev;
      lastSignatureRef.current = sig;
      return `\n\n-- \n${sig}`;
    });
  }, [prefsReady, fromId, signatures]);
  const [attachments, setAttachments] = useState<SendAttachmentInput[]>([]);
  const [sending, setSending] = useState(false);
  const [replyRef, setReplyRef] = useState<{ inReplyTo: string; references: string[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** 草稿落盘状态（底栏展示）：null = 尚无内容；saved = 已自动保存（附时刻，底栏显示相对时间）；
   *  error = 服务器写入失败 */
  const [draftState, setDraftState] = useState<MailDraftBarState | null>(null);
  /**
   * 这封草稿在服务器上带的附件（2026-10-10）。
   * 站内还不能编辑草稿附件，但**保存时后端会把它们原样带过去**（draft-mirror 的
   * readKeptAttachments），这里只做只读告知——否则用户会以为附件被弄丢了。
   */
  const [keptAttachments, setKeptAttachments] = useState<{ filename: string; size: number }[]>([]);
  // 底栏（MailShell 的贯通状态栏）在撰写路由显示草稿状态：挂载即标记撰写模式（左区换成
  // 草稿状态、中区账号指示隐藏），离开路由自动还原成列表统计
  usePublishDraftBar(draftState);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // ---- 服务器端草稿（2026-10-06，替换 localStorage 单草稿）----
  /** 当前草稿 id（服务器）；null = 尚未创建（首次保存时 POST）——只存 ref（无渲染点） */
  const draftIdRef = useRef<string | null>(null);
  /** 恢复流程完成前抑制自动保存（异步拉草稿期间，空白初值不得把服务器草稿冲掉） */
  const restoreDoneRef = useRef(false);
  /**
   * 「恢复草稿引起的那一次状态变化不算用户改动」。
   *
   * ⚠ 必须挡住（2026-10-10）：恢复草稿会 set 一串 state（正文/收件人/发件账号/replyRef…），
   * 而自动保存的 effect 就盯这些 state——不挡的话"打开一封草稿"＝"立刻把它重存一遍"：
   * 服务器上的那份会被替换（新 UID、时间变成"刚刚"），用户只是看了一眼却看到"最近修改时间
   * 变成了现在"，草稿箱里的排序也被搅乱。草稿改为以服务商草稿文件夹为唯一事实源之后，
   * 每一次这样的重存都是一次真实的服务器写入，代价更明确。
   */
  const skipNextAutosaveRef = useRef(false);
  /** 自上次成功保存后有修改（卸载 flush 只补有修改的草稿） */
  const dirtyRef = useRef(false);
  /** 已发送（防卸载 flush 在发送成功后又新建一封草稿） */
  const sentRef = useRef(false);
  /** 组件已卸载（异步回调不再 setState） */
  const unmountedRef = useRef(false);
  /** 保存串行链：请求按提交顺序落地（last-write-wins，避免乱序覆盖） */
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  /** 保存载荷镜像：自动保存 / 卸载 flush 从 ref 读最新值（不受 effect 闭包时序影响） */
  const payloadRef = useRef<DraftPayload>({
    kind: "new",
    kindRef: "",
    accountId: "",
    fromName: "",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    readReceipt: false,
    inReplyTo: "",
    references: [],
  });
  // 附件入列时要看「当前已有多少字节」；预填附件的 effect 不能把 attachments 写进 deps
  // （否则每加一个附件就重新拉一次原信），故用 ref 镜像最新值。
  const attachmentsRef = useRef<SendAttachmentInput[]>([]);

  // 草稿键（旧版 localStorage 草稿的一次性迁移用）：回复 / 转发按原信分键，新信共用一个键
  const draftKey = replyTo
    ? `mail:draft:reply:${replyTo}`
    : forwardId
      ? `mail:draft:forward:${forwardId}`
      : "mail:draft:new";
  /**
   * 草稿归属（随草稿存下来的两个字段，服务器端按它找回复 / 转发的那一封）：
   * - 回复 / 转发 → 归属键 = 那封原信的 id（找回来 = 接着写这一封；见恢复 effect）；
   * - 新建 → `kind=new` + **空**归属键：这是一格**全局共用**的位置（没有原信可挂），
   *   ⚠ 不要拿它当"找回最近的新建草稿"的抓手（2026-10-17 已撤掉，原因见恢复 effect）。
   */
  const draftKind: MailDraft["kind"] = replyTo ? "reply" : forwardId ? "forward" : "new";
  const draftKindRef = replyTo ?? forwardId ?? "";
  // 保存载荷镜像（每次 render 更新；卸载 flush 也能读到最新值）
  payloadRef.current = {
    kind: draftKind,
    kindRef: draftKindRef,
    accountId: fromId,
    fromName,
    to: trimAddressTail(to),
    cc: trimAddressTail(cc),
    bcc: trimAddressTail(bcc),
    subject,
    body,
    readReceipt,
    inReplyTo: replyRef?.inReplyTo ?? "",
    references: replyRef?.references ?? [],
  };

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    fetchWithTimeout("/api/mail/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: MailAccount[]) => {
        const enabled = data.filter((a) => a.enabled);
        setAccounts(enabled);
        // 草稿恢复可能已选了发件账号：只在未选时给默认（勿覆盖）。
        // ⚠ 默认值**只认入口带来的 `?from=`**（2026-10-17 用户要求：「邮箱页面在选择『全部账号』
        //   时点击『写邮件』，不应该有默认发件人」）：入口没带账号（左栏选「全部账号」、通讯录
        //   「写信」、直接开 `/mail/compose`）时**留空**——发件人是"以谁的身份发信"，多账号下
        //   "替你选一个"就是替你决定这件事（旧行为静默落到账号列表第一个）。留空的后果是**显式**
        //   的：下拉显示「选择发件人」、发送按钮灰着，选好才发得出去（见 MAIL-AGENT.md 4.16）。
        //   `?from=` 给的账号不在已启用列表里（被删 / 停用）时同样留空，**不退回第一个账号**。
        if (fromParam) {
          setFromId((prev) => prev || enabled.find((a) => a.id === fromParam)?.id || "");
        }
        setAccountsLoaded(true);
      })
      .catch(() => setAccountsLoaded(true));
    // ⚠ `fromParam` 只读一次（本 effect 只在挂载时拉账号列表）：入口参数不会在写信期间变
  }, [fromParam]);

  /**
   * 发件人 → 左栏联系人档（2026-10-29 用户要求：「选好发件人账号时，左侧区只显示
   * 该账号下的联系人」）。
   * - 广播时机等到账号列表到货：`fromId` 初值 "" 时若立刻广播，会把面板已经从
   *   `?from=` 落好的档位重置成「全部」并闪一下；
   * - 之后每次手动换发件人都会广播（空 = 回到全部）——这与「入口账号」是两回事：
   *   入口只决定初值，实际以用户当前选择的发件人为准。
   */
  useEffect(() => {
    if (!accountsLoaded) return;
    window.dispatchEvent(
      new CustomEvent<string>(MAIL_COMPOSE_SENDER_EVENT, { detail: fromId }),
    );
  }, [fromId, accountsLoaded]);

  /** 草稿内容应用（「非空才覆盖」：空字段留给回复 / 转发预填，不清掉已有值；
   *  带内容的抄送 / 密送行自动展开，否则内容会藏在收起行里） */
  const applyDraft = useCallback(
    (d: {
      to?: string;
      cc?: string;
      bcc?: string;
      subject?: string;
      body?: string;
      receipt?: boolean;
      accountId?: string;
      fromName?: string;
      inReplyTo?: string;
      references?: string[];
    }) => {
      if (d.to) setTo(asCommitted(d.to));
      if (d.cc) {
        setCc(asCommitted(d.cc));
        setCcShown(true);
      }
      if (d.bcc) {
        setBcc(asCommitted(d.bcc));
        setBccShown(true);
      }
      if (d.subject) setSubject(d.subject);
      if (d.body) setBody(d.body);
      if (d.receipt) setReadReceipt(true);
      if (d.accountId) setFromId(d.accountId);
      // 草稿带着临时姓名时连行一起展开（否则内容藏在收起行里，与抄送 / 密送同一条规矩）
      if (d.fromName) {
        setFromName(d.fromName);
        setFromNameShown(true);
      }
      if (d.inReplyTo) setReplyRef({ inReplyTo: d.inReplyTo, references: d.references ?? [] });
    },
    [],
  );

  /**
   * 草稿恢复（2026-10-06 建；**2026-10-17 收窄：只认「明确归属」的草稿**）：
   * - `?draft=<id>`：从草稿箱点进来——加载该草稿（不做回复 / 转发预填）；
   * - `?replyTo=` / `?forward=`：按归属键（kind/kindRef = 挂在哪封信上）找回那一封——
   *   写一半离开后再从同一邮件点回复 / 转发能接着写（归属键的语义，见 MAIL-AGENT.md 4.9）。
   * - ⚠ **裸「写邮件」（无参数）不再找回任何草稿**：旧写法让归属键退化成
   *   `kind=new&kindRef=` 去问"最近更新的一封**新建**草稿"，而新建草稿没有原信可挂、
   *   归属键是**全局共用**的一格——于是点「写邮件」会被塞回一封**几小时前甚至几年前**
   *   的旧草稿（草稿箱 = 服务商草稿文件夹的镜像，历史草稿上百封）。用户 2026-10-17
   *   报障：「点击写邮件时似乎会默认跳转到一个已有草稿的写邮件页面」。
   *   现在新写信一律空白；没写完的新邮件照旧由自动保存落在「草稿」tab 里，点进去接着写。
   *   ⚠ 旧行为同时是**数据安全**问题：写邮件 → 直接点「发送」，会把那封旧草稿的收件人与
   *   正文发出去，而用户以为自己写的是一封新邮件。
   *
   * 恢复完成前 `restoreDoneRef` 未置位 → 自动保存被抑制（异步拉取期间，空白初值
   * 不得把服务器草稿冲掉）。找不到服务器草稿时尝试一次性迁移旧版 localStorage 草稿
   * （恢复内容并删除本地键，之后由自动保存落成服务器草稿）。
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let restored = false;
      try {
        // ⚠ 取草稿分两步（2026-10-10 草稿改为"服务商草稿文件夹 = 唯一事实源"之后）：
        //   ① 先定位是哪一封（`?draft=<id>` 直接取；否则按归属键按 kind/kindRef 从**本地缓存**里找
        //      ——不发 IMAP，写信页是高频入口）；
        //   ② 再按 id 取单封：服务器草稿的正文/附件在**服务端按需抓原文解析**，列表那一步只有
        //      envelope（主题/收件人/时间）。漏了这一步就会出现"草稿有内容，写信页却是空白"。
        let hit: MailDraft | null = null;
        if (urlDraftId) {
          const res = await fetchWithTimeout(`/api/mail/drafts/${encodeURIComponent(urlDraftId)}`);
          if (res.ok) hit = (await res.json()) as MailDraft;
        } else if (draftKindRef) {
          // ⚠ 只对**回复 / 转发**（归属键非空 = 挂在一封具体的原信上）按归属键找回。
          //   裸「写邮件」的归属键是 `kind=new&kindRef=`（全局共用的一格），进来会命中
          //   草稿箱里最近更新的一封新建草稿——那封可能是几小时前甚至几年前的。见上方注释。
          const params = new URLSearchParams({ kind: draftKind, kindRef: draftKindRef });
          const res = await fetchWithTimeout(`/api/mail/drafts?${params}`);
          if (res.ok) {
            const data = (await res.json()) as { items?: MailDraft[] };
            const first = data.items?.[0];
            if (first) {
              const one = await fetchWithTimeout(`/api/mail/drafts/${encodeURIComponent(first.id)}`);
              if (one.ok) hit = (await one.json()) as MailDraft;
            }
          }
        }
        {
          if (hit && !cancelled) {
            draftIdRef.current = hit.id;
            applyDraft({
              to: hit.to,
              cc: hit.cc,
              bcc: hit.bcc,
              subject: hit.subject,
              body: hit.body,
              receipt: hit.readReceipt,
              accountId: hit.accountId,
              fromName: hit.fromName,
              inReplyTo: hit.inReplyTo,
              references: hit.references,
            });
            // 底栏直接进「已保存」态：显示的是这封草稿上次保存的时刻
            if (hit.to || hit.subject || hit.body) {
              setDraftState({ status: "saved", at: new Date(hit.updatedAt).getTime() || Date.now() });
            }
            // 服务商草稿里带的附件：站内不显示也不支持编辑，但保存时会由后端原样保留
            // （draft-mirror 的 readKeptAttachments），这里只如实告知，别让用户以为丢了
            setKeptAttachments(hit.attachments ?? []);
            // 下面这串 setState 触发的自动保存要跳过（见 skipNextAutosaveRef）
            skipNextAutosaveRef.current = true;
            restored = true;
          }
        }
      } catch {
        // 网络失败：按无草稿处理（写信照常可用，首次保存会重试创建）
      }
      if (cancelled) return;
      if (!restored) {
        // 旧版 localStorage 草稿迁移（一次性）
        try {
          const raw = window.localStorage.getItem(draftKey);
          if (raw) {
            const d = JSON.parse(raw) as {
              to?: string;
              cc?: string;
              bcc?: string;
              subject?: string;
              body?: string;
              receipt?: boolean;
            };
            applyDraft(d);
            window.localStorage.removeItem(draftKey);
          }
        } catch {
          // 草稿损坏或存储不可用：忽略
        }
      }
      restoreDoneRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [urlDraftId, draftKind, draftKindRef, draftKey, applyDraft]);

  /**
   * 草稿落盘（服务器端，串行链保证请求按提交顺序落地 / last-write-wins）：
   * - 无草稿且有内容 → POST 创建（拿到 id 后走 PUT）；
   * - 有草稿 → PUT 整体替换；
   * - 内容被清空（全字段空）→ DELETE 删除草稿（清空 = 放弃这封）；
   * - 成功后广播 `mail:drafts-changed`（草稿箱列表刷新）、底栏进「已保存」态。
   */
  const flushDraft = useCallback(() => {
    const run = async () => {
      const payload = payloadRef.current;
      const id = draftIdRef.current;
      // 只有自动插入的签名也算「空」：选好发件人就会插入签名，不能因此凭空多出一封草稿。
      // （用户一旦补了收件人 / 主题 / 正文，照常保存。）
      const sigOnly =
        !!lastSignatureRef.current &&
        payload.body.trim() === `-- \n${lastSignatureRef.current.trim()}`;
      /**
       * 2026-10-29 用户定稿：**只有主题或正文有内容才存草稿**。
       * 只填了收件人 / 抄送、或只被自动插了一条签名，都不算内容——否则选个联系人
       * 就在草稿箱里多出一封空壳，回头还得手动清。（已有草稿被清空后仍然删除，
       * 这条语义不变。）
       */
      const hasContent = !!payload.subject.trim() || (!!payload.body.trim() && !sigOnly);
      const empty = !hasContent;
      try {
        if (empty) {
          if (!id) return;
          draftIdRef.current = null;
          await fetch(`/api/mail/drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
          dirtyRef.current = false;
          if (!unmountedRef.current) {
            setDraftState(null);
          }
          window.dispatchEvent(new Event(MAIL_DRAFTS_CHANGED_EVENT));
          return;
        }
        const res = id
          ? await fetch(`/api/mail/drafts/${encodeURIComponent(id)}`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch("/api/mail/drafts", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            });
        if (!res.ok) throw new Error(`${res.status}`);
        if (!id) {
          const created = (await res.json()) as MailDraft;
          draftIdRef.current = created.id;
        }
        dirtyRef.current = false;
        if (!unmountedRef.current) setDraftState({ status: "saved", at: Date.now() });
        window.dispatchEvent(new Event(MAIL_DRAFTS_CHANGED_EVENT));
      } catch {
        // 服务器写入失败：底栏亮琥珀点报「草稿保存失败」（title 有说明）
        if (!unmountedRef.current) setDraftState({ status: "error", at: Date.now() });
      }
    };
    saveChainRef.current = saveChainRef.current.then(run, run);
  }, []);

  // 草稿自动保存（500ms 防抖；恢复完成前不保存——防空白初值冲掉服务器草稿）
  useEffect(() => {
    if (!restoreDoneRef.current) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    dirtyRef.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => flushDraft(), 500);
    return () => clearTimeout(saveTimer.current);
  }, [draftKey, to, cc, bcc, subject, body, readReceipt, fromId, fromName, replyRef, flushDraft]);

  // 卸载：补一次未落盘的修改（防抖窗口内离开不丢最后 500ms 的输入）；已发送的不补
  useEffect(
    () => () => {
      unmountedRef.current = true;
      clearTimeout(saveTimer.current);
      if (!sentRef.current && restoreDoneRef.current && dirtyRef.current) flushDraft();
    },
    [flushDraft],
  );

  /**
   * 附件入列的唯一入口（用户拖拽/选择 与 转发预填 共用）：
   * 单个与总量上限同值（4.9「超总量给提示」），超限的逐个提示后丢弃。
   */
  const appendAttachments = useCallback(
    (incoming: SendAttachmentInput[]) => {
      if (incoming.length === 0) return;
      let total = attachmentsRef.current.reduce((s, a) => s + base64Bytes(a.contentBase64), 0);
      const accepted: SendAttachmentInput[] = [];
      for (const a of incoming) {
        const size = base64Bytes(a.contentBase64);
        if (size > MAX_ATTACHMENT_BYTES || total + size > MAX_ATTACHMENT_BYTES) {
          toast.add({ title: t("attachmentTooLarge", { name: a.filename }), type: "error" });
          continue;
        }
        total += size;
        accepted.push(a);
      }
      if (accepted.length > 0) setAttachments((prev) => [...prev, ...accepted]);
    },
    [t],
  );

  /**
   * 回复 / 回复全部：取原邮件，预填收件人、主题与引用关系。
   *
   * ⚠ 回复全部必须等「我的账号」就绪再算（`ownReady`）：自己的地址在 To/Cc 里时
   *   必须剔除，否则会给自己发一份——先算后到就剔不掉了。
   */
  useEffect(() => {
    if (!replyTo) return;
    if (replyAll && !ownReady) return;
    fetchWithTimeout(`/api/mail/message/${encodeURIComponent(replyTo)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MailDetail | null) => {
        if (!data) return;
        const isOwn = (addr: string) => ownEmails.has(addr.toLowerCase());
        // 惯例：To = 原发件人 + 原收件人；Cc = 原抄送；两边都剔掉自己并去重。
        // 2026-10-29：预填时带上原信的显示名（`备注名 <邮箱>`），不再只剩裸地址。
        const seen = new Set<string>();
        const toList: string[] = [];
        const ccList: string[] = [];
        const add = (
          target: string[],
          name: string | null | undefined,
          addr: string | null | undefined,
        ) => {
          const address = (addr ?? "").trim();
          if (!address) return;
          const key = address.toLowerCase();
          if (isOwn(address) || seen.has(key)) return;
          seen.add(key);
          target.push(formatMailbox(name, address));
        };
        if (replyAll) {
          add(toList, data.fromName, data.fromAddr);
          for (const a of data.to) add(toList, a.name, a.address);
          for (const a of data.cc) add(ccList, a.name, a.address);
        } else {
          // 单回复不回填名字以外的收件人；是否是自己交给服务端，保持旧行为
          toList.push(formatMailbox(data.fromName, data.fromAddr));
        }
        setTo((prev) => prev || asCommitted(toList.join(", ")));
        setCc((prev) => prev || asCommitted(ccList.join(", ")));
        // 回复全部带出抄送时展开抄送行（否则内容藏在收起的行里）
        if (ccList.length > 0) setCcShown(true);
        setSubject((prev) => prev || (/^re:/i.test(data.subject) ? data.subject : `Re: ${data.subject}`));
        // 规范化后的 messageId 形如 mid:<id>@<host>，取尖括号形式写回引用头
        const rawMid = data.messageId.startsWith("mid:")
          ? `<${data.messageId.slice(4)}>`
          : "";
        if (rawMid) setReplyRef({ inReplyTo: rawMid, references: [rawMid] });
        setBody(
          (prev) =>
            prev ||
            `\n\n-------- ${t("quoteSeparator")} --------\n\n${quoteAsMarkdown(data.text)}`,
        );
      })
      .catch(() => {});
  }, [replyTo, replyAll, ownReady, ownEmails, t]);

  /**
   * 转发：带入原主题、引用头块与**附件**（内嵌图不带）。
   *
   * ⚠ 转发是新会话，**不**写 In-Reply-To / References（写了会把转发挂回原会话）。
   */
  useEffect(() => {
    if (!forwardId) return;
    let cancelled = false;
    const header = (d: MailDetail) => {
      const lines = [`${t("fieldFrom")}: ${d.fromName ? `${d.fromName} <${d.fromAddr}>` : d.fromAddr}`];
      if (d.date) {
        lines.push(`${t("fieldDate")}: ${new Date(d.date).toLocaleString(t("localeTag"))}`);
      }
      lines.push(`${t("fieldSubject")}: ${d.subject || t("noSubject")}`);
      const to = d.to.map(fmtAddress).filter(Boolean).join(", ");
      if (to) lines.push(`${t("fieldTo")}: ${to}`);
      const cc = d.cc.map(fmtAddress).filter(Boolean).join(", ");
      if (cc) lines.push(`${t("fieldCc")}: ${cc}`);
      return lines.join("\n");
    };
    void (async () => {
      const res = await fetchWithTimeout(`/api/mail/message/${encodeURIComponent(forwardId)}`).catch(() => null);
      if (!res?.ok || cancelled) return;
      const data = (await res.json()) as MailDetail;
      if (cancelled) return;
      setSubject((prev) => (prev || (/^fwd:/i.test(data.subject) ? data.subject : `Fwd: ${data.subject}`)));
      setBody(
        (prev) =>
          prev ||
          `\n\n-------- ${t("forwardSeparator")} --------\n\n${quoteAsMarkdown(
            `${header(data)}\n\n${data.text}`,
          )}`,
      );
      // 附件随转发带走：逐个从附件端点取回字节再塞进附件列表（内嵌图不算附件）
      const wanted = data.attachments.filter((a) => !a.inline);
      if (wanted.length === 0) return;
      const fetched = await Promise.all(
        wanted.map(async (a): Promise<SendAttachmentInput | null> => {
          try {
            const r = await fetchWithTimeout(
              `/api/mail/message/${encodeURIComponent(forwardId)}/attachment/${a.index}`,
            );
            if (!r.ok) return null;
            return {
              filename: a.filename,
              contentType: a.contentType || "application/octet-stream",
              contentBase64: bytesToBase64(new Uint8Array(await r.arrayBuffer())),
            };
          } catch {
            return null; // 单个附件取不回来不影响写信
          }
        }),
      );
      if (cancelled) return;
      appendAttachments(fetched.filter((a): a is SendAttachmentInput => a !== null));
    })();
    return () => {
      cancelled = true;
    };
  }, [forwardId, appendAttachments, t]);

  // 通讯录「写信」入口：预填收件人（不覆盖草稿已恢复的内容）。
  // 名字簿到货后把裸地址升级成「备注名 <邮箱>」（只改这一处仍是裸地址的情况）
  useEffect(() => {
    if (!toParam) return;
    setTo((prev) => {
      if (!prev) return asCommitted(formatMailbox(nameOf(toParam), toParam));
      const tokens = splitAddressList(prev);
      if (tokens.length === 1 && tokens[0].toLowerCase() === toParam.toLowerCase()) {
        const name = nameOf(toParam);
        return name ? asCommitted(formatMailbox(name, toParam)) : prev;
      }
      return prev;
    });
  }, [toParam, nameOf]);

  // 左栏联系人面板（4.14）点击「加入收件人」→ 追加到收件人（去重；
  // 分隔符口径与发送解析一致。面板只在撰写路由显示，故直接 setTo 无顾虑）。
  // 2026-10-29：追加时带上联系人备注名；去重按**地址**而不是整段文本
  // （已有条目可能是 `名字 <邮箱>`）。
  useEffect(() => {
    const onAdd = (e: Event) => {
      const email = (e as CustomEvent<string>).detail;
      if (!email) return;
      setTo((prev) => {
        const list = splitAddressList(prev);
        const key = email.toLowerCase();
        if (list.some((t) => (parseMailbox(t)?.address ?? t).toLowerCase() === key)) return prev;
        return asCommitted([...list, formatMailbox(nameOf(email), email)].join(", "));
      });
    };
    window.addEventListener("mail:add-recipient", onAdd);
    return () => window.removeEventListener("mail:add-recipient", onAdd);
  }, [nameOf]);

  const addAttachments = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      for (const file of Array.from(files)) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          toast.add({ title: t("attachmentTooLarge", { name: file.name }), type: "error" });
          continue;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result);
          appendAttachments([
            {
              filename: file.name,
              contentType: file.type || "application/octet-stream",
              contentBase64: dataUrl.slice(dataUrl.indexOf(",") + 1),
            },
          ]);
        };
        reader.readAsDataURL(file);
      }
      if (fileRef.current) fileRef.current.value = "";
    },
    [appendAttachments, t],
  );

  // 附件拖拽入区（4.9）：整表单是放置区，拖入时显示虚线提示层
  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setDragging(true);
    }
  }, []);
  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  }, []);
  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      addAttachments(e.dataTransfer.files);
    },
    [addAttachments],
  );

  /**
   * 写邮件附件预览（2026-10-29 用户要求）：把内存里的 base64 变成 Blob URL，在新标签页
   * 打开。PDF / 图片 / 文本由浏览器直接渲染；其它类型给一句提示（下载由浏览器决定）。
   * ⚠ URL.revokeObjectURL 延迟释放：立刻释放会让新标签页在加载前拿到一个失效的 URL。
   */
  const previewAttachment = useCallback(
    (a: SendAttachmentInput) => {
      const type = a.contentType || "application/octet-stream";
      const previewable = /^(application\/pdf|image\/|text\/)/i.test(type);
      if (!previewable) {
        toast.add({ title: t("previewUnsupported"), type: "info" });
        return;
      }
      const bytes = base64ToBytes(a.contentBase64);
      const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type }));
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        URL.revokeObjectURL(url);
        toast.add({ title: t("previewBlocked"), type: "error" });
        return;
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    [t],
  );

  const send = useCallback(async () => {
    // 两种缺项给各自的提示（2026-10-29）：此前一律报「请填写收件人」，明明缺的是发件人
    if (!fromId) {
      toast.add({ title: t("fieldFromUnset"), type: "error" });
      return;
    }
    // 发送只带裸地址（webmaild 的 assertAddresses 不接受 `名字 <地址>`）；
    // 输入框里的显示名保留在草稿里，收件人栏不受影响。
    const toAddrs = addressesOf(to);
    if (toAddrs.length === 0) {
      toast.add({ title: t("needRecipient"), type: "error" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: fromId,
          // 临时发件人姓名（空 = 由服务端回落到账号的 senderName）
          fromName: fromName.trim() || undefined,
          to: toAddrs,
          cc: addressesOf(cc),
          bcc: addressesOf(bcc),
          readReceipt,
          subject,
          // 2026-10-29：同时发 text（渲染后的纯文本）与 html（Markdown 渲染结果）
          text: markdownToPlainText(body),
          html: renderMarkdown(body) || undefined,
          inReplyTo: replyRef?.inReplyTo,
          references: replyRef?.references,
          attachments,
          // 来自草稿：webmaild 发送成功后删除该草稿（幂等）
          draftId: draftIdRef.current ?? undefined,
        }),
      });
      // 413 通常是反向代理挡下来的（Nginx 默认 client_max_body_size = 1MB）。
      // 这个响应没有 JSON，别让用户只看到「413」两个字——直接解释原因与上限
      if (res.status === 413) throw new Error(t("sendTooLarge"));
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `${res.status}`);
      // 发送成功：标记已发送（防卸载 flush 又新建一封草稿），并清理旧版本地键
      sentRef.current = true;
      dirtyRef.current = false;
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // 存储不可用：忽略
      }
      toast.add({ title: t("sent"), type: "success" });
      // 告诉左栏列表「后台多了一封留底」（见 MAIL_SENT_EVENT 注释）：这里必须显式广播——
      // 紧接着的 push 只换右栏，挂着的列表不会因此重取。⚠ 先广播再导航：push 之后这个
      // 组件可能已经开始卸载。
      window.dispatchEvent(new Event(MAIL_SENT_EVENT));
      // 从草稿进来的：服务端发送成功后已删除那封草稿——草稿箱列表要跟着少一行。
      // 不发这条，发完信回到「草稿」tab，刚发走的那封还赖在列表里（2026-10-17 审计）。
      window.dispatchEvent(new Event(MAIL_DRAFTS_CHANGED_EVENT));
      router.push("/mail");
    } catch (err) {
      toast.add({ title: t("sendFailed"), description: err instanceof Error ? err.message : String(err), type: "error" });
      setSending(false);
    }
  }, [fromId, fromName, to, cc, bcc, readReceipt, subject, body, replyRef, attachments, draftKey, router, t]);

  // 选项 chip 的上标计数（0 不渲染）
  const ccCount = countAddrs(cc);
  const bccCount = countAddrs(bcc);
  /** 发件人触发器的悬浮全称：窄栏下（尤其英文长地址）会被截断，title 是唯一能看到全文的地方 */
  const currentSender = accounts.find((a) => a.id === fromId);
  const senderTitle = currentSender
    ? fromName.trim()
      ? `${fromName.trim()}<${currentSender.email}>`
      : senderLabel(currentSender)
    : accountsLoaded && accounts.length === 0
      ? t("fieldFromEmpty")
      : t("fieldFromUnset");

  return (
    <div
      // ⚠ 宽屏（两栏面板内）表单要撑满右栏、正文框吃掉富余高度：`lg:flex-1`
      //   接住 mail-pane-detail 的高度链；**不写 lg:min-h-0**——内容超限（小视口 /
      //   附件多）时让表单按 min-content 撑开、由外层滚动容器接管（写 min-h-0 会把
      //   正文框的 25vh 保底一并压掉，E2E 实测 147.5px < 22vh 红线）
      className="relative flex flex-col gap-4 lg:flex-1"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* 本按钮（「返回邮箱」）仅窄屏需要（2026-10-05 用户定稿：桌面端的出口是左栏工具栏里
          的「返回邮箱」按钮，占原「写邮件」位置，两态对称——见 MailContactsPane）；
          窄屏左栏整体隐藏，这里是唯一退路。草稿自动保存，退出不丢内容。
          ⚠ `self-start` 必需：表单根是 flex-col（align-items: stretch 默认值），
          不加会被拉成全宽、按钮文字因 justify-center 居中，与下方字段左缘错位。 */}
      <Link
        href="/mail"
        data-slot="button"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "self-start lg:hidden" })}
      >
        <ArrowLeftIcon data-icon="default" />
        {t("backToMail")}
      </Link>
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-background/85 text-sm font-medium text-primary backdrop-blur-[1px]">
          <PaperclipIcon className="size-5" aria-hidden />
          {t("dropHint")}
        </div>
      )}

      {/* 表单头（2026-10-06 重设计）：单一容器 + 发丝分隔行——标签固定列宽、行内控件
          无边框（描边属于容器），取代原先 2×2 的四个独立输入框。抄送 / 密送默认
          收起，由选项 chips 展开；chips 同时承担「有内容」的指示（上标计数，
          形态与列表的「未读 n」一致），收起的行不会藏内容。
          ⚠ 容器勿加 overflow-hidden：收件人补全下拉绝对定位在行下方，会被裁掉 */}
      <div data-slot="compose-header" className="divide-y divide-border rounded-xl border border-border">
        {/* 发件人行（2026-10-06 二稿）：发件人只有一个、行内大片留白，选项 chips
            （抄送 / 密送 / 邮件回执）就放这一行右侧，不再单占一条选项条。
            ⚠ 窄屏：`grow`（basis 取内容宽、无 `min-w-0`）让 Select 不被压到装不下
            ——放不下时 chips 整体换到下一行，账号名保持可读；`min-w-32` 是最后兜底
            （极窄视口下允许截断到 128px，不把行撑出横向溢出）。勿改回 `flex-1 min-w-0`：
            那会让账号名在 380px 视口被压到 ~60px（只剩「我<…」） */}
        <div className="group flex flex-wrap items-center gap-x-2 gap-y-1 px-3.5 py-1">
          <FieldLabel htmlFor="mail-from" className={`w-14 shrink-0 ${HEADER_LABEL}`}>
            {t("fieldFrom")}
          </FieldLabel>
          <div className="min-w-32 grow">
            <Select value={fromId} onValueChange={(v) => setFromId(v ?? "")}>
              <SelectTrigger
                id="mail-from"
                title={senderTitle}
                className={cn("max-w-full dark:hover:bg-transparent", BARE_CONTROL)}
              >
                {/* ⚠ 必须用 children 函数渲染标签：不传 items 的裸 <SelectValue /> 显示的是
                    原始 value（账号 id「me」」，不是账号名。
                    临时署名（2026-10-16）非空时，这里显示的就是**本封实际会发出的 From 名字**
                    ——下拉里看到什么，收件人就收到什么。
                    ⚠ 空值（2026-10-17：裸「写邮件」不预选发件人）要显示占位文案——旧写法
                    返回空串，行里就是一个空白控件，看起来像坏了。⚠ 账号列表未返回时不显示
                    占位（`accountsLoaded`）：`?from=<账号>` 进来时会先闪一下「选择发件人」
                    再变账号名。 */}
                <SelectValue>
                  {(v) => {
                    const a = accounts.find((x) => x.id === v);
                    if (!a) {
                      // 账号列表还没回来：先留白（避免「选择发件人」闪一下再变账号名）；
                      // 回来后仍对不上（未选 / 账号已被删）：给出对应占位，不留空控件
                      if (!accountsLoaded) return "";
                      return (
                        <span className="text-muted-foreground">
                          {accounts.length === 0 ? t("fieldFromEmpty") : t("fieldFromUnset")}
                        </span>
                      );
                    }
                    const temp = fromName.trim();
                    const dot = accountDotProps(a.color);
                    return (
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span
                          className={cn("size-2 shrink-0 rounded-full", dot.className)}
                          style={dot.style}
                          aria-hidden
                        />
                        <span className="truncate">
                          {temp ? `${temp}<${a.email}>` : senderLabel(a)}
                        </span>
                      </span>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              {/* 菜单宽度跟着内容走（2026-10-29）：弹层默认 `w-(--anchor-width)` 等于触发器宽，
                  长地址会被硬裁在弹层右缘（连省略号都没有，看起来像被切掉）。下限定在触发器宽，
                  上限 28rem，窄屏不超出视口 */}
              <SelectContent className="w-auto min-w-(--anchor-width) max-w-[min(28rem,calc(100vw-2rem))]">
                {accounts.map((a) => {
                  const dot = accountDotProps(a.color);
                  return (
                    <SelectItem key={a.id} value={a.id} title={senderLabel(a)}>
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span
                          className={cn("size-2 shrink-0 rounded-full", dot.className)}
                          style={dot.style}
                          aria-hidden
                        />
                        <span className="truncate">{senderLabel(a)}</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          {/* 选项 chips（更多功能的落点）：显示名 = 展开临时署名行（本封邮件的发件人自称），
              抄送 / 密送 = 展开对应行，邮件回执 = 请求 MDN（写入端写 Disposition-Notification-To 头）。
              计数是上标角标且 aria-hidden——chip 的可访问名保持「抄送 / 密送」 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Toggle
              variant="outline"
              size="sm"
              pressed={fromNameShown}
              onPressedChange={setFromNameShown}
              className={OPTION_CHIP}
            >
              <span className="whitespace-nowrap">{t("fieldFromName")}</span>
            </Toggle>
            <Toggle variant="outline" size="sm" pressed={ccShown} onPressedChange={setCcShown} className={OPTION_CHIP}>
              <span className="whitespace-nowrap">
                {t("fieldCc")}
                {ccCount > 0 && (
                  <span
                    data-slot="compose-cc-count"
                    aria-hidden="true"
                    className="ml-0.5 align-super text-xs leading-none tabular-nums"
                  >
                    {ccCount}
                  </span>
                )}
              </span>
            </Toggle>
            <Toggle variant="outline" size="sm" pressed={bccShown} onPressedChange={setBccShown} className={OPTION_CHIP}>
              <span className="whitespace-nowrap">
                {t("fieldBcc")}
                {bccCount > 0 && (
                  <span
                    data-slot="compose-bcc-count"
                    aria-hidden="true"
                    className="ml-0.5 align-super text-xs leading-none tabular-nums"
                  >
                    {bccCount}
                  </span>
                )}
              </span>
            </Toggle>
            <Toggle
              variant="outline"
              size="sm"
              pressed={readReceipt}
              onPressedChange={setReadReceipt}
              title={t("readReceiptHint")}
              className={OPTION_CHIP}
            >
              {t("readReceipt")}
            </Toggle>
          </div>
        </div>

        {/* 发件人显示名（临时署名，2026-10-16 用户要求）：默认收起，由发件人行的 chip 展开
            ——与「抄送 / 密送」同一套语言（chip 展开对应行，行不藏内容）。
            ⚠ placeholder = 当前账号的发件人姓名：那正是「留空会怎样」的答案，不必再写一句说明
              （账号没有发件人姓名时为留白 = 只发地址，也正是它的默认行为）。 */}
        {fromNameShown && (
          <div className={HEADER_ROW} data-slot="compose-from-name-row">
            <FieldLabel htmlFor="mail-from-name" className={HEADER_LABEL}>
              {t("fieldFromName")}
            </FieldLabel>
            <Input
              id="mail-from-name"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder={accounts.find((a) => a.id === fromId)?.senderName ?? ""}
              className={BARE_CONTROL}
            />
          </div>
        )}

        {/* 收件人 */}
        <div className={HEADER_ROW}>
          <FieldLabel htmlFor="mail-to" className={HEADER_LABEL}>
            {t("fieldTo")}
          </FieldLabel>
          <RecipientInput
            id="mail-to"
            value={to}
            onValueChange={setTo}
            placeholder={t("fieldToPlaceholder")}
            own={own}
            normalize={normalizeAddr}
            className={BARE_CONTROL}
          />
        </div>

        {/* 抄送（默认收起） */}
        {ccShown && (
          <div className={HEADER_ROW} data-slot="compose-cc-row">
            <FieldLabel htmlFor="mail-cc" className={HEADER_LABEL}>
              {t("fieldCc")}
            </FieldLabel>
            <RecipientInput
              id="mail-cc"
              value={cc}
              onValueChange={setCc}
              own={own}
              placeholder={t("fieldCcPlaceholder")}
              normalize={normalizeAddr}
              className={BARE_CONTROL}
            />
          </div>
        )}

        {/* 密送（默认收起） */}
        {bccShown && (
          <div className={HEADER_ROW} data-slot="compose-bcc-row">
            <FieldLabel htmlFor="mail-bcc" className={HEADER_LABEL}>
              {t("fieldBcc")}
            </FieldLabel>
            <RecipientInput
              id="mail-bcc"
              value={bcc}
              onValueChange={setBcc}
              own={own}
              placeholder={t("fieldBccPlaceholder")}
              normalize={normalizeAddr}
              className={BARE_CONTROL}
            />
          </div>
        )}

        {/* 主题 */}
        <div className={HEADER_ROW}>
          <FieldLabel htmlFor="mail-subject" className={HEADER_LABEL}>
            {t("fieldSubject")}
          </FieldLabel>
          <Input
            id="mail-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("fieldSubjectPlaceholder")}
            className={BARE_CONTROL}
          />
        </div>
      </div>
      <Field className="lg:flex-1">
        {/* 「正文」行（2026-10-05 用户定稿）：标签在左，[添加附件] [发送] 靠最右——
            发送从此行操作，不再沉到表单底部（正文框填满剩余高度后底部没有位置了）。
            2026-10-29：中间加「分栏 / 编辑 / 预览」切换；宽屏默认分栏，窄屏默认编辑。 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldLabel htmlFor="mail-body">{t("fieldBody")}</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label={t("bodyModeLabel")}
              className="flex items-center gap-0.5 rounded-lg border border-border p-0.5"
            >
              <Toggle
                size="sm"
                pressed={bodyMode === "split"}
                onPressedChange={() => chooseBodyMode("split")}
                title={t("bodySplit")}
                aria-label={t("bodySplit")}
                className="hidden h-6 min-w-6 rounded-md px-1.5 text-xs aria-pressed:bg-muted lg:inline-flex"
              >
                <Columns2Icon />
                <span className="hidden sm:inline">{t("bodySplit")}</span>
              </Toggle>
              <Toggle
                size="sm"
                pressed={bodyMode === "write"}
                onPressedChange={() => chooseBodyMode("write")}
                title={t("bodyWrite")}
                aria-label={t("bodyWrite")}
                className="h-6 min-w-6 rounded-md px-1.5 text-xs aria-pressed:bg-muted"
              >
                <PencilLineIcon />
                <span className="hidden sm:inline">{t("bodyWrite")}</span>
              </Toggle>
              <Toggle
                size="sm"
                pressed={bodyMode === "preview"}
                onPressedChange={() => chooseBodyMode("preview")}
                title={t("bodyPreview")}
                aria-label={t("bodyPreview")}
                className="h-6 min-w-6 rounded-md px-1.5 text-xs aria-pressed:bg-muted"
              >
                <EyeIcon />
                <span className="hidden sm:inline">{t("bodyPreview")}</span>
              </Toggle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={sending}>
              <PaperclipIcon data-icon="default" />
              {t("addAttachment")}
            </Button>
            {/* 未选发件人时是灰按钮（2026-10-17 起裸「写邮件」不预选）：给一句悬浮说明，
                否则用户只看到一个哑巴灰按钮。
                ⚠ 尺寸与文案（2026-10-30）：原来写死 `min-w-28` 防「发送 ↔ 发送中…」横向跳，
                  结果两个字的「发送」被撑成 112px 的大色块，跟旁边 30px 的视图切换、
                  附件按钮摆一起非常突兀（用户：这按钮是不是太抽象了）。
                  现在**文案永远是「发送」**，发送中只把图标换成 spinner（再加 aria-label/
                  aria-busy 让读屏知道在发）——宽度天然不变、不会横跳，也不用为大色块
                  留空。改文案前先想清楚：按钮宽度是跟着最长文案走的。 */}
            <Button
              size="sm"
              onClick={send}
              disabled={sending || !fromId}
              title={!sending && !fromId ? senderTitle : undefined}
              aria-label={sending ? t("sending") : undefined}
              aria-busy={sending || undefined}
              className="px-3"
            >
              {sending ? <Spinner /> : <SendIcon data-icon="default" />}
              {t("send")}
            </Button>
          </div>
        </div>
        {/* 正文区（2026-10-29 换成 Markdown 编辑器）：
            - 宽屏默认左右分栏（编辑 | 预览），窄屏默认只显示编辑区，按钮可切到预览；
            - 高度契约沿用旧 textarea：`min-h-[25vh]` 保底 + 宽屏吃满剩余高度；
            - 焦点环画在外层容器（与输入框规范一致：ring-2 ring-ring/40，不改边框色）。
            ⚠ 描边用 **1px `border-border`**（2026-10-29 晚）：原来 `border-2 border-input`
              与上方表单头的 1px 外框、行分隔、选项 chip 排在一起时粗细不齐，整片界面像
              由好几套线条拼起来（用户报「边缘线条描边之间还是比较冲突」）。正文框是
              大块容器，1px 已足够把它从背景里分出来；聚焦仍靠光晕表达。
            ⚠ 外层不要 overflow-hidden 之外的花活：CodeMirror 自己管内部滚动。 */}
        <div
          data-slot="compose-body"
          className="flex min-h-[25vh] flex-col overflow-hidden rounded-xl border border-border bg-transparent transition-colors focus-within:ring-2 focus-within:ring-ring/40 dark:bg-input/30 lg:flex-1"
        >
          <div className={cn("grid min-h-0 flex-1", bodyMode === "split" && "lg:grid-cols-2")}>
            {bodyMode !== "preview" && (
              <MarkdownEditor
                id="mail-body"
                value={body}
                onChange={handleBodyChange}
                placeholder={t("fieldBodyPlaceholder")}
                ariaLabel={t("fieldBody")}
                className={cn(
                  "min-h-[25vh] lg:min-h-0",
                  bodyMode === "split" && "lg:border-r lg:border-border",
                )}
              />
            )}
            {bodyMode !== "write" && (
              <div
                data-slot="compose-preview"
                className={cn(
                  "min-h-[25vh] overflow-y-auto px-4 py-3 text-sm leading-relaxed",
                  bodyMode === "split" && "hidden lg:block",
                )}
              >
                {previewHtml ? (
                  <div
                    className="mail-body mail-markdown"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                ) : (
                  <p className="text-muted-foreground">{t("previewEmpty")}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </Field>

      {keptAttachments.length > 0 && (
        <p
          className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
          data-slot="draft-kept-attachments"
        >
          <PaperclipIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("draftKeptAttachments", { count: keptAttachments.length })}
        </p>
      )}
      {attachments.length > 0 && (
        <div className="flex shrink-0 flex-col gap-1.5" data-slot="compose-attachments">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{t("attachments", { count: attachments.length })}</span>
            <span className="tabular-nums">
              {fmtSize(attachments.reduce((sum, a) => sum + base64Bytes(a.contentBase64), 0))}
            </span>
          </div>
          <ul className="flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <li
                key={`${a.filename}-${i}`}
                className="flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/30 py-1 pl-2 pr-1 text-xs"
              >
                <PaperclipIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <button
                  type="button"
                  onClick={() => previewAttachment(a)}
                  title={t("previewAttachment")}
                  className="min-w-0 max-w-64 truncate text-left transition-colors hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                >
                  {a.filename}
                </button>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {fmtSize(base64Bytes(a.contentBase64))}
                </span>
                <button
                  type="button"
                  aria-label={t("removeAttachment")}
                  title={t("removeAttachment")}
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                >
                  <XIcon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 隐藏的取件 input：按钮已上移到「正文」行（2026-10-05 用户定稿） */}
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => addAttachments(e.target.files)}
      />
    </div>
  );
}
