const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')
const path = require('path')
const http = require('http')

app.setName('JSJ Database')

let mainWindow
let ipcRegistered = false
let autoUpdaterInitialized = false
let standaloneServer = null
let serverShutdownPromise = null
let quittingApp = false

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

const closeStandaloneServer = () => {
  console.log('[Electron] closeStandaloneServer invoked')
  if (!standaloneServer) {
    return Promise.resolve()
  }

  if (serverShutdownPromise) {
    return serverShutdownPromise
  }

  serverShutdownPromise = new Promise((resolve) => {
    try {
      standaloneServer.close((error) => {
        if (error) {
          console.error('[Electron] Failed to close standalone Next.js server', error)
        } else {
          console.log('[Electron] Standalone Next.js server closed')
        }
        console.log('[Electron] standalone server close callback fired')
        standaloneServer = null
        serverShutdownPromise = null
        resolve()
      })
    } catch (error) {
      console.error('[Electron] Error while closing standalone Next.js server', error)
      standaloneServer = null
      serverShutdownPromise = null
      resolve()
    }
  })

  return serverShutdownPromise
}

function initializeAutoUpdater() {
  if (autoUpdaterInitialized || !shouldUseAutoUpdater()) {
    return
  }

  autoUpdaterInitialized = true
  autoUpdater.logger = log
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (error) => {
    console.error('[Electron] Auto-updater error', error)
    // Only show error in UI if user manually triggered check, not on automatic checks
    // Don't send error to renderer for silent background checks
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[Electron] Update available:', info)
    sendToRenderer(UPDATE_CHANNELS.AVAILABLE, info)
  })

  autoUpdater.on('update-not-available', (info) => {
    console.log('[Electron] No update available, already on latest version')
    // Don't send anything to renderer - no need to show UI
  })

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer(UPDATE_CHANNELS.PROGRESS, progress)
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendToRenderer(UPDATE_CHANNELS.DOWNLOADED, info)
  })

  // Trigger a check shortly after start (only if not skipped)
  if (shouldUseAutoUpdater()) {
    setTimeout(() => {
      autoUpdater
        .checkForUpdates()
        .catch((error) => {
          console.error('[Electron] Initial update check failed', error)
          // Don't show error in UI for automatic checks
        })
    }, 10000) // Wait 10 seconds to let app load first

    // Check for updates every 6 hours while app is running
    setInterval(() => {
      console.log('[Electron] Periodic update check...')
      autoUpdater
        .checkForUpdates()
        .catch((error) => {
          console.error('[Electron] Periodic update check failed', error)
        })
    }, 6 * 60 * 60 * 1000) // 6 hours
  }
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
      await closeStandaloneServer()
      autoUpdater.quitAndInstall(false, true)
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

    const appBasePath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked')
      : path.join(__dirname, '..')

    // Load environment variables from .env file
    const fs = require('fs')
    const envPath = path.join(appBasePath, '.env')

    console.log('[Electron] Loading environment from:', envPath)

    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8')
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=')
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim()
            process.env[key.trim()] = value
          }
        }
      })
      console.log('[Electron] Environment variables loaded')
    } else {
      console.warn('[Electron] Warning: .env file not found at', envPath)
    }

    // Use standalone Next.js server (doesn't require npm)
    const appPath = path.join(appBasePath, '.next', 'standalone')

    const serverPath = path.join(appPath, 'server.js')

    console.log('[Electron] Starting Next.js standalone server...')
    console.log('[Electron] App packaged:', app.isPackaged)
    console.log('[Electron] Server path:', serverPath)

    try {
      // Set NODE_ENV and hostname for Next.js standalone
      process.env.NODE_ENV = 'production'
      process.env.HOSTNAME = 'localhost'

      // Show a loading screen first
      mainWindow.loadURL(`data:text/html,<html><body style="margin:0;padding:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#1f1f1e;color:#fff;font-family:system-ui"><div style="text-align:center"><h1>Starting JSJ Database...</h1><p>Please wait</p></div></body></html>`)
      mainWindow.show()

      const originalCreateServer = http.createServer
      let serverCaptured = false

      http.createServer = (...args) => {
        const server = Reflect.apply(originalCreateServer, http, args)
        if (!serverCaptured) {
          serverCaptured = true
          standaloneServer = server
          server.on('close', () => {
            if (standaloneServer === server) {
              standaloneServer = null
            }
          })
          console.log('[Electron] Standalone Next.js server created')
        }
        return server
      }

      try {
        // Start the standalone server
        require(serverPath)
      } finally {
        http.createServer = originalCreateServer
      }

      // Wait for server to be ready before loading
      const checkServer = async () => {
        const port = process.env.PORT || 3000
        try {
          const http = require('http')
          const options = { hostname: 'localhost', port, path: '/', method: 'GET', timeout: 1000 }

          await new Promise((resolve, reject) => {
            const req = http.request(options, (res) => {
              console.log('[Electron] Server is responding!')
              resolve()
            })
            req.on('error', reject)
            req.on('timeout', reject)
            req.end()
          })

          console.log('[Electron] Next.js server ready on port:', port)
          mainWindow.loadURL(`http://localhost:${port}`)
        } catch (err) {
          console.log('[Electron] Server not ready yet, retrying...')
          setTimeout(checkServer, 1000)
        }
      }

      // Start checking after 2 seconds
      setTimeout(checkServer, 2000)

    } catch (err) {
      console.error('[Electron] Failed to start Next.js server:', err)
      // Show window anyway with error message
      mainWindow.show()
      mainWindow.loadURL(`data:text/html,<html><body><h1>Error starting application</h1><pre>${err.message}</pre><pre>${err.stack}</pre></body></html>`)
    }
  } else {
    mainWindow.loadURL('http://localhost:3007')
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return
    mainWindow.show()
    // Open DevTools only in development
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  })

  // Fallback: show window after 10 seconds if still not shown
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('[Electron] Window not visible after 10s, forcing show')
      mainWindow.show()
      if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' })
      }
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

  app.on('before-quit', (event) => {
    if (quittingApp) {
      return
    }

    if (!standaloneServer && !serverShutdownPromise) {
      return
    }

    event.preventDefault()
    console.log('[Electron] before-quit: waiting for standalone server shutdown')
    closeStandaloneServer()
      .catch((error) => {
        console.error('[Electron] Failed to close server during quit', error)
      })
      .finally(() => {
        quittingApp = true
        app.quit()
      })
  })

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
