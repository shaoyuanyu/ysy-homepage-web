/**
 * 邮件模块的跨组件事件名（2026-10-17 从各自组件里抽出来）。
 *
 * 为什么集中：这些事件现在有多个「跨页面」的听众——详情页要听发信成功、顶栏邮箱
 * 圆点要听未读总数、`useOwnAddresses` 要听账号变更。事件名留在组件文件里会逼着
 * `lib/` 反过来 import `components/`（层级倒挂），也让「只想要一个字符串」的模块
 * 把整个写信页 / 账号弹窗打进自己的 chunk。值本身一个都不能改：它们是浏览器里
 * 运行时的事件契约（E2E 也直接派发这些字符串）。
 */

/** 未读总数变化（watcher 每 2 秒轮询 / MailClient 读信后广播） */
export const MAIL_UNREAD_EVENT = "mail:unread";

/** 收件箱真的进了新邮件（判据见 `new-mail-notifier.tsx` 文件头） */
export const MAIL_NEW_MAIL_EVENT = "mail:new-mail";

/** 服务端刚跑完一轮同步（`lastSync` 心跳，列表兜底刷新用） */
export const MAIL_SYNCED_EVENT = "mail:synced";

/** 发信成功（写信页 / 快速回复）：左栏列表多出留底 */
export const MAIL_SENT_EVENT = "mail:sent";

/** 草稿变更（写信页自动保存 / 发送后删除 / 草稿箱删除）：草稿列表刷新 */
export const MAIL_DRAFTS_CHANGED_EVENT = "mail:drafts-changed";

/** 写信页的发件人变化（2026-10-29）：左栏联系人面板据此只显示该账号的联系人。
 *  detail = 账号 id；空串 = 未选发件人（回到「全部联系人」） */
export const MAIL_COMPOSE_SENDER_EVENT = "mail:compose-sender";

/** 账号增删改（账号管理弹窗）：列表、顶栏、自己的地址集合等随之刷新 */
export const MAIL_ACCOUNTS_CHANGED_EVENT = "mail-accounts-changed";
