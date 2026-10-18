import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

/**
 * 四周散落的四封合上的信（2026-10-18 重做）。
 *
 * 坐标是**信件中心**在 560×380 画布里的位置。四封信的尺寸、倾角、与边缘的距离
 * 都刻意各不相同（镜像式对齐会让画面显得刻意），只在对角线上保留「一封深一封
 * 淡」的呼应；每封有独立的漂浮周期与相位（见 globals.css 的 `mail-empty-float`）。
 */
const SCATTERED_LETTERS = [
  { x: 80, y: 82, w: 76, h: 55, rotate: -13, opacity: 0.42, duration: 8.5, delay: 0 },
  { x: 474, y: 72, w: 62, h: 45, rotate: 8, opacity: 0.3, duration: 7, delay: 1.5 },
  { x: 80, y: 312, w: 70, h: 51, rotate: 10, opacity: 0.34, duration: 9.5, delay: 3 },
  { x: 486, y: 318, w: 82, h: 58, rotate: -7, opacity: 0.46, duration: 8, delay: 4.2 },
] as const;

/** 场景里四颗极淡的星芒（相位错开，各自闪一下就走） */
const SPARKLES = [
  { x: 158, y: 128, scale: 1, delay: 0 },
  { x: 412, y: 92, scale: 0.8, delay: 1.8 },
  { x: 462, y: 258, scale: 0.9, delay: 3.6 },
  { x: 104, y: 264, scale: 0.7, delay: 5.4 },
] as const;

/** 合上的信：信封背面（开口的 V 形折线）+ 右下角一枚小邮票 + 一道邮戳弧 */
function SealedLetter({
  x,
  y,
  w,
  h,
  rotate,
  opacity,
  duration,
  delay,
}: (typeof SCATTERED_LETTERS)[number]) {
  const halfW = w / 2;
  const halfH = h / 2;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`} opacity={opacity}>
      <g
        className="mail-empty-float"
        style={
          {
            "--float-duration": `${duration}s`,
            "--float-delay": `${delay}s`,
          } as CSSProperties
        }
      >
        <rect
          x={-halfW}
          y={-halfH}
          width={w}
          height={h}
          rx={5}
          className="fill-background"
          stroke="currentColor"
          strokeWidth={1.4}
        />
        <path
          d={`M${-halfW + 1} ${-halfH + 1}L0 ${-halfH + h * 0.42}L${halfW - 1} ${-halfH + 1}`}
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
        {/* 邮票 */}
        <rect
          x={halfW - 17}
          y={halfH - 19}
          width="8"
          height="10"
          rx="1"
          stroke="currentColor"
          strokeWidth={1.2}
        />
        {/* 邮戳：一道弧，让「信」这个意象在缩小后依然成立 */}
        <path
          d={`M${halfW - 22} ${halfH - 18}a5 5 0 0 1 0 8`}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.7}
        />
      </g>
    </g>
  );
}

/**
 * `/mail` 右栏的空态插画（未选择邮件时，2026-10-18 重做）。
 *
 * 中央是一封封好的信：封口绕上沿翻开 → 信纸升起 → 四行字依次写出 → 信纸右上角
 * 亮起未读点 → 信纸落回 → 封口合上。一轮 14 秒，其余时间静止；四周四封合上的信
 * 以各自的周期极缓慢地漂浮。配色只吃 currentColor：浅色下是近黑的墨线，深色下
 * 自动变白。
 *
 * ⚠ 所有动效都在 `prefers-reduced-motion: reduce` 下停成「封口翻开、信纸已升起、
 *   字已写完、未读点亮着」的静帧（见 globals.css）；静止的那一帧本身就是完整构图，
 *   不能省掉任何元素。
 */
export function MailPlaceholder({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-auto w-full", className)}>
      <svg
        viewBox="0 0 560 380"
        className="w-full text-muted-foreground"
        fill="none"
        aria-hidden
      >
        <defs>
          <radialGradient id="mail-empty-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
            <stop offset="55%" stopColor="currentColor" stopOpacity="0.05" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* 信堆背后的一团呼吸光晕：给白底一点纵深，不引入任何彩色 */}
        <ellipse
          cx="280"
          cy="244"
          rx="212"
          ry="152"
          fill="url(#mail-empty-halo)"
          className="mail-empty-halo"
        />

        {/* 四周散落的信 */}
        {SCATTERED_LETTERS.map((letter) => (
          <SealedLetter key={`${letter.x}-${letter.y}`} {...letter} />
        ))}

        {/* 中央：信封 + 可翻折的封口 + 升起的信纸 */}
        <g className="text-foreground/80">
          {/* 落在地面上的影子：让整组图形不飘在半空 */}
          <ellipse cx="280" cy="344" rx="118" ry="6" fill="currentColor" opacity="0.05" />

          {/* 信封内衬：封口翻开后从缺口露出来的那一面（比纸面深一档） */}
          <rect
            x="130"
            y="150"
            width="300"
            height="180"
            rx="14"
            className="fill-muted/70"
            stroke="currentColor"
            strokeWidth="1.8"
          />

          {/* 封口：闭合时盖住上沿与 V 形缺口；绕上沿翻折 180° 后落在信封上方。
              它画在信纸之前——翻开时躲在信纸背后，才是「折到背面去」的样子。
              火漆也在这里：翻开时淡出（蜡章翻到背面就看不见），合上后再淡入 */}
          <g className="mail-empty-flap">
            <path
              d="M130 170L130 164A14 14 0 0 1 144 150H416A14 14 0 0 1 430 164V170L280 210Z"
              className="fill-muted/40"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <g className="mail-empty-seal">
              <circle
                cx="280"
                cy="176"
                r="10"
                className="fill-background"
                stroke="currentColor"
                strokeWidth="1.4"
                opacity="0.72"
              />
              <path
                d="M280 170.5L281.7 174.3L285.5 176L281.7 177.7L280 181.5L278.3 177.7L274.5 176L278.3 174.3Z"
                fill="currentColor"
                opacity="0.45"
              />
            </g>
          </g>

          {/* 信纸：静止时整张藏在信封前片之后；升起后只有上半截露在开口之上 */}
          <g className="mail-empty-letter">
            <rect
              x="172"
              y="212"
              width="216"
              height="112"
              rx="4"
              className="fill-background"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            {/* 四行字：行宽不一（最后一行像落款），各自错开相位依次写出。
                整体比信纸顶边低 34px，把右上角完整让给未读点 */}
            <line
              x1="188"
              y1="246"
              x2="356"
              y2="246"
              pathLength={1}
              className="mail-empty-line"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              style={{ "--line-delay": "0.5s" } as CSSProperties}
            />
            <line
              x1="188"
              y1="260"
              x2="332"
              y2="260"
              pathLength={1}
              className="mail-empty-line"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              style={{ "--line-delay": "0.65s" } as CSSProperties}
            />
            <line
              x1="188"
              y1="274"
              x2="348"
              y2="274"
              pathLength={1}
              className="mail-empty-line"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              style={{ "--line-delay": "0.8s" } as CSSProperties}
            />
            <line
              x1="188"
              y1="288"
              x2="300"
              y2="288"
              pathLength={1}
              className="mail-empty-line"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              style={{ "--line-delay": "0.95s" } as CSSProperties}
            />
            {/* 未读点：与列表行 / 顶栏圆点同色（见 unread-color.ts）。
                位置在信纸自己的右上角内侧（不碰信封边），信写完才亮，落袋即灭 */}
            <circle
              cx="370"
              cy="228"
              r="5.5"
              className="mail-empty-dot fill-[#4E74C8] stroke-background stroke-[2.5] dark:fill-[#8FADE8]"
            />
          </g>

          {/* 信封前片：开口的 V 形上沿，底角与内衬同半径 */}
          <path
            d="M130 170L280 210L430 170V316A14 14 0 0 1 416 330H144A14 14 0 0 1 130 316Z"
            className="fill-background"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />

          {/* 信封背面的折痕（极淡）：两条斜线汇到中心，撑出信封的立体感 */}
          <path
            d="M148 326L280 236L412 326"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.12"
          />
        </g>

        {/* 四颗星芒：错开相位闪一下，给静态构图一点「活着」的证据 */}
        {SPARKLES.map((spark) => (
          <g
            key={`${spark.x}-${spark.y}`}
            transform={`translate(${spark.x} ${spark.y}) scale(${spark.scale})`}
          >
            <path
              d="M0 -4.5L1.1 -1.1L4.5 0L1.1 1.1L0 4.5L-1.1 1.1L-4.5 0L-1.1 -1.1Z"
              className="mail-empty-spark text-foreground"
              fill="currentColor"
              style={{ "--spark-delay": `${spark.delay}s` } as CSSProperties}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
