"use client";

import React, { useMemo } from "react";
import { Lock, Check } from "lucide-react";
import type { KnowledgeNode } from "@/types";

interface GraphRelation {
  source: string;
  target: string;
  relation_type: string;
}

interface CartoonKnowledgeTreeProps {
  nodes: KnowledgeNode[];
  relations: GraphRelation[];
  onNodeSelect: (node: KnowledgeNode) => void;
}

// 6大领域的星球地质特征定义
const PLANET_STYLES: Record<
  string,
  {
    name: string;
    color: string;
    bgColor: string;
    borderColor: string;
    ringColor?: string;
    hasTexture: "stripes" | "crater" | "spots" | "sparkles" | "ringed" | "cloud";
    shadowColor: string;
  }
> = {
  programming: {
    name: "终端与工具",
    color: "#a3e635", // 柠檬绿
    bgColor: "#bef264",
    borderColor: "#4d7c0f",
    hasTexture: "ringed", // 带星环
    ringColor: "#facc15",
    shadowColor: "rgba(163,230,53,0.3)",
  },
  dsa: {
    name: "算法与结构",
    color: "#f472b6", // 桃粉色
    bgColor: "#fbcfe8",
    borderColor: "#be185d",
    hasTexture: "spots", // 岩浆斑纹
    shadowColor: "rgba(244,114,182,0.3)",
  },
  organization: {
    name: "街机硬件设计",
    color: "#60a5fa", // 天蓝色
    bgColor: "#bfdbfe",
    borderColor: "#1d4ed8",
    hasTexture: "stripes", // 卡通条纹
    shadowColor: "rgba(96,165,250,0.3)",
  },
  os: {
    name: "并发与操作系统",
    color: "#fb923c", // 橙色
    bgColor: "#fed7aa",
    borderColor: "#c2410c",
    hasTexture: "ringed", // 土星环带
    ringColor: "#fed7aa",
    shadowColor: "rgba(251,146,60,0.3)",
  },
  network: {
    name: "联机对战服务",
    color: "#c084fc", // 浆果紫
    bgColor: "#e9d5ff",
    borderColor: "#6b21a8",
    hasTexture: "cloud", // 星云雾气
    shadowColor: "rgba(192,132,252,0.3)",
  },
  database: {
    name: "数据与工程",
    color: "#34d399", // 薄荷绿
    bgColor: "#a7f3d0",
    borderColor: "#047857",
    hasTexture: "sparkles", // 闪烁星芒
    shadowColor: "rgba(52,211,153,0.3)",
  },
};

// 确定性随机数（避免渲染抖动）
function getHash(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function getSeededRandom(hash: number) {
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

export default function CartoonKnowledgeTree({
  nodes,
  relations,
  onNodeSelect,
}: CartoonKnowledgeTreeProps) {
  // 节点解锁状态逻辑判定
  const isUnlockedMap = useMemo(() => {
    const nodesById = new Map<string, KnowledgeNode>();
    nodes.forEach((n) => nodesById.set(n.id, n));

    const requiresMap = new Map<string, string[]>();
    relations.forEach((rel) => {
      if (rel.relation_type === "requires") {
        const list = requiresMap.get(rel.target) || [];
        list.push(rel.source);
        requiresMap.set(rel.target, list);
      }
    });

    const unlocked = new Map<string, boolean>();
    nodes.forEach((node) => {
      const parentIds = requiresMap.get(node.id);
      if (!parentIds || parentIds.length === 0) {
        unlocked.set(node.id, true);
      } else {
        const allParentsLighted = parentIds.every((pId) => {
          const parentNode = nodesById.get(pId);
          return parentNode ? parentNode.is_lighted : false;
        });
        unlocked.set(node.id, allParentsLighted);
      }
    });

    return unlocked;
  }, [nodes, relations]);

  // 1. 计算 2D 平面星群拓扑网路布局 (固定画板尺寸)
  const layoutData = useMemo(() => {
    // 6 大领域在 2D 平面上的各个“星系中心点” (X, Y)
    // 整个画板设计为宽 1020, 高 650，错落排开
    const categoryCenters: Record<string, { x: number; y: number }> = {
      programming: { x: 190, y: 150 }, // 左上
      dsa: { x: 160, y: 390 },         // 左下
      organization: { x: 500, y: 120 }, // 中上
      os: { x: 500, y: 490 },           // 中下
      network: { x: 830, y: 390 },       // 右下
      database: { x: 800, y: 150 },       // 右上
    };

    const nodeCoords = new Map<string, { x: number; y: number }>();
    
    // 按分类进行分组
    const groups: Record<string, KnowledgeNode[]> = {};
    Object.keys(PLANET_STYLES).forEach((cat) => {
      groups[cat] = [];
    });

    nodes.forEach((node) => {
      if (groups[node.category]) {
        groups[node.category].push(node);
      } else {
        if (!groups["programming"]) groups["programming"] = [];
        groups["programming"].push(node);
      }
    });

    // 为每个分类的星系内部节点进行环状/螺旋状排布
    Object.entries(groups).forEach(([cat, catNodes]) => {
      const center = categoryCenters[cat] || { x: 500, y: 300 };
      
      // 按照 pagerank 权重排序，保证前置靠内侧，分支末梢靠外侧
      const sorted = [...catNodes].sort((a, b) => b.pagerank_weight - a.pagerank_weight);
      const count = sorted.length;

      sorted.forEach((node, index) => {
        const hash = getHash(node.id);
        const seed1 = getSeededRandom(hash);
        const seed2 = getSeededRandom(hash + 1);

        // 星群分布半径与角度计算
        // 核心节点靠近中心，其他节点依次呈环状向外旋转发散
        const angle = (index / Math.max(1, count)) * 2 * Math.PI + (seed1 - 0.5) * 0.5;
        const radius = 60 + index * 40; // 阶梯扩散半径

        // 计算 2D 坐标并加入哈希扰动
        const jitter = 15;
        const x = center.x + Math.cos(angle) * radius + (seed1 - 0.5) * jitter;
        const y = center.y + Math.sin(angle) * radius + (seed2 - 0.5) * jitter;

        nodeCoords.set(node.id, { x, y });
      });
    });

    return nodeCoords;
  }, [nodes]);

  // 2. 轨道星轨连线计算 (SVG 二次贝塞尔曲线弯曲藤蔓)
  const lines = useMemo(() => {
    const list: Array<{
      id: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      ctrlX: number;
      ctrlY: number;
      color: string;
      isLighted: boolean;
      isDash: boolean;
    }> = [];

    relations.forEach((rel, idx) => {
      const srcCoord = layoutData.get(rel.source);
      const tgtCoord = layoutData.get(rel.target);
      const srcNode = nodes.find(n => n.id === rel.source);
      const tgtNode = nodes.find(n => n.id === rel.target);

      if (srcCoord && tgtCoord && srcNode && tgtNode) {
        // 在两点连线的垂直平分线上微调控制点，使线条产生有机弧度 (卡通星轨感)
        const midX = (srcCoord.x + tgtCoord.x) / 2;
        const midY = (srcCoord.y + tgtCoord.y) / 2;
        
        // 确定性偏移
        const seed = getSeededRandom(getHash(rel.source + rel.target));
        const offset = 20 + seed * 20;
        
        // 控制点向上微弯
        const ctrlX = midX;
        const ctrlY = midY - offset;

        const isLighted = srcNode.is_lighted && tgtNode.is_lighted;
        const style = PLANET_STYLES[srcNode.category] || PLANET_STYLES.programming;

        list.push({
          id: `${rel.source}-${rel.target}-${idx}`,
          x1: srcCoord.x,
          y1: srcCoord.y,
          x2: tgtCoord.x,
          y2: tgtCoord.y,
          ctrlX,
          ctrlY,
          color: style.color,
          isLighted,
          isDash: rel.relation_type === "extends",
        });
      }
    });

    return list;
  }, [relations, layoutData, nodes]);

  // 轨道卫星参数 (已点亮星球周围会有微型 2D 公转卫星)
  const getSatelliteStyle = (hashVal: number) => {
    const seed = getSeededRandom(hashVal);
    const orbitRadius = 40 + seed * 8; // 公转半径
    const orbitDuration = 6 + seed * 8; // 自转/公转周期 (秒)
    const satColor = seed > 0.6 ? "#fbbf24" : seed > 0.3 ? "#ffffff" : "#fb7185"; // 卫星颜色（黄、白、粉红）
    const satSize = 6 + Math.round(seed * 4); // 卫星尺寸
    
    return {
      radius: orbitRadius,
      duration: orbitDuration,
      color: satColor,
      size: satSize,
    };
  };

  return (
    // 卡通星系背景板：米黄色羊皮画纸 + 卡通细格子线，去除 3D 拖拽干扰
    <div className="w-full h-full overflow-auto bg-[#faf6eb] bg-[linear-gradient(rgba(139,90,43,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(139,90,43,0.04)_1px,transparent_1px)] bg-[size:30px_30px] rounded-3xl border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-1 min-h-[500px]">
      
      {/* 卫星公转的全局 CSS 关键帧 */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes planet-orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes planet-self-spin {
          0% { transform: rotate(0deg); }
          50% { transform: rotate(10deg); }
          100% { transform: rotate(0deg); }
        }
        .animate-planet-spin {
          animation: planet-self-spin 5s ease-in-out infinite;
        }
      `}} />

      {/* 固定尺寸内容画卷，随溢出整体移动 */}
      <div className="relative overflow-visible" style={{ width: 1040, height: 630 }}>
        
        {/* SVG 星轨背景层 */}
        <svg width="1040" height="630" className="absolute inset-0 pointer-events-none z-0">
          <defs>
            {/* 卡通边框阴影 */}
            <filter id="planet-cartoon-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="2" dy="2" stdDeviation="0" floodColor="#000000" floodOpacity="1" />
            </filter>
          </defs>

          {/* 渲染卡通连线（星际星轨） */}
          {lines.map((line) => {
            const strokeColor = line.isLighted ? "#78350f" : "#d4d4d8"; // 未掌握的星轨是灰色，掌握的是卡通棕褐色轨
            const strokeWidth = line.isLighted ? 4.5 : 2.5;

            return (
              <g key={line.id} style={{ opacity: line.isLighted ? 1.0 : 0.45 }}>
                {/* 星轨底层粗描边 */}
                <path
                  d={`M ${line.x1} ${line.y1} Q ${line.ctrlX} ${line.ctrlY} ${line.x2} ${line.y2}`}
                  fill="none"
                  stroke="#451a03"
                  strokeWidth={strokeWidth + 2}
                  strokeLinecap="round"
                />
                {/* 星轨内线 */}
                <path
                  d={`M ${line.x1} ${line.y1} Q ${line.ctrlX} ${line.ctrlY} ${line.x2} ${line.y2}`}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={line.isDash ? "4,4" : undefined}
                />
              </g>
            );
          })}
        </svg>

        {/* 2D 星球绝对定位节点层 */}
        {nodes.map((node) => {
          const coord = layoutData.get(node.id);
          if (!coord) return null;

          const isLighted = node.is_lighted;
          const isUnlocked = isUnlockedMap.get(node.id) || false;
          const style = PLANET_STYLES[node.category] || PLANET_STYLES.programming;
          
          // 根据哈希确定性配置卫星参数
          const hashVal = getHash(node.id);
          const sat = getSatelliteStyle(hashVal);

          // 星球节点框修正（星球尺寸 56x56px，在中心偏置）
          const size = 56;
          const left = coord.x - size / 2;
          const top = coord.y - size / 2;

          return (
            <div
              key={node.id}
              style={{
                position: "absolute",
                left,
                top,
                width: size,
                height: size,
              }}
              className="z-10"
            >
              <div
                onClick={() => {
                  if (isUnlocked || isLighted) {
                    onNodeSelect(node);
                  }
                }}
                className={`relative w-full h-full flex flex-col items-center justify-center group ${
                  isUnlocked || isLighted ? "cursor-pointer" : "cursor-not-allowed"
                }`}
              >
                {/* 1. 已点亮星球的公转卫星与轨道虚线层 */}
                {isLighted && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      width: sat.radius * 2,
                      height: sat.radius * 2,
                      left: `calc(50% - ${sat.radius}px)`,
                      top: `calc(50% - ${sat.radius}px)`,
                    }}
                  >
                    {/* 公转轨道虚线圆圈 */}
                    <div
                      className="absolute inset-0 border border-dashed border-black/20 rounded-full"
                      style={{ width: "100%", height: "100%" }}
                    />
                    {/* 绕行卫星定位器 (利用旋转动画) */}
                    <div
                      className="absolute w-full h-full"
                      style={{
                        animation: `planet-orbit ${sat.duration}s linear infinite`,
                      }}
                    >
                      {/* 公转卫星小球 */}
                      <div
                        className="absolute border-2 border-black rounded-full shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                        style={{
                          width: sat.size,
                          height: sat.size,
                          backgroundColor: sat.color,
                          top: `calc(50% - ${sat.size / 2}px)`,
                          left: `-${sat.size / 2}px`, // 贴在轨道边缘上
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* 2. 卡通星球 SVG 主体 */}
                <div
                  className={`relative w-[48px] h-[48px] transition-transform duration-300 ${
                    isUnlocked || isLighted
                      ? "group-hover:scale-115 active:scale-90"
                      : "opacity-40"
                  } ${
                    isLighted ? "animate-planet-spin" : !isLighted && isUnlocked ? "animate-bounce" : ""
                  }`}
                  style={{ animationDuration: isLighted ? "5s" : "2s" }}
                >
                  <svg
                    width="100%"
                    height="100%"
                    viewBox="0 0 40 40"
                    className="overflow-visible"
                  >
                    {/* 星球球体阴影描边背景 */}
                    <circle cx="20" cy="20" r="17" fill="#000000" />
                    
                    {/* 星球底色 */}
                    <circle
                      cx="20"
                      cy="20"
                      r="16"
                      fill={isLighted ? style.bgColor : isUnlocked ? "#a7f3d0" : "#e4e4e7"} // 灰色或浅绿
                      stroke="#000000"
                      strokeWidth="2"
                    />

                    {/* 星球地表卡通纹理 */}
                    {isLighted && (
                      <g>
                        {style.hasTexture === "ringed" && style.ringColor && (
                          // 柠檬绿/橙色：带有行星卡通环带（倾斜斜挂的椭圆）
                          <ellipse
                            cx="20"
                            cy="20"
                            rx="22"
                            ry="5"
                            transform="rotate(-20 20 20)"
                            fill="none"
                            stroke={style.ringColor}
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            opacity="0.95"
                            className="overflow-visible"
                          />
                        )}
                        {style.hasTexture === "spots" && (
                          // 算法星：不规则岩浆斑纹 (暗红色)
                          <g fill="#f43f5e" opacity="0.6">
                            <circle cx="12" cy="14" r="3" />
                            <circle cx="28" cy="16" r="4.5" />
                            <circle cx="18" cy="28" r="4" />
                            <circle cx="26" cy="28" r="2" />
                          </g>
                        )}
                        {style.hasTexture === "stripes" && (
                          // 硬件星：表面横向纹理
                          <g stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" opacity="0.4">
                            <path d="M 8,14 L 32,14" />
                            <path d="M 5,20 L 25,20" />
                            <path d="M 12,26 L 35,26" />
                          </g>
                        )}
                        {style.hasTexture === "cloud" && (
                          // 网络星：表面点缀流线星轨雾气
                          <path
                            d="M 6,15 C 10,10 20,10 25,14 C 28,16 31,22 35,20"
                            fill="none"
                            stroke="#8b5cf6"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            opacity="0.5"
                          />
                        )}
                        {style.hasTexture === "sparkles" && (
                          // 数据星：点缀白色星芒
                          <g fill="#ffffff">
                            <path d="M 12,12 L 14,14 L 12,16 L 10,14 Z" />
                            <path d="M 28,26 L 30,28 L 28,30 L 26,28 Z" />
                            <path d="M 26,10 L 27,11 L 26,12 L 25,11 Z" />
                          </g>
                        )}
                      </g>
                    )}

                    {/* 星球的高光 (3D卡通反光球效) */}
                    {isLighted && (
                      <ellipse
                        cx="14"
                        cy="13"
                        rx="4"
                        ry="2"
                        transform="rotate(-25 14 13)"
                        fill="#ffffff"
                        opacity="0.8"
                      />
                    )}
                  </svg>

                  {/* 星球状态覆盖徽标 (锁) */}
                  {!isLighted && !isUnlocked && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-amber-400 border-2 border-black p-0.5 rounded-full shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                      <Lock className="h-3.5 w-3.5 text-black stroke-[3.5px]" />
                    </div>
                  )}

                  {/* 点亮后在侧边显示小白对勾表示已点亮 */}
                  {isLighted && (
                    <div className="absolute -top-1 -right-1 bg-green-400 border-2 border-black p-0.5 rounded-full shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                      <Check className="h-2.5 w-2.5 text-black stroke-[4px]" />
                    </div>
                  )}

                  {/* 熟练度贴纸气泡 */}
                  {isLighted && node.proficiency > 0 && (
                    <div className="absolute -bottom-1 -right-2 bg-white border border-black px-1 py-0.2 rounded-md text-[8px] font-extrabold text-black scale-90 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                      {Math.round(node.proficiency * 100)}%
                    </div>
                  )}
                </div>

                {/* 星球名称小木牌 */}
                <div
                  className={`mt-2 px-2 py-0.5 rounded-lg border-2 border-black text-[9px] font-black text-center whitespace-nowrap max-w-[90px] truncate shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-colors ${
                    isLighted
                      ? "bg-white text-black"
                      : isUnlocked
                      ? "bg-emerald-100 text-emerald-950"
                      : "bg-zinc-200 text-zinc-500 opacity-60"
                  }`}
                >
                  {node.name}
                </div>

                {/* 简易 Hover 卡通气泡描述面板 */}
                <div className="absolute bottom-[65px] scale-0 pointer-events-none group-hover:scale-100 transition-transform origin-bottom duration-200 bg-amber-50 border-2 border-black p-3 rounded-2xl w-56 text-left shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-50 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 font-extrabold">
                    <span className="w-2.5 h-2.5 rounded-full border border-black" style={{ backgroundColor: style.color }} />
                    <span className="text-[10px] text-black">{style.name}</span>
                    <span className={`text-[8px] px-1.5 py-0.2 rounded border border-black ml-auto ${
                      isLighted ? "bg-green-300" : isUnlocked ? "bg-emerald-300" : "bg-zinc-300"
                    }`}>
                      {isLighted ? "已点亮" : isUnlocked ? "可探索" : "已锁定"}
                    </span>
                  </div>
                  <div className="font-extrabold text-xs text-black border-b border-black/10 pb-1 mt-1">
                    {node.name}
                  </div>
                  <p className="text-[10px] text-zinc-700 leading-normal mt-1 whitespace-normal">
                    {node.description || "探索这颗星球，解开其中蕴含的编程谜题！"}
                  </p>
                  {isUnlocked && !isLighted && (
                    <div className="text-[9px] font-black text-emerald-600 mt-1 animate-pulse">
                      点击着陆星球开始练习 ➔
                    </div>
                  )}
                </div>

              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
}
