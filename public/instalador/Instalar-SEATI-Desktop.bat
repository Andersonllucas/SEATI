@echo off
chcp 65001 >nul
title Instalador SEATI Desktop
color 0b

echo.
echo ==============================================================
echo           INSTALADOR DO SISTEMA SEATI DESKTOP
echo ==============================================================
echo.
echo [1/3] Preparando diretório do aplicativo...

set "APP_DIR=%LOCALAPPDATA%\SEATI"
if not exist "%APP_DIR%" mkdir "%APP_DIR%"

set "URL=https://ais-pre-umgoxrv5g7z5rprhf3yjnm-337117804073.us-east1.run.app"
set "ICON_FILE=%APP_DIR%\seati.ico"

echo [2/3] Baixando ícone oficial do sistema...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('%URL%/icon.ico', '%ICON_FILE%')" 2>nul

if not exist "%ICON_FILE%" (
    echo Usando ícone padrão do sistema...
)

echo [3/3] Criando atalho na Área de Trabalho e no Menu Iniciar...

set "DESKTOP_SHORTCUT=%USERPROFILE%\Desktop\SEATI.lnk"
set "START_SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\SEATI.lnk"

:: Localiza o executável do Microsoft Edge ou Google Chrome
set "BROWSER_EXE="
if exist "%PROGRAMFILES(X86)%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_EXE=%PROGRAMFILES(X86)%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%PROGRAMFILES%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_EXE=%PROGRAMFILES%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_EXE=%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe"
) else if exist "%PROGRAMFILES%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_EXE=%PROGRAMFILES%\Google\Chrome\Application\chrome.exe"
)

if "%BROWSER_EXE%"=="" (
    echo Não foi possível localizar o navegador Edge ou Chrome no sistema.
    pause
    exit /b 1
)

:: Cria atalho na Área de Trabalho via PowerShell
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%DESKTOP_SHORTCUT%'); $Shortcut.TargetPath = '%BROWSER_EXE%'; $Shortcut.Arguments = '--app=%URL%'; if (Test-Path '%ICON_FILE%') { $Shortcut.IconLocation = '%ICON_FILE%,0' }; $Shortcut.Description = 'SEATI - Sistema de Gestão Eleitoral'; $Shortcut.Save()"

:: Cria atalho no Menu Iniciar via PowerShell
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%START_SHORTCUT%'); $Shortcut.TargetPath = '%BROWSER_EXE%'; $Shortcut.Arguments = '--app=%URL%'; if (Test-Path '%ICON_FILE%') { $Shortcut.IconLocation = '%ICON_FILE%,0' }; $Shortcut.Description = 'SEATI - Sistema de Gestão Eleitoral'; $Shortcut.Save()"

cls
echo.
echo ==============================================================
echo                INSTALAÇÃO CONCLUÍDA COM SUCESSO!
echo ==============================================================
echo.
echo   O SEATI agora está instalado no seu computador.
echo.
echo   - Atalho adicionado na Área de Trabalho (Desktop)
echo   - Atalho adicionado no Menu Iniciar do Windows
echo.
echo   Você já pode abrir o aplicativo diretamente pelo atalho!
echo ==============================================================
echo.
set /p ABRIR="Deseja abrir o SEATI agora? (S/N): "
if /i "%ABRIR%"=="S" (
    start "" "%DESKTOP_SHORTCUT%"
)

exit /b 0
