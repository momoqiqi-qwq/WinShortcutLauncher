@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.cargo\bin;%APPDATA%\npm;%~dp0node_modules\.bin;%PATH%"
where node >nul 2>nul || goto missing_node
where npm >nul 2>nul || goto missing_node
node -e "const [M,m]=process.versions.node.split('.').map(Number);process.exit(M>22||(M===22&&m>=12)||(M===20&&m>=19)?0:1)"
if errorlevel 1 goto unsupported_node
call npm ci
if errorlevel 1 pause & exit /b 1
call npm run tauri:dev
pause
exit /b 0

:missing_node
echo [错误] 未找到 Node.js / npm。请安装 Node.js 20.19+ 或 22.12+。
pause
exit /b 1

:unsupported_node
echo [错误] 当前 Node.js 版本不受支持。需要 20.19+ 或 22.12+。
node -v
pause
exit /b 1
