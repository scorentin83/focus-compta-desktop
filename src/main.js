const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const pdfParseModule = require('pdf-parse');

const PDFParse = pdfParseModule.PDFParse;

const {
    createCompany,
    getCompanies,
    createBankAccount,
    getBankAccounts,
    createStatement,
    getStatements,
    statementExists,
    createTransaction,
    getTransactions
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

function parseFrenchAmount(value) {
    return Number(
        value
            .replace(/\s/g, '')
            .replace(',', '.')
    );
}

function parseCreditAgricoleTransactions(text, bankAccountId, filename) {
    const lines = text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const transactions = [];

    const operationRegex = /^(\d{2}\.\d{2})\s+(\d{2}\.\d{2})\s+(.+?)\s+(\d[\d\s]*,\d{2})\s*¨?$/;

    for (const line of lines) {
        if (
            line.includes('Ancien solde') ||
            line.includes('Nouveau solde') ||
            line.includes('Total des opérations')
        ) {
            continue;
        }

        const match = line.match(operationRegex);

        if (!match) continue;

        const dateOperation = match[1];
        const label = match[3].trim();
        const amountRaw = match[4];
        const amount = parseFrenchAmount(amountRaw);

        const isDebit =
            label.toLowerCase().startsWith('prlv') ||
            label.toLowerCase().includes('vers ') ||
            label.toLowerCase().includes('cotis') ||
            label.toLowerCase().includes('frais');

        const signedAmount = isDebit ? -amount : amount;
        const type = isDebit ? 'debit' : 'credit';

        const transaction = {
            bankAccountId,
            dateOperation,
            label,
            amount: signedAmount,
            type,
            pdfSource: filename
        };

        createTransaction(
            transaction.bankAccountId,
            transaction.dateOperation,
            transaction.label,
            transaction.amount,
            transaction.type,
            transaction.pdfSource
        );

        transactions.push(transaction);
    }

    return transactions;
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

    const existing = statementExists(
        data.bankAccountId,
        data.filepath
    );

    if (existing) {
        return {
            imported: false,
            message: 'PDF déjà importé',
            transactionsCount: 0
        };
    }

    createStatement(
        data.bankAccountId,
        data.filename,
        data.filepath
    );

    const buffer = fs.readFileSync(data.filepath);

    const parser = new PDFParse({
        data: buffer
    });

    const parsed = await parser.getText();

    const transactions = parseCreditAgricoleTransactions(
        parsed.text,
        data.bankAccountId,
        data.filename
    );

    return {
        imported: true,
        transactionsCount: transactions.length
    };
});

ipcMain.handle('get-statements', async (event, bankAccountId) => {
    return getStatements(bankAccountId);
});

ipcMain.handle('get-transactions', async (event, bankAccountId) => {
    return getTransactions(bankAccountId);
});