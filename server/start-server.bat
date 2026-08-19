@echo off
rem 好好吃饭 · 后端一键启动（双击运行；启动后 Ctrl+C 停止）
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
pause