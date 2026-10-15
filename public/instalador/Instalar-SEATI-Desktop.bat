@echo off
setlocal
chcp 65001 >nul
title Instalador SEATI Desktop
color 0b

echo ==============================================================
echo             INSTALADOR DO SISTEMA SEATI DESKTOP
echo ==============================================================
echo.
echo [1/3] Configurando diretorio do aplicativo...

set "TARGET_URL=https://seati-d0096.adti.app.br"
set "APP_DIR=%LOCALAPPDATA%\SEATI"
if not exist "%APP_DIR%" mkdir "%APP_DIR%" 2>nul
set "ICON_FILE=%APP_DIR%\seati.ico"

echo [2/3] Baixando icone oficial...
curl -s -L -o "%ICON_FILE%" "%TARGET_URL%/icon.ico" 2>nul

echo [3/3] Criando atalho na Area de Trabalho e Menu Iniciar...

set "VBS_SCRIPT=%TEMP%\seati_install.vbs"

(
echo Set oWS = WScript.CreateObject("WScript.Shell"^)
echo sDesktop = oWS.SpecialFolders("Desktop"^)
echo sPrograms = oWS.SpecialFolders("Programs"^)
echo Set oLink = oWS.CreateShortcut(sDesktop ^& "\SEATI.lnk"^)
echo oLink.TargetPath = "msedge.exe"
echo oLink.Arguments = "--app=%TARGET_URL%"
echo oLink.WindowStyle = 1
echo If oWS.CreateObject("Scripting.FileSystemObject"^).FileExists("%ICON_FILE%"^) Then
echo   oLink.IconLocation = "%ICON_FILE%,0"
echo End If
echo oLink.Description = "SEATI - Sistema de Gestao Eleitoral"
echo oLink.Save
echo Set oLink2 = oWS.CreateShortcut(sPrograms ^& "\SEATI.lnk"^)
echo oLink2.TargetPath = "msedge.exe"
echo oLink2.Arguments = "--app=%TARGET_URL%"
echo If oWS.CreateObject("Scripting.FileSystemObject"^).FileExists("%ICON_FILE%"^) Then
echo   oLink2.IconLocation = "%ICON_FILE%,0"
echo End If
echo oLink2.Save
) > "%VBS_SCRIPT%"

cscript //nologo "%VBS_SCRIPT%"
del "%VBS_SCRIPT%" 2>nul

echo Abrindo o SEATI agora...
start msedge --app="%TARGET_URL%" 2>nul || start "" "%TARGET_URL%"

echo.
echo ==============================================================
echo             INSTALACAO CONCLUIDA COM SUCESSO!
echo ==============================================================
echo.
echo  Atalho criado com sucesso na Area de Trabalho e Menu Iniciar:
echo  - "SEATI"
echo  - Conectado em: %TARGET_URL%
echo.
echo ==============================================================
echo.
pause
