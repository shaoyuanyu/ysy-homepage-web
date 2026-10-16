"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/mail/fetch-timeout";
import { OWNER_AUTH_CHANGED_EVENT, OWNER_CACHE_KEY } from "@/lib/auth/events";
import { UNREAD_BADGE_CLASS } from "@/components/mail/unread-color";
import { toast } from "@/components/ui/toast";

/**
 * 新邮件到达的全局提醒（2026-10-06 用户需求）。
 *
 * 两个协作组件 + 三个 window 事件（同页组件解耦）：
 * - `MailNewMailWatcher`（挂在 `Providers`，**全站**）：每 2 秒拉一次
 *   `/api/mail/accounts`（各账号未读总数，广播给角标）与 `/api/mail/health`
 *   （各账号 `lastNewMail`，判断有没有新邮件）；判定有新邮件 → toast 弹窗提醒
 *   （于是在写邮件页、博客等任何页面都能收到提醒）+ 广播 `mail:new-mail`；
 *   另盯每账号的 `lastSync`（同步轮次心跳）—— 前进即广播 `mail:synced`，
 *   给左栏列表当「别处动过邮件」的兜底刷新信号（2026-10-16）。
 * - `MailUnreadBadge`（/mail 的 h1 右上角）：订阅上述事件，显示未读总数，
 *   新邮件到达时播放一次「弹跳」动画（重挂载触发 CSS keyframes 重播）。
 *
 * ⚠ 游客**一个请求都不发**（2026-10-06 修复）：先用 localStorage 缓存
 *   （`OWNER_CACHE_KEY`，与首帧内联脚本/OwnerNavItem 同一份）判定身份，
 *   非站主直接不启动轮询；登录/登出由 `owner-auth-changed` 事件重启判定。
 *   **勿改回「先请求、收到 401 再停」**——那两个 401 会在游客浏览器的
 *   控制台留下 Failed to load resource 错误（E2E「页面无控制台错误」变红）。
 * ⚠ 轮询是**本机回环**请求（Next 路由 → webmaild），成本极低；2 秒一拍配合
 *   webmaild 的 5 秒同步节拍，新邮件通常数秒内弹提醒。
 *
 * ⚠ **「新邮件到达」的读屏播报通道就是这条 toast**：Base UI 的 viewport 是
 *   `role="region" aria-live="polite" aria-relevant="additions text"`，toast 插进去
 *   即播报（`app/[locale]/layout.tsx` 的 `<Toaster />` 是唯一一份，勿再挂第二个
 *   viewport——见 providers.tsx 的注释）。据此有三条红线：
 *   · **不要再自己加一个 sr-only live region**：同一句话会被念两遍；
 *   · **不要改成 `priority: "high"`**：那是 assertive，会打断用户正在听的内容，
 *     新邮件不值得（且高优先级会把可见的 toast 从无障碍树里摘掉）；
 *   · 页面不可见时先攒着、回到页面再弹（见 `onVisible`）：polite 播报在用户听不见的
 *     时候念完等于没念。视觉上等价——toast 的倒计时在窗口失焦时本来就暂停。
 */
export const MAIL_UNREAD_EVENT = "mail:unread";
export const MAIL_NEW_MAIL_EVENT = "mail:new-mail";
/**
 * 「服务端刚跑完一轮同步」（2026-10-16）。听众：左栏列表（`mail-client.tsx`）。
 *
 * 信号 = `/health` 每账号的 `lastSync` 前进。它是**同步轮次的心跳**（每轮结束才更新，
 * 真机 5s 配置下实测约 24s 一跳），不是「内容变了」的精确信号——它的用途是**兜底**：
 * 别处（手机、网页版、服务商端规则）动过邮件时本页一个事件都收不到，列表靠它在一轮
 * 同步内跟上，而不用等用户切回窗口或点刷新。
 * ⚠ 频率防御在**听众那侧**（`mail-client.tsx` 的 `SERVER_SYNC_REFRESH_MIN_MS` 节流）：
 *   不能假定这个信号「一定很慢」—— 后端实现变化（比如改成写请求时刻）会让它每拍都动。
 */
export const MAIL_SYNCED_EVENT = "mail:synced";

/** 轮询间隔（2 秒；配合 webmaild 的 5 秒同步节拍） */
const POLL_MS = 2_000;

/** 是否已知为站主：读与首帧内联脚本、OwnerNavItem 同一份 localStorage 缓存 */
const isKnownOwner = () => {
  try {
    return window.localStorage.getItem(OWNER_CACHE_KEY) === "1";
  } catch {
    return false; // localStorage 不可用（隐私模式等）：按游客处理，宁可不轮询
  }
};

/**
 * 「真·新邮件」信号 = webmaild /health 的每账号 `lastNewMail`（同步时**收件箱里
 * 增量抓进新邮件**才推进的时刻，判据见 webmail 包 `src/api.ts` 的 `doRunSync`）。
 *
 * ⚠ 勿改回「未读总数上升就提示」——未读总数会因为**任何**未读操作上升，最典型的是
 * 用户自己点「标为未读」（列表行内与详情页都有），于是每标一次就弹一条假的
 * 「收到 N 封新邮件」（2026-10-06 用户实测时页面上叠了三条假提醒）。
 * ⚠ 也不要改成「非收件箱也算」或「用户自己搬动的信也算」——发信留底、草稿镜像、
 *   「标为垃圾」搬进垃圾夹、「移出垃圾」与撤销搬回收件箱，在同步器眼里都是「一个
 *   文件夹里出现了新副本」（MOVE 之后目标文件夹给的是新 UID），照着弹就是在
 *   替用户自己的动作播报「收到新邮件」（2026-10-11 用户报障）。
 */
interface HealthAccount {
  id: string;
  enabled: boolean;
  lastNewMail: string | null;
  /** 最近一次同步的时刻（每轮同步结束才前进）——「服务端刚跑完一轮」的信号，见 MAIL_SYNCED_EVENT */
  lastSync?: string | null;
}
interface HealthResponse {
  ok: boolean;
  accounts: HealthAccount[];
}

export function MailNewMailWatcher() {
  const t = useTranslations("mail");

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    /** 上次的未读基线：null = 尚未建立（首次拉取只做基线，不提示）；只用于提醒文案里的封数 */
    let lastTotal: number | null = null;
    /** 各账号上次看到的 lastNewMail（真·新邮件信号；首轮只建基线不提示） */
    let lastNewMailSeen: Map<string, string | null> | null = null;
    /** 各账号上次看到的 lastSync（同步轮次心跳；首轮只建基线不广播，见 MAIL_SYNCED_EVENT） */
    let lastSyncSeen: Map<string, string | null> | null = null;
    /** 页面不可见期间攒下的新邮件封数（回到页面再弹一次，见 onVisible） */
    let pendingDelta: number | null = null;

    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };

    /** 弹提醒——**同时就是读屏播报**（见文件头 ⚠），所以它只在这一处发 */
    const announce = (delta: number) => {
      window.dispatchEvent(new CustomEvent(MAIL_NEW_MAIL_EVENT, { detail: { delta } }));
      toast.add({ title: t("newMailToast", { count: delta }), type: "info" });
    };

    const poll = async () => {
      if (disposed) return;
      // 游客不发请求（见文件头 ⚠）：宁可不轮询，也不留 401 控制台错误
      if (!isKnownOwner()) return;
      let data: unknown;
      let health: HealthResponse | null = null;
      try {
        // /accounts = 未读总数（角标）；/health =「真·新邮件」信号（见上方注释）。
        // health 失败不影响未读广播（角标仍要更新），只是本轮不做新邮件判定。
        const [accountsRes, healthRes] = await Promise.all([
          fetchWithTimeout("/api/mail/accounts", { cache: "no-store" }),
          fetchWithTimeout("/api/mail/health", { cache: "no-store" }).catch(() => null),
        ]);
        if (disposed) return;
        // 游客 / 会话过期：停止轮询（登录后由 auth 事件重启）
        if (accountsRes.status === 401) {
          clearTimer();
          return;
        }
        if (!accountsRes.ok) return; // 服务暂不可用：静默，下轮再试
        data = await accountsRes.json();
        if (healthRes?.ok) health = (await healthRes.json()) as HealthResponse;
      } catch {
        return; // 网络失败：静默，下轮再试
      }
      if (disposed) return;
      const total = (Array.isArray(data) ? data : [])
        .filter((a) => (a as { enabled?: boolean }).enabled !== false)
        .reduce((sum, a) => sum + ((a as { unread?: number }).unread ?? 0), 0);

      window.dispatchEvent(new CustomEvent(MAIL_UNREAD_EVENT, { detail: { total } }));

      if (health) {
        const nextSeen = new Map<string, string | null>();
        const nextSync = new Map<string, string | null>();
        let advanced = false;
        let synced = false;
        for (const a of health.accounts ?? []) {
          if (a.enabled === false) continue;
          nextSeen.set(a.id, a.lastNewMail ?? null);
          nextSync.set(a.id, a.lastSync ?? null);
          const prev = lastNewMailSeen?.get(a.id);
          // 只在两边都有时间戳、且严格前进时才判定（null → 时间的首次建立不算）
          if (prev && a.lastNewMail && a.lastNewMail > prev) advanced = true;
          const prevSync = lastSyncSeen?.get(a.id);
          if (prevSync && a.lastSync && a.lastSync > prevSync) synced = true;
        }
        const hadBaseline = lastNewMailSeen !== null; // 首轮只建基线不提示
        const hadSyncBaseline = lastSyncSeen !== null;
        lastNewMailSeen = nextSeen;
        lastSyncSeen = nextSync;
        // 服务端刚跑完一轮同步：广播给左栏列表做兜底重取（见 MAIL_SYNCED_EVENT 的注释）
        if (hadSyncBaseline && synced) window.dispatchEvent(new Event(MAIL_SYNCED_EVENT));
        if (hadBaseline && advanced) {
          const delta = lastTotal !== null && total > lastTotal ? total - lastTotal : 1;
          // 页面不可见（用户在别的标签页）时先攒着：polite 播报只有用户听得见才有意义，
          // 回到页面那一刻再弹一次——见 onVisible 与文件头 ⚠
          if (document.visibilityState === "visible") announce(delta);
          else pendingDelta = (pendingDelta ?? 0) + delta;
        }
      }
      lastTotal = total;
    };

    const start = () => {
      clearTimer();
      if (!isKnownOwner()) return; // 游客：连轮询都不启动（登录后由 auth 事件重启）
      void poll();
      timer = window.setInterval(() => void poll(), POLL_MS);
    };

    start();
    // 切回标签页立即重取（用户回来第一眼就看到最新未读，不用等下个轮询周期；
    // E2E 也借它触发「模拟新邮件到达 → 提醒」的时序）
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // 攒下的新邮件：回到页面的这一刻才弹（顺带完成读屏播报）
      if (pendingDelta !== null) {
        const delta = pendingDelta;
        pendingDelta = null;
        announce(delta);
      }
      void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    // 登录 / 登出后重新判定（游客期间停掉的轮询在登录后必须复活）
    const onAuth = () => {
      lastTotal = null; // 重建基线（登录后首次拉取不误报）
      pendingDelta = null; // 换身份后不把上一个身份的提醒带过来
      lastSyncSeen = null; // 同步心跳基线同样重建（否则登录后第一轮被当成「刚同步完」）
      start();
    };
    window.addEventListener(OWNER_AUTH_CHANGED_EVENT, onAuth);
    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(OWNER_AUTH_CHANGED_EVENT, onAuth);
    };
  }, [t]);

  return null;
}

/**
 * `/mail` 大标题右上角的未读角标（上标形态）。数据 = `mail:unread` 事件的未读总数
 * （watcher 轮询 / MailClient 读信后的广播都会更新它）；0 或未知时不渲染。
 * 新邮件（`mail:new-mail`）到达时重挂载一次元素，让 CSS 弹跳动画重播
 * （动画本身在 globals.css 的 `.mail-unread-pop`）。
 */
export function MailUnreadBadge() {
  const t = useTranslations("mail");
  const [total, setTotal] = useState<number | null>(null);
  const [popKey, setPopKey] = useState(0);

  useEffect(() => {
    const onUnread = (e: Event) => {
      const value = (e as CustomEvent<{ total?: unknown }>).detail?.total;
      if (typeof value === "number") setTotal(value);
    };
    const onNewMail = () => setPopKey((k) => k + 1);
    window.addEventListener(MAIL_UNREAD_EVENT, onUnread);
    window.addEventListener(MAIL_NEW_MAIL_EVENT, onNewMail);
    return () => {
      window.removeEventListener(MAIL_UNREAD_EVENT, onUnread);
      window.removeEventListener(MAIL_NEW_MAIL_EVENT, onNewMail);
    };
  }, []);

  if (total === null || total <= 0) return null;
  return (
    <span
      key={popKey}
      data-slot="mail-unread-count"
      aria-label={t("unreadBadge", { count: total })}
      className={cn(
        "ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 align-super text-xs font-medium tabular-nums",
        UNREAD_BADGE_CLASS,
        popKey > 0 && "mail-unread-pop",
      )}
    >
      {total}
    </span>
  );
}
