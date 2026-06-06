const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

    addCompany: (name) =>
        ipcRenderer.invoke('add-company', name),

    getCompanies: () =>
        ipcRenderer.invoke('get-companies'),

    addBankAccount: (data) =>
        ipcRenderer.invoke('add-bank-account', data),

    getBankAccounts: (companyId) =>
        ipcRenderer.invoke('get-bank-accounts', companyId),

    selectPdf: () =>
        ipcRenderer.invoke('select-pdf'),

    addStatement: (data) =>
        ipcRenderer.invoke('add-statement', data),

    getStatements: (bankAccountId) =>
        ipcRenderer.invoke('get-statements', bankAccountId)

});