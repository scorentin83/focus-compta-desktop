const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const pdfParseModule = require('pdf-parse');

const PDFParse = pdfParseModule.PDFParse;

const {
    DATA_DIR,
    STATEMENTS_DIR,
    RECEIPTS_DIR,
    RIB_DIR,
    BACKUPS_DIR,
    DB_PATH,
    createCompany,
    getCompanies,
    createBankAccount,
    updateBankAccount,
    deleteBankAccount,
    getBankAccounts,
    createStatement,
    updateStatementPeriod,
    updateStatementFinancials,
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
    getCategoryRules,
    addCategoryRule,
    updateTransactionsBulk,
    createDocument,
    createDocumentForReceipt,
    getDocuments,
    getDocument,
    deleteDocument,
    linkDocumentToTransaction,
    findDocumentMatches,
    searchTransactionsForDocument,
    getThirdParties,
    backfillThirdParties,
    updateTransactionThirdParty,
    getDocumentsDashboard,
    updateThirdParty,
    mergeThirdParties,
    cleanupThirdParties,
    renameDocument,
    moveDocumentToTrash,
    restoreDocument,
    deleteDocumentPermanently,
    updateDocumentType,
    moveDocumentToFolder,
    getDocumentTree,
    toggleDocumentFavorite,
    updateDocumentTags,
    getDocumentDuplicates,
    getDocumentSmartFolders,
    toggleDocumentImportant,
    updateDocumentThirdParty,
    getDocumentHistory,
    createAutomationRule,
    getAutomationRules,
    deleteAutomationRule,
    applyAutomationRules,
    createReceipt,
    getReceipt,
    getReceipts,
    deleteReceipt,
    createCashSheet,
    getCashSheets,
    getCashSheetInsights,
    getCompanyDashboard,
    getCashSheetReminders
} = require('./database');


function parseNumberV038(value) {
    if (value === null || value === undefined) return 0;
    const clean = String(value)
        .replace(/\s/g, '')
        .replace(/[€]/g, '')
        .replace(',', '.')
        .replace(/[^0-9.-]/g, '');
    const n = Number(clean);
    return Number.isFinite(n) ? n : 0;
}

function detectDateV038(text) {
    const match = String(text || '').match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/);
    if (!match) {
        const now = new Date();
        return {
            sheetDate: now.toISOString().slice(0, 10),
            year: String(now.getFullYear()),
            month: String(now.getMonth() + 1).padStart(2, '0')
        };
    }
    return {
        sheetDate: `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`,
        year: match[3],
        month: String(match[2]).padStart(2, '0')
    };
}

async function readCashSheetTextV039(filepath) {
    const ext = path.extname(filepath).toLowerCase();

    if (ext === '.pdf') {
        try {
            const buffer = fs.readFileSync(filepath);
            const parser = new PDFParse({ data: buffer });
            const parsed = await parser.getText();
            return parsed.text || '';
        } catch (error) {
            return '';
        }
    }

    try {
        return fs.readFileSync(filepath, 'utf8');
    } catch (error) {
        return '';
    }
}

function findAmountAfterLabelV039(text, label, occurrence = 1) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escaped}[^\\n\\r]*?(-?\\d[\\d\\s.,]*\\d|-?\\d)`, 'gi');
    let match;
    let count = 0;
    while ((match = regex.exec(text)) !== null) {
        count += 1;
        if (count === occurrence) return parseNumberV038(match[1]);
    }
    return 0;
}

function parseCashLineAmountV039(lines, label, columnIndexFromEnd = 1) {
    const normalizedLabel = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const line of lines) {
        const normalized = line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (normalized.includes(normalizedLabel)) {
            const nums = line.match(/-?\d[\d\s.,]*\d|-?\d/g) || [];
            if (nums.length) return parseNumberV038(nums[Math.max(0, nums.length - columnIndexFromEnd)]);
        }
    }
    return 0;
}

async function parseCashSheetFileV038(filepath) {
    const ext = path.extname(filepath).toLowerCase();
    const text = await readCashSheetTextV039(filepath);

    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const full = text || path.basename(filepath);
    const date = detectDateV038(full);

    const grossCaHt = findAmountAfterLabelV039(full, 'CA total facturé', 1);
    const discountHt = findAmountAfterLabelV039(full, 'CA total facturé', 3);
    const netCaHt = Math.max(0, grossCaHt - discountHt);
    const netCaTtc = netCaHt ? netCaHt * 1.2 : findAmountAfterLabelV039(full, 'CA total facturé', 5);
    const tvaTotal = netCaTtc - netCaHt;

    const cashTotal = parseCashLineAmountV039(lines, 'Espèces', 2) || parseCashLineAmountV039(lines, 'Espèces', 1);
    const cardTotal = parseCashLineAmountV039(lines, 'Carte Bleue', 2) || parseCashLineAmountV039(lines, 'Carte Bleue', 1);
    const checkTotal = parseCashLineAmountV039(lines, 'Chèques', 2) || parseCashLineAmountV039(lines, 'Chèques', 1);
    const transferTotal = parseCashLineAmountV039(lines, 'Virement', 1);

    const p3xTotal = parseCashLineAmountV039(lines, 'P3X', 2) || parseCashLineAmountV039(lines, 'P3X', 1);
    const p4xTotal = parseCashLineAmountV039(lines, 'P4X', 2) || parseCashLineAmountV039(lines, 'P4X', 1);
    const p10xTotal = parseCashLineAmountV039(lines, 'P10X', 2) || parseCashLineAmountV039(lines, 'P10X', 1);
    const paylaterTotal = parseCashLineAmountV039(lines, 'Paylater', 2) || parseCashLineAmountV039(lines, 'Paylater', 1);

    const tiersPayant = findAmountAfterLabelV039(full, 'Tiers payant', 1);
    const acompteTotal = findAmountAfterLabelV039(full, 'Acomptes', 1) || findAmountAfterLabelV039(full, "Reprises d\'acomptes", 1);
    const ecartTotal = Math.abs(findAmountAfterLabelV039(full, 'Total écarts justifiés', 1)) || Math.abs(parseCashLineAmountV039(lines, 'Total', 1));

    let invoicedCa = netCaTtc || findAmountAfterLabelV039(full, 'CA total facturé', 5);

    // Fallback if the source is not text-readable.
    if (!invoicedCa) {
        const allNumbers = lines.flatMap(line => line.match(/-?\d[\d\s.,]*\d|-?\d/g) || []).map(parseNumberV038).filter(n => Math.abs(n) > 0);
        invoicedCa = allNumbers.reduce((sum, n) => sum + (n > 0 ? n : 0), 0);
    }

    return {
        sheetDate: date.sheetDate,
        periodYear: date.year,
        periodMonth: date.month,
        invoicedCa,
        grossCaHt,
        discountHt,
        netCaHt,
        netCaTtc: invoicedCa,
        tvaTotal,
        tiersPayant,
        acompteTotal,
        p3xTotal,
        p4xTotal,
        p10xTotal,
        paylaterTotal,
        ecartTotal,
        cashTotal,
        cardTotal,
        checkTotal,
        transferTotal,
        totalRows: lines.length,
        raw: { ext, preview: lines.slice(0, 50) }
    };
}

function yearMonthFromDetectedDateV0393(detectedDate) {
    const value = String(detectedDate || '');
    let match = value.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/);
    if (match) return { year: match[3], month: String(match[2]).padStart(2, '0') };
    match = value.match(/\b(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/);
    if (match) return { year: match[1], month: String(match[2]).padStart(2, '0') };
    return { year: String(new Date().getFullYear()), month: String(new Date().getMonth() + 1).padStart(2, '0') };
}

function fileHashV0373(filepath) {
    try {
        const crypto = require('crypto');
        const buffer = fs.readFileSync(filepath);
        return crypto.createHash('sha256').update(buffer).digest('hex');
    } catch (error) {
        return '';
    }
}

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

    // V0.19 : ordre volontairement strict.
    // 1) On reconnaît d'abord les familles qui sont toujours au débit.
    // 2) Les virements restants sont considérés comme crédits entrants.
    // Cela corrige les relevés Crédit Agricole professionnels avec beaucoup de TP,
    // CPAM, mutuelles, remises cartes et virements reçus.
    const debitRules = [
        /^prlv\b/,
        /^prelevement\b/,
        /^cotis\b/,
        /^com\s+carte\b/,
        /^commission\b/,
        /^frais\b/,
        /^ech\s+pret\b/,
        /^effets\s+domicilies\b/,
        /^paiement\b/,
        /^carte\b/,
        /^cb\b/,
        /^regul\s+annul\.?\s+virement\b/,
        /^virement\s+ag\b/,
        /^virement\s+vir\s+inst\s+vers\b/,
        /^virement\s+web\b/,
        /^virement\s+.*\bvers\b/,
        /facture\s+credit\s+agricole/,
        /tenue\s+de\s+compte/,
        /urssaf/,
        /dgfip/,
        /edf|electricite\s+de\s+france/,
        /orange/,
        /loyer/,
        /charges/,
        /salaire|salair/,
        /malakoff/,
        /grandvision/,
        /leasecom|cegelease/,
        /cabinet\s+cv\s+consultants/,
        /abc\s+media/,
        /avem/,
        /pacifica|assurance/,
        /allianz\s+sante/,
        /edenred/,
        /kering\s+eyewear/
    ];

    const creditRules = [
        /^real\s+pret\b/,
        /^remise\b/,
        /^rem\s+chq\b/,
        /^versement\b/,
        /^depot\b/,
        /^encaissement\b/,
        /^virement\s+apport\b/,
        /^virement\s+focus\s+apport\b/,
        /^virement\s+sauvage\b/,
        /^virement\s+m\s+arnaud\b/,
        /^virement\s+vir\s+inst\s+de\b/,
        /^virement\s+paiements\s+mutuelles\b/,
        /^virement\b/,
        /^vir\b/
    ];

    if (debitRules.some(rule => rule.test(lowerLabel))) return 'debit';
    if (creditRules.some(rule => rule.test(lowerLabel))) return 'credit';

    // Une ligne non reconnue est conservatrice : à vérifier en débit.
    return 'debit';
}


function extractStatementBalances(text) {
    const value = String(text || '');
    const oldMatch = value.match(/Ancien solde\s+(créditeur|débiteur)\s+au\s+[\d.]+\s+([\d\s]+,\d{2})/i);
    const newMatch = value.match(/Nouveau solde\s+(créditeur|débiteur)\s+au\s+[\d.]+\s+([\d\s]+,\d{2})/i);

    const oldType = oldMatch ? oldMatch[1].toLowerCase() : '';
    const newType = newMatch ? newMatch[1].toLowerCase() : '';
    const oldAmount = oldMatch ? parseFrenchAmount(oldMatch[2]) : null;
    const newAmount = newMatch ? parseFrenchAmount(newMatch[2]) : null;

    return {
        oldBalance: oldAmount === null ? null : (oldType.includes('déb') || oldType.includes('deb') ? -oldAmount : oldAmount),
        newBalance: newAmount === null ? null : (newType.includes('déb') || newType.includes('deb') ? -newAmount : newAmount),
        balanceType: newType || ''
    };
}

function detectAmountFromFilename(filename) {
    const base = String(filename || '').replace(/[_-]/g, ' ');
    const matches = [...base.matchAll(/(\d{1,3}(?:[\s.]\d{3})*|\d{1,6})[,.](\d{2})/g)];
    if (matches.length === 0) return null;
    const last = matches[matches.length - 1][0].replace('.', ' ').replace(',', ',');
    return parseFrenchAmount(last);
}

function detectReferenceFromFilename(filename) {
    const base = String(filename || '');
    const match = base.match(/(?:F|FA|FACT|FACTURE)[-_\s]?\d{2,}[-_\s]?\d*|\b\d{4,}\b/i);
    return match ? match[0].replace(/[_\s]+/g, '-') : '';
}


function normalizeDocumentText(value) {
    return String(value || '')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function parseFrenchAmountStrict(value) {
    const cleaned = String(value || '')
        .replace(/[^\d,.\s-]/g, '')
        .replace(/\s/g, '')
        .replace(',', '.');

    const amount = Number(cleaned);
    return Number.isFinite(amount) ? amount : null;
}

function extractAmountFromDocumentText(text, filename) {
    const clean = normalizeDocumentText(text);
    const priorityPatterns = [
        /(?:net\s+a\s+payer|net\s+à\s+payer|total\s+ttc|montant\s+ttc|ttc\s+à\s+payer|total\s+facture)[^\d]{0,40}(\d[\d\s]*[,.]\d{2})/i,
        /(\d[\d\s]*[,.]\d{2})\s*(?:€|eur|euro)/i
    ];

    for (const pattern of priorityPatterns) {
        const match = clean.match(pattern);
        if (match) {
            const amount = parseFrenchAmountStrict(match[1]);
            if (amount && amount > 0) return amount;
        }
    }

    const candidates = [...clean.matchAll(/\b(\d[\d\s]{0,12}[,.]\d{2})\b/g)]
        .map(match => parseFrenchAmountStrict(match[1]))
        .filter(amount => amount && amount > 0 && amount < 10000000);

    if (candidates.length > 0) {
        return Math.max(...candidates);
    }

    return detectAmountFromFilename(filename);
}

function extractDateFromDocumentText(text, filename) {
    const clean = normalizeDocumentText(text);

    const direct = clean.match(/\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b/);
    if (direct) return direct[1].replace(/[.-]/g, '/');

    const filenameDate = String(filename || '').match(/\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b/);
    if (filenameDate) return filenameDate[1].replace(/[.-]/g, '/');

    return '';
}

function extractReferenceFromDocumentText(text, filename) {
    const clean = normalizeDocumentText(text);

    const patterns = [
        /(?:facture|invoice|n[°o]\s*facture|réf(?:érence)?|ref(?:erence)?)[^\w]{0,12}([A-Z0-9][A-Z0-9._/-]{2,})/i,
        /\b(F(?:AC|ACTURE)?[-_\s]?\d{2,}[-_\s]?\d*)\b/i,
        /\b([A-Z]{1,4}\d{2,}[-_/]?\d*)\b/
    ];

    for (const pattern of patterns) {
        const match = clean.match(pattern);
        if (match) return match[1].replace(/\s+/g, '-');
    }

    return detectReferenceFromFilename(filename);
}

function extractSupplierFromDocumentText(text, filename) {
    const lines = normalizeDocumentText(text)
        .split(/\n/)
        .map(line => line.trim())
        .filter(line => line.length >= 3 && line.length <= 80);

    const noise = [
        /facture/i,
        /invoice/i,
        /date/i,
        /total/i,
        /tva/i,
        /siret/i,
        /iban/i,
        /bic/i,
        /page\s+\d+/i
    ];

    const candidate = lines.find(line => !noise.some(pattern => pattern.test(line)));
    if (candidate) return candidate.slice(0, 80);

    return path.basename(filename, path.extname(filename)).replace(/[-_]+/g, ' ').slice(0, 80);
}

async function extractTextFromDocument(filepath) {
    const ext = path.extname(filepath).toLowerCase();

    if (ext === '.pdf') {
        try {
            const buffer = fs.readFileSync(filepath);
            const parser = new PDFParse({ data: buffer });
            const parsed = await parser.getText();
            return parsed.text || '';
        } catch (error) {
            console.warn('Extraction texte PDF impossible :', filepath, error.message);
            return '';
        }
    }

    // V0.24 : les images sont stockées et préparées pour OCR complet.
    // L'extraction OCR image sera activable ensuite avec Tesseract si nécessaire.
    return '';
}

async function analyzeDocument(filepath, filename) {
    const text = await extractTextFromDocument(filepath);

    return {
        detectedAmount: extractAmountFromDocumentText(text, filename),
        detectedReference: extractReferenceFromDocumentText(text, filename),
        detectedSupplier: extractSupplierFromDocumentText(text, filename),
        detectedDate: extractDateFromDocumentText(text, filename),
        extractedText: text
    };
}



function extractAccountIdentifiers(statementText, filename = '') {
    const content = `${statementText}\n${filename}`;

    const ccou = content.match(/CCOU[-\s]?(\d{6,})/i);
    const account = content.match(/(?:compte\s*n?[°o]?\s*|n°\s*)(\d{8,})/i);
    const iban = content.match(/FR\d{2}[A-Z0-9\s]{10,}/i);

    return {
        statementIdentifier: ccou ? `CCOU-${ccou[1]}` : '',
        accountNumber: account ? account[1] : '',
        iban: iban ? iban[0].replace(/\s+/g,'') : ''
    };
}

function processStatementPdf(data) {
    return (async () => {
        if (!data.bankAccountId) {
            return {
                imported: false,
                unresolved: true,
                message: 'Compte bancaire non identifié',
                transactionsCount: 0,
                filename: data.filename
            };
        }

        const existing = statementExists(data.bankAccountId, data.filepath);

        if (existing) {
            return {
                imported: false,
                message: 'PDF déjà importé',
                transactionsCount: 0,
                filename: data.filename
            };
        }

        const buffer = fs.readFileSync(data.filepath);
        const parser = new PDFParse({ data: buffer });
        const parsed = await parser.getText();
        const period = extractStatementPeriod(parsed.text, data.filename);
        const balances = extractStatementBalances(parsed.text);
        const identifiers = extractAccountIdentifiers(parsed.text, data.filename);

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

        const importReport = buildImportReport(parsed.text, transactions);
        updateStatementPeriod(statementId, period.year, period.month);
        updateStatementFinancials(statementId, {
            oldBalance: balances.oldBalance,
            newBalance: balances.newBalance,
            balanceType: balances.balanceType,
            reportJson: JSON.stringify(importReport)
        });

        try {
            backfillThirdParties();
        } catch (error) {
            console.warn('Backfill tiers impossible :', error.message);
        }

        return {
            imported: true,
            statementId,
            transactionsCount: transactions.length,
            statementYear: period.year,
            statementMonth: period.month,
            oldBalance: balances.oldBalance,
            newBalance: balances.newBalance,
            balanceType: balances.balanceType,
            importReport,
            filename: storedStatement.filename
        };
    })();
}

function extractExpectedStatementTotals(text) {
    const match = String(text || '').match(/Total\s+des\s+opérations\s+([\d\s]+,\d{2})\s+([\d\s]+,\d{2})/i);

    if (!match) {
        return {
            debit: null,
            credit: null
        };
    }

    return {
        debit: parseFrenchAmount(match[1]),
        credit: parseFrenchAmount(match[2])
    };
}

function calculateTransactionsTotals(transactions) {
    return transactions.reduce((totals, transaction) => {
        if (transaction.amount < 0) {
            totals.debit += Math.abs(transaction.amount);
        } else {
            totals.credit += transaction.amount;
        }
        return totals;
    }, { debit: 0, credit: 0 });
}

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function buildImportReport(text, transactions) {
    const expected = extractExpectedStatementTotals(text);
    const imported = calculateTransactionsTotals(transactions);

    const debitDifference = expected.debit === null ? null : roundMoney(imported.debit - expected.debit);
    const creditDifference = expected.credit === null ? null : roundMoney(imported.credit - expected.credit);

    return {
        expectedDebit: expected.debit,
        expectedCredit: expected.credit,
        importedDebit: roundMoney(imported.debit),
        importedCredit: roundMoney(imported.credit),
        debitDifference,
        creditDifference,
        isBalanced:
            expected.debit !== null &&
            expected.credit !== null &&
            debitDifference === 0 &&
            creditDifference === 0
    };
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
    createBankAccount(data);
    return true;
});

ipcMain.handle('select-rib', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Ajouter un RIB PDF',
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

ipcMain.handle('update-bank-account', async (event, data) => {
    let ribPath = null;
    let ribOriginalPath = null;

    if (data.ribFilepath) {
        const storedRib = copyToFocusData(data.ribFilepath, [
            RIB_DIR,
            safeFilename(data.companyName || 'Societe').replace(/\.pdf$/i, ''),
            safeFilename(data.bankName || 'Banque').replace(/\.pdf$/i, '')
        ]);
        ribPath = storedRib.filepath;
        ribOriginalPath = data.ribFilepath;
    }

    updateBankAccount({
        ...data,
        ribPath,
        ribOriginalPath
    });

    return true;
});

ipcMain.handle('delete-bank-account', async (event, bankAccountId) => {
    return deleteBankAccount(bankAccountId);
});

ipcMain.handle('get-bank-accounts', async (event, companyId) => {
    return getBankAccounts(companyId);
});

ipcMain.handle('select-pdf', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Importer des relevés bancaires PDF',
        filters: [
            { name: 'PDF', extensions: ['pdf'] }
        ],
        properties: ['openFile', 'multiSelections']
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    return result.filePaths.map(filepath => ({
        filename: path.basename(filepath),
        filepath
    }));
});

ipcMain.handle('add-statement', async (event, data) => {
    return processStatementPdf(data);
});

ipcMain.handle('add-statements-bulk', async (event, data) => {
    const files = Array.isArray(data.files) ? data.files : [];
    const results = [];

    // V0.25.1 :
    // - En import multi-PDF, on route chaque relevé vers le bon compte.
    // - Le compte actuellement affiché ne doit jamais forcer toute la sélection.
    // - Si aucun compte n'est reconnu, le PDF est ignoré avec statut unresolved.
    const allCompanies = getCompanies();
    const allAccounts = allCompanies.flatMap(company =>
        getBankAccounts(company.id).map(account => ({ ...account, company_name: company.name }))
    );

    function compact(value) {
        return String(value || '').replace(/\s+/g, '').toUpperCase();
    }

    function accountMatchesIdentifiers(account, ids) {
        const accountIban = compact(account.iban);
        const accountNumber = compact(account.account_number);
        const identifiers = compact(account.statement_identifiers);

        return (
            (ids.iban && accountIban && accountIban === compact(ids.iban)) ||
            (ids.accountNumber && accountNumber && accountNumber === compact(ids.accountNumber)) ||
            (ids.accountNumber && identifiers && identifiers.includes(compact(ids.accountNumber))) ||
            (ids.statementIdentifier && identifiers && identifiers.includes(compact(ids.statementIdentifier))) ||
            (ids.statementIdentifier && accountNumber && compact(ids.statementIdentifier).includes(accountNumber))
        );
    }

    for (const file of files) {
        let bankAccountId = null;
        let matchedAccount = null;
        let identifiers = {};

        try {
            const buffer = fs.readFileSync(file.filepath);
            const parser = new PDFParse({ data: buffer });
            const parsed = await parser.getText();
            identifiers = extractAccountIdentifiers(parsed.text, file.filename);

            const matches = allAccounts.filter(account => accountMatchesIdentifiers(account, identifiers));

            if (matches.length === 1) {
                matchedAccount = matches[0];
                bankAccountId = matchedAccount.id;
            } else if (matches.length > 1) {
                results.push({
                    imported: false,
                    unresolved: true,
                    ambiguous: true,
                    message: 'Plusieurs comptes possibles',
                    transactionsCount: 0,
                    filename: file.filename,
                    identifiers,
                    matches: matches.map(acc => ({
                        id: acc.id,
                        companyName: acc.company_name,
                        bankName: acc.bank_name,
                        accountName: acc.account_name,
                        accountNumber: acc.account_number
                    }))
                });
                continue;
            }
        } catch (error) {
            results.push({
                imported: false,
                unresolved: true,
                message: `Analyse impossible : ${error.message}`,
                transactionsCount: 0,
                filename: file.filename
            });
            continue;
        }

        if (!bankAccountId) {
            results.push({
                imported: false,
                unresolved: true,
                message: 'Compte bancaire non identifié',
                transactionsCount: 0,
                filename: file.filename,
                identifiers
            });
            continue;
        }

        const result = await processStatementPdf({
            bankAccountId,
            filename: file.filename,
            filepath: file.filepath
        });

        result.assignedBankAccountId = bankAccountId;
        result.assignedBankAccountLabel = matchedAccount
            ? `${matchedAccount.company_name} — ${matchedAccount.bank_name}${matchedAccount.account_name ? ' — ' + matchedAccount.account_name : ''}`
            : '';

        results.push(result);
    }

    return {
        results,
        importedCount: results.filter(row => row.imported).length,
        skippedCount: results.filter(row => !row.imported && !row.unresolved).length,
        unresolvedCount: results.filter(row => row.unresolved).length,
        transactionsCount: results.reduce((sum, row) => sum + Number(row.transactionsCount || 0), 0),
        byAccount: results
            .filter(row => row.imported && row.assignedBankAccountLabel)
            .reduce((acc, row) => {
                acc[row.assignedBankAccountLabel] = (acc[row.assignedBankAccountLabel] || 0) + 1;
                return acc;
            }, {})
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
        title: 'Pointer un justificatif',
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
    const analysis = await analyzeDocument(filepath, filename);
    let matches = findReceiptMatches(bankAccountId, filename, 12);

    if (analysis.detectedAmount) {
        const amount = Math.abs(Number(analysis.detectedAmount));
        matches = matches
            .map(match => ({ ...match, amount_delta: Math.abs(Math.abs(Number(match.amount || 0)) - amount) }))
            .sort((a, b) => (a.amount_delta || 999999) - (b.amount_delta || 999999));
    }

    return { filename, filepath, analysis, matches };
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
    const analysis = data.analysis || await analyzeDocument(data.filepath, data.filename || path.basename(data.filepath));
    const period = yearMonthFromDetectedDateV0393(analysis.detectedDate);
    const year = period.year || transaction?.statement_year || 'SansAnnee';
    const month = period.month || transaction?.statement_month || 'SansMois';

    const storedReceipt = copyToFocusData(data.filepath, [
        RECEIPTS_DIR,
        'JUSTIFICATIFS',
        year,
        month
    ]);

    const receiptResult = createReceipt(
        data.transactionId,
        storedReceipt.filename,
        storedReceipt.filepath,
        data.filepath
    );

    createDocumentForReceipt({
        companyId: data.companyId || null,
        transactionId: data.transactionId,
        receiptId: receiptResult.lastInsertRowid,
        filename: storedReceipt.filename,
        filepath: storedReceipt.filepath,
        originalFilepath: data.filepath,
        detectedAmount: analysis.detectedAmount || (transaction ? Math.abs(transaction.amount) : null),
        detectedReference: analysis.detectedReference || detectReferenceFromFilename(storedReceipt.filename),
        detectedSupplier: analysis.detectedSupplier || path.basename(storedReceipt.filename, path.extname(storedReceipt.filename)).replace(/[-_]+/g, ' '),
        detectedDate: analysis.detectedDate || '',
        folderPath: `JUSTIFICATIFS/${year}/${month}`
    });

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


ipcMain.handle('get-category-rules', async () => {
    return getCategoryRules();
});

ipcMain.handle('add-category-rule', async (event, data) => {
    addCategoryRule(data.keyword, data.category);
    return true;
});

ipcMain.handle('bulk-update-transactions', async (event, data) => {
    return updateTransactionsBulk(data.ids || [], data.updates || {});
});


ipcMain.handle('select-cash-sheets', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Importer des feuilles de caisse',
        filters: [
            { name: 'Feuilles de caisse', extensions: ['csv', 'txt', 'pdf', 'xlsx', 'xls'] },
            { name: 'Tous les fichiers', extensions: ['*'] }
        ],
        properties: ['openFile', 'multiSelections']
    });

    if (result.canceled || result.filePaths.length === 0) return [];
    return result.filePaths.map(filepath => ({ filename: path.basename(filepath), filepath }));
});

ipcMain.handle('import-cash-sheets', async (event, data) => {
    const files = Array.isArray(data.files) ? data.files : [];
    const companyId = data.companyId || null;
    const imported = [];
    const errors = [];

    for (const file of files) {
        try {
            const parsed = await parseCashSheetFileV038(file.filepath);
            const stored = copyToFocusData(file.filepath, [DATA_DIR, 'CashSheets', String(companyId || 'no-company'), parsed.periodYear || 'SansAnnee']);

            const result = createCashSheet({
                companyId,
                filename: stored.filename,
                filepath: stored.filepath,
                originalFilepath: file.filepath,
                ...parsed
            });

            imported.push({ id: result.lastInsertRowid, filename: stored.filename, ...parsed });
        } catch (error) {
            errors.push({ filename: file.filename || path.basename(file.filepath), message: error.message });
        }
    }

    return { importedCount: imported.length, errorCount: errors.length, imported, errors };
});

ipcMain.handle('get-cash-sheet-insights', async (event, data) => {
    return getCashSheetInsights(data?.companyId || null);
});

ipcMain.handle('get-cash-sheet-reminders', async () => {
    return getCashSheetReminders();
});

ipcMain.handle('get-company-dashboard', async (event, companyId) => {
    return getCompanyDashboard(companyId);
});

ipcMain.handle('select-documents', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Importer des documents justificatifs',
        filters: [
            { name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp'] }
        ],
        properties: ['openFile', 'multiSelections']
    });

    if (result.canceled || result.filePaths.length === 0) return [];

    return result.filePaths.map(filepath => ({ filename: path.basename(filepath), filepath }));
});

ipcMain.handle('add-documents', async (event, data) => {
    const files = Array.isArray(data.files) ? data.files : [];
    const added = [];
    const duplicates = [];

    for (const file of files) {
        const analysis = await analyzeDocument(file.filepath, file.filename);
        const period = yearMonthFromDetectedDateV0393(analysis.detectedDate);
        const year = period.year;
        const month = period.month;
        const hash = fileHashV0373(file.filepath);

        const stored = copyToFocusData(file.filepath, [RECEIPTS_DIR, 'Documents', year, month]);

        const result = createDocument({
            companyId: data.companyId,
            filename: stored.filename,
            filepath: stored.filepath,
            originalFilepath: file.filepath,
            detectedAmount: analysis.detectedAmount,
            detectedReference: analysis.detectedReference,
            detectedSupplier: analysis.detectedSupplier,
            detectedDate: analysis.detectedDate,
            folderPath: data.companyName ? `${data.companyName}/JUSTIFICATIFS/${year}/${month}` : `JUSTIFICATIFS/${year}/${month}`,
            docType: data.docType || 'facture',
            fileHash: hash
        });

        if (result.duplicate) {
            duplicates.push({
                incoming: file.filename,
                existingId: result.existing.id,
                existingFilename: result.existing.filename
            });
            try { deleteFileIfInsideDataDir(stored.filepath); } catch (error) {}
        } else {
            added.push({ id: result.lastInsertRowid, filename: stored.filename });
        }
    }

    return { addedCount: added.length, duplicateCount: duplicates.length, added, duplicates };
});

ipcMain.handle('get-documents', async (event, data) => {
    return getDocuments(data?.companyId || null, data?.filters || {});
});

ipcMain.handle('delete-document', async (event, documentId) => {
    // V0.32 : suppression douce vers la corbeille, le fichier reste récupérable.
    return deleteDocument(documentId);
});

ipcMain.handle('find-document-matches', async (event, data) => {
    return findDocumentMatches(data.companyId, data.documentId, data.limit || 8);
});

ipcMain.handle('search-transactions-for-document', async (event, data) => {
    return searchTransactionsForDocument(data.companyId, data.query || '', data.limit || 25);
});

ipcMain.handle('link-document-to-transaction', async (event, data) => {
    return linkDocumentToTransaction(data.documentId, data.transactionId);
});


ipcMain.handle('get-third-parties', async (event, data) => {
    return getThirdParties(data?.companyId || null);
});

ipcMain.handle('backfill-third-parties', async (event, data) => {
    return backfillThirdParties(data?.companyId || null);
});

ipcMain.handle('update-transaction-third-party', async (event, data) => {
    return updateTransactionThirdParty(data.transactionId, data.thirdPartyName, data.type || 'autre');
});

ipcMain.handle('get-documents-dashboard', async (event, data) => {
    return getDocumentsDashboard(data?.companyId || null);
});

ipcMain.handle('rename-document', async (event, data) => {
    return renameDocument(data.documentId, data.newFilename);
});

ipcMain.handle('get-document-tree', async (event, data) => {
    return getDocumentTree(data?.companyId || null);
});


ipcMain.handle('toggle-document-favorite', async (event, documentId) => {
    return toggleDocumentFavorite(documentId);
});

ipcMain.handle('update-document-tags', async (event, data) => {
    return updateDocumentTags(data.documentId, data.tags || '');
});

ipcMain.handle('get-document-duplicates', async (event, data) => {
    return getDocumentDuplicates(data?.companyId || null);
});

ipcMain.handle('get-document-smart-folders', async (event, data) => {
    return getDocumentSmartFolders(data?.companyId || null);
});


ipcMain.handle('toggle-document-important', async (event, documentId) => {
    return toggleDocumentImportant(documentId);
});

ipcMain.handle('update-document-third-party', async (event, data) => {
    return updateDocumentThirdParty(data.documentId, data.thirdPartyName || '');
});

ipcMain.handle('get-document-history', async (event, documentId) => {
    return getDocumentHistory(documentId);
});



ipcMain.handle('restore-document', async (event, documentId) => {
    return restoreDocument(documentId);
});

ipcMain.handle('delete-document-permanently', async (event, documentId) => {
    const doc = getDocument(documentId);
    const ok = deleteDocumentPermanently(documentId);
    if (ok && doc) deleteFileIfInsideDataDir(doc.filepath);
    return ok;
});

ipcMain.handle('update-document-type', async (event, data) => {
    return updateDocumentType(data.documentId, data.docType);
});

ipcMain.handle('move-document-folder', async (event, data) => {
    return moveDocumentToFolder(data.documentId, data.folderPath);
});


ipcMain.handle('move-document', async (event, data) => {
    const company = safeDirNameV032(data.companyName || 'Société inconnue');
    let folderPath = '';

    if (data.docType === 'rib') {
        folderPath = `${company}/RIB`;
    } else if (data.docType === 'releve') {
        folderPath = `${company}/Relevés/${data.year || 'SansAnnee'}/${safeDirNameV032(data.accountName || 'Compte')}/${data.month || 'SansMois'}`;
    } else {
        folderPath = `${company}/Documents/${data.year || 'SansAnnee'}/${data.month || 'SansMois'}`;
    }

    return moveDocumentToFolder(data.documentId, folderPath);
});


ipcMain.handle('update-third-party', async (event, data) => {
    return updateThirdParty(data.thirdPartyId, data.name, data.type || 'autre', data.notes || '');
});

ipcMain.handle('merge-third-parties', async (event, data) => {
    return mergeThirdParties(data.sourceId, data.targetId);
});

ipcMain.handle('cleanup-third-parties', async (event, data) => {
    return cleanupThirdParties(data?.companyId || null);
});

ipcMain.handle('create-automation-rule', async (event, data) => {
    return createAutomationRule(data);
});

ipcMain.handle('get-automation-rules', async (event, data) => {
    return getAutomationRules(data?.companyId || null);
});

ipcMain.handle('delete-automation-rule', async (event, ruleId) => {
    return deleteAutomationRule(ruleId);
});

ipcMain.handle('apply-automation-rules', async (event, data) => {
    return applyAutomationRules(data?.companyId || null);
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
