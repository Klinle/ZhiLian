# 基础镜像使用 Python 3.11 官方精简 slim 镜像
FROM python:3.11-slim-bookworm

# 设置工作目录
WORKDIR /app

# 设置 Python 环境变量，防止 Python 写入 .pyc 且确保输出无缓冲实时打印到控制台
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 安装系统级依赖库（编译 C/C++ 依赖如 numpy/scipy 需要的基本环境）
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制 Python 依赖描述文件
COPY requirements.txt .

# 换源加速，并在无缓存缓存下安全安装 Python 包
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 复制后端源码到工作目录
COPY . .

# 暴露 FastAPI API 网关默认的 8000 端口
EXPOSE 8000

# 启动命令：运行 Uvicorn 服务监听所有主机网卡
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
