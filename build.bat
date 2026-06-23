@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

REM 双击、右键运行、从 CMD/PowerShell 运行都强制切到项目根目录。
cd /d "%~dp0"
set "ROOT=%CD%"
set "PATH=%USERPROFILE%\.cargo\bin;%APPDATA%\npm;%ROOT%\node_modules\.bin;%PATH%"
set "LOG=%ROOT%\build.log"
if exist "%LOG%" del "%LOG%" >nul 2>nul

echo ========================================
echo Win Shortcut Launcher 一键构建
echo 项目目录: %ROOT%
echo 日志文件: %LOG%
echo ========================================
echo.

echo [检查] Node.js / npm / Rust / Cargo
where node >nul 2>nul || goto missing_node
where npm >nul 2>nul || goto missing_node
where rustc >nul 2>nul || goto missing_rust
where cargo >nul 2>nul || goto missing_rust
node -v
npm -v
rustc -V
cargo -V

echo.
echo [1/3] 安装 / 更新 npm 依赖...
echo [1/3] npm install>>"%LOG%"
call npm install >>"%LOG%" 2>&1
if errorlevel 1 goto error

echo.
echo [2/3] 构建前端 dist...
echo [2/3] npm run build>>"%LOG%"
call npm run build >>"%LOG%" 2>&1
if errorlevel 1 goto error

echo.
echo [3/3] 构建 Tauri EXE / 安装包...
echo [3/3] npm run tauri:build>>"%LOG%"
call npm run tauri:build >>"%LOG%" 2>&1
if errorlevel 1 goto error

echo.
echo ========================================
echo 构建完成。
echo 输出目录通常在：src-tauri\target\release\bundle\nsis
echo 详细日志：%LOG%
echo ========================================
pause
exit /b 0

:missing_node
echo [错误] 未找到 Node.js / npm。请安装 Node.js LTS 后重试。
echo 下载: https://nodejs.org/
pause
exit /b 1

:missing_rust
echo [错误] 未找到 Rust / Cargo。请安装 Rust stable 后重试。
echo 下载: https://www.rust-lang.org/tools/install
echo 如果已经安装，请关闭并重新打开 CMD/PowerShell，或确认 %%USERPROFILE%%\.cargo\bin 已加入 PATH。
pause
exit /b 1

:error
echo.
echo ========================================
echo 构建失败。
echo 日志文件：%LOG%
echo.
echo 常见原因：
echo 1. 没安装 Microsoft Visual Studio Build Tools 的 C++ 桌面开发组件。
echo 2. Rust/Cargo 没加入 PATH。
echo 3. npm 依赖下载失败或被代理拦截。
echo 4. 旧 target 缓存损坏，可删除 src-tauri\target 后重试。
echo ========================================
if exist "%LOG%" (
  echo.
  echo ===== 日志最后 100 行 =====
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -LiteralPath '%LOG%' -Tail 100"
)
pause
exit /b 1
