"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarPlusIcon, CalendarX2Icon } from "lucide-react";

import { attachmentUrl } from "@/components/mail/attachment-preview";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { isCalendarAttachment } from "@/lib/mail/attachment";
import { fetchWithTimeout } from "@/lib/mail/fetch-timeout";
import { formatDateTime } from "@/lib/mail/format";
import type { MailAttachmentMeta } from "@/lib/mail/types";
import { parseIcsText, type ParsedIcsAppointment } from "@/lib/ical";

/**
 * 收件箱里的日历邀请 → 「加入日历」（2026-10-10）。
 *
 * 能力全部是现成的，这里只做接线：`lib/ical.ts` 已有解析（`parseIcsText`），
 * `POST /api/calendar/events`（本次新增）把原文写进站主的 CalDAV 集合。
 *
 * ⚠ **原样写回**（只摘掉 `METHOD`），不解析重建：邀请里带着 RRULE（重复会议）、
 *   VALARM（提醒）、时区、全天日期这些本站 `buildIcsText` 表达不了的东西，
 *   重建就会静默丢掉它们。解析只用于**展示**（给用户看清楚要加的是什么）。
 * ⚠ 解析失败不影响「加入」：拿不到名称/时间就只显示文件名，按钮照旧可用
 *   （发信人写的 ics 什么样子都可能，不该因此挡住用户）。
 */

/** 单个附件的解析结果 */
type Invite = {
  attachment: MailAttachmentMeta;
  /** 原文（加入时原样上传） */
  ics: string;
  /** 第一个 VEVENT 的解析结果；null = 解析失败（仍可加入） */
  parsed: ParsedIcsAppointment | null;
};

/** 取 ics 原文要连一次邮箱（推迟的附件尤其慢），给宽上限 */
const INVITE_TIMEOUT_MS = 60_000;

/** 订阅里的时间文案：UTC / 浮时 / 全天三种写法（与 /calendar 页同一套语义） */
function inviteWhen(ev: ParsedIcsAppointment, locale: string): string {
  if (ev.allDayDate) return ev.allDayDate;
  if (ev.startUtc !== null) {
    const start = formatDateTime(new Date(ev.startUtc).toISOString(), locale);
    if (ev.endUtc !== null && ev.endUtc !== ev.startUtc) {
      return `${start} – ${formatDateTime(new Date(ev.endUtc).toISOString(), locale)}`;
    }
    return start;
  }
  if (ev.floatingStart) return ev.floatingStart.replace("T", " ");
  return "";
}

export function CalendarInviteSection({
  messageId,
  attachments,
}: {
  messageId: string;
  attachments: MailAttachmentMeta[];
}) {
  const t = useTranslations("mail");
  const localeTag = t("localeTag");
  const [invites, setInvites] = useState<Invite[]>([]);
  /** 正在加入的附件序号（null = 空闲） */
  const [adding, setAdding] = useState<number | null>(null);

  const calendarAttachments = attachments.filter(isCalendarAttachment);

  // 取原文并解析（只用于展示）。换一封信时全部重来。
  useEffect(() => {
    if (calendarAttachments.length === 0) {
      setInvites([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const loaded: Invite[] = [];
      for (const a of calendarAttachments) {
        try {
          const res = await fetchWithTimeout(attachmentUrl(messageId, a.index), undefined, INVITE_TIMEOUT_MS);
          if (!res.ok) throw new Error(`${res.status}`);
          const ics = await res.text();
          let parsed: ParsedIcsAppointment | null = null;
          try {
            parsed = parseIcsText(ics)[0] ?? null;
          } catch {
            // 解析失败：只影响展示，不影响「加入」
          }
          loaded.push({ attachment: a, ics, parsed });
        } catch {
          // 取不到原文：这一条不给按钮（点了也注定失败），也不弹错误——
          // 用户未必想加这个邀请，不该因为读不到就挨一条报错
        }
      }
      if (!cancelled) setInvites(loaded);
    })();
    return () => {
      cancelled = true;
    };
    // calendarAttachments 每次渲染都是新数组，故按「内容签名」依赖（附件序号 + 文件名）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, calendarAttachments.map((a) => `${a.index}:${a.filename}`).join("|")]);

  const addToCalendar = useCallback(
    async (invite: Invite) => {
      setAdding(invite.attachment.index);
      try {
        const res = await fetch("/api/calendar/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ics: invite.ics }),
        });
        if (res.status === 409) {
          toast.add({ title: t("inviteExists") });
          return;
        }
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? `${res.status}`);
        }
        toast.add({
          title: t("inviteAdded"),
          description: invite.parsed?.summary || invite.attachment.filename,
          type: "success",
        });
      } catch (err) {
        toast.add({
          title: t("inviteAddFailed"),
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        });
      } finally {
        setAdding(null);
      }
    },
    [t],
  );

  if (invites.length === 0) return null;

  return (
    <section data-slot="mail-calendar-invite" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">{t("calendarInvite")}</h2>
      <ul className="flex flex-col gap-2">
        {invites.map((invite) => {
          const when = invite.parsed ? inviteWhen(invite.parsed, localeTag) : "";
          const title = invite.parsed?.summary?.trim();
          return (
            <li
              key={invite.attachment.index}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border p-3 text-sm"
            >
              <CalendarX2Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {title || invite.attachment.filename}
                </span>
                {(when || invite.parsed?.location) && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {[when, invite.parsed?.location].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              <Button
                data-slot="mail-invite-add"
                variant="outline"
                size="sm"
                disabled={adding !== null}
                onClick={() => void addToCalendar(invite)}
              >
                {adding === invite.attachment.index ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <CalendarPlusIcon data-icon="default" />
                )}
                {t("inviteAdd")}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
