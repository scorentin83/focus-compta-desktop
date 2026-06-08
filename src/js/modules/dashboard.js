// Focus Compta V0.40 module
async function loadCompanyDashboardV038(companyId) {
    if (!companyId) return;

    const dashboard = await window.api.getCompanyDashboard(companyId);
    if (!dashboard) return;

    selectedCompany = dashboard.company;

    const summary = document.getElementById('dashboardAccountSummary');
    const panel = document.getElementById('dashboardPanel');
    if (summary) summary.style.display = 'grid';
    if (panel) panel.style.display = 'grid';

    document.getElementById('dashboardTitle').textContent = 'Tableau de bord';
    document.getElementById('dashboardSubtitle').textContent = `Vue consolidée de tous les comptes bancaires et feuilles de caisse.`;

    const totals = dashboard.totals || {};
    const cash = dashboard.cash || {};

    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    set('dashboardTreasuryTotal', formatAmount(dashboard?.treasury?.total ?? totals.balance ?? 0));
    set('dashboardTotalOps', totals.operations || 0);
    set('dashboardVerifiedOps', totals.verified || 0);
    set('dashboardMissingOps', totals.missing || 0);
    set('dashboardCreditTotal', formatAmount(totals.credit || 0));
    set('dashboardDebitTotal', formatAmount(Math.abs(totals.debit || 0)));
    set('dashboardCashCa', formatAmount(cash.totalInvoiced || 0));
    set('dashboardMissingAmount', formatAmount(totals.missingAmount || 0));
    set('dashboardMissingCount', `${totals.missing || 0} opération(s)`);
    await updateCompanyContextBar({ treasury: formatAmount(dashboard?.treasury?.total ?? totals.balance ?? 0), missingCount: totals.missing || 0 });

    const accountsList = document.getElementById('dashboardAccounts');
    if (accountsList) {
        accountsList.innerHTML = '';
        (dashboard.accounts || []).forEach(row => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${row.account.bank_name || ''} — ${row.account.account_name || ''}</span><strong>${formatAmount(row.balance || 0)}</strong>`;
            accountsList.appendChild(li);
        });
        if (!(dashboard.accounts || []).length) {
            const li = document.createElement('li');
            li.className = 'muted';
            li.textContent = 'Aucun compte bancaire.';
            accountsList.appendChild(li);
        }
    }

    const categoriesList = document.getElementById('dashboardCategories');
    if (categoriesList) {
        categoriesList.innerHTML = '';
        (dashboard.categories || []).forEach(row => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${row.name}</span><strong>${formatAmount(row.amount)}</strong>`;
            categoriesList.appendChild(li);
        });
        if (!(dashboard.categories || []).length) {
            const li = document.createElement('li');
            li.className = 'muted';
            li.textContent = 'Aucune catégorie.';
            categoriesList.appendChild(li);
        }
    }

    const suppliersList = document.getElementById('dashboardSuppliers');
    if (suppliersList) {
        suppliersList.innerHTML = '';
        (dashboard.suppliers || []).forEach(row => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${row.name}</span><strong>${formatAmount(row.amount)}</strong>`;
            suppliersList.appendChild(li);
        });
        if (!(dashboard.suppliers || []).length) {
            const li = document.createElement('li');
            li.className = 'muted';
            li.textContent = 'Aucun fournisseur.';
            suppliersList.appendChild(li);
        }
    }

    set('dashboardCashSheetsCount', cash.count || 0);
    set('dashboardCashPaymentMix', `Espèces ${formatAmount(cash.totalCash || 0)} · CB ${formatAmount(cash.totalCard || 0)} · Chèques ${formatAmount(cash.totalCheck || 0)} · Virements ${formatAmount(cash.totalTransfer || 0)}`);

    const cashMonths = document.getElementById('dashboardCashMonths');
    if (cashMonths) {
        cashMonths.innerHTML = '';
        (cash.byMonth || []).forEach(row => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${row.period}</span><strong>${formatAmount(row.invoiced_ca)}</strong>`;
            cashMonths.appendChild(li);
        });
        if (!(cash.byMonth || []).length) {
            const li = document.createElement('li');
            li.className = 'muted';
            li.textContent = 'Aucune feuille de caisse importée.';
            cashMonths.appendChild(li);
        }
    }
}

async function importCashSheetsV038() {
    if (!selectedCompany) {
        focusToastV041('Sélectionne d’abord une société.', 'warning');
        return;
    }

    const files = await window.api.selectCashSheets();
    if (!files || files.length === 0) return;

    let result;
    try {
        showProgressV0409('Import des feuilles de caisse', `${files.length} fichier(s) sélectionné(s). Analyse en cours…`);
        result = await window.api.importCashSheets({
            companyId: selectedCompany.id,
            files
        });
    } finally {
        hideProgressV0409();
    }

    let message = `${result.importedCount || 0} feuille(s) de caisse importée(s).`;
    if (result.replacedCount) message += `\n${result.replacedCount} mois remplacé(s).`;
    if (result.skippedCount) message += `\n${result.skippedCount} fichier(s) ignoré(s).`;
    if (result.errorCount) {
        message += `\n${result.errorCount} erreur(s) :\n` + (result.errors || []).map(e => `- ${e.filename}: ${e.message}`).join('\n');
    }
    if (result.imported && result.imported.length) {
        message += `\n\nCA détecté :\n` + result.imported.map(row => `- ${row.filename}: ${formatAmount(row.netCaTtc || row.invoicedCa || 0)}`).join('\n');
    }
    focusToastV041(message, 'warning');
    if (typeof renderSelectedCompanyDossierV050 === 'function') await renderSelectedCompanyDossierV050('cash');
    await loadCashSheetRemindersV039?.();
}

(function bindDashboardV038() {
    function bind() {
        const importButton = document.getElementById('importCashSheets');
        if (importButton && !importButton.dataset.boundV038) {
            importButton.dataset.boundV038 = '1';
            importButton.addEventListener('click', importCashSheetsV038);
        }

        // Le bouton tableau de bord affiche la société sélectionnée, pas seulement le compte.
        document.querySelectorAll('.nav-button[data-page="dashboardPage"], .nav-shortcut[data-page="dashboardPage"]').forEach(button => {
            if (button.dataset.boundDashboardV038) return;
            button.dataset.boundDashboardV038 = '1';
            button.addEventListener('click', async () => {
                if (selectedCompany) if (typeof renderSelectedCompanyDossierV050 === 'function') await renderSelectedCompanyDossierV050('cash');
            });
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();


// ===========================
// Focus Compta V0.39 - Feuilles de caisse mensuelles + rappels
// ===========================

function monthNameV039(month) {
    const months = {
        '01': 'janvier', '02': 'février', '03': 'mars', '04': 'avril',
        '05': 'mai', '06': 'juin', '07': 'juillet', '08': 'août',
        '09': 'septembre', '10': 'octobre', '11': 'novembre', '12': 'décembre'
    };
    return months[String(month).padStart(2, '0')] || month;
}

async function loadCashSheetRemindersV039() {
    const panel = document.getElementById('cashSheetReminderPanel');
    if (!panel || !window.api.getCashSheetReminders) return;

    const reminders = await window.api.getCashSheetReminders();
    const missing = (reminders || []).filter(item => item.missing);

    if (!missing.length) {
        panel.style.display = 'none';
        panel.innerHTML = '';
        return;
    }

    panel.style.display = 'block';
    panel.innerHTML = `
        <strong>📌 Feuille de caisse à intégrer</strong>
        <span>${missing.length} société(s) n'ont pas encore leur feuille de caisse de ${monthNameV039(missing[0].periodMonth)} ${missing[0].periodYear}.</span>
        <div>${missing.map(item => `<button data-company-id="${item.company.id}">${item.company.name}</button>`).join('')}</div>
    `;

    panel.querySelectorAll('button[data-company-id]').forEach(button => {
        button.addEventListener('click', async () => {
            const companies = await window.api.getCompanies();
            const company = companies.find(c => String(c.id) === String(button.dataset.companyId));
            if (!company) return;
            selectedCompany = company;
            if (typeof renderSelectedCompanyDossierV050 === 'function') await renderSelectedCompanyDossierV050('cash');
            showPage('companiesPage');
        });
    });
}

function renderCashTrendChartV039(months) {
    const container = document.getElementById('dashboardCaTrend');
    if (!container) return;

    if (!months || !months.length) {
        container.innerHTML = '<p class="muted">Importe les feuilles de caisse mensuelles pour afficher l’évolution.</p>';
        return;
    }

    const max = Math.max(...months.map(row => Number(row.net_ca_ttc || row.invoiced_ca || 0)), 1);
    container.innerHTML = months.map(row => {
        const value = Number(row.net_ca_ttc || row.invoiced_ca || 0);
        const height = Math.max(6, Math.round((value / max) * 120));
        const label = `${monthNameV039(row.month || '').slice(0, 3)} ${row.year || ''}`.trim();
        return `
            <div class="cash-chart-bar-wrap-v039" title="${label} — ${formatAmount(value)}">
                <div class="cash-chart-bar-v039" style="height:${height}px"></div>
                <small>${label}</small>
            </div>
        `;
    }).join('');
}

/* Ancien wrapper dashboard V0.39 supprimé : la version corrigée V0.39.1 est conservée plus bas. */


const originalLoadCompaniesV039 = typeof loadCompanies === 'function' ? loadCompanies : null;
loadCompanies = async function() {
    if (originalLoadCompaniesV039) await originalLoadCompaniesV039();
    await loadCashSheetRemindersV039();
};


// ===========================
// Focus Compta V0.39.1 - Correctif dashboard company undefined
// ===========================

loadCompanyDashboardV038 = async function(companyId) {
    if (!companyId) return;

    let dashboard = null;
    try {
        dashboard = await window.api.getCompanyDashboard(companyId);
    } catch (error) {
        console.error('getCompanyDashboard failed', error);
        focusToastV041(`Impossible de charger le tableau de bord société : ${error.message || error}`, 'warning');
        return;
    }

    if (!dashboard) {
        focusToastV041('Tableau de bord introuvable pour cette société.', 'warning');
        return;
    }

    const fallbackCompany = selectedCompany || { id: companyId, name: 'Société sélectionnée' };
    const company = dashboard.company || fallbackCompany;
    selectedCompany = company;

    const summary = document.getElementById('dashboardAccountSummary');
    const panel = document.getElementById('dashboardPanel');
    if (summary) summary.style.display = 'grid';
    if (panel) panel.style.display = 'grid';

    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    set('dashboardTitle', 'Tableau de bord');
    set('dashboardSubtitle', 'Vue consolidée de tous les comptes bancaires et feuilles de caisse.');

    const totals = dashboard.totals || {};
    const cash = dashboard.cash || {};

    set('dashboardTreasuryTotal', formatAmount(dashboard?.treasury?.total ?? totals.balance ?? 0));
    set('dashboardTotalOps', totals.operations || 0);
    set('dashboardVerifiedOps', totals.verified || 0);
    set('dashboardMissingOps', totals.missing || 0);
    set('dashboardCreditTotal', formatAmount(totals.credit || 0));
    set('dashboardDebitTotal', formatAmount(Math.abs(totals.debit || 0)));
    set('dashboardCashCa', formatAmount(cash.lastMonth?.net_ca_ttc || cash.totalNetTtc || cash.totalInvoiced || 0));
    set('dashboardMissingAmount', formatAmount(totals.missingAmount || 0));
    set('dashboardMissingCount', `${totals.missing || 0} opération(s)`);
    set('dashboardCashSheetsCount', cash.count || 0);
    set('dashboardCashPaymentMix', `CA net TTC ${formatAmount(cash.lastMonth?.net_ca_ttc || cash.totalNetTtc || 0)} · TP ${formatAmount(cash.totalTiersPayant || 0)} · Acomptes ${formatAmount(cash.totalAcomptes || 0)} · Écarts ${formatAmount(cash.totalEcarts || 0)}`);

    const accountsList = document.getElementById('dashboardAccounts');
    if (accountsList) {
        accountsList.innerHTML = '';
        (dashboard.accounts || []).forEach(row => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${row.account?.bank_name || ''} — ${row.account?.account_name || ''}</span><strong>${formatAmount(row.balance || 0)}</strong>`;
            accountsList.appendChild(li);
        });
        if (!(dashboard.accounts || []).length) {
            const li = document.createElement('li');
            li.className = 'muted';
            li.textContent = 'Aucun compte bancaire.';
            accountsList.appendChild(li);
        }
    }

    const categoriesList = document.getElementById('dashboardCategories');
    if (categoriesList) {
        categoriesList.innerHTML = '';
        (dashboard.categories || []).forEach(row => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${row.name}</span><strong>${formatAmount(row.amount)}</strong>`;
            categoriesList.appendChild(li);
        });
        if (!(dashboard.categories || []).length) {
            const li = document.createElement('li');
            li.className = 'muted';
            li.textContent = 'Aucune catégorie.';
            categoriesList.appendChild(li);
        }
    }

    const suppliersList = document.getElementById('dashboardSuppliers');
    if (suppliersList) {
        suppliersList.innerHTML = '';
        (dashboard.suppliers || []).forEach(row => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${row.name}</span><strong>${formatAmount(row.amount)}</strong>`;
            suppliersList.appendChild(li);
        });
        if (!(dashboard.suppliers || []).length) {
            const li = document.createElement('li');
            li.className = 'muted';
            li.textContent = 'Aucun fournisseur.';
            suppliersList.appendChild(li);
        }
    }

    const cashMonths = document.getElementById('dashboardCashMonths');
    if (cashMonths) {
        cashMonths.innerHTML = '';
        (cash.byMonth || []).slice().reverse().slice(0, 6).forEach(row => {
            const remise = row.gross_ca_ht ? (row.discount_ht / row.gross_ca_ht) * 100 : 0;
            const li = document.createElement('li');
            li.innerHTML = `<span>${monthNameV039(row.month)} ${row.year}</span><strong>${formatAmount(row.net_ca_ttc || row.invoiced_ca || 0)}</strong><small>Remise ${remise.toFixed(1)} % · Écarts ${formatAmount(row.ecarts || 0)}</small>`;
            cashMonths.appendChild(li);
        });
        if (!(cash.byMonth || []).length) {
            const li = document.createElement('li');
            li.className = 'muted';
            li.textContent = 'Aucune feuille de caisse importée.';
            cashMonths.appendChild(li);
        }
    }

    if (typeof renderCashTrendChartV039 === 'function') {
        renderCashTrendChartV039(cash.byMonth || []);
    }
};


// ===========================

// ===========================
// Focus Compta V0.45 - Dashboard comptable intelligent
// ===========================
async function loadAccountingSupervisionV045(companyId) {
    if (!companyId || !window.api.getReconciliationDashboard) return;
    const data = await window.api.getReconciliationDashboard(companyId);
    const alerts = data?.alerts || {};
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };

    set('dashboardInvoicesDueV045', formatAmount(alerts?.unpaidInvoices?.total || 0));
    set('dashboardVatDeductibleV045', formatAmount(alerts?.vat?.deductible || 0));

    const grid = document.getElementById('dashboardAccountingAlertsV045');
    if (grid) {
        const cards = [
            ['Factures à payer', alerts?.unpaidInvoices?.count || 0, formatAmount(alerts?.unpaidInvoices?.total || 0), 'warning'],
            ['Factures échues', alerts?.overdueInvoices?.count || 0, formatAmount(alerts?.overdueInvoices?.total || 0), 'danger'],
            ['Documents non rapprochés', alerts?.unmatchedDocuments || 0, 'à traiter', 'warning'],
            ['Opérations sans justificatif', alerts?.missingReceipts?.count || 0, formatAmount(alerts?.missingReceipts?.total || 0), 'danger'],
            ['TVA déductible détectée', 'TVA', formatAmount(alerts?.vat?.deductible || 0), 'success'],
            ['Tiers-payant encaissé', alerts?.thirdPartyReceived?.count || 0, formatAmount(alerts?.thirdPartyReceived?.total || 0), 'success']
        ];
        grid.innerHTML = cards.map(([title, value, subtitle, tone]) => `
            <button class="accounting-alert-card-v045 ${tone}" type="button" data-page="${title.includes('Document') || title.includes('Facture') ? 'matchingPage' : 'bankPage'}">
                <span>${title}</span>
                <strong>${value}</strong>
                <small>${subtitle}</small>
            </button>
        `).join('');
        grid.querySelectorAll('[data-page]').forEach(button => {
            button.addEventListener('click', () => showPage(button.dataset.page));
        });
    }

    const nextDue = document.getElementById('dashboardNextDueV045');
    if (nextDue) {
        const rows = data?.nextDue || [];
        nextDue.innerHTML = rows.length ? rows.map(row => `
            <li><span>${row.due_date || 'Sans échéance'} · ${row.detected_supplier || row.filename}</span><strong>${formatAmount(row.amount || 0)}</strong></li>
        `).join('') : '<li class="muted">Aucune facture fournisseur à payer détectée.</li>';
    }
}

const loadCompanyDashboardV038OriginalV045 = loadCompanyDashboardV038;
loadCompanyDashboardV038 = async function(companyId) {
    await loadCompanyDashboardV038OriginalV045(companyId);
    await loadAccountingSupervisionV045(companyId);
};

async function runAutoReconcileFromDashboardV045() {
    if (!selectedCompany || !window.api.autoReconcileDocuments) {
        focusToastV041('Sélectionne une société.', 'warning');
        return;
    }
    showProgressV0409?.('Rapprochement automatique', 'Analyse des factures et opérations bancaires...');
    try {
        const result = await window.api.autoReconcileDocuments({ companyId: selectedCompany.id, threshold: 95, limit: 300 });
        focusToastV041(`${result.linked || 0} document(s) rapproché(s) automatiquement sur ${result.scanned || 0}.`, result.linked ? 'success' : 'info');
        if (typeof renderSelectedCompanyDossierV050 === 'function') await renderSelectedCompanyDossierV050('cash');
        if (typeof loadMatchingPage === 'function') await loadMatchingPage();
        if (typeof loadDocuments === 'function') await loadDocuments();
    } finally {
        hideProgressV0409?.();
    }
}

(function bindDashboardV045() {
    function bind() {
        const button = document.getElementById('dashboardAutoReconcileV045');
        if (button && !button.dataset.boundV045) {
            button.dataset.boundV045 = '1';
            button.addEventListener('click', runAutoReconcileFromDashboardV045);
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();


// Focus Compta V0.46 - Dashboard expert dirigeant
(function initExecutiveDashboardV046() {
    function moneyV046(value) {
        return Number(value || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    }
    function escapeV046(value) {
        return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
    }
    function currentYearV046() { return String(new Date().getFullYear()); }
    function getCompanyIdV046() {
        return window.selectedCompany?.id || (typeof selectedCompany !== 'undefined' && selectedCompany ? selectedCompany.id : null);
    }
    function renderExecutiveDashboardV046(data) {
        const root = document.getElementById('executiveDashboardV046');
        if (!root) return;
        const docs = data.documents || {};
        const vat = data.vat || {};
        const payments = data.payments || {};
        const bank = data.bank || {};
        const exports = data.exports || {};
        const statements = data.statements || {};
        const tp = data.thirdPartyPayments || {};
        const alerts = data.alerts || [];

        root.innerHTML = `
            <div class="executive-dashboard-header-v046">
                <div>
                    <h2>Dashboard expert ${escapeV046(data.year || '')}</h2>
                    <p class="muted">Pilotage société : trésorerie, TVA, documents, exports comptables et automatisation.</p>
                </div>
                <label class="inline-field-v046">Année
                    <input id="executiveDashboardYearV046" type="number" min="2020" max="2100" value="${escapeV046(data.year || currentYearV046())}">
                </label>
            </div>

            <div class="executive-kpi-grid-v046">
                <article class="executive-kpi-v046 treasury"><span>Trésorerie</span><strong>${moneyV046(data.treasury)}</strong><small>Derniers nouveaux soldes par compte</small></article>
                <article class="executive-kpi-v046"><span>Documents comptables</span><strong>${docs.accounting_docs || 0}</strong><small>${docs.not_transmitted || 0} non transmis</small></article>
                <article class="executive-kpi-v046 warning"><span>Factures à payer</span><strong>${moneyV046(payments.unpaidTtc)}</strong><small>${payments.unpaidCount || 0} document(s)</small></article>
                <article class="executive-kpi-v046 danger"><span>Factures échues</span><strong>${payments.overdueCount || 0}</strong><small>À contrôler avant TVA</small></article>
                <article class="executive-kpi-v046"><span>TVA détectée</span><strong>${moneyV046(vat.deductible)}</strong><small>Déductible documents fournisseurs</small></article>
                <article class="executive-kpi-v046"><span>Total TTC docs</span><strong>${moneyV046(vat.ttc)}</strong><small>Année comptable ${escapeV046(data.year)}</small></article>
                <article class="executive-kpi-v046 success"><span>Taux automatisation</span><strong>${bank.automationRate || 0}%</strong><small>${bank.categorized || 0}/${bank.operations || 0} opérations catégorisées</small></article>
                <article class="executive-kpi-v046"><span>Tiers-payant reçu</span><strong>${moneyV046(tp.received)}</strong><small>${tp.operations || 0} opération(s)</small></article>
            </div>

            <div class="executive-grid-v046">
                <section class="panel clean-panel">
                    <h3>À traiter</h3>
                    ${alerts.length ? `<ul class="alert-list-v046">${alerts.map(a => `<li class="${escapeV046(a.level || 'warning')}">${escapeV046(a.label)}</li>`).join('')}</ul>` : '<p class="success-text">Aucune alerte critique détectée.</p>'}
                    <div class="button-row">
                        <button class="nav-shortcut secondary-button" data-page="exportsPage" type="button">Créer export comptable</button>
                        <button class="nav-shortcut secondary-button" data-page="receiptsPage" type="button">Voir documents</button>
                    </div>
                </section>
                <section class="panel clean-panel">
                    <h3>Transmission comptable</h3>
                    <table class="compact-table-v0456">
                        <tbody>
                            <tr><td>Documents non transmis</td><td><strong>${docs.not_transmitted || 0}</strong></td></tr>
                            <tr><td>Relevés non transmis</td><td><strong>${statements.not_transmitted || 0}</strong></td></tr>
                            <tr><td>Lots transmission</td><td><strong>${exports.transmission_lots || 0}</strong></td></tr>
                            <tr><td>Archives générées</td><td><strong>${exports.archive_lots || 0}</strong></td></tr>
                        </tbody>
                    </table>
                </section>
                <section class="panel clean-panel">
                    <h3>Banque</h3>
                    <table class="compact-table-v0456">
                        <tbody>
                            <tr><td>Opérations</td><td><strong>${bank.operations || 0}</strong></td></tr>
                            <tr><td>Encaissements</td><td><strong>${moneyV046(bank.credits)}</strong></td></tr>
                            <tr><td>Décaissements</td><td><strong>${moneyV046(bank.debits)}</strong></td></tr>
                            <tr><td>Justificatifs/statuts manquants</td><td><strong>${bank.missing || 0}</strong></td></tr>
                        </tbody>
                    </table>
                </section>
                <section class="panel clean-panel">
                    <h3>Comptes bancaires</h3>
                    ${data.accounts?.length ? `<table class="compact-table-v0456"><thead><tr><th>Compte</th><th>Nouveau solde</th></tr></thead><tbody>${data.accounts.map(acc => `<tr><td>${escapeV046([acc.bank_name, acc.account_name].filter(Boolean).join(' — '))}</td><td>${moneyV046(acc.new_balance)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun compte bancaire.</p>'}
                </section>
            </div>
        `;

        document.getElementById('executiveDashboardYearV046')?.addEventListener('change', () => loadExecutiveDashboardV046());
        root.querySelectorAll('.nav-shortcut').forEach(button => {
            button.addEventListener('click', () => {
                if (typeof showPage === 'function') showPage(button.dataset.page);
            });
        });
    }

    window.loadExecutiveDashboardV046 = async function() {
        const companyId = getCompanyIdV046();
        const root = document.getElementById('executiveDashboardV046');
        if (!root) return;
        if (!companyId) {
            root.innerHTML = '<p class="muted">Sélectionne une société pour afficher le dashboard expert.</p>';
            return;
        }
        const year = document.getElementById('executiveDashboardYearV046')?.value || currentYearV046();
        try {
            const data = await window.api.getExecutiveDashboardV046({ companyId, year });
            renderExecutiveDashboardV046(data);
        } catch (error) {
            root.innerHTML = `<p class="error-text">Dashboard expert indisponible : ${escapeV046(error.message || error)}</p>`;
        }
    };

    const originalLoad = window.loadCompanyDashboardV038 || (typeof loadCompanyDashboardV038 === 'function' ? loadCompanyDashboardV038 : null);
    if (originalLoad && !window.__dashboardV046Wrapped) {
        window.__dashboardV046Wrapped = true;
        window.loadCompanyDashboardV038 = async function(companyId) {
            await originalLoad(companyId);
            await window.loadExecutiveDashboardV046?.();
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(() => window.loadExecutiveDashboardV046?.(), 250), { once: true });
    } else {
        setTimeout(() => window.loadExecutiveDashboardV046?.(), 250);
    }
})();
