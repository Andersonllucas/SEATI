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
Dim oWS, oFS, sDesktop, sPrograms, oLink, sUrl, sName, ret
Dim edgePath, candidates, p, appDir, iconFile

sUrl = "${targetUrl}"
sName = "SEATI - ${safeName}"

Set oWS = CreateObject("WScript.Shell")
Set oFS = CreateObject("Scripting.FileSystemObject")

sDesktop = oWS.SpecialFolders("Desktop")
sPrograms = oWS.SpecialFolders("Programs")

' Procura o caminho absoluto real do Microsoft Edge ou Google Chrome no Windows
candidates = Array( _
  oWS.ExpandEnvironmentStrings("%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"), _
  oWS.ExpandEnvironmentStrings("%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"), _
  oWS.ExpandEnvironmentStrings("%LOCALAPPDATA%\\Microsoft\\Edge\\Application\\msedge.exe"), _
  oWS.ExpandEnvironmentStrings("%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"), _
  oWS.ExpandEnvironmentStrings("%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"), _
  oWS.ExpandEnvironmentStrings("%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe") _
)

edgePath = ""
For Each p In candidates
  If oFS.FileExists(p) Then
    edgePath = p
    Exit For
  End If
Next

' Se nao achou nos diretorios tradicionais, tenta ler a chave de registro oficial do Windows
If edgePath = "" Then
  On Error Resume Next
  edgePath = oWS.RegRead("HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe\\")
  On Error Goto 0
End If

' Se ainda assim nao achar, fallback para msedge.exe
If edgePath = "" Then edgePath = "msedge.exe"

' Diretorio de dados e icone local
appDir = oWS.ExpandEnvironmentStrings("%LOCALAPPDATA%\\SEATI_${safeName}")
If Not oFS.FolderExists(appDir) Then
  On Error Resume Next
  oFS.CreateFolder(appDir)
  On Error Goto 0
End If
iconFile = appDir & "\\seati.ico"

' Baixa o icone oficial do sistema silenciosamente se nao existir
If Not oFS.FileExists(iconFile) Then
  On Error Resume Next
  oWS.Run "curl -s -L -o """ & iconFile & """ """ & sUrl & "/icon.ico""", 0, True
  On Error Goto 0
End If

On Error Resume Next

' 1. Cria atalho na Area de Trabalho com o caminho absoluto
Set oLink = oWS.CreateShortcut(sDesktop & "\\" & sName & ".lnk")
oLink.TargetPath = edgePath
oLink.Arguments = "--app=" & sUrl
If oFS.FileExists(edgePath) Then
  oLink.WorkingDirectory = oFS.GetParentFolderName(edgePath)
End If
oLink.WindowStyle = 1
If oFS.FileExists(iconFile) Then
  oLink.IconLocation = iconFile & ",0"
ElseIf oFS.FileExists(edgePath) Then
  oLink.IconLocation = edgePath & ",0"
End If
oLink.Description = "SEATI - ${title}"
oLink.Save

' 2. Cria atalho no Menu Iniciar com o caminho absoluto
Set oLink = oWS.CreateShortcut(sPrograms & "\\" & sName & ".lnk")
oLink.TargetPath = edgePath
oLink.Arguments = "--app=" & sUrl
If oFS.FileExists(edgePath) Then
  oLink.WorkingDirectory = oFS.GetParentFolderName(edgePath)
End If
oLink.WindowStyle = 1
If oFS.FileExists(iconFile) Then
  oLink.IconLocation = iconFile & ",0"
ElseIf oFS.FileExists(edgePath) Then
  oLink.IconLocation = edgePath & ",0"
End If
oLink.Description = "SEATI - ${title}"
oLink.Save

' 3. Abre o aplicativo na tela
ret = oWS.Run("""" & edgePath & """ --app=" & sUrl, 1, False)
If ret <> 0 Then
  oWS.Run sUrl, 1, False
End If

' 4. Mensagem de Sucesso
MsgBox "O SEATI (" & sName & ") foi instalado com sucesso!" & vbCrLf & vbCrLf & _
       "- Atalho oficial criado na sua Area de Trabalho" & vbCrLf & _
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
