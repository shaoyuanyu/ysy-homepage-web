"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { toast } from "@/components/ui/toast";
import { OWNER_AUTH_CHANGED_EVENT } from "@/lib/auth/events";
import {
  PREFERENCE_KEYS,
  sanitizePreference,
} from "@/lib/preferences/registry";

export type OwnerPreferences = Record<string, unknown>;

/** 偏好变更广播事件：同一页面多个 hook 实例（如设置弹窗与主视图）间同步 */
export const OWNER_PREFS_CHANGED_EVENT = "owner-prefs-changed";

/**
 * 主人偏好 hook：登录时偏好存服务器（跨设备同步），游客回退 localStorage。
 *
 * 约定（新功能接入方式）：
 * 1. 在 lib/preferences/registry.ts 注册 key + sanitize 函数；
 * 2. 本 hook 内部以 key 为 localStorage 键名（与既有 ccf:filters 一致）；
 * 3. 登录后若服务器缺失某 key 而 localStorage 有，自动迁移一次并上传。
 *
 * 返回：
 * - ready：登录态与偏好已加载完成（恢复 UI 状态前应等待）
 * - isOwner：当前是否登录
 * - prefs：全部已知偏好（owner 来自服务器 / 游客来自 localStorage）
 * - setPref(key, value)：更新偏好（owner 防抖 PATCH 服务器，游客写 localStorage）
 *
 * 限制：单用户低并发；owner 会话内不轮询，跨设备需刷新页面感知。
 */
export function useOwnerPreferences() {
  const t = useTranslations("misc");
  const [ready, setReady] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [prefs, setPrefs] = useState<OwnerPreferences>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 待提交的偏好批次（2026-10-17 审计）：旧实现只有一个 500ms 定时器，
   * 500ms 内改了**两个不同的 key** 时定时器会被重置，只剩最后一个发出去——
   * 前一个看起来生效了，刷新后却回到旧值。现在每次改动写进同一批次，一次 PATCH 全带上。
   */
  const pendingSave = useRef<OwnerPreferences>({});
  /** 卸载时也要把防抖窗口里的改动发出去（组件没了，响应里的 setPrefs 是空操作） */
  const flushRef = useRef<() => void>(() => {});

  // 监听其他 hook 实例的偏好变更（如设置弹窗切换后主视图实时生效）
  useEffect(() => {
    const onChanged = (e: Event) => {
      const { key, value } = (e as CustomEvent).detail as {
        key: string;
        value: unknown;
      };
      setPrefs((prev) => ({ ...prev, [key]: value }));
    };
    window.addEventListener(OWNER_PREFS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(OWNER_PREFS_CHANGED_EVENT, onChanged);
  }, []);

  // 加载偏好：挂载 + 登录态变化（登录/登出）时重新加载
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setReady(false);

      // 1. 确认登录态
      let owner = false;
      try {
        const r = await fetch("/api/auth/me");
        const data = (await r.json().catch(() => null)) as
          | { owner?: boolean }
          | null;
        owner = data?.owner === true;
      } catch {
        // 网络异常按游客处理
      }
      if (cancelled) return;
      setIsOwner(owner);

      if (owner) {
        // 2a. 主人：从服务器加载；同时把 localStorage 里服务器缺失的
        //     已知偏好迁移上传一次（游客期间的选择登录后不丢）
        let server: OwnerPreferences = {};
        try {
          const r = await fetch("/api/preferences");
          const data = (await r.json().catch(() => null)) as
            | { preferences?: OwnerPreferences }
            | null;
          if (cancelled) return;
          server = data?.preferences ?? {};
        } catch {
          // 网络异常：按无服务器偏好处理（后续写入仍会尝试）
        }
        if (cancelled) return;
        setPrefs(server);

        const migration: OwnerPreferences = {};
        for (const key of Object.values(PREFERENCE_KEYS)) {
          if (server[key] !== undefined) continue;
          const local = readLocal(key);
          if (local !== null) {
            const clean = sanitizePreference(key, local);
            if (clean !== null) migration[key] = clean;
          }
        }
        if (Object.keys(migration).length > 0) {
          try {
            const r = await fetch("/api/preferences", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(migration),
            });
            const data = (await r.json().catch(() => null)) as
              | { preferences?: OwnerPreferences }
              | null;
            if (!cancelled && data?.preferences) setPrefs(data.preferences);
          } catch {
            // 迁移失败不阻塞：服务器下次写入时自然带上
          }
        }
      } else {
        // 2b. 游客：从 localStorage 恢复全部已知偏好（结构清洗后）
        const local: OwnerPreferences = {};
        for (const key of Object.values(PREFERENCE_KEYS)) {
          const raw = readLocal(key);
          if (raw !== null) {
            const clean = sanitizePreference(key, raw);
            if (clean !== null) local[key] = clean;
          }
        }
        if (!cancelled) setPrefs(local);
      }
      if (!cancelled) setReady(true);
    };

    load();
    window.addEventListener(OWNER_AUTH_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(OWNER_AUTH_CHANGED_EVENT, load);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      // 防抖窗口内卸载（切页 / 关弹窗）：把还没发出去的偏好发掉，不然这次设置白改
      flushRef.current();
    };
  }, []);

  /** 更新偏好：立即生效（乐观更新）；owner 防抖 500ms 提交服务器 */
  const setPref = useCallback(
    (key: string, value: unknown) => {
      const clean = sanitizePreference(key, value);
      if (clean === null) return; // 结构非法：静默丢弃
      setPrefs((prev) => ({ ...prev, [key]: clean }));
      // 广播给同页面的其他 hook 实例（主视图无需刷新即感知设置变更）
      window.dispatchEvent(
        new CustomEvent(OWNER_PREFS_CHANGED_EVENT, {
          detail: { key, value: clean },
        }),
      );

      if (isOwner) {
        pendingSave.current[key] = clean;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null;
          flushRef.current();
        }, 500);
      } else {
        writeLocal(key, clean);
      }
    },
    [isOwner],
  );

  /**
   * 提交待保存的偏好（一次 PATCH 带上这一批的所有 key）。
   * - 成功：若请求期间没有新改动，用服务端返回的完整偏好回填（否则以本地为准）；
   * - 失败：这批合并回待提交（**不覆盖**请求期间更新的同 key），并明确提示
   *   ——旧实现 `.catch(() => {})` 静默，用户以为保存了，刷新后才失去设置。
   */
  const flushPrefs = useCallback(() => {
    const batch = pendingSave.current;
    pendingSave.current = {};
    if (Object.keys(batch).length === 0) return;
    fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return (await r.json().catch(() => null)) as { preferences?: OwnerPreferences } | null;
      })
      .then((data) => {
        // 请求期间用户又改了别的（或同一个）key：不能用这次响应覆盖本地
        if (Object.keys(pendingSave.current).length > 0) return;
        if (data?.preferences) setPrefs(data.preferences);
      })
      .catch(() => {
        pendingSave.current = { ...batch, ...pendingSave.current };
        toast.add({ title: t("preferenceSaveFailed"), type: "error" });
      });
  }, [t]);
  flushRef.current = flushPrefs;

  return { ready, isOwner, prefs, setPref };
}

function readLocal(key: string): unknown | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null; // 隐私模式 / 数据损坏
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 写入失败静默（隐私模式等）
  }
}
