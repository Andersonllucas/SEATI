import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subdominio = (searchParams.get('subdominio') || '').trim().toLowerCase();
    const rawNome = (searchParams.get('nome') || '').trim();
    const format = (searchParams.get('format') || 'vbs').trim().toLowerCase();

    let targetUrl = '';
    let safeName = 'SEATI';
    let title = 'Sistema de Gestao Eleitoral';

    if (subdominio && subdominio !== 'admin' && subdominio !== 'localhost') {
      targetUrl = `https://${subdominio}.adti.app.br`;
      safeName = subdominio;
      title = rawNome ? `${rawNome} (${subdominio})` : subdominio;
    } else {
      targetUrl = request.nextUrl.origin || 'https://seati.adti.app.br';
      title = 'SEATI';
    }

    if (format === 'vbs') {
      const vbsText = `' ==============================================================
'         INSTALADOR SEATI DESKTOP - ${title}
' ==============================================================
Option Explicit
Dim oWS, sDesktop, sPrograms, oLink, sUrl, sName, ret

sUrl = "${targetUrl}"
sName = "SEATI - ${safeName}"

Set oWS = CreateObject("WScript.Shell")

sDesktop = oWS.SpecialFolders("Desktop")
sPrograms = oWS.SpecialFolders("Programs")

On Error Resume Next

' 1. Cria atalho na Area de Trabalho
Set oLink = oWS.CreateShortcut(sDesktop & "\\" & sName & ".lnk")
oLink.TargetPath = "msedge.exe"
oLink.Arguments = "--app=" & sUrl
oLink.WindowStyle = 1
oLink.Description = "SEATI - ${title}"
oLink.Save

' 2. Cria atalho no Menu Iniciar
Set oLink = oWS.CreateShortcut(sPrograms & "\\" & sName & ".lnk")
oLink.TargetPath = "msedge.exe"
oLink.Arguments = "--app=" & sUrl
oLink.WindowStyle = 1
oLink.Description = "SEATI - ${title}"
oLink.Save

' 3. Abre o aplicativo na tela
ret = oWS.Run("msedge.exe --app=" & sUrl, 1, False)
If ret <> 0 Then
  oWS.Run sUrl, 1, False
End If

' 4. Mensagem de Sucesso
MsgBox "O SEATI (" & sName & ") foi instalado com sucesso!" & vbCrLf & vbCrLf & _
       "- Atalho criado na sua Area de Trabalho" & vbCrLf & _
       "- Atalho criado no Menu Iniciar" & vbCrLf & _
       "- Conectado em: " & sUrl, 64, "SEATI - Instalacao Concluida"
`;

      const cleanCrlf = vbsText.replace(/\r?\n/g, '\r\n');
      return new Response(cleanCrlf, {
        status: 200,
        headers: {
          'Content-Type': 'text/vbscript; charset=utf-8',
          'Content-Disposition': `attachment; filename="Instalar-SEATI-${safeName}.vbs"`,
          'Cache-Control': 'no-cache',
        },
      });
    }

    // Formato .BAT com CRLF estrito
    const batLines = [
      '@echo off',
      'chcp 65001 >nul',
      `title Instalador SEATI Desktop - ${title}`,
      'color 0b',
      'echo ============================================================== ',
      `echo       INSTALADOR DO SISTEMA SEATI - ${title}`,
      'echo ============================================================== ',
      'echo.',
      'echo [1/2] Criando atalho na Area de Trabalho e Menu Iniciar...',
      `powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $d=[Environment]::GetFolderPath('Desktop'); $s=$ws.CreateShortcut(\\"$d\\SEATI - ${safeName}.lnk\\"); $s.TargetPath='msedge.exe'; $s.Arguments='--app=${targetUrl}'; $s.Description='SEATI - ${title}'; $s.Save(); $p=[Environment]::GetFolderPath('Programs'); $s2=$ws.CreateShortcut(\\"$p\\SEATI - ${safeName}.lnk\\"); $s2.TargetPath='msedge.exe'; $s2.Arguments='--app=${targetUrl}'; $s2.Description='SEATI - ${title}'; $s2.Save()"`,
      'echo.',
      'echo [2/2] Abrindo o SEATI agora...',
      `start msedge.exe --app="${targetUrl}" 2>nul || start "" "${targetUrl}"`,
      'echo.',
      'echo ============================================================== ',
      'echo             INSTALACAO CONCLUIDA COM SUCESSO! ',
      'echo ============================================================== ',
      'echo.',
      `echo  Atalho criado: "SEATI - ${safeName}"`,
      `echo  Conectado em: ${targetUrl}`,
      'echo.',
      'pause'
    ];

    const cleanCrlf = batLines.join('\r\n') + '\r\n';
    return new Response(cleanCrlf, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-bat; charset=utf-8',
        'Content-Disposition': `attachment; filename="Instalar-SEATI-${safeName}.bat"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: any) {
    return new Response(String(err?.message || err), { status: 500 });
  }
}
