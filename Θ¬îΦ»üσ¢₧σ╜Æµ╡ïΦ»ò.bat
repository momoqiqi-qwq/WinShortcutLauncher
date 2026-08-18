@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
set "PATH=%APPDATA%\npm;%~dp0node_modules\.bin;%PATH%"

echo ========================================
echo Yue launcher 自动化回归验证
echo ========================================
echo.

where node >nul 2>nul || goto missing_node
where npm >nul 2>nul || goto missing_node
node -e "const [M,m]=process.versions.node.split('.').map(Number);process.exit(M>22||(M===22&&m>=12)||(M===20&&m>=19)?0:1)"
if errorlevel 1 goto unsupported_node

if not exist node_modules (
  echo [1/2] 安装锁定依赖...
  call npm ci
  if errorlevel 1 goto error
) else (
  echo [1/2] 已检测到 node_modules，跳过安装。
)

echo.
echo [2/2] 执行测试与前端构建...
call npm run verify
if errorlevel 1 goto error

echo.
echo ========================================
echo 回归测试与前端构建全部通过。
echo ========================================
pause
exit /b 0

:unsupported_node
echo [错误] 当前 Node.js 版本不受支持。需要 20.19+ 或 22.12+。
node -v
pause
exit /b 1

:missing_node
echo [错误] 未找到 Node.js / npm，请先安装 Node.js 20.19+ 或 22.12+。
pause
exit /b 1

:error
echo.
echo [错误] 验证失败，请查看上方错误信息。
pause
exit /b 1
