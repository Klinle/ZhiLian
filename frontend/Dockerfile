# 1. 依赖安装与构建阶段
FROM node:20-alpine AS builder
WORKDIR /app

# 复制依赖包描述文件
COPY package.json package-lock.json ./

# 换源并利用 clean install 快速安装构建时依赖
RUN npm config set registry https://registry.npmmirror.com && \
    npm ci

# 复制前端源码到工作目录
COPY . .

# 声明并设置构建时 API 网关的环境变量（Next.js 打包时需将该环境变量硬编码打进静态资产中）
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# 构建 Next.js 生产包
RUN npm run build

# 2. 极简生产运行阶段，大幅减少发布镜像体积
FROM node:20-alpine AS runner
WORKDIR /app

# 设置生产环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 从构建阶段复制运行所需的最低精简资产和 node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

# 暴露 Next.js 端口
EXPOSE 3000

# 运行 Next.js 生产服务器
CMD ["npm", "run", "start"]
