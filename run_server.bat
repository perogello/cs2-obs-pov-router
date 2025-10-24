@echo off
title CS2 → OBS Router
cd /d "%~dp0server"
echo Starting local server...
start "" "http://localhost:3000"
node server_obs.mjs
pause
