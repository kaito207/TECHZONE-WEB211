@echo off
cd /d "%~dp0"
echo Dang mo TECHZONE tai http://127.0.0.1:3000
start "" http://127.0.0.1:3000
py -3 server.py
if errorlevel 1 python server.py
pause
