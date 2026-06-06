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
    `).run(
        companyId,
        bankName,
        accountName,
        iban
    );
}

function getBankAccounts(companyId) {
    return db.prepare(`
        SELECT *
        FROM bank_accounts
        WHERE company_id = ?
        ORDER BY bank_name
    `).all(companyId);
}

module.exports = {
    db,
    createCompany,
    getCompanies,
    createBankAccount,
    getBankAccounts
};