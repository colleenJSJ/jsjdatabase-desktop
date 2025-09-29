const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  showNotification: (title, body) => ipcRenderer.invoke('notification:show', { title, body })
})
