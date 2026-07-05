"use client";

import React, { useState } from "react";
import AdminLayout from "@/components/admin-layout";
import { 
  Search, 
  RotateCw, 
  Edit2, 
  Trash2, 
  UserPlus,
  Shield,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface UserItem {
  id: string;
  name: string;
  description: string;
  role: "管理员" | "使用人员";
  createdAt: string;
  updatedAt: string;
  avatarLetter: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<UserItem[]>([
    {
      id: "1",
      name: "admin",
      description: "默认管理员",
      role: "管理员",
      createdAt: "2026/3/8 15:55:44",
      updatedAt: "2026/3/8 15:55:44",
      avatarLetter: "AD"
    },
    {
      id: "2",
      name: "student_01",
      description: "普通学生账号",
      role: "使用人员",
      createdAt: "2026/7/1 09:21:10",
      updatedAt: "2026/7/4 20:15:30",
      avatarLetter: "ST"
    },
    {
      id: "3",
      name: "teacher_wang",
      description: "知识库贡献者",
      role: "使用人员",
      createdAt: "2026/7/3 14:10:00",
      updatedAt: "2026/7/3 16:30:15",
      avatarLetter: "TC"
    }
  ]);

  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserItem | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    role: "使用人员" as "管理员" | "使用人员"
  });

  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.role.includes(searchQuery)
  );

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    
    const newUser: UserItem = {
      id: Date.now().toString(),
      name: formData.name,
      description: formData.description || "普通用户",
      role: formData.role,
      createdAt: new Date().toLocaleString(),
      updatedAt: new Date().toLocaleString(),
      avatarLetter: formData.name.substring(0, 2).toUpperCase()
    };

    setUsers([...users, newUser]);
    setShowAddModal(false);
    setFormData({ name: "", description: "", role: "使用人员" });
  };

  const handleEditUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setUsers(users.map(user => 
      user.id === currentUser.id 
        ? { 
            ...user, 
            name: formData.name, 
            description: formData.description, 
            role: formData.role,
            updatedAt: new Date().toLocaleString()
          }
        : user
    ));
    setShowEditModal(false);
    setCurrentUser(null);
  };

  const handleDeleteUser = (id: string) => {
    if (confirm("确定要删除该用户吗？")) {
      setUsers(users.filter(user => user.id !== id));
    }
  };

  const openEditModal = (user: UserItem) => {
    setCurrentUser(user);
    setFormData({
      name: user.name,
      description: user.description,
      role: user.role
    });
    setShowEditModal(true);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        
        {/* Breadcrumb info */}
        <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
          <span>首页</span>
          <span>/</span>
          <span className="text-slate-600 dark:text-slate-300">用户管理</span>
        </div>

        {/* Header Title Section */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">用户管理</h1>
          <p className="text-sm text-slate-500 mt-1">管理后台账号与角色权限</p>
        </div>

        {/* Filter and Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white dark:bg-[#121424] p-4 rounded-xl border border-slate-100 dark:border-[#1f233a] shadow-sm">
          <div className="relative w-full sm:w-80">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              placeholder="搜索用户名或角色"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-4 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-sans"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#2b2f4f] hover:bg-slate-50 dark:hover:bg-slate-800 h-9 rounded-lg"
              onClick={() => setSearchQuery("")}
            >
              搜索
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#2b2f4f] hover:bg-slate-50 dark:hover:bg-slate-800 h-9 rounded-lg"
              onClick={() => alert("刷新成功")}
            >
              <RotateCw className="h-3.5 w-3.5 mr-1" />
              刷新
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setFormData({ name: "", description: "", role: "使用人员" });
                setShowAddModal(true);
              }}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white h-9 rounded-lg px-4"
            >
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              新增用户
            </Button>
          </div>
        </div>

        {/* User Table Card */}
        <div className="bg-white dark:bg-[#121424] rounded-xl border border-slate-100 dark:border-[#1f233a] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/40 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800">
                  <th className="py-4 px-6">用户</th>
                  <th className="py-4 px-6">角色</th>
                  <th className="py-4 px-6">创建时间</th>
                  <th className="py-4 px-6">更新时间</th>
                  <th className="py-4 px-6 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-600 dark:text-slate-300">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                      
                      {/* User profile */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
                            {user.avatarLetter}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-850 dark:text-white text-sm">{user.name}</span>
                            <span className="text-[10px] text-slate-400 mt-0.5">{user.description}</span>
                          </div>
                        </div>
                      </td>

                      {/* Role pill */}
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          user.role === "管理员" 
                            ? "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400" 
                            : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                        }`}>
                          {user.role}
                        </span>
                      </td>

                      {/* Created date */}
                      <td className="py-4 px-6 font-mono text-slate-400">{user.createdAt}</td>

                      {/* Updated date */}
                      <td className="py-4 px-6 font-mono text-slate-400">{user.updatedAt}</td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right space-x-1 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditModal(user)}
                          className="h-8 w-8 text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-850"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteUser(user.id)}
                          className="h-8 w-8 text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-850"
                          disabled={user.name === "admin"} // Protect default admin
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>

                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                      无匹配用户数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer / Pagination */}
          <div className="px-6 py-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 bg-slate-50/20 dark:bg-slate-800/10">
            <span>共 {filteredUsers.length} 条</span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[10px] text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                disabled
              >
                上一页
              </Button>
              <span className="px-3 py-1 font-mono text-[10px] bg-slate-100 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300">
                1 / 1
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[10px] text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                disabled
              >
                下一页
              </Button>
            </div>
          </div>
        </div>

        {/* Modal: Add User */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#151829] w-full max-w-md rounded-xl border border-slate-100 dark:border-[#1f233a] shadow-2xl p-6 text-slate-800 dark:text-slate-100 animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-indigo-500" />
                  新增用户
                </h3>
                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleAddUser} className="space-y-4 mt-4 text-xs">
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-500">用户名</label>
                  <input
                    type="text"
                    required
                    placeholder="请输入用户名"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full pl-3 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-500">角色定位 / 描述</label>
                  <input
                    type="text"
                    placeholder="例如：高级数据架构师"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full pl-3 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-500">系统角色</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as "管理员" | "使用人员" })}
                    className="w-full pl-3 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="使用人员">使用人员</option>
                    <option value="管理员">管理员</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowAddModal(false)}
                    className="text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 h-9"
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white h-9"
                  >
                    确定
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit User */}
        {showEditModal && currentUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#151829] w-full max-w-md rounded-xl border border-slate-100 dark:border-[#1f233a] shadow-2xl p-6 text-slate-800 dark:text-slate-100 animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-indigo-500" />
                  修改用户信息
                </h3>
                <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleEditUser} className="space-y-4 mt-4 text-xs">
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-500">用户名</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full pl-3 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    disabled={currentUser.name === "admin"}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-500">描述</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full pl-3 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-500">系统角色</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as "管理员" | "使用人员" })}
                    className="w-full pl-3 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    disabled={currentUser.name === "admin"}
                  >
                    <option value="使用人员">使用人员</option>
                    <option value="管理员">管理员</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowEditModal(false)}
                    className="text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 h-9"
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white h-9"
                  >
                    保存
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
