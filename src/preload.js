const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    addCompany: (name) => ipcRenderer.invoke('add-company', name),
    getCompanies: () => ipcRenderer.invoke('get-companies'),

    addBankAccount: (data) => ipcRenderer.invoke('add-bank-account', data),
    getBankAccounts: (companyId) => ipcRenderer.invoke('get-bank-accounts', companyId)
});