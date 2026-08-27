#!/usr/bin/env bash
# 好好吃饭 · 服务器端 Redis 与环境依赖准备（幂等，可重复执行）
# 用法（服务器上）：bash /opt/good-good-eat/deploy/setup-redis.sh
# 职责：
#   1) 安装 Redis 服务并开机自启（Alibaba Cloud Linux / CentOS 系 dnf/yum）
#   2) 给 server/.venv 装 pip（ensurepip）与 redis-py（redis>=5.0.0）
#   3) 幂等补齐 .env 的 REDIS_URL（已有键不覆盖）
# 适用：首次初始化（server/deploy/deploy-server.sh 之后）、或依赖缺失时报错时
set -euo pipefail

APP=/opt/good-good-eat

echo "== 1/3 Redis 服务 =="
if ! command -v redis-server >/dev/null 2>&1; then
  if command -v dnf >/dev/null 2>&1; then dnf -y install redis; else yum -y install redis; fi
fi
systemctl enable --now redis
sleep 1
redis-cli ping

echo "== 2/3 venv redis-py =="
cd "$APP/server"
.venv/bin/python -m pip --version >/dev/null 2>&1 || .venv/bin/python -m ensurepip --upgrade
.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/python -m pip install --quiet 'redis>=5.0.0'
.venv/bin/python -c "import redis; print('redis-py', redis.__version__)"

echo "== 3/3 .env REDIS_URL（幂等）=="
if ! grep -q '^REDIS_URL=' .env; then
  echo 'REDIS_URL=redis://127.0.0.1:6379/0' >> .env
  echo '已追加 REDIS_URL'
else
  echo 'REDIS_URL 已存在，跳过'
fi

echo "✅ Redis 环境就绪"