@echo off
chcp 65001 >nul
title OpenKnowledge 一键启动
powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
