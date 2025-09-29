const { contextBridge, ipcRenderer } = require('electron')

const exposeUpdateListener = (channel, transform) => (callback) => {
  if (typeof callback !== 'function') return () => {}
  const handler = (_event, payload) => {
    try {
      callback(transform ? transform(payload) : payload)
    } catch (error) {
      console.error('[Preload] Update listener error', error)
    }
  }
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  showNotification: (title, body) => ipcRenderer.invoke('notification:show', { title, body }),
  updates: {
    checkForUpdates: () => ipcRenderer.invoke('update:check'),
    downloadUpdate: () => ipcRenderer.invoke('update:download'),
    installUpdate: () => ipcRenderer.invoke('update:install'),
    getCurrentVersion: () => ipcRenderer.invoke('app:get-version'),
    onCurrentVersion: exposeUpdateListener('update:current-version'),
    onUpdateAvailable: exposeUpdateListener('update:available'),
    onDownloadProgress: exposeUpdateListener('update:download-progress'),
    onUpdateDownloaded: exposeUpdateListener('update:downloaded'),
    onError: exposeUpdateListener('update:error')
  }
})
