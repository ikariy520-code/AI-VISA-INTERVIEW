import { app, BrowserWindow, Menu, dialog, ipcMain, shell, utilityProcess } from 'electron'
import { join } from 'node:path'
import { getDesktopConfig, getDesktopRuntimeEnv, removeDesktopConfig, saveDesktopConfig } from './configStore.mjs'
import { testDesktopNetwork } from './networkDiagnostics.mjs'

let mainWindow = null
let serverChild = null
let activeOrigin = ''
let restarting = Promise.resolve()
let isQuitting = false
let serverRecoveryAttempts = 0
let lastServerReadyAt = 0
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

function redactServerOutput(value, runtimeEnv) {
  let output = String(value || '')
  for (const secret of [
    runtimeEnv.DOUBAO_APP_ID,
    runtimeEnv.DOUBAO_ACCESS_KEY,
    runtimeEnv.GEMINI_API_KEY,
    runtimeEnv.OPENAI_API_KEY,
    runtimeEnv.REPORT_API_KEY,
  ]) {
    if (typeof secret === 'string' && secret.length >= 6) output = output.replaceAll(secret, '[REDACTED]')
  }
  return output.replace(/[\r\n]+/g, ' ').trim()
}

async function verifyLocalServer(origin) {
  let lastError = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/app-health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(2_500),
      })
      const payload = await response.json().catch(() => null)
      if (response.ok && payload?.ok === true) return payload
      lastError = new Error(`本地服务健康检查失败（HTTP ${response.status}）。`)
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 120 * (attempt + 1)))
  }
  throw lastError instanceof Error ? lastError : new Error('本地服务健康检查失败。')
}

function recoverUnexpectedServerExit(code) {
  if (isQuitting || !mainWindow || mainWindow.isDestroyed()) return
  const stableForMs = Date.now() - lastServerReadyAt
  if (stableForMs > 60_000) serverRecoveryAttempts = 0
  if (serverRecoveryAttempts >= 2) {
    dialog.showErrorBox(
      'AI 面签本地服务已停止',
      `本地服务连续异常退出（${code ?? 'unknown'}）。请重新启动应用；若问题持续，请在 GitHub Issues 中附上发生步骤。`,
    )
    return
  }
  serverRecoveryAttempts += 1
  setTimeout(() => {
    void restartServerAndReload().catch(error => {
      dialog.showErrorBox('AI 面签本地服务恢复失败', error instanceof Error ? error.message : String(error))
    })
  }, 600)
}

async function startServer() {
  stopServer()
  activeOrigin = ''
  const runtimeEnv = await getDesktopRuntimeEnv()
  return await new Promise((resolve, reject) => {
    let settled = false
    let ready = false
    let recentOutput = ''
    const child = utilityProcess.fork(serverEntryPath(), [], {
      cwd: app.isPackaged ? process.resourcesPath : app.getAppPath(),
      env: {
        ...process.env,
        ...runtimeEnv,
      },
      stdio: 'pipe',
      serviceName: 'AI Visa Interview local server',
    })
    serverChild = child

    const captureOutput = (chunk, error = false) => {
      const safe = redactServerOutput(chunk, runtimeEnv)
      if (!safe) return
      recentOutput = `${recentOutput} ${safe}`.slice(-2_000)
      if (!app.isPackaged && process.env.DESKTOP_RELAY_SERVER_LOGS === '1') {
        const relay = error ? console.error : console.log
        relay(`[desktop-server] ${safe}`)
      }
    }
    child.stdout?.on('data', chunk => captureOutput(chunk))
    child.stderr?.on('data', chunk => captureOutput(chunk, true))

    const fail = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (serverChild === child) serverChild = null
      const detail = recentOutput ? `\n\n诊断信息：${recentOutput}` : ''
      reject(new Error(`${error instanceof Error ? error.message : String(error)}${detail}`))
    }

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      fail(new Error('本地服务启动超时。请检查安全软件是否阻止了本机回环连接。'))
    }, 20_000)

    child.once('exit', code => {
      const wasActiveChild = serverChild === child
      if (wasActiveChild) serverChild = null
      if (!ready) return fail(new Error(`本地服务异常退出（${code ?? 'unknown'}）。`))
      if (wasActiveChild) {
        activeOrigin = ''
        recoverUnexpectedServerExit(code)
      }
    })
    child.on('message', async message => {
      if (!message || message.type !== 'server-ready' || !Number.isInteger(message.port) || message.port < 1 || message.port > 65_535) return
      const origin = `http://127.0.0.1:${message.port}`
      try {
        await verifyLocalServer(origin)
        if (settled) return
        settled = true
        ready = true
        clearTimeout(timeout)
        activeOrigin = origin
        lastServerReadyAt = Date.now()
        resolve(activeOrigin)
      } catch (error) {
        child.kill('SIGTERM')
        fail(error)
      }
    })
  })
}

function restartServerAndReload() {
  restarting = restarting
    .catch(() => undefined)
    .then(async () => {
      const origin = await startServer()
      if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadURL(origin)
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
  await restartServerAndReload()
  return config
})
ipcMain.handle('desktop:reset-config', async event => {
  assertTrustedSender(event)
  await removeDesktopConfig()
  await restartServerAndReload()
  return true
})
ipcMain.handle('desktop:test-network', async (event, input) => {
  assertTrustedSender(event)
  return testDesktopNetwork(input)
})

const hasSingleInstanceLock = app.requestSingleInstanceLock()

app.on('before-quit', () => {
  isQuitting = true
  stopServer()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (!mainWindow && activeOrigin) createWindow(activeOrigin)
})
app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

if (!hasSingleInstanceLock) {
  app.quit()
} else app.whenReady().then(async () => {
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
