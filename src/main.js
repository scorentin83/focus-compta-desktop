const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const { createCompany, getCompanies } = require('./database');

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