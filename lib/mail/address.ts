/**
 * 地址串的解析 / 格式化（写信页收件人、抄送、密送共用）。
 *
 * 为什么要有这一层：2026-10-29 用户报「收件人、抄送人不显示备注名」。界面里要显示
 * `备注名 <地址>`，但 **webmaild 的 `/send` 仍然只接受裸地址**（assertAddresses 的
 * 正则不允许尖括号），所以「显示」与「发送」必须是两套口径：
 * - 输入框 / 草稿 / 联系人卡片：可以带 `Name <email>`；
 * - POST /send：`addressesOf()` 剥成裸地址。
 *
 * 解析必须能处理名字里的逗号（`"Last, First" <a@b>`）——天真的 `split(/[,;]/)` 会把
 * 一个地址拆成两半，联系人里恰好有这种名字时就会静默发错人。故这里按引号 / 尖括号
 * 状态机扫描，中文逗号与分号同样算分隔符（与旧口径一致）。
 */

/** 收件人分隔符（与发送解析保持一致：半角/全角逗号、半角/全角分号） */
export function isAddressSeparator(ch: string): boolean {
  return ch === "," || ch === ";" || ch === "，" || ch === "；";
}

/**
 * 按分隔符切分地址串；引号内、尖括号内的分隔符不算。
 * 空片段丢弃（末尾的 `, ` 不会产出一个空地址）。
 */
export function splitAddressList(value: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuote = false;
  let inAngle = false;
  let escaped = false;
  for (const ch of value) {
    if (escaped) {
      buf += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && inQuote) {
      buf += ch;
      escaped = true;
      continue;
    }
    if (ch === '"' && !inAngle) {
      inQuote = !inQuote;
      buf += ch;
      continue;
    }
    if (ch === "<" && !inQuote) {
      inAngle = true;
      buf += ch;
      continue;
    }
    if (ch === ">" && inAngle && !inQuote) {
      inAngle = false;
      buf += ch;
      continue;
    }
    if (!inQuote && !inAngle && isAddressSeparator(ch)) {
      if (buf.trim()) out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export interface ParsedMailbox {
  name: string;
  address: string;
}

const BARE_ADDRESS_RE = /^[^\s@,;<>，；]+@[^\s@,;<>，；]+$/;

/**
 * 解析单个地址片段：`Name <a@b>` / `"Last, First" <a@b>` / `a@b`。
 * 不是地址形态（例如用户刚输入一半的 `zhang`）→ null，调用方原样保留。
 */
export function parseMailbox(token: string): ParsedMailbox | null {
  const t = token.trim();
  if (!t) return null;
  const angled = t.match(/^(.*?)\s*<([^<>]+)>\s*$/);
  if (angled) {
    let name = angled[1].trim();
    if (name.startsWith('"') && name.endsWith('"') && name.length >= 2) {
      name = name.slice(1, -1).replace(/\\"/g, '"');
    }
    const address = angled[2].trim();
    if (!BARE_ADDRESS_RE.test(address)) return null;
    return { name, address };
  }
  if (BARE_ADDRESS_RE.test(t)) return { name: "", address: t };
  return null;
}

/** 名字里出现这些字符时必须加引号，否则会被地址解析器当成分隔符 / 语法 */
function needsQuote(name: string): boolean {
  return /[",;<>，；]/.test(name);
}

/**
 * 显示 / 输入框用的地址写法：有名字 = `名字 <地址>`，没有 = 裸地址。
 * ⚠ 名字里的双引号转义；逗号等特殊字符加引号（`"Last, First" <a@b>`）。
 */
export function formatMailbox(name: string | null | undefined, address: string): string {
  const n = (name ?? "").trim();
  const a = address.trim();
  if (!n) return a;
  const display = needsQuote(n) ? `"${n.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : n;
  return `${display} <${a}>`;
}

/** 片段 → 裸地址（解析不了的原样返回，让后端给出明确的「非法地址」错误） */
export function addressOfToken(token: string): string {
  return parseMailbox(token)?.address ?? token.trim();
}

/** 输入框里的地址串 → 裸地址数组（POST /send 用） */
export function addressesOf(value: string): string[] {
  return splitAddressList(value)
    .map(addressOfToken)
    .filter(Boolean);
}

/**
 * 把地址串里能识别的裸地址补上备注名（输入框失焦时调用）。
 * - 已有名字的保留原样（不覆盖用户手写的称呼）；
 * - 解析不了的片段原样保留（用户可能正在输入一个还不完整的地址）。
 */
export function normalizeAddressList(
  value: string,
  nameOf: (email: string) => string,
): string {
  return splitAddressList(value)
    .map((token) => {
      const parsed = parseMailbox(token);
      if (!parsed) return token;
      const name = parsed.name || nameOf(parsed.address);
      return formatMailbox(name, parsed.address);
    })
    .join(", ");
}
