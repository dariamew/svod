@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Свод
where node >nul 2>&1
if errorlevel 1 (
  echo Для запуска установите Node.js 24 или новее.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 goto failed
)
call npm run build
if errorlevel 1 goto failed
echo Откройте http://127.0.0.1:3001 в браузере.
echo Оставьте это окно открытым. Для остановки нажмите Ctrl+C.
call npm start
goto :eof
:failed
echo Не удалось подготовить приложение. Проверьте сообщения выше.
pause
exit /b 1
