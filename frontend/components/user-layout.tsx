"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Brain,
  Grid3X3,
  Shield,
  Activity,
  Network,
  Award,
  Settings,
  LogOut,
  Sparkles,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useChatAssistantStore } from "@/stores/chat-assistant";

interface UserLayoutProps {
  children: React.ReactNode;
  activePath?: string;
}

export default function UserLayout({ children, activePath }: UserLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userRole, setUserRole] = useState<string>("");
  const [nickname, setNickname] = useState<string>("");
  
  const openAssistant = useChatAssistantStore((state) => state.openAssistant);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("cognilink_token");
      if (!token) {
        router.push("/login");
        return;
      }
      setUserRole(localStorage.getItem("cognilink_user_role") || "student");
      setNickname(localStorage.getItem("cognilink_user_nickname") || "学生");
    }
  }, [router]);

  const handleLogout = () => {
    if (confirm("确认退出登录？")) {
      localStorage.removeItem("cognilink_token");
      localStorage.removeItem("cognilink_user_id");
      localStorage.removeItem("cognilink_user_role");
      localStorage.removeItem("cognilink_user_nickname");
      document.cookie = "cognilink_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      router.push("/login");
    }
  };

  if (!mounted) {
    return <div className="min-h-screen bg-background" />;
  }

  // 导航项定义
  const navItems = [
    { name: "学习主脑", href: "/dashboard", icon: Grid3X3 },
    { name: "知识图谱", href: "/graph", icon: Network },
    { name: "在线练习", href: "/practice", icon: Award },
    { name: "知识库", href: "/knowledge", icon: BookOpen },
    { name: "学习画像", href: "/profile", icon: Activity },
    { name: "记忆系统", href: "/memories", icon: Brain },
    { name: "系统设置", href: "/settings", icon: Settings },
  ];

  const currentPath = activePath || pathname;

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground">
      {/* 侧边栏 */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-16"
        } bg-slate-50/80 dark:bg-zinc-950/40 border-r border-gray-200 dark:border-zinc-800 transition-all duration-300 flex flex-col z-20 shrink-0`}
      >
        {/* 头部 Logo */}
        <div className="p-4 flex items-center justify-between border-b border-gray-200 dark:border-zinc-800 h-16">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                C
              </div>
              <span className="font-bold text-lg tracking-wide bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                CogniLink
              </span>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg mx-auto">
              C
            </div>
          )}
          
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-lg transition-colors text-gray-500"
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* 召唤 AI 导师快捷按钮 */}
        <div className="p-3 border-b border-gray-200 dark:border-zinc-800">
          <button
            onClick={() => openAssistant()}
            className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-sm transition-all shadow-md shadow-indigo-200 dark:shadow-none hover:shadow-lg cursor-pointer ${
              !sidebarOpen && "px-0"
            }`}
            title="召唤 AI 导师"
          >
            <Sparkles className="h-4 w-4 animate-pulse shrink-0" />
            {sidebarOpen && <span>召唤 AI 导师</span>}
          </button>
        </div>

        {/* 导航栏 */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {navItems.map((item) => {
            const isActive = currentPath === item.href || (item.href !== "/dashboard" && currentPath.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-100 dark:shadow-none"
                    : "text-gray-600 dark:text-zinc-400 hover:bg-gray-200/50 dark:hover:bg-zinc-800/50 hover:text-gray-900 dark:hover:text-zinc-100"
                }`}
                title={item.name}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-gray-400 dark:text-zinc-500 group-hover:text-gray-600 dark:group-hover:text-zinc-300"}`} />
                {sidebarOpen && <span className="truncate">{item.name}</span>}
                {!sidebarOpen && (
                  <div className="absolute left-16 scale-0 group-hover:scale-100 bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded-lg transition-transform z-50 whitespace-nowrap shadow-md">
                    {item.name}
                  </div>
                )}
              </Link>
            );
          })}

          {/* 管理后台入口 */}
          {(userRole === "admin" || userRole === "teacher") && (
            <Link
              href="/admin"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all group relative ${
                currentPath.startsWith("/admin")
                  ? "bg-violet-600 text-white"
                  : "text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20"
              }`}
              title="管理后台"
            >
              <Shield className="h-4 w-4 shrink-0" />
              {sidebarOpen && <span className="truncate">管理后台</span>}
              {!sidebarOpen && (
                <div className="absolute left-16 scale-0 group-hover:scale-100 bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded-lg transition-transform z-50 whitespace-nowrap shadow-md">
                  管理后台
                </div>
              )}
            </Link>
          )}
        </nav>

        {/* 用户底部卡片 */}
        <div className="p-3 border-t border-gray-200 dark:border-zinc-800 bg-gray-100/50 dark:bg-zinc-900/30">
          <div className={`flex items-center justify-between gap-2 ${!sidebarOpen && "flex-col"}`}>
            <div className="flex items-center gap-2 truncate">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                {nickname ? nickname[0].toUpperCase() : "U"}
              </div>
              {sidebarOpen && (
                <div className="truncate text-xs">
                  <span className="font-semibold text-gray-800 dark:text-zinc-200 block truncate leading-tight">
                    {nickname}
                  </span>
                  <span className="text-[10px] text-gray-400 block mt-0.5 capitalize">
                    {userRole === "admin" ? "管理员" : userRole === "teacher" ? "教师" : "学生"}
                  </span>
                </div>
              )}
            </div>

            <div className={`flex items-center gap-1 ${!sidebarOpen && "mt-2 flex-col"}`}>
              <Link
                href="/settings"
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-800 text-gray-500 dark:text-zinc-400 rounded-lg transition-colors"
                title="设置"
              >
                <Settings className="h-3.5 w-3.5" />
              </Link>
              <button
                onClick={handleLogout}
                className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-500 rounded-lg transition-colors cursor-pointer"
                title="退出登录"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* 右侧主内容区 */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {children}
      </main>
    </div>
  );
}
