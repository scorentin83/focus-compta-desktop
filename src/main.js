const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const pdfParseModule = require('pdf-parse');

const PDFParse = pdfParseModule.PDFParse;

const {
    DATA_DIR,
    STATEMENTS_DIR,
    RECEIPTS_DIR,
    BACKUPS_DIR,
    DB_PATH,
    createCompany,
    getCompanies,
    createBankAccount,
    getBankAccounts,
    createStatement,
    updateStatementPeriod,
    getStatements,
    statementExists,
    getStatementFiles,
    deleteStatement,
    createTransaction,
    getTransactions,
    getTransaction,
    updateTransactionStatus,
    updateTransactionDetails,
    getTransactionSummary,
    getAvailablePeriods,
    getDashboardInsights,
    findReceiptMatches,
    createReceipt,
    getReceipt,
    getReceipts,
    deleteReceipt
} = require('./database');

function createWindow() {
    const win = new BrowserWindow({
        width: 1700,
        height: 1000,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win.loadFile(path.join(__dirname, 'index.html'));
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeFilename(filename) {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'document';

    return `${base}${ext.toLowerCase()}`;
}

function uniqueDestination(dir, filename) {
    ensureDir(dir);
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let destination = path.join(dir, filename);
    let counter = 1;

    while (fs.existsSync(destination)) {
        destination = path.join(dir, `${base}-${counter}${ext}`);
        counter += 1;
    }

    return destination;
}

function copyToFocusData(sourcePath, destinationDirParts) {
    const filename = safeFilename(path.basename(sourcePath));
    const destinationDir = path.join(...destinationDirParts);
    const destination = uniqueDestination(destinationDir, filename);
    fs.copyFileSync(sourcePath, destination);

    return {
        filename: path.basename(destination),
        filepath: destination
    };
}

function deleteFileIfInsideDataDir(filepath) {
    if (!filepath) return;

    const resolved = path.resolve(filepath);
    const dataRoot = path.resolve(DATA_DIR);

    if (!resolved.startsWith(dataRoot)) return;
    if (!fs.existsSync(resolved)) return;

    try {
        fs.unlinkSync(resolved);
    } catch (error) {
        console.warn('Impossible de supprimer le fichier :', resolved, error.message);
    }
}

function parseFrenchAmount(value) {
    return Number(
        String(value)
            .replace(/\s/g, '')
            .replace(',', '.')
    );
}

function normalizeDate(value) {
    return String(value).replace('.', '/');
}

function monthNameToNumber(value) {
    const normalized = String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const months = {
        janvier: '01',
        fevrier: '02',
        mars: '03',
        avril: '04',
        mai: '05',
        juin: '06',
        juillet: '07',
        aout: '08',
        septembre: '09',
        octobre: '10',
        novembre: '11',
        decembre: '12'
    };

    return months[normalized] || null;
}

function extractStatementPeriod(text, filename) {
    const dateMatch = text.match(/Date d[’']arrêté\s*:\s*(\d{1,2})\s+([A-Za-zéûîôàèùç]+)\s+(\d{4})/i);

    if (dateMatch) {
        return {
            year: dateMatch[3],
            month: monthNameToNumber(dateMatch[2])
        };
    }

    const filenameMatch = String(filename).match(/(\d{2})-(\d{2})-(\d{4})/);

    if (filenameMatch) {
        return {
            year: filenameMatch[3],
            month: filenameMatch[2]
        };
    }

    return {
        year: null,
        month: null
    };
}

function findBestAmount(text) {
    const value = String(text || '').trim();
    const candidates = [];

    function pushCandidate(amountRaw, index) {
        const amount = parseFrenchAmount(amountRaw);
        if (!Number.isFinite(amount)) return;
        if (amount <= 0 || amount > 10000000) return;

        candidates.push({
            amountRaw,
            amount,
            index
        });
    }

    // Cas normal : le montant est séparé du libellé par un espace.
    // Cela évite de lire F25-587396,00 comme 587 396,00.
    const normalRegex = /(^|\s)((?:\d{1,3}(?:\s\d{3})*|\d{1,6}),\d{2})\s*¨?/g;
    let match;

    while ((match = normalRegex.exec(value)) !== null) {
        pushCandidate(match[2], match.index + match[1].length);
    }

    if (candidates.length > 0) {
        return candidates[candidates.length - 1];
    }

    // Cas PDF Crédit Agricole : le montant peut être collé à une référence.
    // Exemples observés :
    // - 26/12/255159,40  => montant 5 159,40
    // - F25-587396,00   => montant 396,00
    // - 006049769888665,39 => montant 8 665,39
    const gluedPatterns = [
        /(\d{2}\/\d{2}\/\d{2})(\d{1,6},\d{2})/g,
        /(F\d{2}-\d{3})(\d{1,6},\d{2})/gi,
        /(F0\d{5})(\d{1,6},\d{2})/gi,
        /(00\d{9})(\d{1,6},\d{2})/g
    ];

    for (const regex of gluedPatterns) {
        while ((match = regex.exec(value)) !== null) {
            pushCandidate(match[2], match.index + match[1].length);
        }
    }

    if (candidates.length === 0) return null;
    return candidates[candidates.length - 1];
}

function cleanTransactionLabel(label) {
    return String(label || '')
        .replace(/\s*¨\s*/g, ' ')
        .replace(/\bFacture\s+n\s+Facture\s+n\b/gi, 'Facture n')
        .replace(/\bFacture\s+N\s+Facture\s+N\b/gi, 'Facture N')
        .replace(/\b(F\d{2}-\d{3})\s*Facture\s+n\s*\1\b/gi, '$1')
        .replace(/\b(F\d{2}-\d{3})(?:\s*\1)+\b/gi, '$1')
        .replace(/\b(F0\d{5})(?:\s*\1)+\b/gi, '$1')
        .replace(/\b(FA\d+)(?:\s*\1)+\b/gi, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function getAmountAndLabel(rawLabelWithAmount) {
    const text = String(rawLabelWithAmount || '').trim();
    const candidate = findBestAmount(text);

    if (!candidate) return null;

    const label = cleanTransactionLabel(text.slice(0, candidate.index));

    if (!label) return null;

    return {
        label,
        amount: candidate.amount
    };
}

function normalizeForRules(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function guessTransactionType(label) {
    const lowerLabel = normalizeForRules(label);

    // Crédit Agricole : les crédits identifiés dans les relevés fournis
    // correspondent surtout aux apports et aux déblocages de prêts.
    const creditRules = [
        /^real pret\b/,
        /^virement apport\b/,
        /^virement focus apport\b/,
        /^virement sauvage\b/,
        /^virement m arnaud\b/
    ];

    const debitRules = [
        /^prlv\b/,
        /^regul annul\.?\s+virement\b/,
        /^virement ag\b/,
        /^virement vir inst vers\b/,
        /^virement web\b/,
        /cotis/,
        /frais/,
        /facture credit agricole/
    ];

    if (creditRules.some(rule => rule.test(lowerLabel))) return 'credit';
    if (debitRules.some(rule => rule.test(lowerLabel))) return 'debit';

    // Par sécurité comptable, une opération non reconnue est à traiter en débit
    // plutôt qu'en crédit. Elle pourra ensuite être corrigée manuellement.
    return 'debit';
}

function shouldIgnoreStatementLine(line) {
    return (
        line.includes('Ancien solde') ||
        line.includes('Nouveau solde') ||
        line.includes('Total des opérations') ||
        line.includes('Date opé') ||
        line.includes('Date valeur') ||
        line.includes('RELEVE DE COMPTES') ||
        line.includes('Compte Courant') ||
        line.includes('IBAN') ||
        line.includes('BIC') ||
        line.includes('Page ') ||
        line.includes('SYNTHESE')
    );
}

function parseCreditAgricoleTransactions(text, bankAccountId, statementId, filename) {
    const lines = text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const transactions = [];
    const operationStartRegex = /^(\d{2}\.\d{2})\s+(\d{2}\.\d{2})\s+(.+)$/;
    const blocks = [];
    let currentBlock = null;

    function pushCurrentBlock() {
        if (currentBlock) {
            blocks.push(currentBlock);
            currentBlock = null;
        }
    }

    for (const line of lines) {
        if (shouldIgnoreStatementLine(line)) {
            continue;
        }

        const match = line.match(operationStartRegex);

        if (match) {
            pushCurrentBlock();

            currentBlock = {
                dateOperation: normalizeDate(match[1]),
                dateValue: normalizeDate(match[2]),
                parts: [match[3]]
            };

            continue;
        }

        if (currentBlock) {
            currentBlock.parts.push(line);
        }
    }

    pushCurrentBlock();

    for (const block of blocks) {
        let rawOperationText = block.parts.join(' ').replace(/\s+/g, ' ').trim();

        // Les bas de page Crédit Agricole peuvent être aspirés dans la dernière opération.
        // On coupe ces mentions pour ne jamais prendre un montant informatif
        // comme le découvert autorisé de 10 000,00 € à la place du débit réel.
        rawOperationText = rawOperationText
            .replace(/Pour information,.*$/i, '')
            .replace(/Le taux d'usure.*$/i, '')
            .replace(/Vos réserves financières.*$/i, '')
            .trim();

        const amountAndLabel = getAmountAndLabel(rawOperationText);

        if (!amountAndLabel) continue;

        const label = cleanTransactionLabel(amountAndLabel.label);

        if (!label) continue;

        const amount = amountAndLabel.amount;
        const type = guessTransactionType(label);
        const signedAmount = type === 'debit' ? -amount : amount;

        const transaction = {
            bankAccountId,
            statementId,
            dateOperation: block.dateOperation,
            label,
            amount: signedAmount,
            type,
            pdfSource: filename
        };

        createTransaction(
            transaction.bankAccountId,
            transaction.statementId,
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

function createLocalBackup() {
    ensureDir(BACKUPS_DIR);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(BACKUPS_DIR, `FocusCompta-${timestamp}`);
    ensureDir(backupDir);

    if (fs.existsSync(DB_PATH)) {
        fs.copyFileSync(DB_PATH, path.join(backupDir, 'FocusCompta.db'));
    }

    if (fs.existsSync(DATA_DIR)) {
        const docsBackupDir = path.join(backupDir, 'FocusComptaData');
        fs.cpSync(DATA_DIR, docsBackupDir, { recursive: true });
    }

    return backupDir;
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
    createBankAccount(data.companyId, data.bankName, data.accountName, data.iban);
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

    return { filename, filepath };
});

ipcMain.handle('add-statement', async (event, data) => {
    const existing = statementExists(data.bankAccountId, data.filepath);

    if (existing) {
        return {
            imported: false,
            message: 'PDF déjà importé',
            transactionsCount: 0
        };
    }

    const buffer = fs.readFileSync(data.filepath);
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    const period = extractStatementPeriod(parsed.text, data.filename);

    const storedStatement = copyToFocusData(data.filepath, [
        STATEMENTS_DIR,
        period.year || 'SansAnnee',
        period.month || 'SansMois'
    ]);

    const statementResult = createStatement(
        data.bankAccountId,
        storedStatement.filename,
        storedStatement.filepath,
        data.filepath,
        period.year,
        period.month
    );

    const statementId = statementResult.lastInsertRowid;

    const transactions = parseCreditAgricoleTransactions(
        parsed.text,
        data.bankAccountId,
        statementId,
        storedStatement.filename
    );

    updateStatementPeriod(statementId, period.year, period.month);

    return {
        imported: true,
        statementId,
        transactionsCount: transactions.length,
        statementYear: period.year,
        statementMonth: period.month
    };
});

ipcMain.handle('get-statements', async (event, bankAccountId) => {
    return getStatements(bankAccountId);
});

ipcMain.handle('delete-statement', async (event, statementId) => {
    const files = getStatementFiles(statementId);
    const result = deleteStatement(statementId);

    if (result) {
        deleteFileIfInsideDataDir(files.statementFilepath);
        files.receiptFilepaths.forEach(deleteFileIfInsideDataDir);
    }

    return result;
});

ipcMain.handle('get-transactions', async (event, data) => {
    if (typeof data === 'number') {
        return getTransactions(data, {});
    }

    return getTransactions(data.bankAccountId, data.filters || {});
});

ipcMain.handle('get-transaction', async (event, transactionId) => {
    return getTransaction(transactionId);
});

ipcMain.handle('update-transaction-status', async (event, data) => {
    updateTransactionStatus(data.transactionId, data.status);
    return true;
});

ipcMain.handle('update-transaction-details', async (event, data) => {
    updateTransactionDetails(data.transactionId, data.category, data.notes);
    return true;
});

ipcMain.handle('get-transaction-summary', async (event, data) => {
    if (typeof data === 'number') {
        return getTransactionSummary(data, {});
    }

    return getTransactionSummary(data.bankAccountId, data.filters || {});
});

ipcMain.handle('get-available-periods', async (event, bankAccountId) => {
    return getAvailablePeriods(bankAccountId);
});

ipcMain.handle('get-dashboard-insights', async (event, data) => {
    return getDashboardInsights(data.bankAccountId, data.filters || {});
});

ipcMain.handle('select-smart-receipt', async (event, bankAccountId) => {
    const result = await dialog.showOpenDialog({
        title: 'Pointer automatiquement un justificatif',
        filters: [
            { name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp'] }
        ],
        properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    const filepath = result.filePaths[0];
    const filename = path.basename(filepath);
    const matches = findReceiptMatches(bankAccountId, filename, 5);

    return { filename, filepath, matches };
});

ipcMain.handle('select-receipt', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Ajouter un justificatif',
        filters: [
            { name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp'] }
        ],
        properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    const filepath = result.filePaths[0];
    const filename = path.basename(filepath);

    return { filename, filepath };
});

ipcMain.handle('add-receipt', async (event, data) => {
    const transaction = getTransaction(data.transactionId);
    const year = transaction?.statement_year || 'SansAnnee';
    const month = transaction?.statement_month || 'SansMois';

    const storedReceipt = copyToFocusData(data.filepath, [
        RECEIPTS_DIR,
        year,
        month
    ]);

    createReceipt(
        data.transactionId,
        storedReceipt.filename,
        storedReceipt.filepath,
        data.filepath
    );

    return true;
});

ipcMain.handle('get-receipts', async (event, transactionId) => {
    return getReceipts(transactionId);
});

ipcMain.handle('delete-receipt', async (event, receiptId) => {
    const receipt = getReceipt(receiptId);
    const result = deleteReceipt(receiptId);

    if (result && receipt) {
        deleteFileIfInsideDataDir(receipt.filepath);
    }

    return result;
});

ipcMain.handle('open-file', async (event, filepath) => {
    await shell.openPath(filepath);
    return true;
});

ipcMain.handle('create-backup', async () => {
    const backupDir = createLocalBackup();
    return {
        ok: true,
        backupDir
    };
});

ipcMain.handle('open-data-folder', async () => {
    await shell.openPath(DATA_DIR);
    return true;
});
