const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'ThetaCompta.db');

const db = new Database(dbPath);

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

CREATE TABLE IF NOT EXISTS bank_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_account_id INTEGER NOT NULL,
    date_operation TEXT,
    label TEXT,
    amount REAL,
    type TEXT,
    pdf_source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(bank_account_id) REFERENCES bank_accounts(id)
);

CREATE TABLE IF NOT EXISTS statements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_account_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(bank_account_id) REFERENCES bank_accounts(id)
);
`);

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
        INSERT INTO bank_accounts(
            company_id,
            bank_name,
            account_name,
            iban
        )
        VALUES(?, ?, ?, ?)
    `).run(companyId, bankName, accountName, iban);
}

function getBankAccounts(companyId) {
    return db.prepare(`
        SELECT *
        FROM bank_accounts
        WHERE company_id = ?
        ORDER BY bank_name
    `).all(companyId);
}

function createStatement(bankAccountId, filename, filepath) {
    return db.prepare(`
        INSERT INTO statements(
            bank_account_id,
            filename,
            filepath
        )
        VALUES(?, ?, ?)
    `).run(bankAccountId, filename, filepath);
}

function getStatements(bankAccountId) {
    return db.prepare(`
        SELECT *
        FROM statements
        WHERE bank_account_id = ?
        ORDER BY imported_at DESC
    `).all(bankAccountId);
}

function statementExists(bankAccountId, filepath) {
    return db.prepare(`
        SELECT *
        FROM statements
        WHERE bank_account_id = ?
        AND filepath = ?
    `).get(bankAccountId, filepath);
}

function createTransaction(
    bankAccountId,
    dateOperation,
    label,
    amount,
    type,
    pdfSource
) {
    return db.prepare(`
        INSERT INTO bank_transactions(
            bank_account_id,
            date_operation,
            label,
            amount,
            type,
            pdf_source
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        bankAccountId,
        dateOperation,
        label,
        amount,
        type,
        pdfSource
    );
}

function getTransactions(bankAccountId) {
    return db.prepare(`
        SELECT *
        FROM bank_transactions
        WHERE bank_account_id = ?
        ORDER BY date_operation DESC
    `).all(bankAccountId);
}

module.exports = {
    db,

    createCompany,
    getCompanies,

    createBankAccount,
    getBankAccounts,

    createStatement,
    getStatements,
    statementExists,

    createTransaction,
    getTransactions
};