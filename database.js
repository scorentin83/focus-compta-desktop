const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// V0.85 — Desktop Ready : chemins compatibles logiciel installé.
// En mode Electron, main.js renseigne FOCUS_COMPTA_USER_DATA_DIR avec app.getPath('userData').
// En mode test/syntaxe Node, on garde un fallback local non destructif.
const APP_ROOT = process.env.FOCUS_COMPTA_APP_ROOT || __dirname;
const PROJECT_ROOT = path.join(APP_ROOT, '..');
const USER_DATA_ROOT = process.env.FOCUS_COMPTA_USER_DATA_DIR || path.join(PROJECT_ROOT, 'FocusComptaUserData');
const DATA_DIR = path.join(USER_DATA_ROOT, 'FocusComptaData');
const STATEMENTS_DIR = path.join(DATA_DIR, 'Releves');
const RECEIPTS_DIR = path.join(DATA_DIR, 'Justificatifs');
const RIB_DIR = path.join(DATA_DIR, 'RIB');
const BACKUPS_DIR = path.join(USER_DATA_ROOT, 'FocusComptaBackups');
const ACCOUNTING_EXPORTS_DIR = path.join(DATA_DIR, 'ExportsComptables');
const LEGACY_DB_PATHS = [
    path.join(PROJECT_ROOT, 'ThetaCompta.db'),
    path.join(PROJECT_ROOT, 'FocusComptaData', 'FocusCompta.db'),
    path.join(APP_ROOT, 'FocusComptaData', 'FocusCompta.db'),
    path.join(APP_ROOT, 'ThetaCompta.db')
];
const LEGACY_DATA_DIRS = [
    path.join(PROJECT_ROOT, 'FocusComptaData'),
    path.join(APP_ROOT, 'FocusComptaData')
];
const DB_PATH = path.join(DATA_DIR, 'FocusCompta.db');

function ensureDirV085(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

[DATA_DIR, STATEMENTS_DIR, RECEIPTS_DIR, RIB_DIR, BACKUPS_DIR, ACCOUNTING_EXPORTS_DIR].forEach(ensureDirV085);

// Première ouverture de la version installable : on récupère automatiquement
// l'ancienne base locale si elle existe, sans supprimer l'ancien dossier.
if (!fs.existsSync(DB_PATH)) {
    const legacyDb = LEGACY_DB_PATHS.find(candidate => candidate && fs.existsSync(candidate));
    if (legacyDb) {
        fs.copyFileSync(legacyDb, DB_PATH);
    }
}

// Migration douce des documents historiques vers AppData : on copie uniquement
// les dossiers absents pour éviter toute perte ou écrasement.
for (const legacyDir of LEGACY_DATA_DIRS) {
    if (!legacyDir || !fs.existsSync(legacyDir)) continue;
    if (path.resolve(legacyDir) === path.resolve(DATA_DIR)) continue;
    for (const entry of ['Releves', 'Justificatifs', 'RIB', 'CashSheets', 'ExportsComptables']) {
        const src = path.join(legacyDir, entry);
        const dest = path.join(DATA_DIR, entry);
        try {
            if (fs.existsSync(src) && !fs.existsSync(dest)) fs.cpSync(src, dest, { recursive: true });
        } catch (error) {
            console.warn('Migration douce FocusComptaData impossible :', src, error.message);
        }
    }
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

CREATE TABLE IF NOT EXISTS document_learning_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    supplier TEXT NOT NULL,
    field_name TEXT NOT NULL,
    learned_value TEXT,
    keyword TEXT,
    source_label TEXT,
    active INTEGER DEFAULT 1,
    usage_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, supplier, field_name, keyword)
);

CREATE TABLE IF NOT EXISTS user_learning_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    source_value TEXT,
    target_value TEXT,
    payload_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, event_type, entity_type, entity_id, source_value, target_value)
);


CREATE TABLE IF NOT EXISTS document_transaction_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    transaction_id INTEGER NOT NULL,
    amount REAL,
    link_type TEXT DEFAULT 'manual',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, transaction_id),
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY(transaction_id) REFERENCES bank_transactions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS accounting_export_lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    export_type TEXT NOT NULL,
    period_year TEXT,
    period_month TEXT,
    filename TEXT,
    filepath TEXT,
    documents_count INTEGER DEFAULT 0,
    statements_count INTEGER DEFAULT 0,
    total_ttc REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS accounting_export_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lot_id INTEGER NOT NULL,
    item_type TEXT NOT NULL,
    source_id INTEGER,
    source_path TEXT,
    display_name TEXT,
    accounting_year TEXT,
    accounting_month TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(lot_id) REFERENCES accounting_export_lots(id) ON DELETE CASCADE
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


-- V0.42 : référentiel tiers intelligent.
-- Ces tables mémorisent les fusions/dissociations validées par l'utilisateur.
CREATE TABLE IF NOT EXISTS third_party_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias_key TEXT NOT NULL UNIQUE,
    alias_label TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    type TEXT DEFAULT 'autre',
    mode TEXT DEFAULT 'merge',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS third_party_split_exceptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias_key TEXT NOT NULL UNIQUE,
    alias_label TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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


CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    action_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    label TEXT,
    details_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS app_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    email TEXT,
    role TEXT DEFAULT 'admin',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_key TEXT NOT NULL UNIQUE,
    role_label TEXT NOT NULL,
    permissions_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_company_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    company_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, company_id),
    FOREIGN KEY(user_id) REFERENCES app_users(id),
    FOREIGN KEY(company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS app_session (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    current_user_id INTEGER,
    updated_at DATETIME,
    FOREIGN KEY(current_user_id) REFERENCES app_users(id)
);

CREATE TABLE IF NOT EXISTS accounting_period_locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    period_year TEXT NOT NULL,
    period_month TEXT NOT NULL,
    locked INTEGER DEFAULT 0,
    locked_at DATETIME,
    locked_by TEXT,
    unlocked_at DATETIME,
    unlocked_by TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    UNIQUE(company_id, period_year, period_month),
    FOREIGN KEY(company_id) REFERENCES companies(id)
);
`);

function ensureColumn(tableName, columnName, definition) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const exists = columns.some(column => column.name === columnName);

    if (!exists) {
        // SQLite interdit ADD COLUMN avec un DEFAULT non constant
        // comme CURRENT_TIMESTAMP. On ajoute donc la colonne sans ce
        // DEFAULT, puis on initialise les lignes existantes.
        const normalizedDefinition = String(definition || '').trim();
        const hasCurrentTimestampDefault = /DEFAULT\s+CURRENT_TIMESTAMP/i.test(normalizedDefinition);
        const safeDefinition = hasCurrentTimestampDefault
            ? normalizedDefinition.replace(/\s+DEFAULT\s+CURRENT_TIMESTAMP/ig, '')
            : normalizedDefinition;

        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${safeDefinition}`);

        if (hasCurrentTimestampDefault) {
            db.prepare(`UPDATE ${tableName} SET ${columnName} = CURRENT_TIMESTAMP WHERE ${columnName} IS NULL`).run();
        }
    }
}


// V0.85 — Réglages applicatifs persistants + préparation stockage cloud/S3.
db.exec(`
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

function getAppSettingV085(key, fallbackValue = null) {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    if (!row) return fallbackValue;
    try { return JSON.parse(row.value); } catch (_) { return row.value; }
}

function setAppSettingV085(key, value) {
    const serialized = JSON.stringify(value);
    db.prepare(`
        INSERT INTO app_settings(key, value, updated_at) VALUES(?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, serialized);
    return getAppSettingV085(key);
}

function getStorageSettingsV085() {
    const defaults = {
        mode: 'local',
        provider: 'local',
        ovh: { endpoint: '', region: 'gra', bucket: '', accessKeyId: '', secretKeySaved: false },
        cacheEnabled: true,
        desktopReady: true
    };
    const stored = getAppSettingV085('storage.v085', {});
    return { ...defaults, ...(stored || {}), ovh: { ...defaults.ovh, ...((stored || {}).ovh || {}) } };
}

function saveStorageSettingsV085(data = {}) {
    const current = getStorageSettingsV085();
    const next = {
        ...current,
        ...data,
        ovh: { ...current.ovh, ...(data.ovh || {}) }
    };
    if (next.mode === 's3') next.provider = 'ovh-s3';
    if (next.mode !== 's3') next.provider = 'local';
    return setAppSettingV085('storage.v085', next);
}

function getDesktopStorageStatusV085() {
    const storage = getStorageSettingsV085();
    const counts = {
        documents: db.prepare('SELECT COUNT(*) AS count FROM documents').get().count,
        statements: db.prepare('SELECT COUNT(*) AS count FROM statements').get().count,
        receipts: db.prepare('SELECT COUNT(*) AS count FROM receipts').get().count,
        s3Documents: db.prepare("SELECT COUNT(*) AS count FROM documents WHERE storage_provider = 'ovh-s3' OR s3_key IS NOT NULL").get().count,
        localDocuments: db.prepare("SELECT COUNT(*) AS count FROM documents WHERE COALESCE(storage_provider,'local') = 'local' AND s3_key IS NULL").get().count
    };
    return {
        userDataRoot: USER_DATA_ROOT,
        dataDir: DATA_DIR,
        dbPath: DB_PATH,
        backupsDir: BACKUPS_DIR,
        storage,
        counts
    };
}

function markDocumentStorageV085(tableName, id, metadata = {}) {
    const allowedTables = ['documents', 'statements', 'receipts'];
    if (!allowedTables.includes(tableName)) throw new Error('Table stockage non autorisée.');
    const fields = ['storage_provider','s3_bucket','s3_key','s3_etag','mime_type','file_size','local_cache_path','sync_status','uploaded_at'];
    const sets = [];
    const values = [];
    for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(metadata, field)) {
            sets.push(`${field} = ?`);
            values.push(metadata[field]);
        }
    }
    if (!sets.length) return false;
    values.push(id);
    return db.prepare(`UPDATE ${tableName} SET ${sets.join(', ')} WHERE id = ?`).run(...values);
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

// V0.85 — colonnes communes pour la future gestion OVH S3.
for (const tableName of ['documents', 'statements', 'receipts']) {
    ensureColumn(tableName, 'storage_provider', "TEXT DEFAULT 'local'");
    ensureColumn(tableName, 's3_bucket', 'TEXT');
    ensureColumn(tableName, 's3_key', 'TEXT');
    ensureColumn(tableName, 's3_etag', 'TEXT');
    ensureColumn(tableName, 'mime_type', 'TEXT');
    ensureColumn(tableName, 'file_size', 'INTEGER');
    ensureColumn(tableName, 'local_cache_path', 'TEXT');
    ensureColumn(tableName, 'sync_status', "TEXT DEFAULT 'local'");
    ensureColumn(tableName, 'uploaded_at', 'TEXT');
}
ensureColumn('bank_accounts', 'rib_storage_provider', "TEXT DEFAULT 'local'");
ensureColumn('bank_accounts', 'rib_s3_bucket', 'TEXT');
ensureColumn('bank_accounts', 'rib_s3_key', 'TEXT');
ensureColumn('bank_accounts', 'rib_sync_status', "TEXT DEFAULT 'local'");

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

ensureColumn('automation_rules', 'confidence', 'REAL DEFAULT 25');
ensureColumn('automation_rules', 'usage_count', 'INTEGER DEFAULT 0');
ensureColumn('automation_rules', 'last_used_at', 'DATETIME');
ensureColumn('automation_rules', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
ensureColumn('automation_rules', 'is_active', 'INTEGER DEFAULT 1');
ensureColumn('automation_rules', 'source', "TEXT DEFAULT 'manual'");
ensureColumn('automation_rules', 'auto_apply', 'INTEGER DEFAULT 0');

ensureColumn('audit_log', 'company_id', 'INTEGER');
ensureColumn('audit_log', 'action_type', 'TEXT');
ensureColumn('audit_log', 'entity_type', 'TEXT');
ensureColumn('audit_log', 'entity_id', 'TEXT');
ensureColumn('audit_log', 'label', 'TEXT');
ensureColumn('audit_log', 'details_json', 'TEXT');
ensureColumn('audit_log', 'created_at', 'DATETIME');
ensureColumn('app_users', 'role', "TEXT DEFAULT 'admin'");
ensureColumn('app_users', 'is_active', 'INTEGER DEFAULT 1');
ensureColumn('app_users', 'last_login_at', 'DATETIME');
ensureColumn('app_users', 'notes', 'TEXT');
ensureColumn('app_users', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
ensureColumn('user_company_access', 'user_id', 'INTEGER');
ensureColumn('user_company_access', 'company_id', 'INTEGER');
ensureColumn('app_session', 'current_user_id', 'INTEGER');
ensureColumn('app_session', 'updated_at', 'DATETIME');
ensureColumn('accounting_period_locks', 'company_id', 'INTEGER');
ensureColumn('accounting_period_locks', 'period_year', 'TEXT');
ensureColumn('accounting_period_locks', 'period_month', 'TEXT');
ensureColumn('accounting_period_locks', 'locked', 'INTEGER DEFAULT 0');
ensureColumn('accounting_period_locks', 'locked_at', 'DATETIME');
ensureColumn('accounting_period_locks', 'locked_by', 'TEXT');
ensureColumn('accounting_period_locks', 'unlocked_at', 'DATETIME');
ensureColumn('accounting_period_locks', 'unlocked_by', 'TEXT');
ensureColumn('accounting_period_locks', 'note', 'TEXT');
ensureColumn('accounting_period_locks', 'updated_at', 'DATETIME');

try {
    const roleDefinitionsV081 = [
        ['admin', 'Administrateur', { modules: ['*'], canWrite: true, canExport: true, readOnly: false }],
        ['direction', 'Direction', { modules: ['home','companies','bank','documents','matching','thirdParties','accounting','settings'], canWrite: true, canExport: true, readOnly: false }],
        ['collaborateur', 'Collaborateur', { modules: ['home','companies','bank','documents','matching'], canWrite: true, canExport: false, readOnly: false }],
        ['expert_comptable', 'Expert-comptable', { modules: ['home','companies','bank','documents','matching','accounting','exports'], canWrite: false, canExport: true, readOnly: true }]
    ];
    const upsertRole = db.prepare(`
        INSERT INTO app_roles(role_key, role_label, permissions_json) VALUES(?,?,?)
        ON CONFLICT(role_key) DO UPDATE SET role_label = excluded.role_label, permissions_json = excluded.permissions_json
    `);
    roleDefinitionsV081.forEach(([key, label, permissions]) => upsertRole.run(key, label, JSON.stringify(permissions)));
    const userCount = db.prepare('SELECT COUNT(*) AS count FROM app_users').get().count || 0;
    if (!userCount) db.prepare(`INSERT INTO app_users(display_name, email, role, is_active, updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)`).run('Administrateur Focus Compta', '', 'admin', 1);
    const firstUser = db.prepare('SELECT id FROM app_users WHERE is_active = 1 ORDER BY id LIMIT 1').get();
    if (firstUser) db.prepare(`INSERT OR IGNORE INTO app_session(id, current_user_id, updated_at) VALUES(1, ?, CURRENT_TIMESTAMP)`).run(firstUser.id);
} catch (_) {}

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
// V0.58.1 : nom métier, nom original, titre et notes documentaires.
ensureColumn('documents', 'original_filename', 'TEXT');
ensureColumn('documents', 'smart_filename', 'TEXT');
ensureColumn('documents', 'smart_renamed_at', 'TEXT');
ensureColumn('documents', 'document_title', 'TEXT');
ensureColumn('documents', 'document_notes', 'TEXT');

// V0.44 : champs comptables extraits des documents.
ensureColumn('documents', 'invoice_number', 'TEXT');
ensureColumn('documents', 'invoice_date', 'TEXT');
ensureColumn('documents', 'due_date', 'TEXT');
ensureColumn('documents', 'amount_ht', 'REAL');
ensureColumn('documents', 'amount_tva', 'REAL');
ensureColumn('documents', 'amount_ttc', 'REAL');
ensureColumn('documents', 'payment_status', "TEXT DEFAULT 'unknown'");
ensureColumn('documents', 'vat_rate', 'REAL');
// V0.45.2 : validation humaine et apprentissage documentaire.
ensureColumn('documents', 'validation_status', "TEXT DEFAULT 'pending'");
ensureColumn('documents', 'ocr_confidence', 'REAL DEFAULT 0');
ensureColumn('documents', 'learning_applied', 'INTEGER DEFAULT 0');

// V0.45.5 : intelligence documentaire fournisseur + échéanciers.
ensureColumn('documents', 'planned_payment_date', 'TEXT');
ensureColumn('documents', 'payment_method', 'TEXT');
ensureColumn('documents', 'payment_schedule_json', 'TEXT');
ensureColumn('documents', 'field_confidence_json', 'TEXT');
ensureColumn('documents', 'supplier_template', 'TEXT');
ensureColumn('documents', 'ocr_quality_status', "TEXT DEFAULT 'to_review'");

ensureColumn('documents', 'accounting_impact', "TEXT DEFAULT 'yes'");
ensureColumn('documents', 'document_nature', "TEXT DEFAULT 'comptable'");
ensureColumn('documents', 'transmission_status', "TEXT DEFAULT 'not_transmitted'");
ensureColumn('documents', 'transmitted_at', 'TEXT');
ensureColumn('documents', 'transmitted_export_lot_id', 'INTEGER');
ensureColumn('documents', 'accounting_period_year', 'TEXT');
ensureColumn('documents', 'accounting_period_month', 'TEXT');
ensureColumn('statements', 'transmission_status', "TEXT DEFAULT 'not_transmitted'");
ensureColumn('statements', 'transmitted_at', 'TEXT');
ensureColumn('statements', 'transmitted_export_lot_id', 'INTEGER');

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
ensureColumn('cash_sheets', 'tva_brute', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'discount_tva', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'tva_nette', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'cofidis_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'amex_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'bank_remise_cash', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'bank_remise_check', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'bank_remise_deferred_check', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'is_invalid', 'INTEGER DEFAULT 0');
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
ensureColumn('cash_sheets', 'tva_brute', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'discount_tva', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'tva_nette', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'cofidis_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'amex_total', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'bank_remise_cash', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'bank_remise_check', 'REAL DEFAULT 0');
ensureColumn('cash_sheets', 'bank_remise_deferred_check', 'REAL DEFAULT 0');
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
    ['DEPOT DE GARANTIE', 'Immobilier'],
    // V0.61.1 : catégories de contrôle banque pour les remises issues des feuilles de caisse.
    ['REMISE CB', 'Remise CB'],
    ['TELECOLLECTE', 'Remise CB'],
    ['TÉLÉCOLLECTE', 'Remise CB'],
    ['MONETIQUE', 'Remise CB'],
    ['MONÉTIQUE', 'Remise CB'],
    ['TPE', 'Remise CB'],
    ['REMISE ES', 'Remise ES'],
    ['DEPOT ESPECES', 'Remise ES'],
    ['DÉPÔT ESPÈCES', 'Remise ES'],
    ['VERSEMENT ESPECES', 'Remise ES'],
    ['VERSEMENT ESPÈCES', 'Remise ES'],
    ['REMISE CH', 'Remise CH'],
    ['REMISE CHEQUE', 'Remise CH'],
    ['REMISE CHÈQUE', 'Remise CH'],
    ['REMISE CHEQUES', 'Remise CH'],
    ['REMISE CHÈQUES', 'Remise CH'],
    ['COFIDIS', 'Remise COFIDIS'],
    ['P3X', 'Remise COFIDIS'],
    ['P4X', 'Remise COFIDIS'],
    ['P10X', 'Remise COFIDIS'],
    ['PAYLATER', 'Remise COFIDIS'],
    ['AMEX', 'Remise AMEX'],
    ['AMERICAN EXPRESS', 'Remise AMEX']
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


function normalizeTypeKeyV0423(type) {
    return String(type || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function isMutuelleTypeV0423(type) {
    const key = normalizeTypeKeyV0423(type);
    return key === 'mutuelle' || key === 'tiers payant' || key === 'tierspayant';
}

function getBusinessRuleForThirdPartyTypeV0423(type) {
    if (isMutuelleTypeV0423(type)) {
        return { category: 'Tiers-Payant', status: 'verified', label: 'Type Mutuelle' };
    }
    return null;
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

function updateCompany(data) {
    const id = Number(data?.id);
    const name = String(data?.name || '').trim();
    if (!id || !name) {
        return { updated: false, message: 'Société invalide.' };
    }

    db.prepare(`
        UPDATE companies
        SET name = ?
        WHERE id = ?
    `).run(name, id);

    return { updated: true, message: 'Société modifiée.' };
}

function getCompanyDeletionPreview(companyId) {
    const id = Number(companyId);
    const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(id);
    if (!company) {
        return { found: false, message: 'Société introuvable.' };
    }

    const accounts = db.prepare(`SELECT id FROM bank_accounts WHERE company_id = ?`).all(id);
    const accountIds = accounts.map(row => row.id);
    const placeholders = accountIds.map(() => '?').join(',');

    const statements = accountIds.length
        ? db.prepare(`SELECT COUNT(*) AS count FROM statements WHERE bank_account_id IN (${placeholders})`).get(...accountIds).count
        : 0;
    const transactions = accountIds.length
        ? db.prepare(`SELECT COUNT(*) AS count FROM bank_transactions WHERE bank_account_id IN (${placeholders})`).get(...accountIds).count
        : 0;
    const receipts = accountIds.length
        ? db.prepare(`
            SELECT COUNT(*) AS count
            FROM receipts
            WHERE transaction_id IN (
                SELECT id FROM bank_transactions WHERE bank_account_id IN (${placeholders})
            )
        `).get(...accountIds).count
        : 0;

    const documents = db.prepare(`SELECT COUNT(*) AS count FROM documents WHERE company_id = ?`).get(id).count;
    const thirdParties = db.prepare(`SELECT COUNT(*) AS count FROM third_parties WHERE company_id = ?`).get(id).count;
    const cashSheets = db.prepare(`SELECT COUNT(*) AS count FROM cash_sheets WHERE company_id = ?`).get(id).count;
    const rules = db.prepare(`SELECT COUNT(*) AS count FROM automation_rules WHERE company_id = ?`).get(id).count;

    return {
        found: true,
        company,
        counts: {
            accounts: accounts.length,
            statements,
            transactions,
            receipts,
            documents,
            thirdParties,
            cashSheets,
            rules
        }
    };
}

function deleteCompany(companyId) {
    const id = Number(companyId);
    const preview = getCompanyDeletionPreview(id);
    if (!preview.found) return preview;

    const tx = db.transaction(() => {
        const accountIds = db.prepare(`SELECT id FROM bank_accounts WHERE company_id = ?`).all(id).map(row => row.id);
        if (accountIds.length) {
            const placeholders = accountIds.map(() => '?').join(',');
            db.prepare(`
                DELETE FROM receipts
                WHERE transaction_id IN (
                    SELECT id FROM bank_transactions WHERE bank_account_id IN (${placeholders})
                )
            `).run(...accountIds);
            db.prepare(`DELETE FROM bank_transactions WHERE bank_account_id IN (${placeholders})`).run(...accountIds);
            db.prepare(`DELETE FROM statements WHERE bank_account_id IN (${placeholders})`).run(...accountIds);
            db.prepare(`DELETE FROM bank_accounts WHERE id IN (${placeholders})`).run(...accountIds);
        }

        db.prepare(`DELETE FROM documents WHERE company_id = ?`).run(id);
        db.prepare(`DELETE FROM third_parties WHERE company_id = ?`).run(id);
        db.prepare(`DELETE FROM cash_sheets WHERE company_id = ?`).run(id);
        db.prepare(`DELETE FROM automation_rules WHERE company_id = ?`).run(id);
        db.prepare(`DELETE FROM companies WHERE id = ?`).run(id);
    });

    tx();
    return { deleted: true, message: 'Société supprimée.', preview };
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
            notes,
            statement_identifiers
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        AND COALESCE(doc_type, 'facture') IN ('facture', 'avoir')
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
    let inferredThirdPartyType = '';
    let thirdPartyId = null;
    let thirdPartyName = '';

    try {
        const bankAccount = db.prepare(`SELECT * FROM bank_accounts WHERE id = ?`).get(bankAccountId);
        if (bankAccount) {
            const inferred = inferThirdPartyFromLabel(label);
            inferredThirdPartyType = inferred.type || '';
            const third = getOrCreateThirdParty(bankAccount.company_id, inferred.name, inferred.type);
            if (third) {
                thirdPartyId = third.id;
                thirdPartyName = third.name;
                inferredThirdPartyType = third.type || inferredThirdPartyType;
            }
        }
    } catch (error) {}

    const businessRule = getBusinessRuleForThirdPartyTypeV0423(inferredThirdPartyType);
    let finalCategory = businessRule ? businessRule.category : (category || findCategoryForLabel(label));
    let finalStatus = businessRule ? businessRule.status : 'missing';
    let notes = businessRule ? `Règle métier : ${businessRule.label} → ${businessRule.category} / Vérifié` : '';

    // V0.55.2 — appliquer les règles automatiques dès l'import du relevé.
    // Avant, certaines règles donnaient le statut Vérifié mais la catégorie restait vide
    // jusqu'à une application manuelle. On applique ici catégorie + statut en même temps.
    try {
        const bankAccount = db.prepare(`SELECT ba.*, c.id AS company_id FROM bank_accounts ba LEFT JOIN companies c ON c.id = ba.company_id WHERE ba.id = ?`).get(bankAccountId);
        const rules = getAutomationRules(bankAccount?.company_id || null);
        const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const haystacks = {
            account_name: `${bankAccount?.account_name || ''} ${bankAccount?.bank_name || ''}`,
            label: `${label || ''}`,
            third_party_name: `${thirdPartyName || ''}`,
            all: `${bankAccount?.account_name || ''} ${bankAccount?.bank_name || ''} ${label || ''} ${thirdPartyName || ''}`
        };
        for (const rule of rules) {
            if (!rule.keyword) continue;
            const target = rule.target || 'all';
            const haystack = normalize(haystacks[target] || haystacks.all);
            if (!haystack.includes(normalize(rule.keyword))) continue;
            if (rule.category) finalCategory = rule.category;
            if (rule.status) finalStatus = rule.status;
            const ruleNote = `Règle auto import : ${rule.keyword}`;
            notes = notes ? `${notes}
${ruleNote}` : ruleNote;
            break;
        }
    } catch (error) {}

    const searchText = buildTransactionSearchText({
        label,
        category: finalCategory,
        notes,
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
            notes,
            search_text,
            third_party_id,
            third_party_name
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        bankAccountId,
        statementId,
        dateOperation,
        label,
        amount,
        type,
        pdfSource,
        finalStatus,
        finalCategory,
        notes,
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
            s.filepath AS statement_filepath,
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
            s.filepath AS statement_filepath,
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
            s.filepath AS statement_filepath,
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
            file_hash,
            invoice_number,
            invoice_date,
            due_date,
            amount_ht,
            amount_tva,
            amount_ttc,
            payment_status,
            vat_rate,
            ocr_text,
            validation_status,
            ocr_confidence,
            learning_applied,
            planned_payment_date,
            payment_method,
            payment_schedule_json,
            field_confidence_json,
            supplier_template,
            ocr_quality_status
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        data.companyId || null,
        data.filename,
        data.filepath,
        data.originalFilepath || null,
        data.detectedAmount ?? data.amountTtc ?? null,
        data.detectedReference || data.invoiceNumber || '',
        data.detectedSupplier || data.supplier || '',
        data.detectedDate || data.invoiceDate || '',
        data.folderPath || '',
        data.docType || data.doc_type || 'facture',
        data.status || 'unmatched',
        data.fileHash || data.file_hash || '',
        data.invoiceNumber || data.detectedReference || '',
        data.invoiceDate || data.detectedDate || '',
        data.dueDate || '',
        data.amountHt ?? null,
        data.amountTva ?? null,
        data.amountTtc ?? data.detectedAmount ?? null,
        data.paymentStatus || 'unknown',
        data.vatRate ?? null,
        data.ocrText || data.ocr_text || '',
        data.validationStatus || 'pending',
        data.ocrConfidence ?? 0,
        data.learningApplied ? 1 : 0,
        data.plannedPaymentDate || data.planned_payment_date || '',
        data.paymentMethod || data.payment_method || '',
        data.paymentScheduleJson || data.payment_schedule_json || (Array.isArray(data.paymentSchedule) ? JSON.stringify(data.paymentSchedule) : ''),
        data.fieldConfidenceJson || data.field_confidence_json || (data.fieldConfidence ? JSON.stringify(data.fieldConfidence) : ''),
        data.supplierTemplate || data.supplier_template || '',
        data.ocrQualityStatus || data.ocr_quality_status || 'to_review'
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
        db.prepare(`UPDATE documents SET linked_transaction_id = ?, status = 'matched', payment_status = 'paid' WHERE id = ?`).run(transactionId, documentId);

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

    const amount = Number(doc.amount_ttc || doc.detected_amount || 0);
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




function normalizeAliasKeyV042(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getThirdPartyIntelligenceRulesV042(withType = false) {
    const rules = [
        [/\bMMA\s*IARD\b|\bMMA\b/, 'MMA IARD', 'Mutuelle'],
        [/\bALLIANZ\b/, 'Allianz', 'Mutuelle'],
        [/\bAXA\b/, 'AXA', 'Mutuelle'],
        [/\bVIAMEDIS\b/, 'Viamedis', 'Mutuelle'],
        [/\bALMERYS\b/, 'Almerys', 'Mutuelle'],
        [/\bACTIL\b/, 'Actil', 'Mutuelle'],
        [/\bCETIP\b/, 'CETIP', 'Mutuelle'],
        [/\bOXANTIS\b/, 'Oxantis', 'Mutuelle'],
        [/\bKORELIO\b/, 'Korelio', 'Mutuelle'],
        [/\bSP\s*SANTE\b|\bSPSANTE\b/, 'SP Santé', 'Mutuelle'],
        [/\bHARMONIE\b/, 'Harmonie Mutuelle', 'Mutuelle'],
        [/\bMALAKOFF\b|\bHUMANIS\b/, 'Malakoff Humanis', 'Mutuelle'],
        [/\bAG2R\b|\bREUNICA\b/, 'AG2R La Mondiale', 'Mutuelle'],
        [/\bCPAM\b|SECURITE\s*SOCIALE/, 'CPAM', 'Mutuelle'],
        [/\bDGFIP\b/, 'DGFIP', 'organisme'],
        [/\bURSSAF\b/, 'URSSAF', 'organisme'],
        [/GRAND\s*VISION|GRANDVISION/, 'GrandVision', 'fournisseur'],
        [/\bEDENRED\b/, 'Edenred', 'fournisseur'],
        [/CREDIT\s*AGRICOLE|\bCRCAM\b/, 'Crédit Agricole', 'banque'],
        [/ELECTRICITE\s*DE\s*FRANCE|\bEDF\b/, 'EDF', 'fournisseur'],
        [/\bENGIE\b/, 'Engie', 'fournisseur'],
        [/TOTAL\s*ENERGIES|TOTALENERGIES/, 'TotalEnergies', 'fournisseur'],
        [/\bORANGE\b/, 'Orange', 'fournisseur'],
        [/\bAUTOROUTES\b/, 'Autoroutes du Sud', 'fournisseur'],
        [/\bMULTITEK\b/, 'Multitek Services', 'fournisseur'],
        [/EURO\s*CLIMAT/, 'Euro Climat', 'fournisseur'],
        [/\bJAYET\b/, 'Jayet', 'fournisseur'],
        [/VERSEMENT\s+MONTAUROUX/, 'Versement Montauroux SAS', 'client']
    ];
    return withType ? rules : rules.map(([pattern, name]) => [pattern, name]);
}

function getLearnedThirdPartyAliasV042(label) {
    const key = normalizeAliasKeyV042(label);
    if (!key) return null;
    return db.prepare(`SELECT * FROM third_party_aliases WHERE alias_key = ?`).get(key) || null;
}

function saveThirdPartyAliasV042(aliasLabel, canonicalName, type = 'autre', mode = 'merge') {
    const aliasKey = normalizeAliasKeyV042(aliasLabel);
    const canonical = String(canonicalName || '').trim();
    if (!aliasKey || !canonical) return { ok: false };
    db.prepare(`
        INSERT INTO third_party_aliases(alias_key, alias_label, canonical_name, type, mode)
        VALUES(?, ?, ?, ?, ?)
        ON CONFLICT(alias_key) DO UPDATE SET
            alias_label = excluded.alias_label,
            canonical_name = excluded.canonical_name,
            type = excluded.type,
            mode = excluded.mode
    `).run(aliasKey, String(aliasLabel || '').trim(), canonical, String(type || 'autre'), String(mode || 'merge'));
    return { ok: true };
}

function cleanThirdPartyLabel(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\bFR[0-9A-Z]{8,}\b/gi, ' ')
        .replace(/\b[A-F0-9]{16,}\b/gi, ' ')
        .replace(/\b\d{6,}\b/g, ' ')
        .replace(/\b\d{1,2}[H:]\d{0,2}\b/gi, ' ')
        .replace(/\b\d{2}[./-]\d{2}(?:[./-]\d{2,4})?\b/g, ' ')
        .replace(/\b(FACTURE|FAC|REF|RUM|CORE|B2B|MANDAT|IBAN|VIREMENT|VIRE|VIR|INST|WEB|PRLV|PRELEVEMENT|REMISE|CARTE|COM|TP)\b/gi, ' ')
        .replace(/[\-_:/.,;()\[\]{}]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function inferThirdPartyFromLabel(label) {
    const raw = String(label || '');
    const value = cleanThirdPartyLabel(raw).toUpperCase();
    const rawUpper = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();

    const rules = getThirdPartyIntelligenceRulesV042(true);

    const found = rules.find(([pattern]) => pattern.test(rawUpper) || pattern.test(value));
    if (found) return { name: found[1], type: found[2] };

    let cleaned = cleanThirdPartyLabel(raw)
        .replace(/^(SAS|SARL|SA|EURL|SCI|SELARL)\s+/i, '')
        .replace(/\s+(SAS|SARL|SA|EURL|SCI|SELARL)$/i, '')
        .trim();

    cleaned = cleaned.split(/\s+(FACTURE|REF|RUM|CORE|B2B|TP|VIR)\b/i)[0].trim();
    cleaned = cleaned.replace(/\b[A-Z]{0,4}\d{3,}[A-Z0-9]*\b/gi, ' ').replace(/\s+/g, ' ').trim();

    return {
        name: cleaned ? cleaned.slice(0, 80) : 'Non identifié',
        type: 'autre'
    };
}


function getOrCreateThirdParty(companyId, name, type = 'autre') {
    if (!companyId || !name) return null;

    const canonical = getCanonicalThirdPartyName(name);
    const key = normalizeThirdPartyName(canonical);
    const candidates = db.prepare(`
        SELECT *
        FROM third_parties
        WHERE company_id = ?
    `).all(companyId);

    const existing = candidates.find(row => normalizeThirdPartyName(row.name) === key);
    if (existing) {
        if (existing.name !== canonical) {
            db.prepare(`UPDATE third_parties SET name = ? WHERE id = ?`).run(canonical, existing.id);
            db.prepare(`UPDATE bank_transactions SET third_party_name = ? WHERE third_party_id = ?`).run(canonical, existing.id);
            return db.prepare(`SELECT * FROM third_parties WHERE id = ?`).get(existing.id);
        }
        return existing;
    }

    const result = db.prepare(`
        INSERT INTO third_parties(company_id, name, type)
        VALUES(?, ?, ?)
    `).run(companyId, canonical, type);

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

    if (rows.length) applyBusinessRulesToThirdPartiesV0423({ companyId, force: false });
    return rows.length;
}


function getThirdPartyTypeOptionsV0423() {
    const defaults = ['Mutuelle', 'Tiers-payant', 'fournisseur', 'client', 'organisme', 'banque', 'assurance', 'administration', 'autre'];
    const existing = db.prepare(`SELECT DISTINCT type FROM third_parties WHERE type IS NOT NULL AND TRIM(type) != ''`).all().map(row => row.type);
    return Array.from(new Set([...defaults, ...existing]))
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' }));
}

function applyBusinessRulesToThirdPartiesV0423(options = {}) {
    const companyId = options.companyId ? Number(options.companyId) : null;
    const thirdPartyIds = Array.isArray(options.thirdPartyIds) ? options.thirdPartyIds.map(Number).filter(Boolean) : [];
    const force = options.force !== false;

    const where = [];
    const params = [];
    where.push(`tp.type IS NOT NULL`);
    where.push(`LOWER(REPLACE(REPLACE(REPLACE(tp.type, '-', ''), ' ', ''), '_', '')) IN ('mutuelle','tierspayant')`);
    if (companyId) {
        where.push(`ba.company_id = ?`);
        params.push(companyId);
    }
    if (thirdPartyIds.length) {
        where.push(`tp.id IN (${thirdPartyIds.map(() => '?').join(',')})`);
        params.push(...thirdPartyIds);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const sql = force ? `
        UPDATE bank_transactions
        SET category = 'Tiers-Payant',
            status = 'verified',
            notes = TRIM(COALESCE(notes, '') || CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE '
' END || 'Règle métier : type Mutuelle → Tiers-Payant / Vérifié'),
            search_text = NULL
        WHERE id IN (
            SELECT t.id
            FROM bank_transactions t
            LEFT JOIN third_parties tp ON tp.id = t.third_party_id
            LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
            ${whereSql}
        )
    ` : `
        UPDATE bank_transactions
        SET category = CASE WHEN category IS NULL OR category = '' THEN 'Tiers-Payant' ELSE category END,
            status = CASE WHEN status IS NULL OR status = '' OR status = 'missing' OR status = 'review' THEN 'verified' ELSE status END,
            notes = TRIM(COALESCE(notes, '') || CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE '
' END || 'Règle métier : type Mutuelle → Tiers-Payant / Vérifié'),
            search_text = NULL
        WHERE id IN (
            SELECT t.id
            FROM bank_transactions t
            LEFT JOIN third_parties tp ON tp.id = t.third_party_id
            LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
            ${whereSql}
        )
    `;
    const result = db.prepare(sql).run(...params);

    const changedRows = db.prepare(`
        SELECT id, label, category, notes, pdf_source, amount
        FROM bank_transactions
        WHERE search_text IS NULL
    `).all();
    const updateSearch = db.prepare(`UPDATE bank_transactions SET search_text = ? WHERE id = ?`);
    changedRows.forEach(row => updateSearch.run(buildTransactionSearchText(row), row.id));

    return { updated: result.changes || 0 };
}

function getThirdParties(companyId = null, filters = {}) {
    const year = filters && filters.year && filters.year !== 'all' ? String(filters.year) : null;
    const where = [];
    const params = [];

    if (companyId) {
        where.push('ba.company_id = ?');
        params.push(companyId);
    }

    if (year) {
        where.push(`COALESCE(s.statement_year, substr(t.date_operation, -4)) = ?`);
        params.push(year);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = db.prepare(`
        SELECT
            tp.id,
            tp.company_id,
            tp.name,
            tp.type,
            tp.notes,
            COUNT(t.id) AS operations_count,
            COALESCE(SUM(t.amount), 0) AS balance,
            COALESCE(SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END), 0) AS debit_total,
            COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) AS credit_total
        FROM third_parties tp
        LEFT JOIN bank_transactions t ON t.third_party_id = tp.id
        LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
        LEFT JOIN statements s ON s.id = t.statement_id
        ${whereSql}
        GROUP BY tp.id
    `).all(...params);

    const grouped = new Map();
    rows.forEach(row => {
        const canonical = getCanonicalThirdPartyName(row.name);
        const key = normalizeThirdPartyName(canonical);
        if (!key) return;
        if (!grouped.has(key)) {
            grouped.set(key, {
                ...row,
                id: row.id,
                third_party_ids: [row.id],
                name: canonical,
                type: row.type || 'autre',
                operations_count: 0,
                balance: 0,
                debit_total: 0,
                credit_total: 0
            });
        }
        const target = grouped.get(key);
        target.third_party_ids.push(row.id);
        if (!target.type || target.type === 'autre') target.type = row.type || 'autre';
        target.operations_count += Number(row.operations_count || 0);
        target.balance += Number(row.balance || 0);
        target.debit_total += Number(row.debit_total || 0);
        target.credit_total += Number(row.credit_total || 0);
    });

    return Array.from(grouped.values())
        .filter(row => Number(row.operations_count || 0) > 0)
        .sort((a, b) => Number(b.debit_total || 0) - Number(a.debit_total || 0) || Number(b.credit_total || 0) - Number(a.credit_total || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' }));
}

function getThirdPartyYears(companyId = null) {
    const where = companyId ? 'WHERE ba.company_id = ?' : '';
    const params = companyId ? [companyId] : [];
    return db.prepare(`
        SELECT DISTINCT COALESCE(s.statement_year, substr(t.date_operation, -4)) AS year
        FROM bank_transactions t
        LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
        LEFT JOIN statements s ON s.id = t.statement_id
        ${where}
        AND COALESCE(s.statement_year, substr(t.date_operation, -4)) IS NOT NULL
        AND COALESCE(s.statement_year, substr(t.date_operation, -4)) != ''
        ORDER BY year DESC
    `.replace('WHERE\n        AND', 'WHERE')).all(...params).map(row => row.year).filter(Boolean);
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
    const where = companyId ? 'WHERE d.company_id = ? AND d.deleted_at IS NULL' : 'WHERE d.deleted_at IS NULL';
    const params = companyId ? [companyId] : [];
    return db.prepare(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN d.status = 'matched' THEN 1 ELSE 0 END) AS matched,
            SUM(CASE WHEN d.status != 'matched' THEN 1 ELSE 0 END) AS unmatched,
            SUM(CASE WHEN d.doc_type = 'releve' THEN 1 ELSE 0 END) AS statements,
            SUM(CASE WHEN d.doc_type = 'facture' THEN 1 ELSE 0 END) AS invoices,
            COALESCE(SUM(CASE WHEN COALESCE(d.payment_status,'unknown') != 'paid' THEN COALESCE(d.amount_ttc, d.detected_amount, 0) ELSE 0 END), 0) AS payable_ttc,
            COALESCE(SUM(COALESCE(d.amount_tva, 0)), 0) AS vat_detected,
            SUM(CASE WHEN d.due_date IS NOT NULL AND d.due_date != '' AND COALESCE(d.payment_status,'unknown') != 'paid' THEN 1 ELSE 0 END) AS invoices_with_due_date
        FROM documents d
        ${where}
    `).get(...params);
}




function normalizeThirdPartyName(name) {
    return cleanThirdPartyLabel(name)
        .toUpperCase()
        .replace(/\b(SAS|SARL|SA|EURL|SCI|SELARL|SOCIETE|FRANCE|COMPANY|COMPAGNIE)\b/g, ' ')
        .replace(/\b(FR|FRA|VIRE|VIREMENT|PRLV|PRELEVEMENT|CARTE|PISP|FINTE)\b/g, ' ')
        .replace(/\b[A-Z]*\d+[A-Z0-9]*\b/g, ' ')
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getCanonicalThirdPartyName(name) {
    const source = String(name || '');
    const normalized = normalizeThirdPartyName(source);
    const upper = source.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const learned = getLearnedThirdPartyAliasV042(source);
    if (learned && learned.mode === 'merge') return learned.canonical_name;

    const rules = getThirdPartyIntelligenceRulesV042(false);
    const found = rules.find(([pattern]) => pattern.test(upper) || pattern.test(normalized));
    if (found) return found[1];

    const cleaned = cleanThirdPartyLabel(source)
        .replace(/^PISP\s+FINTE\s+/i, '')
        .replace(/\s+(SAS|SARL|SA|EURL|SCI|SELARL)$/i, '')
        .replace(/\b[A-F0-9]{12,}\b/gi, '')
        .replace(/\b[A-Z]*\d{4,}[A-Z0-9]*\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    return (cleaned || source || 'Non identifié').trim().slice(0, 80);
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

    let merged = 0;
    let renamed = 0;
    const mergeTx = db.transaction(() => {
        groups.forEach(items => {
            if (!items.length) return;
            items.sort((a, b) => String(a.name || '').length - String(b.name || '').length || a.id - b.id);
            const keeper = items[0];
            const canonical = keeper.canonical || keeper.name;
            if (keeper.name !== canonical) renamed += db.prepare(`UPDATE third_parties SET name = ? WHERE id = ?`).run(canonical, keeper.id).changes;

            items.slice(1).forEach(duplicate => {
                db.prepare(`
                    UPDATE bank_transactions
                    SET third_party_id = ?, third_party_name = ?
                    WHERE third_party_id = ? OR third_party_name = ?
                `).run(keeper.id, canonical, duplicate.id, duplicate.name);
                db.prepare(`DELETE FROM third_parties WHERE id = ?`).run(duplicate.id);
                merged += 1;
            });

            db.prepare(`
                UPDATE bank_transactions
                SET third_party_id = ?, third_party_name = ?
                WHERE bank_account_id IN (SELECT id FROM bank_accounts WHERE company_id = ?)
                AND third_party_name IS NOT NULL
                AND third_party_name != ''
                AND REPLACE(UPPER(third_party_name), ' ', '') = REPLACE(UPPER(?), ' ', '')
            `).run(keeper.id, canonical, keeper.company_id, canonical);
        });
    });

    mergeTx();
    return { scanned: rows.length, merged, renamed };
}


function updateThirdPartyTypeEverywhere(thirdPartyIds = [], type = 'autre') {
    const ids = Array.isArray(thirdPartyIds) ? thirdPartyIds.map(Number).filter(Boolean) : [];
    const cleanType = String(type || 'autre').trim() || 'autre';
    if (!ids.length) return { updated: 0, transactionsUpdated: 0 };

    const rows = db.prepare(`SELECT * FROM third_parties WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    const keys = new Set(rows.map(row => normalizeThirdPartyName(getCanonicalThirdPartyName(row.name))).filter(Boolean));
    if (!keys.size) return { updated: 0, transactionsUpdated: 0 };

    const all = db.prepare(`SELECT id, name FROM third_parties`).all();
    const targetIds = all
        .filter(row => keys.has(normalizeThirdPartyName(getCanonicalThirdPartyName(row.name))))
        .map(row => row.id);

    if (!targetIds.length) return { updated: 0, transactionsUpdated: 0 };
    const result = db.prepare(`UPDATE third_parties SET type = ? WHERE id IN (${targetIds.map(() => '?').join(',')})`).run(cleanType, ...targetIds);
    const business = isMutuelleTypeV0423(cleanType)
        ? applyBusinessRulesToThirdPartiesV0423({ thirdPartyIds: targetIds, force: true })
        : { updated: 0 };
    return { updated: result.changes || 0, transactionsUpdated: business.updated || 0 };
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

    updateThirdPartyTypeEverywhere([thirdPartyId], type || current.type || 'autre');
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



function getOrCreateThirdPartyExactV042(companyId, name, type = 'autre') {
    if (!companyId || !name) return null;
    const cleanName = String(name || '').trim().slice(0, 80);
    const cleanType = String(type || 'autre').trim() || 'autre';
    if (!cleanName) return null;

    const existing = db.prepare(`
        SELECT * FROM third_parties
        WHERE company_id = ? AND UPPER(name) = UPPER(?)
    `).get(companyId, cleanName);

    if (existing) {
        if ((existing.type || 'autre') !== cleanType) {
            db.prepare(`UPDATE third_parties SET type = ? WHERE id = ?`).run(cleanType, existing.id);
            return db.prepare(`SELECT * FROM third_parties WHERE id = ?`).get(existing.id);
        }
        return existing;
    }

    const result = db.prepare(`
        INSERT INTO third_parties(company_id, name, type)
        VALUES(?, ?, ?)
    `).run(companyId, cleanName, cleanType);

    return db.prepare(`SELECT * FROM third_parties WHERE id = ?`).get(result.lastInsertRowid);
}

function splitThirdPartyByKeywordV042(data = {}) {
    const thirdPartyId = Number(data.thirdPartyId || 0);
    const keyword = String(data.keyword || '').trim();
    const newName = String(data.newName || '').trim();
    const newType = String(data.type || 'autre').trim() || 'autre';
    const neverMerge = Boolean(data.neverMerge);
    if (!thirdPartyId || !keyword || !newName) return { ok: false, updated: 0, message: 'Paramètres incomplets.' };

    const source = db.prepare(`SELECT * FROM third_parties WHERE id = ?`).get(thirdPartyId);
    if (!source) return { ok: false, updated: 0, message: 'Tiers introuvable.' };

    // Important : la dissociation doit créer le tiers exact demandé, sans repasser
    // par la canonisation automatique. Sinon "MMA IARD Arnaudo" est immédiatement
    // retransformé en "MMA IARD" puis refusionné, ce qui donnait un toast positif
    // sans changement visible.
    const target = getOrCreateThirdPartyExactV042(source.company_id, newName, newType);
    if (!target) return { ok: false, updated: 0, message: 'Impossible de créer le tiers de destination.' };

    const like = `%${keyword}%`;
    const result = db.prepare(`
        UPDATE bank_transactions
        SET third_party_id = ?, third_party_name = ?
        WHERE third_party_id = ?
          AND UPPER(label) LIKE UPPER(?)
    `).run(target.id, target.name, source.id, like);

    const aliasKey = normalizeAliasKeyV042(keyword);
    if (aliasKey) {
        db.prepare(`
            INSERT INTO third_party_split_exceptions(alias_key, alias_label, canonical_name)
            VALUES(?, ?, ?)
            ON CONFLICT(alias_key) DO UPDATE SET alias_label = excluded.alias_label, canonical_name = excluded.canonical_name
        `).run(aliasKey, keyword, target.name);
    }

    // On mémorise l'exception comme alias exact, mais on ne lance PAS cleanupThirdParties()
    // juste après : le nettoyage canonique regrouperait à nouveau le tiers dissocié.
    saveThirdPartyAliasV042(keyword, target.name, newType, neverMerge ? 'split' : 'merge');

    // Nettoyage léger : supprimer le tiers source s'il ne contient plus aucune opération.
    const remaining = db.prepare(`SELECT COUNT(*) AS count FROM bank_transactions WHERE third_party_id = ?`).get(source.id).count || 0;
    if (!remaining) db.prepare(`DELETE FROM third_parties WHERE id = ?`).run(source.id);

    return { ok: true, updated: result.changes || 0, target };
}



// V0.43 - Moteur technique / Paramètres structurés
function getTechnicalSettingsSnapshotV043(companyId = null) {
    const companyFilter = companyId ? 'WHERE company_id = ?' : '';
    const companyParams = companyId ? [companyId] : [];
    const counts = {
        companies: db.prepare('SELECT COUNT(*) AS count FROM companies').get().count || 0,
        bankAccounts: db.prepare('SELECT COUNT(*) AS count FROM bank_accounts').get().count || 0,
        statements: db.prepare('SELECT COUNT(*) AS count FROM statements').get().count || 0,
        transactions: db.prepare('SELECT COUNT(*) AS count FROM bank_transactions').get().count || 0,
        documents: db.prepare("SELECT COUNT(*) AS count FROM documents WHERE deleted_at IS NULL OR deleted_at = ''").get().count || 0,
        thirdParties: db.prepare('SELECT COUNT(*) AS count FROM third_parties').get().count || 0,
        aliases: db.prepare('SELECT COUNT(*) AS count FROM third_party_aliases').get().count || 0,
        automationRules: db.prepare('SELECT COUNT(*) AS count FROM automation_rules').get().count || 0,
        categoryRules: db.prepare('SELECT COUNT(*) AS count FROM category_rules').get().count || 0
    };
    const currentCompany = companyId ? {
        transactions: db.prepare(`
            SELECT COUNT(*) AS count
            FROM bank_transactions t
            JOIN bank_accounts ba ON ba.id = t.bank_account_id
            WHERE ba.company_id = ?
        `).get(companyId).count || 0,
        thirdParties: db.prepare('SELECT COUNT(*) AS count FROM third_parties WHERE company_id = ?').get(companyId).count || 0,
        documents: db.prepare("SELECT COUNT(*) AS count FROM documents WHERE company_id = ? AND (deleted_at IS NULL OR deleted_at = '')").get(companyId).count || 0
    } : null;
    return { counts, currentCompany };
}

function getThirdPartyAliasesV043() {
    return db.prepare(`
        SELECT id, alias_label, canonical_name, type, mode, created_at
        FROM third_party_aliases
        ORDER BY canonical_name COLLATE NOCASE, alias_label COLLATE NOCASE
    `).all();
}

function deleteThirdPartyAliasV043(aliasId) {
    const id = Number(aliasId || 0);
    if (!id) return { deleted: false };
    const result = db.prepare('DELETE FROM third_party_aliases WHERE id = ?').run(id);
    return { deleted: result.changes > 0 };
}

function getThirdPartyCanonicalListV043() {
    const rows = db.prepare(`
        SELECT
            name,
            COALESCE(NULLIF(type, ''), 'autre') AS type,
            COUNT(DISTINCT company_id) AS companies_count,
            COUNT(*) AS rows_count
        FROM third_parties
        GROUP BY LOWER(name)
        ORDER BY name COLLATE NOCASE
    `).all();
    return rows;
}

function createOrUpdateCanonicalThirdPartyV043(data = {}) {
    const name = String(data.name || '').trim();
    const type = String(data.type || 'autre').trim() || 'autre';
    if (!name) return { ok: false, message: 'Nom tiers obligatoire.' };
    const existing = db.prepare('SELECT id FROM third_parties WHERE LOWER(name) = LOWER(?) LIMIT 1').get(name);
    if (existing) {
        db.prepare('UPDATE third_parties SET name = ?, type = ? WHERE LOWER(name) = LOWER(?)').run(name, type, name);
        db.prepare('UPDATE bank_transactions SET third_party_name = ? WHERE LOWER(third_party_name) = LOWER(?)').run(name, name);
    } else {
        db.prepare('INSERT INTO third_parties(company_id, name, type) VALUES(NULL, ?, ?)').run(name, type);
    }
    return { ok: true };
}

function deleteCanonicalThirdPartyV043(name) {
    const value = String(name || '').trim();
    if (!value) return { deleted: false };
    const result = db.prepare('DELETE FROM third_parties WHERE LOWER(name) = LOWER(?) AND company_id IS NULL').run(value);
    return { deleted: result.changes > 0 };
}

function runTechnicalMaintenanceV043(data = {}) {
    const companyId = data.companyId ? Number(data.companyId) : null;
    const mode = String(data.mode || 'light');
    const result = { mode, thirdPartiesBackfilled: 0, thirdPartiesCleaned: null, businessRules: null, orphanDocumentsCleaned: null };
    if (mode === 'thirdParties' || mode === 'full' || mode === 'light') {
        result.thirdPartiesBackfilled = backfillThirdParties(companyId);
        result.thirdPartiesCleaned = cleanupThirdParties(companyId);
    }
    if (mode === 'businessRules' || mode === 'full' || mode === 'light') {
        result.businessRules = applyBusinessRulesToThirdPartiesV0423({ companyId, force: false });
    }
    if (mode === 'documents' || mode === 'full') {
        result.orphanDocumentsCleaned = cleanupOrphanDocumentLinks();
    }
    return result;
}

function saveThirdPartyAliasRuleV042(data = {}) {
    const result = saveThirdPartyAliasV042(data.aliasLabel, data.canonicalName, data.type || 'autre', data.mode || 'merge');
    if (result.ok) cleanupThirdParties(null);
    return result;
}

function getThirdPartyAliasPreviewV042(thirdPartyId) {
    const third = db.prepare(`SELECT * FROM third_parties WHERE id = ?`).get(Number(thirdPartyId || 0));
    if (!third) return { aliases: [] };
    const rows = db.prepare(`
        SELECT label, COUNT(*) AS operations_count
        FROM bank_transactions
        WHERE third_party_id = ?
        GROUP BY label
        ORDER BY operations_count DESC, label ASC
        LIMIT 80
    `).all(third.id);
    return { aliases: rows };
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
                finalPath = path.join(dir, `${base}_${String(count).padStart(2, '0')}${extension}`);
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

    const originalName = doc.original_filename || doc.filename;
    db.prepare(`UPDATE documents SET filename = ?, filepath = ?, original_filename = COALESCE(original_filename, ?), smart_filename = ?, smart_renamed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(finalName, finalPath, originalName, finalName, documentId);
    addDocumentHistory(documentId, 'Renommé', `${originalName} → ${finalName}`);
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

function updateAutomationRule(ruleId, data = {}) {
    return db.prepare(`
        UPDATE automation_rules
        SET company_id = ?, target = ?, keyword = ?, category = ?, status = ?, third_party_name = ?
        WHERE id = ?
    `).run(
        data.companyId || null,
        data.target || 'all',
        data.keyword || '',
        data.category || '',
        data.status || '',
        data.thirdPartyName || '',
        ruleId
    );
}


function normalizeAutomationTextV072(value = '') {
    return String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function addOrReinforceAutomationRuleV072(data = {}) {
    const keyword = String(data.keyword || '').trim();
    const category = String(data.category || '').trim();
    const target = String(data.target || 'label').trim() || 'label';
    const companyId = data.companyId || null;
    if (!keyword || !category) return { ok: false, reason: 'missing_keyword_or_category' };

    const existing = db.prepare(`
        SELECT * FROM automation_rules
        WHERE COALESCE(company_id, 0) = COALESCE(?, 0)
        AND lower(target) = lower(?)
        AND lower(keyword) = lower(?)
        LIMIT 1
    `).get(companyId, target, keyword);

    if (existing) {
        const nextUsage = Number(existing.usage_count || 0) + 1;
        const nextConfidence = Math.min(100, Math.max(Number(existing.confidence || 25), 20) + 15);
        db.prepare(`
            UPDATE automation_rules
            SET category = ?, status = COALESCE(NULLIF(?, ''), status), third_party_name = COALESCE(NULLIF(?, ''), third_party_name),
                confidence = ?, usage_count = ?, updated_at = CURRENT_TIMESTAMP, last_used_at = CURRENT_TIMESTAMP,
                source = COALESCE(NULLIF(source, ''), ?), is_active = 1,
                auto_apply = CASE WHEN ? >= 85 THEN 1 ELSE COALESCE(auto_apply, 0) END
            WHERE id = ?
        `).run(category, data.status || '', data.thirdPartyName || '', nextConfidence, nextUsage, data.source || 'learning', nextConfidence, existing.id);
        return { ok: true, id: existing.id, updated: true, confidence: nextConfidence, usageCount: nextUsage };
    }

    const result = db.prepare(`
        INSERT INTO automation_rules(company_id, target, keyword, category, status, third_party_name, confidence, usage_count, source, is_active, auto_apply, updated_at, last_used_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(companyId, target, keyword, category, data.status || '', data.thirdPartyName || '', Number(data.confidence || 35), 1, data.source || 'learning');
    return { ok: true, id: result.lastInsertRowid, created: true, confidence: Number(data.confidence || 35), usageCount: 1 };
}

function ruleMatchesTransactionV072(rule = {}, transaction = {}) {
    if (!rule || Number(rule.is_active || 1) === 0 || !rule.keyword) return false;
    const target = String(rule.target || 'label');
    const haystack = target === 'account_name'
        ? `${transaction.account_name || ''} ${transaction.bank_name || ''}`
        : target === 'third_party_name'
            ? `${transaction.third_party_name || ''}`
            : target === 'all'
                ? `${transaction.label || ''} ${transaction.account_name || ''} ${transaction.bank_name || ''} ${transaction.third_party_name || ''}`
                : `${transaction.label || ''}`;
    return normalizeAutomationTextV072(haystack).includes(normalizeAutomationTextV072(rule.keyword));
}

function getBankAutomationSuggestionsV072(data = {}) {
    const companyId = data.companyId || null;
    const bankAccountId = data.bankAccountId || null;
    const filters = [];
    const params = [];
    if (companyId) { filters.push('ba.company_id = ?'); params.push(companyId); }
    if (bankAccountId) { filters.push('t.bank_account_id = ?'); params.push(bankAccountId); }
    filters.push("(t.category IS NULL OR t.category = '')");
    const rows = db.prepare(`
        SELECT t.id, t.label, t.amount, t.date_operation, t.category, t.status, t.third_party_name, ba.account_name, ba.bank_name, ba.company_id
        FROM bank_transactions t
        LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
        WHERE ${filters.join(' AND ')}
        ORDER BY t.id DESC
        LIMIT 500
    `).all(...params);
    const rules = getAutomationRules(companyId).filter(rule => Number(rule.is_active || 1) !== 0 && rule.category);
    const suggestions = [];
    rows.forEach(row => {
        const matches = rules
            .filter(rule => ruleMatchesTransactionV072(rule, row))
            .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
        if (!matches.length) return;
        const rule = matches[0];
        suggestions.push({
            transactionId: row.id,
            label: row.label,
            amount: row.amount,
            dateOperation: row.date_operation,
            suggestedCategory: rule.category,
            suggestedStatus: rule.status || '',
            suggestedThirdPartyName: rule.third_party_name || '',
            confidence: Number(rule.confidence || 50),
            ruleId: rule.id,
            keyword: rule.keyword
        });
    });
    return suggestions;
}

function applyBankAutomationSuggestionsV072(data = {}) {
    const suggestions = Array.isArray(data.suggestions) && data.suggestions.length
        ? data.suggestions
        : getBankAutomationSuggestionsV072(data);
    const ids = Array.isArray(data.transactionIds) && data.transactionIds.length ? new Set(data.transactionIds.map(Number)) : null;
    let changed = 0;
    const update = db.prepare(`
        UPDATE bank_transactions
        SET category = ?,
            status = CASE WHEN ? <> '' THEN ? ELSE status END,
            third_party_name = CASE WHEN ? <> '' THEN ? ELSE third_party_name END,
            notes = TRIM(COALESCE(notes, '') || CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE '
' END || ?)
        WHERE id = ? AND (category IS NULL OR category = '')
    `);
    const bump = db.prepare(`UPDATE automation_rules SET usage_count = COALESCE(usage_count, 0) + 1, confidence = MIN(100, COALESCE(confidence, 50) + 5), last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
    const tx = db.transaction(() => {
        suggestions.forEach(s => {
            if (ids && !ids.has(Number(s.transactionId))) return;
            const result = update.run(s.suggestedCategory || '', s.suggestedStatus || '', s.suggestedStatus || '', s.suggestedThirdPartyName || '', s.suggestedThirdPartyName || '', `Automatisation V0.72 : ${s.keyword || ''}`, s.transactionId);
            if (result.changes) {
                changed += result.changes;
                if (s.ruleId) bump.run(s.ruleId);
            }
        });
    });
    tx();
    return { changed, suggested: suggestions.length };
}

function getAutomationStatsV072(companyId = null) {
    const ruleWhere = companyId ? 'WHERE company_id IS NULL OR company_id = ?' : '';
    const params = companyId ? [companyId] : [];
    const base = db.prepare(`
        SELECT COUNT(*) AS rules,
               AVG(COALESCE(confidence, 0)) AS avg_confidence,
               SUM(CASE WHEN COALESCE(is_active, 1) = 1 THEN 1 ELSE 0 END) AS active_rules,
               SUM(COALESCE(usage_count, 0)) AS usages
        FROM automation_rules ${ruleWhere}
    `).get(...params) || {};
    const suggestions = getBankAutomationSuggestionsV072({ companyId }).length;
    return {
        rules: Number(base.rules || 0),
        activeRules: Number(base.active_rules || 0),
        averageConfidence: Math.round(Number(base.avg_confidence || 0)),
        usages: Number(base.usages || 0),
        pendingSuggestions: suggestions
    };
}

function renameCategoryEverywhere(oldName, newName) {
    const oldValue = String(oldName || '').trim();
    const newValue = String(newName || '').trim();
    if (!oldValue || !newValue || oldValue === newValue) return { changed: 0 };

    const tx = db.transaction(() => {
        const a = db.prepare(`UPDATE bank_transactions SET category = ? WHERE category = ?`).run(newValue, oldValue);
        const b = db.prepare(`UPDATE automation_rules SET category = ? WHERE category = ?`).run(newValue, oldValue);
        const c = db.prepare(`UPDATE category_rules SET category = ? WHERE category = ?`).run(newValue, oldValue);
        return { changed: (a.changes || 0) + (b.changes || 0) + (c.changes || 0) };
    });
    return tx();
}



function updateCategoryUsage(oldName, mode = 'keep', newName = '') {
    const oldValue = String(oldName || '').trim();
    const replacement = String(newName || '').trim();
    const action = String(mode || 'keep');
    if (!oldValue) return { changed: 0 };
    if (action === 'keep') return { changed: 0 };

    const nextValue = action === 'replace' ? replacement : '';
    if (action === 'replace' && !nextValue) return { changed: 0 };

    const tx = db.transaction(() => {
        const a = db.prepare(`UPDATE bank_transactions SET category = ? WHERE lower(category) = lower(?)`).run(nextValue, oldValue);
        const b = db.prepare(`UPDATE automation_rules SET category = ? WHERE lower(category) = lower(?)`).run(nextValue, oldValue);
        const c = db.prepare(`UPDATE category_rules SET category = ? WHERE lower(category) = lower(?)`).run(nextValue, oldValue);
        return {
            changed: (a.changes || 0) + (b.changes || 0) + (c.changes || 0),
            transactions: a.changes || 0,
            automationRules: b.changes || 0,
            categoryRules: c.changes || 0
        };
    });
    return tx();
}

function deleteCategoryRule(ruleId) {
    return db.prepare(`DELETE FROM category_rules WHERE id = ?`).run(ruleId);
}

function applyAutomationRules(companyId = null) {
    const rules = getAutomationRules(companyId);
    let changed = 0;

    const update = db.prepare(`
        UPDATE bank_transactions
        SET category = CASE
                WHEN ? <> '' THEN ?
                ELSE category
            END,
            status = CASE
                WHEN ? <> '' AND (status IS NULL OR status = '' OR status = 'missing' OR status = 'review') THEN ?
                ELSE status
            END,
            third_party_name = CASE
                WHEN ? <> '' AND (third_party_name IS NULL OR third_party_name = '') THEN ?
                ELSE third_party_name
            END,
            notes = TRIM(COALESCE(notes, '') || CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE '\n' END || ?)
        WHERE id = ?
    `);

    const rows = db.prepare(`
        SELECT t.id, t.label, t.category, t.status, t.third_party_name, ba.account_name, ba.bank_name, ba.company_id
        FROM bank_transactions t
        LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
        ${companyId ? 'WHERE ba.company_id = ?' : ''}
    `).all(...(companyId ? [companyId] : []));

    const normalize = value => String(value || '').toLowerCase();
    const getHaystack = (row, target) => {
        if (target === 'account_name') return `${row.account_name || ''} ${row.bank_name || ''}`;
        if (target === 'label') return `${row.label || ''}`;
        if (target === 'third_party_name') return `${row.third_party_name || ''}`;
        return `${row.label || ''} ${row.account_name || ''} ${row.bank_name || ''} ${row.third_party_name || ''}`;
    };

    const applyTx = db.transaction(() => {
        rows.forEach(row => {
            rules.forEach(rule => {
                if (!rule.keyword) return;
                const haystack = normalize(getHaystack(row, rule.target || 'all'));
                if (!haystack.includes(normalize(rule.keyword))) return;

                const shouldUpdateCategory = rule.category && (!row.category || row.category === '');
                const shouldUpdateStatus = rule.status && (!row.status || row.status === '' || row.status === 'missing' || row.status === 'review');
                const shouldUpdateThirdParty = rule.third_party_name && (!row.third_party_name || row.third_party_name === '');
                if (!shouldUpdateCategory && !shouldUpdateStatus && !shouldUpdateThirdParty) return;

                const note = `Règle auto : ${rule.keyword}`;
                update.run(
                    rule.category || '', rule.category || '',
                    rule.status || '', rule.status || '',
                    rule.third_party_name || '', rule.third_party_name || '',
                    note,
                    row.id
                );
                changed += 1;

                if (shouldUpdateCategory) row.category = rule.category;
                if (shouldUpdateStatus) row.status = rule.status;
                if (shouldUpdateThirdParty) row.third_party_name = rule.third_party_name;
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
    const normalized = String(docType || 'facture').toLowerCase();
    const inferred = inferDocumentNatureV0456(normalized);
    const invoiceLike = ['facture', 'facture_client', 'avoir'].includes(normalized);
    const amountLike = ['facture', 'facture_client', 'avoir', 'don', 'divers'].includes(normalized);
    const doc = getDocument(documentId) || {};
    const titleFallback = doc.document_title || doc.detected_supplier || doc.detected_reference || String(doc.filename || '').replace(/\.[^.]+$/, '');

    const result = db.prepare(`
        UPDATE documents
        SET doc_type = ?,
            accounting_impact = ?,
            document_nature = ?,
            invoice_number = CASE WHEN ? THEN invoice_number ELSE NULL END,
            detected_reference = CASE WHEN ? THEN detected_reference ELSE NULL END,
            due_date = CASE WHEN ? OR ? = 'contrat' THEN due_date ELSE NULL END,
            planned_payment_date = CASE WHEN ? THEN planned_payment_date ELSE NULL END,
            payment_method = CASE WHEN ? OR ? = 'don' THEN payment_method ELSE NULL END,
            payment_schedule_json = CASE WHEN ? THEN payment_schedule_json ELSE NULL END,
            amount_ht = CASE WHEN ? THEN amount_ht ELSE NULL END,
            amount_tva = CASE WHEN ? THEN amount_tva ELSE NULL END,
            amount_ttc = CASE WHEN ? THEN amount_ttc ELSE NULL END,
            detected_amount = CASE WHEN ? THEN detected_amount ELSE NULL END,
            vat_rate = CASE WHEN ? THEN vat_rate ELSE NULL END,
            payment_status = CASE WHEN ? THEN payment_status ELSE 'not_required' END,
            linked_transaction_id = CASE WHEN ? THEN linked_transaction_id ELSE NULL END,
            status = CASE WHEN ? THEN status ELSE 'classified' END,
            document_title = COALESCE(NULLIF(document_title, ''), ?)
        WHERE id = ?
    `).run(
        normalized,
        inferred.impact,
        inferred.nature,
        invoiceLike ? 1 : 0,
        invoiceLike ? 1 : 0,
        invoiceLike ? 1 : 0,
        normalized,
        invoiceLike ? 1 : 0,
        invoiceLike ? 1 : 0,
        normalized,
        invoiceLike ? 1 : 0,
        invoiceLike ? 1 : 0,
        invoiceLike ? 1 : 0,
        amountLike ? 1 : 0,
        amountLike ? 1 : 0,
        invoiceLike ? 1 : 0,
        invoiceLike ? 1 : 0,
        invoiceLike ? 1 : 0,
        invoiceLike ? 1 : 0,
        titleFallback,
        documentId
    );
    addDocumentHistory(documentId, 'Type modifié', `Type = ${normalized}. Champs incompatibles supprimés automatiquement.`);
    return result;
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
        invoices: docs.filter(doc => ['facture', 'facture_client', 'avoir'].includes(doc.doc_type || 'facture')).length,
        statements: docs.filter(doc => doc.doc_type === 'releve').length,
        rib: docs.filter(doc => doc.doc_type === 'rib').length,
        contracts: docs.filter(doc => doc.doc_type === 'contrat').length,
        unmatched: docs.filter(doc => doc.status !== 'matched' && ['facture','facture_client','avoir'].includes(doc.doc_type || 'facture')).length,
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
            ecart_total,
            tva_brute,
            discount_tva,
            tva_nette,
            cofidis_total,
            amex_total,
            bank_remise_cash,
            bank_remise_check,
            bank_remise_deferred_check
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        Number(data.ecartTotal || 0),
        Number(data.tvaBrute || 0),
        Number(data.discountTva || 0),
        Number(data.tvaNette || data.tvaTotal || 0),
        Number(data.cofidisTotal || 0),
        Number(data.amexTotal || 0),
        Number(data.bankRemiseCash || 0),
        Number(data.bankRemiseCheck || 0),
        Number(data.bankRemiseDeferredCheck || 0)
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

function findCashSheetByCompanyPeriod(companyId = null, periodYear = '', periodMonth = '') {
    const normalizedMonth = String(periodMonth || '').padStart(2, '0');
    return db.prepare(`
        SELECT *
        FROM cash_sheets
        WHERE COALESCE(company_id, 0) = COALESCE(?, 0)
          AND period_year = ?
          AND period_month = ?
        ORDER BY imported_at DESC, id DESC
        LIMIT 1
    `).get(companyId || null, String(periodYear || ''), normalizedMonth);
}

function deleteCashSheetsByCompanyPeriod(companyId = null, periodYear = '', periodMonth = '') {
    const normalizedMonth = String(periodMonth || '').padStart(2, '0');
    return db.prepare(`
        DELETE FROM cash_sheets
        WHERE COALESCE(company_id, 0) = COALESCE(?, 0)
          AND period_year = ?
          AND period_month = ?
    `).run(companyId || null, String(periodYear || ''), normalizedMonth);
}

function deleteCashSheet(cashSheetId) {
    return db.prepare(`DELETE FROM cash_sheets WHERE id = ?`).run(cashSheetId);
}

function isCashSheetAmountPlausibleV0615(row = {}) {
    const maxMonthlyCa = 500000;
    const maxComponent = 250000;
    const values = [
        row.invoiced_ca,
        row.net_ca_ttc,
        row.net_ca_ht,
        row.tva_nette,
        row.tva_total,
        row.card_total,
        row.cash_total,
        row.check_total,
        row.cofidis_total,
        row.p3x_total,
        row.p4x_total,
        row.p10x_total,
        row.paylater_total,
        row.tiers_payant,
        row.acompte_total
    ].map(value => Number(value || 0));

    if (values.some(value => !Number.isFinite(value))) return false;
    if (Math.abs(Number(row.net_ca_ttc || row.invoiced_ca || 0)) > maxMonthlyCa) return false;
    if (values.some(value => Math.abs(value) > maxComponent)) return false;
    return true;
}

function getCashSheetInsights(companyId = null) {
    const allRows = getCashSheets(companyId);
    const invalidRows = allRows.filter(row => !isCashSheetAmountPlausibleV0615(row));
    const rows = allRows.filter(row => isCashSheetAmountPlausibleV0615(row));

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
    const totalTvaBrute = sum('tva_brute');
    const totalDiscountTva = sum('discount_tva');
    const totalTvaNette = sum('tva_nette') || Math.max(0, totalTvaBrute - totalDiscountTva) || Math.max(0, totalNetTtc - totalNetHt);
    const totalFinancing = sum('cofidis_total') || (sum('p3x_total') + sum('p4x_total') + sum('p10x_total') + sum('paylater_total'));
    const totalAmex = sum('amex_total');
    const totalBankRemiseCash = sum('bank_remise_cash');
    const totalBankRemiseCheck = sum('bank_remise_check');
    const totalBankRemiseDeferredCheck = sum('bank_remise_deferred_check');
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
                tva_brute: 0,
                discount_tva: 0,
                tva_nette: 0,
                invoiced_ca: 0,
                encaissements: 0,
                cash_total: 0,
                card_total: 0,
                check_total: 0,
                transfer_total: 0,
                amex_total: 0,
                cofidis_total: 0,
                p3x_total: 0,
                p4x_total: 0,
                p10x_total: 0,
                paylater_total: 0,
                bank_remise_cash: 0,
                bank_remise_check: 0,
                bank_remise_deferred_check: 0,
                tiers_payant: 0,
                acomptes: 0,
                ecarts: 0,
                count: 0
            };
        }

        const gross = Number(row.gross_ca_ht || 0);
        const discount = Number(row.discount_ht || 0);
        const netHt = Number(row.net_ca_ht || (gross - discount) || 0);
        const tvaBrute = Number(row.tva_brute || 0);
        const discountTva = Number(row.discount_tva || 0);
        const tvaNette = Number(row.tva_nette || (tvaBrute - discountTva) || Math.max(0, Number(row.net_ca_ttc || 0) - netHt) || 0);
        const netTtc = Number(row.net_ca_ttc || (netHt + tvaNette) || row.invoiced_ca || 0);

        byMonth[key].gross_ca_ht += gross;
        byMonth[key].discount_ht += discount;
        byMonth[key].net_ca_ht += netHt;
        byMonth[key].net_ca_ttc += netTtc;
        byMonth[key].tva_brute += tvaBrute;
        byMonth[key].discount_tva += discountTva;
        byMonth[key].tva_nette += tvaNette;
        const cashAmount = Number(row.cash_total || 0);
        const cardAmount = Number(row.card_total || 0);
        const checkAmount = Number(row.check_total || 0);
        const transferAmount = Number(row.transfer_total || 0);
        byMonth[key].invoiced_ca += netTtc;
        byMonth[key].cash_total += cashAmount;
        byMonth[key].card_total += cardAmount;
        byMonth[key].check_total += checkAmount;
        byMonth[key].transfer_total += transferAmount;
        byMonth[key].amex_total += Number(row.amex_total || 0);
        byMonth[key].p3x_total += Number(row.p3x_total || 0);
        byMonth[key].p4x_total += Number(row.p4x_total || 0);
        byMonth[key].p10x_total += Number(row.p10x_total || 0);
        byMonth[key].paylater_total += Number(row.paylater_total || 0);
        const cofidisFromDetails = Number(row.p3x_total || 0) + Number(row.p4x_total || 0) + Number(row.p10x_total || 0) + Number(row.paylater_total || 0);
        byMonth[key].cofidis_total += cofidisFromDetails || Number(row.cofidis_total || 0);
        byMonth[key].bank_remise_cash += Number(row.bank_remise_cash || 0);
        byMonth[key].bank_remise_check += Number(row.bank_remise_check || 0);
        byMonth[key].bank_remise_deferred_check += Number(row.bank_remise_deferred_check || 0);
        byMonth[key].encaissements += cashAmount + cardAmount + checkAmount + transferAmount;
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
        totalTvaBrute,
        totalDiscountTva,
        totalTvaNette,
        discountRate: totalGrossHt ? (totalDiscountHt / totalGrossHt) * 100 : 0,
        totalCash,
        totalCard,
        totalCheck,
        totalTransfer,
        totalTiersPayant,
        totalAcomptes,
        totalFinancing,
        totalAmex,
        totalBankRemiseCash,
        totalBankRemiseCheck,
        totalBankRemiseDeferredCheck,
        totalEcarts,
        variationNetTtc,
        byMonth: months.slice(-12),
        recent: allRows.slice(0, 12),
        invalidRows,
        ignoredInvalidCount: invalidRows.length,
        lastMonth,
        previousMonth
    };
}

function deleteInvalidCashSheetsV070(companyId = null) {
    const rows = getCashSheets(companyId).filter(row => !isCashSheetAmountPlausibleV0615(row));
    const tx = db.transaction(() => {
        rows.forEach(row => {
            db.prepare(`DELETE FROM cash_sheets WHERE id = ?`).run(row.id);
        });
    });
    tx();
    return { deleted: rows.length, ids: rows.map(row => row.id) };
}

function deriveCategoryRuleKeywordV070(label = '') {
    const normalized = String(label || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\b\d{2,}\b/g, ' ')
        .replace(/\bFR[0-9A-Z]{8,}\b/gi, ' ')
        .replace(/[^a-zA-Z ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const words = normalized.split(' ').filter(word => word.length >= 4);
    return words.slice(0, 3).join(' ') || normalized.slice(0, 40);
}

function learnCategoryFromTransactionV070(transactionId, category = '') {
    const cleanCategory = String(category || '').trim();
    if (!transactionId || !cleanCategory) return { learned: false };
    const row = getTransaction(transactionId);
    if (!row || !row.label) return { learned: false };
    const keyword = deriveCategoryRuleKeywordV070(row.label);
    if (!keyword || keyword.length < 4) return { learned: false };
    addCategoryRule(keyword, cleanCategory);
    const learnedRule = addOrReinforceAutomationRuleV072({
        companyId: row.company_id || null,
        target: 'label',
        keyword,
        category: cleanCategory,
        status: 'verified',
        source: 'bank_category_learning'
    });
    return { learned: true, keyword, category: cleanCategory, automationRule: learnedRule };
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


function statementSignedBalance(row) {
    if (!row || row.new_balance === null || row.new_balance === undefined) return null;
    const value = Number(row.new_balance || 0);
    const type = String(row.balance_type || '').toLowerCase();
    if (type.includes('déb') || type.includes('deb')) return -Math.abs(value);
    return Math.abs(value);
}

function getLatestStatementBalanceForAccount(bankAccountId) {
    const statement = db.prepare(`
        SELECT *
        FROM statements
        WHERE bank_account_id = ?
        AND new_balance IS NOT NULL
        ORDER BY
            COALESCE(statement_year, '') DESC,
            COALESCE(statement_month, '') DESC,
            imported_at DESC,
            id DESC
        LIMIT 1
    `).get(bankAccountId);

    const balance = statementSignedBalance(statement);
    return {
        statement,
        balance: balance === null ? 0 : balance,
        hasStatementBalance: balance !== null
    };
}

function getLatestStatementsTreasury(companyId) {
    const accounts = getBankAccounts(companyId);
    const rows = accounts.map(account => {
        const latest = getLatestStatementBalanceForAccount(account.id);
        return {
            account,
            statement: latest.statement || null,
            balance: latest.balance,
            hasStatementBalance: latest.hasStatementBalance
        };
    });

    return {
        total: rows.reduce((sum, row) => sum + Number(row.balance || 0), 0),
        accounts: rows,
        accountsWithBalance: rows.filter(row => row.hasStatementBalance).length,
        accountsCount: rows.length
    };
}

function getCompanyDashboard(companyId) {
    const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(companyId);
    if (!company) return null;

    const accounts = getBankAccounts(companyId);
    const accountSummaries = accounts.map(account => {
        const summary = getTransactionSummary(account.id, {});
        const insights = getDashboardInsights(account.id, {});
        const latestTreasury = getLatestStatementBalanceForAccount(account.id);
        const fallbackBalance = Number(summary.credit || 0) + Number(summary.debit || 0);
        const balance = latestTreasury.hasStatementBalance ? latestTreasury.balance : fallbackBalance;
        return {
            account,
            summary,
            insights,
            balance,
            latestStatement: latestTreasury.statement || null,
            hasStatementBalance: latestTreasury.hasStatementBalance
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
        treasury: getLatestStatementsTreasury(companyId),
        categories: [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, amount]) => ({ name, amount })),
        suppliers: [...supplierTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, amount]) => ({ name, amount })),
        cash
    };
}


// ===========================
// Focus Compta V0.45 - Moteur de rapprochement intelligent
// ===========================
function isoDateValueV045(value) {
    const text = String(value || '').trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`).getTime();
    const fr = text.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);
    if (fr) {
        const year = fr[3] ? (fr[3].length === 2 ? `20${fr[3]}` : fr[3]) : String(new Date().getFullYear());
        return new Date(`${year}-${String(fr[2]).padStart(2,'0')}-${String(fr[1]).padStart(2,'0')}T00:00:00`).getTime();
    }
    const d = Date.parse(text);
    return Number.isFinite(d) ? d : null;
}

function dateDeltaDaysV045(a, b) {
    const av = isoDateValueV045(a);
    const bv = isoDateValueV045(b);
    if (av === null || bv === null) return null;
    return Math.abs(Math.round((av - bv) / 86400000));
}

function scoreDocumentTransactionV045(doc, row) {
    const docAmount = Number(doc.amount_ttc || doc.detected_amount || 0);
    const txAmount = Math.abs(Number(row.amount || 0));
    const amountDelta = docAmount > 0 ? Math.abs(txAmount - Math.abs(docAmount)) : null;
    const docText = normalizeSearchText([doc.filename, doc.detected_supplier, doc.third_party_name, doc.detected_reference, doc.invoice_number].join(' '));
    const txText = normalizeSearchText([row.label, row.third_party_name, row.category, row.notes].join(' '));
    const tokens = docText.split(' ').filter(t => t.length >= 4).slice(0, 8);
    let score = 0;
    const reasons = [];

    if (amountDelta !== null) {
        if (amountDelta < 0.01) { score += 60; reasons.push('montant exact'); }
        else if (amountDelta <= 1) { score += 38; reasons.push('montant proche'); }
        else if (amountDelta <= Math.max(5, Math.abs(docAmount) * 0.02)) { score += 20; reasons.push('montant plausible'); }
    }

    tokens.forEach(token => {
        if (txText.includes(token)) {
            const points = token.length >= 7 ? 10 : 5;
            score += points;
            if (reasons.length < 4) reasons.push(`mot-clé ${token}`);
        }
    });

    const days = dateDeltaDaysV045(doc.invoice_date || doc.detected_date || doc.added_at, row.date_operation);
    if (days !== null) {
        if (days <= 3) { score += 18; reasons.push('date proche'); }
        else if (days <= 15) { score += 10; reasons.push('date cohérente'); }
        else if (days <= 45) { score += 4; reasons.push('date acceptable'); }
    }

    if ((row.receipts_count || 0) === 0) { score += 8; reasons.push('opération sans justificatif'); }
    if (String(row.status || '').toLowerCase() === 'verified') score -= 10;

    return {
        ...row,
        match_score: Math.max(0, Math.min(100, Math.round(score))),
        amount_delta: amountDelta,
        match_reasons: reasons.join(', ')
    };
}

function getSmartDocumentMatchesV045(companyId, documentId, limit = 10) {
    const doc = getDocument(documentId);
    if (!doc) return [];
    const rows = db.prepare(`
        SELECT t.*, s.filename AS statement_filename, s.filepath AS statement_filepath, ba.company_id, COUNT(r.id) AS receipts_count
        FROM bank_transactions t
        LEFT JOIN statements s ON s.id = t.statement_id
        LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
        LEFT JOIN receipts r ON r.transaction_id = t.id
        WHERE ba.company_id = ?
        GROUP BY t.id
        ORDER BY t.id DESC
        LIMIT 1500
    `).all(companyId);
    return rows
        .map(row => scoreDocumentTransactionV045(doc, row))
        .filter(row => row.match_score >= 15)
        .sort((a, b) => b.match_score - a.match_score || (a.amount_delta || 999999) - (b.amount_delta || 999999))
        .slice(0, Math.max(1, Math.min(Number(limit) || 10, 50)));
}

function autoReconcileDocumentsV045(companyId, threshold = 95, limit = 200) {
    const docs = getDocuments(companyId, { status: 'unmatched' })
        .filter(doc => ['facture','facture_client','avoir'].includes(String(doc.doc_type || 'facture').toLowerCase()))
        .slice(0, Math.max(1, Math.min(Number(limit) || 200, 1000)));
    let linked = 0;
    const details = [];
    for (const doc of docs) {
        const matches = getSmartDocumentMatchesV045(companyId, doc.id, 1);
        const best = matches[0];
        if (best && Number(best.match_score || 0) >= Number(threshold || 95)) {
            const result = linkDocumentToTransaction(doc.id, best.id);
            if (result && result.ok !== false) {
                linked += 1;
                details.push({ documentId: doc.id, document: doc.filename, transactionId: best.id, score: best.match_score, amount: best.amount });
            }
        }
    }
    return { ok: true, scanned: docs.length, linked, details };
}

function getAccountingAlertsV045(companyId) {
    const params = [companyId];
    const unmatchedDocuments = db.prepare(`
        SELECT COUNT(*) AS count
        FROM documents
        WHERE company_id = ?
        AND (deleted_at IS NULL OR deleted_at = '')
        AND COALESCE(status, '') != 'matched'
        AND COALESCE(doc_type, 'facture') IN ('facture','facture_client','avoir')
    `).get(...params).count || 0;

    const unpaidInvoices = db.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(COALESCE(amount_ttc, detected_amount, 0)),0) AS total
        FROM documents
        WHERE company_id = ?
        AND (deleted_at IS NULL OR deleted_at = '')
        AND COALESCE(doc_type, 'facture') = 'facture'
        AND COALESCE(status, '') != 'matched'
    `).get(...params);

    const today = new Date().toISOString().slice(0,10);
    const overdueInvoices = db.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(COALESCE(amount_ttc, detected_amount, 0)),0) AS total
        FROM documents
        WHERE company_id = ?
        AND (deleted_at IS NULL OR deleted_at = '')
        AND COALESCE(doc_type, 'facture') = 'facture'
        AND COALESCE(status, '') != 'matched'
        AND due_date IS NOT NULL AND due_date != '' AND due_date < ?
    `).get(companyId, today);

    const missingReceipts = db.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(ABS(t.amount)),0) AS total
        FROM bank_transactions t
        LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
        LEFT JOIN receipts r ON r.transaction_id = t.id
        WHERE ba.company_id = ?
        AND COALESCE(t.status, 'missing') != 'verified'
        AND r.id IS NULL
    `).get(companyId);

    const vat = db.prepare(`
        SELECT
            COALESCE(SUM(CASE WHEN COALESCE(amount_tva,0) > 0 THEN amount_tva ELSE 0 END),0) AS deductible,
            COALESCE(SUM(CASE WHEN COALESCE(amount_ttc, detected_amount,0) < 0 THEN ABS(amount_tva) ELSE 0 END),0) AS collected,
            COUNT(CASE WHEN amount_tva IS NULL AND COALESCE(doc_type,'facture') = 'facture' THEN 1 END) AS missingVatCount
        FROM documents
        WHERE company_id = ?
        AND (deleted_at IS NULL OR deleted_at = '')
    `).get(companyId);

    const thirdPartyReceived = db.prepare(`
        SELECT COALESCE(SUM(t.amount),0) AS total, COUNT(*) AS count
        FROM bank_transactions t
        LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
        WHERE ba.company_id = ?
        AND t.amount > 0
        AND LOWER(REPLACE(COALESCE(t.category,''), '-', ' ')) LIKE '%tiers payant%'
    `).get(companyId);

    return {
        unmatchedDocuments,
        unpaidInvoices: { count: unpaidInvoices.count || 0, total: unpaidInvoices.total || 0 },
        overdueInvoices: { count: overdueInvoices.count || 0, total: overdueInvoices.total || 0 },
        missingReceipts: { count: missingReceipts.count || 0, total: missingReceipts.total || 0 },
        vat: { deductible: vat.deductible || 0, collected: vat.collected || 0, missingVatCount: vat.missingVatCount || 0 },
        thirdPartyReceived: { count: thirdPartyReceived.count || 0, total: thirdPartyReceived.total || 0 }
    };
}

function normalize_text_for_like(value) {
    return normalizeSearchText(value).replace(/-/g, ' ');
}

function getReconciliationDashboardV045(companyId) {
    const alerts = getAccountingAlertsV045(companyId);
    const nextDue = db.prepare(`
        SELECT id, filename, detected_supplier, due_date, COALESCE(amount_ttc, detected_amount, 0) AS amount
        FROM documents
        WHERE company_id = ?
        AND (deleted_at IS NULL OR deleted_at = '')
        AND COALESCE(doc_type, 'facture') = 'facture'
        AND COALESCE(status, '') != 'matched'
        ORDER BY CASE WHEN due_date IS NULL OR due_date = '' THEN 1 ELSE 0 END, due_date ASC, id DESC
        LIMIT 10
    `).all(companyId);
    return { alerts, nextDue };
}


function normalizeDocumentSupplierV0452(value = '') {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^(sas|sarl|sa|eurl|selarl)\s+/i, '')
        .replace(/\s+(sas|sarl|sa|eurl|selarl)$/i, '')
        .trim();
}


function inferDocumentNatureV0456(docType) {
    const t = String(docType || 'facture').toLowerCase();
    if (['releve','rib','contrat','administratif','informatif'].includes(t)) return { nature: t === 'releve' ? 'banque' : t === 'informatif' ? 'informatif' : 'administratif', impact: 'no' };
    if (t === 'don' || t === 'divers') return { nature: 'comptable', impact: 'yes' };
    return { nature: 'comptable', impact: 'yes' };
}

function updateDocumentAccountingV0452(data = {}) {
    const documentId = Number(data.documentId || data.id || 0);
    if (!documentId) throw new Error('documentId manquant');

    const supplier = normalizeDocumentSupplierV0452(data.detectedSupplier || data.supplier || '');
    const amountHt = data.amountHt === '' || data.amountHt === undefined ? null : Number(data.amountHt);
    const amountTva = data.amountTva === '' || data.amountTva === undefined ? null : Number(data.amountTva);
    const amountTtc = data.amountTtc === '' || data.amountTtc === undefined ? null : Number(data.amountTtc);
    const vatRate = data.vatRate === '' || data.vatRate === undefined ? null : Number(data.vatRate);
    const validationStatus = data.validationStatus || 'validated';
    const paymentStatus = data.paymentStatus || 'unknown';
    const docTypeForNature = data.docType || data.doc_type || 'facture';
    const inferredNature = inferDocumentNatureV0456(docTypeForNature);
    const accountingImpact = data.accountingImpact || data.accounting_impact || inferredNature.impact;
    const documentNature = data.documentNature || data.document_nature || inferredNature.nature;
    const normalizedType = String(data.docType || data.doc_type || 'facture').toLowerCase();
    const invoiceTypes = ['facture', 'facture_client', 'avoir'];
    const amountTypes = ['facture', 'facture_client', 'avoir'];
    const isInvoiceLike = invoiceTypes.includes(normalizedType);
    const keepsAmounts = amountTypes.includes(normalizedType);
    const cleanInvoiceNumber = isInvoiceLike ? (data.invoiceNumber || data.detectedReference || '') : '';
    const cleanDueDate = isInvoiceLike ? (data.dueDate || '') : '';
    const cleanAmountHt = isInvoiceLike && Number.isFinite(amountHt) ? amountHt : null;
    const cleanAmountTva = isInvoiceLike && Number.isFinite(amountTva) ? amountTva : null;
    const cleanAmountTtc = keepsAmounts && Number.isFinite(amountTtc) ? amountTtc : null;
    const cleanVatRate = isInvoiceLike && Number.isFinite(vatRate) ? vatRate : null;
    const cleanPaymentStatus = isInvoiceLike ? paymentStatus : 'not_required';
    const cleanPlannedPaymentDate = isInvoiceLike ? (data.plannedPaymentDate || data.planned_payment_date || '') : '';
    const cleanPaymentMethod = isInvoiceLike || normalizedType === 'don' ? (data.paymentMethod || data.payment_method || '') : '';
    const cleanPaymentSchedule = isInvoiceLike ? (data.paymentScheduleJson || data.payment_schedule_json || '') : '';
    const cleanTitle = String(data.documentTitle || data.document_title || data.title || '').trim();
    const cleanNotes = String(data.documentNotes || data.document_notes || data.notes || '').trim();

    db.prepare(`
        UPDATE documents
        SET
            doc_type = ?,
            detected_supplier = ?,
            third_party_name = ?,
            detected_reference = ?,
            invoice_number = ?,
            detected_date = ?,
            invoice_date = ?,
            due_date = ?,
            detected_amount = ?,
            amount_ht = ?,
            amount_tva = ?,
            amount_ttc = ?,
            vat_rate = ?,
            payment_status = ?,
            validation_status = ?,
            planned_payment_date = ?,
            payment_method = ?,
            payment_schedule_json = ?,
            ocr_quality_status = ?,
            accounting_impact = ?,
            document_nature = ?,
            document_title = ?,
            document_notes = ?
        WHERE id = ?
    `).run(
        normalizedType,
        supplier,
        supplier,
        cleanInvoiceNumber,
        cleanInvoiceNumber,
        data.invoiceDate || data.detectedDate || '',
        data.invoiceDate || data.detectedDate || '',
        cleanDueDate,
        cleanAmountTtc,
        cleanAmountHt,
        cleanAmountTva,
        cleanAmountTtc,
        cleanVatRate,
        cleanPaymentStatus,
        validationStatus,
        cleanPlannedPaymentDate,
        cleanPaymentMethod,
        cleanPaymentSchedule,
        data.ocrQualityStatus || data.ocr_quality_status || validationStatus,
        accountingImpact,
        documentNature,
        cleanTitle,
        cleanNotes,
        documentId
    );

    return getDocument(documentId);
}


function saveUserLearningEvent(data = {}) {
    const companyId = data.companyId || data.company_id || null;
    const eventType = String(data.eventType || data.event_type || '').trim();
    const entityType = String(data.entityType || data.entity_type || '').trim();
    if (!eventType || !entityType) return { ok: false, reason: 'eventType/entityType manquant' };
    const entityId = data.entityId === undefined || data.entityId === null ? '' : String(data.entityId);
    const sourceValue = data.sourceValue === undefined || data.sourceValue === null ? '' : String(data.sourceValue).slice(0, 500);
    const targetValue = data.targetValue === undefined || data.targetValue === null ? '' : String(data.targetValue).slice(0, 500);
    const payloadJson = JSON.stringify(data.payload || {});
    const result = db.prepare(`
        INSERT INTO user_learning_events(company_id, event_type, entity_type, entity_id, source_value, target_value, payload_json)
        VALUES(?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id, event_type, entity_type, entity_id, source_value, target_value)
        DO UPDATE SET payload_json = excluded.payload_json, created_at = CURRENT_TIMESTAMP
    `).run(companyId, eventType, entityType, entityId, sourceValue, targetValue, payloadJson);
    return { ok: true, changes: result.changes };
}

function getUserLearningEvents(data = {}) {
    const where = [];
    const params = [];
    if (data.companyId || data.company_id) { where.push('(company_id = ? OR company_id IS NULL)'); params.push(data.companyId || data.company_id); }
    if (data.eventType || data.event_type) { where.push('event_type = ?'); params.push(data.eventType || data.event_type); }
    if (data.entityType || data.entity_type) { where.push('entity_type = ?'); params.push(data.entityType || data.entity_type); }
    return db.prepare(`
        SELECT *
        FROM user_learning_events
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY created_at DESC
        LIMIT 500
    `).all(...params);
}

function saveDocumentLearningRuleV0452(data = {}) {
    const supplier = normalizeDocumentSupplierV0452(data.supplier || data.detectedSupplier || '');
    const fieldName = String(data.fieldName || '').trim();
    if (!supplier || !fieldName) return { changes: 0 };
    const companyId = data.companyId || null;
    const keyword = String(data.keyword || supplier).trim().toLowerCase();
    const learnedValue = data.learnedValue === undefined || data.learnedValue === null ? '' : String(data.learnedValue);
    const sourceLabel = String(data.sourceLabel || '').slice(0, 500);

    return db.prepare(`
        INSERT INTO document_learning_rules(company_id, supplier, field_name, learned_value, keyword, source_label, active, usage_count)
        VALUES(?, ?, ?, ?, ?, ?, 1, 0)
        ON CONFLICT(company_id, supplier, field_name, keyword)
        DO UPDATE SET learned_value = excluded.learned_value, source_label = excluded.source_label, active = 1, updated_at = CURRENT_TIMESTAMP
    `).run(companyId, supplier, fieldName, learnedValue, keyword, sourceLabel);
}

function saveDocumentLearningRulesV0452(data = {}) {
    const rules = Array.isArray(data.rules) ? data.rules : [];
    const tx = db.transaction(() => {
        let count = 0;
        for (const rule of rules) {
            const result = saveDocumentLearningRuleV0452({ ...rule, companyId: data.companyId ?? rule.companyId });
            count += result.changes || 0;
        }
        return count;
    });
    return { saved: tx() };
}

function getDocumentLearningRulesV0452(data = {}) {
    const companyId = data.companyId || null;
    const supplier = normalizeDocumentSupplierV0452(data.supplier || '');
    const where = ['active = 1'];
    const params = [];
    if (companyId) { where.push('(company_id = ? OR company_id IS NULL)'); params.push(companyId); }
    if (supplier) { where.push('LOWER(supplier) = LOWER(?)'); params.push(supplier); }
    return db.prepare(`
        SELECT *
        FROM document_learning_rules
        WHERE ${where.join(' AND ')}
        ORDER BY supplier COLLATE NOCASE, field_name COLLATE NOCASE, updated_at DESC
    `).all(...params);
}

function deleteDocumentLearningRuleV0452(id) {
    return db.prepare('UPDATE document_learning_rules SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(id));
}

function applyDocumentLearningToAnalysisV0452(analysis = {}, companyId = null) {
    const supplier = normalizeDocumentSupplierV0452(analysis.detectedSupplier || analysis.supplier || '');
    if (!supplier) return analysis;
    const rules = getDocumentLearningRulesV0452({ companyId, supplier });
    if (!rules.length) return analysis;
    const next = { ...analysis, learningApplied: true };
    // Sécurité V0.45.2 : on applique automatiquement uniquement l'identité fournisseur.
    // Les corrections de montants/dates sont mémorisées et visibles dans Paramètres,
    // mais ne sont pas recopiées comme valeurs fixes sur une facture suivante.
    // Elles serviront à enrichir les heuristiques sans créer de fausses écritures.
    for (const rule of rules) {
        if (['supplier', 'detectedSupplier'].includes(rule.field_name)) {
            next.detectedSupplier = rule.learned_value;
        }
    }
    rules.forEach(rule => db.prepare('UPDATE document_learning_rules SET usage_count = COALESCE(usage_count, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(rule.id));
    return next;
}

function getDocumentsToValidateV0452(companyId = null) {
    const where = [`(deleted_at IS NULL OR deleted_at = '')`, `COALESCE(validation_status, 'pending') != 'validated'`];
    const params = [];
    if (companyId) { where.push('company_id = ?'); params.push(companyId); }
    return db.prepare(`
        SELECT *
        FROM documents
        WHERE ${where.join(' AND ')}
        ORDER BY added_at DESC, id DESC
        LIMIT 200
    `).all(...params);
}


// V0.45.6 : rapprochements multiples, exports comptables et archives mensuelles.
function safeFilenameV0456(value, fallback = 'document') {
    const clean = String(value || fallback)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 140);
    return clean || fallback;
}

function parseAccountingDateV0456(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { year: m[1], month: m[2], day: m[3] };
    m = raw.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
    if (m) return { year: m[3], month: m[2], day: m[1] };
    return null;
}

function getDocumentAccountingPeriodV0456(doc = {}) {
    const parsed = parseAccountingDateV0456(doc.invoice_date || doc.detected_date || doc.added_at);
    if (parsed) return parsed;
    const now = new Date();
    return { year: String(now.getFullYear()), month: String(now.getMonth() + 1).padStart(2, '0'), day: '01' };
}

function syncDocumentAccountingPeriodV0456(documentId) {
    const doc = getDocument(documentId);
    if (!doc) return null;
    const period = getDocumentAccountingPeriodV0456(doc);
    db.prepare(`UPDATE documents SET accounting_period_year = ?, accounting_period_month = ? WHERE id = ?`).run(period.year, period.month, documentId);
    return period;
}

function getDocumentPaymentSummaryV0456(documentId) {
    const doc = getDocument(documentId);
    if (!doc) return null;
    const links = db.prepare(`
        SELECT l.*, t.date_operation, t.label, t.amount AS transaction_amount
        FROM document_transaction_links l
        LEFT JOIN bank_transactions t ON t.id = l.transaction_id
        WHERE l.document_id = ?
        ORDER BY t.date_operation, l.id
    `).all(documentId);
    const invoiceAmount = Math.abs(Number(doc.amount_ttc ?? doc.detected_amount ?? 0));
    const linkedAmount = links.reduce((sum, link) => sum + Math.abs(Number(link.amount ?? link.transaction_amount ?? 0)), 0);
    const remaining = Math.max(0, invoiceAmount - linkedAmount);
    return { doc, links, invoiceAmount, linkedAmount, remaining, completeness: invoiceAmount > 0 ? Math.min(100, Math.round((linkedAmount / invoiceAmount) * 100)) : 0 };
}

function candidateDocumentPoolForTransactionV0456(companyId, tx, limit = 80) {
    const txDate = parseAccountingDateV0456(tx.date_operation || '') || {};
    const label = normalizeSearchText(tx.label || '');
    const tokens = label.split(' ').filter(t => t.length >= 4).slice(0, 8);
    const rows = db.prepare(`
        SELECT d.*
        FROM documents d
        WHERE d.company_id = ?
        AND (d.deleted_at IS NULL OR d.deleted_at = '')
        AND COALESCE(d.accounting_impact, 'yes') != 'no'
        AND COALESCE(d.doc_type, 'facture') NOT IN ('releve','rib','contrat','divers')
        AND (COALESCE(d.status, 'unmatched') != 'matched' OR d.linked_transaction_id IS NULL)
        AND COALESCE(d.amount_ttc, d.detected_amount, 0) > 0
        ORDER BY COALESCE(d.invoice_date, d.detected_date, d.added_at) DESC, d.id DESC
        LIMIT ?
    `).all(companyId, Math.max(10, Math.min(Number(limit) || 80, 250)));

    return rows.map(doc => {
        const supplier = normalizeSearchText(doc.detected_supplier || doc.third_party_name || doc.filename || '');
        let supplierScore = 0;
        tokens.forEach(token => { if (supplier.includes(token)) supplierScore += token.length >= 6 ? 12 : 6; });
        if (!supplierScore && supplier && label.includes(supplier.split(' ')[0])) supplierScore += 8;
        const period = getDocumentAccountingPeriodV0456(doc);
        let dateScore = 0;
        if (txDate.year && period.year === txDate.year) dateScore += 3;
        if (txDate.month && Math.abs(Number(period.month) - Number(txDate.month)) <= 2) dateScore += 4;
        return { ...doc, _matchScore: supplierScore + dateScore, _amount: Math.abs(Number(doc.amount_ttc ?? doc.detected_amount ?? 0)) };
    }).filter(doc => doc._matchScore > 0 || rows.length <= 30)
      .sort((a, b) => b._matchScore - a._matchScore || b.id - a.id)
      .slice(0, 24);
}

function findBestDocumentSubsetV0456(candidates, targetAmount, tolerance = 0.02) {
    const target = Math.abs(Number(targetAmount || 0));
    const usable = candidates
        .filter(d => Number.isFinite(d._amount) && d._amount > 0 && d._amount <= target + Math.max(tolerance, 1))
        .slice(0, 18);
    let best = { docs: [], total: 0, remaining: target, completeness: 0, exact: false };
    const maxNodes = 1 << Math.min(usable.length, 18);
    for (let mask = 1; mask < maxNodes; mask++) {
        let total = 0;
        let docs = [];
        let score = 0;
        for (let i = 0; i < usable.length; i++) {
            if (mask & (1 << i)) {
                total += usable[i]._amount;
                docs.push(usable[i]);
                score += usable[i]._matchScore || 0;
            }
        }
        if (total > target + Math.max(tolerance, 0.01)) continue;
        const remaining = Math.abs(target - total);
        const completeness = target > 0 ? (total / target) * 100 : 0;
        const better = remaining < best.remaining - 0.005
            || (Math.abs(remaining - best.remaining) < 0.005 && completeness > best.completeness)
            || (Math.abs(remaining - best.remaining) < 0.005 && docs.length > best.docs.length && score > (best.score || 0));
        if (better) best = { docs, total, remaining, completeness: Math.round(completeness), exact: remaining <= tolerance, score };
        if (best.exact && best.docs.length > 1) break;
    }
    return best;
}

function findMultipleDocumentMatchesForTransactionV0456(companyId, transactionId, options = {}) {
    const tx = getTransaction(transactionId);
    if (!tx) return { ok: false, message: 'Opération introuvable', candidates: [], best: null };
    const tolerance = Number(options.tolerance ?? 0.02);
    const candidates = candidateDocumentPoolForTransactionV0456(companyId, tx, options.limit || 80);
    const targetAmount = Math.abs(Number(tx.amount || 0));
    const best = findBestDocumentSubsetV0456(candidates, targetAmount, tolerance);
    return {
        ok: true,
        transaction: tx,
        targetAmount,
        candidates: candidates.slice(0, 20),
        best: {
            ...best,
            remainingLabel: best.remaining > tolerance ? `${best.remaining.toFixed(2)} € restant à rapprocher` : 'Rapprochement complet',
            partial: best.remaining > tolerance && best.total > 0
        }
    };
}

function linkMultipleDocumentsToTransactionV0456(data = {}) {
    const transactionId = Number(data.transactionId || 0);
    const documentIds = Array.isArray(data.documentIds) ? data.documentIds.map(Number).filter(Boolean) : [];
    const tx = getTransaction(transactionId);
    if (!tx || !documentIds.length) return { ok: false, message: 'Opération ou documents manquants' };
    const docs = documentIds.map(id => getDocument(id)).filter(Boolean);
    const totalDocs = docs.reduce((sum, doc) => sum + Math.abs(Number(doc.amount_ttc ?? doc.detected_amount ?? 0)), 0);
    const target = Math.abs(Number(tx.amount || 0));
    const remaining = Math.max(0, target - totalDocs);
    const status = remaining <= Number(data.tolerance ?? 0.02) ? 'matched' : 'partial';
    const dbTx = db.transaction(() => {
        for (const doc of docs) {
            const amount = Math.abs(Number(doc.amount_ttc ?? doc.detected_amount ?? 0));
            db.prepare(`
                INSERT INTO document_transaction_links(document_id, transaction_id, amount, link_type)
                VALUES(?, ?, ?, ?)
                ON CONFLICT(document_id, transaction_id) DO UPDATE SET amount = excluded.amount, link_type = excluded.link_type
            `).run(doc.id, transactionId, amount, status === 'matched' ? 'grouped' : 'partial');
            db.prepare(`UPDATE documents SET linked_transaction_id = COALESCE(linked_transaction_id, ?), status = ?, payment_status = CASE WHEN ? = 'matched' THEN 'paid' ELSE 'partial' END WHERE id = ?`)
                .run(transactionId, status, status, doc.id);
        }
        db.prepare(`UPDATE bank_transactions SET status = ? WHERE id = ?`).run(status === 'matched' ? 'verified' : 'partial', transactionId);
    });
    dbTx();
    return { ok: true, transactionId, documentIds, targetAmount: target, linkedAmount: totalDocs, remaining, completeness: target > 0 ? Math.round((totalDocs / target) * 100) : 0, status };
}

function crc32V0456(buffer) {
    let table = crc32V0456.table;
    if (!table) {
        table = crc32V0456.table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            table[i] = c >>> 0;
        }
    }
    let crc = 0 ^ -1;
    for (let i = 0; i < buffer.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xFF];
    return (crc ^ -1) >>> 0;
}

function dosDateTimeV0456(date = new Date()) {
    const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((Math.floor(date.getSeconds() / 2)) & 31);
    const dosDate = (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
    return { time, date: dosDate };
}

function writeZipStoreV0456(zipPath, entries) {
    const chunks = [];
    const central = [];
    let offset = 0;
    const now = dosDateTimeV0456(new Date());
    for (const entry of entries) {
        const nameBuffer = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
        const data = entry.data ? Buffer.from(entry.data) : fs.readFileSync(entry.path);
        const crc = crc32V0456(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(0, 8);
        local.writeUInt16LE(now.time, 10);
        local.writeUInt16LE(now.date, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuffer.length, 26);
        local.writeUInt16LE(0, 28);
        chunks.push(local, nameBuffer, data);
        const c = Buffer.alloc(46);
        c.writeUInt32LE(0x02014b50, 0);
        c.writeUInt16LE(20, 4);
        c.writeUInt16LE(20, 6);
        c.writeUInt16LE(0x0800, 8);
        c.writeUInt16LE(0, 10);
        c.writeUInt16LE(now.time, 12);
        c.writeUInt16LE(now.date, 14);
        c.writeUInt32LE(crc, 16);
        c.writeUInt32LE(data.length, 20);
        c.writeUInt32LE(data.length, 24);
        c.writeUInt16LE(nameBuffer.length, 28);
        c.writeUInt16LE(0, 30);
        c.writeUInt16LE(0, 32);
        c.writeUInt16LE(0, 34);
        c.writeUInt16LE(0, 36);
        c.writeUInt32LE(0, 38);
        c.writeUInt32LE(offset, 42);
        central.push(c, nameBuffer);
        offset += local.length + nameBuffer.length + data.length;
    }
    const centralStart = offset;
    const centralBuffer = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuffer.length, 12);
    end.writeUInt32LE(centralStart, 16);
    end.writeUInt16LE(0, 20);
    fs.mkdirSync(path.dirname(zipPath), { recursive: true });
    fs.writeFileSync(zipPath, Buffer.concat([...chunks, centralBuffer, end]));
    return zipPath;
}

function getCompanyNameV0456(companyId) {
    const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(companyId);
    return company?.name || `Societe-${companyId}`;
}

function statementRowsForPeriodV0456(companyId, year, month) {
    return db.prepare(`
        SELECT s.*, ba.bank_name, ba.account_name, ba.account_number
        FROM statements s
        LEFT JOIN bank_accounts ba ON ba.id = s.bank_account_id
        WHERE ba.company_id = ?
        AND s.statement_year = ?
        AND s.statement_month = ?
        ORDER BY ba.bank_name, ba.account_name, s.filename
    `).all(companyId, String(year), String(month).padStart(2, '0'));
}

function documentRowsForAccountingArchiveV0456(companyId, year, month) {
    db.prepare(`
        SELECT id FROM documents
        WHERE company_id = ?
        AND (deleted_at IS NULL OR deleted_at = '')
        AND (accounting_period_year IS NULL OR accounting_period_year = '' OR accounting_period_month IS NULL OR accounting_period_month = '')
    `).all(companyId).forEach(row => syncDocumentAccountingPeriodV0456(row.id));
    const rows = db.prepare(`
        SELECT * FROM documents
        WHERE company_id = ?
        AND (deleted_at IS NULL OR deleted_at = '')
        AND COALESCE(accounting_period_year, '') = ?
        AND COALESCE(accounting_period_month, '') = ?
        ORDER BY COALESCE(doc_type, 'facture'), filename
    `).all(companyId, String(year), String(month).padStart(2, '0'));
    return rows;
}

function documentRowsForTransmissionExportV0456(companyId) {
    return db.prepare(`
        SELECT * FROM documents
        WHERE company_id = ?
        AND (deleted_at IS NULL OR deleted_at = '')
        AND COALESCE(accounting_impact, 'yes') != 'no'
        AND COALESCE(transmission_status, 'not_transmitted') != 'transmitted'
        ORDER BY COALESCE(accounting_period_year, substr(invoice_date,1,4), substr(detected_date,1,4), substr(added_at,1,4)),
                 COALESCE(accounting_period_month, substr(invoice_date,6,2), substr(detected_date,6,2), substr(added_at,6,2)),
                 COALESCE(doc_type, 'facture'), filename
    `).all(companyId);
}

function folderForDocumentV0456(doc) {
    const type = String(doc.doc_type || 'facture').toLowerCase();
    const nature = String(doc.document_nature || '').toLowerCase();
    if (nature.includes('admin') || ['contrat','divers'].includes(type)) return 'ADMINISTRATIF';
    if (type === 'avoir') return 'AVOIRS';
    if (type === 'releve') return 'RELEVES_BANCAIRES';
    if (type === 'rib') return 'RIB';
    if (type.includes('mutuelle')) return 'MUTUELLES';
    if (type === 'note_frais') return 'NOTES_DE_FRAIS';
    return 'FACTURES_FOURNISSEURS';
}

function buildAccountingZipEntriesV0456({ companyId, year, month, exportType, documents, statements }) {
    const entries = [];
    const companyName = getCompanyNameV0456(companyId);
    const periodLabel = `${year}-${String(month).padStart(2, '0')}`;
    let bordereau = `Focus Compta - ${exportType === 'archive' ? 'Archive comptable' : 'Export comptable'}\n`;
    bordereau += `Société : ${companyName}\nPériode demandée : ${periodLabel}\nGénéré le : ${new Date().toLocaleString('fr-FR')}\n\n`;
    bordereau += `Documents : ${documents.length}\nRelevés bancaires : ${statements.length}\n\n`;
    bordereau += `DOCUMENTS\n`;

    documents.forEach((doc, index) => {
        const period = getDocumentAccountingPeriodV0456(doc);
        const folder = folderForDocumentV0456(doc);
        const ext = path.extname(doc.filename || doc.filepath || '') || path.extname(doc.filepath || '') || '.pdf';
        const supplier = safeFilenameV0456(doc.detected_supplier || doc.third_party_name || 'Sans fournisseur');
        const base = safeFilenameV0456(`${period.year}-${period.month}_${supplier}_${doc.invoice_number || doc.detected_reference || doc.filename || ('document-' + doc.id)}`);
        const name = `${folder}/${period.year}-${period.month}/${base}${base.toLowerCase().endsWith(ext.toLowerCase()) ? '' : ext}`;
        if (doc.filepath && fs.existsSync(doc.filepath)) entries.push({ name, path: doc.filepath });
        bordereau += `${index + 1}. ${folder} | ${period.year}-${period.month} | ${doc.filename} | ${doc.detected_supplier || ''} | TTC ${Number(doc.amount_ttc || doc.detected_amount || 0).toFixed(2)} | transmis=${doc.transmission_status || 'not_transmitted'}\n`;
    });

    bordereau += `\nRELEVES BANCAIRES\n`;
    statements.forEach((st, index) => {
        const ext = path.extname(st.filename || st.filepath || '') || '.pdf';
        const acc = safeFilenameV0456([st.bank_name, st.account_name || st.account_number].filter(Boolean).join(' '), 'Compte');
        const base = safeFilenameV0456(`${st.statement_year}-${st.statement_month}_${acc}_${st.filename || ('releve-' + st.id)}`);
        const name = `RELEVES_BANCAIRES/${st.statement_year}-${st.statement_month}/${base}${base.toLowerCase().endsWith(ext.toLowerCase()) ? '' : ext}`;
        if (st.filepath && fs.existsSync(st.filepath)) entries.push({ name, path: st.filepath });
        bordereau += `${index + 1}. ${st.statement_year}-${st.statement_month} | ${st.bank_name || ''} ${st.account_name || ''} | ${st.filename}\n`;
    });

    const totalTtc = documents.reduce((sum, doc) => sum + Number(doc.amount_ttc || doc.detected_amount || 0), 0);
    bordereau += `\nTOTAL TTC documents : ${totalTtc.toFixed(2)} €\n`;
    entries.unshift({ name: 'BORDEREAU_EXPORT.txt', data: Buffer.from(bordereau, 'utf8') });
    return { entries, totalTtc, bordereau };
}

function createAccountingTransmissionExportV0456(data = {}) {
    const companyId = Number(data.companyId || 0);
    const year = String(data.year || new Date().getFullYear());
    const month = String(data.month || (new Date().getMonth() + 1)).padStart(2, '0');
    if (!companyId) throw new Error('Société manquante');
    const documents = documentRowsForTransmissionExportV0456(companyId);
    documents.forEach(doc => { if (!doc.accounting_period_year || !doc.accounting_period_month) syncDocumentAccountingPeriodV0456(doc.id); });
    const statements = statementRowsForPeriodV0456(companyId, year, month);
    const companyName = safeFilenameV0456(getCompanyNameV0456(companyId));
    const lotCode = `EXP-${year}-${month}-${Date.now()}`;
    const filename = `${companyName}-${lotCode}.zip`;
    const zipPath = path.join(ACCOUNTING_EXPORTS_DIR, companyName, filename);
    const { entries, totalTtc } = buildAccountingZipEntriesV0456({ companyId, year, month, exportType: 'transmission', documents, statements });
    writeZipStoreV0456(zipPath, entries);

    const lot = db.prepare(`
        INSERT INTO accounting_export_lots(company_id, export_type, period_year, period_month, filename, filepath, documents_count, statements_count, total_ttc)
        VALUES(?, 'transmission', ?, ?, ?, ?, ?, ?, ?)
    `).run(companyId, year, month, filename, zipPath, documents.length, statements.length, totalTtc);

    const lotId = Number(lot.lastInsertRowid);
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
        for (const doc of documents) {
            const period = getDocumentAccountingPeriodV0456(doc);
            db.prepare(`INSERT INTO accounting_export_items(lot_id, item_type, source_id, source_path, display_name, accounting_year, accounting_month) VALUES(?, 'document', ?, ?, ?, ?, ?)`)
                .run(lotId, doc.id, doc.filepath || '', doc.filename || '', period.year, period.month);
            db.prepare(`UPDATE documents SET transmission_status = 'transmitted', transmitted_at = ?, transmitted_export_lot_id = ? WHERE id = ?`).run(now, lotId, doc.id);
        }
        for (const st of statements) {
            db.prepare(`INSERT INTO accounting_export_items(lot_id, item_type, source_id, source_path, display_name, accounting_year, accounting_month) VALUES(?, 'statement', ?, ?, ?, ?, ?)`)
                .run(lotId, st.id, st.filepath || '', st.filename || '', st.statement_year || year, st.statement_month || month);
            db.prepare(`UPDATE statements SET transmission_status = 'transmitted', transmitted_at = ?, transmitted_export_lot_id = ? WHERE id = ?`).run(now, lotId, st.id);
        }
    });
    tx();
    return { ok: true, lotId, filename, filepath: zipPath, documentsCount: documents.length, statementsCount: statements.length, totalTtc };
}

function createAccountingArchiveV0456(data = {}) {
    const companyId = Number(data.companyId || 0);
    const year = String(data.year || new Date().getFullYear());
    const month = String(data.month || (new Date().getMonth() + 1)).padStart(2, '0');
    if (!companyId) throw new Error('Société manquante');
    const documents = documentRowsForAccountingArchiveV0456(companyId, year, month);
    const statements = statementRowsForPeriodV0456(companyId, year, month);
    const companyName = safeFilenameV0456(getCompanyNameV0456(companyId));
    const lotCode = `ARCHIVE-${year}-${month}-${Date.now()}`;
    const filename = `${companyName}-${lotCode}.zip`;
    const zipPath = path.join(ACCOUNTING_EXPORTS_DIR, companyName, 'Archives', filename);
    const { entries, totalTtc } = buildAccountingZipEntriesV0456({ companyId, year, month, exportType: 'archive', documents, statements });
    writeZipStoreV0456(zipPath, entries);
    const lot = db.prepare(`
        INSERT INTO accounting_export_lots(company_id, export_type, period_year, period_month, filename, filepath, documents_count, statements_count, total_ttc)
        VALUES(?, 'archive', ?, ?, ?, ?, ?, ?, ?)
    `).run(companyId, year, month, filename, zipPath, documents.length, statements.length, totalTtc);
    return { ok: true, lotId: Number(lot.lastInsertRowid), filename, filepath: zipPath, documentsCount: documents.length, statementsCount: statements.length, totalTtc };
}

function getAccountingExportPreviewV0456(data = {}) {
    const companyId = Number(data.companyId || 0);
    const year = String(data.year || new Date().getFullYear());
    const month = String(data.month || (new Date().getMonth() + 1)).padStart(2, '0');
    if (!companyId) return { documents: [], statements: [], totals: {} };
    const mode = data.mode || 'transmission';
    const documents = mode === 'archive' ? documentRowsForAccountingArchiveV0456(companyId, year, month) : documentRowsForTransmissionExportV0456(companyId);
    const statements = statementRowsForPeriodV0456(companyId, year, month);
    const totalTtc = documents.reduce((sum, doc) => sum + Number(doc.amount_ttc || doc.detected_amount || 0), 0);
    return {
        mode, year, month,
        documents: documents.map(doc => ({ id: doc.id, filename: doc.filename, supplier: doc.detected_supplier || doc.third_party_name || '', docType: doc.doc_type, transmissionStatus: doc.transmission_status || 'not_transmitted', period: getDocumentAccountingPeriodV0456(doc), amountTtc: Number(doc.amount_ttc || doc.detected_amount || 0) })),
        statements: statements.map(st => ({ id: st.id, filename: st.filename, bankName: st.bank_name, accountName: st.account_name, period: `${st.statement_year}-${st.statement_month}`, transmissionStatus: st.transmission_status || 'not_transmitted' })),
        totals: { documentsCount: documents.length, statementsCount: statements.length, totalTtc }
    };
}

function getAccountingExportLotsV0456(companyId = null) {
    const where = companyId ? 'WHERE company_id = ?' : '';
    const params = companyId ? [companyId] : [];
    return db.prepare(`SELECT * FROM accounting_export_lots ${where} ORDER BY created_at DESC LIMIT 100`).all(...params);
}


function getExecutiveDashboardV046(data = {}) {
    const companyId = Number(data.companyId || 0);
    const year = String(data.year || new Date().getFullYear());
    if (!companyId) {
        return {
            year,
            treasury: 0,
            documents: {},
            vat: {},
            payments: {},
            exports: {},
            statements: {},
            bank: {},
            alerts: []
        };
    }

    const docWhere = `d.company_id = ? AND d.deleted_at IS NULL`;
    const yearFilter = `(COALESCE(d.accounting_period_year, substr(COALESCE(d.invoice_date, d.detected_date, d.added_at),1,4)) = ?)`;
    const docParams = [companyId, year];

    const documents = db.prepare(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN COALESCE(d.accounting_impact,'yes') = 'yes' THEN 1 ELSE 0 END) AS accounting_docs,
            SUM(CASE WHEN COALESCE(d.transmission_status,'not_transmitted') != 'transmitted' AND COALESCE(d.accounting_impact,'yes') = 'yes' THEN 1 ELSE 0 END) AS not_transmitted,
            SUM(CASE WHEN COALESCE(d.payment_status,'unknown') != 'paid' AND COALESCE(d.accounting_impact,'yes') = 'yes' THEN 1 ELSE 0 END) AS unpaid_count,
            COALESCE(SUM(CASE WHEN COALESCE(d.payment_status,'unknown') != 'paid' AND COALESCE(d.accounting_impact,'yes') = 'yes' THEN COALESCE(d.amount_ttc, d.detected_amount, 0) ELSE 0 END),0) AS unpaid_ttc,
            SUM(CASE WHEN d.due_date IS NOT NULL AND d.due_date != '' AND d.due_date < date('now') AND COALESCE(d.payment_status,'unknown') != 'paid' THEN 1 ELSE 0 END) AS overdue_count,
            COALESCE(SUM(COALESCE(d.amount_tva,0)),0) AS vat_detected,
            COALESCE(SUM(COALESCE(d.amount_ht,0)),0) AS amount_ht,
            COALESCE(SUM(COALESCE(d.amount_ttc, d.detected_amount, 0)),0) AS amount_ttc
        FROM documents d
        WHERE ${docWhere} AND ${yearFilter}
    `).get(...docParams) || {};

    const exportStats = db.prepare(`
        SELECT
            COUNT(*) AS lots,
            SUM(CASE WHEN export_type = 'transmission' THEN 1 ELSE 0 END) AS transmission_lots,
            SUM(CASE WHEN export_type = 'archive' THEN 1 ELSE 0 END) AS archive_lots,
            COALESCE(SUM(documents_count),0) AS documents_exported,
            COALESCE(SUM(statements_count),0) AS statements_exported
        FROM accounting_export_lots
        WHERE company_id = ? AND period_year = ?
    `).get(companyId, year) || {};

    const statements = db.prepare(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN COALESCE(s.transmission_status,'not_transmitted') != 'transmitted' THEN 1 ELSE 0 END) AS not_transmitted
        FROM statements s
        JOIN bank_accounts b ON b.id = s.bank_account_id
        WHERE b.company_id = ? AND s.statement_year = ?
    `).get(companyId, year) || {};

    const latestBalances = db.prepare(`
        SELECT ba.id, ba.bank_name, ba.account_name, s.new_balance
        FROM bank_accounts ba
        LEFT JOIN statements s ON s.id = (
            SELECT s2.id
            FROM statements s2
            WHERE s2.bank_account_id = ba.id
              AND s2.new_balance IS NOT NULL
            ORDER BY COALESCE(s2.statement_year,'0000') DESC, COALESCE(s2.statement_month,'00') DESC, s2.imported_at DESC
            LIMIT 1
        )
        WHERE ba.company_id = ?
    `).all(companyId);
    const treasury = latestBalances.reduce((sum, row) => sum + Number(row.new_balance || 0), 0);

    const bank = db.prepare(`
        SELECT
            COUNT(*) AS operations,
            SUM(CASE WHEN COALESCE(t.category,'') != '' THEN 1 ELSE 0 END) AS categorized,
            SUM(CASE WHEN COALESCE(t.status,'missing') IN ('verified','validé','valide','Vérifié','verified_no_receipt') THEN 1 ELSE 0 END) AS verified,
            SUM(CASE WHEN COALESCE(t.status,'missing') = 'missing' THEN 1 ELSE 0 END) AS missing,
            COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END),0) AS credits,
            COALESCE(SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END),0) AS debits
        FROM bank_transactions t
        JOIN bank_accounts ba ON ba.id = t.bank_account_id
        WHERE ba.company_id = ? AND substr(COALESCE(t.date_operation,''),1,4) = ?
    `).get(companyId, year) || {};

    const tp = db.prepare(`
        SELECT
            COUNT(*) AS operations,
            COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END),0) AS received,
            COALESCE(SUM(CASE WHEN COALESCE(t.status,'missing') = 'missing' THEN ABS(t.amount) ELSE 0 END),0) AS to_check
        FROM bank_transactions t
        JOIN bank_accounts ba ON ba.id = t.bank_account_id
        WHERE ba.company_id = ?
          AND substr(COALESCE(t.date_operation,''),1,4) = ?
          AND (
              lower(COALESCE(t.category,'')) LIKE '%tiers%'
              OR lower(COALESCE(t.third_party_name,'')) LIKE '%viamedis%'
              OR lower(COALESCE(t.third_party_name,'')) LIKE '%almerys%'
              OR lower(COALESCE(t.third_party_name,'')) LIKE '%swiss%'
              OR lower(COALESCE(t.third_party_name,'')) LIKE '%allianz%'
              OR lower(COALESCE(t.third_party_name,'')) LIKE '%mma%'
          )
    `).get(companyId, year) || {};

    const recentAlerts = [];
    if (Number(documents.not_transmitted || 0) > 0) recentAlerts.push({ level: 'warning', label: `${documents.not_transmitted} document(s) comptables non transmis` });
    if (Number(statements.not_transmitted || 0) > 0) recentAlerts.push({ level: 'warning', label: `${statements.not_transmitted} relevé(s) bancaire(s) non transmis` });
    if (Number(documents.overdue_count || 0) > 0) recentAlerts.push({ level: 'danger', label: `${documents.overdue_count} facture(s) échue(s)` });
    if (Number(bank.missing || 0) > 0) recentAlerts.push({ level: 'warning', label: `${bank.missing} opération(s) sans justificatif/statut` });

    const automationRate = Number(bank.operations || 0) ? Math.round((Number(bank.categorized || 0) / Number(bank.operations || 0)) * 100) : 0;

    return {
        year,
        treasury,
        accounts: latestBalances,
        documents,
        vat: {
            deductible: Number(documents.vat_detected || 0),
            ht: Number(documents.amount_ht || 0),
            ttc: Number(documents.amount_ttc || 0)
        },
        payments: {
            unpaidCount: Number(documents.unpaid_count || 0),
            unpaidTtc: Number(documents.unpaid_ttc || 0),
            overdueCount: Number(documents.overdue_count || 0)
        },
        exports: exportStats,
        statements,
        bank: { ...bank, automationRate },
        thirdPartyPayments: tp,
        alerts: recentAlerts
    };
}



// V0.49 - Intelligence financière & pilotage dirigeant.
// Cette fonction ne remplace pas la comptabilité : elle transforme les données existantes
// en tendances de gestion lisibles (trésorerie prévisionnelle, fournisseurs, charges,
// tiers-payant/mutuelles et alertes de variation).
function getFinancialIntelligenceV049(data = {}) {
    const companyId = Number(data.companyId || 0);
    const year = String(data.year || new Date().getFullYear());
    const previousYear = String(Number(year) - 1);
    const month = data.month ? String(data.month).padStart(2, '0') : null;

    const empty = {
        year,
        previousYear,
        cashForecast: { today: 0, plus30: 0, plus60: 0, plus90: 0, upcoming: [] },
        revenue: { currentYearTtc: 0, previousYearTtc: 0, monthly: [] },
        suppliers: { top: [], increases: [], decreases: [] },
        charges: { categories: [] },
        mutuals: { rows: [] },
        anomalies: [],
        executiveSummary: []
    };
    if (!companyId) return empty;

    function safeGet(sql, params = [], fallback = {}) {
        try { return db.prepare(sql).get(...params) || fallback; }
        catch (error) { console.warn('V0.49 safeGet', error.message); return fallback; }
    }
    function safeAll(sql, params = []) {
        try { return db.prepare(sql).all(...params) || []; }
        catch (error) { console.warn('V0.49 safeAll', error.message); return []; }
    }
    function num(value) { return Number(value || 0); }
    function monthFromDateExpression(column) {
        return `substr(COALESCE(${column}, ''), 6, 2)`;
    }

    const latestBalances = safeAll(`
        SELECT ba.id, ba.bank_name, ba.account_name, COALESCE(s.new_balance, 0) AS new_balance
        FROM bank_accounts ba
        LEFT JOIN statements s ON s.id = (
            SELECT s2.id
            FROM statements s2
            WHERE s2.bank_account_id = ba.id
              AND s2.new_balance IS NOT NULL
            ORDER BY COALESCE(s2.statement_year,'0000') DESC,
                     COALESCE(s2.statement_month,'00') DESC,
                     s2.imported_at DESC
            LIMIT 1
        )
        WHERE ba.company_id = ?
    `, [companyId]);
    const treasuryToday = latestBalances.reduce((sum, row) => sum + num(row.new_balance), 0);

    const upcomingDocuments = safeAll(`
        SELECT id, filename, detected_supplier, third_party_name, due_date, planned_payment_date,
               COALESCE(amount_ttc, detected_amount, 0) AS amount
        FROM documents
        WHERE company_id = ?
          AND deleted_at IS NULL
          AND COALESCE(accounting_impact,'yes') = 'yes'
          AND COALESCE(payment_status,'unknown') != 'paid'
          AND COALESCE(amount_ttc, detected_amount, 0) > 0
          AND COALESCE(planned_payment_date, due_date, invoice_date, detected_date, added_at) IS NOT NULL
        ORDER BY COALESCE(planned_payment_date, due_date, invoice_date, detected_date, added_at) ASC
        LIMIT 80
    `, [companyId]);

    const today = new Date();
    function daysAhead(dateText) {
        const d = new Date(String(dateText || '').slice(0, 10));
        if (Number.isNaN(d.getTime())) return null;
        return Math.ceil((d.getTime() - today.getTime()) / 86400000);
    }
    function forecastBalance(days) {
        const outgoing = upcomingDocuments
            .filter(doc => {
                const dateText = doc.planned_payment_date || doc.due_date || '';
                const delta = daysAhead(dateText);
                return delta !== null && delta >= 0 && delta <= days;
            })
            .reduce((sum, doc) => sum + num(doc.amount), 0);
        return treasuryToday - outgoing;
    }

    const revenueMonthly = safeAll(`
        SELECT period_month AS month,
               COALESCE(SUM(net_ca_ttc),0) AS ttc,
               COALESCE(SUM(net_ca_ht),0) AS ht,
               COALESCE(SUM(tva_total),0) AS vat
        FROM cash_sheets
        WHERE company_id = ? AND period_year = ?
        GROUP BY period_month
        ORDER BY period_month
    `, [companyId, year]);
    const revenueCurrent = revenueMonthly.reduce((sum, row) => sum + num(row.ttc), 0);
    const revenuePrevious = safeGet(`
        SELECT COALESCE(SUM(net_ca_ttc),0) AS total
        FROM cash_sheets
        WHERE company_id = ? AND period_year = ?
    `, [companyId, previousYear], { total: 0 }).total;

    const supplierRows = safeAll(`
        WITH current_suppliers AS (
            SELECT
                COALESCE(NULLIF(d.third_party_name,''), NULLIF(d.detected_supplier,''), 'Non identifié') AS supplier,
                COALESCE(SUM(COALESCE(d.amount_ttc, d.detected_amount, 0)),0) AS current_amount,
                COUNT(*) AS documents_count
            FROM documents d
            WHERE d.company_id = ?
              AND d.deleted_at IS NULL
              AND COALESCE(d.accounting_impact,'yes') = 'yes'
              AND COALESCE(d.amount_ttc, d.detected_amount, 0) > 0
              AND COALESCE(d.accounting_period_year, substr(COALESCE(d.invoice_date, d.detected_date, d.added_at),1,4)) = ?
            GROUP BY supplier
        ),
        previous_suppliers AS (
            SELECT
                COALESCE(NULLIF(d.third_party_name,''), NULLIF(d.detected_supplier,''), 'Non identifié') AS supplier,
                COALESCE(SUM(COALESCE(d.amount_ttc, d.detected_amount, 0)),0) AS previous_amount
            FROM documents d
            WHERE d.company_id = ?
              AND d.deleted_at IS NULL
              AND COALESCE(d.accounting_impact,'yes') = 'yes'
              AND COALESCE(d.amount_ttc, d.detected_amount, 0) > 0
              AND COALESCE(d.accounting_period_year, substr(COALESCE(d.invoice_date, d.detected_date, d.added_at),1,4)) = ?
            GROUP BY supplier
        )
        SELECT c.supplier, c.current_amount, COALESCE(p.previous_amount,0) AS previous_amount, c.documents_count,
               CASE WHEN COALESCE(p.previous_amount,0) > 0
                    THEN ROUND(((c.current_amount - p.previous_amount) / p.previous_amount) * 100, 1)
                    ELSE NULL END AS variation_percent
        FROM current_suppliers c
        LEFT JOIN previous_suppliers p ON lower(p.supplier) = lower(c.supplier)
        ORDER BY c.current_amount DESC
        LIMIT 30
    `, [companyId, year, companyId, previousYear]);

    const categoryRows = safeAll(`
        WITH current_categories AS (
            SELECT COALESCE(NULLIF(t.category,''), 'Non catégorisé') AS category,
                   COALESCE(SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END),0) AS current_amount,
                   COUNT(*) AS operations_count
            FROM bank_transactions t
            JOIN bank_accounts ba ON ba.id = t.bank_account_id
            WHERE ba.company_id = ? AND substr(COALESCE(t.date_operation,''),1,4) = ?
            GROUP BY category
        ),
        previous_categories AS (
            SELECT COALESCE(NULLIF(t.category,''), 'Non catégorisé') AS category,
                   COALESCE(SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END),0) AS previous_amount
            FROM bank_transactions t
            JOIN bank_accounts ba ON ba.id = t.bank_account_id
            WHERE ba.company_id = ? AND substr(COALESCE(t.date_operation,''),1,4) = ?
            GROUP BY category
        )
        SELECT c.category, c.current_amount, COALESCE(p.previous_amount,0) AS previous_amount, c.operations_count,
               CASE WHEN COALESCE(p.previous_amount,0) > 0
                    THEN ROUND(((c.current_amount - p.previous_amount) / p.previous_amount) * 100, 1)
                    ELSE NULL END AS variation_percent
        FROM current_categories c
        LEFT JOIN previous_categories p ON lower(p.category) = lower(c.category)
        ORDER BY c.current_amount DESC
        LIMIT 20
    `, [companyId, year, companyId, previousYear]);

    const mutualRows = safeAll(`
        WITH current_mutuals AS (
            SELECT COALESCE(NULLIF(t.third_party_name,''), NULLIF(t.label,''), 'Mutuelle non identifiée') AS name,
                   COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END),0) AS current_received,
                   COUNT(*) AS operations_count
            FROM bank_transactions t
            JOIN bank_accounts ba ON ba.id = t.bank_account_id
            WHERE ba.company_id = ?
              AND substr(COALESCE(t.date_operation,''),1,4) = ?
              AND (
                  lower(COALESCE(t.category,'')) LIKE '%tiers%'
                  OR lower(COALESCE(t.category,'')) LIKE '%mutuelle%'
                  OR lower(COALESCE(t.third_party_name,'')) LIKE '%viamedis%'
                  OR lower(COALESCE(t.third_party_name,'')) LIKE '%almerys%'
                  OR lower(COALESCE(t.third_party_name,'')) LIKE '%swiss%'
                  OR lower(COALESCE(t.third_party_name,'')) LIKE '%allianz%'
                  OR lower(COALESCE(t.third_party_name,'')) LIKE '%mma%'
                  OR lower(COALESCE(t.label,'')) LIKE '%viamedis%'
                  OR lower(COALESCE(t.label,'')) LIKE '%almerys%'
                  OR lower(COALESCE(t.label,'')) LIKE '%swiss%'
                  OR lower(COALESCE(t.label,'')) LIKE '%allianz%'
                  OR lower(COALESCE(t.label,'')) LIKE '%mma%'
              )
            GROUP BY name
        ),
        previous_mutuals AS (
            SELECT COALESCE(NULLIF(t.third_party_name,''), NULLIF(t.label,''), 'Mutuelle non identifiée') AS name,
                   COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END),0) AS previous_received
            FROM bank_transactions t
            JOIN bank_accounts ba ON ba.id = t.bank_account_id
            WHERE ba.company_id = ?
              AND substr(COALESCE(t.date_operation,''),1,4) = ?
              AND (
                  lower(COALESCE(t.category,'')) LIKE '%tiers%'
                  OR lower(COALESCE(t.category,'')) LIKE '%mutuelle%'
                  OR lower(COALESCE(t.third_party_name,'')) LIKE '%viamedis%'
                  OR lower(COALESCE(t.third_party_name,'')) LIKE '%almerys%'
                  OR lower(COALESCE(t.third_party_name,'')) LIKE '%swiss%'
                  OR lower(COALESCE(t.third_party_name,'')) LIKE '%allianz%'
                  OR lower(COALESCE(t.third_party_name,'')) LIKE '%mma%'
                  OR lower(COALESCE(t.label,'')) LIKE '%viamedis%'
                  OR lower(COALESCE(t.label,'')) LIKE '%almerys%'
                  OR lower(COALESCE(t.label,'')) LIKE '%swiss%'
                  OR lower(COALESCE(t.label,'')) LIKE '%allianz%'
                  OR lower(COALESCE(t.label,'')) LIKE '%mma%'
              )
            GROUP BY name
        )
        SELECT c.name, c.current_received, COALESCE(p.previous_received,0) AS previous_received, c.operations_count,
               CASE WHEN COALESCE(p.previous_received,0) > 0
                    THEN ROUND(((c.current_received - p.previous_received) / p.previous_received) * 100, 1)
                    ELSE NULL END AS variation_percent
        FROM current_mutuals c
        LEFT JOIN previous_mutuals p ON lower(p.name) = lower(c.name)
        ORDER BY c.current_received DESC
        LIMIT 20
    `, [companyId, year, companyId, previousYear]);

    const anomalies = [];
    supplierRows.forEach(row => {
        if (row.variation_percent !== null && row.previous_amount > 500 && row.variation_percent >= 25) {
            anomalies.push({ level: 'warning', type: 'supplier_increase', label: `${row.supplier} augmente de ${row.variation_percent} % vs ${previousYear}`, amount: row.current_amount });
        }
    });
    categoryRows.forEach(row => {
        if (row.variation_percent !== null && row.previous_amount > 300 && row.variation_percent >= 25) {
            anomalies.push({ level: 'warning', type: 'charge_increase', label: `Charge ${row.category} en hausse de ${row.variation_percent} %`, amount: row.current_amount });
        }
    });
    mutualRows.forEach(row => {
        if (row.variation_percent !== null && row.previous_received > 500 && row.variation_percent <= -15) {
            anomalies.push({ level: 'danger', type: 'mutual_drop', label: `${row.name} baisse de ${Math.abs(row.variation_percent)} % vs ${previousYear}`, amount: row.current_received });
        }
    });

    const missingRecurring = safeAll(`
        SELECT supplier, COUNT(DISTINCT month_key) AS active_months, MAX(month_key) AS last_month
        FROM (
            SELECT COALESCE(NULLIF(d.third_party_name,''), NULLIF(d.detected_supplier,''), 'Non identifié') AS supplier,
                   substr(COALESCE(d.invoice_date, d.detected_date, d.added_at),1,7) AS month_key
            FROM documents d
            WHERE d.company_id = ?
              AND d.deleted_at IS NULL
              AND COALESCE(d.accounting_impact,'yes') = 'yes'
              AND COALESCE(d.accounting_period_year, substr(COALESCE(d.invoice_date, d.detected_date, d.added_at),1,4)) = ?
        )
        WHERE supplier != 'Non identifié'
        GROUP BY supplier
        HAVING active_months >= 2
        ORDER BY active_months DESC
        LIMIT 20
    `, [companyId, year]);
    const currentYearMonth = `${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    missingRecurring.forEach(row => {
        if (row.last_month && row.last_month < currentYearMonth && Number(row.active_months || 0) >= 2) {
            anomalies.push({ level: 'info', type: 'missing_recurring', label: `${row.supplier} n’a pas de facture récente détectée`, amount: 0 });
        }
    });

    const executiveSummary = [
        { label: 'Trésorerie actuelle', value: treasuryToday },
        { label: 'Prévision +30 jours', value: forecastBalance(30) },
        { label: 'CA TTC année', value: revenueCurrent },
        { label: 'Factures à payer 90j', value: upcomingDocuments.filter(doc => { const d = daysAhead(doc.planned_payment_date || doc.due_date); return d !== null && d >= 0 && d <= 90; }).reduce((s, d) => s + num(d.amount), 0) }
    ];

    return {
        year,
        previousYear,
        cashForecast: {
            today: treasuryToday,
            plus30: forecastBalance(30),
            plus60: forecastBalance(60),
            plus90: forecastBalance(90),
            upcoming: upcomingDocuments.slice(0, 12).map(doc => ({
                id: doc.id,
                supplier: doc.detected_supplier || doc.third_party_name || doc.filename,
                filename: doc.filename,
                amount: num(doc.amount),
                date: doc.planned_payment_date || doc.due_date || '',
                days: daysAhead(doc.planned_payment_date || doc.due_date)
            }))
        },
        revenue: {
            currentYearTtc: revenueCurrent,
            previousYearTtc: num(revenuePrevious),
            monthly: revenueMonthly.map(row => ({ month: row.month, ttc: num(row.ttc), ht: num(row.ht), vat: num(row.vat) }))
        },
        suppliers: {
            top: supplierRows.slice(0, 10),
            increases: supplierRows.filter(row => row.variation_percent !== null && row.variation_percent > 0).sort((a,b) => num(b.variation_percent) - num(a.variation_percent)).slice(0, 8),
            decreases: supplierRows.filter(row => row.variation_percent !== null && row.variation_percent < 0).sort((a,b) => num(a.variation_percent) - num(b.variation_percent)).slice(0, 8)
        },
        charges: { categories: categoryRows },
        mutuals: { rows: mutualRows },
        anomalies: anomalies.slice(0, 20),
        executiveSummary
    };
}


function getVatCenterV073(data = {}) {
    const companyId = Number(data.companyId || 0);
    const year = String(data.year || new Date().getFullYear());
    const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    const monthLabel = {
        '01':'Janvier','02':'Février','03':'Mars','04':'Avril','05':'Mai','06':'Juin',
        '07':'Juillet','08':'Août','09':'Septembre','10':'Octobre','11':'Novembre','12':'Décembre'
    };
    if (!companyId) {
        return { year, companyId, totals: { collected: 0, deductible: 0, balance: 0 }, months: months.map(month => ({ month, label: monthLabel[month], collected: 0, deductible: 0, balance: 0 })) };
    }

    const cashRows = db.prepare(`
        SELECT
            period_month AS month,
            COUNT(*) AS cashSheets,
            COALESCE(SUM(COALESCE(tva_brute,0)),0) AS grossVat,
            COALESCE(SUM(COALESCE(discount_tva,0)),0) AS discountVat,
            COALESCE(SUM(
                CASE
                    WHEN COALESCE(tva_nette,0) != 0 THEN COALESCE(tva_nette,0)
                    WHEN COALESCE(tva_brute,0) != 0 OR COALESCE(discount_tva,0) != 0 THEN COALESCE(tva_brute,0) - COALESCE(discount_tva,0)
                    ELSE MAX(COALESCE(net_ca_ttc,0) - COALESCE(net_ca_ht,0), 0)
                END
            ),0) AS collected,
            COALESCE(SUM(COALESCE(net_ca_ttc, invoiced_ca,0)),0) AS caTtc
        FROM cash_sheets
        WHERE company_id = ?
          AND period_year = ?
        GROUP BY period_month
    `).all(companyId, year);

    const docRows = db.prepare(`
        SELECT
            COALESCE(NULLIF(accounting_period_month,''), substr(COALESCE(invoice_date, detected_date, added_at),6,2)) AS month,
            COUNT(*) AS documents,
            COALESCE(SUM(CASE WHEN COALESCE(amount_tva,0) > 0 THEN COALESCE(amount_tva,0) ELSE 0 END),0) AS deductible,
            COALESCE(SUM(CASE WHEN COALESCE(amount_ht,0) > 0 THEN COALESCE(amount_ht,0) ELSE 0 END),0) AS ht,
            COALESCE(SUM(COALESCE(amount_ttc, detected_amount,0)),0) AS ttc,
            SUM(CASE WHEN amount_tva IS NULL AND COALESCE(doc_type,'facture') IN ('facture','facture_fournisseur') THEN 1 ELSE 0 END) AS missingVat
        FROM documents
        WHERE company_id = ?
          AND (deleted_at IS NULL OR deleted_at = '')
          AND COALESCE(accounting_impact,'yes') = 'yes'
          AND COALESCE(doc_type,'facture') NOT IN ('contrat','administratif','rib','releve','divers','don','informatif')
          AND COALESCE(NULLIF(accounting_period_year,''), substr(COALESCE(invoice_date, detected_date, added_at),1,4)) = ?
        GROUP BY month
    `).all(companyId, year);

    const byMonth = new Map(months.map(month => [month, {
        year,
        month,
        label: monthLabel[month],
        collected: 0,
        deductible: 0,
        balance: 0,
        grossVat: 0,
        discountVat: 0,
        cashSheets: 0,
        documents: 0,
        missingVat: 0,
        caTtc: 0,
        status: 'empty'
    }]));

    cashRows.forEach(row => {
        const month = String(row.month || '').padStart(2, '0');
        if (!byMonth.has(month)) return;
        const target = byMonth.get(month);
        target.collected = Number(row.collected || 0);
        target.grossVat = Number(row.grossVat || 0);
        target.discountVat = Number(row.discountVat || 0);
        target.cashSheets = Number(row.cashSheets || 0);
        target.caTtc = Number(row.caTtc || 0);
    });

    docRows.forEach(row => {
        const month = String(row.month || '').padStart(2, '0');
        if (!byMonth.has(month)) return;
        const target = byMonth.get(month);
        target.deductible = Number(row.deductible || 0);
        target.documents = Number(row.documents || 0);
        target.missingVat = Number(row.missingVat || 0);
        target.documentsHt = Number(row.ht || 0);
        target.documentsTtc = Number(row.ttc || 0);
    });

    const rows = Array.from(byMonth.values()).map(row => {
        row.balance = Number(row.collected || 0) - Number(row.deductible || 0);
        row.status = row.cashSheets || row.documents
            ? (row.missingVat ? 'warning' : 'ok')
            : 'empty';
        return row;
    });

    const totals = rows.reduce((acc, row) => {
        acc.collected += Number(row.collected || 0);
        acc.deductible += Number(row.deductible || 0);
        acc.balance += Number(row.balance || 0);
        acc.grossVat += Number(row.grossVat || 0);
        acc.discountVat += Number(row.discountVat || 0);
        acc.cashSheets += Number(row.cashSheets || 0);
        acc.documents += Number(row.documents || 0);
        acc.missingVat += Number(row.missingVat || 0);
        return acc;
    }, { collected: 0, deductible: 0, balance: 0, grossVat: 0, discountVat: 0, cashSheets: 0, documents: 0, missingVat: 0 });

    return { year, companyId, totals, months: rows };
}


// V0.80 Foundation - audit, sauvegardes et santé comptable
function safeJsonV080(value) {
    try { return JSON.stringify(value || {}); } catch (_) { return '{}'; }
}

function addAuditLogV080(data = {}) {
    const actionType = String(data.actionType || data.action_type || '').trim();
    if (!actionType) return { ok: false, reason: 'missing_action_type' };
    const result = db.prepare(`
        INSERT INTO audit_log(company_id, action_type, entity_type, entity_id, label, details_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
        data.companyId || data.company_id || null,
        actionType,
        data.entityType || data.entity_type || '',
        data.entityId || data.entity_id || '',
        data.label || '',
        safeJsonV080(data.details || data.details_json || {})
    );
    return { ok: true, id: result.lastInsertRowid };
}

function getAuditLogV080(data = {}) {
    const filters = [];
    const params = [];
    if (data.companyId) { filters.push('(company_id = ? OR company_id IS NULL)'); params.push(Number(data.companyId)); }
    if (data.actionType) { filters.push('action_type = ?'); params.push(String(data.actionType)); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const limit = Math.min(200, Math.max(1, Number(data.limit || 80)));
    return db.prepare(`
        SELECT id, company_id AS companyId, action_type AS actionType, entity_type AS entityType, entity_id AS entityId, label, details_json AS detailsJson, created_at AS createdAt
        FROM audit_log
        ${where}
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
    `).all(...params, limit);
}

function getAppRolesV080() {
    return db.prepare(`SELECT role_key AS roleKey, role_label AS roleLabel, permissions_json AS permissionsJson FROM app_roles ORDER BY id`).all();
}

function getAppUsersV080() {
    return db.prepare(`SELECT id, display_name AS displayName, email, role, is_active AS isActive, created_at AS createdAt FROM app_users ORDER BY id`).all();
}

// V0.81 - Utilisateurs, rôles et accès sociétés.
function parseJsonV081(value, fallback = {}) {
    try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
}

function normalizeRoleV081(role) {
    const value = String(role || 'collaborateur').trim();
    const exists = db.prepare('SELECT role_key FROM app_roles WHERE role_key = ?').get(value);
    return exists ? value : 'collaborateur';
}

function getUserCompanyIdsV081(userId) {
    return db.prepare('SELECT company_id AS companyId FROM user_company_access WHERE user_id = ? ORDER BY company_id').all(Number(userId || 0)).map(row => Number(row.companyId));
}

function setUserCompanyAccessV081(userId, companyIds = []) {
    const uid = Number(userId || 0);
    if (!uid) return;
    const cleanIds = [...new Set((companyIds || []).map(Number).filter(Boolean))];
    const tx = db.transaction(() => {
        db.prepare('DELETE FROM user_company_access WHERE user_id = ?').run(uid);
        const insert = db.prepare('INSERT OR IGNORE INTO user_company_access(user_id, company_id) VALUES(?, ?)');
        cleanIds.forEach(companyId => insert.run(uid, companyId));
    });
    tx();
}

function enrichUserV081(user) {
    if (!user) return null;
    const companyIds = getUserCompanyIdsV081(user.id);
    const role = db.prepare('SELECT role_label AS roleLabel, permissions_json AS permissionsJson FROM app_roles WHERE role_key = ?').get(user.role) || {};
    const companies = companyIds.length
        ? db.prepare(`SELECT id, name FROM companies WHERE id IN (${companyIds.map(() => '?').join(',')}) ORDER BY name`).all(...companyIds)
        : [];
    return {
        id: Number(user.id),
        displayName: user.displayName || user.display_name || '',
        email: user.email || '',
        role: user.role || 'collaborateur',
        roleLabel: role.roleLabel || user.role || 'Collaborateur',
        permissions: parseJsonV081(role.permissionsJson, {}),
        companyIds,
        companies,
        notes: user.notes || '',
        isActive: Number(user.isActive ?? user.is_active ?? 1),
        createdAt: user.createdAt || user.created_at || '',
        updatedAt: user.updatedAt || user.updated_at || ''
    };
}

function getAppRolesV081() {
    return db.prepare(`SELECT role_key AS roleKey, role_label AS roleLabel, permissions_json AS permissionsJson FROM app_roles ORDER BY id`).all().map(role => ({
        ...role,
        permissions: parseJsonV081(role.permissionsJson, {})
    }));
}

function getAppUsersV081() {
    return db.prepare(`
        SELECT id, display_name AS displayName, email, role, notes, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
        FROM app_users
        ORDER BY is_active DESC, display_name COLLATE NOCASE
    `).all().map(enrichUserV081);
}

function getCurrentUserV081() {
    const session = db.prepare('SELECT current_user_id AS currentUserId FROM app_session WHERE id = 1').get();
    const userId = Number(session?.currentUserId || 0);
    const row = userId ? db.prepare(`SELECT id, display_name AS displayName, email, role, notes, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM app_users WHERE id = ?`).get(userId) : null;
    if (row) return enrichUserV081(row);
    const first = db.prepare(`SELECT id, display_name AS displayName, email, role, notes, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM app_users WHERE is_active = 1 ORDER BY id LIMIT 1`).get();
    return enrichUserV081(first);
}

function setCurrentUserV081(userId) {
    const uid = Number(userId || 0);
    const user = db.prepare('SELECT id FROM app_users WHERE id = ? AND is_active = 1').get(uid);
    if (!user) return { ok: false, reason: 'Utilisateur introuvable ou inactif.' };
    db.prepare(`INSERT INTO app_session(id, current_user_id, updated_at) VALUES(1, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET current_user_id = excluded.current_user_id, updated_at = CURRENT_TIMESTAMP`).run(uid);
    try { addAuditLogV080({ actionType: 'user_session_changed', entityType: 'user', entityId: String(uid), label: 'Utilisateur actif changé' }); } catch (_) {}
    return { ok: true, currentUser: getCurrentUserV081() };
}

function createAppUserV081(data = {}) {
    const displayName = String(data.displayName || data.display_name || '').trim();
    if (!displayName) return { ok: false, reason: 'Nom obligatoire.' };
    const email = String(data.email || '').trim();
    const role = normalizeRoleV081(data.role);
    const notes = String(data.notes || '').trim();
    const isActive = data.isActive === false || Number(data.is_active) === 0 ? 0 : 1;
    const result = db.prepare(`
        INSERT INTO app_users(display_name, email, role, notes, is_active, updated_at)
        VALUES(?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(displayName, email, role, notes, isActive);
    setUserCompanyAccessV081(result.lastInsertRowid, data.companyIds || data.company_ids || []);
    try { addAuditLogV080({ actionType: 'user_created', entityType: 'user', entityId: String(result.lastInsertRowid), label: `Utilisateur créé : ${displayName}`, details: { role, companyIds: data.companyIds || [] } }); } catch (_) {}
    return { ok: true, user: enrichUserV081(db.prepare(`SELECT id, display_name AS displayName, email, role, notes, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM app_users WHERE id = ?`).get(result.lastInsertRowid)) };
}

function updateAppUserV081(data = {}) {
    const id = Number(data.id || 0);
    if (!id) return { ok: false, reason: 'ID utilisateur manquant.' };
    const existing = db.prepare('SELECT * FROM app_users WHERE id = ?').get(id);
    if (!existing) return { ok: false, reason: 'Utilisateur introuvable.' };
    const displayName = String(data.displayName || data.display_name || existing.display_name || '').trim();
    if (!displayName) return { ok: false, reason: 'Nom obligatoire.' };
    const email = String(data.email ?? existing.email ?? '').trim();
    const role = normalizeRoleV081(data.role || existing.role);
    const notes = String(data.notes ?? existing.notes ?? '').trim();
    const isActive = data.isActive === false || Number(data.is_active) === 0 ? 0 : 1;
    db.prepare(`
        UPDATE app_users
        SET display_name = ?, email = ?, role = ?, notes = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(displayName, email, role, notes, isActive, id);
    if (Array.isArray(data.companyIds) || Array.isArray(data.company_ids)) setUserCompanyAccessV081(id, data.companyIds || data.company_ids || []);
    try { addAuditLogV080({ actionType: 'user_updated', entityType: 'user', entityId: String(id), label: `Utilisateur modifié : ${displayName}`, details: { role, isActive } }); } catch (_) {}
    return { ok: true, user: enrichUserV081(db.prepare(`SELECT id, display_name AS displayName, email, role, notes, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM app_users WHERE id = ?`).get(id)) };
}

function disableAppUserV081(userId) {
    const id = Number(userId || 0);
    if (!id) return { ok: false, reason: 'ID utilisateur manquant.' };
    const activeCount = db.prepare('SELECT COUNT(*) AS count FROM app_users WHERE is_active = 1').get().count || 0;
    const user = db.prepare('SELECT display_name FROM app_users WHERE id = ?').get(id);
    if (!user) return { ok: false, reason: 'Utilisateur introuvable.' };
    if (activeCount <= 1) return { ok: false, reason: 'Impossible de désactiver le dernier utilisateur actif.' };
    db.prepare('UPDATE app_users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    try { addAuditLogV080({ actionType: 'user_disabled', entityType: 'user', entityId: String(id), label: `Utilisateur désactivé : ${user.display_name}` }); } catch (_) {}
    return { ok: true };
}

function getUserPermissionsSummaryV081(data = {}) {
    const user = data.userId ? getAppUsersV081().find(u => Number(u.id) === Number(data.userId)) : getCurrentUserV081();
    if (!user) return { ok: false, reason: 'Aucun utilisateur actif.' };
    const modules = ['home','companies','bank','documents','matching','thirdParties','accounting','exports','settings'];
    const allowed = user.permissions?.modules || [];
    const isAdmin = allowed.includes('*');
    return {
        ok: true,
        user,
        readOnly: Boolean(user.permissions?.readOnly),
        canWrite: Boolean(user.permissions?.canWrite),
        canExport: Boolean(user.permissions?.canExport),
        modules: modules.map(module => ({ module, allowed: isAdmin || allowed.includes(module) }))
    };
}

function getAccountingHealthV080(data = {}) {
    const companyId = Number(data.companyId || 0);
    const year = String(data.year || new Date().getFullYear());
    const month = String(data.month || String(new Date().getMonth() + 1).padStart(2, '0')).padStart(2, '0');
    const paramsCompany = companyId ? [companyId] : [];
    const companyJoinFilter = companyId ? 'AND ba.company_id = ?' : '';
    const docCompanyFilter = companyId ? 'AND company_id = ?' : '';
    const cashCompanyFilter = companyId ? 'AND company_id = ?' : '';

    const bankRows = db.prepare(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN COALESCE(t.category,'') = '' THEN 1 ELSE 0 END) AS uncategorized,
               SUM(CASE WHEN COALESCE(t.status,'missing') IN ('missing','review','to_review') THEN 1 ELSE 0 END) AS toReview
        FROM bank_transactions t
        LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
        WHERE substr(COALESCE(t.date_operation,''),1,4) = ?
          AND substr(COALESCE(t.date_operation,''),6,2) = ?
          ${companyJoinFilter}
    `).get(year, month, ...paramsCompany) || {};

    const docRows = db.prepare(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN COALESCE(validation_status,'pending') IN ('pending','to_review','review') THEN 1 ELSE 0 END) AS toValidate,
               SUM(CASE WHEN COALESCE(status,'unmatched') IN ('unmatched','missing','a_rapprocher','À rapprocher') THEN 1 ELSE 0 END) AS unmatched,
               SUM(CASE WHEN COALESCE(payment_status,'') IN ('due','to_pay','a_payer','À payer') THEN COALESCE(amount_ttc, detected_amount, 0) ELSE 0 END) AS billsToPay
        FROM documents
        WHERE (deleted_at IS NULL OR deleted_at = '')
          AND COALESCE(NULLIF(accounting_period_year,''), substr(COALESCE(invoice_date, detected_date, added_at),1,4)) = ?
          AND COALESCE(NULLIF(accounting_period_month,''), substr(COALESCE(invoice_date, detected_date, added_at),6,2)) = ?
          ${docCompanyFilter}
    `).get(year, month, ...paramsCompany) || {};

    const cashRows = db.prepare(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN COALESCE(is_invalid,0) = 1 THEN 1 ELSE 0 END) AS invalid
        FROM cash_sheets
        WHERE period_year = ? AND period_month = ? ${cashCompanyFilter}
    `).get(year, month, ...paramsCompany) || {};

    let vat = { totals: { collected: 0, deductible: 0, balance: 0, missingVat: 0 }, months: [] };
    try { vat = getVatCenterV073({ companyId, year }); } catch (_) {}
    const vatMonth = (vat.months || []).find(row => row.month === month) || { collected: 0, deductible: 0, balance: 0, missingVat: 0 };

    const checks = [
        { key: 'bank', label: 'Banque', score: Number(bankRows.total || 0) ? Math.max(0, 100 - (Number(bankRows.uncategorized || 0) * 4) - (Number(bankRows.toReview || 0) * 3)) : 70, detail: `${Number(bankRows.uncategorized || 0)} opération(s) sans catégorie · ${Number(bankRows.toReview || 0)} à contrôler` },
        { key: 'documents', label: 'Documents', score: Number(docRows.total || 0) ? Math.max(0, 100 - (Number(docRows.toValidate || 0) * 8) - (Number(docRows.unmatched || 0) * 4)) : 75, detail: `${Number(docRows.toValidate || 0)} à valider · ${Number(docRows.unmatched || 0)} à rapprocher` },
        { key: 'cash', label: 'Caisse', score: Number(cashRows.invalid || 0) ? 30 : (Number(cashRows.total || 0) ? 100 : 65), detail: Number(cashRows.total || 0) ? `${Number(cashRows.total || 0)} feuille(s) importée(s)` : 'Aucune feuille de caisse pour le mois' },
        { key: 'vat', label: 'TVA', score: Number(vatMonth.missingVat || 0) ? 55 : ((Number(vatMonth.collected || 0) || Number(vatMonth.deductible || 0)) ? 90 : 70), detail: `Solde estimé ${Number(vatMonth.balance || 0).toFixed(2)} € · ${Number(vatMonth.missingVat || 0)} facture(s) sans TVA` },
        { key: 'matching', label: 'Rapprochements', score: Number(docRows.unmatched || 0) ? Math.max(0, 100 - Number(docRows.unmatched || 0) * 5) : 100, detail: `${Number(docRows.unmatched || 0)} document(s) à rapprocher` }
    ];
    const score = Math.round(checks.reduce((sum, c) => sum + Number(c.score || 0), 0) / checks.length);
    return {
        companyId: companyId || null,
        year,
        month,
        score,
        status: score >= 85 ? 'ok' : score >= 65 ? 'warning' : 'danger',
        checks,
        totals: {
            transactions: Number(bankRows.total || 0),
            documents: Number(docRows.total || 0),
            billsToPay: Number(docRows.billsToPay || 0),
            cashSheets: Number(cashRows.total || 0),
            vatBalance: Number(vatMonth.balance || 0)
        }
    };
}


function getPeriodLockV083(data = {}) {
    const companyId = Number(data.companyId || 0);
    const year = String(data.year || data.periodYear || '').trim();
    const month = String(data.month || data.periodMonth || '').padStart(2, '0');
    if (!companyId || !year || !month) return { locked: false, companyId: companyId || null, year, month };
    const row = db.prepare(`
        SELECT * FROM accounting_period_locks
        WHERE company_id = ? AND period_year = ? AND period_month = ?
        LIMIT 1
    `).get(companyId, year, month);
    return {
        companyId,
        year,
        month,
        locked: Boolean(row && Number(row.locked || 0) === 1),
        lockedAt: row?.locked_at || '',
        lockedBy: row?.locked_by || '',
        note: row?.note || ''
    };
}

function isAccountingPeriodLockedV083(companyId, year, month) {
    return Boolean(getPeriodLockV083({ companyId, year, month }).locked);
}

function setPeriodLockV083(data = {}) {
    const companyId = Number(data.companyId || 0);
    const year = String(data.year || data.periodYear || '').trim();
    const month = String(data.month || data.periodMonth || '').padStart(2, '0');
    const locked = data.locked === false || Number(data.locked) === 0 ? 0 : 1;
    const actor = String(data.actor || data.user || '').trim();
    const note = String(data.note || '').trim();
    if (!companyId || !year || !month) return { ok: false, reason: 'Période incomplète.' };
    db.prepare(`
        INSERT INTO accounting_period_locks(company_id, period_year, period_month, locked, locked_at, locked_by, unlocked_at, unlocked_by, note, updated_at)
        VALUES(?, ?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, ?, CASE WHEN ? = 0 THEN CURRENT_TIMESTAMP ELSE NULL END, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(company_id, period_year, period_month) DO UPDATE SET
            locked = excluded.locked,
            locked_at = CASE WHEN excluded.locked = 1 THEN CURRENT_TIMESTAMP ELSE accounting_period_locks.locked_at END,
            locked_by = CASE WHEN excluded.locked = 1 THEN excluded.locked_by ELSE accounting_period_locks.locked_by END,
            unlocked_at = CASE WHEN excluded.locked = 0 THEN CURRENT_TIMESTAMP ELSE accounting_period_locks.unlocked_at END,
            unlocked_by = CASE WHEN excluded.locked = 0 THEN excluded.unlocked_by ELSE accounting_period_locks.unlocked_by END,
            note = excluded.note,
            updated_at = CURRENT_TIMESTAMP
    `).run(companyId, year, month, locked, locked, actor, locked, actor, note);
    try { addAuditLogV080({ companyId, actionType: locked ? 'period_locked' : 'period_unlocked', entityType: 'accounting_period', entityId: `${year}-${month}`, label: `${locked ? 'Période verrouillée' : 'Période déverrouillée'} : ${year}-${month}`, details: { actor, note } }); } catch (_) {}
    return { ok: true, ...getPeriodLockV083({ companyId, year, month }) };
}

function getExpertDossierV083(data = {}) {
    const companyId = Number(data.companyId || 0);
    const year = String(data.year || new Date().getFullYear());
    const month = String(data.month || String(new Date().getMonth() + 1).padStart(2, '0')).padStart(2, '0');
    const health = getAccountingHealthV080({ companyId, year, month });
    const preview = getAccountingExportPreviewV0456({ companyId, year, month, mode: 'transmission' });
    const archive = getAccountingExportPreviewV0456({ companyId, year, month, mode: 'archive' });
    const lock = getPeriodLockV083({ companyId, year, month });
    const docs = preview?.documents || [];
    const statements = preview?.statements || [];
    const checks = [
        { key: 'documents', label: 'Documents', ok: Number(health.checks?.find(c => c.key === 'documents')?.score || 0) >= 80, detail: health.checks?.find(c => c.key === 'documents')?.detail || '' },
        { key: 'bank', label: 'Banque', ok: Number(health.checks?.find(c => c.key === 'bank')?.score || 0) >= 80, detail: health.checks?.find(c => c.key === 'bank')?.detail || '' },
        { key: 'cash', label: 'Caisse', ok: Number(health.checks?.find(c => c.key === 'cash')?.score || 0) >= 80, detail: health.checks?.find(c => c.key === 'cash')?.detail || '' },
        { key: 'vat', label: 'TVA', ok: Number(health.checks?.find(c => c.key === 'vat')?.score || 0) >= 80, detail: health.checks?.find(c => c.key === 'vat')?.detail || '' },
        { key: 'matching', label: 'Rapprochements', ok: Number(health.checks?.find(c => c.key === 'matching')?.score || 0) >= 80, detail: health.checks?.find(c => c.key === 'matching')?.detail || '' }
    ];
    const readyScore = Math.round((Number(health.score || 0) * 0.7) + (checks.filter(c => c.ok).length / checks.length * 100 * 0.3));
    return {
        companyId,
        year,
        month,
        periodLabel: `${year}-${month}`,
        readyScore,
        status: readyScore >= 90 ? 'ready' : readyScore >= 70 ? 'to_review' : 'incomplete',
        locked: lock.locked,
        lock,
        checks,
        exportPreview: {
            documentsCount: docs.length,
            statementsCount: statements.length,
            totalTtc: Number(preview?.totals?.totalTtc || 0),
            archiveDocumentsCount: (archive?.documents || []).length,
            archiveStatementsCount: (archive?.statements || []).length
        },
        missing: checks.filter(c => !c.ok).map(c => ({ key: c.key, label: c.label, detail: c.detail }))
    };
}

function getThirdPartyTransactionsV083(data = {}) {
    const thirdPartyId = Number(data.thirdPartyId || 0);
    const year = data.year && data.year !== 'all' ? String(data.year) : '';
    if (!thirdPartyId) return { transactions: [], totals: { debit: 0, credit: 0, count: 0 } };
    const third = db.prepare(`SELECT * FROM third_parties WHERE id = ?`).get(thirdPartyId);
    if (!third) return { transactions: [], totals: { debit: 0, credit: 0, count: 0 } };
    const where = ['t.third_party_id = ?'];
    const params = [thirdPartyId];
    if (year) { where.push(`COALESCE(s.statement_year, substr(t.date_operation,1,4), substr(t.date_operation,-4)) = ?`); params.push(year); }
    const rows = db.prepare(`
        SELECT t.id, t.date_operation AS date, t.label, t.amount, t.category, t.status,
               ba.bank_name AS bankName, ba.account_name AS accountName, s.filename AS statementFilename,
               COUNT(r.id) AS receiptsCount
        FROM bank_transactions t
        LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
        LEFT JOIN statements s ON s.id = t.statement_id
        LEFT JOIN receipts r ON r.transaction_id = t.id
        WHERE ${where.join(' AND ')}
        GROUP BY t.id
        ORDER BY COALESCE(t.date_operation,'') DESC, t.id DESC
        LIMIT 500
    `).all(...params);
    const totals = rows.reduce((acc, row) => {
        const amount = Number(row.amount || 0);
        if (amount < 0) acc.debit += Math.abs(amount); else acc.credit += amount;
        acc.count += 1;
        return acc;
    }, { debit: 0, credit: 0, count: 0 });
    return { thirdParty: third, transactions: rows, totals };
}

module.exports = {
    db,
    DATA_DIR,
    STATEMENTS_DIR,
    RECEIPTS_DIR,
    RIB_DIR,
    BACKUPS_DIR,
    DB_PATH,
    USER_DATA_ROOT,
    APP_ROOT,
    getAppSettingV085,
    setAppSettingV085,
    getStorageSettingsV085,
    saveStorageSettingsV085,
    getDesktopStorageStatusV085,
    markDocumentStorageV085,

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
    getAccountingAlertsV045,
    getReconciliationDashboardV045,
    searchTransactionsForDocument,

    createReceipt,
    getReceipt,
    getReceipts,
    deleteReceipt,

    getThirdParties,
    getThirdPartyYears,
    getThirdPartyTypeOptionsV0423,
    applyBusinessRulesToThirdPartiesV0423,
    updateThirdPartyTypeEverywhere,
    cleanupThirdParties,
    mergeThirdParties,
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
    createAutomationRule,
    getAutomationRules,
    deleteAutomationRule,
    updateAutomationRule,
    renameCategoryEverywhere,
    updateCategoryUsage,
    deleteCategoryRule,
    applyAutomationRules,
    cleanupOrphanDocumentLinks,
    findExistingDocumentByHashOrName,
    refreshTransactionStatusFromDocuments,
    createCashSheet,
    getCashSheets,
    findCashSheetByCompanyPeriod,
    deleteCashSheetsByCompanyPeriod,
    deleteCashSheet,
    deleteInvalidCashSheetsV070,
    learnCategoryFromTransactionV070,
    getCashSheetInsights,
    getCompanyDashboard,
    getLatestStatementsTreasury,
    getCashSheetReminders,
    renameDocument,
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
    saveDocumentLearningRuleV0452,
    saveUserLearningEvent,
    getUserLearningEvents,
    saveDocumentLearningRulesV0452,
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
    addOrReinforceAutomationRuleV072,
    getBankAutomationSuggestionsV072,
    applyBankAutomationSuggestionsV072,
    getAutomationStatsV072,
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
};
