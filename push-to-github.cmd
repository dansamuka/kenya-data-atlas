@echo off
setlocal
cd /d "%~dp0"

echo Kenya Data Atlas - Push to GitHub
echo Repository: %CD%
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git is not installed or is not available on PATH.
  echo Install Git for Windows from https://git-scm.com/download/win and try again.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo ERROR: This folder is not a Git working copy.
  echo If you downloaded the ZIP, Git history is not included. Clone the repository,
  echo copy these files into the clone, commit them, and run this helper there.
  pause
  exit /b 1
)

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo ERROR: No GitHub remote named "origin" is configured.
  echo Configure it with: git remote add origin https://github.com/USERNAME/REPOSITORY.git
  pause
  exit /b 1
)

echo Remote:
git remote get-url origin
echo.
echo Pushing the current branch to origin...
git push -u origin HEAD

if errorlevel 1 (
  echo.
  echo PUSH FAILED.
  echo Check your internet connection and GitHub authentication, then run this file again.
  pause
  exit /b 1
)

echo.
echo PUSH COMPLETE.
pause
exit /b 0
