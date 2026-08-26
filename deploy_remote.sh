#!/usr/bin/env bash
# 好好吃饭 · 一次性线上部署：前端 + 后端 + HowToCook 菜谱源 + 重启 + 导入
set -euo pipefail
cd /opt/good-good-eat
TS=$(date +%Y%m%d_%H%M%S)

echo "== 1/4 前端部署 =="
mkdir -p h5_dist_bak_$TS
cp -r h5_dist/. h5_dist_bak_$TS/ 2>/dev/null || true
rm -rf h5_dist/*
unzip -o h5-deploy.zip -d .
if [ -d h5 ]; then mv h5/dist/* h5_dist/; fi
rm -rf h5
ls h5_dist/ | head -5

echo "== 2/4 后端代码更新 =="
unzip -o server-deploy.zip -d server/
ls server/seed/import_howtocook.py && echo "新导入脚本已就位"

echo "== 3/4 HowToCook 菜谱源 =="
unzip -o htc-md.zip -d .
echo "md 数: $(find /opt/good-good-eat/HowToCook/dishes -name '*.md' | wc -l)"

echo "== 4/4 重启服务 =="
systemctl restart goodgoodeat
sleep 3
systemctl is-active goodgoodeat

echo "== 导入 HowToCook 菜谱（幂等 upsert） =="
cd server
.venv/bin/python seed/import_howtocook.py --src /opt/good-good-eat/HowToCook

echo "== 验证 =="
echo "healthz: $(curl -s --max-time 5 http://127.0.0.1:8000/healthz)"
echo "categories: $(curl -s --max-time 5 http://127.0.0.1:8000/api/v1/categories | head -c 500)"
echo "DONE"