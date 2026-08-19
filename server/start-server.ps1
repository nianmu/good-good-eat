# 好好吃饭 · 后端一键启动
# 请在「你自己的终端 / 双击 bat」里运行，不要用 AI 自动化后台（会被沙箱回收导致服务断开）。
# 启动后访问 http://127.0.0.1:8000/healthz 验证。

$env:UV_CACHE_DIR = 'E:\ai-repository\good-good-eat\.uv-cache'   # D 盘缓存被沙箱拒写时落位于工作区
Set-Location 'E:\ai-repository\good-good-eat\server'

Write-Host '启动 好好吃饭 后端：http://127.0.0.1:8000  （Ctrl+C 停止）' -ForegroundColor Green

& '.\.venv\Scripts\python.exe' -m uvicorn app.main:app --host 0.0.0.0 --port 8000