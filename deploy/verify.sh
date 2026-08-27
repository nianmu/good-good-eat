#!/usr/bin/env bash
# 好好吃饭 · 部署后验证清单（服务器上运行）
# 用法：bash /opt/good-good-eat/deploy/verify.sh
# 逐项检查：后端健康 / 分类接口 / AI 路由降级 / Redis / 购物车 key / 前端站点
set -uo pipefail

echo "== 1/6 后端健康 =="
curl -s --max-time 5 http://127.0.0.1:8000/healthz && echo

echo "== 2/6 分类接口 =="
curl -s --max-time 5 http://127.0.0.1:8000/api/v1/categories | head -c 120 && echo

echo "== 3/6 AI 路由（未配 AI_API_KEY 时应返回 error 事件）=="
TOKEN=$(curl -s --max-time 5 -X POST http://127.0.0.1:8000/api/v1/auth/guest \
  -H 'Content-Type: application/json' -d '{"nickname":"deploy-probe"}' | \
  python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])" 2>/dev/null | tail -1)
if [ -n "$TOKEN" ]; then
  curl -s --max-time 10 -X POST http://127.0.0.1:8000/api/v1/ai/chat \
    -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
    -d '{"messages":[{"role":"user","content":"推荐一桌菜"}]}' | head -c 200
  echo
else
  echo '⚠️ 探测 token 获取失败'
fi

echo "== 4/6 Redis =="
redis-cli ping

echo "== 5/6 团队购物车 key（正常应为空/无）=="
redis-cli keys 'ggc:cart:*'

echo "== 6/6 前端站点（nginx 7788）=="
curl -sI --max-time 5 http://127.0.0.1:7788/ | head -1

echo "✅ 验证完成（AI 若显示「AI 功能未配置」属正常，填入 AI_MODEL/AI_API_KEY 后重启即启用）"