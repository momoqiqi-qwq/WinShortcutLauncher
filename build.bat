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
echo Yue launcher 一键构建
echo 项目目录: %ROOT%
echo 日志文件: %LOG%
echo ========================================
echo.

echo [检查] Node.js / npm / Rust / Cargo
where node >nul 2>nul || goto missing_node
where npm >nul 2>nul || goto missing_node
node -e "const [M,m]=process.versions.node.split('.').map(Number);process.exit(M>22||(M===22&&m>=12)||(M===20&&m>=19)?0:1)"
if errorlevel 1 goto unsupported_node
where rustc >nul 2>nul || goto missing_rust
where cargo >nul 2>nul || goto missing_rust
node -v
npm -v
rustc -V
cargo -V

echo.
echo [1/4] 按锁定版本安装 npm 依赖...
echo [1/4] npm ci>>"%LOG%"
call npm ci >>"%LOG%" 2>&1
if errorlevel 1 goto error

echo.
echo [2/4] 执行自动化回归测试...
echo [2/4] npm run test>>"%LOG%"
call npm run test >>"%LOG%" 2>&1
if errorlevel 1 goto error

echo.
echo [3/4] 构建前端 dist...
echo [3/4] npm run build>>"%LOG%"
call npm run build >>"%LOG%" 2>&1
if errorlevel 1 goto error

echo.
echo [4/4] 构建 Tauri EXE / 安装包...
echo [4/4] npm run tauri:build>>"%LOG%"
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
echo [错误] 未找到 Node.js / npm。请安装 Node.js 20.19+ 或 22.12+ 后重试。
echo 下载: https://nodejs.org/
pause
exit /b 1

:unsupported_node
echo [错误] 当前 Node.js 版本不受支持。Vite 8 需要 Node.js 20.19+ 或 22.12+。
node -v
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
