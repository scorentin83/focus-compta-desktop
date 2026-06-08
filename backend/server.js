const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const dbDir = path.join(__dirname, "db");
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, "focus-compta.db");
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    siren TEXT,
    vat_regime TEXT DEFAULT 'normal',
    fiscal_year_end TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    payload TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

function audit(action, entityType, entityId, payload = {}) {
  db.prepare(`
    INSERT INTO audit_logs (action, entity_type, entity_id, payload)
    VALUES (?, ?, ?, ?)
  `).run(action, entityType, entityId, JSON.stringify(payload));
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "Focus Compta", version: "0.88" });
});

app.get("/api/stats", (req, res) => {
  const companies = db.prepare("SELECT COUNT(*) AS total FROM companies").get().total;
  res.json({ companies, documents: 0, transactions: 0, lastReconciliation: "-" });
});

app.get("/api/companies", (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, siren, vat_regime, fiscal_year_end, notes, created_at, updated_at
    FROM companies
    ORDER BY name COLLATE NOCASE ASC
  `).all();
  res.json(rows);
});

app.post("/api/companies", (req, res) => {
  const { name, siren = "", vat_regime = "normal", fiscal_year_end = "", notes = "" } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Nom de société obligatoire" });

  const result = db.prepare(`
    INSERT INTO companies (name, siren, vat_regime, fiscal_year_end, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(name.trim(), siren.trim(), vat_regime, fiscal_year_end, notes.trim());

  const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(result.lastInsertRowid);
  audit("company.created", "company", company.id, company);
  res.status(201).json(company);
});

app.put("/api/companies/:id", (req, res) => {
  const { name, siren = "", vat_regime = "normal", fiscal_year_end = "", notes = "" } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Nom de société obligatoire" });

  db.prepare(`
    UPDATE companies
    SET name = ?, siren = ?, vat_regime = ?, fiscal_year_end = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name.trim(), siren.trim(), vat_regime, fiscal_year_end, notes.trim(), req.params.id);

  const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(req.params.id);
  audit("company.updated", "company", company?.id || req.params.id, company || {});
  res.json(company);
});

app.delete("/api/companies/:id", (req, res) => {
  const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(req.params.id);
  db.prepare("DELETE FROM companies WHERE id = ?").run(req.params.id);
  audit("company.deleted", "company", Number(req.params.id), company || {});
  res.json({ success: true });
});

app.get("/api/audit", (req, res) => {
  const rows = db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100").all();
  res.json(rows);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API Focus Compta v0.88 démarrée sur le port ${PORT}`));
