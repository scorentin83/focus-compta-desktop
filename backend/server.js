const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, "db", "focus-compta.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "Focus Compta",
    version: "0.87"
  });
});

app.get("/api/companies", (req, res) => {
  const companies = db.prepare("SELECT * FROM companies ORDER BY id DESC").all();
  res.json(companies);
});

app.post("/api/companies", (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Nom de société obligatoire" });
  }

  const result = db.prepare("INSERT INTO companies (name) VALUES (?)").run(name.trim());

  res.json({
    id: result.lastInsertRowid,
    name: name.trim()
  });
});

app.delete("/api/companies/:id", (req, res) => {
  db.prepare("DELETE FROM companies WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`API Focus Compta démarrée sur le port ${PORT}`);
});