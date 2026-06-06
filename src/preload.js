const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    addCompany: (name) => ipcRenderer.invoke('add-company', name),
    getCompanies: () => ipcRenderer.invoke('get-companies'),

    addBankAccount: (data) => ipcRenderer.invoke('add-bank-account', data),
    getBankAccounts: (companyId) => ipcRenderer.invoke('get-bank-accounts', companyId),

    selectPdf: () => ipcRenderer.invoke('select-pdf'),
    addStatement: (data) => ipcRenderer.invoke('add-statement', data),
    getStatements: (bankAccountId) => ipcRenderer.invoke('get-statements', bankAccountId),
    deleteStatement: (statementId) => ipcRenderer.invoke('delete-statement', statementId),

    getTransactions: (data) => ipcRenderer.invoke('get-transactions', data),
    getTransaction: (transactionId) => ipcRenderer.invoke('get-transaction', transactionId),
    updateTransactionStatus: (data) => ipcRenderer.invoke('update-transaction-status', data),
    updateTransactionDetails: (data) => ipcRenderer.invoke('update-transaction-details', data),
    getTransactionSummary: (data) => ipcRenderer.invoke('get-transaction-summary', data),
    getAvailablePeriods: (bankAccountId) => ipcRenderer.invoke('get-available-periods', bankAccountId),
    getDashboardInsights: (data) => ipcRenderer.invoke('get-dashboard-insights', data),
    selectSmartReceipt: (bankAccountId) => ipcRenderer.invoke('select-smart-receipt', bankAccountId),

    selectReceipt: () => ipcRenderer.invoke('select-receipt'),
    addReceipt: (data) => ipcRenderer.invoke('add-receipt', data),
    getReceipts: (transactionId) => ipcRenderer.invoke('get-receipts', transactionId),
    deleteReceipt: (receiptId) => ipcRenderer.invoke('delete-receipt', receiptId),

    openFile: (filepath) => ipcRenderer.invoke('open-file', filepath),

    createBackup: () => ipcRenderer.invoke('create-backup'),
    openDataFolder: () => ipcRenderer.invoke('open-data-folder')
});
