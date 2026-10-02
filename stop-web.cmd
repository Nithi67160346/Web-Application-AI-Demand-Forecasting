@echo off
setlocal
title Demandly - Stop Web
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-launcher.ps1" -Action stop %*
exit /b %ERRORLEVEL%
