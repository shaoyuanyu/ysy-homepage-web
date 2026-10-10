import { NextResponse } from "next/server";

import { isOwner } from "@/lib/auth/owner";
import { invalidateCalendarCache } from "@/lib/caldav/cache";
import { CALDAV_COLLECTION_NAME, getCalDavConfig } from "@/lib/caldav/store";
import { getIcsProperty, upsertIcsProperty } from "@/lib/ical";

/**
 * POST /api/calendar/events —— 把邮件里的日历邀请写进站主 CalDAV 日历（主人专属）。
 *
 * body `{ ics: string }`（邮件附件的**原文**）。
 *
 * 为什么直接写原文而不是解析重建：邀请里带着重复规则（RRULE）、提醒（VALARM）、
 * 时区、全天日期这些东西，本站的 `buildIcsText` 表达不了，重建就会把它们**静默丢掉**
 * ——用户加进日历的会议从此不提醒、不再重复。解析（`parseIcsText`）只在**前端**用于
 * 展示「要加的是哪个会」，与写入无关。
 *
 * 只做两件改写：
 *   1. 删掉 `METHOD`（邀请是 `METHOD:REQUEST`；留着会让自己的日历里出现一条
 *      「待回复的邀请」，而不是一个普通日程）；
 *   2. 文件名取 `UID`（Radicale 以 UID 命名资源，同 UID 再次上传就能被识别为「已存在」）。
 *
 * 幂等：`If-None-Match: *` 让已存在的 UID 返回 412 → 这里转成 409「已在日历里」，
 * 前端据此给一句「这个邀请已经在日历里了」而不是报错。
 */

/** 原文大小上限（邀请正常只有几 KB；拦下畸形/恶意的大文件） */
const MAX_ICS_BYTES = 256 * 1024;

/** Radicale 以 UID 作文件名，故限制字符集（与 events/[uid] 的校验同一套） */
const UID_RE = /^[A-Za-z0-9._@+-]+$/;

export async function POST(req: Request) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { ics?: unknown } | null;
  if (!body || typeof body.ics !== "string" || body.ics.trim().length === 0) {
    return NextResponse.json({ error: "参数不合法" }, { status: 400 });
  }
  if (Buffer.byteLength(body.ics, "utf8") > MAX_ICS_BYTES) {
    return NextResponse.json({ error: "邀请文件过大" }, { status: 400 });
  }

  const raw = body.ics;
  if (!/^BEGIN:VCALENDAR/m.test(raw) || !/^BEGIN:VEVENT/m.test(raw)) {
    return NextResponse.json({ error: "不是日历邀请" }, { status: 400 });
  }

  const uid = getIcsProperty(raw, "UID");
  if (!uid || !UID_RE.test(uid)) {
    return NextResponse.json({ error: "邀请缺少可用的 UID" }, { status: 400 });
  }

  const cfg = getCalDavConfig();
  if (!cfg) {
    return NextResponse.json({ error: "CalDAV 服务未配置" }, { status: 503 });
  }

  // 摘掉 METHOD（其余属性一行不动——见文件头的说明）
  const ics = upsertIcsProperty(raw, "METHOD", null);

  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = `${base}/${encodeURIComponent(cfg.user)}/${CALDAV_COLLECTION_NAME}/${encodeURIComponent(uid)}.ics`;
  const auth = `Basic ${Buffer.from(`${cfg.user}:${cfg.password}`).toString("base64")}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: auth,
        "Content-Type": "text/calendar; charset=utf-8",
        // 只在资源不存在时创建：同 UID 已存在 → 412（Radicale），对应下面的 409
        "If-None-Match": "*",
      },
      body: ics,
    });
  } catch (err) {
    console.error("[calendar/events] CalDAV 连接失败", err);
    return NextResponse.json({ error: "无法连接 CalDAV 服务，请稍后再试" }, { status: 502 });
  }

  if (res.status === 412) {
    return NextResponse.json({ error: "该日程已在日历中" }, { status: 409 });
  }
  if (!res.ok) {
    console.error("[calendar/events] PUT failed", res.status, await res.text().catch(() => ""));
    return NextResponse.json({ error: `CalDAV 写入失败 (HTTP ${res.status})` }, { status: 502 });
  }

  // 日历页的 GET 有内存缓存：不清掉的话刷新日历看不到刚加的这条
  invalidateCalendarCache();
  return NextResponse.json({ ok: true, uid });
}
