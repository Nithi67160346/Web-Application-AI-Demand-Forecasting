@echo off
setlocal
title Demandly - Start Web
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-launcher.ps1" -Action start %*
exit /b %ERRORLEVEL%
