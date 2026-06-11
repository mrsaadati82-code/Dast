@echo off
cd /d "%~dp0"
echo Starting Dast Rast on http://localhost:8787
echo If the browser does not open automatically, open http://localhost:8787
start http://localhost:8787
node server-standalone.js
pause
