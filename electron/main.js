const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')

let mainWindow
let ipcRegistered = false
let autoUpdaterInitialized = false

const UPDATE_CHANNELS = {
  CURRENT_VERSION: 'update:current-version',
  AVAILABLE: 'update:available',
  PROGRESS: 'update:download-progress',
  DOWNLOADED: 'update:downloaded',
  ERROR: 'update:error'
}

const isDevEnvironment = () => process.env.NODE_ENV === 'development' || !app.isPackaged
const shouldUseAutoUpdater = () => app.isPackaged && process.env.SKIP_AUTO_UPDATE !== '1'

const sendToRenderer = (channel, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    mainWindow.webContents.send(channel, payload)
  } catch (error) {
    console.error('[Electron] Failed to send update event', channel, error)
  }
}

function initializeAutoUpdater() {
  if (autoUpdaterInitialized || !shouldUseAutoUpdater()) {
    return
  }

  autoUpdaterInitialized = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('error', (error) => {
    console.error('[Electron] Auto-updater error', error)
    sendToRenderer(UPDATE_CHANNELS.ERROR, { message: error?.message || 'There was a problem checking for updates.' })
  })

  autoUpdater.on('update-available', (info) => {
    sendToRenderer(UPDATE_CHANNELS.AVAILABLE, info)
  })

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer(UPDATE_CHANNELS.PROGRESS, progress)
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendToRenderer(UPDATE_CHANNELS.DOWNLOADED, info)
  })

  // Trigger a check shortly after start
  setTimeout(() => {
    autoUpdater
      .checkForUpdates()
      .catch((error) => {
        console.error('[Electron] Initial update check failed', error)
        sendToRenderer(UPDATE_CHANNELS.ERROR, { message: error?.message || 'Could not check for updates.' })
      })
  }, 3000)
}

function registerIpcHandlers() {
  if (ipcRegistered) return

  ipcMain.handle('notification:show', (_event, payload) => {
    const { title, body } = payload || {}
    if (!title && !body) {
      return false
    }

    if (!Notification.isSupported()) {
      return false
    }

    try {
      const notification = new Notification({
        title: title || 'Family Office',
        body: body || ''
      })
      notification.show()
      return true
    } catch (error) {
      console.error('[Electron] Failed to display notification', error)
      return false
    }
  })

  ipcMain.handle('app:get-version', () => app.getVersion())

  ipcMain.handle('update:check', async () => {
    initializeAutoUpdater()
    if (!shouldUseAutoUpdater()) {
      return { ok: false, error: 'auto-update-disabled' }
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      return { ok: true, info: result?.updateInfo || null }
    } catch (error) {
      console.error('[Electron] Failed to check for updates', error)
      sendToRenderer(UPDATE_CHANNELS.ERROR, { message: error?.message || 'Could not check for updates.' })
      return { ok: false, error: error?.message || 'check-failed' }
    }
  })

  ipcMain.handle('update:download', async () => {
    initializeAutoUpdater()
    if (!shouldUseAutoUpdater()) {
      return { ok: false, error: 'auto-update-disabled' }
    }

    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (error) {
      console.error('[Electron] Failed to download update', error)
      sendToRenderer(UPDATE_CHANNELS.ERROR, { message: error?.message || 'Download failed. Please try again.' })
      return { ok: false, error: error?.message || 'download-failed' }
    }
  })

  ipcMain.handle('update:install', async () => {
    initializeAutoUpdater()
    if (!shouldUseAutoUpdater()) {
      return { ok: false, error: 'auto-update-disabled' }
    }

    try {
      setImmediate(() => {
        autoUpdater.quitAndInstall(false, true)
      })
      return { ok: true }
    } catch (error) {
      console.error('[Electron] Failed to install update', error)
      sendToRenderer(UPDATE_CHANNELS.ERROR, { message: error?.message || 'Install failed.' })
      return { ok: false, error: error?.message || 'install-failed' }
    }
  })

  ipcRegistered = true
}

function createWindow() {
  const isDev = isDevEnvironment()

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.png'),
    title: 'Family Office'
  })

  // Start local Next.js server in production
  if (!isDev) {
    const { createServer } = require('http')
    const next = require('next')

    // Use process.resourcesPath for packaged app (handles ASAR unpacking)
    const appPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked')
      : path.join(__dirname, '..')

    const nextApp = next({ dev: false, dir: appPath })
    const handle = nextApp.getRequestHandler()

    console.log('[Electron] Starting Next.js server in production mode...')
    console.log('[Electron] App packaged:', app.isPackaged)
    console.log('[Electron] Next.js dir:', appPath)

    nextApp.prepare().then(() => {
      console.log('[Electron] Next.js prepared successfully')
      const server = createServer((req, res) => handle(req, res))
      server.listen(0, 'localhost', () => {
        const port = server.address().port
        console.log('[Electron] Next.js server listening on port:', port)
        mainWindow.loadURL(`http://localhost:${port}`)
      })
    }).catch((err) => {
      console.error('[Electron] Failed to start Next.js server:', err)
      // Show window anyway with error message
      mainWindow.show()
      mainWindow.loadURL(`data:text/html,<html><body><h1>Error starting application</h1><pre>${err.message}</pre></body></html>`)
    })
  } else {
    mainWindow.loadURL('http://localhost:3007')
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return
    mainWindow.show()
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  })

  // Fallback: show window after 10 seconds if still not shown
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('[Electron] Window not visible after 10s, forcing show')
      mainWindow.show()
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  }, 10000)

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isAppUrl = url.startsWith('http://localhost:3007') || url.startsWith('https://app.familyoffice.com')
    if (!isAppUrl) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.webContents.once('did-finish-load', () => {
    sendToRenderer(UPDATE_CHANNELS.CURRENT_VERSION, { version: app.getVersion() })
    if (shouldUseAutoUpdater()) {
      initializeAutoUpdater()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const shouldQuit = !app.requestSingleInstanceLock()
if (shouldQuit) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.familyoffice.desktop')
  }

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
