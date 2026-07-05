"use client";

import React, { useState } from "react";
import AdminLayout from "@/components/admin-layout";
import { Settings, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminSettings() {
  const [model, setModel] = useState("gpt-4o");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);

  const handleSave = () => {
    alert("系统配置保存成功");
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">系统设置</h1>
          <p className="text-sm text-slate-500 mt-1">管理大模型核心推理参数与检索阈值等全局参数。</p>
        </div>

        <div className="bg-white dark:bg-[#121424] rounded-xl border border-slate-100 dark:border-[#1f233a] p-6 shadow-sm max-w-2xl">
          <h3 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2 mb-6">
            <Settings className="h-4 w-4 text-indigo-500" />
            大模型推理参数
          </h3>

          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-500">默认大语言模型</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full pl-3 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="gpt-4o">GPT-4o (OpenAI)</option>
                <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (Anthropic)</option>
                <option value="qwen-max">Qwen-Max (阿里云通义)</option>
                <option value="ollama-llama3">Llama 3 (本地大模型)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="font-semibold text-slate-500">温度系数 (Temperature)</label>
                <span className="font-mono text-slate-400">{temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-400">较低的值输出结果较稳定且准确，较高的值更具创造性和多样性。</p>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-500">最大生成 Token 数 (Max Tokens)</label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 256)}
                className="w-full pl-3 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-end pt-6">
              <Button onClick={handleSave} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 h-9">
                <Save className="h-4 w-4 mr-1.5" /> 保存配置
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
