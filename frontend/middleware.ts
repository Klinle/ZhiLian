import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 认证中间件：在服务端拦截所有未认证请求
 * - /login 路径免认证
 * - 其他所有路径需要 cognilink_token cookie
 * - 没有 cookie 则重定向到 /login
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 登录页免认证
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // 检查认证 cookie
  const token = request.cookies.get("cognilink_token")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * 匹配所有路径，但排除：
   * - _next/static, _next/image (Next.js 静态资源)
   * - favicon.ico
   * - 公共静态文件（svg, png, jpg 等）
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|ico)$).*)",
  ],
};
