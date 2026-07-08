import { redirect } from "next/navigation";

// 知识库管理已迁移至管理员后台，用户端自动重定向到学习主脑
export default function KnowledgePage() {
  redirect("/dashboard");
}
