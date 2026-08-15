import { app, BrowserWindow, Menu, dialog, ipcMain, shell, utilityProcess } from 'electron'
import { join } from 'node:path'
import { getDesktopConfig, getDesktopRuntimeEnv, removeDesktopConfig, saveDesktopConfig } from './configStore.mjs'

let mainWindow = null
let serverChild = null
let activeOrigin = ''
let restarting = Promise.resolve()
const SOURCE_URL = 'https://github.com/ikariy520-code/future'

function legalFilePath(name) {
  return app.isPackaged
    ? join(process.resourcesPath, 'legal', name)
    : join(app.getAppPath(), name)
}

async function openLegalFile(name) {
  const error = await shell.openPath(legalFilePath(name))
  if (error) dialog.showErrorBox('无法打开法律文件', error)
}

function serverEntryPath() {
  return app.isPackaged
    ? join(process.resourcesPath, 'server', 'index.mjs')
    : join(app.getAppPath(), 'server', 'index.mjs')
}

function stopServer() {
  if (!serverChild) return
  serverChild.removeAllListeners()
  serverChild.kill('SIGTERM')
  serverChild = null
}

async function startServer() {
  stopServer()
  const runtimeEnv = await getDesktopRuntimeEnv()
  return await new Promise((resolve, reject) => {
    const child = utilityProcess.fork(serverEntryPath(), [], {
      cwd: app.isPackaged ? process.resourcesPath : app.getAppPath(),
      env: {
        ...process.env,
        ...runtimeEnv,
      },
      stdio: app.isPackaged ? 'ignore' : 'pipe',
      serviceName: 'AI Visa Interview local server',
    })
    serverChild = child
    if (!app.isPackaged && process.env.DESKTOP_RELAY_SERVER_LOGS === '1') {
      child.stdout?.on('data', chunk => console.log(`[desktop-server] ${String(chunk).trimEnd()}`))
      child.stderr?.on('data', chunk => console.error(`[desktop-server] ${String(chunk).trimEnd()}`))
    }

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('本地服务启动超时。'))
    }, 20_000)

    child.once('exit', code => {
      const wasActiveChild = serverChild === child
      if (wasActiveChild) serverChild = null
      if (wasActiveChild && !activeOrigin) {
        clearTimeout(timeout)
        reject(new Error(`本地服务异常退出（${code ?? 'unknown'}）。`))
      }
    })
    child.on('message', message => {
      if (!message || message.type !== 'server-ready' || !Number.isInteger(message.port)) return
      clearTimeout(timeout)
      activeOrigin = `http://127.0.0.1:${message.port}`
      resolve(activeOrigin)
    })
  })
}

function restartServerAndReload() {
  restarting = restarting
    .catch(() => undefined)
    .then(async () => {
      activeOrigin = ''
      const origin = await startServer()
      if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadURL(origin)
    })
    .catch(error => {
      dialog.showErrorBox('AI 面签本地服务启动失败', error instanceof Error ? error.message : String(error))
    })
  return restarting
}

function buildMenu() {
  const template = [
    {
      label: '应用',
      submenu: [
        {
          label: '模型设置',
          accelerator: 'Ctrl+,',
          click: () => mainWindow?.webContents.send('desktop:open-settings'),
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '查看源代码', click: () => void shell.openExternal(SOURCE_URL) },
        { label: '版权声明', click: () => void openLegalFile('NOTICE') },
        { label: '开源许可证', click: () => void openLegalFile('LICENSE') },
        { label: '商业授权说明', click: () => void openLegalFile('COMMERCIAL_LICENSE.md') },
        { label: '第三方许可证', click: () => void openLegalFile('THIRD_PARTY_NOTICES.md') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(origin) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    title: 'AI Visa Interview',
    backgroundColor: '#f5f5f7',
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(app.getAppPath(), 'desktop', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.once('ready-to-show', () => {
    if (process.env.DESKTOP_SMOKE_TEST !== '1') mainWindow?.show()
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault()
  })
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    let sameOrigin = false
    try {
      sameOrigin = new URL(details.requestingUrl).origin === origin
    } catch {
      sameOrigin = false
    }
    callback(webContents === mainWindow?.webContents && permission === 'media' && sameOrigin)
  })
  mainWindow.webContents.once('did-finish-load', () => {
    if (process.env.DESKTOP_SMOKE_TEST === '1') {
      console.log('[desktop-smoke] renderer loaded')
      setTimeout(() => app.quit(), 250)
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  void mainWindow.loadURL(origin)
}

function assertTrustedSender(event) {
  if (event.sender !== mainWindow?.webContents) throw new Error('拒绝未知窗口访问本地配置。')
}

ipcMain.handle('desktop:get-config', event => {
  assertTrustedSender(event)
  return getDesktopConfig()
})
ipcMain.handle('desktop:save-config', async (_event, input) => {
  assertTrustedSender(_event)
  const config = await saveDesktopConfig(input)
  setTimeout(() => void restartServerAndReload(), 100)
  return config
})
ipcMain.handle('desktop:reset-config', async event => {
  assertTrustedSender(event)
  await removeDesktopConfig()
  setTimeout(() => void restartServerAndReload(), 100)
  return true
})

app.on('before-quit', stopServer)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (!mainWindow && activeOrigin) createWindow(activeOrigin)
})

app.whenReady().then(async () => {
  app.setAppUserModelId('com.aivisainterview.desktop')
  buildMenu()
  try {
    const origin = await startServer()
    createWindow(origin)
  } catch (error) {
    dialog.showErrorBox('AI 面签无法启动', error instanceof Error ? error.message : String(error))
    app.quit()
  }
})
