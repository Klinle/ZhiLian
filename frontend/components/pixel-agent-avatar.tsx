import React from "react";

interface PixelAgentAvatarProps {
  agentId: string; // "humor_mentor" | "academic_mentor" | "coach_mentor" | "auto"
  className?: string;
}

// 颜色色值表
const COLORS: Record<string, string> = {
  ".": "transparent",
  "B": "#27272a", // 深黑/灰褐
  "O": "#f97316", // 小柴橘黄
  "W": "#ffffff", // 白色
  "P": "#fda4af", // 舌头粉红
  "Y": "#eab308", // 小鹰金黄/学士帽穗/眼睛
  "G": "#94a3b8", // 小铁银灰
  "D": "#475569", // 深灰
  "R": "#ef4444", // 红色发光
  "C": "#06b6d4", // 发光浅蓝
};

// 1. 小柴 (Shiba) 像素网格 - 16x16
const SHIBA_GRID = [
  "................",
  "...B........B...",
  "..BOB......BOB..",
  "..BOWB....BOWB..",
  ".BOOOWBBBBWOOOB.",
  ".BOOOOOOBOOOOOOB.",
  ".BOOWBOWWOBWOOB.",
  ".BOOOBBOOBBOOOB.",
  ".BOORRWOOWRROOB.",
  "..BOOWWBBWWOOB..",
  "...BOOWPPWOOB...",
  "...BOOOWWOOOB...",
  "....BOOOOOOB....",
  ".....BBBBBB.....",
  "................",
  "................",
];

// 2. 小鹰 (Owl) 像素网格 - 16x16
const OWL_GRID = [
  "....BBBBBBBBB...", // 学士帽顶
  "...BBBBBBBBBBB..",
  "......B...Y.....", // 黄色穗子
  ".....BBB..Y.....",
  "....B...B.Y.....",
  "...B.W.W.B.Y....", // 大眼睛框
  "..B.WBYBW.B.....", // 黑色眼珠 + 中间黄喙
  "..B.WBYBW.B.....",
  "..B..YYY..B.....",
  "...B.DDD.B......",
  "....B...B.......",
  ".....BBB........",
  "....B...B.......",
  "....B...B.......",
  ".....BBB........",
  "................",
];

// 3. 小铁 (Robo) 像素网格 - 16x16
const ROBO_GRID = [
  ".......R........", // 红色天线灯
  ".......G........",
  ".......G........",
  "....GGGGGGG.....",
  "...G.......G....",
  "...G.C...C.G....", // 荧光蓝眼睛
  "...G.......G....",
  "...GGGGGGGGG....",
  "....D.D.D.D.....", // 意为颈部
  "...GGGGGGGGG....",
  "...G..CCC..G....", // 荧光蓝胸口面板
  "...G..CCC..G....",
  "...GGGGGGGGG....",
  "....D.....D.....",
  "....D.....D.....",
  "................",
];

export const PixelAgentAvatar: React.FC<PixelAgentAvatarProps> = ({
  agentId,
  className = "w-10 h-10",
}) => {
  // 定义 CSS 动画样式
  const styleTag = (
    <style>{`
      @keyframes p-breath {
        0%, 100% { transform: scaleY(1); }
        50% { transform: scaleY(1.06) translateY(-0.2px); }
      }
      @keyframes p-tail {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(6deg); }
      }
      @keyframes p-blink {
        0%, 90%, 100% { transform: scaleY(1); }
        95% { transform: scaleY(0.1); }
      }
      @keyframes p-pulse-light {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 1; }
      }
      @keyframes p-sweep {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .anim-breath {
        animation: p-breath 2s infinite ease-in-out;
        transform-origin: bottom center;
      }
      .anim-tail {
        animation: p-tail 0.8s infinite ease-in-out;
        transform-origin: 10px 12px;
      }
      .anim-blink {
        animation: p-blink 4s infinite ease-in-out;
        transform-origin: center;
      }
      .anim-blink-fast {
        animation: p-pulse-light 1.2s infinite ease-in-out;
      }
      .anim-sweep {
        animation: p-sweep 2.5s infinite linear;
        transform-origin: center;
      }
    `}</style>
  );

  const renderGrid = (grid: string[], getExtraClass?: (char: string, r: number, c: number) => string) => {
    return (
      <svg
        viewBox="0 0 16 16"
        className="w-full h-full shape-rendering-crisp-edges"
        style={{ imageRendering: "pixelated" }}
      >
        {styleTag}
        {grid.map((row, rIdx) =>
          row.split("").map((char, cIdx) => {
            if (char === ".") return null;
            const color = COLORS[char] || "transparent";
            const extraClass = getExtraClass ? getExtraClass(char, rIdx, cIdx) : "";
            return (
              <rect
                key={`${rIdx}-${cIdx}`}
                x={cIdx}
                y={rIdx}
                width="1.05"
                height="1.05"
                fill={color}
                className={extraClass}
              />
            );
          })
        )}
      </svg>
    );
  };

  // 根据选中的角色，渲染对应的 8-bit 图案与特定动效
  switch (agentId) {
    case "humor_mentor": // 小柴 (Shiba)
      return (
        <div className={`relative ${className} select-none anim-breath`}>
          {renderGrid(SHIBA_GRID, (char, r, c) => {
            if (r >= 11 && c >= 11) return "anim-tail";
            if (char === "P") return "transition-transform duration-300";
            return "";
          })}
        </div>
      );

    case "academic_mentor": // 小鹰 (Owl)
      return (
        <div className={`relative ${className} select-none anim-breath`}>
          {renderGrid(OWL_GRID, (char, r, c) => {
            if ((char === "B" || char === "W") && r >= 5 && r <= 7 && c >= 4 && c <= 10) {
              return "anim-blink";
            }
            return "";
          })}
        </div>
      );

    case "coach_mentor": // 小铁 (Robo)
      return (
        <div className={`relative ${className} select-none`}>
          {renderGrid(ROBO_GRID, (char, r, c) => {
            if (char === "R" && r === 0) return "anim-blink-fast";
            if (char === "C" && r >= 10 && r <= 11) return "anim-blink-fast";
            return "";
          })}
        </div>
      );

    case "auto": // 小航 (雷达)
    default:
      return (
        <div className={`relative ${className} select-none rounded-xl overflow-hidden bg-transparent border border-emerald-500/20 p-[2px]`}>
          <svg viewBox="0 0 16 16" className="w-full h-full">
            {styleTag}
            <circle cx="8" cy="8" r="7" fill="none" stroke="#10b981" strokeWidth="0.7" strokeOpacity="0.4" />
            <circle cx="8" cy="8" r="4.5" fill="none" stroke="#10b981" strokeWidth="0.5" strokeOpacity="0.3" />
            <line x1="8" y1="1" x2="8" y2="15" stroke="#10b981" strokeWidth="0.5" strokeOpacity="0.3" />
            <line x1="1" y1="8" x2="15" y2="8" stroke="#10b981" strokeWidth="0.5" strokeOpacity="0.3" />
            
            <rect x="4" y="5" width="1" height="1" fill="#4ade80" className="anim-blink-fast" />
            <rect x="11" y="10" width="1" height="1" fill="#4ade80" className="anim-blink-fast" style={{ animationDelay: "0.6s" }} />
            
            <g className="anim-sweep">
              <line x1="8" y1="8" x2="8" y2="1" stroke="#34d399" strokeWidth="1" strokeLinecap="round" />
              <polygon points="8,8 8,1 6.5,1.5 5.2,2.5" fill="#10b981" fillOpacity="0.35" />
            </g>
          </svg>
        </div>
      );
  }
};
