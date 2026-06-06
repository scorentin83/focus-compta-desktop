const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const database = require('./database');

console.log('DATABASE EXPORTS:', Object.keys(database));

const {
    createCompany,
    getCompanies,
    createBankAccount,
    getBankAccounts
} = database;

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
    createWindow();
});

ipcMain.handle('add-company', async (event, name) => {
    createCompany(name);
    return true;
});

ipcMain.handle('get-companies', async () => {
    return getCompanies();
});

ipcMain.handle('add-bank-account', async (event, data) => {
    createBankAccount(
        data.companyId,
        data.bankName,
        data.accountName,
        data.iban
    );

    return true;
});

ipcMain.handle('get-bank-accounts', async (event, companyId) => {
    return getBankAccounts(companyId);
});