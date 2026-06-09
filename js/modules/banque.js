// Focus Compta V0.40 module

// Focus Compta V0.61.3 — Surbrillance des opérations dont le rapprochement reste obligatoire
function transactionNeedsMandatoryReconciliationV0612(transaction = {}) {
    const status = String(transaction.status || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const category = String(transaction.category || '').trim();
    const amount = Number(transaction.amount || 0);

    // On évite de signaler les lignes déjà vérifiées/rapprochées/validées.
    const isDone = /(verifie|verified|rapproche|matched|valide|validated)/.test(status);
    if (isDone) return false;

    // Les lignes sans catégorie ou marquées explicitement à vérifier doivent ressortir.
    if (!category) return true;
    if (/(a verifier|to check|pending|a rapprocher|unmatched)/.test(status)) return true;

    // Les montants bancaires liés au contrôle caisse doivent être rapprochés au mois.
    const normalizedCategory = category.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const requiresCashControl = /(remises?\s*cb|remises?\s*amex|remises?\s*es|remises?\s*ch|remises?\s*cofidis|tiers-payant)/.test(normalizedCategory);
    return amount > 0 && requiresCashControl && !isDone;
}


function focusStatementDisplayNameV04110(transaction = {}) {
    const monthNames = {
        '01': 'Janvier', '02': 'Février', '03': 'Mars', '04': 'Avril',
        '05': 'Mai', '06': 'Juin', '07': 'Juillet', '08': 'Août',
        '09': 'Septembre', '10': 'Octobre', '11': 'Novembre', '12': 'Décembre'
    };

    const month = String(transaction.statement_month || '').padStart(2, '0');
    if (monthNames[month]) return `Relevé ${monthNames[month]}`;

    const filename = String(transaction.statement_filename || transaction.pdf_source || '');
    const dateMatch = filename.match(/(\d{2})[-_.](\d{2})[-_.](\d{4})/);
    if (dateMatch && monthNames[dateMatch[2]]) return `Relevé ${monthNames[dateMatch[2]]}`;

    return filename ? 'Relevé bancaire' : '—';
}

function focusStatementTitleV04110(transaction = {}) {
    return transaction.statement_filename || transaction.pdf_source || 'Relevé source';
}

let statementCacheV0409 = [];
let selectedStatementBulkIdsV0409 = new Set();
async function loadCategoryOptions() {
    categoryRules = await window.api.getCategoryRules();
    const targets = ['detailCategory', 'bulkCategory'];
    targets.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        focusPopulateCategorySelectV0405(select, id === 'bulkCategory' ? 'Catégorie...' : 'Non catégorisé');
    });
    focusPopulateStatusSelectV0405(document.getElementById('statusFilter'), { all: true });
    focusPopulateStatusSelectV0405(document.getElementById('bulkStatus'), { empty: 'Statut...' });
    focusPopulateStatusSelectV0405(document.getElementById('detailStatus'));

    const rulesList = document.getElementById('categoryRulesList');
    if (rulesList) {
        rulesList.innerHTML = '';
        categoryRules.forEach(rule => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${rule.keyword}</span><strong>${rule.category}</strong>`;
            rulesList.appendChild(li);
        });
    }
}

function updateBulkToolbar() {
    const toolbar = document.getElementById('bulkToolbar');
    const count = document.getElementById('bulkCount');
    const all = document.getElementById('selectAllTransactions');
    const rowChecks = [...document.querySelectorAll('.transaction-check')];

    if (!toolbar || !count) return;

    count.textContent = selectedTransactionIds.size;
    toolbar.style.display = selectedTransactionIds.size > 0 ? 'flex' : 'none';

    if (all) {
        all.checked = rowChecks.length > 0 && rowChecks.every(check => check.checked);
        all.indeterminate = selectedTransactionIds.size > 0 && !all.checked;
    }
}

function maskIban(iban) {
    const value = String(iban || '').replace(/\s+/g, '');
    if (!value) return '';
    if (value.length <= 8) return value;
    return `${value.slice(0, 4)} **** **** ${value.slice(-4)}`;
}

function bankAccountTitle(account) {
    return [account.bank_name, account.account_name].filter(Boolean).join(' — ') || 'Compte bancaire';
}

function showBankAccountEdit(account) {
    selectedBankAccount = account;
    selectedRibFilepath = null;

    { const el = document.getElementById('bankAccountForm'); if (el) el.style.display = 'none'; }
    document.getElementById('bankAccountEdit').style.display = 'block';
    document.getElementById('editBankName').value = account.bank_name || '';
    document.getElementById('editAccountName').value = account.account_name || '';
    document.getElementById('editAccountNumber').value = account.account_number || '';
    document.getElementById('editIban').value = account.iban || '';
    document.getElementById('editBic').value = account.bic || '';
    document.getElementById('editBankNotes').value = account.notes || '';
    document.getElementById('editRibLabel').textContent = account.rib_path ? 'RIB enregistré.' : 'Aucun RIB enregistré.';
}

async function selectBankAccount(account) {
    selectedBankAccount = account;
    selectedStatementId = 'all';

    const title = bankAccountTitle(account);
    document.getElementById('selectedAccountTitle').textContent = title;
    const dashboardTitle = document.getElementById('dashboardTitle');
    const dashboardSubtitle = document.getElementById('dashboardSubtitle');
    if (dashboardTitle) dashboardTitle.textContent = 'Tableau de bord';
    if (dashboardSubtitle) dashboardSubtitle.textContent = `${title}`;
    updateCompanyContextBar();

    const statementSection = document.getElementById('statementSection');
    if (statementSection) statementSection.style.display = 'block';
    const smartReceiptButton = document.getElementById('smartReceipt');
    if (smartReceiptButton) smartReceiptButton.style.display = 'inline-flex';
    { const el = document.getElementById('summaryCards'); if (el) el.style.display = 'grid'; }
    { const el = document.getElementById('toolsPanel'); if (el) el.style.display = 'grid'; }
    { const el = document.getElementById('dashboardPanel'); if (el) el.style.display = 'grid'; }
    { const el = document.getElementById('transactionTable'); if (el) el.style.display = 'table'; }
    { const el = document.getElementById('statementSidebar'); if (el) el.style.display = 'block'; }

    { const el = document.getElementById('bankAccountEdit'); if (el) el.style.display = 'none'; }
    { const el = document.getElementById('bankAccountForm'); if (el) el.style.display = 'none'; }
    resetTransactionDetail();
    await refreshAccountView(true);
}

function getFilters() {
    return {
        search: document.getElementById('searchInput')?.value.trim() || '',
        year: document.getElementById('yearFilter')?.value || 'all',
        month: document.getElementById('monthFilter')?.value || 'all',
        status: document.getElementById('statusFilter')?.value || 'all',
        statementId: selectedStatementId || 'all'
    };
}

const BANK_SORT_STORAGE_KEY_V0415 = 'focusBankSortV0415';
let bankSortStateV0415 = { field: 'date', direction: 'desc' };

function getBankSortOptionsV0414() {
    try {
        const stored = JSON.parse(localStorage.getItem(BANK_SORT_STORAGE_KEY_V0415) || 'null');
        if (stored && stored.field) bankSortStateV0415 = stored;
    } catch (_) {}
    return bankSortStateV0415;
}

function setBankSortOptionsV0415(field) {
    if (bankSortStateV0415.field === field) {
        bankSortStateV0415.direction = bankSortStateV0415.direction === 'asc' ? 'desc' : 'asc';
    } else {
        bankSortStateV0415 = { field, direction: field === 'date' ? 'desc' : 'asc' };
    }
    try { localStorage.setItem(BANK_SORT_STORAGE_KEY_V0415, JSON.stringify(bankSortStateV0415)); } catch (_) {}
    updateBankSortHeaderV0415();
}

function resetBankSortOptionsV0415() {
    bankSortStateV0415 = { field: 'date', direction: 'desc' };
    try { localStorage.setItem(BANK_SORT_STORAGE_KEY_V0415, JSON.stringify(bankSortStateV0415)); } catch (_) {}
    updateBankSortHeaderV0415();
}

function updateBankSortHeaderV0415() {
    const { field, direction } = getBankSortOptionsV0414();
    document.querySelectorAll('[data-bank-sort]').forEach(button => {
        const active = button.dataset.bankSort === field;
        button.classList.toggle('active', active);
        const arrow = button.querySelector('.sort-arrow');
        if (arrow) arrow.textContent = active ? (direction === 'asc' ? '↑' : '↓') : '↕';
        button.setAttribute('aria-sort', active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
    });
}

function normalizeSortTextV0414(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function parseBankDateSortValueV0415(value) {
    const text = String(value || '').trim();
    if (!text) return 0;

    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();

    const french = text.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
    if (french) {
        const day = Number(french[1]);
        const month = Number(french[2]);
        let year = french[3] ? Number(french[3]) : Number(document.getElementById('yearFilter')?.value || new Date().getFullYear());
        if (year < 100) year += 2000;
        return new Date(year, month - 1, day).getTime();
    }

    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function getTransactionSortValueV0414(transaction, field) {
    if (field === 'date') return parseBankDateSortValueV0415(transaction.date_operation || transaction.date || '');
    if (field === 'amount') return Number(transaction.amount || 0);
    if (field === 'label') return normalizeSortTextV0414(transaction.label || '');
    if (field === 'category') return normalizeSortTextV0414(transaction.category || 'Non catégorisé');
    if (field === 'status') return normalizeSortTextV0414(getStatusLabel(transaction.status));
    return String(transaction.date_operation || '');
}

function sortTransactionsV0414(transactions) {
    const { field, direction } = getBankSortOptionsV0414();
    const multiplier = direction === 'asc' ? 1 : -1;

    return [...transactions].sort((a, b) => {
        const valueA = getTransactionSortValueV0414(a, field);
        const valueB = getTransactionSortValueV0414(b, field);

        if (typeof valueA === 'number' || typeof valueB === 'number') {
            return ((Number(valueA) || 0) - (Number(valueB) || 0)) * multiplier;
        }

        return String(valueA).localeCompare(String(valueB), 'fr', { numeric: true, sensitivity: 'base' }) * multiplier;
    });
}

function resetTransactionDetail() {
    selectedTransaction = null;
    document.getElementById('transactionDetailEmpty').style.display = 'block';
    document.getElementById('transactionDetail').style.display = 'none';
    document.getElementById('receiptPreview').textContent = 'Aucun aperçu sélectionné.';
    document.getElementById('receiptPreview').className = 'receipt-preview muted';
}


function makeAddCompanyCardV0842() {
    const card = document.createElement('article');
    card.className = 'company-add-card-v0842';
    card.innerHTML = `
        <div>
            <h3>Ajouter une société</h3>
            <p>Créez une nouvelle structure suivie dans Focus Compta.</p>
        </div>
        <div>
            <input id="companyNameV0842" type="text" placeholder="Nom de la société">
        </div>
        <button id="newCompanyV0842" type="button" class="primary-button">Ajouter</button>
    `;
    const input = card.querySelector('#companyNameV0842');
    const button = card.querySelector('#newCompanyV0842');
    const submit = async () => {
        const name = input.value.trim();
        if (!name) return;
        await window.api.addCompany(name);
        input.value = '';
        await loadCompanies();
        if (typeof window.renderHomeConsolidatedV084 === 'function') await window.renderHomeConsolidatedV084();
    };
    button.addEventListener('click', submit);
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') submit();
    });
    return card;
}

async function loadCompanies() {
    const companies = await window.api.getCompanies();
    const companyList = document.getElementById('companyList');
    const homeCompanyCards = document.getElementById('homeCompanyCards');

    companyList.innerHTML = '';
    companyList.appendChild(makeAddCompanyCardV0842());
    if (homeCompanyCards) homeCompanyCards.innerHTML = '';

    if (companies.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'Aucune société créée pour le moment.';
        if (homeCompanyCards) homeCompanyCards.appendChild(empty);
        await loadHomeInsights(companies);
        return;
    }

    for (const company of companies) {
        let operationsCount = 0;
        let missingCount = 0;
        let missingAmount = 0;
        let accountsCount = 0;

        try {
            const accounts = await window.api.getBankAccounts(company.id);
            accountsCount = accounts.length;

            for (const account of accounts) {
                const summary = await window.api.getTransactionSummary({ bankAccountId: account.id, filters: {} });
                const insights = await window.api.getDashboardInsights({ bankAccountId: account.id, filters: {} });
                operationsCount += Number(summary.total || 0);
                missingCount += Number(summary.missing || 0);
                missingAmount += Math.abs(Number(insights.missing?.total || 0));
            }
        } catch (error) {
            console.warn('Impossible de calculer les métriques société', company.name, error);
        }

        const details = `
            <span>${accountsCount} compte(s)</span>
            <strong>${missingCount} PJ manquante(s)</strong>
            <span>${formatAmount(missingAmount)}</span>
        `;

        const subtitle = `${operationsCount} opération(s) suivie(s)`;

        companyList.appendChild(makeCompanyCard(company, { subtitle, details }));
        if (homeCompanyCards) homeCompanyCards.appendChild(makeCompanyCard(company, { subtitle, details }));
    }

    await loadHomeInsights(companies);
}

async function loadBankAccounts() {
    if (!selectedCompany) return;

    const accounts = await window.api.getBankAccounts(selectedCompany.id);
    const list = document.getElementById('bankAccountList');
    list.innerHTML = '';

    if (accounts.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state compact-empty';
        empty.textContent = 'Aucun compte bancaire. Ajoute un compte pour importer les relevés.';
        list.appendChild(empty);
        document.getElementById('bankAccountForm').style.display = 'block';
        return;
    }

    accounts.forEach(account => {
        const card = document.createElement('article');
        card.className = 'bank-account-card';
        if (selectedBankAccount && selectedBankAccount.id === account.id) {
            card.classList.add('selected');
        }

        const ibanMasked = maskIban(account.iban);
        const accountNumber = account.account_number ? `<span>Compte : ${account.account_number}</span>` : '';
        const bic = account.bic ? `<span>BIC : ${account.bic}</span>` : '';
        const rib = account.rib_path ? '<span class="rib-pill">RIB PDF</span>' : '<span class="muted">RIB manquant</span>';

        card.innerHTML = `
            <div class="bank-card-main">
                <strong>${bankAccountTitle(account)}</strong>
                <span>${ibanMasked || 'IBAN non renseigné'}</span>
                ${accountNumber}
                ${bic}
            </div>
            <div class="bank-card-actions">
                ${rib}
                <button class="secondary-button small-button" type="button">Modifier</button>
            </div>
        `;

        card.addEventListener('click', async event => {
            if (event.target.tagName === 'BUTTON') {
                showBankAccountEdit(account);
                return;
            }
            await selectBankAccount(account);
        });

        card.querySelector('button').addEventListener('click', event => {
            event.stopPropagation();
            showBankAccountEdit(account);
        });

        list.appendChild(card);
    });
}


async function renderBankAutomationSuggestionsV072() {
    if (!selectedBankAccount || !window.api.getBankAutomationSuggestionsV072) return;
    const table = document.getElementById('transactionTable');
    if (!table) return;
    let box = document.getElementById('bankAutomationSuggestionsV072');
    if (!box) {
        box = document.createElement('div');
        box.id = 'bankAutomationSuggestionsV072';
        box.className = 'automation-suggestions-v072';
        table.parentElement?.insertBefore(box, table);
    }
    const suggestions = await window.api.getBankAutomationSuggestionsV072({
        companyId: selectedCompany ? selectedCompany.id : null,
        bankAccountId: selectedBankAccount.id
    });
    if (!suggestions || !suggestions.length) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
    }
    box.style.display = 'flex';
    const preview = suggestions.slice(0, 4).map(s => `${escapeHtmlV043(s.keyword || '')} → <strong>${escapeHtmlV043(s.suggestedCategory || '')}</strong>`).join(' · ');
    box.innerHTML = `
        <div>
            <strong>🧠 ${suggestions.length} suggestion(s) d'automatisation détectée(s)</strong>
            <span>${preview}${suggestions.length > 4 ? '…' : ''}</span>
        </div>
        <button type="button" id="applyBankSuggestionsV072">Valider toutes</button>
    `;
    const apply = document.getElementById('applyBankSuggestionsV072');
    if (apply) {
        apply.addEventListener('click', async () => {
            apply.disabled = true;
            const result = await window.api.applyBankAutomationSuggestionsV072({
                companyId: selectedCompany ? selectedCompany.id : null,
                bankAccountId: selectedBankAccount.id
            });
            if (window.showToast) window.showToast(`${result.changed || 0} opération(s) automatisée(s).`, 'success');
            await refreshAccountView(false);
        });
    }
}

function getTransactionSuggestionV072(transaction, suggestions = []) {
    return suggestions.find(s => Number(s.transactionId) === Number(transaction.id));
}

async function refreshAccountView(refreshPeriods = false) {
    if (refreshPeriods) {
        await loadAvailablePeriods();
    }

    await loadStatements();
    await loadSummary();
    await loadDashboard();
    await loadTransactions();
    await renderBankAutomationSuggestionsV072();
    await updateCompanyContextBar();
}

async function loadAvailablePeriods() {
    if (!selectedBankAccount) return;

    const periods = await window.api.getAvailablePeriods(selectedBankAccount.id);
    const yearFilter = document.getElementById('yearFilter');
    const monthFilter = document.getElementById('monthFilter');

    const selectedYear = yearFilter.value || 'all';
    const selectedMonth = monthFilter.value || 'all';

    const years = [...new Set(periods.map(period => String(period.year || '')).filter(Boolean))];
    const months = [...new Set(periods.map(period => String(period.month || '')).filter(Boolean))].sort();

    yearFilter.innerHTML = '<option value="all">Toutes</option>';
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    });

    monthFilter.innerHTML = '<option value="all">Tous</option>';
    months.forEach(month => {
        const option = document.createElement('option');
        option.value = month;
        option.textContent = MONTH_LABELS[month] || month;
        monthFilter.appendChild(option);
    });

    yearFilter.value = years.includes(selectedYear) ? selectedYear : 'all';
    monthFilter.value = months.includes(selectedMonth) ? selectedMonth : 'all';
}

function groupStatementsByPeriod(statements) {
    const groups = {};

    statements.forEach(statement => {
        const year = statement.statement_year || 'Sans année';
        const month = statement.statement_month || 'Sans mois';
        const key = `${year}-${month}`;

        if (!groups[key]) {
            groups[key] = {
                year,
                month,
                label: statement.statement_year && statement.statement_month
                    ? `${MONTH_LABELS[statement.statement_month] || statement.statement_month} ${statement.statement_year}`
                    : 'Période inconnue',
                statements: []
            };
        }

        groups[key].statements.push(statement);
    });

    return Object.values(groups);
}



function focusStatementLabelV041(statement) {
    const month = statement.statement_month ? (MONTH_LABELS[statement.statement_month] || statement.statement_month) : '';
    const year = statement.statement_year || '';
    const period = [month, year].filter(Boolean).join(' ');
    if (period) return period;
    return String(statement.filename || 'Relevé').replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').slice(0, 42);
}

function focusStatementAccountHintV041(statement) {
    const name = String(statement.filename || '').replace(/\.pdf$/i, '');
    const match = name.match(/(CCOU|CAPI)[-_ ]?([0-9]+)/i);
    return match ? `${match[1].toUpperCase()} ${match[2]}` : 'Relevé PDF';
}

function renderStatementBulkToolsV0409(statements) {
    statementCacheV0409 = Array.isArray(statements) ? statements : [];
    const wrapper = document.getElementById('statementBulkToolsV0409');
    const list = document.getElementById('statementBulkListV0409');
    const selectAll = document.getElementById('selectAllStatementsV0409');
    const deleteButton = document.getElementById('deleteSelectedStatementsV0409');
    if (!wrapper || !list || !selectAll || !deleteButton) return;

    selectedStatementBulkIdsV0409 = new Set([...selectedStatementBulkIdsV0409].filter(id =>
        statementCacheV0409.some(statement => Number(statement.id) === Number(id))
    ));

    wrapper.style.display = statementCacheV0409.length > 1 ? 'block' : 'none';
    list.innerHTML = '';

    statementCacheV0409.forEach(statement => {
        const row = document.createElement('label');
        const hasGap = typeof statementHasControlGap === 'function' && statementHasControlGap(statement);
        row.className = `statement-card-v041 ${hasGap ? 'has-gap' : ''}`;
        row.title = statement.filename || 'Relevé';
        row.innerHTML = `
            <input type="checkbox" value="${statement.id}">
            <span class="statement-card-body-v041">
                <strong>${focusStatementLabelV041(statement)}</strong>
                <small>${focusStatementAccountHintV041(statement)}</small>
                <em>${statement.transactions_count || 0} op. · ${statement.receipts_count || 0} justificatif(s)${hasGap ? ' · écart' : ''}</em>
            </span>
        `;
        row.addEventListener('dblclick', () => {
            selectedStatementId = String(statement.id);
            const select = document.getElementById('statementSelect');
            if (select) select.value = selectedStatementId;
            updateStatementMeta();
            loadTransactions();
        });
        const checkbox = row.querySelector('input');
        checkbox.checked = selectedStatementBulkIdsV0409.has(Number(statement.id));
        checkbox.addEventListener('change', () => {
            const id = Number(checkbox.value);
            if (checkbox.checked) selectedStatementBulkIdsV0409.add(id);
            else selectedStatementBulkIdsV0409.delete(id);
            updateStatementBulkActionsV0409();
        });
        list.appendChild(row);
    });

    selectAll.checked = statementCacheV0409.length > 0 && selectedStatementBulkIdsV0409.size === statementCacheV0409.length;
    updateStatementBulkActionsV0409();
}

function updateStatementBulkActionsV0409() {
    const deleteButton = document.getElementById('deleteSelectedStatementsV0409');
    const selectAll = document.getElementById('selectAllStatementsV0409');
    if (deleteButton) {
        const count = selectedStatementBulkIdsV0409.size;
        deleteButton.disabled = count === 0;
        deleteButton.textContent = count > 0 ? `Supprimer ${count} relevé(s)` : 'Supprimer la sélection';
    }
    if (selectAll) {
        selectAll.checked = statementCacheV0409.length > 0 && selectedStatementBulkIdsV0409.size === statementCacheV0409.length;
        selectAll.indeterminate = selectedStatementBulkIdsV0409.size > 0 && selectedStatementBulkIdsV0409.size < statementCacheV0409.length;
    }
}

async function loadStatements() {
    if (!selectedBankAccount) return;

    const statements = await window.api.getStatements(selectedBankAccount.id);
    renderStatementBulkToolsV0409(statements);
    const select = document.getElementById('statementSelect');
    const meta = document.getElementById('statementMeta');
    const deleteButton = document.getElementById('deleteSelectedStatement');
    const openButton = document.getElementById('openSelectedStatement');

    select.innerHTML = '<option value="all">Tous les relevés</option>';

    if (statements.length === 0) {
        meta.textContent = 'Aucun relevé importé.';
        deleteButton.disabled = true;
        openButton.disabled = true;
        selectedStatementId = 'all';
        return;
    }

    const groups = groupStatementsByPeriod(statements);

    groups.forEach(group => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.label;

        group.statements.forEach(statement => {
            const option = document.createElement('option');
            option.value = String(statement.id);
            option.textContent = `${statement.filename} (${statement.transactions_count || 0} op.)`;
            option.dataset.filename = statement.filename;
            option.dataset.filepath = statement.filepath;
            option.dataset.transactionsCount = statement.transactions_count || 0;
            option.dataset.receiptsCount = statement.receipts_count || 0;
            optgroup.appendChild(option);
        });

        select.appendChild(optgroup);
    });

    const exists = statements.some(statement => String(statement.id) === String(selectedStatementId));
    if (!exists) selectedStatementId = 'all';

    select.value = selectedStatementId;
    updateStatementMeta();
}

function getSelectedStatementOption() {
    const select = document.getElementById('statementSelect');
    return select.options[select.selectedIndex] || null;
}

function updateStatementMeta() {
    const option = getSelectedStatementOption();
    const meta = document.getElementById('statementMeta');
    const deleteButton = document.getElementById('deleteSelectedStatement');
    const openButton = document.getElementById('openSelectedStatement');

    if (!option || option.value === 'all') {
        meta.textContent = 'Toutes les opérations du compte sont affichées.';
        deleteButton.disabled = true;
        openButton.disabled = true;
        return;
    }

    meta.textContent = `${option.dataset.transactionsCount || 0} opération(s) — ${option.dataset.receiptsCount || 0} justificatif(s) lié(s).`;
    deleteButton.disabled = false;
    openButton.disabled = false;
}

async function loadSummary() {
    if (!selectedBankAccount) return;

    const summary = await window.api.getTransactionSummary({
        bankAccountId: selectedBankAccount.id,
        filters: getFilters()
    });

    document.getElementById('summaryTotal').textContent = summary.total;
    document.getElementById('summaryAttached').textContent = summary.attached;
    document.getElementById('summaryMissing').textContent = summary.missing;
    document.getElementById('summaryCredit').textContent = formatAmount(summary.credit);
    document.getElementById('summaryDebit').textContent = formatAmount(summary.debit);

    const dashboardSummary = document.getElementById('dashboardAccountSummary');
    if (dashboardSummary) {
        dashboardSummary.style.display = 'grid';
        document.getElementById('dashboardTotalOps').textContent = summary.total;
        document.getElementById('dashboardVerifiedOps').textContent = summary.attached;
        document.getElementById('dashboardMissingOps').textContent = summary.missing;
        document.getElementById('dashboardCreditTotal').textContent = formatAmount(summary.credit);
        document.getElementById('dashboardDebitTotal').textContent = formatAmount(summary.debit);
    }
}

async function loadDashboard() {
    if (selectedCompany && typeof loadCompanyDashboardV038 === 'function') {
        await loadCompanyDashboardV038(selectedCompany.id);
        return;
    }
    if (!selectedBankAccount) return;

    const panel = document.getElementById('dashboardPanel');
    if (panel) panel.style.display = 'grid';

    const insights = await window.api.getDashboardInsights({
        bankAccountId: selectedBankAccount.id,
        filters: getFilters()
    });

    document.getElementById('dashboardMissingAmount').textContent = formatAmount(insights.missing?.total || 0);
    document.getElementById('dashboardMissingCount').textContent = `${insights.missing?.count || 0} opération(s)`;

    const categoriesList = document.getElementById('dashboardCategories');
    categoriesList.innerHTML = '';

    (insights.categories || []).forEach(row => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${row.category}</span><strong>${formatAmount(row.debit_total || row.credit_total || row.total)}</strong>`;
        categoriesList.appendChild(li);
    });

    if ((insights.categories || []).length === 0) {
        const li = document.createElement('li');
        li.className = 'muted';
        li.textContent = 'Aucune catégorie.';
        categoriesList.appendChild(li);
    }

    const suppliersList = document.getElementById('dashboardSuppliers');
    suppliersList.innerHTML = '';

    (insights.suppliers || []).forEach(row => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${row.label}</span><strong>${formatAmount(row.total)}</strong>`;
        suppliersList.appendChild(li);
    });

    if ((insights.suppliers || []).length === 0) {
        const li = document.createElement('li');
        li.className = 'muted';
        li.textContent = 'Aucun débit.';
        suppliersList.appendChild(li);
    }
}

async function loadTransactions() {
    if (!selectedBankAccount) return;

    const rawTransactions = await window.api.getTransactions({
        bankAccountId: selectedBankAccount.id,
        filters: getFilters()
    });
    const transactions = sortTransactionsV0414(rawTransactions || []);
    let automationSuggestionsV072 = [];
    try {
        if (window.api.getBankAutomationSuggestionsV072 && selectedBankAccount) {
            automationSuggestionsV072 = await window.api.getBankAutomationSuggestionsV072({ companyId: selectedCompany ? selectedCompany.id : null, bankAccountId: selectedBankAccount.id });
        }
    } catch (error) { console.warn('Suggestions automatisation indisponibles', error); }

    const body = document.getElementById('transactionTableBody');
    body.innerHTML = '';
    selectedTransactionIds.clear();
    updateBulkToolbar();

    if (transactions.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="8" class="muted">Aucune opération ne correspond aux filtres.</td>';
        body.appendChild(tr);
        return;
    }

    transactions.forEach(transaction => {
        const tr = document.createElement('tr');
        tr.className = transactionNeedsMandatoryReconciliationV0612(transaction)
            ? 'transaction-row transaction-row-needs-reconciliation-v0612'
            : 'transaction-row';
        if (transactionNeedsMandatoryReconciliationV0612(transaction)) {
            tr.title = 'Rapprochement obligatoire à traiter';
        }

        const amount = Number(transaction.amount || 0);
        const amountClass = amount >= 0 ? 'amount-credit' : 'amount-debit';
        const suggestionV072 = getTransactionSuggestionV072(transaction, automationSuggestionsV072);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'transaction-check';
        checkbox.dataset.transactionId = transaction.id;
        checkbox.checked = selectedTransactionIds.has(transaction.id);
        checkbox.addEventListener('click', event => {
            event.stopPropagation();
            if (checkbox.checked) selectedTransactionIds.add(transaction.id);
            else selectedTransactionIds.delete(transaction.id);
            updateBulkToolbar();
        });

        const categorySelect = document.createElement('select');
        categorySelect.className = 'inline-category-select';
        focusPopulateCategorySelectV0405(categorySelect, 'Non catégorisé');
        categorySelect.value = transaction.category || '';
        categorySelect.addEventListener('click', event => event.stopPropagation());
        categorySelect.addEventListener('change', async event => {
            const nextCategory = event.target.value;
            await window.api.updateTransactionDetails({
                transactionId: transaction.id,
                category: nextCategory,
                notes: transaction.notes || ''
            });
            transaction.category = nextCategory;
            if (selectedTransaction && Number(selectedTransaction.id) === Number(transaction.id)) {
                selectedTransaction.category = nextCategory;
                const detailCategory = document.getElementById('detailCategory');
                if (detailCategory) {
                    focusPopulateCategorySelectV0405(detailCategory, 'Non catégorisé');
                    detailCategory.value = nextCategory;
                }
            }
            await refreshAccountView(false);
        });

        tr.innerHTML = `
            <td></td>
            <td>${transaction.date_operation || ''}</td>
            <td>${transaction.label || ''}${suggestionV072 ? `<div class="suggestion-pill-v072">Suggestion : ${escapeHtmlV043(suggestionV072.suggestedCategory)} · ${Math.round(Number(suggestionV072.confidence || 0))}%</div>` : ''}</td>
            <td class="${amountClass}">${formatAmount(amount)}</td>
            <td class="category-cell"></td>
            <td>${getStatusLabel(transaction.status)}</td>
            <td class="icon-cell" title="${transaction.receipts_count || 0} justificatif(s)">📎 ${transaction.receipts_count || 0}</td>
            <td class="icon-cell statement-icon-cell" title="${focusStatementTitleV04110(transaction)}">📄</td>
        `;

        tr.children[0].appendChild(checkbox);
        tr.querySelector('.category-cell').appendChild(categorySelect);

        tr.addEventListener('click', async () => {
            await showTransactionDetail(transaction.id);
        });

        body.appendChild(tr);
    });
}

async function showTransactionDetail(transactionId) {
    const transaction = await window.api.getTransaction(transactionId);
    selectedTransaction = transaction;

    document.getElementById('transactionDetailEmpty').style.display = 'none';
    document.getElementById('transactionDetail').style.display = 'block';
    document.getElementById('detailPanel')?.classList.add('open');

    document.getElementById('detailDate').textContent = transaction.date_operation || '';
    document.getElementById('detailLabel').textContent = transaction.label || '';
    document.getElementById('detailAmount').textContent = formatAmount(transaction.amount);
    
    const detailStatement = document.getElementById('detailStatement');
    if (detailStatement) {
        detailStatement.innerHTML = '';
        const statementLabel = document.createElement('span');
        statementLabel.textContent = focusStatementDisplayNameV04110(transaction);
        detailStatement.appendChild(statementLabel);

        if (transaction.statement_filepath) {
            const openStatement = document.createElement('button');
            openStatement.type = 'button';
            openStatement.className = 'statement-download-button-v04110';
            openStatement.title = focusStatementTitleV04110(transaction);
            openStatement.textContent = '⬇️';
            openStatement.addEventListener('click', async event => {
                event.stopPropagation();
                await window.api.openFile(transaction.statement_filepath);
            });
            detailStatement.appendChild(openStatement);
        }
    }
    document.getElementById('detailStatus').value = transaction.status || 'missing';
    const detailCategorySelect = document.getElementById('detailCategory');
    if (detailCategorySelect) {
        focusPopulateCategorySelectV0405(detailCategorySelect, 'Non catégorisé');
        detailCategorySelect.value = transaction.category || '';
    }
    document.getElementById('detailNotes').value = transaction.notes || '';

    await loadReceipts(transaction.id);
}

function updateReceiptPreview(receipt) {
    const preview = document.getElementById('receiptPreview');
    const filename = receipt.filename.toLowerCase();

    if (filename.endsWith('.jpg') || filename.endsWith('.jpeg') || filename.endsWith('.png') || filename.endsWith('.webp')) {
        preview.className = 'receipt-preview';
        preview.innerHTML = `<img src="file:///${receipt.filepath.replace(/\\/g, '/')}" alt="${receipt.filename}">`;
        return;
    }

    if (filename.endsWith('.pdf')) {
        preview.className = 'receipt-preview pdf-preview';
        preview.innerHTML = `📄 ${receipt.filename}<br><span class="muted">Clique sur “Ouvrir” pour consulter le PDF.</span>`;
        return;
    }

    preview.className = 'receipt-preview muted';
    preview.textContent = receipt.filename;
}

async function loadReceipts(transactionId) {
    const receipts = await window.api.getReceipts(transactionId);
    const list = document.getElementById('receiptList');
    list.innerHTML = '';

    const preview = document.getElementById('receiptPreview');
    preview.className = 'receipt-preview muted';
    preview.textContent = 'Aucun aperçu sélectionné.';

    if (receipts.length === 0) {
        const li = document.createElement('li');
        li.className = 'muted';
        li.textContent = 'Aucun justificatif attaché.';
        list.appendChild(li);
        return;
    }

    updateReceiptPreview(receipts[0]);

    receipts.forEach(receipt => {
        const li = document.createElement('li');
        li.className = 'receipt-item';

        const info = document.createElement('span');
        info.textContent = `${receipt.filename} — ${receipt.added_at}`;

        const previewButton = document.createElement('button');
        previewButton.textContent = 'Aperçu';
        previewButton.addEventListener('click', () => updateReceiptPreview(receipt));

        const openButton = document.createElement('button');
        openButton.textContent = 'Ouvrir';
        openButton.addEventListener('click', async () => {
            await window.api.openFile(receipt.filepath);
        });

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Supprimer';
        deleteButton.className = 'danger-button';
        deleteButton.addEventListener('click', async () => {
            const confirmDelete = await showFocusConfirmModalV0412('Supprimer le justificatif', `Supprimer ce justificatif ?\n\n${receipt.filename}`, 'Supprimer', 'Annuler');
            if (!confirmDelete) return;

            await window.api.deleteReceipt(receipt.id);
            await showTransactionDetail(transactionId);
            await refreshAccountView(false);
        });

        li.appendChild(info);
        li.appendChild(previewButton);
        li.appendChild(openButton);
        li.appendChild(deleteButton);
        list.appendChild(li);
    });
}


let focusBankFiltersBoundV0413 = false;
let focusBankSearchTimerV0413 = null;

async function applyBankFiltersV0413(refreshPeriods = false) {
    if (!selectedBankAccount) return;
    selectedTransactionIds.clear();
    resetTransactionDetail();
    await loadSummary();
    await loadDashboard();
    await loadTransactions();
    await renderBankAutomationSuggestionsV072();
    await updateCompanyContextBar();
}

function setupBankFilterEventsV0413() {
    if (focusBankFiltersBoundV0413) return;
    focusBankFiltersBoundV0413 = true;

    const searchInput = document.getElementById('searchInput');
    const yearFilter = document.getElementById('yearFilter');
    const monthFilter = document.getElementById('monthFilter');
    const statusFilter = document.getElementById('statusFilter');
    const sortButtons = document.querySelectorAll('[data-bank-sort]');
    const resetButton = document.getElementById('resetFilters');
    updateBankSortHeaderV0415();

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            window.clearTimeout(focusBankSearchTimerV0413);
            focusBankSearchTimerV0413 = window.setTimeout(() => {
                applyBankFiltersV0413(false).catch(console.error);
            }, 180);
        });
    }

    [yearFilter, monthFilter, statusFilter].forEach(select => {
        if (!select) return;
        select.addEventListener('change', () => {
            applyBankFiltersV0413(false).catch(console.error);
        });
    });

    sortButtons.forEach(button => {
        button.addEventListener('click', () => {
            setBankSortOptionsV0415(button.dataset.bankSort);
            applyBankFiltersV0413(false).catch(console.error);
        });
    });

    if (resetButton) {
        resetButton.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (yearFilter) yearFilter.value = 'all';
            if (monthFilter) monthFilter.value = 'all';
            if (statusFilter) statusFilter.value = 'all';
            resetBankSortOptionsV0415();
            selectedStatementId = 'all';
            const statementSelect = document.getElementById('statementSelect');
            if (statementSelect) statementSelect.value = 'all';
            updateStatementMeta();
            applyBankFiltersV0413(false).catch(console.error);
        });
    }
}

document.getElementById('newCompany').addEventListener('click', async () => {
    const input = document.getElementById('companyName');
    const name = input.value.trim();
    if (!name) return;

    await window.api.addCompany(name);
    input.value = '';
    await loadCompanies();
});

document.querySelectorAll('.nav-button, .nav-shortcut').forEach(button => {
    button.addEventListener('click', async () => {
        const pageId = button.dataset.page;
        if (pageId) showPage(pageId);
        if (pageId === 'receiptsPage') await loadDocuments();
        if (pageId === 'matchingPage') await loadMatchingPage();
        if (pageId === 'thirdPartiesPage') await loadThirdParties();
        if (pageId === 'settingsPage') { await loadCategoryOptions(); await loadAutomationRulesV031(); }
    });
});

const contextCompanyButton = document.getElementById('contextCompanyButton');
if (contextCompanyButton) {
    contextCompanyButton.addEventListener('click', () => showPage('companiesPage'));
}

const homeAddCompanyButton = document.getElementById('homeAddCompany');
if (homeAddCompanyButton) {
    homeAddCompanyButton.addEventListener('click', () => showPage('companiesPage'));
}

const openDataFolderSettingsButton = document.getElementById('openDataFolderSettings');
if (openDataFolderSettingsButton) {
    openDataFolderSettingsButton.addEventListener('click', async () => {
        await window.api.openDataFolder();
    });
}

const createBackupSettingsButton = document.getElementById('createBackupSettings');
if (createBackupSettingsButton) {
    createBackupSettingsButton.addEventListener('click', async () => {
        const result = await window.api.createBackup();
        if (result && result.ok) focusToastV041(`Sauvegarde créée : ${result.backupDir}`, 'success');
    });
}

document.getElementById('newBankAccount').addEventListener('click', async () => {
    if (!selectedCompany) return;

    const bankNameInput = document.getElementById('bankName');
    const accountNameInput = document.getElementById('accountName');
    const accountNumberInput = document.getElementById('accountNumber');
    const ibanInput = document.getElementById('iban');
    const bicInput = document.getElementById('bic');

    const bankName = bankNameInput.value.trim();
    const accountName = accountNameInput.value.trim();
    const accountNumber = accountNumberInput.value.trim();
    const iban = ibanInput.value.trim();
    const bic = bicInput.value.trim();

    if (!bankName) return;

    await window.api.addBankAccount({
        companyId: selectedCompany.id,
        bankName,
        accountName,
        accountNumber,
        iban,
        bic
    });

    bankNameInput.value = '';
    accountNameInput.value = '';
    accountNumberInput.value = '';
    ibanInput.value = '';
    bicInput.value = '';

    { const el = document.getElementById('bankAccountForm'); if (el) el.style.display = 'none'; }
    await loadBankAccounts();
});

const toggleBankFormButton = document.getElementById('toggleBankForm');
if (toggleBankFormButton) {
    toggleBankFormButton.addEventListener('click', () => {
        const form = document.getElementById('bankAccountForm');
        const edit = document.getElementById('bankAccountEdit');
        edit.style.display = 'none';
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
}

const selectRibButton = document.getElementById('selectRib');
if (selectRibButton) {
    selectRibButton.addEventListener('click', async () => {
        const rib = await window.api.selectRib();
        if (!rib) return;
        selectedRibFilepath = rib.filepath;
        document.getElementById('editRibLabel').textContent = `Nouveau RIB sélectionné : ${rib.filename}`;
    });
}

const saveBankAccountButton = document.getElementById('saveBankAccount');
if (saveBankAccountButton) {
    saveBankAccountButton.addEventListener('click', async () => {
        if (!selectedBankAccount || !selectedCompany) return;

        await window.api.updateBankAccount({
            id: selectedBankAccount.id,
            companyName: selectedCompany.name,
            bankName: document.getElementById('editBankName').value.trim(),
            accountName: document.getElementById('editAccountName').value.trim(),
            accountNumber: document.getElementById('editAccountNumber').value.trim(),
            iban: document.getElementById('editIban').value.trim(),
            bic: document.getElementById('editBic').value.trim(),
            notes: document.getElementById('editBankNotes').value.trim(),
            ribFilepath: selectedRibFilepath
        });

        selectedRibFilepath = null;
        await loadBankAccounts();
        const accounts = await window.api.getBankAccounts(selectedCompany.id);
        const updated = accounts.find(account => account.id === selectedBankAccount.id);
        if (updated) await selectBankAccount(updated);
    });
}


const cancelBankEditButton = document.getElementById('cancelBankEdit');
if (cancelBankEditButton) {
    cancelBankEditButton.addEventListener('click', () => {
        { const el = document.getElementById('bankAccountEdit'); if (el) el.style.display = 'none'; }
        selectedRibFilepath = null;
    });
}

const openRibButton = document.getElementById('openRib');
if (openRibButton) {
    openRibButton.addEventListener('click', async () => {
        if (!selectedBankAccount || !selectedBankAccount.rib_path) {
            focusToastV041('Aucun RIB enregistré pour ce compte.', 'warning');
            return;
        }
        await window.api.openFile(selectedBankAccount.rib_path);
    });
}

const deleteBankAccountButton = document.getElementById('deleteBankAccount');
if (deleteBankAccountButton) {
    deleteBankAccountButton.addEventListener('click', async () => {
        if (!selectedBankAccount) return;
        const confirmed = await showFocusConfirmModalV0412('Supprimer le compte bancaire', `Supprimer le compte ${bankAccountTitle(selectedBankAccount)} ?\n\nCette action est possible uniquement s'il n'a aucun relevé lié.`, 'Supprimer', 'Annuler');
        if (!confirmed) return;
        const result = await window.api.deleteBankAccount(selectedBankAccount.id);
        focusToastV041(result.message, result.deleted ? 'success' : 'warning');
        if (result.deleted) {
            selectedBankAccount = null;
            { const el = document.getElementById('bankAccountEdit'); if (el) el.style.display = 'none'; }
            document.getElementById('selectedAccountTitle').textContent = 'Sélectionne un compte bancaire';
            await loadBankAccounts();
        }
    });
}

async function importStatementsFlow() {
    if (!selectedCompany && !selectedBankAccount) {
        if (typeof focusToastV041 === 'function') focusToastV041('Sélectionne d’abord une société pour affecter les relevés.', 'warning');
        return;
    }

    const pdfs = await window.api.selectPdf();
    if (!pdfs || pdfs.length === 0) return;

    const files = Array.isArray(pdfs) ? pdfs : [pdfs];

    showProgressV0409('Import des relevés', `${files.length} fichier(s) sélectionné(s). Analyse, affectation et classement automatique en cours…`);
    let bulk;
    try {
        bulk = await window.api.addStatementsBulk({
            companyId: selectedCompany ? selectedCompany.id : null,
            files
        });
    } finally {
        hideProgressV0409();
    }

    await focusShowImportReportV041(bulk, { subtitle: `${files.length} fichier(s) PDF traité(s).` });

    const lastImported = [...(bulk.results || [])].reverse().find(row => row.imported);

    if (lastImported && selectedBankAccount && Number(lastImported.assignedBankAccountId) === Number(selectedBankAccount.id)) {
        selectedStatementId = String(lastImported.statementId);
        await refreshAccountView(true);
    } else if (selectedBankAccount) {
        await refreshAccountView(false);
    } else if (selectedCompany) {
        await loadBankAccounts();
    }
}




setupBankFilterEventsV0413();

// Focus Compta V0.41.13 - restauration des actions Banque cassées par le refactoring Tiers
(function restoreBankActionButtonsV04113() {
    function bindOnce(id, eventName, handler) {
        const el = document.getElementById(id);
        if (!el) return;
        const key = `focusBoundV04113_${eventName}`;
        if (el.dataset[key] === '1') return;
        el.dataset[key] = '1';
        el.addEventListener(eventName, handler);
    }

    async function safeRefreshBankView(refreshPeriods = false) {
        if (selectedBankAccount && typeof refreshAccountView === 'function') {
            await refreshAccountView(refreshPeriods);
        } else if (selectedCompany && typeof loadBankAccounts === 'function') {
            await loadBankAccounts();
        }
        if (typeof updateCompanyContextBar === 'function') await updateCompanyContextBar();
    }

    async function handleImportStatementsV04113() {
        try {
            if (typeof importStatementsFlow === 'function') {
                await importStatementsFlow();
            }
        } catch (error) {
            console.error('Import relevés impossible', error);
            if (typeof focusToastV041 === 'function') focusToastV041(`Import relevés impossible : ${error.message || error}`, 'error');
        }
    }

    async function handleStatementChangeV04113() {
        selectedStatementId = document.getElementById('statementSelect')?.value || 'all';
        if (typeof updateStatementMeta === 'function') updateStatementMeta();
        if (typeof resetTransactionDetail === 'function') resetTransactionDetail();
        if (typeof applyBankFiltersV0413 === 'function') await applyBankFiltersV0413(true);
        else await safeRefreshBankView(false);
    }

    async function handleOpenSelectedStatementV04113() {
        const option = typeof getSelectedStatementOption === 'function' ? getSelectedStatementOption() : document.getElementById('statementSelect')?.selectedOptions?.[0];
        if (!option || option.value === 'all') return;
        const filepath = option.dataset.filepath;
        if (!filepath) {
            if (typeof focusToastV041 === 'function') focusToastV041('Fichier du relevé introuvable.', 'warning');
            return;
        }
        await window.api.openFile(filepath);
    }

    async function handleDeleteSelectedStatementV04113() {
        const option = typeof getSelectedStatementOption === 'function' ? getSelectedStatementOption() : document.getElementById('statementSelect')?.selectedOptions?.[0];
        if (!option || option.value === 'all') return;
        const filename = option.dataset.filename || option.textContent || 'ce relevé';
        const transactionsCount = option.dataset.transactionsCount || 0;
        const receiptsCount = option.dataset.receiptsCount || 0;
        const message = `Supprimer ce relevé ?\n\n${filename}\n\n${transactionsCount} opération(s) et ${receiptsCount} justificatif(s) lié(s) seront supprimés.`;
        const confirmed = typeof showFocusConfirmModalV0412 === 'function'
            ? await showFocusConfirmModalV0412('Supprimer le relevé', message, 'Supprimer', 'Annuler')
            : confirm(message);
        if (!confirmed) return;
        const result = await window.api.deleteStatement(Number(option.value));
        if (typeof focusToastV041 === 'function') focusToastV041(result?.message || 'Relevé supprimé.', result?.deleted === false ? 'warning' : 'success');
        selectedStatementId = 'all';
        await safeRefreshBankView(true);
    }

    async function handleSaveTransactionDetailsV04113() {
        if (!selectedTransaction) return;
        const status = document.getElementById('detailStatus')?.value || selectedTransaction.status || 'missing';
        const category = document.getElementById('detailCategory')?.value || '';
        const notes = document.getElementById('detailNotes')?.value?.trim() || '';
        await window.api.updateTransactionStatus({ transactionId: selectedTransaction.id, status });
        await window.api.updateTransactionDetails({ transactionId: selectedTransaction.id, category, notes });
        if (typeof showTransactionDetail === 'function') await showTransactionDetail(selectedTransaction.id);
        await safeRefreshBankView(false);
        if (typeof focusToastV041 === 'function') focusToastV041('Opération mise à jour.', 'success');
    }

    async function handleAddReceiptV04113() {
        if (!selectedTransaction) {
            if (typeof focusToastV041 === 'function') focusToastV041('Sélectionne d’abord une opération.', 'warning');
            return;
        }
        const receipt = await window.api.selectReceipt();
        if (!receipt) return;
        if (typeof showProgressV0409 === 'function') showProgressV0409('Ajout du justificatif', 'Copie et association en cours…');
        try {
            await window.api.addReceipt({
                transactionId: selectedTransaction.id,
                filename: receipt.filename,
                filepath: receipt.filepath,
                companyId: selectedCompany ? selectedCompany.id : null
            });
        } finally {
            if (typeof hideProgressV0409 === 'function') hideProgressV0409();
        }
        if (typeof showTransactionDetail === 'function') await showTransactionDetail(selectedTransaction.id);
        await safeRefreshBankView(false);
        if (typeof focusToastV041 === 'function') focusToastV041('Justificatif associé.', 'success');
    }

    async function handleSmartReceiptV04113() {
        if (!selectedBankAccount) {
            if (typeof focusToastV041 === 'function') focusToastV041('Sélectionne d’abord un compte bancaire.', 'warning');
            return;
        }
        const receipt = await window.api.selectSmartReceipt(selectedBankAccount.id);
        if (!receipt) return;
        if (!receipt.matches || receipt.matches.length === 0) {
            if (typeof focusToastV041 === 'function') focusToastV041('Aucune opération probable trouvée pour cette pièce jointe.', 'warning');
            return;
        }
        const best = receipt.matches[0];
        const label = `${best.date_operation || ''} — ${best.label || ''} — ${typeof formatAmount === 'function' ? formatAmount(best.amount) : best.amount}`;
        const confirmed = typeof showFocusConfirmModalV0412 === 'function'
            ? await showFocusConfirmModalV0412('Pointer automatiquement la pièce jointe', `${receipt.filename}\n\nAssocier à :\n${label}`, 'Associer', 'Annuler')
            : confirm(`Associer ce justificatif ?\n\n${receipt.filename}\n\n→ ${label}`);
        if (!confirmed) return;
        await window.api.addReceipt({
            transactionId: best.id,
            filename: receipt.filename,
            filepath: receipt.filepath,
            companyId: selectedCompany ? selectedCompany.id : null
        });
        if (typeof showTransactionDetail === 'function') await showTransactionDetail(best.id);
        await safeRefreshBankView(false);
        if (typeof focusToastV041 === 'function') focusToastV041('Pièce jointe pointée.', 'success');
    }

    function init() {
        bindOnce('importStatement', 'click', handleImportStatementsV04113);
        bindOnce('importStatementSidebar', 'click', handleImportStatementsV04113);
        bindOnce('statementSelect', 'change', handleStatementChangeV04113);
        bindOnce('openSelectedStatement', 'click', handleOpenSelectedStatementV04113);
        bindOnce('deleteSelectedStatement', 'click', handleDeleteSelectedStatementV04113);
        bindOnce('saveTransactionDetails', 'click', handleSaveTransactionDetailsV04113);
        bindOnce('addReceipt', 'click', handleAddReceiptV04113);
        bindOnce('smartReceipt', 'click', handleSmartReceiptV04113);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();

// V0.52.1 — synchronise les catégories créées dans Paramètres avec Banque sans redémarrage.
window.addEventListener('focus-taxonomies-updated-v0405', async () => {
    try {
        await loadCategoryOptions();
        document.querySelectorAll('.inline-category-select').forEach(select => {
            const current = select.value || '';
            focusPopulateCategorySelectV0405(select, 'Non catégorisé');
            select.value = current;
        });
        if (selectedTransaction) {
            const detailCategory = document.getElementById('detailCategory');
            if (detailCategory) {
                const current = detailCategory.value || selectedTransaction.category || '';
                focusPopulateCategorySelectV0405(detailCategory, 'Non catégorisé');
                detailCategory.value = current;
            }
        }
    } catch (error) {
        console.warn('Synchronisation catégories Banque impossible', error);
    }
});
