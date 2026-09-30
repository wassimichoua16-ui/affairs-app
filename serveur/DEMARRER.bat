@echo off
chcp 65001 >nul
title Affair's - Estimation en ligne
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js n'est pas installe sur cet ordinateur.
  echo  Installez-le depuis https://nodejs.org ^(version LTS^), puis relancez ce fichier.
  echo.
  start https://nodejs.org/fr
  pause
  exit /b
)
start "" http://localhost:3000
node server.js
pause
