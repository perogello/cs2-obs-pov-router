@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "CFG_FILE_NAME=gamestate_integration_obsrouter.cfg"
set "CFG_DIR="

call :try_cfg "%ProgramFiles(x86)%\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg"
call :try_cfg "%ProgramFiles%\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg"

if not defined CFG_DIR (
  call :scan_libraries "%ProgramFiles(x86)%\Steam\steamapps\libraryfolders.vdf"
)
if not defined CFG_DIR (
  call :scan_libraries "%ProgramFiles%\Steam\steamapps\libraryfolders.vdf"
)

if not defined CFG_DIR (
  for %%D in (C D E F G H) do (
    if not defined CFG_DIR call :try_cfg "%%D:\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg"
    if not defined CFG_DIR call :try_cfg "%%D:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg"
  )
)

if not defined CFG_DIR (
  echo CS2 cfg folder was not found automatically.
  echo Enter full path to the CS2 cfg folder.
  echo Example:
  echo E:\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg
  set /p "CFG_DIR=Path: "
)

if not exist "%CFG_DIR%" (
  echo Folder not found:
  echo %CFG_DIR%
  pause
  exit /b 1
)

set "CFG_FILE=%CFG_DIR%\%CFG_FILE_NAME%"

> "%CFG_FILE%" (
  echo "OBS Router"
  echo {
  echo   "uri" "http://127.0.0.1:3000/gsi"
  echo   "timeout" "0.1"
  echo   "buffer" "0.0"
  echo   "throttle" "0.0"
  echo   "heartbeat" "0.1"
  echo.
  echo   "data"
  echo   {
  echo     "provider" "1"
  echo     "player_id" "1"
  echo     "allplayers_id" "1"
  echo   }
  echo }
)

echo Installed:
echo %CFG_FILE%
echo Restart CS2 after this.
pause
exit /b 0

:try_cfg
if not defined CFG_DIR (
  if exist "%~1" set "CFG_DIR=%~1"
)
exit /b 0

:scan_libraries
set "VDF=%~1"
if not exist "%VDF%" exit /b 0

for /f "tokens=1,* delims=	 " %%A in ('findstr /r /c:"\"path\"" "%VDF%"') do (
  set "LINE=%%B"
  set "LINE=!LINE:"=!"
  for /f "tokens=2,*" %%P in ("!LINE!") do (
    set "LIB=%%Q"
    set "LIB=!LIB:\\=\!"
    call :try_cfg "!LIB!\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg"
  )
)
exit /b 0
