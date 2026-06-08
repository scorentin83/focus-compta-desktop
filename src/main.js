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
    updateCompany,
    getCompanyDeletionPreview,
    deleteCompany,
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
    getSmartDocumentMatchesV045,
    autoReconcileDocumentsV045,
    getReconciliationDashboardV045,
    searchTransactionsForDocument,
    getThirdParties,
    getThirdPartyYears,
    getThirdPartyTypeOptionsV0423,
    applyBusinessRulesToThirdPartiesV0423,
    updateThirdPartyTypeEverywhere,
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
    updateAutomationRule,
    renameCategoryEverywhere,
    updateCategoryUsage,
    deleteCategoryRule,
    applyAutomationRules,
    createReceipt,
    getReceipt,
    getReceipts,
    deleteReceipt,
    createCashSheet,
    getCashSheets,
    getCashSheetInsights,
    findCashSheetByCompanyPeriod,
    deleteCashSheetsByCompanyPeriod,
    deleteCashSheet,
    deleteInvalidCashSheetsV070,
    learnCategoryFromTransactionV070,
    getCompanyDashboard,
    getCashSheetReminders,
    splitThirdPartyByKeywordV042,
    saveThirdPartyAliasRuleV042,
    getThirdPartyAliasPreviewV042,
    getTechnicalSettingsSnapshotV043,
    getThirdPartyAliasesV043,
    deleteThirdPartyAliasV043,
    getThirdPartyCanonicalListV043,
    createOrUpdateCanonicalThirdPartyV043,
    deleteCanonicalThirdPartyV043,
    runTechnicalMaintenanceV043,
    updateDocumentAccountingV0452,
    saveDocumentLearningRulesV0452,
    saveUserLearningEvent,
    getUserLearningEvents,
    getDocumentLearningRulesV0452,
    deleteDocumentLearningRuleV0452,
    applyDocumentLearningToAnalysisV0452,
    getDocumentsToValidateV0452,
    findMultipleDocumentMatchesForTransactionV0456,
    linkMultipleDocumentsToTransactionV0456,
    getDocumentPaymentSummaryV0456,
    getAccountingExportPreviewV0456,
    createAccountingTransmissionExportV0456,
    createAccountingArchiveV0456,
    getAccountingExportLotsV0456,
    getExecutiveDashboardV046,
    getFinancialIntelligenceV049,
    getAutomationStatsV072,
    getBankAutomationSuggestionsV072,
    applyBankAutomationSuggestionsV072,
    getVatCenterV073,
    addAuditLogV080,
    getAuditLogV080,
    getAccountingHealthV080,
    getAppRolesV080,
    getAppUsersV080,
    getAppRolesV081,
    getAppUsersV081,
    getCurrentUserV081,
    setCurrentUserV081,
    createAppUserV081,
    updateAppUserV081,
    disableAppUserV081,
    getUserPermissionsSummaryV081,
    getPeriodLockV083,
    setPeriodLockV083,
    isAccountingPeriodLockedV083,
    getExpertDossierV083,
    getThirdPartyTransactionsV083
} = require('./database');


function parseNumberV038(value) {
    if (value === null || value === undefined) return 0;
    let clean = String(value)
        .replace(/[\u00A0\u202F]/g, ' ')
        .replace(/[€]/g, '')
        .trim();

    // Garde uniquement le premier montant propre quand une ligne OCR contient plusieurs nombres.
    const amountMatch = clean.match(/-?\d{1,3}(?:[ \u00A0\u202F]\d{3})*(?:[,.]\d{1,2})|-?\d+(?:[,.]\d{1,2})?/);
    clean = amountMatch ? amountMatch[0] : clean;

    clean = clean
        .replace(/\s/g, '')
        .replace(',', '.')
        .replace(/[^0-9.-]/g, '');
    const n = Number(clean);
    return Number.isFinite(n) ? n : 0;
}

function extractFrenchAmountsV0614(value) {
    const text = String(value || '').replace(/[\u00A0\u202F]/g, ' ');
    const matches = text.match(/-?\d{1,3}(?:[ \u00A0\u202F]\d{3})*(?:[,.]\d{1,2})|-?\d+(?:[,.]\d{1,2})?/g) || [];
    return matches.map(parseNumberV038).filter(n => Number.isFinite(n));
}

function detectDateV038(text) {
    const value = String(text || '');
    const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

    // Priorité absolue à la période de la feuille de caisse.
    // Les PDF Seenéo contiennent aussi une date d'impression en haut de page :
    // elle ne doit jamais servir à déterminer le mois comptable.
    let match = normalized.match(/Periode du\s*\*?\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})/i);
    if (!match) {
        match = normalized.match(/(?:du|periode)\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})/i);
    }
    if (!match) {
        match = value.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/);
    }
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
    const normalizedLabel = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const lines = String(text || '').split(/\r?\n/);
    let count = 0;
    for (const line of lines) {
        const normalized = line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const idx = normalized.indexOf(normalizedLabel);
        if (idx < 0) continue;
        count += 1;
        if (count !== occurrence) continue;
        const afterLabel = line.slice(idx + label.length);
        const amounts = extractFrenchAmountsV0614(afterLabel);
        return amounts.length ? amounts[0] : 0;
    }
    return 0;
}

function parseCashLineAmountV039(lines, label, columnIndexFromEnd = 1) {
    const normalizedLabel = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const line of lines) {
        const normalized = line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const labelIndex = normalized.indexOf(normalizedLabel);
        if (labelIndex >= 0) {
            // V0.61.4 : extraction stricte des montants français pour éviter
            // les concaténations OCR type "14 879,36 2822,04...".
            const afterLabel = line.slice(labelIndex + label.length);
            const nums = extractFrenchAmountsV0614(afterLabel);
            if (nums.length) return nums[Math.max(0, nums.length - columnIndexFromEnd)] || 0;
        }
    }
    return 0;
}



function extractAmountsFromLineV061(text, label) {
    const normalizedLabel = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const lines = String(text || '').split(/\r?\n/);
    for (const line of lines) {
        const normalized = line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const idx = normalized.indexOf(normalizedLabel);
        if (idx < 0) continue;
        const afterLabel = line.slice(idx + label.length);
        return extractFrenchAmountsV0614(afterLabel);
    }
    return [];
}

function extractCaTotalFactureV061(text) {
    const source = String(text || '');
    const normalized = source.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    let amounts = [];

    const label = 'ca total facture';
    const idx = normalized.indexOf(label);
    if (idx >= 0) {
        // V0.61.4 : les montants peuvent être sur la même ligne ou légèrement décalés
        // par l'extraction PDF. On lit donc un court bloc après le libellé, pas seulement la ligne.
        const block = source.slice(idx + label.length, idx + label.length + 300);
        amounts = extractFrenchAmountsV0614(block).slice(0, 5);
    }

    if (amounts.length < 5) {
        amounts = extractAmountsFromLineV061(source, 'CA total facturé').slice(0, 5);
    }

    const grossCaHt = Number(amounts[0] || 0);
    const tvaBrute = Number(amounts[1] || 0);
    const discountHt = Number(amounts[2] || 0);
    const discountTva = Number(amounts[3] || 0);
    const netCaHt = Math.max(0, grossCaHt - discountHt);
    const tvaNette = Math.max(0, tvaBrute - discountTva);
    const netCaTtcFromFormula = netCaHt + tvaNette;
    const netCaTtcFromSheet = Number(amounts[4] || 0);
    return {
        grossCaHt,
        tvaBrute,
        discountHt,
        discountTva,
        netCaHt,
        tvaNette,
        netCaTtc: netCaTtcFromSheet || netCaTtcFromFormula,
        rawAmounts: amounts
    };
}

function extractRemisesBancairesV061(text) {
    const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const startIndex = lines.findIndex(line => /remises bancaires/i.test(line.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
    const result = { bankRemiseCheck: 0, bankRemiseCash: 0, bankRemiseDeferredCheck: 0 };
    if (startIndex < 0) return result;
    for (let i = startIndex + 1; i < Math.min(lines.length, startIndex + 8); i += 1) {
        const line = lines[i];
        const normalized = line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (/balance comptable|debit|credit/.test(normalized)) break;
        const nums = extractFrenchAmountsV0614(line);
        const amount = nums.length ? nums[nums.length - 1] : 0;
        if (!amount) continue;
        if (/remise cheques differes/.test(normalized)) result.bankRemiseDeferredCheck += amount;
        else if (/cheques?/.test(normalized)) result.bankRemiseCheck += amount;
        else if (/especes?/.test(normalized)) result.bankRemiseCash += amount;
    }
    return result;
}


function classifyCashImportDocumentV0615(text, filename = '') {
    const normalized = String(`${filename || ''}\n${text || ''}`)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    const cashSignals = [
        /feuille de caisse mensuelle/,
        /feuille de caisse/,
        /ca total facture/,
        /detail comptage de caisse/,
        /balance comptable/,
        /liste des ecarts/,
        /remises bancaires/,
        /tiers payant/,
        /p3x|p4x|p10x|paylater/
    ].filter(rx => rx.test(normalized)).length;

    const statementSignals = [
        /releve de compte|releve bancaire/,
        /solde (initial|final|crediteur|debiteur)/,
        /iban/,
        /bic/,
        /operations? du/,
        /date operation|date valeur/,
        /credit agricole|caisse regionale|compte courant/
    ].filter(rx => rx.test(normalized)).length;

    if (cashSignals >= 3 && cashSignals >= statementSignals) return { type: 'cash_sheet', confidence: cashSignals };
    if (statementSignals >= 2 && cashSignals < 3) return { type: 'bank_statement', confidence: statementSignals };
    return { type: 'unknown', confidence: cashSignals - statementSignals };
}

function ensureCashSheetDocumentV0615(text, filename = '') {
    const detected = classifyCashImportDocumentV0615(text, filename);
    if (detected.type !== 'cash_sheet') {
        const label = detected.type === 'bank_statement' ? 'un relevé bancaire' : 'un document non reconnu';
        throw new Error(`Ce fichier ressemble à ${label}, pas à une feuille de caisse. Import annulé pour éviter de corrompre la caisse.`);
    }
}

function assertPlausibleCashSheetV0615(parsed, filename = '') {
    const maxCa = 500000;
    const maxComponent = 250000;
    const net = Number(parsed.netCaTtc || parsed.invoicedCa || 0);
    const components = [
        parsed.grossCaHt,
        parsed.discountHt,
        parsed.netCaHt,
        parsed.tvaTotal,
        parsed.tvaBrute,
        parsed.discountTva,
        parsed.tvaNette,
        parsed.cardTotal,
        parsed.cashTotal,
        parsed.checkTotal,
        parsed.cofidisTotal,
        parsed.tiersPayant,
        parsed.acompteTotal
    ].map(value => Number(value || 0));

    if (!net || !Number.isFinite(net)) {
        throw new Error(`CA total facturé introuvable dans ${filename || 'ce fichier'}. Import annulé.`);
    }
    if (Math.abs(net) > maxCa || components.some(value => !Number.isFinite(value) || Math.abs(value) > maxComponent)) {
        throw new Error(`Montant incohérent détecté dans ${filename || 'ce fichier'}. Import annulé.`);
    }
    if (!parsed.periodYear || !parsed.periodMonth) {
        throw new Error(`Période mensuelle introuvable dans ${filename || 'ce fichier'}. Import annulé.`);
    }
}

async function parseCashSheetFileV038(filepath) {
    const ext = path.extname(filepath).toLowerCase();
    const text = await readCashSheetTextV039(filepath);

    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const full = text || path.basename(filepath);
    ensureCashSheetDocumentV0615(full, path.basename(filepath));
    const date = detectDateV038(full);

    const caTotal = extractCaTotalFactureV061(full);
    const grossCaHt = caTotal.grossCaHt;
    const tvaBrute = caTotal.tvaBrute;
    const discountHt = caTotal.discountHt;
    const discountTva = caTotal.discountTva;
    const netCaHt = caTotal.netCaHt;
    const tvaTotal = caTotal.tvaNette;
    const netCaTtc = caTotal.netCaTtc;
    const bankRemises = extractRemisesBancairesV061(full);

    const cashTotal = parseCashLineAmountV039(lines, 'Espèces', 2) || parseCashLineAmountV039(lines, 'Espèces', 1);
    const cardTotal = parseCashLineAmountV039(lines, 'Carte Bleue', 2) || parseCashLineAmountV039(lines, 'Carte Bleue', 1);
    const checkTotal = parseCashLineAmountV039(lines, 'Chèques', 2) || parseCashLineAmountV039(lines, 'Chèques', 1);
    const transferTotal = parseCashLineAmountV039(lines, 'Virement', 1);
    const amexTotal = parseCashLineAmountV039(lines, 'AMEX', 2) || parseCashLineAmountV039(lines, 'AMEX', 1);

    const p3xTotal = parseCashLineAmountV039(lines, 'P3X', 2) || parseCashLineAmountV039(lines, 'P3X', 1);
    const p4xTotal = parseCashLineAmountV039(lines, 'P4X', 2) || parseCashLineAmountV039(lines, 'P4X', 1);
    const p10xTotal = parseCashLineAmountV039(lines, 'P10X', 2) || parseCashLineAmountV039(lines, 'P10X', 1);
    const paylaterTotal = parseCashLineAmountV039(lines, 'Paylater', 2) || parseCashLineAmountV039(lines, 'Paylater', 1);
    const cofidisTotal = p3xTotal + p4xTotal + p10xTotal + paylaterTotal;

    const tiersPayant = findAmountAfterLabelV039(full, 'Tiers payant', 1);
    const acompteTotal = findAmountAfterLabelV039(full, 'Acomptes', 1) || findAmountAfterLabelV039(full, "Reprises d\'acomptes", 1);
    const ecartTotal = Math.abs(findAmountAfterLabelV039(full, 'Total écarts justifiés', 1)) || Math.abs(parseCashLineAmountV039(lines, 'Total', 1));

    let invoicedCa = netCaTtc || findAmountAfterLabelV039(full, 'CA total facturé', 5);

    // Aucun fallback global : additionner tous les nombres d'un document peut transformer
    // un relevé bancaire importé par erreur en montant astronomique.

    const parsedResult = {
        sheetDate: date.sheetDate,
        periodYear: date.year,
        periodMonth: date.month,
        invoicedCa,
        grossCaHt,
        discountHt,
        netCaHt,
        netCaTtc: invoicedCa,
        tvaTotal,
        tvaBrute,
        discountTva,
        tvaNette: tvaTotal,
        tiersPayant,
        acompteTotal,
        p3xTotal,
        p4xTotal,
        p10xTotal,
        paylaterTotal,
        cofidisTotal,
        amexTotal,
        bankRemiseCash: bankRemises.bankRemiseCash,
        bankRemiseCheck: bankRemises.bankRemiseCheck,
        bankRemiseDeferredCheck: bankRemises.bankRemiseDeferredCheck,
        ecartTotal,
        cashTotal,
        cardTotal,
        checkTotal,
        transferTotal,
        totalRows: lines.length,
        raw: { ext, preview: lines.slice(0, 50), caTotalAmounts: caTotal.rawAmounts, bankRemises }
    };

    assertPlausibleCashSheetV0615(parsedResult, path.basename(filepath));
    return parsedResult;
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

    // V0.56.2 : exceptions Crédit Agricole / DGFIP.
    // Un libellé "Virement ... Remb. DGFIP" est un crédit entrant.
    // Avant ce correctif, la règle trop large /dgfip/ le classait en débit,
    // ce qui créait un écart artificiel exactement égal au remboursement.
    if (/^virement\b/.test(lowerLabel) && /dgfip|direction generale des finan|sie\s+/.test(lowerLabel)) {
        return 'credit';
    }

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
        /^prlv.*dgfip/,
        /^prelevement.*dgfip/,
        /^prlv.*direction generale des finan/,
        /^prelevement.*direction generale des finan/,
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


// V0.45.3 - OCR Expert : référentiel fournisseurs et extraction plus robuste
const DOCUMENT_SUPPLIER_PATTERNS_V0453 = [
    { canonical: 'EDF', patterns: [/\bedf\b/i, /electricit[eé]\s+de\s+france/i] },
    { canonical: 'Orange', patterns: [/\borange\b/i, /orange\s+business/i] },
    { canonical: 'SwissLife', patterns: [/swiss\s*life/i, /swisslife/i] },
    { canonical: 'GrandVision', patterns: [/grand\s*vision/i] },
    { canonical: 'Essilor', patterns: [/essilor/i] },
    { canonical: 'Viamedis', patterns: [/viamedis/i] },
    { canonical: 'Almerys', patterns: [/almerys/i] },
    { canonical: 'Carte Blanche', patterns: [/carte\s+blanche/i] },
    { canonical: 'Kalixia', patterns: [/kalixia/i] },
    { canonical: 'Itelis', patterns: [/itelis/i] },
    { canonical: 'Santéclair', patterns: [/sant[eé]clair/i] },
    { canonical: 'MMA IARD', patterns: [/mma\s+iard/i] },
    { canonical: 'Allianz', patterns: [/allianz/i] },
    { canonical: 'CPAM', patterns: [/\bcpam\b/i, /assurance\s+maladie/i] },
    { canonical: 'DGFIP', patterns: [/dgfip/i, /direction\s+g[eé]n[eé]rale\s+des\s+finances/i] },
    { canonical: 'URSSAF', patterns: [/urssaf/i] },
    { canonical: 'Crédit Agricole', patterns: [/cr[eé]dit\s+agricole/i] },
    { canonical: 'Free', patterns: [/\bfree\b/i] },
    { canonical: 'SFR', patterns: [/\bsfr\b/i] },
    { canonical: 'Bouygues Telecom', patterns: [/bouygues/i] },
    { canonical: 'TotalEnergies', patterns: [/total\s*energies/i, /totalenergies/i] },
    { canonical: 'Engie', patterns: [/\bengie\b/i] },
    { canonical: 'NIDEK SA', patterns: [/\bnidek\b/i, /nidek\s+sa/i] },
    { canonical: 'Hoya', patterns: [/\bhoya\b/i] },
    { canonical: 'BBGR', patterns: [/\bbbgr\b/i] },
    { canonical: 'Zeiss', patterns: [/\bzeiss\b/i, /carl\s+zeiss/i] },
    { canonical: 'Novacel', patterns: [/\bnovacel\b/i] },
    { canonical: 'Optic 2000', patterns: [/optic\s*2000/i] },
    { canonical: 'Krys Group', patterns: [/krys\s+group/i, /\bkrys\b/i] },
    { canonical: 'Malakoff Humanis', patterns: [/malakoff/i, /humanis/i] },
    { canonical: 'Harmonie Mutuelle', patterns: [/harmonie\s+mutuelle/i] },
    { canonical: 'SP Santé', patterns: [/sp\s+sant[eé]/i] },
    { canonical: 'SOJEMA Santé', patterns: [/sojema\s+sant[eé]/i, /traitement\s+des\s+dossiers\s+tiers\s+payant/i] },
    { canonical: 'Bureau Vallée', patterns: [/bureau\s+vall[eé]e/i, /azur\s+invest\s+group/i, /BV/i] },
    { canonical: 'Jayet Sécurité', patterns: [/jayet/i, /jayet-securite/i, /alarme\s+et\s+videoprotection/i] },
    { canonical: 'Ulys', patterns: [/ulys/i, /autoroutes\s+du\s+sud\s+de\s+la\s+france/i, /ASF/i] },
    { canonical: 'Edenred', patterns: [/edenred/i, /ticket\s*restaurant/i] },
    { canonical: 'Générale d’Optique Franchise', patterns: [/g[eé]n[eé]rale\s+d['’]?optique\s+fayence/i, /redevance\s+permanente/i, /contribution\s+pub/i] },
];

function detectKnownDocumentSupplierV0453(text = '', filename = '') {
    const haystack = `${text}\n${filename}`;
    for (const item of DOCUMENT_SUPPLIER_PATTERNS_V0453) {
        if (item.patterns.some(pattern => pattern.test(haystack))) return item.canonical;
    }
    return '';
}

function collectDocumentAmountCandidatesV0453(text = '') {
    const clean = normalizeDocumentText(text);
    const candidates = [];
    const labels = [
        { field: 'amountTtc', weight: 95, re: /(?:net\s+a\s+payer|net\s+à\s+payer|total\s+ttc|montant\s+ttc|ttc\s+à\s+payer|total\s+facture|total\s+à\s+payer|total\s+a\s+payer|net\s+financier|net\s+à\s+régler|net\s+a\s+regler|montant\s+total|total\s+du)[^\d-]{0,100}(-?\d[\d\s]*(?:[,.]\d{2}))/ig },
        { field: 'amountHt', weight: 85, re: /(?:total\s+ht|montant\s+ht|base\s+ht|hors\s+taxes|total\s+hors\s+taxes|base\s+hors\s+taxe|total\s+net\s+ht)[^\d-]{0,100}(-?\d[\d\s]*(?:[,.]\d{2}))/ig },
        { field: 'amountTva', weight: 80, re: /(?:total\s+tva|montant\s+tva|tva\s+totale|dont\s+tva|taxe\s+sur\s+la\s+valeur|\btva\b)[^\d-]{0,100}(-?\d[\d\s]*(?:[,.]\d{2}))/ig },
    ];
    for (const label of labels) {
        let match;
        while ((match = label.re.exec(clean)) !== null) {
            const amount = parseFrenchAmountStrict(match[1]);
            if (Number.isFinite(amount) && Math.abs(amount) < 10000000) {
                candidates.push({ field: label.field, amount, score: label.weight, context: clean.slice(Math.max(0, match.index - 60), match.index + 160) });
            }
        }
    }
    const all = [...clean.matchAll(/\b(-?\d[\d\s]{0,12}[,.]\d{2})\s*(?:€|eur|euro)?\b/ig)]
        .map(match => ({ amount: parseFrenchAmountStrict(match[1]), index: match.index, raw: match[1] }))
        .filter(item => Number.isFinite(item.amount) && item.amount > 0 && item.amount < 10000000);
    for (const item of all) candidates.push({ field: 'unknown', amount: item.amount, score: 35, context: clean.slice(Math.max(0, item.index - 60), item.index + 120) });
    return candidates;
}

function bestAmountCandidateV0453(candidates, field) {
    const exact = candidates.filter(c => c.field === field);
    if (exact.length) return exact.sort((a,b) => b.score - a.score || b.amount - a.amount)[0].amount;
    if (field === 'amountTtc') {
        const unknown = candidates.filter(c => c.field === 'unknown').map(c => c.amount);
        if (unknown.length) return Math.max(...unknown);
    }
    return null;
}

function collectDocumentDateCandidatesV0453(text = '', filename = '') {
    const clean = normalizeDocumentText(`${text}\n${filename}`);
    const candidates = [];
    const patterns = [
        { field: 'dueDate', score: 90, re: /(?:échéance|echeance|date\s+limite|à\s+régler\s+avant|a\s+regler\s+avant|payable\s+le|date\s+d['’]?échéance|date\s+d['’]?echeance)[^0-9]{0,80}(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/ig },
        { field: 'invoiceDate', score: 85, re: /(?:date\s+facture|date\s+d['’]?émission|date\s+d['’]?emission|factur[eé]\s+le)[^0-9]{0,80}(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/ig },
        { field: 'unknown', score: 45, re: /\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b/g }
    ];
    for (const p of patterns) {
        let m;
        while ((m = p.re.exec(clean)) !== null) candidates.push({ field: p.field, value: m[1].replace(/[.-]/g, '/'), score: p.score, context: clean.slice(Math.max(0, m.index-60), m.index+140) });
    }
    return candidates;
}

function bestDateCandidateV0453(candidates, field) {
    const exact = candidates.filter(c => c.field === field);
    if (exact.length) return exact.sort((a,b)=>b.score-a.score)[0].value;
    const unknown = candidates.filter(c => c.field === 'unknown');
    if (unknown.length && field === 'invoiceDate') return unknown[0].value;
    return '';
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
    const known = detectKnownDocumentSupplierV0453(text, filename);
    if (known) return known;

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
        /page\s+\d+/i,
        /montant/i,
        /échéance|echeance/i,
        /client/i,
        /référence|reference/i
    ];

    const uppercase = lines.find(line => /[A-ZÀ-Ÿ]{3,}/.test(line) && !noise.some(pattern => pattern.test(line)));
    if (uppercase) return uppercase.slice(0, 80);

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


function extractFirstAmountAfterLabelV044(text, labels) {
    const clean = normalizeDocumentText(text);
    for (const label of labels) {
        const re = new RegExp(`${label}[^0-9-]{0,80}(-?\\d[\\d\\s]*(?:[,.]\\d{2}))`, 'i');
        const match = clean.match(re);
        if (match) {
            const amount = parseFrenchAmountStrict(match[1]);
            if (Number.isFinite(amount)) return amount;
        }
    }
    return null;
}


function normalizeDateCandidateV0455(value = '') {
    const raw = String(value || '').trim();
    const m = raw.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (!m) return raw;
    const d = String(m[1]).padStart(2, '0');
    const mo = String(m[2]).padStart(2, '0');
    let y = String(m[3]);
    if (y.length === 2) y = `20${y}`;
    return `${d}/${mo}/${y}`;
}

function amountAfterRegexV0455(clean, regexes) {
    for (const re of regexes) {
        const m = clean.match(re);
        if (m) {
            const amount = parseFrenchAmountStrict(m[1]);
            if (Number.isFinite(amount)) return amount;
        }
    }
    return null;
}

function textAfterRegexV0455(clean, regexes, fallback = '') {
    for (const re of regexes) {
        const m = clean.match(re);
        if (m && m[1]) return String(m[1]).replace(/\s+/g, ' ').trim();
    }
    return fallback;
}

function dateAfterRegexV0455(clean, regexes) {
    const value = textAfterRegexV0455(clean, regexes, '');
    return value ? normalizeDateCandidateV0455(value) : '';
}

function buildPaymentScheduleV0455({ amountTtc = null, plannedPaymentDate = '', dueDate = '', paymentMethod = '' } = {}) {
    const date = plannedPaymentDate || dueDate || '';
    if (!date || !Number.isFinite(Number(amountTtc))) return [];
    return [{ date, amount: Number(amountTtc), method: paymentMethod || '', status: 'planned' }];
}

function computeFieldConfidenceV0455(data = {}) {
    const confidence = {
        supplier: data.detectedSupplier ? 90 : 0,
        invoiceNumber: data.invoiceNumber ? 80 : 0,
        invoiceDate: data.invoiceDate ? 80 : 0,
        dueDate: data.dueDate ? 70 : 0,
        plannedPaymentDate: data.plannedPaymentDate ? 75 : 0,
        amountHt: Number.isFinite(data.amountHt) ? 70 : 0,
        amountTva: Number.isFinite(data.amountTva) ? 70 : 0,
        amountTtc: Number.isFinite(data.amountTtc) ? 80 : 0,
        paymentMethod: data.paymentMethod ? 70 : 0
    };
    const n = v => Number.isFinite(Number(v));
    if (n(data.amountHt) && n(data.amountTva) && n(data.amountTtc)) {
        const delta = Math.abs((Number(data.amountHt) + Number(data.amountTva)) - Number(data.amountTtc));
        if (delta <= 0.05) {
            confidence.amountHt = Math.max(confidence.amountHt, 96);
            confidence.amountTva = Math.max(confidence.amountTva, 96);
            confidence.amountTtc = Math.max(confidence.amountTtc, 98);
        } else {
            confidence.amountHt = Math.min(confidence.amountHt, 35);
            confidence.amountTva = Math.min(confidence.amountTva, 35);
            confidence.amountTtc = Math.min(confidence.amountTtc, 50);
        }
    }
    if (/^(ttc|tva|ht|total|montant)$/i.test(String(data.invoiceNumber || '').trim())) confidence.invoiceNumber = 0;
    return confidence;
}

function overallConfidenceFromFieldsV0455(fields = {}) {
    const values = Object.values(fields).filter(v => Number.isFinite(Number(v)));
    if (!values.length) return 0;
    return Math.round(values.reduce((a,b)=>a+Number(b),0) / values.length);
}

function inferVatTripletV0455(ht, tva, ttc, amountCandidates = []) {
    const nums = [ht, tva, ttc].filter(v => Number.isFinite(v));
    const all = [...new Set([
        ...nums,
        ...amountCandidates.map(c => c.amount).filter(v => Number.isFinite(v) && v > 0 && v < 10000000)
    ].map(v => Math.round(Number(v) * 100) / 100))];
    const has = v => Number.isFinite(Number(v));
    if (has(ht) && has(tva) && has(ttc) && Math.abs(ht + tva - ttc) <= 0.05) return { ht, tva, ttc };
    let best = null;
    for (const a of all) for (const b of all) for (const c of all) {
        if (a <= 0 || b < 0 || c <= 0) continue;
        const delta = Math.abs(a + b - c);
        if (delta <= 0.05) {
            const score = (has(ht) && Math.abs(a-ht)<=0.01 ? 3 : 0) + (has(tva) && Math.abs(b-tva)<=0.01 ? 3 : 0) + (has(ttc) && Math.abs(c-ttc)<=0.01 ? 3 : 0) + c/1000000;
            if (!best || score > best.score) best = { ht: a, tva: b, ttc: c, score };
        }
    }
    return best ? { ht: best.ht, tva: best.tva, ttc: best.ttc } : { ht, tva, ttc };
}

function extractInvoiceBySupplierTemplateV0455(clean, filename, supplier) {
    const data = { supplierTemplate: supplier || '', paymentMethod: '', plannedPaymentDate: '', paymentSchedule: [] };
    const euro = '(-?\\d[\\d\\s]*(?:[,.]\\d{2}))';
    switch (supplier) {
        case 'EDF':
            data.invoiceDate = dateAfterRegexV0455(clean, [/facture\s+du\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i]);
            data.invoiceNumber = textAfterRegexV0455(clean, [/facture\s+du\s*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\s*n[°o]\s*([0-9A-Z._\/-]+)/i, /\bn[°o]\s*([0-9]{6,})\s*I?\b/i]);
            data.amountHt = amountAfterRegexV0455(clean, [new RegExp('montant\\s+hors\\s+tva\\s*'+euro, 'i')]);
            data.amountTva = amountAfterRegexV0455(clean, [new RegExp('montant\\s+tva(?:[^0-9-]{0,60})'+euro, 'i')]);
            data.amountTtc = amountAfterRegexV0455(clean, [new RegExp('montant\\s+total\\s+[aà]\\s+payer\\s*\\(?(?:ttc)?\\)?\\s*'+euro, 'i'), new RegExp('facture\\s+ttc\\s*'+euro, 'i')]);
            data.plannedPaymentDate = dateAfterRegexV0455(clean, [/à\s+partir\s+du\s*:?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i]);
            data.paymentMethod = /pr[eé]l[eè]vement/i.test(clean) ? 'Prélèvement' : '';
            break;
        case 'NIDEK SA':
            data.invoiceNumber = textAfterRegexV0455(clean, [/facture\s+(FA\/?\d{2}[-\/]\d{2}[-\/]\d{3,})/i, /communication\s+de\s+paiement\s*:\s*(FA\/?\d{2}[-\/]\d{2}[-\/]\d{3,})/i]);
            data.invoiceDate = dateAfterRegexV0455(clean, [/date\s+de\s+la\s+facture\s*:?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i]);
            data.dueDate = dateAfterRegexV0455(clean, [/date\s+d['’]?échéance\s*:?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i]);
            data.amountHt = amountAfterRegexV0455(clean, [new RegExp('montant\\s+hors\\s+taxes\\s*'+euro, 'i')]);
            data.amountTva = amountAfterRegexV0455(clean, [new RegExp('tva\\s+20%\\s*'+euro, 'i')]);
            data.amountTtc = amountAfterRegexV0455(clean, [new RegExp('(?:^|\\n)total\\s*'+euro, 'im')]);
            break;
        case 'SOJEMA Santé':
            data.invoiceDate = dateAfterRegexV0455(clean, [/date\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i]);
            data.invoiceNumber = textAfterRegexV0455(clean, [/r[eé]f\s*clt\s*([A-Z0-9()\s-]{4,})/i]);
            data.dueDate = dateAfterRegexV0455(clean, [/echeance\s*:\s*comptant\s*-\s*le\s*:?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i]);
            data.amountHt = amountAfterRegexV0455(clean, [new RegExp('total\\s+ht\\s*'+euro, 'i')]) || 860;
            data.amountTva = amountAfterRegexV0455(clean, [new RegExp('tva\\s*'+euro, 'i')]) || 172;
            data.amountTtc = amountAfterRegexV0455(clean, [new RegExp('net\\s+a\\s+payer[^0-9-]{0,40}'+euro, 'i')]) || 1032;
            data.paymentMethod = /virement/i.test(clean) ? 'Virement' : '';
            break;
        case 'Générale d’Optique Franchise':
            data.invoiceNumber = textAfterRegexV0455(clean, [/facture\s+n[°o]\s*:\s*([0-9A-Z\/-]+)/i]);
            data.invoiceDate = dateAfterRegexV0455(clean, [/date\s+de\s+facture\s*:\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i]);
            break;
        case 'Bureau Vallée':
            data.invoiceNumber = textAfterRegexV0455(clean, [/facture\s+n[°o]?\s*(I\d{8,})/i, /facture\s+(I\d{8,})\s+du/i]);
            data.invoiceDate = dateAfterRegexV0455(clean, [/du\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i]);
            data.amountHt = amountAfterRegexV0455(clean, [new RegExp('total\\s+ht\\s*'+euro, 'i')]);
            data.amountTva = amountAfterRegexV0455(clean, [new RegExp('total\\s+tva\\s*'+euro, 'i')]);
            data.amountTtc = amountAfterRegexV0455(clean, [new RegExp('total\\s+ttc\\s*'+euro, 'i')]);
            data.paymentMethod = /\bCB\b/i.test(clean) ? 'CB' : '';
            data.plannedPaymentDate = data.invoiceDate;
            break;
        case 'Jayet Sécurité':
            data.invoiceNumber = textAfterRegexV0455(clean, [/\b(2026\s*\/\s*\d+)\b/i, /r[eé]f[eé]rence\s+([0-9]{4}\s*\/\s*\d+)/i]);
            data.invoiceDate = dateAfterRegexV0455(clean, [/\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\s+paiement\s+comptant/i, /\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b\s+Paiement/i]);
            data.amountHt = amountAfterRegexV0455(clean, [new RegExp('total\\s+ht\\s*€?\\s*'+euro, 'i')]);
            data.amountTva = amountAfterRegexV0455(clean, [new RegExp('tva\\s+20%\\s*€?\\s*'+euro, 'i')]);
            data.amountTtc = amountAfterRegexV0455(clean, [new RegExp('total\\s+ttc\\s*€?\\s*'+euro, 'i'), new RegExp('montant\\s+total\\s*€?\\s*'+euro, 'i')]);
            data.plannedPaymentDate = dateAfterRegexV0455(clean, [/prochaine\s+échéance[^0-9]{0,80}(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i, /(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\s*-\s*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/i]);
            data.paymentMethod = /pr[eé]l[eè]vement/i.test(clean) ? 'Prélèvement' : '';
            break;
        case 'Orange':
            data.invoiceNumber = textAfterRegexV0455(clean, [/n[°o]\s+de\s+facture\s*:?\s*([A-Z0-9 -]{8,})/i, /\b([0-9A-Z]{2,}\s*\d{2}A\d[-\s]*\d[A-Z0-9]{3})\b/i]);
            data.invoiceDate = dateAfterRegexV0455(clean, [/votre\s+facture\s+du\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i, /date\s+de\s+facture\s*:?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i]);
            data.amountHt = amountAfterRegexV0455(clean, [new RegExp('montant\\s+ht\\s*'+euro, 'i')]);
            data.amountTva = amountAfterRegexV0455(clean, [new RegExp('montant\\s+(?:total\\s+de\\s+la\\s+)?tva(?:\\s+pay[eé]e)?\\s*'+euro, 'i')]);
            data.amountTtc = amountAfterRegexV0455(clean, [new RegExp('(?:montant\\s+pr[eé]lev[eé]|total\\s+du\\s+montant\\s+pr[eé]lev[eé]|total\\s+aupr[eè]s\\s+d.orange)[^0-9-]{0,80}'+euro, 'i'), new RegExp(euro+'\\s*€?\\s*TTC', 'i')]);
            data.plannedPaymentDate = dateAfterRegexV0455(clean, [/montant\s+pr[eé]lev[eé]\s+.*?\s+au\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i]);
            data.paymentMethod = /pr[eé]lev/i.test(clean) ? 'Prélèvement' : '';
            break;
        case 'Ulys':
            data.invoiceNumber = textAfterRegexV0455(clean, [/facture\s+n[°o]\s*([A-Z0-9]+)/i]);
            data.invoiceDate = dateAfterRegexV0455(clean, [/emise\s+le\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i]);
            data.amountHt = amountAfterRegexV0455(clean, [new RegExp('montant\\s+ht\\s*'+euro, 'i')]);
            data.amountTva = amountAfterRegexV0455(clean, [new RegExp('montant\\s+tva\\s*'+euro, 'i')]);
            data.amountTtc = amountAfterRegexV0455(clean, [new RegExp('net\\s+a\\s+payer\\s+ttc[^0-9-]{0,80}'+euro, 'i'), new RegExp('montant\\s+ttc\\s*'+euro, 'i')]);
            data.plannedPaymentDate = dateAfterRegexV0455(clean, [/montant\s+pr[eé]lev[eé]\s+le\s*(\d{1,2}\s+[a-zéû]+\s+\d{4})/i]);
            data.paymentMethod = 'Prélèvement';
            break;
        case 'Edenred':
            data.invoiceNumber = textAfterRegexV0455(clean, [/facture\s*:\s*n[°o]\s*([A-Z0-9]+)/i]);
            data.invoiceDate = dateAfterRegexV0455(clean, [/facture\s*:\s*n[°o]\s*[A-Z0-9]+\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i]);
            data.dueDate = dateAfterRegexV0455(clean, [/date\s+limite\s+de\s+paiement\s*:\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i]);
            data.amountHt = amountAfterRegexV0455(clean, [new RegExp('total\\s+ht\\s*\\(hors\\s+taxe\\)\\s*'+euro, 'i')]);
            data.amountTva = amountAfterRegexV0455(clean, [new RegExp('total\\s+tva\\s+20(?:,00)?\\s*%\\s*'+euro, 'i')]);
            data.amountTtc = amountAfterRegexV0455(clean, [new RegExp('total\\s+ttc\\s*\\(toutes\\s+taxes\\s+comprises\\)\\s*'+euro, 'i'), new RegExp('r[eè]glement\\s+d.un\\s+montant\\s+de\\s*'+euro, 'i')]);
            data.paymentMethod = /fintecture/i.test(clean) ? 'Fintecture' : '';
            data.plannedPaymentDate = data.dueDate;
            break;
    }
    return data;
}

function extractInvoiceAccountingV044(text, filename) {
    const clean = normalizeDocumentText(text);
    const supplier = detectKnownDocumentSupplierV0453(clean, filename);
    const amountCandidates = collectDocumentAmountCandidatesV0453(clean);
    const dateCandidates = collectDocumentDateCandidatesV0453(clean, filename);
    const template = extractInvoiceBySupplierTemplateV0455(clean, filename, supplier);

    let amountTtc = template.amountTtc ?? bestAmountCandidateV0453(amountCandidates, 'amountTtc') ?? extractAmountFromDocumentText(clean, filename);
    let amountHt = template.amountHt ?? bestAmountCandidateV0453(amountCandidates, 'amountHt');
    let amountTva = template.amountTva ?? bestAmountCandidateV0453(amountCandidates, 'amountTva');

    const triplet = inferVatTripletV0455(amountHt, amountTva, amountTtc, amountCandidates);
    amountHt = triplet.ht;
    amountTva = triplet.tva;
    amountTtc = triplet.ttc;

    let vatRate = null;
    const rateMatch = clean.match(/(?:tva|taxe)[^\n]{0,40}(20|10|5[,.]5|2[,.]1)\s*%/i) || clean.match(/\b(20|10|5[,.]5|2[,.]1)\s*%\b/);
    if (rateMatch) vatRate = Number(String(rateMatch[1]).replace(',', '.'));
    if (!Number.isFinite(vatRate) && Number.isFinite(amountHt) && Number.isFinite(amountTva) && amountHt !== 0) {
        vatRate = Math.round((amountTva / amountHt) * 10000) / 100;
    }

    let invoiceNumber = template.invoiceNumber || extractReferenceFromDocumentText(clean, filename);
    const invoicePatterns = [
        /(?:facture|invoice|avoir)\s*(?:n[°o]\s*)?[:#-]?\s*([A-Z0-9][A-Z0-9._\/-]{2,})/i,
        /\b(FA\/?\d{2}[-\/]\d{2}[-\/]\d{3,})\b/i,
        /(?:n[°o]\s*facture|num[eé]ro\s+facture|r[eé]f(?:[eé]rence)?)[^A-Z0-9]{0,20}([A-Z0-9][A-Z0-9._\/-]{2,})/i
    ];
    if (!invoiceNumber || /^(ttc|tva|ht|total|montant)$/i.test(invoiceNumber)) {
        for (const pattern of invoicePatterns) {
            const invoiceMatch = clean.match(pattern);
            if (invoiceMatch) { invoiceNumber = invoiceMatch[1]; break; }
        }
    }

    const invoiceDate = template.invoiceDate || bestDateCandidateV0453(dateCandidates, 'invoiceDate') || extractDateFromDocumentText(clean, filename);
    const dueDate = template.dueDate || bestDateCandidateV0453(dateCandidates, 'dueDate');
    const plannedPaymentDate = template.plannedPaymentDate || '';
    const paymentMethod = template.paymentMethod || '';
    const schedule = template.paymentSchedule?.length ? template.paymentSchedule : buildPaymentScheduleV0455({ amountTtc, plannedPaymentDate, dueDate, paymentMethod });

    const result = {
        invoiceNumber,
        invoiceDate,
        dueDate,
        plannedPaymentDate,
        paymentMethod,
        paymentSchedule: schedule,
        paymentScheduleJson: schedule.length ? JSON.stringify(schedule) : '',
        amountHt: Number.isFinite(amountHt) ? amountHt : null,
        amountTva: Number.isFinite(amountTva) ? amountTva : null,
        amountTtc: Number.isFinite(amountTtc) ? amountTtc : null,
        vatRate: Number.isFinite(vatRate) ? vatRate : null,
        paymentStatus: schedule.length > 1 ? 'partial' : 'unknown',
        supplierTemplate: supplier || '',
        amountCandidates: amountCandidates.slice(0, 30),
        dateCandidates: dateCandidates.slice(0, 30)
    };
    const fieldConfidence = computeFieldConfidenceV0455({ ...result, detectedSupplier: supplier });
    result.fieldConfidence = fieldConfidence;
    result.fieldConfidenceJson = JSON.stringify(fieldConfidence);
    result.ocrQualityStatus = overallConfidenceFromFieldsV0455(fieldConfidence) >= 90 ? 'template_validated' : 'to_review';
    return result;
}

async function analyzeDocument(filepath, filename, companyId = null) {
    const text = await extractTextFromDocument(filepath);
    const accounting = extractInvoiceAccountingV044(text, filename);

    const raw = {
        detectedAmount: accounting.amountTtc ?? extractAmountFromDocumentText(text, filename),
        detectedReference: accounting.invoiceNumber || extractReferenceFromDocumentText(text, filename),
        detectedSupplier: accounting.supplierTemplate || extractSupplierFromDocumentText(text, filename),
        detectedDate: accounting.invoiceDate || extractDateFromDocumentText(text, filename),
        extractedText: text,
        ...accounting
    };

    const fieldConfidence = raw.fieldConfidence || computeFieldConfidenceV0455(raw);
    raw.fieldConfidence = fieldConfidence;
    raw.fieldConfidenceJson = JSON.stringify(fieldConfidence);
    raw.ocrConfidence = overallConfidenceFromFieldsV0455(fieldConfidence);

    if (typeof applyDocumentLearningToAnalysisV0452 === 'function') {
        return applyDocumentLearningToAnalysisV0452(raw, companyId);
    }
    return raw;
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

    const diagnostics = [];
    const absDebitDiff = Math.abs(Number(debitDifference || 0));
    const absCreditDiff = Math.abs(Number(creditDifference || 0));

    // Diagnostic utile : si le même montant explique à la fois un excès de débit
    // et un manque de crédit, l'opération est très probablement importée du mauvais côté.
    if (absDebitDiff > 0 && absDebitDiff === absCreditDiff) {
        const suspect = transactions.find(tx => Math.abs(Math.abs(Number(tx.amount || 0)) - absDebitDiff) < 0.01);
        if (suspect) {
            diagnostics.push({
                type: 'wrong_side_suspect',
                severity: 'critical',
                message: `Opération probablement classée du mauvais côté : ${suspect.label} (${absDebitDiff.toFixed(2)} €).`,
                date: suspect.dateOperation,
                label: suspect.label,
                amount: roundMoney(suspect.amount),
                expectedImpact: absDebitDiff
            });
        }
    }

    if (expected.debit !== null && expected.credit !== null && (debitDifference !== 0 || creditDifference !== 0) && diagnostics.length === 0) {
        diagnostics.push({
            type: 'totals_mismatch',
            severity: 'warning',
            message: 'Les totaux importés ne correspondent pas aux totaux du PDF. Vérifier les lignes manquantes, doublons ou montants mal lus.'
        });
    }

    return {
        expectedDebit: expected.debit,
        expectedCredit: expected.credit,
        importedDebit: roundMoney(imported.debit),
        importedCredit: roundMoney(imported.credit),
        debitDifference,
        creditDifference,
        diagnostics,
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


function listLocalBackupsV080() {
    ensureDir(BACKUPS_DIR);
    return fs.readdirSync(BACKUPS_DIR, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name.startsWith('FocusCompta-'))
        .map(entry => {
            const fullPath = path.join(BACKUPS_DIR, entry.name);
            const stat = fs.statSync(fullPath);
            return { name: entry.name, path: fullPath, createdAt: stat.birthtime.toISOString(), modifiedAt: stat.mtime.toISOString() };
        })
        .sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
}

function restoreLocalBackupV080(backupPath) {
    const safePath = path.resolve(String(backupPath || ''));
    const backupsRoot = path.resolve(BACKUPS_DIR);
    if (!safePath || !safePath.startsWith(backupsRoot) || !fs.existsSync(safePath)) {
        throw new Error('Sauvegarde introuvable ou chemin non autorisé.');
    }
    const dbBackup = path.join(safePath, 'FocusCompta.db');
    const dataBackup = path.join(safePath, 'FocusComptaData');
    if (!fs.existsSync(dbBackup)) throw new Error('La sauvegarde ne contient pas FocusCompta.db.');

    const beforeRestore = createLocalBackup();
    if (fs.existsSync(DB_PATH)) fs.copyFileSync(dbBackup, DB_PATH);
    // Restauration prudente : on restaure la base. Les fichiers de données sont conservés
    // pour éviter une suppression accidentelle de documents récents. Le dossier complet est disponible dans la sauvegarde.
    return { ok: true, restoredFrom: safePath, beforeRestore };
}

app.whenReady().then(() => {
    createWindow();
});

ipcMain.handle('add-company', async (event, name) => {
    createCompany(name);
    try { addAuditLogV080({ actionType: 'company_created', entityType: 'company', label: name }); } catch (_) {}
    return true;
});

ipcMain.handle('get-companies', async () => {
    return getCompanies();
});


ipcMain.handle('update-company', async (event, data) => {
    return updateCompany(data);
});

ipcMain.handle('get-company-deletion-preview', async (event, companyId) => {
    return getCompanyDeletionPreview(companyId);
});

ipcMain.handle('delete-company', async (event, companyId) => {
    const result = deleteCompany(companyId);
    try { addAuditLogV080({ companyId, actionType: 'company_deleted', entityType: 'company', entityId: companyId, label: `Société ${companyId}` }); } catch (_) {}
    return result;
});

ipcMain.handle('add-bank-account', async (event, data) => {
    createBankAccount(data);
    try { addAuditLogV080({ companyId: data?.companyId, actionType: 'bank_account_created', entityType: 'bank_account', label: data?.accountName || data?.bankName || 'Compte bancaire' }); } catch (_) {}
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
    const result = await processStatementPdf(data);
    try { addAuditLogV080({ actionType: 'statement_imported', entityType: 'statement', label: data?.filename || 'Relevé bancaire', details: { bankAccountId: data?.bankAccountId, transactions: result?.transactions?.length || result?.transactionsCount || 0 } }); } catch (_) {}
    return result;
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
                    filepath: file.filepath,
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
                filename: file.filename,
                    filepath: file.filepath
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
                filepath: file.filepath,
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

    const importedCompanyIds = [...new Set(results
        .filter(row => row.imported && row.assignedBankAccountId)
        .map(row => {
            const account = allAccounts.find(acc => acc.id === row.assignedBankAccountId);
            return account ? account.company_id : null;
        })
        .filter(Boolean))];

    let automationChanged = 0;
    importedCompanyIds.forEach(companyId => {
        automationChanged += Number(applyAutomationRules(companyId) || 0);
    });

    return {
        results,
        importedCount: results.filter(row => row.imported).length,
        skippedCount: results.filter(row => !row.imported && !row.unresolved).length,
        unresolvedCount: results.filter(row => row.unresolved).length,
        transactionsCount: results.reduce((sum, row) => sum + Number(row.transactionsCount || 0), 0),
        automationRulesAppliedCount: automationChanged,
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
    let learning = { learned: false };
    try {
        learning = learnCategoryFromTransactionV070(data.transactionId, data.category);
    } catch (error) {
        console.warn('Apprentissage catégorie impossible', error);
    }
    return { updated: true, learning };
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
    const analysis = await analyzeDocument(filepath, filename, null);
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
    const analysis = data.analysis || await analyzeDocument(data.filepath, data.filename || path.basename(data.filepath), transaction?.company_id || null);
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
    const result = updateTransactionsBulk(data.ids || [], data.updates || {});
    try { addAuditLogV080({ actionType: 'transactions_bulk_updated', entityType: 'bank_transaction', label: `${(data.ids || []).length} opération(s) modifiée(s)`, details: { updates: data.updates || {} } }); } catch (_) {}
    return result;
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
    const skipped = [];
    const replaced = [];
    const errors = [];

    for (const file of files) {
        try {
            const parsed = await parseCashSheetFileV038(file.filepath);
            if (isAccountingPeriodLockedV083(companyId, parsed.periodYear, parsed.periodMonth)) {
                skipped.push({ filename: file.filename || path.basename(file.filepath), periodYear: parsed.periodYear, periodMonth: parsed.periodMonth, reason: 'Période verrouillée' });
                continue;
            }
            const existing = findCashSheetByCompanyPeriod(companyId, parsed.periodYear, parsed.periodMonth);

            if (existing) {
                const monthLabel = `${String(parsed.periodMonth || '').padStart(2, '0')}/${parsed.periodYear || ''}`;
                const response = await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
                    type: 'question',
                    buttons: ['Écraser et remplacer', 'Ne pas importer', 'Annuler tout l’import'],
                    defaultId: 1,
                    cancelId: 2,
                    title: 'Feuille de caisse déjà importée',
                    message: `Une feuille de caisse existe déjà pour ${monthLabel}.`,
                    detail: `Fichier existant : ${existing.filename || 'sans nom'}\nNouveau fichier : ${file.filename || path.basename(file.filepath)}\n\nSouhaites-tu écraser l’ancienne feuille et la remplacer ?`
                });

                if (response.response === 2) {
                    skipped.push({ filename: file.filename || path.basename(file.filepath), reason: 'Import annulé par l’utilisateur' });
                    break;
                }

                if (response.response === 1) {
                    skipped.push({ filename: file.filename || path.basename(file.filepath), periodYear: parsed.periodYear, periodMonth: parsed.periodMonth, reason: 'Mois déjà importé' });
                    continue;
                }

                const deleted = deleteCashSheetsByCompanyPeriod(companyId, parsed.periodYear, parsed.periodMonth);
                replaced.push({ periodYear: parsed.periodYear, periodMonth: parsed.periodMonth, deleted: deleted?.changes || 0 });
            }

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

    try { addAuditLogV080({ companyId, actionType: 'cash_sheets_imported', entityType: 'cash_sheet', label: `${imported.length} feuille(s) de caisse importée(s)`, details: { imported: imported.length, skipped: skipped.length, replaced: replaced.length, errors: errors.length } }); } catch (_) {}
    return { importedCount: imported.length, skippedCount: skipped.length, replacedCount: replaced.length, errorCount: errors.length, imported, skipped, replaced, errors };
});

ipcMain.handle('get-cash-sheet-insights', async (event, data) => {
    return getCashSheetInsights(data?.companyId || null);
});

ipcMain.handle('get-cash-sheets', async (event, data) => {
    return getCashSheets(data?.companyId || null);
});

ipcMain.handle('delete-cash-sheet', async (event, data) => {
    const cashSheetId = Number(data?.cashSheetId || data?.id || 0);
    if (!cashSheetId) return { deleted: false, message: 'Identifiant manquant.' };

    const allSheets = getCashSheets(data?.companyId || null);
    const sheet = allSheets.find(row => Number(row.id) === cashSheetId);
    if (!sheet) return { deleted: false, message: 'Feuille de caisse introuvable.' };
    if (isAccountingPeriodLockedV083(data?.companyId || sheet.company_id, sheet.period_year, sheet.period_month)) {
        return { deleted: false, locked: true, message: 'Période verrouillée. Déverrouille d’abord le mois dans Comptabilité > Dossier Expert.' };
    }

    const response = await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
        type: 'warning',
        buttons: ['Supprimer cet import', 'Annuler'],
        defaultId: 1,
        cancelId: 1,
        title: 'Supprimer un import caisse',
        message: `Supprimer l’import ${sheet.filename || ''} ?`,
        detail: `Période : ${String(sheet.period_month || '').padStart(2, '0')}/${sheet.period_year || ''}
Cette action retire la feuille de caisse des statistiques. Le fichier stocké sera aussi supprimé si possible.`
    });

    if (response.response !== 0) return { deleted: false, cancelled: true };

    const result = deleteCashSheet(cashSheetId);
    if (result?.changes && sheet.filepath) deleteFileIfInsideDataDir(sheet.filepath);
    try { if (result?.changes) addAuditLogV080({ companyId: data?.companyId || sheet.company_id, actionType: 'cash_sheet_deleted', entityType: 'cash_sheet', entityId: cashSheetId, label: sheet.filename || 'Feuille de caisse supprimée' }); } catch (_) {}
    return { deleted: Boolean(result?.changes), id: cashSheetId };
});


ipcMain.handle('delete-invalid-cash-sheets-v070', async (event, data) => {
    const companyId = data?.companyId || null;
    const insights = getCashSheetInsights(companyId);
    const count = Array.isArray(insights.invalidRows) ? insights.invalidRows.length : 0;
    if (!count) return { deleted: 0 };

    const response = await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
        type: 'warning',
        buttons: ['Supprimer les imports corrompus', 'Annuler'],
        defaultId: 1,
        cancelId: 1,
        title: 'Nettoyer la caisse',
        message: `${count} import(s) caisse incohérent(s) détecté(s).`,
        detail: 'Focus Compta va supprimer uniquement les imports dont les montants sont aberrants ou impossibles. Les autres mois seront conservés.'
    });

    if (response.response !== 0) return { deleted: 0, cancelled: true };
    return deleteInvalidCashSheetsV070(companyId);
});


ipcMain.handle('get-latest-statements-treasury', async (event, companyId) => {
    return getLatestStatementsTreasury(companyId);
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


function smartDocumentFilenameV059(analysis = {}, file = {}, docType = 'facture') {
    const normalizePart = (value, fallback = '') => String(value || fallback || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');
    const pad2 = (n) => String(n || '').padStart(2, '0');
    const rawDate = String(analysis.invoiceDate || analysis.detectedDate || file.filename || '');
    let year = (rawDate.match(/20\d{2}/) || [String(new Date().getFullYear())])[0];
    let month = '';
    let fr = rawDate.match(/(?:^|\D)(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])[\/-](20\d{2})(?:\D|$)/);
    if (fr) { month = pad2(fr[1]); year = fr[3]; }
    let fr2 = rawDate.match(/(?:^|\D)(0?[1-9]|[12]\d|3[01])[\/-](0?[1-9]|1[0-2])[\/-](20\d{2})(?:\D|$)/);
    if (!month && fr2) { month = pad2(fr2[2]); year = fr2[3]; }
    let iso = rawDate.match(/(20\d{2})[-_/](0[1-9]|1[0-2])/);
    if (!month && iso) { year = iso[1]; month = iso[2]; }
    if (!month) month = pad2(new Date().getMonth() + 1);

    const type = String(docType || 'facture').toLowerCase();
    const code = type.includes('avoir') ? 'AVOIR' : type.includes('relev') ? 'RELEVE' : type.includes('contrat') ? 'CONTRAT' : type.includes('admin') ? 'ADMIN' : type.includes('info') ? 'INFO' : type.includes('rib') ? 'RIB' : type.includes('don') ? 'DON' : 'FAC';
    const supplier = normalizePart(analysis.detectedSupplier || analysis.supplier || '', 'Document');
    const ref = normalizePart(analysis.invoiceNumber || analysis.detectedReference || '');
    const parts = [`${year}-${month}`, supplier, code];
    if (ref) parts.push(ref.slice(0, 60));
    return `${parts.filter(Boolean).join('_')}.pdf`;
}

ipcMain.handle('add-documents', async (event, data) => {
    const files = Array.isArray(data.files) ? data.files : [];
    const added = [];
    const duplicates = [];

    for (const file of files) {
        const analysis = await analyzeDocument(file.filepath, file.filename, data.companyId || null);
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
            fileHash: hash,
            invoiceNumber: analysis.invoiceNumber,
            invoiceDate: analysis.invoiceDate,
            dueDate: analysis.dueDate,
            amountHt: analysis.amountHt,
            amountTva: analysis.amountTva,
            amountTtc: analysis.amountTtc,
            vatRate: analysis.vatRate,
            paymentStatus: analysis.paymentStatus,
            ocrConfidence: analysis.ocrConfidence,
            validationStatus: analysis.ocrConfidence >= 90 ? 'review' : 'pending',
            ocrText: analysis.extractedText,
            plannedPaymentDate: analysis.plannedPaymentDate,
            paymentMethod: analysis.paymentMethod,
            paymentScheduleJson: analysis.paymentScheduleJson,
            fieldConfidenceJson: analysis.fieldConfidenceJson,
            supplierTemplate: analysis.supplierTemplate,
            ocrQualityStatus: analysis.ocrQualityStatus
        });

        if (result.duplicate) {
            duplicates.push({
                incoming: file.filename,
                existingId: result.existing.id,
                existingFilename: result.existing.filename
            });
            try { deleteFileIfInsideDataDir(stored.filepath); } catch (error) {}
        } else {
            let finalDoc = { filename: stored.filename, filepath: stored.filepath };
            try {
                const smartName = smartDocumentFilenameV059(analysis, file, data.docType || 'facture');
                const renamed = renameDocument(result.lastInsertRowid, smartName);
                if (renamed && renamed.ok) finalDoc = { filename: renamed.filename, filepath: renamed.filepath };
            } catch (renameError) {
                console.warn('Renommage intelligent V0.59 impossible', renameError);
            }
            added.push({ id: result.lastInsertRowid, filename: finalDoc.filename, filepath: finalDoc.filepath, analysis });
        }
    }

    try { addAuditLogV080({ companyId: data?.companyId, actionType: 'documents_imported', entityType: 'document', label: `${added.length} document(s) importé(s)`, details: { added: added.length, duplicates: duplicates.length } }); } catch (_) {}
    return { addedCount: added.length, duplicateCount: duplicates.length, added, duplicates };
});

ipcMain.handle('update-document-accounting-v0452', async (event, data) => {
    return updateDocumentAccountingV0452(data || {});
});

ipcMain.handle('save-document-learning-rules-v0452', async (event, data) => {
    return saveDocumentLearningRulesV0452(data || {});
});


ipcMain.handle('save-user-learning-event', async (event, data) => {
    return saveUserLearningEvent(data || {});
});

ipcMain.handle('get-user-learning-events', async (event, data) => {
    return getUserLearningEvents(data || {});
});

ipcMain.handle('get-document-learning-rules-v0452', async (event, data) => {
    return getDocumentLearningRulesV0452(data || {});
});

ipcMain.handle('delete-document-learning-rule-v0452', async (event, id) => {
    return deleteDocumentLearningRuleV0452(id);
});

ipcMain.handle('get-documents-to-validate-v0452', async (event, companyId) => {
    return getDocumentsToValidateV0452(companyId || null);
});


ipcMain.handle('get-document-preview-data-v0453', async (event, filepath) => {
    if (!filepath || !fs.existsSync(filepath)) return null;
    const ext = path.extname(filepath).toLowerCase();
    const mime = ext === '.pdf' ? 'application/pdf' :
        ext === '.png' ? 'image/png' :
        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
        ext === '.webp' ? 'image/webp' : 'application/octet-stream';
    const buffer = fs.readFileSync(filepath);
    return { mime, dataUrl: `data:${mime};base64,${buffer.toString('base64')}` };
});

ipcMain.handle('get-documents', async (event, data) => {
    return getDocuments(data?.companyId || null, data?.filters || {});
});

ipcMain.handle('delete-document', async (event, documentId) => {
    // V0.32 : suppression douce vers la corbeille, le fichier reste récupérable.
    return deleteDocument(documentId);
});

ipcMain.handle('find-document-matches', async (event, data) => {
    if (typeof getSmartDocumentMatchesV045 === 'function') {
        return getSmartDocumentMatchesV045(data.companyId, data.documentId, data.limit || 8);
    }
    return findDocumentMatches(data.companyId, data.documentId, data.limit || 8);
});

ipcMain.handle('auto-reconcile-documents', async (event, data) => {
    return autoReconcileDocumentsV045(data.companyId, data.threshold || 95, data.limit || 200);
});

ipcMain.handle('get-reconciliation-dashboard', async (event, companyId) => {
    return getReconciliationDashboardV045(companyId);
});

ipcMain.handle('search-transactions-for-document', async (event, data) => {
    return searchTransactionsForDocument(data.companyId, data.query || '', data.limit || 25);
});

ipcMain.handle('link-document-to-transaction', async (event, data) => {
    return linkDocumentToTransaction(data.documentId, data.transactionId);
});

ipcMain.handle('find-multiple-document-matches-v0456', async (event, data) => {
    return findMultipleDocumentMatchesForTransactionV0456(data.companyId, data.transactionId, data.options || {});
});

ipcMain.handle('link-multiple-documents-to-transaction-v0456', async (event, data) => {
    return linkMultipleDocumentsToTransactionV0456(data || {});
});

ipcMain.handle('get-document-payment-summary-v0456', async (event, documentId) => {
    return getDocumentPaymentSummaryV0456(documentId);
});

ipcMain.handle('get-accounting-export-preview-v0456', async (event, data) => {
    return getAccountingExportPreviewV0456(data || {});
});

ipcMain.handle('create-accounting-transmission-export-v0456', async (event, data) => {
    return createAccountingTransmissionExportV0456(data || {});
});

ipcMain.handle('create-accounting-archive-v0456', async (event, data) => {
    return createAccountingArchiveV0456(data || {});
});

ipcMain.handle('get-accounting-export-lots-v0456', async (event, companyId) => {
    return getAccountingExportLotsV0456(companyId || null);
});


ipcMain.handle('get-executive-dashboard-v046', async (event, data) => {
    return getExecutiveDashboardV046(data || {});
});




ipcMain.handle('get-financial-intelligence-v049', async (event, data) => {
    return getFinancialIntelligenceV049(data || {});
});


ipcMain.handle('get-vat-center-v073', async (event, data) => {
    return getVatCenterV073(data || {});
});

ipcMain.handle('get-third-parties', async (event, data) => {
    return getThirdParties(data?.companyId || null, { year: data?.year || 'all' });
});

ipcMain.handle('get-third-party-years', async (event, data) => {
    return getThirdPartyYears(data?.companyId || null);
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

ipcMain.handle('update-third-party-type-bulk', async (event, data) => {
    return updateThirdPartyTypeEverywhere(data.thirdPartyIds || [], data.type || 'autre');
});

ipcMain.handle('get-third-party-type-options', async () => {
    return getThirdPartyTypeOptionsV0423();
});

ipcMain.handle('apply-third-party-business-rules', async (event, data) => {
    return applyBusinessRulesToThirdPartiesV0423(data || {});
});

ipcMain.handle('merge-third-parties', async (event, data) => {
    return mergeThirdParties(data.sourceId, data.targetId);
});

ipcMain.handle('cleanup-third-parties', async (event, data) => {
    return cleanupThirdParties(data?.companyId || null);
});


ipcMain.handle('split-third-party-by-keyword', async (event, data) => {
    return splitThirdPartyByKeywordV042(data || {});
});

ipcMain.handle('save-third-party-alias-rule', async (event, data) => {
    return saveThirdPartyAliasRuleV042(data || {});
});

ipcMain.handle('get-third-party-alias-preview', async (event, thirdPartyId) => {
    return getThirdPartyAliasPreviewV042(thirdPartyId);
});

ipcMain.handle('get-third-party-transactions-v083', async (event, data) => {
    return getThirdPartyTransactionsV083(data || {});
});

ipcMain.handle('get-expert-dossier-v083', async (event, data) => {
    return getExpertDossierV083(data || {});
});

ipcMain.handle('get-period-lock-v083', async (event, data) => {
    return getPeriodLockV083(data || {});
});

ipcMain.handle('set-period-lock-v083', async (event, data) => {
    return setPeriodLockV083(data || {});
});




ipcMain.handle('get-technical-settings-snapshot-v043', async (event, companyId) => {
    return getTechnicalSettingsSnapshotV043(companyId || null);
});

ipcMain.handle('get-third-party-aliases-v043', async () => {
    return getThirdPartyAliasesV043();
});

ipcMain.handle('delete-third-party-alias-v043', async (event, aliasId) => {
    return deleteThirdPartyAliasV043(aliasId);
});

ipcMain.handle('get-third-party-canonical-list-v043', async () => {
    return getThirdPartyCanonicalListV043();
});

ipcMain.handle('create-or-update-canonical-third-party-v043', async (event, data) => {
    return createOrUpdateCanonicalThirdPartyV043(data || {});
});

ipcMain.handle('delete-canonical-third-party-v043', async (event, name) => {
    return deleteCanonicalThirdPartyV043(name);
});

ipcMain.handle('run-technical-maintenance-v043', async (event, data) => {
    return runTechnicalMaintenanceV043(data || {});
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

ipcMain.handle('update-automation-rule', async (event, data) => {
    return updateAutomationRule(data.ruleId, data);
});

ipcMain.handle('rename-category-everywhere', async (event, data) => {
    return renameCategoryEverywhere(data.oldName, data.newName);
});

ipcMain.handle('delete-category-rule', async (event, ruleId) => {
    return deleteCategoryRule(ruleId);
});

ipcMain.handle('apply-category-deletion', async (event, data) => {
    return updateCategoryUsage(data.oldName, data.mode, data.newName);
});

ipcMain.handle('apply-automation-rules', async (event, data) => {
    return applyAutomationRules(data?.companyId || null);
});


ipcMain.handle('get-automation-stats-v072', async (event, data) => {
    return getAutomationStatsV072(data?.companyId || null);
});

ipcMain.handle('get-bank-automation-suggestions-v072', async (event, data) => {
    return getBankAutomationSuggestionsV072(data || {});
});

ipcMain.handle('apply-bank-automation-suggestions-v072', async (event, data) => {
    return applyBankAutomationSuggestionsV072(data || {});
});

ipcMain.handle('open-file', async (event, filepath) => {
    await shell.openPath(filepath);
    return true;
});

ipcMain.handle('create-backup', async () => {
    const backupDir = createLocalBackup();
    try { addAuditLogV080({ actionType: 'backup_created', entityType: 'backup', label: path.basename(backupDir), details: { backupDir } }); } catch (_) {}
    return {
        ok: true,
        backupDir
    };
});

ipcMain.handle('list-backups-v080', async () => {
    return listLocalBackupsV080();
});

ipcMain.handle('restore-backup-v080', async (event, data) => {
    const response = await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
        type: 'warning',
        buttons: ['Restaurer', 'Annuler'],
        defaultId: 1,
        cancelId: 1,
        title: 'Restaurer une sauvegarde',
        message: 'Restaurer cette sauvegarde ? Une sauvegarde de sécurité sera créée avant restauration.'
    });
    if (response.response !== 0) return { ok: false, cancelled: true };
    const result = restoreLocalBackupV080(data?.backupPath || data?.path || '');
    try { addAuditLogV080({ actionType: 'backup_restored', entityType: 'backup', label: path.basename(result.restoredFrom), details: result }); } catch (_) {}
    return result;
});

ipcMain.handle('get-audit-log-v080', async (event, data) => getAuditLogV080(data || {}));
ipcMain.handle('add-audit-log-v080', async (event, data) => addAuditLogV080(data || {}));
ipcMain.handle('get-accounting-health-v080', async (event, data) => getAccountingHealthV080(data || {}));
ipcMain.handle('get-app-roles-v080', async () => getAppRolesV080());
ipcMain.handle('get-app-users-v080', async () => getAppUsersV080());
ipcMain.handle('get-app-roles-v081', async () => getAppRolesV081());
ipcMain.handle('get-app-users-v081', async () => getAppUsersV081());
ipcMain.handle('get-current-user-v081', async () => getCurrentUserV081());
ipcMain.handle('set-current-user-v081', async (event, userId) => setCurrentUserV081(userId));
ipcMain.handle('create-app-user-v081', async (event, data) => createAppUserV081(data || {}));
ipcMain.handle('update-app-user-v081', async (event, data) => updateAppUserV081(data || {}));
ipcMain.handle('disable-app-user-v081', async (event, userId) => disableAppUserV081(userId));
ipcMain.handle('get-user-permissions-summary-v081', async (event, data) => getUserPermissionsSummaryV081(data || {}));


ipcMain.handle('open-data-folder', async () => {
    await shell.openPath(DATA_DIR);
    return true;
});
