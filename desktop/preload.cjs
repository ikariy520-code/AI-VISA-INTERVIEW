const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopBridge', {
  platform: process.platform,
  getConfig: () => ipcRenderer.invoke('desktop:get-config'),
  saveConfig: config => ipcRenderer.invoke('desktop:save-config', config),
  resetConfig: () => ipcRenderer.invoke('desktop:reset-config'),
  testNetwork: config => ipcRenderer.invoke('desktop:test-network', config),
  onOpenSettings: callback => {
    if (typeof callback !== 'function') return () => {}
    const listener = () => callback()
    ipcRenderer.on('desktop:open-settings', listener)
    return () => ipcRenderer.removeListener('desktop:open-settings', listener)
  },
})
