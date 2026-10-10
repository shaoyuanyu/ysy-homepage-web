/**
 * 邮件**读路径**的统一超时闸门（2026-10-10 第十二轮）。
 *
 * 起因（边界取证）：webmaild 进程还在、但请求卡住不返回时（TCP 通、服务半死），列表请求
 * 永远挂着 → 列表区永远停在骨架屏、底栏永远「正在检查同步状态…」，**没有任何超时兜底**。
 * 浏览器 fetch 默认不超时，代理层也没有超时，于是用户看到的是无限闪烁。
 *
 * 与写路径的区别：写操作（标已读 / 删除 / 发送）由用户主动触发、各自有 toast 兜底，
 * 慢一点也不会把界面钉在「加载中」；只有读路径会把界面钉住，故只给读路径加闸门。
 * 超时后抛 `Error("timeout")`——`mailErrorKind()` 把 timeout 归到 unreachable 一档，
 * 界面文案与「服务不可用」一致（用户视角两者没有区别：都读不出来）。
 */
export const MAIL_READ_TIMEOUT_MS = 20_000;

export async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  timeoutMs: number = MAIL_READ_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    // 是我们自己掐断的 → 报「超时」，而不是把 AbortError 原样抛给界面（那串英文用户看不懂）
    if (controller.signal.aborted) throw new Error("timeout");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
