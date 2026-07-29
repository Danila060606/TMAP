const { contextBridge, ipcRenderer } = require('electron');

console.log('preload.js загружен');

contextBridge.exposeInMainWorld('electronAPI', {
    onExportPNG: (callback) => ipcRenderer.on('export-png', callback),
    onExportPDF: (callback) => ipcRenderer.on('export-pdf', callback),
    logout: () => ipcRenderer.send('logout'),
    saveLogosToGitHub: (logosData, token) => ipcRenderer.invoke('save-logos-to-github', { logosData, token }),
    // Новые методы для админки
    readUsersFromGitHub: (token) => ipcRenderer.invoke('read-users-from-github', token),
    writeUsersToGitHub: (users, token) => ipcRenderer.invoke('write-users-to-github', { users, token })
});