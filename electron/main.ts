import { app, BrowserWindow, ipcMain, dialog, Menu, MenuItemConstructorOptions, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import HTMLtoDOCX from 'html-to-docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

interface WindowState {
  currentFilePath: string | null;
  forceClose: boolean;
}

const windowStates = new Map<number, WindowState>();

// 'reading': associação padrão de arquivo (duplo clique / verbo "Open") — somente
// visualização. 'editor': verbo "Edit with Paperditor" do menu de contexto do Windows
// (ver build/installer.nsh), que passa a flag --edit.
type OpenMode = 'reading' | 'editor';

interface LaunchIntent {
  filePath: string | null;
  mode: OpenMode;
}

function getLaunchIntent(argv: string[]): LaunchIntent {
  let filePath: string | null = null;
  let mode: OpenMode = 'reading';
  // Em produção: argv[0] é o executável; em dev pode ter flags do Electron
  for (const arg of argv.slice(1)) {
    if (arg === '--edit') {
      mode = 'editor';
      continue;
    }
    if (!arg.startsWith('-') && /\.(md|markdown)$/i.test(arg) && fs.existsSync(arg)) {
      filePath = arg;
    }
  }
  return { filePath, mode };
}

// Single instance lock: multiple windows within one process, but only one process
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// No macOS, arquivos abertos via associação chegam por este evento (não por argv), e
// pode disparar antes de app.whenReady() numa abertura "a frio" via duplo clique no
// Finder — por isso guardamos o caminho para usar depois que o app estiver pronto.
let macOpenFilePath: string | null = null;
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady()) {
    createWindow(filePath, 'reading');
  } else {
    macOpenFilePath = filePath;
  }
});

app.on('second-instance', (_event, argv) => {
  // Open a new window for each additional launch, optionally with the provided file
  const { filePath, mode } = getLaunchIntent(argv);
  createWindow(filePath ?? undefined, mode);
});

function getFocusedWin(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow();
}

let aboutWindow: BrowserWindow | null = null;

// Janela HTML própria em vez de dialog.showMessageBox: o MessageBox nativo só
// aceita texto puro no "detail", então links não ficam clicáveis.
function showAboutDialog() {
  if (aboutWindow) {
    aboutWindow.focus();
    return;
  }

  const parent = getFocusedWin();
  const iconBase64 = fs.readFileSync(path.join(process.env.VITE_PUBLIC, 'icon.png')).toString('base64');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    padding: 28px 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    text-align: center;
    color: #1a1a1a;
  }
  img { width: 64px; height: 64px; margin-bottom: 10px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .version { color: #666; font-size: 12px; margin-bottom: 14px; }
  .desc { font-size: 12px; margin-bottom: 16px; }
  .row { margin: 6px 0; font-size: 12px; }
  a { color: #0969da; text-decoration: none; cursor: pointer; }
  a:hover { text-decoration: underline; }
  .versions { margin-top: 18px; font-size: 11px; color: #888; }
  @media (prefers-color-scheme: dark) {
    body { color: #e6e6e6; }
    .version, .versions { color: #999; }
    a { color: #58a6ff; }
  }
</style>
</head>
<body>
  <img src="data:image/png;base64,${iconBase64}" alt="">
  <h1>Paperditor</h1>
  <div class="version">Versão ${app.getVersion()}</div>
  <div class="desc">Editor Markdown com Electron + React</div>
  <div class="row">Desenvolvido por <a href="https://guisaldanha.com/">Guilherme Saldanha</a></div>
  <div class="row"><a href="https://github.com/guisaldanha/paperditor">Projeto no GitHub</a></div>
  <div class="versions">Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}</div>
</body>
</html>`;

  aboutWindow = new BrowserWindow({
    width: 360,
    height: 340,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    parent: parent ?? undefined,
    modal: !!parent,
    show: false,
    title: 'About Paperditor',
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });
  aboutWindow.setMenu(null);

  aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  aboutWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    shell.openExternal(url);
  });

  aboutWindow.once('ready-to-show', () => aboutWindow?.show());
  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });

  aboutWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function createMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => getFocusedWin()?.webContents.send('menu:new'),
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => createWindow(),
        },
        { type: 'separator' },
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: () => getFocusedWin()?.webContents.send('menu:open'),
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => getFocusedWin()?.webContents.send('menu:save'),
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => getFocusedWin()?.webContents.send('menu:saveAs'),
        },
        { type: 'separator' },
        {
          label: 'Export PDF',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => getFocusedWin()?.webContents.send('menu:exportPdf'),
        },
        {
          label: 'Print',
          accelerator: 'CmdOrCtrl+P',
          click: () => getFocusedWin()?.webContents.send('menu:print'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Paperditor',
          click: () => showAboutDialog(),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow(filePath?: string, mode: OpenMode = 'reading') {
  const win = new BrowserWindow({
    width: 1250,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const state: WindowState = { currentFilePath: null, forceClose: false };
  windowStates.set(win.id, state);

  win.on('close', (e) => {
    const s = windowStates.get(win.id);
    if (s && !s.forceClose) {
      e.preventDefault();
      win.webContents.send('app:close-requested');
    } else {
      windowStates.delete(win.id);
    }
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  // Bloqueia qualquer navegação da janela principal para URLs externas.
  // Links externos devem ser abertos via shell:openExternal (IPC), nunca via navegação direta.
  win.webContents.on('will-navigate', (event, url) => {
    const appUrl = VITE_DEV_SERVER_URL ?? `file://${path.join(RENDERER_DIST, 'index.html')}`;
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) {
        shell.openExternal(url);
      }
    }
  });

  // Bloqueia abertura de novas janelas (target="_blank", window.open, etc.)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (filePath) {
    win.webContents.once('did-finish-load', () => {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        state.currentFilePath = filePath;
        win.webContents.send('file:opened', { content, path: filePath, mode });
      } catch (error) {
        console.error('Erro ao abrir arquivo:', error);
      }
    });
  }

  return win;
}

ipcMain.handle('shell:openExternal', (_event, url: string) => {
  // Only open http/https URLs for security
  if (/^https?:\/\//.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.handle('app:confirmClose', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const state = windowStates.get(win.id);
  if (state) state.forceClose = true;
  win.close();
});

ipcMain.handle('dialog:showUnsavedDialog', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)!;
  const result = await dialog.showMessageBox(win, {
    type: 'question',
    title: 'Unsaved Changes',
    message: 'There are unsaved changes. Do you want to save them?',
    buttons: ['Save', 'Discard', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  });
  if (result.response === 0) return 'save';
  if (result.response === 1) return 'discard';
  return 'cancel';
});

ipcMain.handle('dialog:openFile', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)!;
  const state = windowStates.get(win.id)!;
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  state.currentFilePath = filePath;

  return { content, path: filePath };
});

ipcMain.handle('dialog:saveFile', async (event, { content, path: filePathArg }) => {
  const win = BrowserWindow.fromWebContents(event.sender)!;
  const state = windowStates.get(win.id)!;
  let targetPath = filePathArg || state.currentFilePath;

  if (!targetPath) {
    const result = await dialog.showSaveDialog(win, {
      filters: [
        { name: 'Markdown', extensions: ['md'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    targetPath = result.filePath;
  }

  fs.writeFileSync(targetPath, content, 'utf-8');
  state.currentFilePath = targetPath;

  return targetPath;
});

ipcMain.handle('dialog:exportPdf', async (event, { htmlContent }: { htmlContent: string }) => {
  const win = BrowserWindow.fromWebContents(event.sender)!;
  const saveResult = await dialog.showSaveDialog(win, {
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return false;

  const printWin = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
  await printWin.loadURL(dataUrl);

  const pdfData = await printWin.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { top: 1, bottom: 1, left: 1, right: 1 },
  });

  fs.writeFileSync(saveResult.filePath, pdfData);
  printWin.destroy();
  return true;
});

ipcMain.handle('dialog:exportHtml', async (event, { htmlContent }: { htmlContent: string }) => {
  const win = BrowserWindow.fromWebContents(event.sender)!;
  const saveResult = await dialog.showSaveDialog(win, {
    filters: [{ name: 'HTML', extensions: ['html'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return false;

  fs.writeFileSync(saveResult.filePath, htmlContent, 'utf-8');
  return true;
});

ipcMain.handle('dialog:exportDocx', async (event, { htmlContent }: { htmlContent: string }) => {
  const win = BrowserWindow.fromWebContents(event.sender)!;
  const saveResult = await dialog.showSaveDialog(win, {
    filters: [{ name: 'Word Document', extensions: ['docx'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return false;

  const buffer = await HTMLtoDOCX(htmlContent, null, { table: { row: { cantSplit: true } } });
  fs.writeFileSync(saveResult.filePath, buffer);
  return true;
});

ipcMain.handle('dialog:print', async (_event, { htmlContent }: { htmlContent: string }) => {
  const printWin = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
  await printWin.loadURL(dataUrl);

  await new Promise<void>((resolve) => {
    printWin.webContents.print({}, () => resolve());
  });
  printWin.destroy();
});

ipcMain.handle('file:new', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    const state = windowStates.get(win.id);
    if (state) state.currentFilePath = null;
  }
});

ipcMain.handle('file:open', async (event, filePath: string) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  const state = windowStates.get(win.id)!;
  try {
    let targetPath = filePath;

    if (!path.isAbsolute(filePath)) {
      if (state.currentFilePath) {
        const currentDir = path.dirname(state.currentFilePath);
        targetPath = path.join(currentDir, filePath);
      }
    }

    if (!fs.existsSync(targetPath)) {
      console.error('File not found:', targetPath);
      return null;
    }

    const content = fs.readFileSync(targetPath, 'utf-8');
    state.currentFilePath = targetPath;

    win.webContents.send('file:opened', { content, path: targetPath });

    return { content, path: targetPath };
  } catch (error) {
    console.error('Error opening file:', error);
    return null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  createMenu();

  // Abre arquivo passado como argumento (duplo clique em .md/.markdown no Windows/Linux,
  // ou verbo "Edit with Paperditor" via --edit) ou capturado por open-file no macOS.
  if (macOpenFilePath) {
    createWindow(macOpenFilePath, 'reading');
  } else {
    const { filePath, mode } = getLaunchIntent(process.argv);
    createWindow(filePath ?? undefined, mode);
  }
});
