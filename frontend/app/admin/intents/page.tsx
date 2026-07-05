"use client";

import React, { useState } from "react";
import AdminLayout from "@/components/admin-layout";
import { GitBranch, Plus, ToggleLeft, ToggleRight, Sparkles, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminIntents() {
  const [intents, setIntents] = useState([
    { name: "知识库问答 (RAG)", code: "intent_rag", enabled: true, desc: "当匹配特定领域学术问题或产品文档时触发，优先检索本地知识库" },
    { name: "日常闲聊", code: "intent_chitchat", enabled: true, desc: "当匹配日常打招呼、语气词时触发，直达大模型原生闲聊" },
    { name: "学习计划制定", code: "intent_study_plan", enabled: true, desc: "当匹配包含'我想学习'、'生成学习计划'等关键词时触发" },
    { name: "记忆查询与提取", code: "intent_memory_query", enabled: false, desc: "当匹配包含'你还记得我吗'、'我之前说过什么'时自动触发记忆提取" }
  ]);

  const toggleIntent = (idx: number) => {
    const updated = [...intents];
    updated[idx].enabled = !updated[idx].enabled;
    setIntents(updated);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">意图管理</h1>
            <p className="text-sm text-slate-500 mt-1">配置用户输入意图解析路由，控制大模型在特定场景下的推理策略。</p>
          </div>
          <Button className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 h-9 font-medium shrink-0 self-start sm:self-auto">
            <Plus className="h-4 w-4 mr-1.5" />
            新增意图规则
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {intents.map((intent, idx) => (
            <div key={idx} className="bg-white dark:bg-[#121424] rounded-xl border border-slate-100 dark:border-[#1f233a] p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-500/5 to-transparent rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                    <GitBranch className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-white text-sm">{intent.name}</h3>
                    <span className="text-[10px] font-mono text-slate-400">{intent.code}</span>
                  </div>
                </div>

                <button onClick={() => toggleIntent(idx)} className="text-slate-400 hover:text-indigo-500 transition-colors">
                  {intent.enabled ? (
                    <ToggleRight className="h-7 w-7 text-indigo-500" />
                  ) : (
                    <ToggleLeft className="h-7 w-7 text-slate-400" />
                  )}
                </button>
              </div>

              <p className="text-xs text-slate-400 mt-4 leading-relaxed">{intent.desc}</p>
              
              <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  基于 LiteLLM 驱动
                </span>
                <span className="hover:text-indigo-400 transition-colors cursor-pointer flex items-center gap-0.5">
                  <HelpCircle className="h-3 w-3" />
                  测试此规则
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
