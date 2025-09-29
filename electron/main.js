const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron')
const path = require('path')

let mainWindow
let ipcRegistered = false

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

  ipcRegistered = true
}

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development'

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

  const url = isDev ? 'http://localhost:3007' : 'https://app.familyoffice.com'
  mainWindow.loadURL(url)

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return
    mainWindow.show()
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  })

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
