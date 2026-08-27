# 好好吃饭 · 本机打包脚本（Windows PowerShell）
# 用法：在仓库根目录执行  powershell -ExecutionPolicy Bypass -File deploy\package.ps1
# 产物：
#   h5-deploy.zip      —— H5 前端产物（zip 内为 h5/dist/... 布局，与服务器端 release-h5.sh 约定一致）
#   server-deploy.zip  —— 后端代码（zip 根为 server/ 内容：app/ seed/ alembic/ pyproject.toml 等，
#                          排除 .venv/.env/tests/本地调试产物），与 release-server.sh 约定一致
# 两个 zip 均被 .gitignore 忽略（*.deploy.zip），打包后经 scp/ssh 工具上传到 /opt/good-good-eat/ 即可。
# 依赖：h5 工程已 pnpm install（node_modules 就绪）；无需额外安装。

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot   # 仓库根目录
Set-Location $root

Write-Host '== 1/2 build:h5（Taro H5 生产构建）==' -ForegroundColor Cyan
Push-Location "$root\h5"
& .\node_modules\.bin\taro.cmd build --type h5
if ($LASTEXITCODE -ne 0) { throw 'h5 build 失败' }
Pop-Location

Write-Host '== 2/2 打包 h5-deploy.zip =' -ForegroundColor Cyan
$h5Stage = Join-Path $env:TEMP 'ggc-h5zip'
if (Test-Path $h5Stage) { Remove-Item -Recurse -Force $h5Stage }
New-Item -ItemType Directory -Path (Join-Path $h5Stage 'h5') | Out-Null
Copy-Item -Path "$root\h5\dist" -Destination (Join-Path $h5Stage 'h5\dist') -Recurse -Force
$h5Zip = Join-Path $root 'h5-deploy.zip'
if (Test-Path $h5Zip) { Remove-Item $h5Zip }
Compress-Archive -Path (Join-Path $h5Stage 'h5') -DestinationPath $h5Zip -Force

Write-Host "== 3/3 打包 server-deploy.zip =" -ForegroundColor Cyan
$serverStage = Join-Path $env:TEMP 'ggc-deploy-stage'
if (Test-Path $serverStage) { Remove-Item -Recurse -Force $serverStage }
New-Item -ItemType Directory -Path $serverStage | Out-Null
# 排除：虚拟环境/密钥/测试/本地调试产物（与 .gitignore 思路一致，防漏传误传）
$excludeNames = @(
  '.venv', '.env', '.env.example', '.env.production.example',
  '.pytest_cache', 'tests', '__pycache__', '.git',
  '_full.log', 'uvicorn.log', 'start-server.bat', 'start-server.ps1', '.python-version'
)
$items = Get-ChildItem "$root\server" -Force | Where-Object {
  $n = $_.Name
  $n -notin $excludeNames -and $n -notlike '_debug_*.py' -and $n -notlike '_sync_*.py'
}
Copy-Item -Path $items.FullName -Destination $serverStage -Recurse -Force
Get-ChildItem $serverStage -Recurse -Include '__pycache__', '*.pyc' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
$serverZip = Join-Path $root 'server-deploy.zip'
if (Test-Path $serverZip) { Remove-Item $serverZip }
Compress-Archive -Path (Join-Path $serverStage '*') -DestinationPath $serverZip -Force

Write-Host ''
Write-Host ('✅ 打包完成：h5-deploy.zip {0:N2} MB / server-deploy.zip {1:N2} MB' -f `
  ((Get-Item $h5Zip).Length / 1MB), ((Get-Item $serverZip).Length / 1MB)) -ForegroundColor Green
Write-Host '下一步：上传两个 zip 到服务器 /opt/good-good-eat/，再执行 release-h5.sh / release-server.sh（见 docs/06-部署手册.md）' -ForegroundColor Yellow