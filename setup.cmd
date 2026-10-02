@echo off
setlocal
title Demandly - Setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-launcher.ps1" -Action setup %*
exit /b %ERRORLEVEL%
