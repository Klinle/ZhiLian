"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Brain,
  Grid3X3,
  Shield,
  Activity,
  Network,
  Award,
  Settings,
  LogOut,
  Sparkles,
  ChevronDown,
  Menu,
  X,
  User,
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
  const [userRole, setUserRole] = useState<string>("");
  const [nickname, setNickname] = useState<string>("");
  const [navOpen, setNavOpen] = useState(false);       // 小屏下拉导航菜单
  const [profileOpen, setProfileOpen] = useState(false); // 头像下拉菜单
  const navRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

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

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setNavOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const navItems = [
    { name: "学习主脑", href: "/dashboard", icon: Grid3X3 },
    { name: "知识图谱", href: "/graph", icon: Network },
    { name: "在线练习", href: "/practice", icon: Award },
    { name: "学习画像", href: "/profile", icon: Activity },
    { name: "记忆系统", href: "/memories", icon: Brain },
  ];

  const currentPath = activePath || pathname;

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden text-foreground">

      {/* ── 顶部导航栏 ── */}
      <header className="h-14 shrink-0 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md border-b border-gray-200/80 dark:border-zinc-800/80 flex items-center px-4 md:px-6 gap-4 z-30 shadow-sm">

        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0 group">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
            C
          </div>
          <span className="font-bold text-sm tracking-wide bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent hidden sm:block">
            CogniLink
          </span>
        </Link>

        {/* ── 大屏：扁平导航链接 ── */}
        <nav className="hidden md:flex items-center gap-0.5 flex-1 mx-2">
          {navItems.map((item) => {
            const isActive =
              currentPath === item.href ||
              (item.href !== "/dashboard" && currentPath.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400"
                    : "text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800/60 hover:text-gray-800 dark:hover:text-zinc-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {item.name}
              </Link>
            );
          })}

          {/* 管理后台入口（管理员/教师） */}
          {(userRole === "admin" || userRole === "teacher") && (
            <Link
              href="/admin"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ml-1 ${
                currentPath.startsWith("/admin")
                  ? "bg-violet-50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400"
                  : "text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20"
              }`}
            >
              <Shield className="h-3.5 w-3.5 shrink-0" />
              管理后台
            </Link>
          )}
        </nav>

        {/* ── 小屏：下拉导航菜单按钮 ── */}
        <div className="flex md:hidden flex-1" ref={navRef}>
          <button
            onClick={() => setNavOpen(!navOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-800/80 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <Menu className="h-4 w-4" />
            导航菜单
            <ChevronDown
              className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${
                navOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* 小屏下拉面板 */}
          {navOpen && (
            <div className="absolute top-14 left-0 right-0 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 shadow-xl z-40 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-3 grid grid-cols-3 gap-2">
                {navItems.map((item) => {
                  const isActive =
                    currentPath === item.href ||
                    (item.href !== "/dashboard" && currentPath.startsWith(item.href));
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setNavOpen(false)}
                      className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400"
                          : "text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-800"
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${isActive ? "text-indigo-500" : "text-gray-400"}`} />
                      {item.name}
                    </Link>
                  );
                })}
                {(userRole === "admin" || userRole === "teacher") && (
                  <Link
                    href="/admin"
                    onClick={() => setNavOpen(false)}
                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-all"
                  >
                    <Shield className="h-5 w-5" />
                    管理后台
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── 右侧操作区 ── */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">

          {/* AI 导师召唤按钮 */}
          <button
            onClick={() => openAssistant()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold transition-all shadow-sm shadow-indigo-200 dark:shadow-none hover:shadow-md cursor-pointer"
            title="召唤 AI 导师"
          >
            <Sparkles className="h-3.5 w-3.5 animate-pulse shrink-0" />
            <span className="hidden sm:inline">AI 导师</span>
          </button>

          {/* 用户头像下拉 */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-1.5 p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title={nickname}
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                {nickname ? nickname[0].toUpperCase() : "U"}
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 text-gray-400 hidden sm:block transition-transform duration-200 ${
                  profileOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                {/* 用户信息 */}
                <div className="px-4 py-2.5 border-b border-gray-100 dark:border-zinc-800">
                  <p className="text-xs font-bold text-gray-800 dark:text-zinc-200">{nickname}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {userRole === "admin" ? "管理员" : userRole === "teacher" ? "教师" : "学生"}
                  </p>
                </div>

                <Link
                  href="/profile"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <User className="h-3.5 w-3.5 text-gray-400" />
                  学习画像
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Settings className="h-3.5 w-3.5 text-gray-400" />
                  系统设置
                </Link>

                <div className="h-px bg-gray-100 dark:bg-zinc-800 my-1" />

                <button
                  onClick={() => { setProfileOpen(false); handleLogout(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/10 transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── 主内容区（铺满剩余高度） ── */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {children}
      </main>
    </div>
  );
}
