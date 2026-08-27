#!/usr/bin/env bash
# 好好吃饭 · 服务器端后端发布（incremental）
# 用法（服务器上）：bash /opt/good-good-eat/deploy/release-server.sh [server-deploy.zip 路径]
#   默认读取 /opt/good-good-eat/server-deploy.zip（由本机 deploy/package.ps1 打包后上传）
# 行为：备份关键代码目录 → 解压覆盖 server/ → 幂等补 .env 缺失键 → 重启 goodgoodeat → 健康检查
#   不删除 server/ 中 zip 之外的文件（.venv/.env 一直在原位）
set -euo pipefail

ZIP=${1:-/opt/good-good-eat/server-deploy.zip}
APP=/opt/good-good-eat

[ -f "$ZIP" ] || { echo "❌ 未找到 $ZIP，请先上传" >&2; exit 1; }

TS=$(date +%Y%m%d_%H%M%S)
cd "$APP"

echo "== 1/4 备份关键代码 =="
tar czf "server_code_bak_${TS}.tgz" -C server app seed alembic pyproject.toml 2>/dev/null || true
ls -la "server_code_bak_${TS}.tgz"

echo "== 2/4 解压覆盖 server/ =="
unzip -o "$ZIP" -d server/ > /dev/null 2>&1 || echo "⚠️ unzip 返回非零（多为 Windows 历史打包 zip 的反斜杠警告），文件应已解压"

echo "== 3/4 幂等补齐 .env 缺失键 =="
# pydantic-settings 大小写不敏感；已有键不覆盖（保护既有密钥）
for kv in \
  "REDIS_URL=redis://127.0.0.1:6379/0" \
  "AI_BASE_URL=https://api.openai.com/v1" \
  "AI_MODEL=" \
  "AI_API_KEY="; do
  k="${kv%%=*}"
  grep -q "^${k}=" server/.env || echo "$kv" >> server/.env
done
echo "--- .env 现有键 ---"
cut -d= -f1 server/.env

echo "== 4/4 重启并健康检查 =="
systemctl restart goodgoodeat
sleep 3
systemctl is-active goodgoodeat
curl -s --max-time 5 http://127.0.0.1:8000/healthz && echo

echo "✅ 后端发布完成（代码备份：server_code_bak_${TS}.tgz）"
echo "   Redis/依赖检查：bash $APP/deploy/setup-redis.sh（首次或依赖缺失时执行）"