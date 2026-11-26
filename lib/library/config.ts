import "server-only";

/** paperdb API 基址：默认本机 9720，生产由部署环境注入。 */
export const PAPERDB_URL = (process.env.PAPERDB_URL ?? "http://127.0.0.1:9720").replace(
  /\/+$/,
  "",
);

/** 服务令牌只存在于服务端；浏览器永远拿不到。 */
export function paperdbToken(): string {
  const token = process.env.PAPERDB_SERVICE_TOKEN;
  if (!token) {
    throw new Error("PAPERDB_SERVICE_TOKEN is not configured");
  }
  return token;
}

/** 代理层允许的 API 根（/v1 之后的第一段），显式白名单，防止代理变成任意后门。 */
export const PAPERDB_PROXY_ROOTS = new Set([
  "annotations",
  "authors",
  "auto-rules",
  "collections",
  "export-tokens",
  "exports",
  "files",
  "imports",
  "jobs",
  "me",
  "meta",
  "papers",
  "projects",
  "resolve",
  "search",
  "settings",
  "tags",
  "tokens",
  "venues",
  "views",
  "workspaces",
]);

/** 只允许这些响应头穿透代理。 */
export const PAPERDB_RESPONSE_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-disposition",
  "content-length",
  "content-range",
  "content-security-policy",
  "content-type",
  "etag",
  "location",
  "retry-after",
  "x-content-type-options",
] as const;
