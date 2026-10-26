@echo off
rem SBOM Fixer Dashboard - double-click to start. Works without internet.
setlocal
cd /d "%~dp0"
title SBOM Fixer Dashboard

set "PY="
where py >nul 2>nul && py -3.14 -c "import sys" >nul 2>nul && set "PY=py -3.14"
if not defined PY ( where python >nul 2>nul && set "PY=python" )
if not defined PY (
  echo.
  echo  Python 3.14 was not found on this computer.
  echo.
  pause
  exit /b 1
)

%PY% -c "import sys; sys.exit(0 if sys.version_info[:2] == (3, 14) else 1)"
if errorlevel 1 (
  echo.
  echo  This package needs exactly Python 3.14 ^(it was built for that version^).
  echo.
  pause
  exit /b 1
)

%PY% app.pyc %*
if errorlevel 1 (
  echo.
  echo  The dashboard stopped with an error. Read the message above.
  pause
)
endlocal
