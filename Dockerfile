# ---- 依赖阶段 ----
FROM node:26-alpine AS deps
# Node 26 起官方镜像不再内置 corepack，直接安装与 package.json packageManager 一致的 pnpm
RUN npm install -g pnpm@10.33.0
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- 构建阶段 ----
FROM node:26-alpine AS builder
WORKDIR /app
# builder 是独立镜像，需重新安装 pnpm（版本与 package.json 的 packageManager 一致）
RUN npm install -g pnpm@10.33.0
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 站点对外 URL（SSG 构建期内联到 sitemap/robots/metadata；HTTP 部署时由 compose 传入 http:// 值）
ARG SITE_URL=https://shaoyuanyu.cn
ENV SITE_URL=$SITE_URL
# 导航页站点图标随仓库提交（public/favicons/），构建期不再联网抓取：
# ACR 构建环境访问 Google/iconify 不稳定，抓不到时线上会整页退化成占位图标。
# 构建 Next.js standalone 产物（构建时会同步生成 Velite 内容层）
RUN pnpm build

# ---- 运行阶段 ----
FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# 主人数据目录（想法速记 data/ideas.json 等）：compose 绑定挂载 ./data:/app/data
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
