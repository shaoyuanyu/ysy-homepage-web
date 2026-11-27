/**
 * 阅读状态的 UI 允许值。
 *
 * ⚠ **以 paperdb 服务端 enum 为准**（`paperdb/db/models.py` 的 `ReadingStatus`）：
 * `unread / queued / reading / read / skimmed` 五档。`reviewed`（已精读）与
 * `archived`（归档）**不是**阅读状态，请求会返回 422 `unsupported reading status`
 * （2026-11-26 实测）。归档是独立的 `state.archived` 布尔值。
 * 控件必须用这个常量拼选项，不要按 `ReadingStatus` 类型直接拼。
 */
export const READING_STATUSES = ["unread", "queued", "reading", "read", "skimmed"] as const;

/** paperdb `PaperKind` 的 UI 选项。⚠ 后端没有 `book`（只有 `book_chapter`）。 */
export const PAPER_KINDS = [
  "conference",
  "journal",
  "preprint",
  "thesis",
  "book_chapter",
  "tech_report",
] as const;
