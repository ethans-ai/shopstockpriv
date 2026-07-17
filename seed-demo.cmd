@echo off
rem Loads demo data into an empty database (for trying the app out).
cd /d "%~dp0"
"%~dp0node.exe" scripts\seed-demo.js
pause