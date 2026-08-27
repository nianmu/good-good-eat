#!/usr/bin/env bash
# 好好吃饭 · 服务器端前端发布（incremental）
# 用法（服务器上）：bash /opt/good-good-eat/deploy/release-h5.sh [h5-deploy.zip 路径]
#   默认读取 /opt/good-good-eat/h5-deploy.zip（由本机 deploy/package.ps1 打包后上传）
# 行为：备份现有 h5_dist → 解压新包到临时目录 → 整体替换 h5_dist/
# 约定：zip 内为 h5/dist/... 布局（package.ps1 生成）；nginx 站点根为 /opt/good-good-eat/h5_dist
set -euo pipefail

ZIP=${1:-/opt/good-good-eat/h5-deploy.zip}
APP=/opt/good-good-eat

[ -f "$ZIP" ] || { echo "❌ 未找到 $ZIP，请先上传" >&2; exit 1; }

TS=$(date +%Y%m%d_%H%M%S)

echo "== 1/4 备份当前 h5_dist =="
mkdir -p "$APP/h5_dist_bak_$TS"
cp -r "$APP/h5_dist/." "$APP/h5_dist_bak_$TS/" 2>/dev/null || true
echo "已备份 -> h5_dist_bak_$TS"

echo "== 2/4 解压新包 =="
rm -rf /tmp/ggc-h5 && mkdir -p /tmp/ggc-h5
unzip -o "$ZIP" -d /tmp/ggc-h5 > /dev/null 2>&1 || echo "⚠️ unzip 返回非零（多为 Windows 打包 zip 的反斜杠警告），文件应已解压"
# 兼容两种布局：h5/dist/（推荐）或 dist/（老打包工具产物）
if [ -d /tmp/ggc-h5/h5/dist ]; then
  SRC=/tmp/ggc-h5/h5/dist
elif [ -d /tmp/ggc-h5/dist ]; then
  SRC=/tmp/ggc-h5/dist
  echo "⚠️ zip 顶层为 dist/（老打包工具），已自动兼容"
else
  echo "❌ zip 结构不符合约定（缺少 h5/dist/ 或 dist/）" >&2
  exit 1
fi

echo "== 3/4 替换 h5_dist =="
rm -rf "$APP/h5_dist"/*
cp -r "$SRC"/* "$APP/h5_dist/"
chmod -R 755 "$APP/h5_dist"

echo "== 4/4 校验 =="
ls "$APP/h5_dist/"
curl -sI --max-time 5 http://127.0.0.1:7788/ | head -1
echo "✅ 前端发布完成（旧版备份：h5_dist_bak_$TS）"