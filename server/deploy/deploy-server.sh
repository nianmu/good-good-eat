#!/usr/bin/env bash
# 好大一颗菜 · 阿里云轻量服务器一键部署（Alibaba Cloud Linux / CentOS 系，dnf/yum）
# 用法：在服务器上以 root 运行
#   curl 或 scp 到服务器后：bash deploy-server.sh <你的公网IP或前端直连域名>
# 说明：按 IP 联调阶段直接 http://IP:8000；备案/HTTPS 通过后走 docs/03 的 nginx 模板加域名。
set -euo pipefail

APP_DIR=/opt/good-good-eat
PY=3.13
PORT=8000

echo "== 1/7 系统更新与基础依赖 =="
if command -v dnf >/dev/null 2>&1; then PKGMGR=dnf; else PKGMGR=yum; fi
$PKGMGR -y install git curl nginx gcc make openssl-devel bzip2-devel libffi-devel zlib-devel
echo "使用包管理器: $PKGMGR"

echo "== 2/7 安装 uv（Python 包/版本管理，非沙箱环境正常装）=="
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh
fi
export PATH="/usr/local/bin:$PATH"
source /root/.local/bin/env 2>/dev/null || true
uv --version

echo "== 3/7 安装 MySQL 8 =="
if ! command -v mysql >/dev/null 2>&1; then
  $PKGMGR -y install mysql-server
  systemctl enable --now mysqld
fi
mysql --version

echo "== 4/7 拉取代码并装依赖 =="
[ -d "$APP_DIR" ] || git clone git@github.com:nianmu/good-good-eat.git "$APP_DIR" 2>/dev/null \
  || git clone https://github.com/nianmu/good-good-eat.git "$APP_DIR"
cd "$APP_DIR/server"
uv python install "$PY" 2>/dev/null || true
uv sync --python "$PY"

echo "== 5/7 配置生产 .env 与数据库 =="
# 用生成的强随机密钥写 .env（不会被提交）
JWT_SECRET=$(uv run python -c "import secrets;print(secrets.token_hex(32))")
DBPASS=$(uv run python -c "import secrets;print(secrets.token_hex(12))")
cat > /opt/good-good-eat/server/.env <<EOF
DEBUG=false
API_PREFIX=/api/v1
DATABASE_URL=mysql+pymysql://goodgoodeat:${DBPASS}@127.0.0.1:3306/good_good_eat?charset=utf8mb4
TEST_DATABASE_URL=
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRE_DAYS=30
CORS_ORIGINS=*
EOF
mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS good_good_eat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'goodgoodeat'@'localhost' IDENTIFIED BY '${DBPASS}';
GRANT ALL PRIVILEGES ON good_good_eat.* TO 'goodgoodeat'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "== 6/7 迁移 + 种子 + systemd =="
cd /opt/good-good-eat/server
uv run alembic upgrade head
uv run python -m seed.seed_data
# systemd 服务（后台常驻，支持多 worker 与自动重启）
cat > /etc/systemd/system/goodgoodeat.service <<EOF
[Unit]
Description=GoodGoodEat FastAPI
After=network.target mysqld.service
[Service]
User=root
WorkingDirectory=/opt/good-good-eat/server
EnvironmentFile=/opt/good-good-eat/server/.env
ExecStart=/opt/good-good-eat/server/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 2
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now goodgoodeat

echo "== 7/7 防火墙放行 $PORT =="
if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port=${PORT}/tcp 2>/dev/null || true
  firewall-cmd --permanent --add-port=80/tcp 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || true
else
  echo "无 firewalld，请在阿里云安全组放行 ${PORT}/80 端口"
fi

echo
echo "✅ 部署完成：http://<公网IP>:${PORT}/healthz 应返回 ok"
echo "   请到阿里云轻量『防火墙/安全组』放行 ${PORT} 与 80 端口"
echo "   登录账号密码见 /opt/good-good-eat/server/.env（JWT_SECRET/数据库账号）"
