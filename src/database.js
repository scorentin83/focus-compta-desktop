const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'FocusComptaData');
const STATEMENTS_DIR = path.join(DATA_DIR, 'Releves');
const RECEIPTS_DIR = path.join(DATA_DIR, 'Justificatifs');
const RIB_DIR = path.join(DATA_DIR, 'RIB');
const BACKUPS_DIR = path.join(PROJECT_ROOT, 'FocusComptaBackups');
const LEGACY_DB_PATH = path.join(PROJECT_ROOT, 'ThetaCompta.db');
const DB_PATH = path.join(DATA_DIR, 'FocusCompta.db');

[DATA_DIR, STATEMENTS_DIR, RECEIPTS_DIR, RIB_DIR, BACKUPS_DIR].forEach(dir => {
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
    bic TEXT,
    account_number TEXT,
    rib_path TEXT,
    rib_original_path TEXT,
    notes TEXT,
    statement_identifiers TEXT,
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
    statement_identifiers TEXT,
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

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    original_filepath TEXT,
    detected_amount REAL,
    detected_reference TEXT,
    detected_supplier TEXT,
    linked_transaction_id INTEGER,
    status TEXT DEFAULT 'unmatched',
    doc_type TEXT DEFAULT 'facture',
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    FOREIGN KEY(linked_transaction_id) REFERENCES bank_transactions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS third_parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'fournisseur',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, name),
    FOREIGN KEY(company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS cash_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    filename TEXT,
    filepath TEXT,
    original_filepath TEXT,
    sheet_date TEXT,
    period_year TEXT,
    period_month TEXT,
    invoiced_ca REAL DEFAULT 0,
    cash_total REAL DEFAULT 0,
    card_total REAL DEFAULT 0,
    check_total REAL DEFAULT 0,
    transfer_total REAL DEFAULT 0,
    total_rows INTEGER DEFAULT 0,
    raw_json TEXT,
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS automation_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    target TEXT DEFAULT 'account_name',
    keyword TEXT NOT NULL,
    category TEXT,
    status TEXT,
    third_party_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
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
ensureColumn('statements', 'old_balance', 'REAL');
ensureColumn('statements', 'new_balance', 'REAL');
ensureColumn('statements', 'balance_type', 'TEXT');
ensureColumn('statements', 'report_json', 'TEXT');
ensureColumn('bank_transactions', 'statement_id', 'INTEGER');
ensureColumn('bank_transactions', 'status', "TEXT DEFAULT 'missing'");
ensureColumn('bank_transactions', 'category', 'TEXT');
ensureColumn('bank_transactions', 'notes', 'TEXT');
ensureColumn('bank_transactions', 'third_party_id', 'INTEGER');
ensureColumn('bank_transactions', 'third_party_name', 'TEXT');
ensureColumn('bank_transactions', 'search_text', 'TEXT');
ensureColumn('receipts', 'original_filepath', 'TEXT');
ensureColumn('documents', 'doc_type', "TEXT DEFAULT 'facture'");
ensureColumn('documents', 'detected_date', 'TEXT');
ensureColumn('documents', 'source_type', "TEXT DEFAULT 'document'");
ensureColumn('documents', 'source_receipt_id', 'INTEGER');
ensureColumn('documents', 'deleted_at', 'TEXT');
ensureColumn('documents', 'folder_path', 'TEXT');
ensureColumn('documents', 'file_hash', 'TEXT');
ensureColumn('documents', 'favorite', "INTEGER DEFAULT 0");
ensureColumn('documents', 'tags', 'TEXT');
ensureColumn('documents', 'important', "INTEGER DEFAULT 0");
ensureColumn('documents', 'third_party_name', 'TEXT');
ensureColumn('documents', 'history_json', 'TEXT');
ensureColumn('documents', 'ocr_text', 'TEXT');
ensureColumn('cash_sheets', 'gross_ca_ht', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'discount_ht', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'net_ca_ht', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'net_ca_ttc', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'tva_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'tiers_payant', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'acompte_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'p3x_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'p4x_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'p10x_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'paylater_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'ecart_total', 'REAL DEFAULT 0');
ensureColumn('bank_accounts', 'bic', 'TEXT');
ensureColumn('bank_accounts', 'account_number', 'TEXT');
ensureColumn('bank_accounts', 'rib_path', 'TEXT');
ensureColumn('bank_accounts', 'rib_original_path', 'TEXT');
ensureColumn('bank_accounts', 'notes', 'TEXT');
ensureColumn('bank_accounts', 'statement_identifiers', 'TEXT');
ensureColumn('documents', 'source_type', "TEXT DEFAULT 'document'");
ensureColumn('documents', 'source_receipt_id', 'INTEGER');
ensureColumn('documents', 'deleted_at', 'TEXT');
ensureColumn('documents', 'folder_path', 'TEXT');
ensureColumn('documents', 'file_hash', 'TEXT');
ensureColumn('documents', 'favorite', "INTEGER DEFAULT 0");
ensureColumn('documents', 'tags', 'TEXT');
ensureColumn('documents', 'important', "INTEGER DEFAULT 0");
ensureColumn('documents', 'third_party_name', 'TEXT');
ensureColumn('documents', 'history_json', 'TEXT');
ensureColumn('documents', 'ocr_text', 'TEXT');
ensureColumn('cash_sheets', 'gross_ca_ht', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'discount_ht', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'net_ca_ht', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'net_ca_ttc', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'tva_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'tiers_payant', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'acompte_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'p3x_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'p4x_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'p10x_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'paylater_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'ecart_total', 'REAL DEFAULT 0');
ensureColumn('documents', 'detected_date', 'TEXT');


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

function createBankAccount(dataOrCompanyId, bankNameArg = '', accountNameArg = '', ibanArg = '') {
    const data = typeof dataOrCompanyId === 'object'
        ? dataOrCompanyId
        : {
            companyId: dataOrCompanyId,
            bankName: bankNameArg,
            accountName: accountNameArg,
            iban: ibanArg
        };

    return db.prepare(`
        INSERT INTO bank_accounts(
            company_id,
            bank_name,
            account_name,
            iban,
            bic,
            account_number,
            rib_path,
            rib_original_path,
            notes
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        data.companyId,
        data.bankName,
        data.accountName || '',
        data.iban || '',
        data.bic || '',
        data.accountNumber || data.account_number || '',
        data.ribPath || data.rib_path || '',
        data.ribOriginalPath || data.rib_original_path || '',
        data.notes || '',
        data.statementIdentifiers || ''
    );
}

function updateBankAccount(data) {
    return db.prepare(`
        UPDATE bank_accounts
        SET bank_name = ?,
            account_name = ?,
            iban = ?,
            bic = ?,
            account_number = ?,
            rib_path = COALESCE(?, rib_path),
            rib_original_path = COALESCE(?, rib_original_path),
            notes = ?,
            statement_identifiers = ?
        WHERE id = ?
    `).run(
        data.bankName,
        data.accountName || '',
        data.iban || '',
        data.bic || '',
        data.accountNumber || '',
        data.ribPath || null,
        data.ribOriginalPath || null,
        data.notes || '',
        data.statementIdentifiers || '',
        data.id
    );
}

function deleteBankAccount(bankAccountId) {
    const linked = db.prepare(`
        SELECT COUNT(*) AS count
        FROM statements
        WHERE bank_account_id = ?
    `).get(bankAccountId).count;

    if (linked > 0) {
        return {
            deleted: false,
            message: 'Impossible de supprimer ce compte : des relevés sont déjà liés.'
        };
    }

    db.prepare(`DELETE FROM bank_accounts WHERE id = ?`).run(bankAccountId);

    return {
        deleted: true,
        message: 'Compte bancaire supprimé.'
    };
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


function cleanupOrphanDocumentLinks() {
    db.prepare(`
        UPDATE documents
        SET linked_transaction_id = NULL,
            status = 'unmatched'
        WHERE linked_transaction_id IS NOT NULL
        AND linked_transaction_id NOT IN (SELECT id FROM bank_transactions)
    `).run();

    db.prepare(`
        UPDATE documents
        SET status = 'unmatched'
        WHERE status = 'matched'
        AND linked_transaction_id IS NULL
        AND COALESCE(doc_type, 'facture') NOT IN ('releve', 'rib', 'contrat')
    `).run();

    return true;
}

function deleteStatement(statementId) {
    const transactionIds = db.prepare(`
        SELECT id
        FROM bank_transactions
        WHERE statement_id = ?
    `).all(statementId).map(row => row.id);

    const unlinkDocuments = db.prepare(`
        UPDATE documents
        SET linked_transaction_id = NULL,
            status = 'unmatched'
        WHERE linked_transaction_id = ?
    `);

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
            unlinkDocuments.run(id);
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

    let thirdPartyId = null;
    let thirdPartyName = '';

    try {
        const bankAccount = db.prepare(`SELECT * FROM bank_accounts WHERE id = ?`).get(bankAccountId);
        if (bankAccount) {
            const inferred = inferThirdPartyFromLabel(label);
            const third = getOrCreateThirdParty(bankAccount.company_id, inferred.name, inferred.type);
            if (third) {
                thirdPartyId = third.id;
                thirdPartyName = third.name;
            }
        }
    } catch (error) {}

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
            notes,
            search_text,
            third_party_id,
            third_party_name
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'missing', ?, '', ?, ?, ?)
    `).run(
        bankAccountId,
        statementId,
        dateOperation,
        label,
        amount,
        type,
        pdfSource,
        finalCategory,
        searchText,
        thirdPartyId,
        thirdPartyName
    );
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
        SET category = ?, notes = ?,
            statement_identifiers = ?
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
        SET status = 'verified'
        WHERE id = ?
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

function updateStatementFinancials(statementId, data = {}) {
    return db.prepare(`
        UPDATE statements
        SET old_balance = ?,
            new_balance = ?,
            balance_type = ?,
            report_json = ?
        WHERE id = ?
    `).run(
        data.oldBalance ?? null,
        data.newBalance ?? null,
        data.balanceType || '',
        data.reportJson || '',
        statementId
    );
}

function addCategoryRule(keyword, category) {
    return db.prepare(`
        INSERT INTO category_rules(keyword, category)
        VALUES(?, ?)
        ON CONFLICT(keyword) DO UPDATE SET category = excluded.category
    `).run(keyword, category);
}

function updateTransactionsBulk(ids = [], data = {}) {
    const cleanIds = ids.map(id => Number(id)).filter(Boolean);
    if (cleanIds.length === 0) return { updated: 0 };

    const tx = db.transaction(() => {
        cleanIds.forEach(id => {
            if (data.status) {
                db.prepare(`UPDATE bank_transactions SET status = ? WHERE id = ?`).run(data.status, id);
            }
            if (data.category !== undefined || data.notes !== undefined) {
                const row = db.prepare(`SELECT * FROM bank_transactions WHERE id = ?`).get(id);
                if (row) {
                    const category = data.category !== undefined ? data.category : row.category;
                    const notes = data.notes !== undefined ? data.notes : row.notes;
                    db.prepare(`UPDATE bank_transactions SET category = ?, notes = ?, search_text = ? WHERE id = ?`).run(
                        category || '', notes || '', buildTransactionSearchText({...row, category, notes}), id
                    );
                }
            }
        });
    });
    tx();
    return { updated: cleanIds.length };
}


function createDocumentForReceipt(data) {
    const existing = db.prepare(`
        SELECT id
        FROM documents
        WHERE source_receipt_id = ?
        OR filepath = ?
        LIMIT 1
    `).get(data.receiptId || -1, data.filepath);

    if (existing) {
        db.prepare(`
            UPDATE documents
            SET linked_transaction_id = ?,
                status = 'matched',
                company_id = COALESCE(company_id, ?),
                source_type = 'receipt',
                source_receipt_id = COALESCE(source_receipt_id, ?),
                detected_amount = COALESCE(detected_amount, ?),
                detected_reference = COALESCE(NULLIF(detected_reference, ''), ?),
                detected_supplier = COALESCE(NULLIF(detected_supplier, ''), ?),
                detected_date = COALESCE(NULLIF(detected_date, ''), ?),
                folder_path = COALESCE(NULLIF(folder_path, ''), ?),
                doc_type = COALESCE(NULLIF(doc_type, ''), 'facture')
            WHERE id = ?
        `).run(
            data.transactionId,
            data.companyId || null,
            data.receiptId || null,
            data.detectedAmount ?? null,
            data.detectedReference || '',
            data.detectedSupplier || '',
            data.detectedDate || '',
            data.folderPath || '',
            existing.id
        );
        return { lastInsertRowid: existing.id, changes: 1 };
    }

    return db.prepare(`
        INSERT INTO documents(
            company_id,
            filename,
            filepath,
            original_filepath,
            detected_amount,
            detected_reference,
            detected_supplier,
            detected_date,
            folder_path,
            doc_type,
            linked_transaction_id,
            status,
            source_type,
            source_receipt_id
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'facture', ?, 'matched', 'receipt', ?)
    `).run(
        data.companyId || null,
        data.filename,
        data.filepath,
        data.originalFilepath || null,
        data.detectedAmount ?? null,
        data.detectedReference || '',
        data.detectedSupplier || '',
        data.detectedDate || '',
        data.folderPath || '',
        data.transactionId,
        data.receiptId || null
    );
}

function searchTransactionsForDocument(companyId, query = '', limit = 25) {
    const q = normalizeSearchText(query);
    const tokens = q.split(' ').filter(t => t.length >= 2).slice(0, 6);

    const where = [`ba.company_id = ?`];
    const params = [companyId];

    if (tokens.length) {
        where.push(tokens.map(() => `t.search_text LIKE ?`).join(' AND '));
        tokens.forEach(token => params.push(`%${token}%`));
    }

    params.push(Math.max(1, Math.min(Number(limit) || 25, 100)));

    return db.prepare(`
        SELECT
            t.*,
            s.filename AS statement_filename,
            s.statement_year,
            s.statement_month,
            COUNT(r.id) AS receipts_count
        FROM bank_transactions t
        LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
        LEFT JOIN statements s ON s.id = t.statement_id
        LEFT JOIN receipts r ON r.transaction_id = t.id
        WHERE ${where.join(' AND ')}
        GROUP BY t.id
        ORDER BY
            CASE WHEN COUNT(r.id) = 0 THEN 0 ELSE 1 END,
            ABS(t.amount) DESC,
            t.id DESC
        LIMIT ?
    `).all(...params);
}


function findExistingDocumentByHashOrName(companyId = null, fileHash = '', filename = '') {
    const cleanName = String(filename || '').trim().toLowerCase();

    if (fileHash) {
        const byHash = db.prepare(`
            SELECT *
            FROM documents
            WHERE deleted_at IS NULL
            AND file_hash = ?
            AND (? IS NULL OR company_id = ? OR company_id IS NULL)
            LIMIT 1
        `).get(fileHash, companyId, companyId);
        if (byHash) return byHash;
    }

    if (cleanName) {
        return db.prepare(`
            SELECT *
            FROM documents
            WHERE deleted_at IS NULL
            AND LOWER(filename) = ?
            AND (? IS NULL OR company_id = ? OR company_id IS NULL)
            LIMIT 1
        `).get(cleanName, companyId, companyId);
    }

    return null;
}

function refreshTransactionStatusFromDocuments(transactionId) {
    if (!transactionId) return false;

    const linkedDocs = db.prepare(`
        SELECT COUNT(*) AS count
        FROM documents
        WHERE deleted_at IS NULL
        AND linked_transaction_id = ?
    `).get(transactionId).count || 0;

    const linkedReceipts = db.prepare(`
        SELECT COUNT(*) AS count
        FROM receipts
        WHERE transaction_id = ?
    `).get(transactionId).count || 0;

    if (linkedDocs === 0 && linkedReceipts === 0) {
        db.prepare(`
            UPDATE bank_transactions
            SET status = 'missing'
            WHERE id = ?
            AND status != 'verified'
        `).run(transactionId);
    }

    return true;
}

function createDocument(data) {
    const duplicate = findExistingDocumentByHashOrName(
        data.companyId || null,
        data.fileHash || data.file_hash || '',
        data.filename || ''
    );

    if (duplicate && data.allowDuplicate !== true) {
        return {
            lastInsertRowid: duplicate.id,
            changes: 0,
            duplicate: true,
            existing: duplicate
        };
    }

    return db.prepare(`
        INSERT INTO documents(
            company_id,
            filename,
            filepath,
            original_filepath,
            detected_amount,
            detected_reference,
            detected_supplier,
            detected_date,
            folder_path,
            doc_type,
            status,
            file_hash
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        data.companyId || null,
        data.filename,
        data.filepath,
        data.originalFilepath || null,
        data.detectedAmount ?? null,
        data.detectedReference || '',
        data.detectedSupplier || '',
        data.detectedDate || '',
        data.folderPath || '',
        data.docType || data.doc_type || 'facture',
        data.status || 'unmatched',
        data.fileHash || data.file_hash || ''
    );
}

function getDocuments(companyId = null, filters = {}) {
    cleanupOrphanDocumentLinks();

    const where = [];
    const params = [];

    if (companyId) {
        where.push('d.company_id = ?');
        params.push(companyId);
    }

    if (filters.includeDeleted === true || filters.status === 'trash') {
        where.push('d.deleted_at IS NOT NULL');
    } else {
        where.push('d.deleted_at IS NULL');
    }

    if (filters.status && !['all', 'trash'].includes(filters.status)) {
        where.push('d.status = ?');
        params.push(filters.status);
    }

    if ((filters.type || filters.docType) && (filters.type || filters.docType) !== 'all') {
        where.push(`COALESCE(d.doc_type, 'facture') = ?`);
        params.push(filters.type || filters.docType);
    }

    if (filters.search) {
        where.push(`(
            LOWER(d.filename) LIKE ?
            OR LOWER(COALESCE(d.detected_reference,'')) LIKE ?
            OR LOWER(COALESCE(d.detected_supplier,'')) LIKE ?
            OR LOWER(COALESCE(d.detected_date,'')) LIKE ?
            OR LOWER(COALESCE(c.name,'')) LIKE ?
        )`);
        const q = `%${String(filters.search).toLowerCase()}%`;
        params.push(q, q, q, q, q);
    }

    const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';

    return db.prepare(`
        SELECT
            d.*,
            c.name AS company_name,
            t.date_operation,
            t.label AS transaction_label,
            t.amount AS transaction_amount
        FROM documents d
        LEFT JOIN companies c ON c.id = d.company_id
        LEFT JOIN bank_transactions t ON t.id = d.linked_transaction_id
        ${sqlWhere}
        ORDER BY
            CASE WHEN d.status = 'unmatched' THEN 0 ELSE 1 END,
            COALESCE(d.detected_date, d.added_at) DESC,
            d.added_at DESC
    `).all(...params);
}

function getDocument(documentId) {
    return db.prepare(`SELECT * FROM documents WHERE id = ?`).get(documentId);
}

function deleteDocument(documentId) {
    return moveDocumentToTrash(documentId);
}

function linkDocumentToTransaction(documentId, transactionId) {
    const doc = getDocument(documentId);
    const tx = getTransaction(transactionId);
    if (!doc || !tx) return { ok: false };

    const dbTx = db.transaction(() => {
        db.prepare(`UPDATE documents SET linked_transaction_id = ?, status = 'matched' WHERE id = ?`).run(transactionId, documentId);

        const existingReceipt = db.prepare(`
            SELECT id
            FROM receipts
            WHERE transaction_id = ?
            AND filepath = ?
            LIMIT 1
        `).get(transactionId, doc.filepath);

        if (!existingReceipt) {
            db.prepare(`INSERT INTO receipts(transaction_id, filename, filepath, original_filepath) VALUES(?, ?, ?, ?)`).run(
                transactionId, doc.filename, doc.filepath, doc.original_filepath || doc.filepath
            );
        }

        db.prepare(`UPDATE bank_transactions SET status = 'verified' WHERE id = ?`).run(transactionId);
    });
    dbTx();
    return { ok: true };
}

function findDocumentMatches(companyId, documentId, limit = 8) {
    const doc = getDocument(documentId);
    if (!doc) return [];
    const tokens = normalizeSearchText([doc.filename, doc.detected_reference, doc.detected_supplier].join(' '))
        .split(' ').filter(t => t.length >= 3);

    const rows = db.prepare(`
        SELECT t.*, s.filename AS statement_filename, ba.company_id, COUNT(r.id) AS receipts_count
        FROM bank_transactions t
        LEFT JOIN statements s ON s.id = t.statement_id
        LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
        LEFT JOIN receipts r ON r.transaction_id = t.id
        WHERE ba.company_id = ?
        GROUP BY t.id
        ORDER BY t.id DESC
        LIMIT 1000
    `).all(companyId);

    const amount = Number(doc.detected_amount || 0);
    const scored = rows.map(row => {
        const haystack = normalizeSearchText([row.label, row.category, row.notes].join(' '));
        let score = 0;
        tokens.forEach(token => { if (haystack.includes(token)) score += token.length >= 5 ? 8 : 3; });
        if (amount > 0 && Math.abs(Math.abs(Number(row.amount)) - amount) < 0.01) score += 50;
        if ((row.receipts_count || 0) === 0) score += 10;
        return { ...row, match_score: score };
    }).filter(r => r.match_score > 0);
    scored.sort((a,b)=>b.match_score-a.match_score);
    return scored.slice(0, limit);
}


function inferThirdPartyFromLabel(label) {
    const value = String(label || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();

    const rules = [
        ['ELECTRICITE DE FRANCE', 'EDF', 'fournisseur'],
        ['EDF', 'EDF', 'fournisseur'],
        ['URSSAF', 'URSSAF', 'organisme'],
        ['CREDIT AGRICOLE', 'Crédit Agricole', 'banque'],
        ['CRCAM', 'Crédit Agricole', 'banque'],
        ['GRANDVISION', 'GrandVision', 'fournisseur'],
        ['MULTITEK', 'Multitek Services', 'fournisseur'],
        ['EURO CLIMAT', 'Euro Climat', 'fournisseur'],
        ['ORANGE', 'Orange', 'fournisseur'],
        ['MALAKOFF', 'Malakoff Humanis', 'organisme'],
        ['DGFIP', 'DGFIP', 'organisme'],
        ['CPAM', 'CPAM', 'organisme'],
        ['ALMERYS', 'Almerys', 'organisme'],
        ['VIAMEDIS', 'Viamedis', 'organisme'],
        ['KORELIO', 'Korelio', 'organisme'],
        ['ALLIANZ', 'Allianz', 'assurance'],
        ['AUTOROUTES', 'Autoroutes du Sud', 'fournisseur'],
        ['JAYET', 'Jayet', 'fournisseur']
    ];

    const found = rules.find(([keyword]) => value.includes(keyword));
    if (found) return { name: found[1], type: found[2] };

    let cleaned = String(label || '')
        .replace(/^(PRLV|VIREMENT|VIR INST|VIREMENT WEB|REMISE|COM CARTE|ECH PRET|REAL PRET)\s+/i, '')
        .replace(/\b\d{2}[./]\d{2}(?:[./]\d{2,4})?\b/g, '')
        .replace(/\b\d[\d\s,.]*\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    cleaned = cleaned.split(/\s+(FACTURE|REF|RUM|CORE|B2B|TP-|VIR\/)/i)[0].trim();

    return {
        name: cleaned ? cleaned.slice(0, 80) : 'Non identifié',
        type: 'autre'
    };
}

function getOrCreateThirdParty(companyId, name, type = 'autre') {
    if (!companyId || !name) return null;

    const existing = db.prepare(`
        SELECT *
        FROM third_parties
        WHERE company_id = ?
        AND LOWER(name) = LOWER(?)
    `).get(companyId, name);

    if (existing) return existing;

    const result = db.prepare(`
        INSERT INTO third_parties(company_id, name, type)
        VALUES(?, ?, ?)
    `).run(companyId, name, type);

    return db.prepare(`SELECT * FROM third_parties WHERE id = ?`).get(result.lastInsertRowid);
}

function backfillThirdParties(companyId = null) {
    const where = companyId ? 'WHERE ba.company_id = ?' : '';
    const params = companyId ? [companyId] : [];

    const rows = db.prepare(`
        SELECT t.id, t.label, ba.company_id
        FROM bank_transactions t
        LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
        ${where}
        AND (t.third_party_name IS NULL OR t.third_party_name = '')
    `.replace('WHERE\n        AND', 'WHERE')).all(...params);

    const update = db.prepare(`
        UPDATE bank_transactions
        SET third_party_id = ?, third_party_name = ?
        WHERE id = ?
    `);

    rows.forEach(row => {
        const inferred = inferThirdPartyFromLabel(row.label);
        const third = getOrCreateThirdParty(row.company_id, inferred.name, inferred.type);
        if (third) update.run(third.id, third.name, row.id);
    });

    return rows.length;
}

function getThirdParties(companyId = null) {
    const where = companyId ? 'WHERE tp.company_id = ?' : '';
    const params = companyId ? [companyId] : [];

    return db.prepare(`
        SELECT
            tp.*,
            COUNT(t.id) AS operations_count,
            COALESCE(SUM(t.amount), 0) AS balance,
            COALESCE(SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END), 0) AS debit_total,
            COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) AS credit_total
        FROM third_parties tp
        LEFT JOIN bank_transactions t ON t.third_party_id = tp.id
        ${where}
        GROUP BY tp.id
        ORDER BY debit_total DESC, credit_total DESC, tp.name
    `).all(...params);
}

function updateTransactionThirdParty(transactionId, thirdPartyName, type = 'autre') {
    const tx = getTransaction(transactionId);
    if (!tx) return false;

    const bankAccount = db.prepare(`SELECT * FROM bank_accounts WHERE id = ?`).get(tx.bank_account_id);
    if (!bankAccount) return false;

    const third = getOrCreateThirdParty(bankAccount.company_id, thirdPartyName, type);

    db.prepare(`
        UPDATE bank_transactions
        SET third_party_id = ?, third_party_name = ?
        WHERE id = ?
    `).run(third.id, third.name, transactionId);

    return true;
}

function getDocumentsDashboard(companyId = null) {
    const where = companyId ? 'WHERE d.company_id = ?' : '';
    const params = companyId ? [companyId] : [];
    return db.prepare(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN d.status = 'matched' THEN 1 ELSE 0 END) AS matched,
            SUM(CASE WHEN d.status != 'matched' THEN 1 ELSE 0 END) AS unmatched,
            SUM(CASE WHEN d.doc_type = 'releve' THEN 1 ELSE 0 END) AS statements,
            SUM(CASE WHEN d.doc_type = 'facture' THEN 1 ELSE 0 END) AS invoices
        FROM documents d
        ${where}
    `).get(...params);
}



function normalizeThirdPartyName(name) {
    return String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\b(SAS|SARL|SA|EURL|S\.A\.S\.|S\.A\.R\.L\.)\b/g, '')
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getCanonicalThirdPartyName(name) {
    const normalized = normalizeThirdPartyName(name);
    const rules = [
        [/COFIDIS/, 'Cofidis'],
        [/CREDIT AGRICOLE|CRCAM/, 'Crédit Agricole'],
        [/MULTITEK/, 'Multitek Services'],
        [/EURO CLIMAT/, 'Euro Climat'],
        [/EDF|ELECTRICITE DE FRANCE/, 'EDF'],
        [/URSSAF/, 'URSSAF'],
        [/DGFIP/, 'DGFIP'],
        [/ALMERYS/, 'Almerys'],
        [/VIAMEDIS/, 'Viamedis'],
        [/GRANDVISION/, 'GrandVision']
    ];
    const found = rules.find(([pattern]) => pattern.test(normalized));
    return found ? found[1] : String(name || '').trim().slice(0, 80);
}

function cleanupThirdParties(companyId = null) {
    const where = companyId ? 'WHERE company_id = ?' : '';
    const params = companyId ? [companyId] : [];
    const rows = db.prepare(`SELECT * FROM third_parties ${where}`).all(...params);
    const groups = new Map();

    rows.forEach(row => {
        const canonical = getCanonicalThirdPartyName(row.name);
        const key = `${row.company_id || 'global'}::${normalizeThirdPartyName(canonical)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ ...row, canonical });
    });

    const mergeTx = db.transaction(() => {
        groups.forEach(items => {
            if (items.length === 0) return;
            const keeper = items[0];
            const canonical = keeper.canonical || keeper.name;
            db.prepare(`UPDATE third_parties SET name = ? WHERE id = ?`).run(canonical, keeper.id);

            items.slice(1).forEach(duplicate => {
                db.prepare(`
                    UPDATE bank_transactions
                    SET third_party_id = ?, third_party_name = ?
                    WHERE third_party_id = ? OR third_party_name = ?
                `).run(keeper.id, canonical, duplicate.id, duplicate.name);
                db.prepare(`DELETE FROM third_parties WHERE id = ?`).run(duplicate.id);
            });

            db.prepare(`
                UPDATE bank_transactions
                SET third_party_id = ?, third_party_name = ?
                WHERE third_party_name IS NOT NULL
                AND third_party_name != ''
                AND REPLACE(UPPER(third_party_name), ' ', '') = REPLACE(UPPER(?), ' ', '')
            `).run(keeper.id, canonical, canonical);
        });
    });

    mergeTx();
    return rows.length;
}

function updateThirdParty(thirdPartyId, name, type = 'autre', notes = '') {
    const current = db.prepare(`SELECT * FROM third_parties WHERE id = ?`).get(thirdPartyId);
    if (!current) return false;

    const canonical = getCanonicalThirdPartyName(name || current.name);
    db.prepare(`
        UPDATE third_parties
        SET name = ?, type = ?, notes = ?
        WHERE id = ?
    `).run(canonical, type || current.type || 'autre', notes || '', thirdPartyId);

    db.prepare(`
        UPDATE bank_transactions
        SET third_party_name = ?
        WHERE third_party_id = ?
    `).run(canonical, thirdPartyId);

    cleanupThirdParties(current.company_id);
    return true;
}

function mergeThirdParties(sourceId, targetId) {
    const source = db.prepare(`SELECT * FROM third_parties WHERE id = ?`).get(sourceId);
    const target = db.prepare(`SELECT * FROM third_parties WHERE id = ?`).get(targetId);
    if (!source || !target || source.id === target.id) return false;

    const mergeTx = db.transaction(() => {
        db.prepare(`
            UPDATE bank_transactions
            SET third_party_id = ?, third_party_name = ?
            WHERE third_party_id = ? OR third_party_name = ?
        `).run(target.id, target.name, source.id, source.name);
        db.prepare(`DELETE FROM third_parties WHERE id = ?`).run(source.id);
    });
    mergeTx();
    return true;
}

function renameDocument(documentId, newFilename) {
    const doc = getDocument(documentId);
    if (!doc || !newFilename) return { ok: false, message: 'Document introuvable' };

    const ext = path.extname(doc.filename);
    let clean = String(newFilename || '').trim();
    if (!path.extname(clean)) clean += ext;

    clean = clean
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._ -]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim();

    const dir = path.dirname(doc.filepath || '');
    let target = doc.filepath ? path.join(dir, clean) : clean;
    let finalPath = target;
    let finalName = path.basename(target);

    try {
        if (doc.filepath && fs.existsSync(doc.filepath)) {
            let count = 1;
            const base = path.basename(clean, path.extname(clean));
            const extension = path.extname(clean);

            while (fs.existsSync(finalPath) && path.resolve(finalPath) !== path.resolve(doc.filepath)) {
                finalPath = path.join(dir, `${base}-${count}${extension}`);
                count += 1;
            }

            if (path.resolve(finalPath) !== path.resolve(doc.filepath)) {
                fs.renameSync(doc.filepath, finalPath);
            }
            finalName = path.basename(finalPath);
        } else {
            // Fichier absent : on renomme quand même l'entrée GED
            finalPath = doc.filepath ? path.join(dir, clean) : clean;
            finalName = path.basename(finalPath);
        }
    } catch (error) {
        // Ne bloque pas l'utilisateur si le fichier physique est verrouillé
        finalPath = doc.filepath || clean;
        finalName = clean;
    }

    db.prepare(`UPDATE documents SET filename = ?, filepath = ? WHERE id = ?`).run(finalName, finalPath, documentId);
    addDocumentHistory(documentId, 'Renommé', finalName);
    db.prepare(`UPDATE receipts SET filename = ?, filepath = ? WHERE filepath = ?`).run(finalName, finalPath, doc.filepath);
    return { ok: true, filename: finalName, filepath: finalPath };
}


function createAutomationRule(data) {
    return db.prepare(`
        INSERT INTO automation_rules(company_id, target, keyword, category, status, third_party_name)
        VALUES(?, ?, ?, ?, ?, ?)
    `).run(data.companyId || null, data.target || 'account_name', data.keyword || '', data.category || '', data.status || '', data.thirdPartyName || '');
}

function getAutomationRules(companyId = null) {
    const where = companyId ? 'WHERE company_id IS NULL OR company_id = ?' : '';
    const params = companyId ? [companyId] : [];
    return db.prepare(`SELECT * FROM automation_rules ${where} ORDER BY created_at DESC`).all(...params);
}

function deleteAutomationRule(ruleId) {
    return db.prepare(`DELETE FROM automation_rules WHERE id = ?`).run(ruleId);
}

function applyAutomationRules(companyId = null) {
    const rules = getAutomationRules(companyId);
    let changed = 0;

    const update = db.prepare(`
        UPDATE bank_transactions
        SET category = COALESCE(NULLIF(?, ''), category),
            status = COALESCE(NULLIF(?, ''), status),
            third_party_name = COALESCE(NULLIF(?, ''), third_party_name)
        WHERE id = ?
    `);

    const rows = db.prepare(`
        SELECT t.id, t.label, ba.account_name, ba.bank_name, ba.company_id
        FROM bank_transactions t
        LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
        ${companyId ? 'WHERE ba.company_id = ?' : ''}
    `).all(...(companyId ? [companyId] : []));

    const applyTx = db.transaction(() => {
        rows.forEach(row => {
            const haystack = `${row.label || ''} ${row.account_name || ''} ${row.bank_name || ''}`.toLowerCase();
            rules.forEach(rule => {
                if (!rule.keyword) return;
                if (haystack.includes(String(rule.keyword).toLowerCase())) {
                    update.run(rule.category || '', rule.status || '', rule.third_party_name || '', row.id);
                    changed += 1;
                }
            });
        });
    });

    applyTx();
    return changed;
}



function moveDocumentToTrash(documentId) {
    const doc = getDocument(documentId);
    if (!doc) return false;

    const linkedTransactionId = doc.linked_transaction_id;

    const tx = db.transaction(() => {
        db.prepare(`
            UPDATE documents
            SET deleted_at = CURRENT_TIMESTAMP,
                status = 'trash',
                linked_transaction_id = NULL
            WHERE id = ?
        `).run(documentId);

        if (linkedTransactionId) {
            db.prepare(`
                DELETE FROM receipts
                WHERE transaction_id = ?
                AND (filepath = ? OR filename = ?)
            `).run(linkedTransactionId, doc.filepath, doc.filename);
        }
    });

    tx();

    if (linkedTransactionId) refreshTransactionStatusFromDocuments(linkedTransactionId);
    addDocumentHistory(documentId, 'Supprimé', 'Déplacé dans la corbeille');
    return true;
}

function restoreDocument(documentId) {
    const doc = getDocument(documentId);
    if (!doc) return false;
    db.prepare(`UPDATE documents SET deleted_at = NULL, status = CASE WHEN linked_transaction_id IS NULL THEN 'unmatched' ELSE 'matched' END WHERE id = ?`).run(documentId);
    return true;
}

function deleteDocumentPermanently(documentId) {
    const doc = getDocument(documentId);
    if (!doc) return false;
    db.prepare(`DELETE FROM documents WHERE id = ?`).run(documentId);
    return true;
}

function updateDocumentType(documentId, docType) {
    return db.prepare(`UPDATE documents SET doc_type = ? WHERE id = ?`).run(docType || 'facture', documentId);
}

function moveDocumentToFolder(documentId, folderPath) {
    const doc = getDocument(documentId);
    if (!doc) return { ok: false };

    const safeFolder = String(folderPath || '')
        .replace(/\\/g, '/')
        .split('/')
        .map(part => part.trim().replace(/[^a-zA-Z0-9À-ÿ._ -]+/g, '-'))
        .filter(Boolean)
        .join('/');

    db.prepare(`UPDATE documents SET folder_path = ? WHERE id = ?`).run(safeFolder, documentId);
    addDocumentHistory(documentId, 'Déplacé', safeFolder);
    return { ok: true, folderPath: safeFolder };
}

function getDocumentTree(companyId = null) {
    const docs = getDocuments(companyId, { status: 'all' });
    const folders = {};

    docs.forEach(doc => {
        const company = doc.company_name || 'Sans société';
        const type = doc.doc_type === 'releve' ? 'Relevés' : doc.doc_type === 'rib' ? 'RIB' : 'Documents';
        const rawDate = doc.detected_date || doc.added_at || '';
        const yearMatch = String(rawDate).match(/(20\d{2})/);
        const year = yearMatch ? yearMatch[1] : 'Sans année';
        const monthMatch = String(rawDate).match(/(?:^|[\/-])(\d{2})(?:[\/-]|$)/);
        const month = monthMatch ? monthMatch[1] : 'Sans mois';
        const pathParts = doc.folder_path ? doc.folder_path.split('/').filter(Boolean) : [company, type, year, month];
        const key = pathParts.join('/');
        if (!folders[key]) folders[key] = [];
        folders[key].push(doc);
    });

    return folders;
}



function toggleDocumentFavorite(documentId) {
    const doc = getDocument(documentId);
    if (!doc) return { ok: false };
    const next = Number(doc.favorite || 0) ? 0 : 1;
    db.prepare(`UPDATE documents SET favorite = ? WHERE id = ?`).run(next, documentId);
    addDocumentHistory(documentId, next ? 'Ajouté aux favoris' : 'Retiré des favoris');
    return { ok: true, favorite: next };
}

function updateDocumentTags(documentId, tags) {
    const clean = String(tags || '')
        .split(',')
        .map(tag => tag.trim().replace(/^#/, ''))
        .filter(Boolean)
        .map(tag => `#${tag}`)
        .join(', ');
    db.prepare(`UPDATE documents SET tags = ? WHERE id = ?`).run(clean, documentId);
    return { ok: true, tags: clean };
}

function getDocumentDuplicates(companyId = null) {
    const where = companyId ? 'AND company_id = ?' : '';
    const params = companyId ? [companyId] : [];

    return db.prepare(`
        SELECT *
        FROM documents
        WHERE deleted_at IS NULL
        AND file_hash IS NOT NULL
        AND file_hash != ''
        AND file_hash IN (
            SELECT file_hash
            FROM documents
            WHERE deleted_at IS NULL
            AND file_hash IS NOT NULL
            AND file_hash != ''
            ${companyId ? 'AND company_id = ?' : ''}
            GROUP BY file_hash
            HAVING COUNT(*) > 1
        )
        ${where}
        ORDER BY file_hash, added_at DESC
    `).all(...(companyId ? [companyId, companyId] : []));
}

function getDocumentSmartFolders(companyId = null) {
    const docs = getDocuments(companyId, { status: 'all' });
    return {
        favorites: docs.filter(doc => Number(doc.favorite || 0) === 1).length,
        unclassified: docs.filter(doc => !doc.company_id || !doc.folder_path).length,
        invoices: docs.filter(doc => ['facture', 'avoir'].includes(doc.doc_type || 'facture')).length,
        statements: docs.filter(doc => doc.doc_type === 'releve').length,
        rib: docs.filter(doc => doc.doc_type === 'rib').length,
        contracts: docs.filter(doc => doc.doc_type === 'contrat').length,
        unmatched: docs.filter(doc => doc.status !== 'matched' && !['releve', 'rib'].includes(doc.doc_type || '')).length,
        duplicates: getDocumentDuplicates(companyId).length
    };
}



function addDocumentHistory(documentId, action, detail = '') {
    const doc = getDocument(documentId);
    if (!doc) return false;

    let history = [];
    try {
        history = doc.history_json ? JSON.parse(doc.history_json) : [];
    } catch (error) {
        history = [];
    }

    history.unshift({
        at: new Date().toISOString(),
        action,
        detail
    });

    db.prepare(`UPDATE documents SET history_json = ? WHERE id = ?`).run(JSON.stringify(history.slice(0, 50)), documentId);
    return true;
}

function toggleDocumentImportant(documentId) {
    const doc = getDocument(documentId);
    if (!doc) return { ok: false };
    const next = Number(doc.important || 0) ? 0 : 1;
    db.prepare(`UPDATE documents SET important = ? WHERE id = ?`).run(next, documentId);
    addDocumentHistory(documentId, next ? 'Marqué important' : 'Important retiré');
    return { ok: true, important: next };
}

function updateDocumentThirdParty(documentId, thirdPartyName = '') {
    const clean = String(thirdPartyName || '').trim();
    db.prepare(`UPDATE documents SET third_party_name = ? WHERE id = ?`).run(clean, documentId);
    addDocumentHistory(documentId, clean ? 'Tiers associé' : 'Tiers retiré', clean);
    return { ok: true, thirdPartyName: clean };
}

function getDocumentHistory(documentId) {
    const doc = getDocument(documentId);
    if (!doc) return [];
    try {
        return doc.history_json ? JSON.parse(doc.history_json) : [];
    } catch (error) {
        return [];
    }
}


function createCashSheet(data) {
    return db.prepare(`
        INSERT INTO cash_sheets(
            company_id,
            filename,
            filepath,
            original_filepath,
            sheet_date,
            period_year,
            period_month,
            invoiced_ca,
            cash_total,
            card_total,
            check_total,
            transfer_total,
            total_rows,
            raw_json,
            gross_ca_ht,
            discount_ht,
            net_ca_ht,
            net_ca_ttc,
            tva_total,
            tiers_payant,
            acompte_total,
            p3x_total,
            p4x_total,
            p10x_total,
            paylater_total,
            ecart_total
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        data.companyId || null,
        data.filename || '',
        data.filepath || '',
        data.originalFilepath || '',
        data.sheetDate || '',
        data.periodYear || '',
        data.periodMonth || '',
        Number(data.invoicedCa || data.netCaTtc || 0),
        Number(data.cashTotal || 0),
        Number(data.cardTotal || 0),
        Number(data.checkTotal || 0),
        Number(data.transferTotal || 0),
        Number(data.totalRows || 0),
        JSON.stringify(data.raw || {}),
        Number(data.grossCaHt || 0),
        Number(data.discountHt || 0),
        Number(data.netCaHt || 0),
        Number(data.netCaTtc || data.invoicedCa || 0),
        Number(data.tvaTotal || 0),
        Number(data.tiersPayant || 0),
        Number(data.acompteTotal || 0),
        Number(data.p3xTotal || 0),
        Number(data.p4xTotal || 0),
        Number(data.p10xTotal || 0),
        Number(data.paylaterTotal || 0),
        Number(data.ecartTotal || 0)
    );
}

function getCashSheets(companyId = null) {
    const where = companyId ? 'WHERE company_id = ?' : '';
    const params = companyId ? [companyId] : [];
    return db.prepare(`
        SELECT *
        FROM cash_sheets
        ${where}
        ORDER BY COALESCE(sheet_date, imported_at) DESC, id DESC
    `).all(...params);
}

function getCashSheetInsights(companyId = null) {
    const rows = getCashSheets(companyId);

    const sum = (field) => rows.reduce((acc, row) => acc + Number(row[field] || 0), 0);

    const totalGrossHt = sum('gross_ca_ht');
    const totalDiscountHt = sum('discount_ht');
    const totalNetHt = sum('net_ca_ht') || Math.max(0, totalGrossHt - totalDiscountHt);
    const totalNetTtc = sum('net_ca_ttc') || totalNetHt * 1.2;
    const totalInvoiced = totalNetTtc || sum('invoiced_ca');
    const totalCash = sum('cash_total');
    const totalCard = sum('card_total');
    const totalCheck = sum('check_total');
    const totalTransfer = sum('transfer_total');
    const totalTiersPayant = sum('tiers_payant');
    const totalAcomptes = sum('acompte_total');
    const totalFinancing = sum('p3x_total') + sum('p4x_total') + sum('p10x_total') + sum('paylater_total');
    const totalEcarts = sum('ecart_total');

    const byMonth = {};
    rows.forEach(row => {
        const key = `${row.period_year || 'Sans année'}-${row.period_month || 'Sans mois'}`;
        if (!byMonth[key]) {
            byMonth[key] = {
                period: key,
                year: row.period_year || '',
                month: row.period_month || '',
                gross_ca_ht: 0,
                discount_ht: 0,
                net_ca_ht: 0,
                net_ca_ttc: 0,
                invoiced_ca: 0,
                encaissements: 0,
                tiers_payant: 0,
                acomptes: 0,
                ecarts: 0,
                count: 0
            };
        }

        const gross = Number(row.gross_ca_ht || 0);
        const discount = Number(row.discount_ht || 0);
        const netHt = Number(row.net_ca_ht || (gross - discount) || 0);
        const netTtc = Number(row.net_ca_ttc || netHt * 1.2 || row.invoiced_ca || 0);

        byMonth[key].gross_ca_ht += gross;
        byMonth[key].discount_ht += discount;
        byMonth[key].net_ca_ht += netHt;
        byMonth[key].net_ca_ttc += netTtc;
        byMonth[key].invoiced_ca += netTtc;
        byMonth[key].encaissements += Number(row.cash_total || 0) + Number(row.card_total || 0) + Number(row.check_total || 0) + Number(row.transfer_total || 0);
        byMonth[key].tiers_payant += Number(row.tiers_payant || 0);
        byMonth[key].acomptes += Number(row.acompte_total || 0);
        byMonth[key].ecarts += Number(row.ecart_total || 0);
        byMonth[key].count += 1;
    });

    const months = Object.values(byMonth).sort((a, b) => a.period.localeCompare(b.period));
    const lastMonth = months.length ? months[months.length - 1] : null;
    const previousMonth = months.length > 1 ? months[months.length - 2] : null;
    const variationNetTtc = lastMonth && previousMonth && previousMonth.net_ca_ttc
        ? ((lastMonth.net_ca_ttc - previousMonth.net_ca_ttc) / previousMonth.net_ca_ttc) * 100
        : null;

    return {
        count: rows.length,
        totalInvoiced,
        totalGrossHt,
        totalDiscountHt,
        totalNetHt,
        totalNetTtc,
        discountRate: totalGrossHt ? (totalDiscountHt / totalGrossHt) * 100 : 0,
        totalCash,
        totalCard,
        totalCheck,
        totalTransfer,
        totalTiersPayant,
        totalAcomptes,
        totalFinancing,
        totalEcarts,
        variationNetTtc,
        byMonth: months.slice(-12),
        recent: rows.slice(0, 10),
        lastMonth,
        previousMonth
    };
}

function getPreviousMonthPeriod() {
    const now = new Date();
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
        year: String(previous.getFullYear()),
        month: String(previous.getMonth() + 1).padStart(2, '0')
    };
}

function getCashSheetReminders() {
    const target = getPreviousMonthPeriod();
    const companies = getCompanies();

    return companies.map(company => {
        const exists = db.prepare(`
            SELECT COUNT(*) AS count
            FROM cash_sheets
            WHERE company_id = ?
            AND period_year = ?
            AND period_month = ?
        `).get(company.id, target.year, target.month).count || 0;

        return {
            company,
            periodYear: target.year,
            periodMonth: target.month,
            missing: exists === 0,
            count: exists
        };
    });
}

function getCompanyDashboard(companyId) {
    const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(companyId);
    if (!company) return null;

    const accounts = getBankAccounts(companyId);
    const accountSummaries = accounts.map(account => {
        const summary = getTransactionSummary(account.id, {});
        const insights = getDashboardInsights(account.id, {});
        const balance = Number(summary.credit || 0) + Number(summary.debit || 0);
        return {
            account,
            summary,
            insights,
            balance
        };
    });

    const totals = accountSummaries.reduce((acc, row) => {
        acc.operations += Number(row.summary.total || 0);
        acc.credit += Number(row.summary.credit || 0);
        acc.debit += Number(row.summary.debit || 0);
        acc.balance += Number(row.balance || 0);
        acc.missing += Number(row.summary.missing || 0);
        acc.verified += Number(row.summary.verified || 0);
        acc.missingAmount += Math.abs(Number(row.insights?.missing?.total || 0));
        return acc;
    }, { operations: 0, credit: 0, debit: 0, balance: 0, missing: 0, verified: 0, missingAmount: 0 });

    const categoryTotals = new Map();
    const supplierTotals = new Map();

    accountSummaries.forEach(row => {
        (row.insights.categories || []).forEach(cat => {
            const name = cat.category || 'Non catégorisé';
            const amount = Math.abs(Number(cat.debit_total || cat.credit_total || cat.total || 0));
            categoryTotals.set(name, (categoryTotals.get(name) || 0) + amount);
        });

        (row.insights.suppliers || []).forEach(supplier => {
            const name = supplier.label || 'Fournisseur';
            const amount = Math.abs(Number(supplier.total || 0));
            supplierTotals.set(name, (supplierTotals.get(name) || 0) + amount);
        });
    });

    const cash = getCashSheetInsights(companyId);

    return {
        company,
        accounts: accountSummaries,
        totals,
        categories: [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, amount]) => ({ name, amount })),
        suppliers: [...supplierTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, amount]) => ({ name, amount })),
        cash
    };
}


module.exports = {
    db,
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

    createReceipt,
    getReceipt,
    getReceipts,
    deleteReceipt,

    getThirdParties,
    backfillThirdParties,
    updateTransactionThirdParty,
    inferThirdPartyFromLabel,
    getDocumentsDashboard,
    updateThirdParty,
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
    cleanupOrphanDocumentLinks,
    findExistingDocumentByHashOrName,
    refreshTransactionStatusFromDocuments,
    createCashSheet,
    getCashSheets,
    getCashSheetInsights,
    getCompanyDashboard,
    getCashSheetReminders,
    renameDocument
};
