@echo off
rem ShopStock portable launcher - no installation required.
rem To auto-start at login: put a shortcut to this file in shell:startup.
cd /d "%~dp0"

rem Read the configured port from config.json (default 8340)
set PORT=
"%~dp0node.exe" -p "require('./src/config').load().port" > "%TEMP%\shopstock-port.txt" 2>nul
set /p PORT=<"%TEMP%\shopstock-port.txt"
del "%TEMP%\shopstock-port.txt" >nul 2>&1
if "%PORT%"=="" set PORT=8340

netstat -an | findstr /C:":%PORT% " | findstr LISTENING >nul 2>&1
if %errorlevel%==0 (
  start "" http://localhost:%PORT%
  exit /b 0
)

start "ShopStock server" /min cmd /c ""%~dp0node.exe" server.js"
timeout /t 2 /nobreak >nul
start "" http://localhost:%PORT%