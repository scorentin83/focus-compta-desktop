const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

    addCompany: (name) => ipcRenderer.invoke('add-company', name),

    getCompanies: () => ipcRenderer.invoke('get-companies')

});