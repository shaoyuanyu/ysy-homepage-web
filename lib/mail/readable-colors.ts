/**
 * 深色主题下的「邮件正文可读性归一」（2026-11-05）。
 *
 * ## 问题
 * HTML 邮件是按**白纸**设计的：发件人常把正文写成 `style="color:#333"` /
 * `<font color="#333">` 却不画背景（默认透明），另一些把背景写在 `<body>` 上——
 * 而 webmaild 的 sanitize 白名单不含 `body`，这个背景会被丢掉（见
 * `webmail/src/render.ts` 的 ALLOWED_TAGS）。浅色主题下这些邮件没问题；
 * 深色主题下正文容器是近黑底，深色文字直接变成「黑底黑字」，整封信看不见。
 * 反方向也有：邮件自己画了白底、文字却沿用主题的前景色（深色主题下近白），
 * 或者我们的 `a { color: var(--primary) }` / `blockquote { color: var(--muted-foreground) }`
 * 把深色主题的浅色文字带进白底块里——同样是白底白字。
 *
 * ## 做法
 * 只修**会被背景吃掉**的文字，不动发件人的版式：
 *  1. 沿祖先链向上找到第一个不透明背景（半透明层按 alpha 逐层合成，与 E2E
 *     对比度用例同一套算法）；祖先链上有背景图（渐变）时无法判断，跳过。
 *  2. 用 WCAG 相对亮度算「文字（与透明 alpha 合成后）对背景」的对比度；
 *     正文 4.5:1，大字号（≥24px，或 ≥18.66px 且 ≥700）3:1。
 *  3. 不达标就把文字的**明度**往可读的一端推（保持色相与彩度，红色仍是红色），
 *     直到达标；深底推向亮、浅底推向暗，首选方向够不到时退回另一方向。
 *
 * 因此：发件人自己画了深底浅字 / 浅底深字的块**原样保留**（它们本来就能读），
 * 背景与图片不受任何影响；只有「透明底 + 深色字」这类真正看不见的文字被提亮。
 *
 * ⚠ 所有改动都写进**内联样式**并记录原值，返回的 restore 逐条还原：
 *   主题切回浅色、换邮件、组件卸载、**打印前**都必须还原——深色下被提亮的文字
 *   落到白纸上会重新变成白字（打印归一见 message-view.tsx 的 preparePrint）。
 * ⚠ 颜色解析一律走 canvas：现代 Chrome 的 computed color 可能是 `oklch(...)` /
 *   `lab(...)`（本站主题色全是 oklch），手写正则解析不了。canvas 是浏览器里
 *   唯一的通用 CSS 颜色 → sRGB 解析器。
 */

type Rgba = { r: number; g: number; b: number; a: number };

/** 正文对比度阈值（WCAG AA）：普通文本 4.5:1，大字号 3:1 */
const BODY_MIN_RATIO = 4.5;
const LARGE_MIN_RATIO = 3;

/** 文字 alpha 低于这个值视为装饰性（水印、淡出效果），不去猜作者意图 */
const MIN_TEXT_ALPHA = 0.5;

/** canvas 探针：无法解析的颜色会让 fillStyle 保持上一次的值，用哨兵色识别 */
const PROBE = { r: 1, g: 2, b: 3 };

let probeContext: CanvasRenderingContext2D | null | undefined;

function getProbeContext(): CanvasRenderingContext2D | null {
  if (probeContext !== undefined) return probeContext;
  if (typeof document === "undefined") {
    probeContext = null;
    return probeContext;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  probeContext = canvas.getContext("2d", { willReadFrequently: true });
  return probeContext;
}

/** 任意 CSS 颜色 → sRGB 字节 + alpha；无法解析返回 null（`transparent` 也返回 null） */
const colorCache = new Map<string, Rgba | null>();

function parseCssColor(value: string): Rgba | null {
  if (colorCache.has(value)) return colorCache.get(value)!;
  const ctx = getProbeContext();
  let result: Rgba | null = null;
  if (ctx) {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = `rgb(${PROBE.r} ${PROBE.g} ${PROBE.b})`;
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    // a===0 = 完全透明（作者意图）；否则与哨兵色相同 = 解析失败
    if (a > 0 && !(r === PROBE.r && g === PROBE.g && b === PROBE.b && a === 255)) {
      result = { r, g, b, a: a / 255 };
    }
  }
  // 同一封邮件里同一个色值会重复几百次（正文大多是同一种 #333），缓存避免反复读 canvas
  if (colorCache.size > 512) colorCache.clear();
  colorCache.set(value, result);
  return result;
}

/** source over backdrop 的 alpha 合成（backdrop 必须不透明或已在更下层合成过） */
function over(top: Rgba, backdrop: Rgba): Rgba {
  const a = top.a + backdrop.a * (1 - top.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, b: number) => (t * top.a + b * backdrop.a * (1 - top.a)) / a;
  return { r: mix(top.r, backdrop.r), g: mix(top.g, backdrop.g), b: mix(top.b, backdrop.b), a };
}

/** WCAG 相对亮度（sRGB → 线性光） */
function relativeLuminance({ r, g, b }: Rgba): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function rgbToHsl({ r, g, b }: Rgba): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgba {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
    a: 1,
  };
}

/**
 * 把 `fg` 调到对 `bg` 至少 `minRatio` 的对比度（保持色相 / 彩度）。
 * 已经达标返回 null（调用方据此决定是否落笔）。
 */
function readableOn(fg: Rgba, bg: Rgba, minRatio: number): Rgba | null {
  if (contrastRatio(fg, bg) >= minRatio) return null;
  const [h, s, l] = rgbToHsl(fg);
  // 深底先提亮、浅底先压暗；首选方向到不了阈值时再试反方向（中灰底两条都难）
  const directions = relativeLuminance(bg) < 0.5 ? [1, -1] : [-1, 1];
  let best: Rgba = directions[0] > 0 ? { r: 255, g: 255, b: 255, a: 1 } : { r: 0, g: 0, b: 0, a: 1 };
  let bestRatio = 0;
  for (const dir of directions) {
    for (let step = 1; step <= 60; step++) {
      const nextL = Math.min(0.98, Math.max(0.02, l + dir * step * 0.02));
      const candidate = hslToRgb(h, s, nextL);
      const ratio = contrastRatio(candidate, bg);
      if (ratio >= minRatio) return candidate;
      if (ratio > bestRatio) {
        best = candidate;
        bestRatio = ratio;
      }
      if (dir > 0 ? nextL >= 0.98 : nextL <= 0.02) break;
    }
  }
  return best;
}

function hasDirectText(el: Element): boolean {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return true;
  }
  return false;
}

interface EffectiveBackground {
  color: Rgba;
  /** 文字与背景之间隔着背景图（渐变等）：无法判断实际底色，跳过 */
  hasImage: boolean;
}

/**
 * 算元素背后的实际底色：沿祖先链收集背景色，从最底层向上逐层合成。
 * 解析不了/全透明的元素视为没画底；`stop`（正文容器）自己通常是不透明的。
 */
function effectiveBackground(el: Element, stop: Element): EffectiveBackground {
  const layers: Rgba[] = [];
  let hasImage = false;
  let node: Element | null = el;
  while (node) {
    const style = getComputedStyle(node);
    if (style.backgroundImage !== "none") hasImage = true;
    const bg = parseCssColor(style.backgroundColor);
    if (bg) {
      layers.push(bg);
      if (bg.a >= 0.99) break;
    }
    if (node === stop) break;
    node = node.parentElement;
  }
  // 兜底：整条链都没有不透明层（正常不会发生，正文容器自带 bg-background）
  let acc: Rgba = { r: 0, g: 0, b: 0, a: 1 };
  for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
  return { color: acc, hasImage };
}

/** 祖先链上累计的 opacity（0~1）：淡出效果会按比例削弱实际文字颜色 */
function cumulativeOpacity(el: Element, stop: Element): number {
  let opacity = 1;
  let node: Element | null = el;
  while (node) {
    opacity *= Number(getComputedStyle(node).opacity) || 1;
    if (node === stop) break;
    node = node.parentElement;
  }
  return opacity;
}
/**
 * 就地归一深色主题下的邮件正文配色，返回还原函数。
 * 调用方保证此刻是深色主题（本模块不判断主题）。
 */
export function normalizeMailBodyColors(host: HTMLElement): () => void {
  const patched: { el: HTMLElement; value: string; priority: string }[] = [];
  const elements: HTMLElement[] = [host, ...Array.from(host.querySelectorAll<HTMLElement>("*"))];

  for (const el of elements) {
    if (!hasDirectText(el)) continue;
    const style = getComputedStyle(el);
    const fg = parseCssColor(style.color);
    if (!fg || fg.a * cumulativeOpacity(el, host) < MIN_TEXT_ALPHA) continue;

    const bg = effectiveBackground(el, host);
    if (bg.hasImage) continue;

    // 先按实际显示效果（alpha 合成）量对比度，再给一个不透明的达标颜色：
    // 半透明文字在深底上会进一步变暗，只按原始色值算会漏判。
    const displayed = over(fg, bg.color);
    const fontSize = parseFloat(style.fontSize) || 16;
    const weight = style.fontWeight === "bold" ? 700 : Number(style.fontWeight) || 400;
    const minRatio =
      fontSize >= 24 || (fontSize >= 18.66 && weight >= 700) ? LARGE_MIN_RATIO : BODY_MIN_RATIO;

    const fixed = readableOn(displayed, bg.color, minRatio);
    if (!fixed) continue;

    patched.push({
      el,
      value: el.style.getPropertyValue("color"),
      priority: el.style.getPropertyPriority("color"),
    });
    // important：发件人可能把颜色写成 !important，可读性优先于版式
    el.style.setProperty("color", `rgb(${fixed.r} ${fixed.g} ${fixed.b})`, "important");
  }

  return () => {
    for (const { el, value, priority } of patched) {
      if (value) el.style.setProperty("color", value, priority);
      else el.style.removeProperty("color");
    }
  };
}
