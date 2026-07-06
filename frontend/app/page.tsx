import { redirect } from "next/navigation";

/**
 * 根路径：直接重定向到 /chat
 * 认证由 middleware.ts 在服务端拦截，未登录用户会被重定向到 /login
 */
export default function Home() {
  redirect("/chat");
}
