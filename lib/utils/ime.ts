/**
 * 输入法（IME）组字判定：组字中的按键不能当作页面快捷键。
 *
 * 为什么需要：中文/日文/韩文输入法在**候选词窗口**里按 Enter 是「确认候选词」，
 * 但浏览器仍会把这次 Enter 派发到页面的 keydown 处理器。速记页因此会在用户
 * 打到一半时触发「回车保存」，把未完成的拼音串存成一条速记（2026-11-27 用户报障）。
 *
 * 两条判据缺一不可：
 * 1. `isComposing` —— 组字期间的按键。Chrome / Edge / Firefox 都会置 true。
 * 2. `keyCode === 229`（VK_PROCESSKEY）—— Safari 的 `compositionend` **早于**
 *    这次 Enter 的 keydown，等事件到达页面时 `isComposing` 已经变回 false，
 *    只剩 229 能识别「这个键属于输入法」。
 *
 * 命中时调用方直接 `return`，**不要 `preventDefault()`**：让输入法自己吃掉这个键，
 * 页面不应有任何副作用（保存、提交、关闭编辑态都算副作用）。
 *
 * @param event 原生 KeyboardEvent（React 中传 `event.nativeEvent`）
 */
export function isImeComposing(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}
