#!/usr/bin/env bash
# 本机 dev 环境的**唯一入口**（3000 端口单一实例）。规矩见 CLAUDE.md
# 「dev / standalone 运行规范：3000 端口单一实例」。
#
#   bash scripts/dev.sh start     # 断言 3000 干净 → 脱离终端起 dev → 断言监听者是自己 → 探活
#   bash scripts/dev.sh stop      # 清掉本项目族全部 dev/next-server/ pnpm 包装进程 + 3000 占用者
#   bash scripts/dev.sh restart   # stop + start
#   bash scripts/dev.sh status    # 进程树 / 3000 归属 / HTTP 码 / 日志尾
#
# 为什么必须有唯一入口（2026-10-16 用户质问「为什么总是同时开这么多开发服务器」）：
#   ① `next dev` 在 3000 被占时**不报错**，会静默把端口 +1 重试（最多 10 次、只打一条 warn，
#      见 next/dist/server/lib/start-server.js 的 EADDRINUSE 分支）→「又起了一棵 dev」这件事
#      没有任何失败信号：新的跑在 3001，你以为在 3000，浏览器/E2E 打到的仍是旧的那棵。
#   ② `fuser -k 3000/tcp` 只杀掉监听套接字的 next-server 子进程，父进程 `next dev`（和更上层
#      `pnpm`）还活着继续占内存、继续编译（实测一天攒 4 棵，两棵 etime 超 1 天）。
#   ③ 启动命令每次手敲且写法不一（`pnpm dev` / `pnpm -C <abs> dev`）——没有唯一入口就没有唯一性。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${DEV_PORT:-3000}"
LOG="$ROOT/.next/dev-server.log"
# 归属范围：本仓库目录**及其下**。这样恰好盖住 .dsh-worktrees 下的仓库副本，又不会碰到
# 同族的 ysy-homepage-webmail（webmaild 是一直要跑的后端，cwd 在另一个仓库里）。
DEV_RE='next dev|next-server|start-standalone'
port_owner() {
  local pid
  pid="$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)"
  if [ -z "$pid" ]; then
    pid="$(fuser "$PORT/tcp" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' | head -1)"
  fi
  printf '%s' "$pid"
}

# 按 **cwd 归属**找出本仓库（含 .dsh-worktrees 副本）里的 dev/standalone 进程，绝不误伤别的项目
family_pids() {
  local p cwd
  for p in $(pgrep -f "$DEV_RE" 2>/dev/null); do
    cwd="$(readlink "/proc/$p/cwd" 2>/dev/null)" || continue
    case "$cwd" in
    "$ROOT" | "$ROOT"/*) printf '%s\n' "$p" ;;
    esac
  done
}

cmd_line() { tr '\0' ' ' <"/proc/$1/cmdline" 2>/dev/null | cut -c1-110; }

do_stop() {
  local pids p ppid line owner
  pids="$(family_pids)"
  owner="$(port_owner)"
  [ -n "$owner" ] && pids="$pids
$owner"
  pids="$(printf '%s\n' "$pids" | grep -E '^[0-9]+$' | sort -u)"

  if [ -z "$pids" ]; then
    echo "· 没有存活的 dev 进程"
  else
    for p in $pids; do
      # next dev 的直接父若是 pnpm 包装进程，一并收掉（只杀子进程会留下死树）。
      # ⚠ 三个坑：① 不能只 grep "pnpm"——pnpm store 路径 `.pnpm/next@…/…/bin/next` 里也有
      #   这串，会把 next dev 自己误判成 pnpm 包装进程（实测误报）。
      #   ② 别用 `ps -o comm=` 判“是不是 node”——Node 起脚本时会把 comm 改成脚本名，
      #   pnpm 包装进程的 comm 是 **pnpm** 不是 node（实测踩到，导致父进程漏杀）。
      #   ③ /proc/<pid>/cmdline 是 NUL 分隔的，直接 grep 时 `( |$)` 匹配不到参数分隔处，
      #   必须先 tr 成空格。
      ppid="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')"
      if [ -n "${ppid:-}" ] && [ "$ppid" != "1" ] \
        && tr '\0' ' ' <"/proc/$ppid/cmdline" 2>/dev/null | grep -qE '(^|/)pnpm( |$)'; then
        if kill "$ppid" 2>/dev/null; then echo "  ↑ 收掉父进程 pnpm pid=$ppid"; fi
      fi
      # cmdline 要在 kill 之前读（进程一死 /proc 就没了，会打印出空行）
      local line
      line="$(cmd_line "$p")"
      if kill "$p" 2>/dev/null; then
        echo "· 已结束 pid=$p ${line:-（next-server）}"
      fi
    done
  fi

  # 等端口真正释放（有界，最多 ~4s）
  for _ in $(seq 1 20); do
    [ -z "$(port_owner)" ] && break
    sleep 0.2
  done

  if [ -n "$(port_owner)" ]; then
    echo "!! $PORT 仍被 pid=$(port_owner) 占着（不是本项目族的进程？）：$(cmd_line "$(port_owner)")" >&2
    return 1
  fi
  echo "· $PORT 已释放"
}

do_start() {
  # worktree 副本（`.git` 是文件）里禁止起 dev：清场是跨目录的，会把主目录的 dev 杀掉，且会抢 3000
  if [ -f "$ROOT/.git" ] && [ "${DEV_FORCE:-0}" != "1" ]; then
    echo "!! $ROOT 是一个 git worktree（.git 是文件），dev 只允许在住克隆里跑。" >&2
    echo "   确实要在这儿跑：DEV_FORCE=1 bash scripts/dev.sh start" >&2
    return 1
  fi
  if [ -n "$(port_owner)" ]; then
    echo "!! $PORT 已被 pid=$(port_owner) 占用，拒绝启动（否则 next dev 会静默漂到 $((PORT + 1))+）：" >&2
    echo "   $(cmd_line "$(port_owner)")" >&2
    echo "   先跑：bash scripts/dev.sh stop" >&2
    return 1
  fi
  command -v pnpm >/dev/null || {
    echo "!! 找不到 pnpm" >&2
    return 1
  }

  mkdir -p "$ROOT/.next"
  : >"$LOG"
  # 脱离终端启动（setsid --fork 必须带 --fork，否则 ppid 仍挂在工具终端下，
  # VS Code 会把 dev server 当成「工具返回后仍在跑的后台命令」持续监控并按输出唤醒 agent）
  (cd "$ROOT" && setsid --fork nohup pnpm dev >"$LOG" 2>&1 </dev/null &)

  # 就绪探测：让 curl 自己重试，不写 sleep 轮询。用 -fs（不带 -S）：重试期间的
  # "Failed to connect" 是预期噪声，失败时下面自己会给出结论与日志。
  if ! curl -fs --retry 30 --retry-delay 1 --retry-connrefused --max-time 120 \
    -o /dev/null "http://localhost:$PORT/login"; then
    echo "!! dev 未就绪，日志尾部：" >&2
    tail -20 "$LOG" >&2
    return 1
  fi

  local owner
  owner="$(port_owner)"
  if [ -z "$owner" ] || [ "$(readlink "/proc/$owner/cwd" 2>/dev/null)" != "$ROOT" ]; then
    echo "!! $PORT 的监听者（pid=${owner:-未知}）cwd 不是 $ROOT —— 你连上的不是本仓库的 dev" >&2
    echo "   $(cmd_line "${owner:-0}")" >&2
    return 1
  fi
  if grep -q 'using available port' "$LOG"; then
    echo "!! 日志出现端口漂移告警（有别的东西占着 $PORT），本次启动不可信，见 $LOG" >&2
    return 1
  fi

  echo "$owner" >"$ROOT/.next/dev.pid"
  echo "· dev 就绪：http://localhost:$PORT （监听 pid=$owner，日志 $LOG）"
  ps -o pid=,ppid=,tty=,etime=,args= -p "$owner" | cut -c1-110
}

do_status() {
  local p owner
  echo "== 本仓库（含 .dsh-worktrees 副本）的 dev 进程 =="
  p="$(family_pids)"
  if [ -z "$p" ]; then
    echo "  （无）"
  else
    for p in $p; do ps -o pid=,ppid=,tty=,etime= -p "$p"; done
  fi
  echo "== $PORT 归属 =="
  owner="$(port_owner)"
  if [ -z "$owner" ]; then
    echo "  （空闲）"
  else
    ps -o pid=,ppid=,tty=,etime=,args= -p "$owner" | cut -c1-110
    echo "  cwd=$(readlink "/proc/$owner/cwd" 2>/dev/null)"
  fi
  echo "== HTTP =="
  curl -s -o /dev/null -w "  http://localhost:$PORT/login → %{http_code}\n" --max-time 5 \
    "http://localhost:$PORT/login" || echo "  （连不上）"
  if [ -f "$LOG" ]; then
    echo "== 漂移告警次数 =="
    echo "  $(grep -c 'using available port' "$LOG")"
    echo "== 日志尾 =="
    tail -n 15 "$LOG"
  fi
}

case "${1:-status}" in
start) do_start ;;
stop) do_stop ;;
restart)
  do_stop || exit 1
  do_start
  ;;
status) do_status ;;
*)
  echo "用法：bash scripts/dev.sh start|stop|restart|status" >&2
  exit 2
  ;;
esac
