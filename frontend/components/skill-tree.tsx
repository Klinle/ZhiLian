"use client";

import React, { useMemo } from "react";
import SkillNode, { CATEGORY_COLORS } from "./skill-node";
import type { KnowledgeNode } from "@/types";

interface GraphRelation {
  source: string;
  target: string;
  relation_type: string;
}

interface SkillTreeProps {
  nodes: KnowledgeNode[];
  relations: GraphRelation[];
  onNodeSelect: (node: KnowledgeNode) => void;
}

const CATEGORY_ORDER = ["programming", "dsa", "organization", "os", "network", "database"];

const CATEGORY_NAMES: Record<string, string> = {
  programming: "编程基础",
  dsa: "数据结构",
  organization: "计算机组成",
  os: "操作系统",
  network: "计算机网络",
  database: "数据库",
};

export default function SkillTree({ nodes, relations, onNodeSelect }: SkillTreeProps) {
  // 1. 节点位置计算 (错落蜂巢网格)
  const layoutData = useMemo(() => {
    const nodesById = new Map<string, KnowledgeNode>();
    nodes.forEach((n) => nodesById.set(n.id, n));

    // 按分类对节点进行分组
    const groups: Record<string, KnowledgeNode[]> = {};
    CATEGORY_ORDER.forEach((cat) => {
      groups[cat] = [];
    });

    nodes.forEach((node) => {
      if (groups[node.category]) {
        groups[node.category].push(node);
      } else {
        // 未定义分类兜底
        if (!groups["other"]) groups["other"] = [];
        groups["other"].push(node);
      }
    });

    // 每一组内部，按 pagerank 权重排序，保证前置靠前，重要性合理分布
    const orderedCategories = [...CATEGORY_ORDER];
    if (groups["other"]) orderedCategories.push("other");

    const nodeCoords = new Map<string, { x: number; y: number; left: number; top: number }>();
    
    // 行间距与列间距
    const rowHeight = 130;
    const colWidth = 140;
    // 左侧标签列宽（与 skill-tree.tsx 中定义的 LABEL_COL_WIDTH 保持一致）
    const labelColWidth = 96;

    orderedCategories.forEach((cat, rIndex) => {
      // 排序：可以先按 weight 降序，然后如果有前置依赖的做拓扑修正，这里简单按照 node 里的 code 或 ID 来微调顺序保证一致性
      const catNodes = groups[cat].sort((a, b) => b.pagerank_weight - a.pagerank_weight);
      
      catNodes.forEach((node, cIndex) => {
        // 奇数行进行水平错落偏移，使得六边形更紧凑工整 (蜂巢式布局)
        // left 基准向右偏移 labelColWidth，避免与左侧分类标签列重叠
        const offset = (rIndex % 2) * 70;
        const left = cIndex * colWidth + offset + labelColWidth + 12;
        const top = rIndex * rowHeight + 40;

        nodeCoords.set(node.id, {
          x: cIndex,
          y: rIndex,
          left,
          top,
        });
      });
    });

    // 2. 解锁状态判定
    // 前置依赖映射：target -> list of source_ids
    const requiresMap = new Map<string, string[]>();
    relations.forEach((rel) => {
      if (rel.relation_type === "requires") {
        const list = requiresMap.get(rel.target) || [];
        list.push(rel.source);
        requiresMap.set(rel.target, list);
      }
    });

    const isUnlockedMap = new Map<string, boolean>();
    nodes.forEach((node) => {
      const parentIds = requiresMap.get(node.id);
      if (!parentIds || parentIds.length === 0) {
        // 没有前置依赖，默认解锁
        isUnlockedMap.set(node.id, true);
      } else {
        // 检查所有前置依赖是否被点亮 (is_lighted)
        const allParentsLighted = parentIds.every((pId) => {
          const parentNode = nodesById.get(pId);
          return parentNode ? parentNode.is_lighted : false;
        });
        isUnlockedMap.set(node.id, allParentsLighted);
      }
    });

    return { nodeCoords, isUnlockedMap, nodesById };
  }, [nodes, relations]);

  const { nodeCoords, isUnlockedMap, nodesById } = layoutData;

  // 3. 计算连线 (SVG line paths)
  const lines = useMemo(() => {
    const list: Array<{
      id: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      isLighted: boolean; // 是否是已解锁的通路
      isLocked: boolean;  // 是否还是未解锁锁定的
      color: string;
      isDash: boolean;
    }> = [];

    relations.forEach((rel, idx) => {
      const srcCoord = nodeCoords.get(rel.source);
      const tgtCoord = nodeCoords.get(rel.target);
      const srcNode = nodesById.get(rel.source);
      const tgtNode = nodesById.get(rel.target);

      if (srcCoord && tgtCoord && srcNode && tgtNode) {
        // 六边形宽高是 80 x 92，中心偏移偏右 40，偏下 46
        const x1 = srcCoord.left + 40;
        const y1 = srcCoord.top + 46;
        const x2 = tgtCoord.left + 40;
        const y2 = tgtCoord.top + 46;

        const srcLighted = srcNode.is_lighted;
        const tgtLighted = tgtNode.is_lighted;
        const tgtUnlocked = isUnlockedMap.get(rel.target) || false;

        const color = CATEGORY_COLORS[srcNode.category] || "#6366f1";
        
        list.push({
          id: `${rel.source}-${rel.target}-${idx}`,
          x1,
          y1,
          x2,
          y2,
          isLighted: srcLighted && tgtLighted,
          isLocked: !tgtUnlocked,
          color,
          isDash: rel.relation_type === "extends",
        });
      }
    });

    return list;
  }, [relations, nodeCoords, nodesById, isUnlockedMap]);

  // 计算树容器的总宽和总高，让滚动条合理自适应
  // 左侧分类标签列宽（px），与节点内容区对齐
  const LABEL_COL_WIDTH = 96;

  const { width, height } = useMemo(() => {
    let maxLeft = 800;
    let maxTop = 600;
    nodeCoords.forEach((coord) => {
      if (coord.left + 160 > maxLeft) maxLeft = coord.left + 160;
      if (coord.top + 160 > maxTop) maxTop = coord.top + 160;
    });
    // 总宽加上左侧标签列宽度，避免节点被遮挡
    return { width: maxLeft + LABEL_COL_WIDTH, height: maxTop };
  }, [nodeCoords]);

  return (
    // 外层：仅负责滚动；内层：固定尺寸画布（分类标签 + SVG 连线 + 节点），随滚动整体移动
    <div className="w-full h-full overflow-auto bg-slate-50/20 dark:bg-zinc-950/10 rounded-2xl border border-gray-200/80 dark:border-zinc-800 p-2 min-h-[500px]">

      {/* 内容画布：宽高由节点坐标范围决定，小屏可横向滚动 */}
      <div style={{ width: Math.max(width, 480), height, position: "relative" }}>
        {/* 连接关系 SVG 连线层 */}
        <svg
          width={width}
          height={height}
          className="absolute inset-0 pointer-events-none z-0"
        >
          {/* SVG 标记箭头 */}
          <defs>
            {CATEGORY_ORDER.map((cat) => (
              <marker
                key={cat}
                id={`arrow-${cat}`}
                viewBox="0 0 10 10"
                refX="28" // 稍微偏外以避开六边形边框
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill={CATEGORY_COLORS[cat]} />
              </marker>
            ))}
            <marker
              id="arrow-locked"
              viewBox="0 0 10 10"
              refX="28"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#d1d5db" />
            </marker>
          </defs>

          {/* 渲染线 */}
          {lines.map((line) => {
            const strokeColor = line.isLocked
              ? "#e5e7eb"
              : line.isLighted
              ? line.color
              : `${line.color}60`; // 未掌握通路用半透明

            return (
              <line
                key={line.id}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={strokeColor}
                strokeWidth={line.isLighted ? 2.5 : 1.5}
                strokeDasharray={line.isDash ? "4,4" : undefined}
                className="transition-colors duration-300"
                markerEnd={
                  line.isLocked
                    ? "url(#arrow-locked)"
                    : `url(#arrow-${CATEGORY_ORDER[0]})` // 简单复用默认颜色，或可单独计算分类
                }
              />
            );
          })}
        </svg>

        {/* 分类行标题导览（内嵌在画布中，随横向滚动一同移动） */}
        <div
          style={{ width: LABEL_COL_WIDTH - 8, position: "absolute", left: 4, top: 40 }}
          className="flex flex-col gap-0 z-20 pointer-events-none"
        >
          {CATEGORY_ORDER.map((cat, rIndex) => (
            <div
              key={cat}
              style={{ height: 130, paddingTop: rIndex === 0 ? 0 : undefined }}
              className="flex items-start"
            >
              <div className="h-6 flex items-center bg-white/80 dark:bg-zinc-900/80 px-2 py-0.5 rounded-full border border-gray-100 dark:border-zinc-800 shadow-sm pointer-events-auto text-[10px] font-bold text-gray-400 dark:text-zinc-500">
                <span className="w-1.5 h-1.5 rounded-full mr-1.5 shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                {CATEGORY_NAMES[cat]}
              </div>
            </div>
          ))}
        </div>

        {/* 技能节点绝对定位挂载 */}
        {nodes.map((node) => {
          const coord = nodeCoords.get(node.id);
          const isUnlocked = isUnlockedMap.get(node.id) || false;
          if (!coord) return null;

          return (
            <div
              key={node.id}
              style={{
                position: "absolute",
                left: coord.left,
                top: coord.top,
              }}
              className="z-10"
            >
              <SkillNode
                node={node}
                isUnlocked={isUnlocked}
                onClick={onNodeSelect}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
