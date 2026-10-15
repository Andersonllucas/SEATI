@echo off
chcp 65001 >nul
title Desinstalador SEATI Desktop
color 0c

echo.
echo ==============================================================
echo           DESINSTALADOR DO SISTEMA SEATI DESKTOP
echo ==============================================================
echo.
set /p CONFIRMAR="Deseja remover o atalho do SEATI deste computador? (S/N): "
if /i not "%CONFIRMAR%"=="S" (
    echo Operação cancelada.
    exit /b 0
)

echo Removendo atalhos e arquivos...

del "%USERPROFILE%\Desktop\SEATI.lnk" 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\SEATI.lnk" 2>nul
rmdir /s /q "%LOCALAPPDATA%\SEATI" 2>nul

echo.
echo ==============================================================
echo              DESINSTALAÇÃO CONCLUÍDA!
echo ==============================================================
echo Os atalhos do SEATI foram removidos com sucesso.
echo.
pause
exit /b 0
