@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.cargo\bin;%APPDATA%\npm;%~dp0node_modules\.bin;%PATH%"
call npm install
if errorlevel 1 pause & exit /b 1
call npm run tauri:dev
pause
