// Focus Compta V0.40 module
let selectedCompany = null;
let selectedBankAccount = null;
let selectedStatementId = 'all';
let selectedTransaction = null;
let selectedRibFilepath = null;
let searchTimer = null;
let selectedTransactionIds = new Set();
let categoryRules = [];
let selectedDocumentId = null;


function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function getCurrentFiscalYear() {
    return String(new Date().getFullYear());
}

async function updateCompanyContextBar(extra = {}) {
    const bar = document.getElementById('companyContextBar');
    if (!bar) return;

    const companyName = selectedCompany?.name || 'Aucune société ouverte';
    const bankName = selectedBankAccount
        ? bankAccountTitle(selectedBankAccount)
        : (selectedCompany ? 'Tous comptes' : '—');

    setText('contextCompanyName', companyName);
    setText('contextFiscalYear', selectedCompany ? (extra.fiscalYear || getCurrentFiscalYear()) : '—');
    setText('contextBankName', bankName);
    setText('contextTreasury', selectedCompany ? (extra.treasury ?? 'Calcul...') : '—');
    setText('contextMissingCount', selectedCompany ? (extra.missingCount ?? 'Calcul...') : '—');

    bar.classList.toggle('no-company', !selectedCompany);

    if (!selectedCompany) return;

    try {
        const dashboard = await window.api.getCompanyDashboard(selectedCompany.id);
        const totals = dashboard?.totals || {};
        const treasury = dashboard?.treasury || {};

        if (selectedBankAccount) {
            const summary = await window.api.getTransactionSummary({ bankAccountId: selectedBankAccount.id, filters: {} });
            const accountTreasury = (treasury.accounts || []).find(row => Number(row.account?.id) === Number(selectedBankAccount.id));
            setText('contextTreasury', formatAmount(accountTreasury?.balance ?? (Number(summary.credit || 0) + Number(summary.debit || 0))));
            setText('contextMissingCount', summary.missing || 0);
            return;
        }

        setText('contextTreasury', formatAmount(treasury.total ?? totals.balance ?? 0));
        setText('contextMissingCount', totals.missing || 0);
    } catch (error) {
        console.warn('Impossible de mettre à jour le bandeau société', error);
        setText('contextTreasury', '—');
        setText('contextMissingCount', '—');
    }
}

const MONTH_LABELS = {
    '01': 'Janvier',
    '02': 'Février',
    '03': 'Mars',
    '04': 'Avril',
    '05': 'Mai',
    '06': 'Juin',
    '07': 'Juillet',
    '08': 'Août',
    '09': 'Septembre',
    '10': 'Octobre',
    '11': 'Novembre',
    '12': 'Décembre'
};


function showPage(pageId) {
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.toggle('active-page', section.id === pageId);
    });

    document.querySelectorAll('.nav-button').forEach(button => {
        button.classList.toggle('active', button.dataset.page === pageId);
    });
}

function focusEscapeHtmlV04116(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function makeCompanyCard(company, options = {}) {
    const card = document.createElement('article');
    card.className = 'company-card';
    card.dataset.companyId = company.id;

    const subtitle = options.subtitle || 'Société active';
    const details = options.details || 'Cliquez pour ouvrir le dossier';
    const isHomeCard = options.home === true;
    const actionsHtml = isHomeCard ? '' : `
        <button class="secondary-button small-button company-edit-button-v04116" type="button">Modifier</button>
        <button class="danger-button small-button company-delete-button-v04116" type="button">Supprimer</button>
    `;

    card.innerHTML = `
        <div class="company-card-header">
            <h3>${focusEscapeHtmlV04116(company.name)}</h3>
            <span class="status-pill">Actif</span>
        </div>
        <p>${focusEscapeHtmlV04116(subtitle)}</p>
        <div class="company-card-metrics">${details}</div>
        <div class="company-card-actions-v04116">
            <button class="primary-button small-button company-open-button-v04116" type="button">Ouvrir</button>
            ${actionsHtml}
        </div>
    `;

    const openButton = card.querySelector('.company-open-button-v04116');
    if (openButton) {
        openButton.addEventListener('click', async () => {
            await selectCompany(company, false);
            if (typeof renderSelectedCompanyDossierV050 === 'function') await renderSelectedCompanyDossierV050();
            showPage('companiesPage');
        });
    }

    const editButton = card.querySelector('.company-edit-button-v04116');
    if (editButton) {
        editButton.addEventListener('click', async event => {
            event.stopPropagation();
            await editCompanyV04116(company);
        });
    }

    const deleteButton = card.querySelector('.company-delete-button-v04116');
    if (deleteButton) {
        deleteButton.addEventListener('click', async event => {
            event.stopPropagation();
            await deleteCompanyV04116(company);
        });
    }

    return card;
}

async function focusAskCompanyNameV04116(company) {
    if (typeof window.showTextInputModal === 'function') {
        return window.showTextInputModal('Modifier la société', 'Nom de la société', company.name || '');
    }
    const value = document.createElement('input');
    value.value = company.name || '';
    return Promise.resolve(value.value);
}

async function editCompanyV04116(company) {
    const nextName = String(await focusAskCompanyNameV04116(company) || '').trim();
    if (!nextName || nextName === company.name) return;

    try {
        const result = await window.api.updateCompany({ id: company.id, name: nextName });
        if (result && result.updated === false) throw new Error(result.message || 'Modification impossible.');
        if (selectedCompany && String(selectedCompany.id) === String(company.id)) {
            selectedCompany = { ...selectedCompany, name: nextName };
            try { localStorage.setItem('focus_active_company_id', String(company.id)); } catch (_) {}
            updateCompanyContextBar();
            const title = document.getElementById('selectedCompanyTitle');
            if (title) title.textContent = nextName;
        }
        await loadCompanies();
        if (window.showToast) window.showToast('Société modifiée.', 'success');
    } catch (error) {
        if (window.showToast) window.showToast(error.message || 'Modification impossible.', 'danger');
    }
}

function showDeleteCompanyModalV04116(company, preview) {
    return new Promise(resolve => {
        let modal = document.getElementById('deleteCompanyModalV04116');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'deleteCompanyModalV04116';
            modal.className = 'focus-modal-backdrop-v0412';
            modal.innerHTML = `
                <div class="focus-modal-card-v0412 focus-danger-modal-v04116">
                    <h3>Supprimer la société</h3>
                    <p class="danger-copy-v04116"></p>
                    <div class="delete-preview-v04116"></div>
                    <label class="delete-label-v04116">Tape SUPPRIMER pour confirmer</label>
                    <input id="deleteCompanyConfirmInputV04116" class="focus-input-v04116" autocomplete="off" />
                    <div class="focus-modal-actions-v0412">
                        <button type="button" class="btn-secondary" id="deleteCompanyCancelV04116">Annuler</button>
                        <button type="button" class="btn-primary danger-button" id="deleteCompanyOkV04116">Supprimer définitivement</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const counts = preview?.counts || {};
        modal.querySelector('.danger-copy-v04116').textContent = `Cette action supprimera définitivement “${company.name}” et toutes ses données liées.`;
        modal.querySelector('.delete-preview-v04116').innerHTML = `
            <strong>Données concernées :</strong>
            <span>${Number(counts.accounts || 0)} compte(s)</span>
            <span>${Number(counts.statements || 0)} relevé(s)</span>
            <span>${Number(counts.transactions || 0)} opération(s)</span>
            <span>${Number(counts.receipts || 0)} justificatif(s)</span>
            <span>${Number(counts.documents || 0)} document(s)</span>
            <span>${Number(counts.thirdParties || 0)} tiers</span>
            <span>${Number(counts.cashSheets || 0)} feuille(s) de caisse</span>
        `;

        const input = document.getElementById('deleteCompanyConfirmInputV04116');
        const ok = document.getElementById('deleteCompanyOkV04116');
        const cancel = document.getElementById('deleteCompanyCancelV04116');
        input.value = '';
        ok.disabled = true;
        modal.style.display = 'flex';

        const cleanup = value => {
            modal.style.display = 'none';
            input.oninput = null;
            ok.onclick = null;
            cancel.onclick = null;
            modal.onclick = null;
            document.removeEventListener('keydown', onKeyDown);
            resolve(value);
        };
        const onKeyDown = event => {
            if (event.key === 'Escape') cleanup(false);
        };
        input.oninput = () => { ok.disabled = input.value.trim() !== 'SUPPRIMER'; };
        ok.onclick = () => cleanup(input.value.trim() === 'SUPPRIMER');
        cancel.onclick = () => cleanup(false);
        modal.onclick = event => { if (event.target === modal) cleanup(false); };
        document.addEventListener('keydown', onKeyDown);
        setTimeout(() => input.focus(), 30);
    });
}

async function deleteCompanyV04116(company) {
    try {
        const preview = await window.api.getCompanyDeletionPreview(company.id);
        if (!preview || preview.found === false) throw new Error(preview?.message || 'Société introuvable.');
        const confirmed = await showDeleteCompanyModalV04116(company, preview);
        if (!confirmed) return;

        const result = await window.api.deleteCompany(company.id);
        if (!result || result.deleted === false) throw new Error(result?.message || 'Suppression impossible.');

        if (selectedCompany && String(selectedCompany.id) === String(company.id)) {
            selectedCompany = null;
            selectedBankAccount = null;
            selectedStatementId = 'all';
            try { localStorage.removeItem('focus_active_company_id'); } catch (_) {}
            resetTransactionDetail();
            const selectedCompanyTitle = document.getElementById('selectedCompanyTitle');
            if (selectedCompanyTitle) selectedCompanyTitle.textContent = 'Aucune société';
        }

        await loadCompanies();
        await restoreActiveCompanyV0419();
        updateCompanyContextBar();
        if (window.showToast) window.showToast('Société supprimée.', 'success');
    } catch (error) {
        if (window.showToast) window.showToast(error.message || 'Suppression impossible.', 'danger');
    }
}

async function selectCompany(company, goToBank = true) {
    selectedCompany = company;
    try { localStorage.setItem('focus_active_company_id', String(company.id)); } catch (error) { console.warn('Impossible de mémoriser la société active', error); }
    selectedBankAccount = null;
    selectedStatementId = 'all';

    updateCompanyContextBar();
    document.getElementById('selectedCompanyTitle').textContent = company.name;
    document.getElementById('bankSection').style.display = 'block';
    document.getElementById('statementSidebar').style.display = 'none';

    document.getElementById('selectedAccountTitle').textContent = 'Sélectionne un compte bancaire';
    document.getElementById('smartReceipt')?.style && (document.getElementById('smartReceipt').style.display = 'none');
    document.getElementById('summaryCards').style.display = 'none';
    document.getElementById('toolsPanel').style.display = 'none';
    document.getElementById('transactionTable').style.display = 'none';

    const dashboardAccountSummary = document.getElementById('dashboardAccountSummary');
    if (dashboardAccountSummary) dashboardAccountSummary.style.display = 'none';
    const dashboardPanel = document.getElementById('dashboardPanel');
    if (dashboardPanel) dashboardPanel.style.display = 'none';

    resetTransactionDetail();
    await loadBankAccounts();

    if (goToBank) showPage('bankPage');
}

function statementHasControlGap(statement) {
    if (!statement || !statement.report_json) return false;

    try {
        const report = JSON.parse(statement.report_json);
        if (report && report.isBalanced === false) return true;

        const debitDiff = Number(report?.debitDifference ?? report?.debit_difference ?? 0);
        const creditDiff = Number(report?.creditDifference ?? report?.credit_difference ?? 0);
        const balanceDiff = Number(report?.balanceDifference ?? report?.balance_difference ?? 0);
        return Math.abs(debitDiff) > 0.01 || Math.abs(creditDiff) > 0.01 || Math.abs(balanceDiff) > 0.01;
    } catch (error) {
        return false;
    }
}

function setHealthCardState(id, count) {
    const el = document.getElementById(id);
    const card = el?.closest('.health-card-v0403');
    if (!card) return;

    card.classList.toggle('is-ok', Number(count || 0) === 0);
    card.classList.toggle('has-alert', Number(count || 0) > 0);
}

async function loadHomeHealthStatus(companies, base = {}) {
    const health = {
        statementGaps: 0,
        missingReceipts: Number(base.totalMissing || 0),
        missingReceiptsAmount: Number(base.totalMissingAmount || 0),
        unmatchedDocuments: 0,
        missingCashSheets: 0,
        duplicates: 0,
        cashPeriodLabel: 'Mois précédent'
    };

    for (const company of companies) {
        try {
            const accounts = await window.api.getBankAccounts(company.id);
            for (const account of accounts) {
                const statements = await window.api.getStatements(account.id);
                health.statementGaps += statements.filter(statementHasControlGap).length;
            }
        } catch (error) {
            console.warn('Impossible de contrôler les relevés', company.name, error);
        }

        try {
            if (window.api.getDocumentSmartFolders) {
                const folders = await window.api.getDocumentSmartFolders({ companyId: company.id });
                health.unmatchedDocuments += Number(folders?.unmatched || 0);
            } else {
                const docs = await window.api.getDocuments({ companyId: company.id, filters: { status: 'all' } });
                health.unmatchedDocuments += docs.filter(doc => doc.status !== 'matched' && !['releve', 'rib'].includes(doc.doc_type || '')).length;
            }
        } catch (error) {
            console.warn('Impossible de contrôler les documents non rapprochés', company.name, error);
        }

        try {
            if (window.api.getDocumentDuplicates) {
                const duplicates = await window.api.getDocumentDuplicates({ companyId: company.id });
                health.duplicates += Array.isArray(duplicates) ? duplicates.length : 0;
            }
        } catch (error) {
            console.warn('Impossible de contrôler les doublons', company.name, error);
        }
    }

    try {
        if (window.api.getCashSheetReminders) {
            const reminders = await window.api.getCashSheetReminders();
            health.missingCashSheets = reminders.filter(row => row.missing).length;
            const first = reminders[0];
            if (first?.periodMonth && first?.periodYear) {
                health.cashPeriodLabel = `${MONTH_LABELS[first.periodMonth] || first.periodMonth} ${first.periodYear}`;
            }
        }
    } catch (error) {
        console.warn('Impossible de contrôler les feuilles de caisse manquantes', error);
    }

    const totalAlerts = health.statementGaps + health.missingReceipts + health.unmatchedDocuments + health.missingCashSheets + health.duplicates;

    setText('healthStatementGaps', health.statementGaps);
    setText('healthMissingReceipts', health.missingReceipts);
    setText('healthMissingReceiptsAmount', formatAmount(health.missingReceiptsAmount));
    setText('healthUnmatchedDocuments', health.unmatchedDocuments);
    setText('healthMissingCashSheets', health.missingCashSheets);
    setText('healthMissingCashPeriod', health.cashPeriodLabel);
    setText('healthDuplicates', health.duplicates);
    setText('homeAlerts', totalAlerts);
    setText('homeHealthSummary', totalAlerts > 0 ? `${totalAlerts} point(s) à traiter` : 'Tout est sain.');

    ['healthStatementGaps', 'healthMissingReceipts', 'healthUnmatchedDocuments', 'healthMissingCashSheets', 'healthDuplicates']
        .forEach(id => setHealthCardState(id, Number(document.getElementById(id)?.textContent || 0)));
}

async function loadHomeInsights(companies) {
    updateCompanyContextBar();
    let totalCredit = 0;
    let totalDebit = 0;
    let totalTransactions = 0;
    let totalMissing = 0;
    let totalMissingAmount = 0;
    let totalStatements = 0;
    const categoryTotals = new Map();

    for (const company of companies) {
        const accounts = await window.api.getBankAccounts(company.id);

        for (const account of accounts) {
            const summary = await window.api.getTransactionSummary({ bankAccountId: account.id, filters: {} });
            const statements = await window.api.getStatements(account.id);
            const insights = await window.api.getDashboardInsights({ bankAccountId: account.id, filters: {} });

            totalCredit += Number(summary.credit || 0);
            totalDebit += Math.abs(Number(summary.debit || 0));
            totalTransactions += Number(summary.total || 0);
            totalMissing += Number(summary.missing || 0);
            totalMissingAmount += Math.abs(Number(insights.missing?.total || 0));
            totalStatements += statements.length;

            (insights.categories || []).forEach(row => {
                const name = row.category || 'Non catégorisé';
                const amount = Math.abs(Number(row.debit_total || row.credit_total || row.total || 0));
                categoryTotals.set(name, (categoryTotals.get(name) || 0) + amount);
            });
        }
    }

    document.getElementById('homeExpenses').textContent = formatAmount(totalDebit);
    document.getElementById('homeIncome').textContent = formatAmount(totalCredit);
    document.getElementById('homeMissing').textContent = totalMissing;
    document.getElementById('homeMissingAmount').textContent = formatAmount(totalMissingAmount);
    document.getElementById('homeTransactions').textContent = totalTransactions;
    document.getElementById('homeStatements').textContent = totalStatements;
    document.getElementById('homeAlerts').textContent = totalMissing;
    await loadHomeHealthStatus(companies, { totalMissing, totalMissingAmount });

    const recent = document.getElementById('recentActivity');
    recent.innerHTML = '';
    const activities = [
        totalStatements > 0 ? `✅ ${totalStatements} relevé(s) importé(s)` : 'ℹ️ Aucun relevé importé',
        totalTransactions > 0 ? `✅ ${totalTransactions} opération(s) détectée(s)` : 'ℹ️ Aucune opération',
        totalMissing > 0 ? `⚠️ ${totalMissing} opération(s) sans justificatif` : '✅ Toutes les opérations sont justifiées',
        '💾 Sauvegarde locale disponible dans Paramètres'
    ];
    activities.forEach(text => {
        const li = document.createElement('li');
        li.textContent = text;
        recent.appendChild(li);
    });

    const categories = document.getElementById('homeCategoryBreakdown');
    categories.innerHTML = '';
    [...categoryTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .forEach(([name, amount]) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${name}</span><strong>${formatAmount(amount)}</strong>`;
            categories.appendChild(li);
        });

    if (categoryTotals.size === 0) {
        const li = document.createElement('li');
        li.className = 'muted';
        li.textContent = 'Aucune donnée.';
        categories.appendChild(li);
    }

    if (typeof focusRenderTreatmentHistoryV041 === 'function') {
        focusRenderTreatmentHistoryV041();
    }
}

function formatAmount(value) {
    return Number(value || 0).toLocaleString('fr-FR', {
        style: 'currency',
        currency: 'EUR'
    });
}

function formatPercent(value) {
    return `${Number(value || 0).toFixed(0)} %`;
}

function getStatusLabel(status) {
    const labels = {
        missing: '❌ Manquant',
        attached: '📎 Pièce jointe',
        verified: '✅ Vérifié',
        review: '⚠️ À vérifier',
        ignored: 'Ignoré'
    };

    return labels[status] || '❌ Manquant';
}
// Focus Compta V0.39.7 - Suppression prompt + recherche rapprochements
// ===========================

function askInputV0397(title, label, defaultValue = '') {
    return new Promise(resolve => {
        const modal = document.getElementById('inputModalV0397');
        const titleEl = document.getElementById('inputModalTitleV0397');
        const labelEl = document.getElementById('inputModalLabelV0397');
        const input = document.getElementById('inputModalFieldV0397');
        const ok = document.getElementById('inputModalOkV0397');
        const cancel = document.getElementById('inputModalCancelV0397');

        if (!modal || !input || !ok || !cancel) {
            resolve(null);
            return;
        }

        titleEl.textContent = title || 'Saisie';
        labelEl.textContent = label || '';
        input.value = defaultValue || '';
        modal.style.display = 'flex';

        const cleanup = (value) => {
            modal.style.display = 'none';
            ok.onclick = null;
            cancel.onclick = null;
            input.onkeydown = null;
            resolve(value);
        };

        ok.onclick = () => cleanup(input.value.trim());
        cancel.onclick = () => cleanup(null);
        input.onkeydown = event => {
            if (event.key === 'Enter') cleanup(input.value.trim());
            if (event.key === 'Escape') cleanup(null);
        };

        setTimeout(() => {
            input.focus();
            input.select();
        }, 50);
    });
}


// Focus Compta V0.40.9 - fenêtre de progression réutilisable
function ensureProgressModalV0409() {
    let modal = document.getElementById('progressModalV0409');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'progressModalV0409';
    modal.className = 'progress-modal-v0409';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="progress-card-v0409">
            <div class="progress-spinner-v0409" aria-hidden="true"></div>
            <div>
                <h3 id="progressTitleV0409">Traitement en cours</h3>
                <p id="progressMessageV0409">Merci de patienter…</p>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function showProgressV0409(title = 'Traitement en cours', message = 'Merci de patienter…') {
    const modal = ensureProgressModalV0409();
    const titleEl = document.getElementById('progressTitleV0409');
    const messageEl = document.getElementById('progressMessageV0409');
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    modal.style.display = 'flex';
}

function updateProgressV0409(message) {
    const messageEl = document.getElementById('progressMessageV0409');
    if (messageEl) messageEl.textContent = message || 'Merci de patienter…';
}

function hideProgressV0409() {
    const modal = document.getElementById('progressModalV0409');
    if (modal) modal.style.display = 'none';
}

// Focus Compta V0.40.5 - listes personnalisables catégories/statuts
const FOCUS_DEFAULT_CATEGORIES_V0405 = [
    'Achats', 'Banque', 'Électricité', 'Frais bancaires', 'Loyer', 'Salaires', 'Tiers-payant', 'Ventes'
];
const FOCUS_DEFAULT_STATUSES_V0405 = [
    { code: 'missing', label: 'Justificatif manquant', icon: '❌' },
    { code: 'attached', label: 'Pièce jointe', icon: '📎' },
    { code: 'verified', label: 'Vérifié', icon: '✅' },
    { code: 'review', label: 'À vérifier', icon: '⚠️' },
    { code: 'ignored', label: 'Ignoré', icon: '' }
];

function focusSlugV0405(value) {
    return String(value || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || `statut_${Date.now()}`;
}

function focusReadJsonV0405(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
        return fallback;
    }
}

function focusUniqueCategoriesV0407(values) {
    const map = new Map();
    (values || []).map(v => String(v || '').trim()).filter(Boolean).forEach(value => {
        const key = value.toLocaleLowerCase('fr-FR');
        if (!map.has(key)) map.set(key, value);
    });
    return [...map.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

function focusGetCustomCategoriesV0405() {
    const saved = focusReadJsonV0405('focus_custom_categories_v0405', null);
    const base = Array.isArray(saved) ? saved : FOCUS_DEFAULT_CATEGORIES_V0405;
    const fromRules = Array.isArray(categoryRules) ? categoryRules.map(rule => rule.category).filter(Boolean) : [];
    return focusUniqueCategoriesV0407([...base, ...fromRules]);
}

function focusSaveCustomCategoriesV0405(categories) {
    const clean = focusUniqueCategoriesV0407(categories || []);
    localStorage.setItem('focus_custom_categories_v0405', JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent('focus-taxonomies-updated-v0405'));
}

function focusGetCustomStatusesV0405() {
    const saved = focusReadJsonV0405('focus_custom_statuses_v0405', []);
    const merged = [...FOCUS_DEFAULT_STATUSES_V0405, ...saved]
        .filter(item => item && item.code && item.label)
        .map(item => ({ code: String(item.code), label: String(item.label), icon: item.icon || '' }));
    return [...new Map(merged.map(item => [item.code, item])).values()];
}

function focusSaveCustomStatusesV0405(statuses) {
    const defaultCodes = new Set(FOCUS_DEFAULT_STATUSES_V0405.map(item => item.code));
    const clean = (statuses || [])
        .filter(item => item && item.code && item.label)
        .map(item => ({ code: focusSlugV0405(item.code), label: String(item.label).trim(), icon: item.icon || '' }))
        .filter(item => item.label && !defaultCodes.has(item.code));
    localStorage.setItem('focus_custom_statuses_v0405', JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent('focus-taxonomies-updated-v0405'));
}

function focusPopulateCategorySelectV0405(select, placeholder = 'Non catégorisé') {
    if (!select) return;
    const current = select.value || '';
    select.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    select.appendChild(empty);
    focusGetCustomCategoriesV0405().forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        select.appendChild(option);
    });
    select.value = current;
}

function focusPopulateStatusSelectV0405(select, options = {}) {
    if (!select) return;
    const current = select.value || '';
    select.innerHTML = '';
    if (options.all) {
        const option = document.createElement('option');
        option.value = 'all';
        option.textContent = 'Tous';
        select.appendChild(option);
    }
    if (options.empty) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = options.empty;
        select.appendChild(option);
    }
    focusGetCustomStatusesV0405().forEach(status => {
        const option = document.createElement('option');
        option.value = status.code;
        option.textContent = status.label;
        select.appendChild(option);
    });
    select.value = current || (options.all ? 'all' : '');
}

function getStatusLabel(status) {
    const item = focusGetCustomStatusesV0405().find(row => row.code === status);
    if (!item) return '❌ Manquant';
    return `${item.icon ? item.icon + ' ' : ''}${item.label}`;
}

// Focus Compta V0.41 - Centre de traitement / modales propres
function escapeHtmlV041(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function focusReadTreatmentHistoryV041() {
    try { return JSON.parse(localStorage.getItem('focusTreatmentHistoryV041') || '[]'); }
    catch (_) { return []; }
}

function focusPushTreatmentHistoryV041(entry) {
    const history = focusReadTreatmentHistoryV041();
    history.unshift({ id: Date.now(), date: new Date().toISOString(), ...entry });
    localStorage.setItem('focusTreatmentHistoryV041', JSON.stringify(history.slice(0, 30)));
}

function focusRenderTreatmentHistoryV041() {
    const list = document.getElementById('recentActivity');
    if (!list) return;
    const history = focusReadTreatmentHistoryV041();
    if (!history.length) return;
    list.innerHTML = history.slice(0, 8).map(row => {
        const date = new Date(row.date).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
        const tone = row.actionRequired > 0 ? 'danger' : (row.warnings > 0 ? 'warning' : 'success');
        return `<li class="activity-item-v041 ${tone}"><strong>${escapeHtmlV041(row.type || 'Traitement')}</strong><span>${escapeHtmlV041(row.summary || '')}</span><small>${date}</small></li>`;
    }).join('');
}

function focusToastV041(message, type = 'success') {
    let box = document.getElementById('focusToastV041');
    if (!box) {
        box = document.createElement('div');
        box.id = 'focusToastV041';
        box.className = 'focus-toast-v041';
        document.body.appendChild(box);
    }
    box.className = `focus-toast-v041 ${type}`;
    box.textContent = message;
    box.classList.add('visible');
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.classList.remove('visible'), 2600);
}
if (typeof window !== 'undefined') {
    window.focusToastV041 = focusToastV041;
    window.showToast = (message, type = 'success') => focusToastV041(message, type);
    window.showToastV0409 = (message, type = 'success') => focusToastV041(message, type);
}

function focusCloseTreatmentModalV041() {
    const modal = document.getElementById('treatmentModalV041');
    if (modal) modal.remove();
}


// V0.41.14 - outils d'affectation rapide des relevés non reconnus
function focusTitleCaseV04114(value) {
    return String(value || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map(part => part.length <= 3 && ['sas', 'sasu', 'sarl', 'sel', 'sci'].includes(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function focusNormalizeNameV04114(value) {
    return String(value || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function focusGuessStatementIdentityV04114(filename) {
    const clean = String(filename || '').replace(/\.pdf$/i, '').replace(/[’']/g, ' ');
    const match = clean.match(/(?:^|[\s_-])(CCOU|CAPI|LIV|CPT)[\s_-]*(\d{5,})(?:[\s_-]+(.+))?$/i);
    const code = match?.[1]?.toUpperCase() || '';
    const accountNumber = match?.[2] || '';
    const rawCompany = (match?.[3] || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\bS\s*A\s*S\b/gi, 'SAS')
        .replace(/\bSASU\b/gi, 'SASU')
        .replace(/\s+/g, ' ')
        .trim();
    const withoutLegal = rawCompany
        .replace(/^(SAS|SASU|SARL|SELARL|SCI)\s+/i, '')
        .replace(/\s+(SAS|SASU|SARL|SELARL|SCI)$/i, '')
        .trim();
    return {
        code,
        accountNumber,
        companyName: focusTitleCaseV04114(withoutLegal || rawCompany || ''),
        bankName: 'Crédit Agricole',
        accountName: code === 'CAPI' ? 'Compte Tiers-Payant' : 'Compte Courant Principal'
    };
}

async function focusFindOrCreateCompanyV04114(companyName) {
    const normalized = focusNormalizeNameV04114(companyName);
    let companies = await window.api.getCompanies();
    let company = companies.find(item => focusNormalizeNameV04114(item.name) === normalized);
    if (!company) {
        await window.api.addCompany(companyName);
        companies = await window.api.getCompanies();
        company = companies.find(item => focusNormalizeNameV04114(item.name) === normalized) || companies[companies.length - 1];
    }
    return company;
}

async function focusCreateAccountForUnresolvedStatementV04114(row, panel) {
    const companyInput = panel.querySelector('[data-new-company-name]');
    const bankInput = panel.querySelector('[data-new-bank-name]');
    const accountInput = panel.querySelector('[data-new-account-name]');
    const numberInput = panel.querySelector('[data-new-account-number]');
    const companyName = companyInput?.value?.trim();
    const bankName = bankInput?.value?.trim() || 'Crédit Agricole';
    const accountName = accountInput?.value?.trim() || 'Compte Courant Principal';
    const accountNumber = numberInput?.value?.trim() || '';
    if (!companyName) throw new Error('Nom de société obligatoire.');
    if (!bankName) throw new Error('Nom de banque obligatoire.');

    const company = await focusFindOrCreateCompanyV04114(companyName);
    if (!company?.id) throw new Error('Création de la société impossible.');

    await window.api.addBankAccount({
        companyId: company.id,
        bankName,
        accountName,
        accountNumber,
        iban: '',
        bic: ''
    });

    const accounts = await window.api.getBankAccounts(company.id);
    const normalizedAccountName = focusNormalizeNameV04114(accountName);
    const created = [...accounts].reverse().find(acc =>
        String(acc.account_number || acc.accountNumber || '') === String(accountNumber || '') ||
        (focusNormalizeNameV04114(acc.account_name || acc.accountName || '') === normalizedAccountName && focusNormalizeNameV04114(acc.bank_name || acc.bankName || '') === focusNormalizeNameV04114(bankName))
    ) || accounts[accounts.length - 1];

    if (!created?.id) throw new Error('Création du compte bancaire impossible.');
    return { company, account: created };
}

async function focusShowImportReportV041(bulk, options = {}) {
    const rows = Array.isArray(bulk?.results) ? bulk.results : [];
    const imported = rows.filter(row => row.imported);
    const withControl = imported.filter(row => row.importReport);
    const gaps = withControl.filter(row => !row.importReport?.isBalanced);
    const unresolved = rows.filter(row => row.unresolved);
    const skipped = Number(bulk?.skippedCount || 0);
    const rules = Number(bulk?.automationRulesAppliedCount || 0);
    const transactions = Number(bulk?.transactionsCount || 0);

    focusPushTreatmentHistoryV041({
        type: 'Import relevés',
        summary: `${imported.length} relevé(s), ${transactions} opération(s), ${gaps.length + unresolved.length} action(s)`,
        successes: imported.length + transactions + rules,
        warnings: skipped + gaps.length,
        actionRequired: unresolved.length
    });
    focusRenderTreatmentHistoryV041();

    const modal = document.createElement('div');
    modal.id = 'treatmentModalV041';
    modal.className = 'treatment-modal-v041';
    modal.innerHTML = `
        <div class="treatment-card-v041">
            <div class="treatment-header-v041">
                <div><span class="eyebrow">Centre de traitement</span><h2>Import terminé</h2><p>${escapeHtmlV041(options.subtitle || 'Relevés bancaires analysés et classés.')}</p></div>
                <button class="modal-close-v041" data-close>×</button>
            </div>
            <div class="treatment-summary-v041">
                <div class="treatment-kpi-v041 success"><span>Relevés importés</span><strong>${imported.length}</strong></div>
                <div class="treatment-kpi-v041 success"><span>Opérations créées</span><strong>${transactions}</strong></div>
                <div class="treatment-kpi-v041 success"><span>Classées par règles</span><strong>${rules}</strong></div>
                <div class="treatment-kpi-v041 warning"><span>Avec écart</span><strong>${gaps.length}</strong></div>
                <div class="treatment-kpi-v041 danger"><span>Non affectés</span><strong>${unresolved.length}</strong></div>
            </div>
            <div class="treatment-sections-v041">
                ${gaps.length ? `<section><h3>Écarts bancaires à contrôler</h3>${gaps.slice(0, 8).map(row => {
                    const report = row.importReport || {};
                    const debitDiff = Number(report.debitDifference ?? report.debit_difference ?? 0);
                    const creditDiff = Number(report.creditDifference ?? report.credit_difference ?? 0);
                    const diff = Math.max(Math.abs(debitDiff), Math.abs(creditDiff));
                    const diag = Array.isArray(report.diagnostics) && report.diagnostics.length ? report.diagnostics[0] : null;
                    const totals = `PDF débit ${Number(report.expectedDebit || 0).toFixed(2)} € / import débit ${Number(report.importedDebit || 0).toFixed(2)} € · PDF crédit ${Number(report.expectedCredit || 0).toFixed(2)} € / import crédit ${Number(report.importedCredit || 0).toFixed(2)} €`;
                    const message = diag?.message || `Écart estimé : ${diff.toFixed(2)} €`;
                    return `<div class="treatment-row-v041 warning"><div><strong>${escapeHtmlV041(row.filename)}</strong><small>${escapeHtmlV041(message)}</small><small>${escapeHtmlV041(totals)}</small></div><button data-open-bank>Voir banque</button></div>`;
                }).join('')}</section>` : ''}
                ${unresolved.length ? `<section><h3>Relevés non affectés</h3><p class="muted">Choisis un compte existant ou crée directement la société et le compte manquants.</p><div id="unresolvedStatementsV041">${unresolved.slice(0, 12).map((row, idx) => {
                    const guess = focusGuessStatementIdentityV04114(row.filename);
                    return `
                    <div class="treatment-row-v041 danger unresolved-row-v041" data-index="${idx}">
                        <div><strong>${escapeHtmlV041(row.filename)}</strong><small>${escapeHtmlV041(row.message || 'Compte bancaire non identifié')}</small></div>
                        <select class="unresolved-account-select-v041"><option value="">Choisir un compte…</option><option value="__create__">+ Créer société / compte…</option></select>
                        <button class="secondary-button" data-import-unresolved="${idx}">Affecter</button>
                        <div class="unresolved-create-account-v04114" hidden>
                            <div class="field"><label>Société</label><input data-new-company-name value="${escapeHtmlV041(guess.companyName)}" placeholder="Nom de la société"></div>
                            <div class="field"><label>Banque</label><input data-new-bank-name value="${escapeHtmlV041(guess.bankName)}" placeholder="Banque"></div>
                            <div class="field"><label>Nom du compte</label><input data-new-account-name value="${escapeHtmlV041(guess.accountName)}" placeholder="Compte courant, Tiers-Payant…"></div>
                            <div class="field"><label>N° compte détecté</label><input data-new-account-number value="${escapeHtmlV041(guess.accountNumber)}" placeholder="Numéro de compte"></div>
                            <button class="secondary-button" data-create-account-unresolved="${idx}">Créer et affecter</button>
                        </div>
                    </div>`; }).join('')}</div></section>` : ''}
                ${!gaps.length && !unresolved.length ? `<section class="treatment-ok-v041"><h3>Tout est traité</h3><p>Aucune action bloquante détectée sur cet import.</p></section>` : ''}
                <details class="treatment-details-v041"><summary>Voir le rapport détaillé</summary><pre>${escapeHtmlV041(JSON.stringify({ imported: imported.length, skipped, transactions, rules, gaps: gaps.map(r => r.filename), unresolved: unresolved.map(r => ({ filename: r.filename, message: r.message })) }, null, 2))}</pre></details>
            </div>
            <div class="treatment-actions-v041"><button data-open-bank>Ouvrir la banque</button><button class="secondary-button" data-close>Fermer</button></div>
        </div>`;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', focusCloseTreatmentModalV041));
    modal.querySelectorAll('[data-open-bank]').forEach(btn => btn.addEventListener('click', () => { focusCloseTreatmentModalV041(); showPage('bankPage'); }));

    const accounts = [];
    try {
        const companies = await window.api.getCompanies();
        for (const company of companies) {
            const accs = await window.api.getBankAccounts(company.id);
            accs.forEach(acc => accounts.push({ ...acc, company_name: company.name }));
        }
    } catch (error) { console.warn('Comptes indisponibles', error); }

    modal.querySelectorAll('.unresolved-account-select-v041').forEach(select => {
        accounts.forEach(acc => {
            const option = document.createElement('option');
            option.value = acc.id;
            option.textContent = `${acc.company_name} — ${acc.bank_name}${acc.account_name ? ' — ' + acc.account_name : ''}`;
            const createOption = select.querySelector('option[value="__create__"]');
            select.insertBefore(option, createOption || null);
        });
        select.addEventListener('change', () => {
            const row = select.closest('.unresolved-row-v041');
            const panel = row?.querySelector('.unresolved-create-account-v04114');
            if (panel) panel.hidden = select.value !== '__create__';
        });
    });

    modal.querySelectorAll('[data-create-account-unresolved]').forEach(button => {
        button.addEventListener('click', async () => {
            const idx = Number(button.dataset.createAccountUnresolved);
            const row = unresolved[idx];
            const container = button.closest('.unresolved-row-v041');
            const panel = container?.querySelector('.unresolved-create-account-v04114');
            if (!row?.filepath) { focusToastV041('Chemin du fichier indisponible pour ce relevé.', 'danger'); return; }
            button.disabled = true;
            button.textContent = 'Création…';
            try {
                const created = await focusCreateAccountForUnresolvedStatementV04114(row, panel);
                button.textContent = 'Import…';
                await window.api.addStatement({ bankAccountId: created.account.id, filename: row.filename, filepath: row.filepath });
                container.classList.remove('danger');
                container.classList.add('success');
                const select = container.querySelector('.unresolved-account-select-v041');
                if (select) {
                    const option = document.createElement('option');
                    option.value = created.account.id;
                    option.textContent = `${created.company.name} — ${created.account.bank_name || created.account.bankName || 'Banque'}${(created.account.account_name || created.account.accountName) ? ' — ' + (created.account.account_name || created.account.accountName) : ''}`;
                    select.insertBefore(option, select.querySelector('option[value="__create__"]') || null);
                    select.value = String(created.account.id);
                }
                if (panel) panel.hidden = true;
                button.textContent = 'Créé et affecté';
                focusToastV041('Société/compte créés, relevé importé.', 'success');
                if (typeof loadCompanies === 'function') await loadCompanies();
                if (typeof refreshAccountView === 'function' && selectedBankAccount) await refreshAccountView(false);
            } catch (error) {
                button.disabled = false;
                button.textContent = 'Créer et affecter';
                focusToastV041(error.message || 'Création impossible.', 'danger');
            }
        });
    });

    modal.querySelectorAll('[data-import-unresolved]').forEach(button => {
        button.addEventListener('click', async () => {
            const idx = Number(button.dataset.importUnresolved);
            const row = unresolved[idx];
            const container = button.closest('.unresolved-row-v041');
            const select = container?.querySelector('select');
            const bankAccountId = Number(select?.value || 0);
            if (!bankAccountId) { focusToastV041('Choisis un compte bancaire.', 'warning'); return; }
            if (!row?.filepath) { focusToastV041('Chemin du fichier indisponible pour ce relevé.', 'danger'); return; }
            button.disabled = true;
            button.textContent = 'Import…';
            try {
                await window.api.addStatement({ bankAccountId, filename: row.filename, filepath: row.filepath });
                container.classList.remove('danger');
                container.classList.add('success');
                button.textContent = 'Affecté';
                focusToastV041('Relevé affecté et importé.', 'success');
                if (typeof refreshAccountView === 'function' && selectedBankAccount) await refreshAccountView(false);
            } catch (error) {
                button.disabled = false;
                button.textContent = 'Affecter';
                focusToastV041(error.message || 'Import impossible.', 'danger');
            }
        });
    });
}

// Focus Compta V0.41.2 - modale de confirmation réutilisable sans confirm() natif
function showFocusConfirmModalV0412(title, message, okLabel = 'Confirmer', cancelLabel = 'Annuler') {
    return new Promise(resolve => {
        let modal = document.getElementById('focusConfirmModalV0412');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'focusConfirmModalV0412';
            modal.className = 'focus-modal-backdrop-v0412';
            modal.innerHTML = `
                <div class="focus-modal-card-v0412">
                    <h3 id="focusConfirmTitleV0412"></h3>
                    <p id="focusConfirmMessageV0412"></p>
                    <div class="focus-modal-actions-v0412">
                        <button type="button" class="btn-secondary" id="focusConfirmCancelV0412"></button>
                        <button type="button" class="btn-primary" id="focusConfirmOkV0412"></button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const titleEl = document.getElementById('focusConfirmTitleV0412');
        const messageEl = document.getElementById('focusConfirmMessageV0412');
        const ok = document.getElementById('focusConfirmOkV0412');
        const cancel = document.getElementById('focusConfirmCancelV0412');

        titleEl.textContent = title || 'Confirmation';
        messageEl.textContent = message || '';
        ok.textContent = okLabel || 'Confirmer';
        cancel.textContent = cancelLabel || 'Annuler';
        modal.style.display = 'flex';

        const cleanup = value => {
            modal.style.display = 'none';
            ok.onclick = null;
            cancel.onclick = null;
            modal.onclick = null;
            document.removeEventListener('keydown', onKeyDown);
            resolve(value);
        };
        const onKeyDown = event => {
            if (event.key === 'Escape') cleanup(false);
            if (event.key === 'Enter') cleanup(true);
        };

        ok.onclick = () => cleanup(true);
        cancel.onclick = () => cleanup(false);
        modal.onclick = event => {
            if (event.target === modal) cleanup(false);
        };
        document.addEventListener('keydown', onKeyDown);
        setTimeout(() => ok.focus(), 30);
    });
}
if (typeof window !== 'undefined') {
    window.showFocusConfirmModalV0412 = showFocusConfirmModalV0412;
}
