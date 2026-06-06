const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'FocusComptaData');
const STATEMENTS_DIR = path.join(DATA_DIR, 'Releves');
const RECEIPTS_DIR = path.join(DATA_DIR, 'Justificatifs');
const BACKUPS_DIR = path.join(PROJECT_ROOT, 'FocusComptaBackups');
const LEGACY_DB_PATH = path.join(PROJECT_ROOT, 'ThetaCompta.db');
const DB_PATH = path.join(DATA_DIR, 'FocusCompta.db');

[DATA_DIR, STATEMENTS_DIR, RECEIPTS_DIR, BACKUPS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
    fs.copyFileSync(LEGACY_DB_PATH, DB_PATH);
}

const db = new Database(DB_PATH);

db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    bank_name TEXT NOT NULL,
    account_name TEXT,
    iban TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS statements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_account_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    original_filepath TEXT,
    statement_year TEXT,
    statement_month TEXT,
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(bank_account_id) REFERENCES bank_accounts(id)
);

CREATE TABLE IF NOT EXISTS bank_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_account_id INTEGER NOT NULL,
    statement_id INTEGER,
    date_operation TEXT,
    label TEXT,
    amount REAL,
    type TEXT,
    pdf_source TEXT,
    status TEXT DEFAULT 'missing',
    category TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(bank_account_id) REFERENCES bank_accounts(id),
    FOREIGN KEY(statement_id) REFERENCES statements(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    original_filepath TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(transaction_id) REFERENCES bank_transactions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS category_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

function ensureColumn(tableName, columnName, definition) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const exists = columns.some(column => column.name === columnName);

    if (!exists) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
}

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/œ/g, 'oe')
        .replace(/Œ/g, 'oe')
        .replace(/æ/g, 'ae')
        .replace(/Æ/g, 'ae')
        .toLowerCase()
        .replace(/[^a-z0-9,.-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildTransactionSearchText(row) {
    return normalizeSearchText([
        row.label,
        row.category,
        row.notes,
        row.pdf_source,
        row.amount
    ].filter(value => value !== null && value !== undefined).join(' '));
}

ensureColumn('statements', 'statement_year', 'TEXT');
ensureColumn('statements', 'statement_month', 'TEXT');
ensureColumn('statements', 'original_filepath', 'TEXT');
ensureColumn('bank_transactions', 'statement_id', 'INTEGER');
ensureColumn('bank_transactions', 'status', "TEXT DEFAULT 'missing'");
ensureColumn('bank_transactions', 'category', 'TEXT');
ensureColumn('bank_transactions', 'notes', 'TEXT');
ensureColumn('bank_transactions', 'search_text', 'TEXT');
ensureColumn('receipts', 'original_filepath', 'TEXT');

const transactionsMissingSearchText = db.prepare(`
    SELECT id, label, category, notes, pdf_source, amount
    FROM bank_transactions
    WHERE search_text IS NULL OR search_text = ''
`).all();

const updateSearchTextStmt = db.prepare(`
    UPDATE bank_transactions
    SET search_text = ?
    WHERE id = ?
`);

transactionsMissingSearchText.forEach(row => {
    updateSearchTextStmt.run(buildTransactionSearchText(row), row.id);
});

const defaultCategoryRules = [
    ['MULTITEK', 'Travaux'],
    ['EURO CLIMAT', 'Climatisation / Travaux'],
    ['SIMIE', 'Travaux'],
    ['SEGA PEINTURE', 'Travaux'],
    ['SMB BATIMENT', 'Travaux'],
    ['SOCIETE CALADOISE', 'Travaux'],
    ['CALADOISE', 'Travaux'],
    ['SIAGI', 'Frais bancaires / Garantie'],
    ['CREDIT AGRICOLE', 'Frais bancaires'],
    ['TENUE DE COMPTE', 'Frais bancaires'],
    ['FRAIS DE DOSSIER', 'Frais bancaires'],
    ['AUTOROUTES', 'Déplacements'],
    ['JAYET', 'Sécurité / Alarme'],
    ['APPORT', 'Compte courant associé'],
    ['REAL PRET', 'Emprunt bancaire'],
    ['DEBLOCAGE', 'Emprunt bancaire'],
    ['BL CONSULTING', 'Immobilier'],
    ['DEPOT DE GARANTIE', 'Immobilier']
];

const insertRuleStmt = db.prepare(`
    INSERT OR IGNORE INTO category_rules(keyword, category)
    VALUES(?, ?)
`);

defaultCategoryRules.forEach(rule => insertRuleStmt.run(rule[0], rule[1]));

function findCategoryForLabel(label) {
    const normalizedLabel = normalizeSearchText(label);
    const rules = db.prepare(`
        SELECT keyword, category
        FROM category_rules
        ORDER BY LENGTH(keyword) DESC
    `).all();

    for (const rule of rules) {
        const normalizedKeyword = normalizeSearchText(rule.keyword);
        if (normalizedKeyword && normalizedLabel.includes(normalizedKeyword)) {
            return rule.category;
        }
    }

    return '';
}

function createCompany(name) {
    return db.prepare(`
        INSERT INTO companies(name)
        VALUES(?)
    `).run(name);
}

function getCompanies() {
    return db.prepare(`
        SELECT *
        FROM companies
        ORDER BY name
    `).all();
}

function createBankAccount(companyId, bankName, accountName, iban) {
    return db.prepare(`
        INSERT INTO bank_accounts(company_id, bank_name, account_name, iban)
        VALUES(?, ?, ?, ?)
    `).run(companyId, bankName, accountName, iban);
}

function getBankAccounts(companyId) {
    return db.prepare(`
        SELECT *
        FROM bank_accounts
        WHERE company_id = ?
        ORDER BY bank_name, account_name
    `).all(companyId);
}

function createStatement(bankAccountId, filename, filepath, originalFilepath = null, statementYear = null, statementMonth = null) {
    return db.prepare(`
        INSERT INTO statements(bank_account_id, filename, filepath, original_filepath, statement_year, statement_month)
        VALUES(?, ?, ?, ?, ?, ?)
    `).run(bankAccountId, filename, filepath, originalFilepath, statementYear, statementMonth);
}

function updateStatementPeriod(statementId, statementYear, statementMonth) {
    return db.prepare(`
        UPDATE statements
        SET statement_year = ?, statement_month = ?
        WHERE id = ?
    `).run(statementYear, statementMonth, statementId);
}

function getStatements(bankAccountId) {
    return db.prepare(`
        SELECT
            s.*,
            COUNT(DISTINCT t.id) AS transactions_count,
            COUNT(DISTINCT r.id) AS receipts_count
        FROM statements s
        LEFT JOIN bank_transactions t ON t.statement_id = s.id
        LEFT JOIN receipts r ON r.transaction_id = t.id
        WHERE s.bank_account_id = ?
        GROUP BY s.id
        ORDER BY COALESCE(s.statement_year, '') DESC,
                 COALESCE(s.statement_month, '') DESC,
                 s.imported_at DESC
    `).all(bankAccountId);
}

function statementExists(bankAccountId, filepath) {
    return db.prepare(`
        SELECT *
        FROM statements
        WHERE bank_account_id = ?
        AND (
            filepath = ?
            OR original_filepath = ?
        )
    `).get(bankAccountId, filepath, filepath);
}

function getStatementFiles(statementId) {
    const statement = db.prepare(`
        SELECT filepath
        FROM statements
        WHERE id = ?
    `).get(statementId);

    const receipts = db.prepare(`
        SELECT r.filepath
        FROM receipts r
        INNER JOIN bank_transactions t ON t.id = r.transaction_id
        WHERE t.statement_id = ?
    `).all(statementId);

    return {
        statementFilepath: statement ? statement.filepath : null,
        receiptFilepaths: receipts.map(row => row.filepath).filter(Boolean)
    };
}

function deleteStatement(statementId) {
    const transactionIds = db.prepare(`
        SELECT id
        FROM bank_transactions
        WHERE statement_id = ?
    `).all(statementId).map(row => row.id);

    const deleteReceipt = db.prepare(`
        DELETE FROM receipts
        WHERE transaction_id = ?
    `);

    const deleteTransaction = db.prepare(`
        DELETE FROM bank_transactions
        WHERE id = ?
    `);

    const deleteStatementRow = db.prepare(`
        DELETE FROM statements
        WHERE id = ?
    `);

    const transaction = db.transaction(() => {
        transactionIds.forEach(id => {
            deleteReceipt.run(id);
            deleteTransaction.run(id);
        });

        deleteStatementRow.run(statementId);
    });

    transaction();
    return true;
}

function createTransaction(bankAccountId, statementId, dateOperation, label, amount, type, pdfSource, category = '') {
    const finalCategory = category || findCategoryForLabel(label);
    const searchText = buildTransactionSearchText({
        label,
        category: finalCategory,
        notes: '',
        pdf_source: pdfSource,
        amount
    });

    return db.prepare(`
        INSERT INTO bank_transactions(
            bank_account_id,
            statement_id,
            date_operation,
            label,
            amount,
            type,
            pdf_source,
            status,
            category,
            search_text
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'missing', ?, ?)
    `).run(bankAccountId, statementId, dateOperation, label, amount, type, pdfSource, finalCategory, searchText);
}

function buildTransactionWhere(filters = {}) {
    const where = ['t.bank_account_id = ?'];
    const params = [filters.bankAccountId];

    if (filters.search) {
        where.push(`(
            COALESCE(t.search_text, '') LIKE ?
            OR LOWER(COALESCE(t.label, '')) LIKE ?
            OR LOWER(COALESCE(s.filename, '')) LIKE ?
            OR REPLACE(REPLACE(CAST(t.amount AS TEXT), '.', ','), '-', '') LIKE ?
            OR CAST(t.amount AS TEXT) LIKE ?
        )`);

        const searchText = normalizeSearchText(filters.search);
        const rawSearchText = String(filters.search).toLowerCase().trim();
        const amountText = rawSearchText.replace(/\s/g, '').replace('€', '').replace('-', '');
        const q = `%${searchText}%`;
        const qRaw = `%${rawSearchText}%`;
        const qAmount = `%${amountText.replace(',', '.')}%`;
        const qAmountComma = `%${amountText}%`;
        params.push(q, qRaw, qRaw, qAmountComma, qAmount);
    }

    if (filters.status && filters.status !== 'all') {
        where.push('t.status = ?');
        params.push(filters.status);
    }

    if (filters.year && filters.year !== 'all') {
        where.push('s.statement_year = ?');
        params.push(filters.year);
    }

    if (filters.month && filters.month !== 'all') {
        where.push('s.statement_month = ?');
        params.push(filters.month);
    }

    if (filters.statementId && filters.statementId !== 'all') {
        where.push('t.statement_id = ?');
        params.push(Number(filters.statementId));
    }

    return {
        whereSql: where.join(' AND '),
        params
    };
}

function getTransactions(bankAccountId, filters = {}) {
    const built = buildTransactionWhere({
        ...filters,
        bankAccountId
    });

    return db.prepare(`
        SELECT
            t.*,
            s.filename AS statement_filename,
            s.statement_year,
            s.statement_month,
            COUNT(r.id) AS receipts_count
        FROM bank_transactions t
        LEFT JOIN statements s ON s.id = t.statement_id
        LEFT JOIN receipts r ON r.transaction_id = t.id
        WHERE ${built.whereSql}
        GROUP BY t.id
        ORDER BY
            COALESCE(s.statement_year, '') DESC,
            COALESCE(s.statement_month, '') DESC,
            t.id DESC
    `).all(...built.params);
}

function getTransaction(transactionId) {
    return db.prepare(`
        SELECT
            t.*,
            s.filename AS statement_filename,
            s.statement_year,
            s.statement_month,
            COUNT(r.id) AS receipts_count
        FROM bank_transactions t
        LEFT JOIN statements s ON s.id = t.statement_id
        LEFT JOIN receipts r ON r.transaction_id = t.id
        WHERE t.id = ?
        GROUP BY t.id
    `).get(transactionId);
}

function updateTransactionStatus(transactionId, status) {
    return db.prepare(`
        UPDATE bank_transactions
        SET status = ?
        WHERE id = ?
    `).run(status, transactionId);
}

function updateTransactionDetails(transactionId, category, notes) {
    const result = db.prepare(`
        UPDATE bank_transactions
        SET category = ?, notes = ?
        WHERE id = ?
    `).run(category, notes, transactionId);

    const row = db.prepare(`
        SELECT id, label, category, notes, pdf_source, amount
        FROM bank_transactions
        WHERE id = ?
    `).get(transactionId);

    if (row) {
        db.prepare(`
            UPDATE bank_transactions
            SET search_text = ?
            WHERE id = ?
        `).run(buildTransactionSearchText(row), transactionId);
    }

    return result;
}

function createReceipt(transactionId, filename, filepath, originalFilepath = null) {
    const result = db.prepare(`
        INSERT INTO receipts(transaction_id, filename, filepath, original_filepath)
        VALUES(?, ?, ?, ?)
    `).run(transactionId, filename, filepath, originalFilepath);

    db.prepare(`
        UPDATE bank_transactions
        SET status = 'attached'
        WHERE id = ?
        AND status = 'missing'
    `).run(transactionId);

    return result;
}

function getReceipt(receiptId) {
    return db.prepare(`
        SELECT *
        FROM receipts
        WHERE id = ?
    `).get(receiptId);
}

function getReceipts(transactionId) {
    return db.prepare(`
        SELECT *
        FROM receipts
        WHERE transaction_id = ?
        ORDER BY added_at DESC
    `).all(transactionId);
}

function deleteReceipt(receiptId) {
    const receipt = getReceipt(receiptId);
    if (!receipt) return false;

    db.prepare(`
        DELETE FROM receipts
        WHERE id = ?
    `).run(receiptId);

    const remaining = db.prepare(`
        SELECT COUNT(*) AS count
        FROM receipts
        WHERE transaction_id = ?
    `).get(receipt.transaction_id).count;

    if (remaining === 0) {
        db.prepare(`
            UPDATE bank_transactions
            SET status = 'missing'
            WHERE id = ?
            AND status = 'attached'
        `).run(receipt.transaction_id);
    }

    return true;
}

function getTransactionSummary(bankAccountId, filters = {}) {
    const built = buildTransactionWhere({
        ...filters,
        bankAccountId
    });

    const row = db.prepare(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN t.status = 'missing' THEN 1 ELSE 0 END) AS missing,
            SUM(CASE WHEN t.status IN ('attached', 'verified') THEN 1 ELSE 0 END) AS attached,
            COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) AS credit,
            COALESCE(SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END), 0) AS debit
        FROM bank_transactions t
        LEFT JOIN statements s ON s.id = t.statement_id
        WHERE ${built.whereSql}
    `).get(...built.params);

    return {
        total: row.total || 0,
        missing: row.missing || 0,
        attached: row.attached || 0,
        credit: row.credit || 0,
        debit: row.debit || 0
    };
}

function getAvailablePeriods(bankAccountId) {
    return db.prepare(`
        SELECT DISTINCT statement_year AS year, statement_month AS month
        FROM statements
        WHERE bank_account_id = ?
        AND statement_year IS NOT NULL
        AND statement_month IS NOT NULL
        ORDER BY statement_year DESC, statement_month DESC
    `).all(bankAccountId);
}

function getDashboardInsights(bankAccountId, filters = {}) {
    const built = buildTransactionWhere({
        ...filters,
        bankAccountId
    });

    const categoryRows = db.prepare(`
        SELECT
            COALESCE(NULLIF(t.category, ''), 'Non catégorisé') AS category,
            COUNT(*) AS count,
            COALESCE(SUM(t.amount), 0) AS total,
            COALESCE(SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END), 0) AS debit_total,
            COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) AS credit_total
        FROM bank_transactions t
        LEFT JOIN statements s ON s.id = t.statement_id
        WHERE ${built.whereSql}
        GROUP BY COALESCE(NULLIF(t.category, ''), 'Non catégorisé')
        ORDER BY debit_total DESC, credit_total DESC
        LIMIT 8
    `).all(...built.params);

    const supplierRows = db.prepare(`
        SELECT
            t.label AS label,
            COUNT(*) AS count,
            COALESCE(SUM(ABS(t.amount)), 0) AS total
        FROM bank_transactions t
        LEFT JOIN statements s ON s.id = t.statement_id
        WHERE ${built.whereSql}
        AND t.amount < 0
        GROUP BY t.label
        ORDER BY total DESC
        LIMIT 8
    `).all(...built.params);

    const missingRows = db.prepare(`
        SELECT
            COUNT(*) AS count,
            COALESCE(SUM(ABS(t.amount)), 0) AS total
        FROM bank_transactions t
        LEFT JOIN statements s ON s.id = t.statement_id
        WHERE ${built.whereSql}
        AND t.status = 'missing'
    `).get(...built.params);

    return {
        categories: categoryRows,
        suppliers: supplierRows,
        missing: missingRows || { count: 0, total: 0 }
    };
}

function findReceiptMatches(bankAccountId, receiptFilename, limit = 5) {
    const normalized = normalizeSearchText(receiptFilename);
    const tokens = normalized
        .split(' ')
        .map(token => token.trim())
        .filter(token => token.length >= 3);

    if (tokens.length === 0) return [];

    const rows = db.prepare(`
        SELECT
            t.*,
            s.filename AS statement_filename,
            COUNT(r.id) AS receipts_count
        FROM bank_transactions t
        LEFT JOIN statements s ON s.id = t.statement_id
        LEFT JOIN receipts r ON r.transaction_id = t.id
        WHERE t.bank_account_id = ?
        AND t.status IN ('missing', 'review')
        GROUP BY t.id
        ORDER BY ABS(t.amount) DESC
        LIMIT 300
    `).all(bankAccountId);

    const scored = rows.map(row => {
        const haystack = normalizeSearchText([row.label, row.category, row.notes].join(' '));
        let score = 0;

        tokens.forEach(token => {
            if (haystack.includes(token)) score += token.length >= 5 ? 3 : 1;
        });

        const invoiceRefs = normalized.match(/f\d{2}[- ]?\d{3,}|fa\d{3,}|\d{4,}/gi) || [];
        invoiceRefs.forEach(ref => {
            const cleanRef = normalizeSearchText(ref);
            if (cleanRef && haystack.includes(cleanRef)) score += 8;
        });

        return { ...row, match_score: score };
    }).filter(row => row.match_score > 0);

    scored.sort((a, b) => b.match_score - a.match_score);
    return scored.slice(0, limit);
}

function getCategoryRules() {
    return db.prepare(`
        SELECT *
        FROM category_rules
        ORDER BY keyword
    `).all();
}

module.exports = {
    db,
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
    getCategoryRules,

    createReceipt,
    getReceipt,
    getReceipts,
    deleteReceipt
};
