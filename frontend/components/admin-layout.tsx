"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  GitBranch,
  Key,
  ShieldAlert,
  Users,
  Settings,
  HelpCircle,
  Menu,
  ChevronLeft,
  ChevronRight,
  Search,
  MessageSquare,
  ChevronDown,
  User,
  LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminLayoutProps {
  children: React.ReactNode;
  activePath?: string;
}

export default function AdminLayout({ children, activePath }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [nickname, setNickname] = useState("管理员");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("cognilink_token");
      const role = localStorage.getItem("cognilink_user_role");
      const storedNickname = localStorage.getItem("cognilink_user_nickname");
      if (!token) {
        router.push("/login");
        return;
      }
      if (role !== "admin") {
        // 非 admin 角色无权访问管理后台
        router.push("/chat");
        return;
      }
      if (storedNickname) {
        setNickname(storedNickname);
      }
    }
  }, [router]);

  const handleLogout = () => {
    if (confirm("确认退出登录？")) {
      localStorage.removeItem("cognilink_token");
      localStorage.removeItem("cognilink_user_id");
      localStorage.removeItem("cognilink_user_role");
      localStorage.removeItem("cognilink_user_nickname");
      router.push("/login");
    }
  };

  const menuItems = [
    {
      title: "导航",
      isHeader: true,
    },
    {
      title: "Dashboard",
      icon: LayoutDashboard,
      path: "/admin",
    },
    {
      title: "知识库管理",
      icon: BookOpen,
      path: "/admin/knowledge",
    },
    {
      title: "意图管理",
      icon: GitBranch,
      path: "/admin/intents",
      badge: "配置"
    },
    {
      title: "数据通道",
      icon: GitBranch,
      path: "/admin/pipeline",
      children: [
        { title: "流水线管理", path: "/admin/pipeline" },
        { title: "流水线任务", path: "/admin/pipeline/tasks" }
      ]
    },
    {
      title: "关键词映射",
      icon: Key,
      path: "/admin/keywords",
    },
    {
      title: "敏感词库",
      icon: ShieldAlert,
      path: "/admin/sensitive",
    },
    {
      title: "检索",
      isHeader: true,
    },
    {
      title: "用户管理",
      icon: Users,
      path: "/admin/users",
    },
    {
      title: "示例问题",
      icon: HelpCircle,
      path: "/admin/questions",
    },
    {
      title: "系统设置",
      icon: Settings,
      path: "/admin/settings",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0c0f1d] flex text-slate-800 dark:text-slate-100 font-sans antialiased transition-colors duration-300">
      
      {/* Sidebar 侧边栏 */}
      <aside 
        className={`bg-[#121424] text-slate-300 border-r border-[#1f233a] flex flex-col transition-all duration-300 relative z-30 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#1f233a]">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shrink-0 shadow-lg shadow-indigo-500/30">
              R
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-bold text-sm text-white tracking-wider uppercase leading-none">Ragent 管理后台</span>
                <span className="text-[10px] text-indigo-400 mt-1 font-mono">Knowledge Console</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 scrollbar-thin">
          {menuItems.map((item, index) => {
            if (item.isHeader) {
              return !collapsed ? (
                <div key={index} className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {item.title}
                </div>
              ) : (
                <div key={index} className="h-px bg-slate-800/50 my-3" />
              );
            }

            const Icon = item.icon || LayoutDashboard;
            const isSelected = pathname === item.path! || pathname.startsWith(item.path! + "/");

            return (
              <div key={index}>
                <Link
                  href={item.path!}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group relative ${
                    isSelected
                      ? "bg-indigo-600/15 text-white font-medium shadow-inner border-l-2 border-indigo-500"
                      : "hover:bg-slate-800/40 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 shrink-0 transition-colors ${
                      isSelected ? "text-indigo-400" : "text-slate-400 group-hover:text-slate-200"
                    }`} />
                    {!collapsed && <span>{item.title}</span>}
                  </div>

                  {!collapsed && item.badge && (
                    <span className="text-[9px] font-semibold bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded">
                      {item.badge}
                    </span>
                  )}

                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-slate-100 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md z-40">
                      {item.title}
                    </div>
                  )}
                </Link>
                
                {/* Nested items if not collapsed and has childs */}
                {!collapsed && item.children && isSelected && (
                  <div className="ml-7 mt-1.5 space-y-1 pl-2 border-l border-slate-800">
                    {item.children.map((child, cIdx) => (
                      <Link
                        key={cIdx}
                        href={child.path}
                        className={`block py-1.5 px-2 text-xs rounded transition-colors ${
                          pathname === child.path
                            ? "text-indigo-400 font-semibold"
                            : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        {child.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-[#1f233a] flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span>v1.0.0</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="text-slate-400 hover:bg-slate-800 hover:text-slate-200 h-8 w-8 ml-auto"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Header 顶部头部栏 */}
        <header className="h-16 bg-white dark:bg-[#121424] border-b border-slate-200 dark:border-[#1f233a] flex items-center justify-between px-6 z-20 shadow-sm transition-colors duration-300">
          
          {/* Breadcrumb / Search */}
          <div className="flex items-center gap-4 flex-1">
            <div className="relative max-w-xs w-full hidden md:block">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <Search className="h-4 w-4" />
              </span>
              <input
                type="text"
                placeholder="检索知识库..."
                className="w-full text-xs pl-9 pr-8 py-2 rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-sans"
              />
              <span className="absolute right-3 top-2.5 text-[9px] font-mono text-slate-400 border dark:border-slate-700 px-1 py-0.5 rounded">Ctrl K</span>
            </div>

            {/* Breadcrumb info */}
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <span className="hover:text-indigo-500 transition-colors cursor-pointer">首页</span>
              <span>/</span>
              <span className="text-slate-600 dark:text-slate-300 capitalize">
                {pathname.split("/").filter(Boolean)[1] || "dashboard"}
              </span>
            </div>
          </div>

          {/* Right Area (Controls) */}
          <div className="flex items-center gap-4">
            
            {/* 返回聊天 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/chat")}
              className="text-xs text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#2b2f4f] hover:bg-slate-50 dark:hover:bg-slate-800 h-9 rounded-lg"
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              返回聊天
            </Button>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 p-1.5 rounded-lg transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold font-sans shadow-md shadow-indigo-500/20">
                  AD
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 hidden md:block">{nickname}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 hidden md:block" />
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#151829] border border-slate-200 dark:border-[#1f233a] rounded-lg shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800/50">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{nickname}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">CogniLink 管理员</p>
                  </div>
                  
                  {/* Switch to user view */}
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      router.push("/");
                    }}
                    className="w-full text-left px-4 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2"
                  >
                    <User className="h-3.5 w-3.5 text-indigo-400" />
                    切换为普通用户视角
                  </button>

                  <div className="h-px bg-slate-100 dark:bg-slate-800/50 my-1"></div>
                  
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      router.push("/settings");
                    }}
                    className="w-full text-left px-4 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2"
                  >
                    <Settings className="h-3.5 w-3.5 text-slate-400" />
                    账号设置
                  </button>

                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      handleLogout();
                    }}
                    className="w-full text-left px-4 py-2 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center gap-2"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    安全退出
                  </button>
                </div>
              )}
            </div>

          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#0c0f1d] p-6 transition-colors duration-300">
          {children}
        </main>
      </div>

    </div>
  );
}
