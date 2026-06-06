const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

const {
    createCompany,
    getCompanies,
    createBankAccount,
    getBankAccounts,
    createStatement,
    getStatements
} = require('./database');

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

ipcMain.handle('select-pdf', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Importer un relevé bancaire PDF',
        filters: [
            { name: 'PDF', extensions: ['pdf'] }
        ],
        properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    const filepath = result.filePaths[0];
    const filename = path.basename(filepath);

    return {
        filename,
        filepath
    };
});

ipcMain.handle('add-statement', async (event, data) => {
    createStatement(
        data.bankAccountId,
        data.filename,
        data.filepath
    );

    return true;
});

ipcMain.handle('get-statements', async (event, bankAccountId) => {
    return getStatements(bankAccountId);
});