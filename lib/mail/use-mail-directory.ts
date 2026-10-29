"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchWithTimeout } from "@/lib/mail/fetch-timeout";
import type { MailContact, MailKnownSender } from "@/lib/mail/types";

/**
 * 写信页的「名字簿」：已保存联系人 + 自动收录的往来对象（2026-10-29）。
 *
 * 起因：收件人 / 抄送里只有邮箱地址（用户：「收件人、抄送人不显示备注名」）。
 * 联系人面板本来就会拉这两份数据，写信页为了把裸邮箱补成 `名字 <邮箱>` 需要同一份，
 * 所以收敛到这里：
 * - 两个组件同时挂载时共享同一个 in-flight Promise（只发一轮请求）；
 * - 15 秒短缓存：通讯录编辑页在另一个路由，回到写信页时大概率已过期，会重新拉，
 *   但同一封信的写-发期间（面板 + 发件人变化触发的事件）不会反复请求；
 * - **只用于显示**：发送仍然剥离成裸地址（webmaild 只接受裸地址，见 address.ts）。
 *
 * ⚠ 失败一律降级成空数组（写信功能不因名字簿失败而不可用），与联系人面板旧行为一致。
 */
export interface MailDirectory {
  contacts: MailContact[];
  known: MailKnownSender[];
}

const CACHE_TTL_MS = 15_000;
let cached: { at: number; data: MailDirectory } | null = null;
let inflight: Promise<MailDirectory> | null = null;

async function fetchItems<T>(url: string): Promise<T[]> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: T[] } | T[];
    return Array.isArray(data) ? data : (data.items ?? []);
  } catch {
    return [];
  }
}

function loadDirectory(): Promise<MailDirectory> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return Promise.resolve(cached.data);
  if (!inflight) {
    inflight = (async () => {
      const [contacts, known] = await Promise.all([
        fetchItems<MailContact>("/api/mail/contacts"),
        fetchItems<MailKnownSender>("/api/mail/contacts/known?limit=200"),
      ]);
      const data: MailDirectory = { contacts, known };
      cached = { at: Date.now(), data };
      return data;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export function useMailDirectory(): {
  /** null = 还没到货；两种数据各自独立，先到的那份可以先渲染 */
  contacts: MailContact[] | null;
  known: MailKnownSender[] | null;
  ready: boolean;
  /** 地址（大小写不敏感）→ 备注名；没有名字返回空串。已保存联系人优先于自动收录 */
  nameOf: (email: string) => string;
} {
  const [data, setData] = useState<MailDirectory | null>(cached?.data ?? null);

  useEffect(() => {
    let cancelled = false;
    void loadDirectory().then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    const put = (email: string, name: string) => {
      const n = name.trim();
      const key = email.trim().toLowerCase();
      // 名字为空、或名字其实就是地址（部分服务商 envelope 会这么给）→ 不当作备注名，
      // 否则收件人会显示成 `a@b <a@b>`
      if (!n || !key || n.toLowerCase() === key) return;
      map.set(key, n);
    };
    // 先放自动收录，再放已保存联系人（后者覆盖前者）：用户手写的备注名优先
    for (const k of data?.known ?? []) put(k.email, k.name);
    for (const c of data?.contacts ?? []) put(c.email, c.name);
    return map;
  }, [data]);

  const nameOf = useCallback(
    (email: string) => names.get(email.trim().toLowerCase()) ?? "",
    [names],
  );

  return {
    contacts: data?.contacts ?? null,
    known: data?.known ?? null,
    ready: data !== null,
    nameOf,
  };
}
