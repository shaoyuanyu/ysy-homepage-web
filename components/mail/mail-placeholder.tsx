import { cn } from "@/lib/utils";

/**
 * 散落在四周的四封合上的信：尺寸、倾角、与边缘的距离都各不相同（镜像式
 * 对齐会让画面显得刻意），只在对角线上保留「一封深一封淡」的呼应。
 * 坐标以 800×800 的画布中心为参照。
 */
const SCATTERED_ENVELOPES = [
  { x: 231, y: 115, w: 74, h: 54, rotate: -13, delay: 0, faded: false },
  { x: 555, y: 93, w: 62, h: 45, rotate: 7, delay: 1.6, faded: true },
  { x: 199, y: 687, w: 68, h: 50, rotate: 11, delay: 3.2, faded: true },
  { x: 615, y: 641, w: 80, h: 58, rotate: -6, delay: 4.8, faded: false },
];

/**
 * `/mail` 右栏的占位插画（未选择邮件时）。
 *
 * 中心是一封打开的信封（信纸升起、三行字写出），四周散着四封合上的信，
 * 各自极缓慢地浮动（`mail-placeholder-float`，7 秒一轮、错开相位）。
 * 信封里的信纸一轮 12 秒（升起 1.6s、字写完 2.7s，其余时间静止）。
 */
export function MailPlaceholder({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      {/* 四周散落的信：与信封同一个形状，合上、极淡 */}
      <svg
        viewBox="0 0 800 800"
        className="pointer-events-none absolute top-[63%] left-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 text-muted-foreground/25"
        fill="none"
        aria-hidden
      >
        {SCATTERED_ENVELOPES.map((envelope) => {
          const halfW = envelope.w / 2;
          const halfH = envelope.h / 2;
          return (
            <g
              key={`${envelope.x}-${envelope.y}`}
              className={envelope.faded ? "opacity-55" : undefined}
              transform={`translate(${envelope.x} ${envelope.y}) rotate(${envelope.rotate})`}
            >
              <g
                className="mail-placeholder-float"
                style={{ animationDelay: `${envelope.delay}s` }}
              >
                <rect
                  x={-halfW}
                  y={-halfH}
                  width={envelope.w}
                  height={envelope.h}
                  rx={4}
                  className="fill-background"
                  stroke="currentColor"
                  strokeWidth={1.5}
                />
                <path
                  d={`M${-halfW} ${-halfH}L0 ${-halfH + envelope.h * 0.44}L${halfW} ${-halfH}`}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
                {/* 右下角的邮票 */}
                <rect
                  x={halfW - 16}
                  y={halfH - 18}
                  width="8"
                  height="10"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth={1.5}
                />
              </g>
            </g>
          );
        })}
      </svg>

      <svg
        viewBox="0 0 200 150"
        className="relative w-[320px] text-foreground/70"
        fill="none"
        strokeWidth={1}
        aria-hidden
      >
        {/* 信封后片 */}
        <rect
          x="20"
          y="50"
          width="160"
          height="90"
          rx="8"
          className="fill-background"
          stroke="currentColor"
        />

        {/* 信纸：升起前整张藏在前片之下，升到位后底边仍压在开口折线之下 */}
        <g className="mail-placeholder-letter">
          <rect
            x="44"
            y="80"
            width="112"
            height="58"
            rx="3"
            className="fill-background"
            stroke="currentColor"
          />
          <line
            x1="58"
            y1="85"
            x2="142"
            y2="85"
            pathLength={1}
            className="mail-placeholder-line"
            stroke="currentColor"
            strokeLinecap="round"
          />
          <line
            x1="58"
            y1="93"
            x2="126"
            y2="93"
            pathLength={1}
            className="mail-placeholder-line"
            stroke="currentColor"
            strokeLinecap="round"
          />
          <line
            x1="58"
            y1="101"
            x2="134"
            y2="101"
            pathLength={1}
            className="mail-placeholder-line"
            stroke="currentColor"
            strokeLinecap="round"
          />
        </g>

        {/* 信封前片：开口的 V 形上沿，底角与后片同半径 */}
        <path
          d="M20 60L100 78L180 60V132A8 8 0 0 1 172 140H28A8 8 0 0 1 20 132Z"
          className="fill-background"
          stroke="currentColor"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
