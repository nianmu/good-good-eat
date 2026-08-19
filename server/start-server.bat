@echo off
rem 好大一颗菜 · 后端一键启动（双击运行；启动后 Ctrl+C 停止）
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
pause