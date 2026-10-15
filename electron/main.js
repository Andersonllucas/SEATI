const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Configuração padrão da aplicação
const DEFAULT_URL = 'https://ais-pre-umgoxrv5g7z5rprhf3yjnm-337117804073.us-east1.run.app';
const CONFIG_FILE = path.join(app.getPath('userData'), 'seati-config.json');

let mainWindow = null;
let tray = null;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Erro ao ler configuração:', e);
  }
  return { serverUrl: DEFAULT_URL };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('Erro ao salvar configuração:', e);
  }
}

function getIconPath() {
  // Procura o melhor ícone disponível
  const candidates = [
    path.join(__dirname, 'icon.ico'),
    path.join(__dirname, 'icon-512.png'),
    path.join(__dirname, '../public/icon.ico'),
    path.join(__dirname, '../public/icon-512.png')
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function createWindow() {
  const config = loadConfig();
  const iconPath = getIconPath();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'SEATI - Sistema de Gestão Eleitoral',
    icon: iconPath,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      spellcheck: false,
    },
  });

  // Remove menu padrão do Windows para aspecto de app nativo
  Menu.setApplicationMenu(null);

  // Carrega a URL do sistema
  const targetUrl = process.env.SEATI_URL || config.serverUrl || DEFAULT_URL;
  mainWindow.loadURL(targetUrl);

  // Intercepta falhas de conexão com a internet e mostra tela amigável
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    if (errorCode === -3) return; // Abortado intencionalmente
    const offlineHtml = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>SEATI - Conectando...</title>
        <style>
          body {
            margin: 0;
            padding: 0;
            background: #0f172a;
            color: #f8fafc;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            text-align: center;
          }
          .card {
            background: #1e293b;
            border: 1px solid #334155;
            padding: 40px;
            border-radius: 16px;
            max-width: 440px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
          }
          .title { font-size: 20px; font-weight: 700; margin-bottom: 12px; color: #38bdf8; }
          .desc { font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px; }
          .btn {
            background: #0284c7;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            font-size: 14px;
            transition: 0.2s background;
          }
          .btn:hover { background: #0369a1; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="title">Conectando ao SEATI</div>
          <div class="desc">Não foi possível carregar os dados no momento. Verifique sua conexão com a internet e tente novamente.</div>
          <button class="btn" onclick="window.location.reload()">Tentar Novamente</button>
        </div>
      </body>
      </html>
    `;
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(offlineHtml)}`);
  });

  // Abre links externos no navegador padrão do sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      // Se for domínio interno, abre na mesma janela
      if (url.includes('run.app') || url.includes('adti.app.br') || url.includes('localhost')) {
        return { action: 'allow' };
      }
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Inicialização do aplicativo
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
