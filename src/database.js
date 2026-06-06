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
`);

function createCompany(name) {
    const stmt = db.prepare(`
        INSERT INTO companies(name)
        VALUES(?)
    `);

    return stmt.run(name);
}

function getCompanies() {
    const stmt = db.prepare(`
        SELECT *
        FROM companies
        ORDER BY name
    `);

    return stmt.all();
}

module.exports = {
    db,
    createCompany,
    getCompanies
};