# HowToCook 菜谱同步（新流程：本地跑 → 生成 SQL → 线上执行）
#
# 用法：
#   1. 本地执行本脚本：powershell -ExecutionPolicy Bypass -File tools/sync_howtocook.ps1
#      → git pull 上游 + 更新本地开发库 + 生成同步 SQL（server/seed/output/howtocook_sync_<时间戳>.sql）
#   2. 本地核对数据无误后，把生成的 SQL 上传到线上执行：
#      scp server/seed/output/howtocook_sync_*.sql root@<服务器>:/opt/good-good-eat/
#      mysql -u<user> -p good_good_eat < howtocook_sync_<时间戳>.sql
#      （SQL 幂等，可重复执行；不删除线上自有数据；同名菜保留线上运营价/评分）
#
# 定时任务建议：本地 Windows 计划程序每周执行本脚本，仅生成 SQL；由人工审核后上线执行。

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'HowToCook'
$python = Join-Path $root 'server\.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { $python = 'python' }

if (-not (Test-Path (Join-Path $src '.git'))) {
    Write-Host "[error] 未找到 $src 下的 HowToCook 仓库，请先克隆："
    Write-Host "       git clone https://gitee.com/Anduin2017/HowToCook.git `"$src`""
    exit 1
}

Push-Location (Join-Path $root 'server')
try {
    Write-Host "==> 1/3 拉取上游最新菜谱（git pull）"
    git -C $src config http.sslBackend openssl 2>$null
    git -C $src pull --ff-only

    Write-Host "==> 2/3 本地导入（更新开发库，幂等）"
    & $python seed/import_howtocook.py --src $src
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "==> 3/3 生成线上同步 SQL"
    & $python seed/export_howtocook_sql.py --src $src
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}
Write-Host "==> 完成：核对上方生成的 SQL 文件路径，上传到线上执行即可"