let selectedCompany = null;
let selectedBankAccount = null;
let selectedStatementId = 'all';
let selectedTransaction = null;
let selectedRibFilepath = null;
let searchTimer = null;
let selectedTransactionIds = new Set();
let categoryRules = [];
let selectedDocumentId = null;

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

function makeCompanyCard(company, options = {}) {
    const card = document.createElement('article');
    card.className = 'company-card';

    const subtitle = options.subtitle || 'Société active';
    const details = options.details || 'Cliquez pour ouvrir le dossier';

    card.innerHTML = `
        <div class="company-card-header">
            <h3>${company.name}</h3>
            <span class="status-pill">Actif</span>
        </div>
        <p>${subtitle}</p>
        <div class="company-card-metrics">${details}</div>
        <button>Ouvrir</button>
    `;

    card.querySelector('button').addEventListener('click', async () => {
        await selectCompany(company, false);
        await loadCompanyDashboardV038(company.id);
        showPage('dashboardPage');
    });

    return card;
}

async function selectCompany(company, goToBank = true) {
    selectedCompany = company;
    selectedBankAccount = null;
    selectedStatementId = 'all';

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

async function loadHomeInsights(companies) {
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


async function loadCategoryOptions() {
    categoryRules = await window.api.getCategoryRules();
    const categories = [...new Set(categoryRules.map(rule => rule.category).filter(Boolean))].sort();
    const targets = ['detailCategory', 'bulkCategory'];
    targets.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const current = select.value;
        select.innerHTML = id === 'bulkCategory' ? '<option value="">Catégorie...</option>' : '<option value="">Non catégorisé</option>';
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            select.appendChild(option);
        });
        if (current) select.value = current;
    });

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
    if (dashboardTitle) dashboardTitle.textContent = selectedCompany ? `${selectedCompany.name}` : 'Tableau de bord';
    if (dashboardSubtitle) dashboardSubtitle.textContent = `${title}`;

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

function resetTransactionDetail() {
    selectedTransaction = null;
    document.getElementById('transactionDetailEmpty').style.display = 'block';
    document.getElementById('transactionDetail').style.display = 'none';
    document.getElementById('receiptPreview').textContent = 'Aucun aperçu sélectionné.';
    document.getElementById('receiptPreview').className = 'receipt-preview muted';
}

async function loadCompanies() {
    const companies = await window.api.getCompanies();
    const companyList = document.getElementById('companyList');
    const homeCompanyCards = document.getElementById('homeCompanyCards');

    companyList.innerHTML = '';
    if (homeCompanyCards) homeCompanyCards.innerHTML = '';

    if (companies.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'Aucune société créée pour le moment.';
        companyList.appendChild(empty.cloneNode(true));
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

async function refreshAccountView(refreshPeriods = false) {
    if (refreshPeriods) {
        await loadAvailablePeriods();
    }

    await loadStatements();
    await loadSummary();
    await loadDashboard();
    await loadTransactions();
}

async function loadAvailablePeriods() {
    if (!selectedBankAccount) return;

    const periods = await window.api.getAvailablePeriods(selectedBankAccount.id);
    const yearFilter = document.getElementById('yearFilter');
    const monthFilter = document.getElementById('monthFilter');

    const selectedYear = yearFilter.value || 'all';
    const selectedMonth = monthFilter.value || 'all';

    const years = [...new Set(periods.map(period => period.year).filter(Boolean))];
    const months = [...new Set(periods.map(period => period.month).filter(Boolean))].sort();

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

async function loadStatements() {
    if (!selectedBankAccount) return;

    const statements = await window.api.getStatements(selectedBankAccount.id);
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

    const transactions = await window.api.getTransactions({
        bankAccountId: selectedBankAccount.id,
        filters: getFilters()
    });

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
        tr.className = 'transaction-row';

        const amount = Number(transaction.amount || 0);
        const amountClass = amount >= 0 ? 'amount-credit' : 'amount-debit';

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
        categorySelect.innerHTML = '<option value="">Non catégorisé</option>';
        [...new Set(categoryRules.map(rule => rule.category).filter(Boolean))].sort().forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });
        categorySelect.value = transaction.category || '';
        categorySelect.addEventListener('click', event => event.stopPropagation());
        categorySelect.addEventListener('change', async event => {
            await window.api.updateTransactionDetails({
                transactionId: transaction.id,
                category: event.target.value,
                notes: transaction.notes || ''
            });
            await refreshAccountView(false);
        });

        tr.innerHTML = `
            <td></td>
            <td>${transaction.date_operation || ''}</td>
            <td>${transaction.label || ''}</td>
            <td class="${amountClass}">${formatAmount(amount)}</td>
            <td class="category-cell"></td>
            <td>${getStatusLabel(transaction.status)}</td>
            <td class="icon-cell" title="${transaction.receipts_count || 0} justificatif(s)">📎 ${transaction.receipts_count || 0}</td>
            <td class="icon-cell statement-icon-cell" title="${transaction.statement_filename || 'Relevé source'}">📄</td>
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
    document.getElementById('detailStatement').textContent = transaction.statement_filename || '';
    document.getElementById('detailStatus').value = transaction.status || 'missing';
    document.getElementById('detailCategory').value = transaction.category || '';
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
            const confirmDelete = confirm(`Supprimer ce justificatif ?\n\n${receipt.filename}`);
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
        if (result && result.ok) alert(`Sauvegarde créée :\n${result.backupDir}`);
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
            alert('Aucun RIB enregistré pour ce compte.');
            return;
        }
        await window.api.openFile(selectedBankAccount.rib_path);
    });
}

const deleteBankAccountButton = document.getElementById('deleteBankAccount');
if (deleteBankAccountButton) {
    deleteBankAccountButton.addEventListener('click', async () => {
        if (!selectedBankAccount) return;
        const confirmed = confirm(`Supprimer le compte ${bankAccountTitle(selectedBankAccount)} ?\n\nCette action est possible uniquement s'il n'a aucun relevé lié.`);
        if (!confirmed) return;
        const result = await window.api.deleteBankAccount(selectedBankAccount.id);
        alert(result.message);
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
        alert('Sélectionne d’abord une société. Focus Compta pourra ensuite affecter automatiquement les relevés aux bons comptes.');
        return;
    }

    const pdfs = await window.api.selectPdf();
    if (!pdfs || pdfs.length === 0) return;

    const files = Array.isArray(pdfs) ? pdfs : [pdfs];

    const bulk = await window.api.addStatementsBulk({
        companyId: selectedCompany ? selectedCompany.id : null,
        files
    });

    let message = `Import terminé\n\n${bulk.importedCount} relevé(s) importé(s)\n${bulk.skippedCount} ignoré(s)\n${bulk.transactionsCount} opération(s) ajoutée(s)`;

    if (bulk.unresolvedCount) {
        message += `\n\n⚠️ ${bulk.unresolvedCount} relevé(s) non affecté(s) à un compte.`;
    }

    if (bulk.byAccount && Object.keys(bulk.byAccount).length) {
        message += '\n\nAffectation :';
        Object.entries(bulk.byAccount).forEach(([account, count]) => {
            message += `\n- ${account} : ${count} relevé(s)`;
        });
    }

    const importedRows = (bulk.results || []).filter(row => row.imported);
    const withControl = importedRows.filter(row => row.importReport);
    const notBalanced = withControl.filter(row => !row.importReport.isBalanced);
    const balanced = withControl.filter(row => row.importReport.isBalanced);

    message += `\n\nContrôle bancaire :`;
    if (withControl.length === 0) {
        message += `\n- Aucun contrôle disponible`;
    } else {
        message += `\n- ${balanced.length} relevé(s) conforme(s)`;
        message += `\n- ${notBalanced.length} relevé(s) avec écart`;
    }

    if (notBalanced.length > 0) {
        message += `\n\nDétail des écarts :`;
        notBalanced.slice(0, 8).forEach(row => {
            const report = row.importReport || {};
            const debitDiff = report.debitDifference ?? report.debit_difference ?? null;
            const creditDiff = report.creditDifference ?? report.credit_difference ?? null;
            message += `\n- ${row.filename}`;
            if (debitDiff !== null) message += ` | Débits écart : ${Number(debitDiff).toFixed(2)} €`;
            if (creditDiff !== null) message += ` | Crédits écart : ${Number(creditDiff).toFixed(2)} €`;
        });
        if (notBalanced.length > 8) message += `\n- ... ${notBalanced.length - 8} autre(s)`;
    }

    const unresolved = (bulk.results || []).filter(row => row.unresolved);
    if (unresolved.length) {
        message += '\n\nNon affectés :';
        unresolved.slice(0, 8).forEach(row => {
            message += `\n- ${row.filename} : ${row.message || 'à affecter manuellement'}`;
        });
        if (unresolved.length > 8) message += `\n- ... ${unresolved.length - 8} autre(s)`;
    }

    alert(message);

    const lastImported = [...(bulk.results || [])].reverse().find(row => row.imported);

    // Si le dernier relevé importé appartient au compte actuellement affiché,
    // on le sélectionne. Sinon on recharge la société sans changer de compte.
    if (lastImported && selectedBankAccount && Number(lastImported.assignedBankAccountId) === Number(selectedBankAccount.id)) {
        selectedStatementId = String(lastImported.statementId);
        await refreshAccountView(true);
    } else if (selectedBankAccount) {
        await refreshAccountView(false);
    } else if (selectedCompany) {
        await loadBankAccounts();
    }
}

document.getElementById('importStatement').addEventListener('click', importStatementsFlow);
const importStatementSidebarButton = document.getElementById('importStatementSidebar');
if (importStatementSidebarButton) importStatementSidebarButton.addEventListener('click', importStatementsFlow);

document.getElementById('statementSelect').addEventListener('change', async () => {
    selectedStatementId = document.getElementById('statementSelect').value || 'all';
    updateStatementMeta();
    resetTransactionDetail();
    await loadSummary();
    await loadTransactions();
});

document.getElementById('openSelectedStatement').addEventListener('click', async () => {
    const option = getSelectedStatementOption();
    if (!option || option.value === 'all') return;

    await window.api.openFile(option.dataset.filepath);
});

document.getElementById('deleteSelectedStatement').addEventListener('click', async () => {
    const option = getSelectedStatementOption();
    if (!option || option.value === 'all') return;

    const confirmDelete = confirm(
        `Supprimer ce relevé ?\n\n${option.dataset.filename}\n\n` +
        `${option.dataset.transactionsCount || 0} opération(s) et ${option.dataset.receiptsCount || 0} justificatif(s) lié(s) seront supprimés.`
    );

    if (!confirmDelete) return;

    await window.api.deleteStatement(Number(option.value));
    selectedStatementId = 'all';
    resetTransactionDetail();
    await refreshAccountView(true);
});

document.getElementById('saveTransactionDetails').addEventListener('click', async () => {
    if (!selectedTransaction) return;

    const status = document.getElementById('detailStatus').value;
    const category = document.getElementById('detailCategory').value.trim();
    const notes = document.getElementById('detailNotes').value.trim();

    await window.api.updateTransactionStatus({
        transactionId: selectedTransaction.id,
        status
    });

    await window.api.updateTransactionDetails({
        transactionId: selectedTransaction.id,
        category,
        notes
    });

    await showTransactionDetail(selectedTransaction.id);
    await refreshAccountView(false);
});

document.getElementById('addReceipt').addEventListener('click', async () => {
    if (!selectedTransaction) return;

    const receipt = await window.api.selectReceipt();
    if (!receipt) return;

    await window.api.addReceipt({
        transactionId: selectedTransaction.id,
        filename: receipt.filename,
        filepath: receipt.filepath,
        companyId: selectedCompany ? selectedCompany.id : null
    });

    await showTransactionDetail(selectedTransaction.id);
    await refreshAccountView(false);
});

document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(async () => {
        resetTransactionDetail();
        await loadSummary();
        await loadTransactions();
    }, 200);
});

['yearFilter', 'monthFilter', 'statusFilter'].forEach(id => {
    document.getElementById(id).addEventListener('change', async () => {
        resetTransactionDetail();
        await loadSummary();
        await loadTransactions();
    });
});

document.getElementById('smartReceipt').addEventListener('click', async () => {
    if (!selectedBankAccount) return;

    const receipt = await window.api.selectSmartReceipt(selectedBankAccount.id);
    if (!receipt) return;

    if (!receipt.matches || receipt.matches.length === 0) {
        alert('Aucune opération probable trouvée pour ce justificatif. Sélectionne une opération puis ajoute le justificatif manuellement.');
        return;
    }

    const best = receipt.matches[0];
    const confirmed = confirm(
        `Associer ce justificatif ?\n\n${receipt.filename}\n\n→ ${best.date_operation} — ${best.label} — ${formatAmount(best.amount)}`
    );

    if (!confirmed) return;

    await window.api.addReceipt({
        transactionId: best.id,
        filename: receipt.filename,
        filepath: receipt.filepath
    });

    await showTransactionDetail(best.id);
    await refreshAccountView(false);
});

document.getElementById('resetFilters').addEventListener('click', async () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('yearFilter').value = 'all';
    document.getElementById('monthFilter').value = 'all';
    document.getElementById('statusFilter').value = 'all';
    selectedStatementId = 'all';

    const statementSelect = document.getElementById('statementSelect');
    if (statementSelect) statementSelect.value = 'all';
    updateStatementMeta();

    resetTransactionDetail();
    await loadSummary();
    await loadTransactions();
});


const openDataFolderButton = document.getElementById('openDataFolder');
if (openDataFolderButton) {
    openDataFolderButton.addEventListener('click', async () => {
        await window.api.openDataFolder();
    });
}

const createBackupButton = document.getElementById('createBackup');
if (createBackupButton) {
    createBackupButton.addEventListener('click', async () => {
        const result = await window.api.createBackup();
        if (result && result.ok) {
            alert(`Sauvegarde créée :\n${result.backupDir}`);
        }
    });
}



const selectAllTransactions = document.getElementById('selectAllTransactions');
if (selectAllTransactions) {
    selectAllTransactions.addEventListener('change', () => {
        document.querySelectorAll('#transactionTableBody input[type="checkbox"]').forEach(input => {
            input.checked = selectAllTransactions.checked;
            const row = input.closest('tr');
            const date = row?.children?.[1]?.textContent;
            // IDs are tracked by individual checkbox events; trigger click if needed.
            input.dispatchEvent(new Event('click', { bubbles: false }));
            if (input.checked !== selectAllTransactions.checked) input.checked = selectAllTransactions.checked;
        });
    });
}

const applyBulkUpdateButton = document.getElementById('applyBulkUpdate');
if (applyBulkUpdateButton) {
    applyBulkUpdateButton.addEventListener('click', async () => {
        if (selectedTransactionIds.size === 0) return;
        const updates = {};
        const category = document.getElementById('bulkCategory').value;
        const status = document.getElementById('bulkStatus').value;
        const notes = document.getElementById('bulkNotes').value.trim();
        if (category) updates.category = category;
        if (status) updates.status = status;
        if (notes) updates.notes = notes;
        if (Object.keys(updates).length === 0) return;
        await window.api.bulkUpdateTransactions({ ids: [...selectedTransactionIds], updates });
        selectedTransactionIds.clear();
        document.getElementById('bulkNotes').value = '';
        await refreshAccountView(false);
    });
}

const clearSelectionButton = document.getElementById('clearSelection');
if (clearSelectionButton) {
    clearSelectionButton.addEventListener('click', () => {
        selectedTransactionIds.clear();
        document.querySelectorAll('#transactionTableBody input[type="checkbox"]').forEach(input => input.checked = false);
        updateBulkToolbar();
    });
}


let selectedDocumentFolderV033 = '';
let selectedDocumentV033 = null;
let selectedDocumentRowsV033 = [];

function docTypeIconV033(type) {
    const map = {
        facture: '🧾',
        avoir: '↩️',
        releve: '📄',
        contrat: '📑',
        rib: '🏦',
        divers: '📁'
    };
    return map[type || 'facture'] || '📁';
}

function docTypeLabelV033(type) {
    const labels = {
        facture: 'Facture',
        avoir: 'Avoir',
        releve: 'Relevé',
        contrat: 'Contrat',
        rib: 'RIB',
        divers: 'Divers'
    };
    return labels[type || 'facture'] || 'Divers';
}

function getDocumentFiltersV033(extra = {}) {
    const filters = {
        status: 'all',
        search: document.getElementById('documentSearch')?.value || '',
        ...extra
    };
    const type = document.getElementById('documentTypeFilter')?.value || 'all';
    if (type !== 'all') filters.type = type;

    return filters;
}

async function fetchDocumentsV033(extra = {}) {
    let docs = await window.api.getDocuments({
        companyId: selectedCompany ? selectedCompany.id : null,
        filters: getDocumentFiltersV033(extra)
    });

    const year = document.getElementById('documentYearFilterV033')?.value || 'all';
    if (year !== 'all') {
        docs = docs.filter(doc => String(doc.detected_date || doc.added_at || doc.folder_path || '').includes(year));
    }

    return docs;
}

function updateDocumentKpisV033(docs) {
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    set('docsKpiTotalV033', docs.length);
    set('docsKpiStatementsV033', docs.filter(doc => doc.doc_type === 'releve').length);
    set('docsKpiDocsV033', docs.filter(doc => !['releve', 'rib'].includes(doc.doc_type || 'facture')).length);
    set('docsKpiRibV033', docs.filter(doc => doc.doc_type === 'rib').length);
    set('docsKpiContractsV033', docs.filter(doc => doc.doc_type === 'contrat').length);
}

function updateYearFilterV033(docs) {
    const select = document.getElementById('documentYearFilterV033');
    if (!select) return;

    const current = select.value || 'all';
    const years = [...new Set(docs.map(doc => {
        const text = `${doc.detected_date || ''} ${doc.added_at || ''} ${doc.folder_path || ''}`;
        const match = text.match(/20\d{2}/);
        return match ? match[0] : null;
    }).filter(Boolean))].sort().reverse();

    select.innerHTML = '<option value="all">Année : Toutes</option>';
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `Année : ${year}`;
        select.appendChild(option);
    });
    if (years.includes(current)) select.value = current;
}

function buildVirtualFoldersV033(docs) {
    const folders = new Map();

    function add(path, count = 0) {
        if (!folders.has(path)) folders.set(path, { path, count: 0 });
        folders.get(path).count += count;
    }

    docs.forEach(doc => {
        const company = doc.company_name || (selectedCompany ? selectedCompany.name : 'Sans société');
        const typeRoot = doc.doc_type === 'releve' ? 'Relevés' : doc.doc_type === 'rib' ? 'RIB' : 'Documents';
        const rawDate = `${doc.detected_date || ''} ${doc.added_at || ''} ${doc.folder_path || ''}`;
        const year = (rawDate.match(/20\d{2}/) || ['Sans année'])[0];
        const monthMatch = rawDate.match(/(?:^|[\/\-\s])(\d{2})(?:[\/\-\s]|$)/);
        const month = monthMatch ? monthMatch[1] : 'Sans mois';
        const account = doc.folder_path && doc.folder_path.includes('/Relevés/')
            ? (doc.folder_path.split('/')[3] || 'Compte')
            : 'Compte';

        add(company, 0);
        add(`${company}/Relevés`, 0);
        add(`${company}/Documents`, 0);
        add(`${company}/RIB`, 0);

        let folder;
        if (doc.folder_path) {
            folder = doc.folder_path;
        } else if (doc.doc_type === 'releve') {
            folder = `${company}/Relevés/${year}/${account}/${month}`;
        } else if (doc.doc_type === 'rib') {
            folder = `${company}/RIB`;
        } else {
            folder = `${company}/Documents/${year}/${month}`;
        }

        const parts = folder.split('/').filter(Boolean);
        for (let i = 1; i <= parts.length; i++) add(parts.slice(0, i).join('/'), i === parts.length ? 1 : 0);
    });

    return [...folders.values()].sort((a, b) => a.path.localeCompare(b.path, 'fr'));
}

function renderDocumentTreeV033(docs) {
    const tree = document.getElementById('documentTreeV033');
    if (!tree) return;
    tree.innerHTML = '';

    const folders = buildVirtualFoldersV033(docs);

    const allButton = document.createElement('button');
    allButton.className = selectedDocumentFolderV033 ? '' : 'active';
    allButton.textContent = `📁 Tous les documents (${docs.length})`;
    allButton.addEventListener('click', async () => {
        selectedDocumentFolderV033 = '';
        await renderDocumentFolderV033();
    });
    tree.appendChild(allButton);

    folders.forEach(folder => {
        const depth = Math.max(0, folder.path.split('/').length - 1);
        const button = document.createElement('button');
        button.className = selectedDocumentFolderV033 === folder.path ? 'active' : '';
        button.style.paddingLeft = `${12 + depth * 16}px`;
        button.textContent = `${depth === 0 ? '📁' : '↳ 📁'} ${folder.path.split('/').pop()} ${folder.count ? `(${folder.count})` : ''}`;
        button.title = folder.path;
        button.addEventListener('click', async () => {
            selectedDocumentFolderV033 = folder.path;
            await renderDocumentFolderV033();
        });
        tree.appendChild(button);
    });
}

function getDocFolderV033(doc) {
    if (doc.folder_path) return doc.folder_path;
    const company = doc.company_name || (selectedCompany ? selectedCompany.name : 'Sans société');
    const rawDate = `${doc.detected_date || ''} ${doc.added_at || ''}`;
    const year = (rawDate.match(/20\d{2}/) || ['Sans année'])[0];
    const monthMatch = rawDate.match(/(?:^|[\/\-\s])(\d{2})(?:[\/\-\s]|$)/);
    const month = monthMatch ? monthMatch[1] : 'Sans mois';

    if (doc.doc_type === 'releve') return `${company}/Relevés/${year}/Compte/${month}`;
    if (doc.doc_type === 'rib') return `${company}/RIB`;
    return `${company}/Documents/${year}/${month}`;
}

function renderDocumentTableV033(container, docs) {
    if (!container) return;
    container.innerHTML = '';

    if (!docs.length) {
        container.innerHTML = '<div class="empty-state">Aucun fichier dans ce dossier.</div>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'documents-table-v033';
    table.innerHTML = `
        <thead>
            <tr>
                <th></th>
                <th>Nom</th>
                <th>Type</th>
                <th>Date</th>
                <th>Taille</th>
                <th>Origine</th>
                <th></th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const body = table.querySelector('tbody');

    docs.forEach(doc => {
        const tr = document.createElement('tr');
        tr.className = 'document-row-v033';
        tr.dataset.documentId = doc.id;
        tr.innerHTML = `
            <td><input type="checkbox"></td>
            <td><span class="file-icon-v033">${docTypeIconV033(doc.doc_type)}</span> <strong>${doc.filename}</strong></td>
            <td>${docTypeLabelV033(doc.doc_type)}</td>
            <td>${doc.detected_date || (doc.added_at || '').slice(0, 10)}</td>
            <td>${doc.file_size || '—'}</td>
            <td>${doc.source_type === 'statement' || doc.doc_type === 'releve' ? 'Import relevé' : 'Import manuel'}</td>
            <td class="more-cell-v033">•••</td>
        `;
        tr.addEventListener('click', event => {
            if (event.target.tagName === 'INPUT') return;
            selectedDocumentV033 = doc;
            document.querySelectorAll('.document-row-v033').forEach(row => row.classList.remove('selected'));
            tr.classList.add('selected');
            renderDocumentPreviewV033(doc);
        });
        body.appendChild(tr);
    });

    container.appendChild(table);
}

async function renderDocumentFolderV033() {
    const docs = selectedDocumentRowsV033;
    const filtered = selectedDocumentFolderV033
        ? docs.filter(doc => getDocFolderV033(doc) === selectedDocumentFolderV033 || getDocFolderV033(doc).startsWith(`${selectedDocumentFolderV033}/`))
        : docs;

    const breadcrumb = document.getElementById('documentBreadcrumbV033');
    if (breadcrumb) breadcrumb.textContent = selectedDocumentFolderV033 || 'Tous les documents';

    renderDocumentTableV033(document.getElementById('documentFolderFilesV033'), filtered);
    renderDocumentTreeV033(docs);
}

function renderDocumentPreviewV033(doc) {
    const title = document.getElementById('documentPreviewTitleV033');
    const preview = document.getElementById('documentPreviewV033');
    if (!preview) return;

    if (!doc) {
        if (title) title.textContent = 'Aperçu';
        preview.className = 'document-preview-v033 empty-state';
        preview.textContent = 'Sélectionne un document.';
        return;
    }

    if (title) title.textContent = doc.filename;
    preview.className = 'document-preview-v033';

    const safePath = String(doc.filepath || '').replace(/\\/g, '/');
    const lower = String(doc.filename || '').toLowerCase();

    let visual = `<div class="pdf-placeholder-v033">📄<br>${doc.filename}<br><span>Utilise “Ouvrir” pour consulter le fichier.</span></div>`;
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
        visual = `<img src="file:///${safePath}" alt="${doc.filename}">`;
    } else if (lower.endsWith('.pdf')) {
        visual = `<div class="pdf-placeholder-v033">📄 PDF<br>${doc.filename}<br><span>Aperçu PDF intégré à finaliser ensuite.</span></div>`;
    }

    preview.innerHTML = `
        <div class="document-preview-actions-v033">
            <button id="previewOpenV033">Ouvrir</button>
            <button id="previewRenameV033">Renommer</button>
            <button id="previewMoveV033">Déplacer</button>
        </div>
        ${visual}
        <div class="document-info-v033">
            <strong>Informations</strong>
            <span>Type : ${docTypeLabelV033(doc.doc_type)}</span>
            <span>Dossier : ${getDocFolderV033(doc)}</span>
            <span>Date : ${doc.detected_date || 'Non détectée'}</span>
            <span>Montant : ${doc.detected_amount ? formatAmount(doc.detected_amount) : '—'}</span>
            <span>Fournisseur : ${doc.detected_supplier || '—'}</span>
            <span>Référence : ${doc.detected_reference || '—'}</span>
            <span>Lié à : ${doc.transaction_label || 'Aucune opération'}</span>
        </div>
    `;

    document.getElementById('previewOpenV033')?.addEventListener('click', async () => await window.api.openFile(doc.filepath));
    document.getElementById('previewRenameV033')?.addEventListener('click', async () => await renameDocumentV033(doc));
    document.getElementById('previewMoveV033')?.addEventListener('click', async () => await moveDocumentV033(doc));
}

async function renameDocumentV033(doc) {
    const name = prompt('Nouveau nom du document', doc.filename);
    if (!name || name === doc.filename) return;
    await window.api.renameDocument({ documentId: doc.id, newFilename: name });
    await loadDocuments();
}

async function moveDocumentV033(doc) {
    const folder = prompt('Nouveau dossier logique', getDocFolderV033(doc));
    if (!folder) return;
    if (window.api.moveDocumentFolder) {
        await window.api.moveDocumentFolder({ documentId: doc.id, folderPath: folder });
    } else if (window.api.moveDocument) {
        await window.api.moveDocument({ documentId: doc.id, folderPath: folder });
    }
    selectedDocumentFolderV033 = folder;
    await loadDocuments();
}

async function deleteDocumentV033(doc) {
    if (!doc) return;
    if (!confirm(`Supprimer ce document ?\n${doc.filename}`)) return;

    const linkedTransactionId = doc.linked_transaction_id;
    await window.api.deleteDocument(doc.id);

    selectedDocumentV033 = null;
    await loadDocuments();

    if (typeof refreshAccountView === 'function' && selectedBankAccount) {
        await refreshAccountView(false);
    }
    if (typeof loadMatchingPage === 'function') {
        await loadMatchingPage();
    }
}

async function changeDocumentTypeV033(doc) {
    if (!doc) return;
    const type = prompt('Type : facture, avoir, releve, contrat, rib, divers', doc.doc_type || 'facture');
    if (!type) return;
    await window.api.updateDocumentType({ documentId: doc.id, docType: type });
    await loadDocuments();
}

async function loadDocuments() {
    const docs = await fetchDocumentsV033();
    selectedDocumentRowsV033 = docs;
    updateDocumentKpisV033(docs);
    updateYearFilterV033(docs);
    renderDocumentTreeV033(docs);
    await renderDocumentFolderV033();
    if (selectedDocumentV033) {
        const refreshed = docs.find(doc => doc.id === selectedDocumentV033.id);
        renderDocumentPreviewV033(refreshed || null);
    } else {
        renderDocumentPreviewV033(null);
    }
}


async function showManualDocumentLink(documentId, filename = '') {
    selectedDocumentId = documentId;
    const target = document.getElementById('documentMatchList');
    const help = document.getElementById('documentMatchHelp');
    if (!target) return;
    target.innerHTML = '';

    if (!selectedCompany) {
        if (help) help.textContent = 'Sélectionne une société pour associer ce document.';
        return;
    }

    if (help) help.textContent = `Association manuelle : ${filename}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'manual-link-box-v023';
    wrapper.innerHTML = `
        <label>Rechercher une opération</label>
        <div class="manual-link-search-row">
            <input id="manualOperationSearchV023" type="text" placeholder="Libellé, montant, fournisseur, date...">
            <button id="manualOperationSearchButtonV023">Rechercher</button>
        </div>
        <div id="manualOperationResultsV023" class="document-match-list"></div>
    `;
    target.appendChild(wrapper);

    const input = wrapper.querySelector('#manualOperationSearchV023');
    const button = wrapper.querySelector('#manualOperationSearchButtonV023');
    const results = wrapper.querySelector('#manualOperationResultsV023');

    async function runSearch() {
        const query = input.value.trim();
        results.innerHTML = '<div class="empty-state">Recherche...</div>';

        const rows = await window.api.searchTransactionsForDocument({
            companyId: selectedCompany.id,
            query,
            limit: 30
        });

        results.innerHTML = '';
        if (!rows || rows.length === 0) {
            results.innerHTML = '<div class="empty-state">Aucune opération trouvée.</div>';
            return;
        }

        rows.forEach(row => {
            const card = document.createElement('article');
            card.className = 'match-card manual-match-card-v023';
            card.innerHTML = `
                <strong>${row.date_operation || ''} — ${row.label}</strong>
                <span>${formatAmount(row.amount)} · ${row.category || 'Non catégorisé'} · ${row.receipts_count || 0} PJ</span>
                <button>Associer</button>
            `;
            card.querySelector('button').addEventListener('click', async () => {
                await window.api.linkDocumentToTransaction({ documentId, transactionId: row.id });
                await loadDocuments();
                await showDocumentMatches(documentId);
                if (selectedBankAccount) await refreshAccountView(false);
            });
            results.appendChild(card);
        });
    }

    button.addEventListener('click', runSearch);
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') runSearch();
    });

    input.value = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
    await runSearch();
}

async function showDocumentMatches(documentId) {
    selectedDocumentId = documentId;
    const target = document.getElementById('documentMatchList');
    const help = document.getElementById('documentMatchHelp');
    if (!target) return;
    target.innerHTML = '';
    if (!selectedCompany) {
        help.textContent = 'Sélectionne une société pour obtenir des suggestions.';
        return;
    }
    const matches = await window.api.findDocumentMatches({ companyId: selectedCompany.id, documentId, limit: 8 });
    help.textContent = matches.length ? 'Suggestions triées par pertinence.' : 'Aucune suggestion trouvée.';
    matches.forEach(match => {
        const card = document.createElement('article');
        card.className = 'match-card';
        card.innerHTML = `
            <strong>${match.date_operation || ''} — ${match.label}</strong>
            <span>${formatAmount(match.amount)} · score ${match.match_score}</span>
            <button>Associer</button>
        `;
        card.querySelector('button').addEventListener('click', async () => {
            await window.api.linkDocumentToTransaction({ documentId, transactionId: match.id });
            await loadDocuments();
            await showDocumentMatches(documentId);
            if (selectedBankAccount) await refreshAccountView(false);
        });
        target.appendChild(card);
    });
}


function documentTypeLabelV030(type) {
    const labels = {
        facture: '🧾 Facture',
        releve: '📄 Relevé',
        contrat: '📑 Contrat',
        rib: '🏦 RIB',
        divers: '📁 Divers'
    };
    return labels[type] || labels.facture;
}

async function loadMatchingPage() {
    const list = document.getElementById('matchingDocumentList');
    const suggestions = document.getElementById('matchingSuggestionList');
    const preview = document.getElementById('matchingPreview');
    const help = document.getElementById('matchingHelp');

    if (!list) return;

    list.innerHTML = '';
    if (suggestions) suggestions.innerHTML = '';
    if (preview) preview.innerHTML = 'Aucun document sélectionné.';
    if (help) help.textContent = 'Sélectionne un document à gauche.';

    const docs = await window.api.getDocuments({
        companyId: selectedCompany ? selectedCompany.id : null,
        filters: { status: 'unmatched' }
    });

    if (!docs.length) {
        list.innerHTML = '<div class="empty-state">Aucun document à rapprocher.</div>';
        return;
    }

    docs.forEach(doc => {
        const item = document.createElement('article');
        item.className = 'document-card matching-doc-v030';
        item.innerHTML = `
            <strong>${doc.filename}</strong>
            <span>${documentTypeLabelV030(doc.doc_type || 'facture')}</span>
            <span>${doc.detected_amount ? formatAmount(doc.detected_amount) : 'Montant non détecté'}</span>
            ${doc.detected_supplier ? `<small>${doc.detected_supplier}</small>` : ''}
        `;
        item.addEventListener('click', async () => {
            document.querySelectorAll('.matching-doc-v030').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            await showMatchingSuggestions(doc);
        });
        list.appendChild(item);
    });
}

async function showMatchingSuggestions(doc) {
    const suggestions = document.getElementById('matchingSuggestionList');
    const preview = document.getElementById('matchingPreview');
    const help = document.getElementById('matchingHelp');

    if (help) help.textContent = `Suggestions pour ${doc.filename}`;
    if (preview) {
        preview.innerHTML = `
            <strong>${doc.filename}</strong>
            <p>${documentTypeLabelV030(doc.doc_type || 'facture')}</p>
            <p>Montant : ${doc.detected_amount ? formatAmount(doc.detected_amount) : 'Non détecté'}</p>
            <p>Date : ${doc.detected_date || 'Non détectée'}</p>
            <p>Référence : ${doc.detected_reference || 'Non détectée'}</p>
            <p>Fournisseur : ${doc.detected_supplier || 'Non détecté'}</p>
            <button id="openMatchingDocV030">Ouvrir le document</button>
        `;
        const open = document.getElementById('openMatchingDocV030');
        if (open) open.addEventListener('click', async () => await window.api.openFile(doc.filepath));
    }

    if (!suggestions) return;
    suggestions.innerHTML = '<div class="empty-state">Recherche des suggestions...</div>';

    if (!selectedCompany) {
        suggestions.innerHTML = '<div class="empty-state">Sélectionne une société.</div>';
        return;
    }

    const matches = await window.api.findDocumentMatches({
        companyId: selectedCompany.id,
        documentId: doc.id,
        limit: 10
    });

    suggestions.innerHTML = '';
    if (!matches.length) {
        suggestions.innerHTML = '<div class="empty-state">Aucune suggestion. Utilise l’onglet Documents pour l’association manuelle.</div>';
        return;
    }

    matches.forEach(match => {
        const card = document.createElement('article');
        card.className = 'match-card';
        card.innerHTML = `
            <strong>${match.date_operation || ''} — ${match.label}</strong>
            <span>${formatAmount(match.amount)} · score ${match.match_score}</span>
            <button>Associer</button>
        `;
        card.querySelector('button').addEventListener('click', async () => {
            await window.api.linkDocumentToTransaction({ documentId: doc.id, transactionId: match.id });
            if (selectedBankAccount) await refreshAccountView(false);
            await loadMatchingPage();
            await loadDocuments();
        });
        suggestions.appendChild(card);
    });
}


async function loadThirdParties() {
    const list = document.getElementById('thirdPartiesList');
    const summary = document.getElementById('thirdPartiesSummary');
    if (!list) return;

    list.innerHTML = '';
    if (!selectedCompany) {
        if (summary) summary.textContent = 'Sélectionne une société.';
        return;
    }

    await window.api.backfillThirdParties({ companyId: selectedCompany.id });
    await window.api.cleanupThirdParties({ companyId: selectedCompany.id });

    const tiers = await window.api.getThirdParties({ companyId: selectedCompany.id });

    if (summary) {
        summary.textContent = `${tiers.length} tiers détecté(s), doublons nettoyés automatiquement.`;
    }

    if (!tiers.length) {
        list.innerHTML = '<div class="empty-state">Aucun tiers détecté.</div>';
        return;
    }

    tiers.forEach(third => {
        const card = document.createElement('article');
        card.className = 'third-party-card-v030';
        card.innerHTML = `
            <strong>${third.name}</strong>
            <span>${third.type || 'autre'} · ${third.operations_count || 0} opération(s)</span>
            <div class="third-party-amounts-v030">
                <span>Débits : ${formatAmount(-Math.abs(third.debit_total || 0))}</span>
                <span>Crédits : ${formatAmount(third.credit_total || 0)}</span>
                <span>Solde : ${formatAmount(third.balance || 0)}</span>
            </div>
            <div class="button-row">
                <button class="edit-third">Modifier</button>
            </div>
        `;
        card.querySelector('.edit-third').addEventListener('click', async () => {
            const name = prompt('Nom du tiers', third.name);
            if (!name) return;
            const type = prompt('Type : fournisseur, client, banque, organisme, assurance, autre', third.type || 'autre') || third.type || 'autre';
            await window.api.updateThirdParty({ thirdPartyId: third.id, name, type });
            await loadThirdParties();
            if (selectedBankAccount) await refreshAccountView(false);
        });
        list.appendChild(card);
    });
}


const importDocumentsButton = document.getElementById('importDocuments');
if (importDocumentsButton) {
    importDocumentsButton.addEventListener('click', async () => {
        const files = await window.api.selectDocuments();
        if (!files || files.length === 0) return;

        const result = await window.api.addDocuments({
            companyId: selectedCompany ? selectedCompany.id : null,
            companyName: selectedCompany ? selectedCompany.name : 'Société inconnue',
            docType: 'facture',
            files
        });

        let message = `${result.addedCount || 0} document(s) ajouté(s).`;
        if (result.duplicateCount) {
            message += `\n${result.duplicateCount} doublon(s) détecté(s) et non réimporté(s).`;
            if (result.duplicates && result.duplicates.length) {
                message += `\n\nDéjà présents :\n` + result.duplicates.map(d => `- ${d.incoming} → ${d.existingFilename}`).join('\n');
            }
        }
        alert(message);
        await loadDocuments();
    });
}

['documentSearch', 'documentTypeFilter', 'documentYearFilterV033'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', loadDocuments);
    if (el) el.addEventListener('change', loadDocuments);
});

const addCategoryRuleButton = document.getElementById('addCategoryRule');
if (addCategoryRuleButton) {
    addCategoryRuleButton.addEventListener('click', async () => {
        const keyword = document.getElementById('categoryKeyword').value.trim();
        const category = document.getElementById('categoryName').value.trim();
        if (!keyword || !category) return;
        await window.api.addCategoryRule({ keyword, category });
        document.getElementById('categoryKeyword').value = '';
        document.getElementById('categoryName').value = '';
        await loadCategoryOptions();
    });
}

loadCategoryOptions();


const closeDetailButton = document.getElementById('closeDetailPanel');
if (closeDetailButton) {
    closeDetailButton.addEventListener('click', () => {
        document.getElementById('detailPanel')?.classList.remove('open');
    });
}

loadCompanies();


/* ===========================
   Focus Compta V0.22 UX layer
   Sidebar compacte + tiroir détail + tableau compact
   =========================== */

(function initFocusComptaV022UX() {
    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    ready(() => {
        document.body.classList.add('v022');

        const sidebar = document.querySelector('.sidebar, aside, nav');
        if (sidebar && !document.getElementById('sidebarToggleV022')) {
            sidebar.classList.add('focus-sidebar');

            const toggle = document.createElement('button');
            toggle.id = 'sidebarToggleV022';
            toggle.className = 'sidebar-toggle-v022';
            toggle.type = 'button';
            toggle.title = 'Réduire / déployer le menu';
            toggle.textContent = '☰';

            sidebar.prepend(toggle);

            const stored = localStorage.getItem('focus_sidebar_collapsed');
            if (stored === '1') document.body.classList.add('sidebar-collapsed');

            toggle.addEventListener('click', () => {
                document.body.classList.toggle('sidebar-collapsed');
                localStorage.setItem(
                    'focus_sidebar_collapsed',
                    document.body.classList.contains('sidebar-collapsed') ? '1' : '0'
                );
            });
        }

        // Convertit la zone détail opération en tiroir si elle existe.
        const detailCandidates = Array.from(document.querySelectorAll('section, aside, div'))
            .filter(el => /détail opération|detail opération|detail operation/i.test(el.textContent || ''));

        const detail = detailCandidates.find(el => {
            const title = el.querySelector('h1,h2,h3');
            return title && /détail opération|detail opération|detail operation/i.test(title.textContent || '');
        }) || document.getElementById('operationDetail') || document.querySelector('.operation-detail, .detail-panel');

        if (detail) {
            detail.classList.add('operation-detail-drawer-v022');
            if (!detail.querySelector('.drawer-close-v022')) {
                const close = document.createElement('button');
                close.className = 'drawer-close-v022';
                close.type = 'button';
                close.textContent = '×';
                close.title = 'Fermer le détail';
                close.addEventListener('click', () => detail.classList.remove('open'));
                detail.prepend(close);
            }
        }

        // Ouvre le tiroir au clic sur une ligne opération.
        document.addEventListener('click', (event) => {
            const row = event.target.closest('tr, .transaction-row, .operation-row');
            if (!row) return;
            if (!/montant|catégorie|statut|justif|relevé|libellé/i.test(row.textContent || '')) return;
            if (detail) detail.classList.add('open');
        });

        // Compactage de l’affichage des tableaux d’opérations.
        document.querySelectorAll('table').forEach(table => {
            if (/libellé|montant|catégorie|statut/i.test(table.textContent || '')) {
                table.classList.add('operations-table-v022');
                const wrapper = table.parentElement;
                if (wrapper) wrapper.classList.add('table-scroll-v022');
            }
        });

        // Ajoute une entrée Documents si absente.
        if (sidebar && !/Documents/i.test(sidebar.textContent || '')) {
            const docs = document.createElement('button');
            docs.className = 'nav-item nav-documents-v022';
            docs.type = 'button';
            docs.title = 'Documents';
            docs.innerHTML = '<span class="nav-icon">📂</span><span class="nav-label">Documents</span>';
            docs.addEventListener('click', () => {
                const existing = document.getElementById('documentsPageV022');
                if (existing) {
                    existing.scrollIntoView({ behavior: 'smooth' });
                    return;
                }
                const main = document.querySelector('main, .main, .content, #app') || document.body;
                const page = document.createElement('section');
                page.id = 'documentsPageV022';
                page.className = 'placeholder-card-v022';
                page.innerHTML = `
                    <h2>Documents</h2>
                    <p>Module prêt pour la prochaine étape : import multi-factures, documents à rapprocher, rapprochés et orphelins.</p>
                    <div class="placeholder-grid-v022">
                        <div><strong>À rapprocher</strong><br>Factures en attente de règlement associé.</div>
                        <div><strong>Rapprochés</strong><br>Documents déjà liés à une opération.</div>
                        <div><strong>Orphelins</strong><br>Documents sans suggestion fiable.</div>
                    </div>
                `;
                main.prepend(page);
            });
            sidebar.appendChild(docs);
        }

        // Icônes compactes pour les entêtes longs si possible.
        document.querySelectorAll('th').forEach(th => {
            const t = th.textContent.trim().toLowerCase();
            if (t === 'justifs' || t === 'justificatifs') th.textContent = '📎';
            if (t === 'relevé' || t === 'releve') th.textContent = '📄';
        });
    });
})();

const matchingRefreshButton = document.getElementById('matchingRefresh');
if (matchingRefreshButton) matchingRefreshButton.addEventListener('click', loadMatchingPage);

const refreshThirdPartiesButton = document.getElementById('refreshThirdParties');
if (refreshThirdPartiesButton) refreshThirdPartiesButton.addEventListener('click', loadThirdParties);


// V0.31 - multisélection : cocher/décocher toutes les lignes visibles
(function selectAllTransactionsV031() {
    const bind = () => {
        const selectAll = document.getElementById('selectAllTransactions');
        if (!selectAll || selectAll.dataset.v031Bound) return;
        selectAll.dataset.v031Bound = '1';

        selectAll.addEventListener('change', () => {
            document.querySelectorAll('.transaction-check').forEach(check => {
                check.checked = selectAll.checked;
                const id = Number(check.dataset.transactionId);
                if (selectAll.checked) selectedTransactionIds.add(id);
                else selectedTransactionIds.delete(id);
            });
            updateBulkToolbar();
        });
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();


async function loadAutomationRulesV031() {
    const list = document.getElementById('automationRulesListV031');
    if (!list) return;
    const rules = await window.api.getAutomationRules({ companyId: selectedCompany ? selectedCompany.id : null });
    list.innerHTML = '';
    if (!rules.length) {
        list.innerHTML = '<li>Aucune règle.</li>';
        return;
    }
    rules.forEach(rule => {
        const li = document.createElement('li');
        li.innerHTML = `<span>Si ${rule.target} contient <strong>${rule.keyword}</strong></span><strong>${rule.category || ''} ${rule.status || ''}</strong><button>Supprimer</button>`;
        li.querySelector('button').addEventListener('click', async () => {
            await window.api.deleteAutomationRule(rule.id);
            await loadAutomationRulesV031();
        });
        list.appendChild(li);
    });
}

(function automationRulesUiV031() {
    const bind = () => {
        const add = document.getElementById('addAutomationRuleV031');
        const apply = document.getElementById('applyAutomationRulesV031');
        if (add && !add.dataset.bound) {
            add.dataset.bound = '1';
            add.addEventListener('click', async () => {
                const keyword = document.getElementById('automationKeywordV031').value.trim();
                const category = document.getElementById('automationCategoryV031').value.trim();
                const status = document.getElementById('automationStatusV031').value;
                if (!keyword) return;
                await window.api.createAutomationRule({
                    companyId: selectedCompany ? selectedCompany.id : null,
                    target: 'account_name',
                    keyword,
                    category,
                    status,
                    thirdPartyName: ''
                });
                document.getElementById('automationKeywordV031').value = '';
                document.getElementById('automationCategoryV031').value = '';
                await loadAutomationRulesV031();
            });
        }
        if (apply && !apply.dataset.bound) {
            apply.dataset.bound = '1';
            apply.addEventListener('click', async () => {
                const changed = await window.api.applyAutomationRules({ companyId: selectedCompany ? selectedCompany.id : null });
                alert(`${changed} mise(s) à jour appliquée(s).`);
                if (selectedBankAccount) await refreshAccountView(false);
            });
        }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();


// V0.33 - Documents mini Dropbox controls
(function documentActionsV033() {
    function bind() {
        const refresh = document.getElementById('refreshDocumentTreeV033');
        if (refresh && !refresh.dataset.boundV033) {
            refresh.dataset.boundV033 = '1';
            refresh.addEventListener('click', loadDocuments);
        }

        const newFolder = document.getElementById('newDocumentFolderV033');
        if (newFolder && !newFolder.dataset.boundV033) {
            newFolder.dataset.boundV033 = '1';
            newFolder.addEventListener('click', async () => {
                const folder = prompt('Nom du nouveau dossier logique', selectedDocumentFolderV033 || (selectedCompany ? selectedCompany.name : 'Nouveau dossier'));
                if (!folder) return;
                selectedDocumentFolderV033 = folder;
                await renderDocumentFolderV033();
            });
        }

        const openBtn = document.getElementById('openSelectedDocumentV033');
        if (openBtn && !openBtn.dataset.boundV033) {
            openBtn.dataset.boundV033 = '1';
            openBtn.addEventListener('click', async () => {
                if (!selectedDocumentV033) return alert('Sélectionne un document.');
                await window.api.openFile(selectedDocumentV033.filepath);
            });
        }

        const previewBtn = document.getElementById('previewSelectedDocumentV033');
        if (previewBtn && !previewBtn.dataset.boundV033) {
            previewBtn.dataset.boundV033 = '1';
            previewBtn.addEventListener('click', () => renderDocumentPreviewV033(selectedDocumentV033));
        }

        const renameBtn = document.getElementById('renameSelectedDocumentV033');
        if (renameBtn && !renameBtn.dataset.boundV033) {
            renameBtn.dataset.boundV033 = '1';
            renameBtn.addEventListener('click', async () => {
                if (!selectedDocumentV033) return alert('Sélectionne un document.');
                await renameDocumentV033(selectedDocumentV033);
            });
        }

        const moveBtn = document.getElementById('moveSelectedDocumentV033');
        if (moveBtn && !moveBtn.dataset.boundV033) {
            moveBtn.dataset.boundV033 = '1';
            moveBtn.addEventListener('click', async () => {
                if (!selectedDocumentV033) return alert('Sélectionne un document.');
                await moveDocumentV033(selectedDocumentV033);
            });
        }

        const downloadBtn = document.getElementById('downloadSelectedDocumentV033');
        if (downloadBtn && !downloadBtn.dataset.boundV033) {
            downloadBtn.dataset.boundV033 = '1';
            downloadBtn.addEventListener('click', async () => {
                if (!selectedDocumentV033) return alert('Sélectionne un document.');
                await window.api.openFile(selectedDocumentV033.filepath);
            });
        }

        const deleteBtn = document.getElementById('deleteSelectedDocumentV033');
        if (deleteBtn && !deleteBtn.dataset.boundV033) {
            deleteBtn.dataset.boundV033 = '1';
            deleteBtn.addEventListener('click', async () => {
                if (!selectedDocumentV033) return alert('Sélectionne un document.');
                await deleteDocumentV033(selectedDocumentV033);
            });
        }

        const closePreview = document.getElementById('closeDocumentPreviewV033');
        if (closePreview && !closePreview.dataset.boundV033) {
            closePreview.dataset.boundV033 = '1';
            closePreview.addEventListener('click', () => {
                selectedDocumentV033 = null;
                renderDocumentPreviewV033(null);
            });
        }

        document.querySelectorAll('.document-preview-tabs-v033 button').forEach(button => {
            if (button.dataset.boundV033) return;
            button.dataset.boundV033 = '1';
            button.addEventListener('click', () => {
                document.querySelectorAll('.document-preview-tabs-v033 button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                renderDocumentPreviewV033(selectedDocumentV033);
            });
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();


// ===========================
// Focus Compta V0.34 - GED améliorée
// ===========================

function getDocFolderV033(doc) {
    if (doc.folder_path) return doc.folder_path;

    const company = doc.company_name || (selectedCompany ? selectedCompany.name : 'Non classés');
    const rawDate = `${doc.detected_date || ''} ${doc.added_at || ''}`;
    const year = (rawDate.match(/20\d{2}/) || ['Sans année'])[0];
    const monthMatch = rawDate.match(/(?:^|[\/\-\s])(\d{2})(?:[\/\-\s]|$)/);
    const month = monthMatch ? monthMatch[1] : 'Sans mois';

    if (!doc.company_id) return 'Non classés';
    if (doc.doc_type === 'releve') return `${company}/Relevés/${year}/Compte/${month}`;
    if (doc.doc_type === 'rib') return `${company}/RIB`;
    return `${company}/Documents/${year}/${month}`;
}

function buildVirtualFoldersV033(docs) {
    const folders = new Map();

    function add(path, count = 0, system = false) {
        if (!folders.has(path)) folders.set(path, { path, count: 0, system });
        folders.get(path).count += count;
    }

    const companies = [...new Set(docs.map(doc => doc.company_name || (doc.company_id ? 'Société' : null)).filter(Boolean))].sort();
    companies.forEach(company => {
        add(company, 0);
        add(`${company}/Documents`, 0);
        add(`${company}/Relevés`, 0);
        add(`${company}/RIB`, 0);
    });

    add('Non classés', docs.filter(doc => !doc.company_id || !doc.folder_path).length, true);
    add('Corbeille', 0, true);

    docs.forEach(doc => {
        const folder = getDocFolderV033(doc);
        const parts = folder.split('/').filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
            const path = parts.slice(0, i).join('/');
            add(path, i === parts.length ? 1 : 0);
        }
    });

    const orderScore = (folder) => {
        if (folder.path === 'Non classés') return 900000;
        if (folder.path === 'Corbeille') return 900001;
        return folder.path.split('/').length * 1000 + folder.path.localeCompare('', 'fr');
    };

    return [...folders.values()].sort((a, b) => {
        const aRoot = a.path.split('/')[0];
        const bRoot = b.path.split('/')[0];
        if (aRoot !== bRoot) return aRoot.localeCompare(bRoot, 'fr');
        return orderScore(a) - orderScore(b);
    });
}

function renderDocumentTreeV033(docs) {
    const tree = document.getElementById('documentTreeV033');
    if (!tree) return;
    tree.innerHTML = '';

    const allButton = document.createElement('button');
    allButton.className = selectedDocumentFolderV033 ? '' : 'active';
    allButton.textContent = `📁 Tous les documents (${docs.length})`;
    allButton.addEventListener('click', async () => {
        selectedDocumentFolderV033 = '';
        await renderDocumentFolderV033();
    });
    tree.appendChild(allButton);

    buildVirtualFoldersV033(docs).forEach(folder => {
        const depth = Math.max(0, folder.path.split('/').length - 1);
        const leaf = folder.path.split('/').pop();
        const button = document.createElement('button');
        button.className = selectedDocumentFolderV033 === folder.path ? 'active' : '';
        button.style.paddingLeft = `${12 + depth * 18}px`;
        const icon = folder.path === 'Corbeille' ? '🗑' : folder.path === 'Non classés' ? '📥' : depth === 0 ? '📁' : leaf === 'RIB' ? '🏦' : leaf === 'Relevés' ? '📄' : '📂';
        button.textContent = `${icon} ${leaf}${folder.count ? ` (${folder.count})` : ''}`;
        button.title = folder.path;
        button.addEventListener('click', async () => {
            selectedDocumentFolderV033 = folder.path;
            await renderDocumentFolderV033();
        });
        tree.appendChild(button);
    });
}

function renderDocumentTableV033(container, docs) {
    if (!container) return;
    container.innerHTML = '';

    if (!docs.length) {
        container.innerHTML = '<div class="empty-state">Aucun fichier dans ce dossier.</div>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'documents-table-v033';
    table.innerHTML = `
        <thead>
            <tr>
                <th></th>
                <th>Nom</th>
                <th>Société</th>
                <th>Dossier</th>
                <th>Type</th>
                <th>Date</th>
                <th>Origine</th>
                <th>Statut</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const body = table.querySelector('tbody');

    docs.forEach(doc => {
        const tr = document.createElement('tr');
        tr.className = 'document-row-v033';
        tr.dataset.documentId = doc.id;
        tr.draggable = true;
        tr.innerHTML = `
            <td><input type="checkbox"></td>
            <td><span class="file-icon-v033">${docTypeIconV033(doc.doc_type)}</span> <strong>${doc.filename}</strong></td>
            <td>${doc.company_name || 'Non classé'}</td>
            <td><small>${getDocFolderV033(doc)}</small></td>
            <td>${docTypeLabelV033(doc.doc_type)}</td>
            <td>${doc.detected_date || (doc.added_at || '').slice(0, 10)}</td>
            <td>${doc.source_type === 'statement' || doc.doc_type === 'releve' ? 'Import relevé' : 'Import manuel'}</td>
            <td>${doc.status === 'matched' ? '✅ Rapproché' : '🟡 Non rapproché'}</td>
        `;

        tr.addEventListener('dragstart', event => {
            event.dataTransfer.setData('text/plain', String(doc.id));
        });

        tr.addEventListener('click', event => {
            if (event.target.tagName === 'INPUT') return;
            selectedDocumentV033 = doc;
            document.querySelectorAll('.document-row-v033').forEach(row => row.classList.remove('selected'));
            tr.classList.add('selected');
            renderDocumentPreviewV033(doc);
        });

        body.appendChild(tr);
    });

    container.appendChild(table);
}

function renderDocumentPreviewV033(doc) {
    const title = document.getElementById('documentPreviewTitleV033');
    const preview = document.getElementById('documentPreviewV033');
    if (!preview) return;

    if (!doc) {
        if (title) title.textContent = 'Aperçu';
        preview.className = 'document-preview-v033 empty-state';
        preview.textContent = 'Sélectionne un document.';
        return;
    }

    if (title) title.textContent = doc.filename;
    preview.className = 'document-preview-v033';

    const safePath = String(doc.filepath || '').replace(/\\/g, '/');
    const lower = String(doc.filename || '').toLowerCase();

    let visual = `<div class="pdf-placeholder-v033">📄<br>${doc.filename}<br><span>Utilise “Ouvrir” pour consulter le fichier.</span></div>`;
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
        visual = `<img src="file:///${safePath}" alt="${doc.filename}">`;
    } else if (lower.endsWith('.pdf')) {
        visual = `<iframe class="pdf-frame-v034" src="file:///${safePath}"></iframe>`;
    }

    preview.innerHTML = `
        <div class="document-preview-actions-v033">
            <button id="previewOpenV033">Ouvrir</button>
            <button id="previewRenameV033">Renommer</button>
            <button id="previewMoveV033">Déplacer</button>
        </div>
        ${visual}
        <div class="document-info-v033">
            <strong>Informations</strong>
            <span>Type : ${docTypeLabelV033(doc.doc_type)}</span>
            <span>Société : ${doc.company_name || 'Non classé'}</span>
            <span>Dossier : ${getDocFolderV033(doc)}</span>
            <span>Date : ${doc.detected_date || 'Non détectée'}</span>
            <span>Montant : ${doc.detected_amount ? formatAmount(doc.detected_amount) : '—'}</span>
            <span>Fournisseur : ${doc.detected_supplier || '—'}</span>
            <span>Référence : ${doc.detected_reference || '—'}</span>
            <span>Lié à : ${doc.transaction_label || 'Aucune opération'}</span>
        </div>
    `;

    document.getElementById('previewOpenV033')?.addEventListener('click', async () => await window.api.openFile(doc.filepath));
    document.getElementById('previewRenameV033')?.addEventListener('click', async () => await renameDocumentV033(doc));
    document.getElementById('previewMoveV033')?.addEventListener('click', async () => await moveDocumentV033(doc));
}

async function renderDocumentFolderV033() {
    const docs = selectedDocumentRowsV033;
    let filtered = docs;

    if (selectedDocumentFolderV033 === 'Non classés') {
        filtered = docs.filter(doc => !doc.company_id || !doc.folder_path);
    } else if (selectedDocumentFolderV033 === 'Corbeille') {
        filtered = await window.api.getDocuments({
            companyId: selectedCompany ? selectedCompany.id : null,
            filters: { status: 'trash' }
        });
    } else if (selectedDocumentFolderV033) {
        filtered = docs.filter(doc => getDocFolderV033(doc) === selectedDocumentFolderV033 || getDocFolderV033(doc).startsWith(`${selectedDocumentFolderV033}/`));
    }

    const breadcrumb = document.getElementById('documentBreadcrumbV033');
    if (breadcrumb) breadcrumb.textContent = selectedDocumentFolderV033 || 'Tous les documents';

    renderDocumentTableV033(document.getElementById('documentFolderFilesV033'), filtered);
    renderDocumentTreeV033(docs);

    document.querySelectorAll('#documentTreeV033 button').forEach(button => {
        button.addEventListener('dragover', event => event.preventDefault());
        button.addEventListener('drop', async event => {
            event.preventDefault();
            const documentId = Number(event.dataTransfer.getData('text/plain'));
            const folderPath = button.title || '';
            if (!documentId || !folderPath || folderPath === 'Corbeille') return;
            await window.api.moveDocumentFolder({ documentId, folderPath });
            selectedDocumentFolderV033 = folderPath;
            await loadDocuments();
        });
    });
}

(function documentActionsV034() {
    function bind() {
        const unclassified = document.getElementById('showUnclassifiedV034');
        if (unclassified && !unclassified.dataset.boundV034) {
            unclassified.dataset.boundV034 = '1';
            unclassified.addEventListener('click', async () => {
                selectedDocumentFolderV033 = 'Non classés';
                await loadDocuments();
            });
        }

        const trash = document.getElementById('showTrashV034');
        if (trash && !trash.dataset.boundV034) {
            trash.dataset.boundV034 = '1';
            trash.addEventListener('click', async () => {
                selectedDocumentFolderV033 = 'Corbeille';
                await loadDocuments();
            });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();


// ===========================
// Focus Compta V0.35 - Favoris / Tags / Dossiers intelligents / Doublons
// ===========================

let activeSmartFolderV035 = '';

async function updateSmartFoldersV035() {
    if (!window.api.getDocumentSmartFolders) return;
    const stats = await window.api.getDocumentSmartFolders({ companyId: selectedCompany ? selectedCompany.id : null });

    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    set('smartFavCountV035', stats.favorites || 0);
    set('smartUnclassifiedCountV035', stats.unclassified || 0);
    set('smartDuplicatesCountV035', stats.duplicates || 0);
    set('smartUnmatchedCountV035', stats.unmatched || 0);
    set('smartContractsCountV035', stats.contracts || 0);
}

function documentMatchesSmartFolderV035(doc) {
    if (!activeSmartFolderV035) return true;

    if (activeSmartFolderV035 === 'favorites') return Number(doc.favorite || 0) === 1;
    if (activeSmartFolderV035 === 'unclassified') return !doc.company_id || !doc.folder_path;
    if (activeSmartFolderV035 === 'unmatched') return doc.status !== 'matched' && !['releve', 'rib'].includes(doc.doc_type || '');
    if (activeSmartFolderV035 === 'contracts') return doc.doc_type === 'contrat';
    if (activeSmartFolderV035 === 'recent') return true;
    if (activeSmartFolderV035 === 'duplicates') return true;

    return true;
}

const originalFetchDocumentsV035 = fetchDocumentsV033;
fetchDocumentsV033 = async function(extra = {}) {
    let docs = await originalFetchDocumentsV035(extra);

    if (activeSmartFolderV035 === 'duplicates' && window.api.getDocumentDuplicates) {
        docs = await window.api.getDocumentDuplicates({ companyId: selectedCompany ? selectedCompany.id : null });
    } else {
        docs = docs.filter(documentMatchesSmartFolderV035);
    }

    if (activeSmartFolderV035 === 'recent') {
        docs = [...docs].sort((a, b) => String(b.added_at || '').localeCompare(String(a.added_at || ''))).slice(0, 50);
    }

    return docs;
};

const originalUpdateDocumentKpisV035 = updateDocumentKpisV033;
updateDocumentKpisV033 = function(docs) {
    originalUpdateDocumentKpisV035(docs);
    updateSmartFoldersV035();
};

const originalRenderDocumentPreviewV035 = renderDocumentPreviewV033;
renderDocumentPreviewV033 = function(doc) {
    originalRenderDocumentPreviewV035(doc);

    const preview = document.getElementById('documentPreviewV033');
    if (!preview || !doc) return;

    const info = preview.querySelector('.document-info-v033');
    if (info) {
        const fav = Number(doc.favorite || 0) ? '⭐ Oui' : '—';
        const tags = doc.tags || '—';
        info.insertAdjacentHTML('beforeend', `<span>Favori : ${fav}</span><span>Tags : ${tags}</span>`);
    }

    const actions = preview.querySelector('.document-preview-actions-v033');
    if (actions) {
        const favoriteButton = document.createElement('button');
        favoriteButton.textContent = Number(doc.favorite || 0) ? 'Retirer favori' : 'Ajouter favori';
        favoriteButton.addEventListener('click', async () => {
            await window.api.toggleDocumentFavorite(doc.id);
            await loadDocuments();
        });

        const tagButton = document.createElement('button');
        tagButton.textContent = 'Tags';
        tagButton.addEventListener('click', async () => {
            const tags = prompt('Tags séparés par des virgules', doc.tags || '');
            if (tags === null) return;
            await window.api.updateDocumentTags({ documentId: doc.id, tags });
            await loadDocuments();
        });

        actions.appendChild(favoriteButton);
        actions.appendChild(tagButton);
    }
};

const originalRenderDocumentTableV035 = renderDocumentTableV033;
renderDocumentTableV033 = function(container, docs) {
    originalRenderDocumentTableV035(container, docs);

    const table = container?.querySelector('table');
    if (!table) return;

    const headRow = table.querySelector('thead tr');
    if (headRow && !headRow.dataset.v035) {
        headRow.dataset.v035 = '1';
        const th = document.createElement('th');
        th.textContent = 'Tags';
        headRow.appendChild(th);
    }

    table.querySelectorAll('tbody tr').forEach(row => {
        if (row.dataset.v035) return;
        row.dataset.v035 = '1';
        const docId = Number(row.dataset.documentId);
        const doc = docs.find(item => Number(item.id) === docId);
        if (!doc) return;
        const td = document.createElement('td');
        td.innerHTML = `${Number(doc.favorite || 0) ? '⭐ ' : ''}${doc.tags || ''}`;
        row.appendChild(td);
    });
};

(function documentSmartFoldersUiV035() {
    function bind() {
        document.querySelectorAll('#documentSmartFoldersV035 button').forEach(button => {
            if (button.dataset.boundV035) return;
            button.dataset.boundV035 = '1';
            button.addEventListener('click', async () => {
                document.querySelectorAll('#documentSmartFoldersV035 button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                activeSmartFolderV035 = button.dataset.smartFolder || '';
                selectedDocumentFolderV033 = '';
                await loadDocuments();
            });
        });

        const favButton = document.getElementById('favoriteSelectedDocumentV035');
        if (favButton && !favButton.dataset.boundV035) {
            favButton.dataset.boundV035 = '1';
            favButton.addEventListener('click', async () => {
                if (!selectedDocumentV033) return alert('Sélectionne un document.');
                await window.api.toggleDocumentFavorite(selectedDocumentV033.id);
                await loadDocuments();
            });
        }

        const tagButton = document.getElementById('tagSelectedDocumentV035');
        if (tagButton && !tagButton.dataset.boundV035) {
            tagButton.dataset.boundV035 = '1';
            tagButton.addEventListener('click', async () => {
                if (!selectedDocumentV033) return alert('Sélectionne un document.');
                const tags = prompt('Tags séparés par des virgules', selectedDocumentV033.tags || '');
                if (tags === null) return;
                await window.api.updateDocumentTags({ documentId: selectedDocumentV033.id, tags });
                await loadDocuments();
            });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();


// ===========================
// Focus Compta V0.36 - Correctifs GED utilisables
// ===========================

let previewTabV036 = 'preview';
let expandedFoldersV036 = new Set();

function folderDepthV036(path) {
    return String(path || '').split('/').filter(Boolean).length - 1;
}

function rootFolderV036(path) {
    return String(path || '').split('/').filter(Boolean)[0] || '';
}

function displayMonthV036(value) {
    const months = {
        '01': 'Janvier', '02': 'Février', '03': 'Mars', '04': 'Avril',
        '05': 'Mai', '06': 'Juin', '07': 'Juillet', '08': 'Août',
        '09': 'Septembre', '10': 'Octobre', '11': 'Novembre', '12': 'Décembre'
    };
    return months[String(value).padStart(2, '0')] || value;
}

function getDocFolderV033(doc) {
    if (doc.folder_path) return doc.folder_path;

    const company = doc.company_name || (selectedCompany ? selectedCompany.name : 'Non classés');
    const rawDate = `${doc.detected_date || ''} ${doc.added_at || ''}`;
    const year = (rawDate.match(/20\d{2}/) || ['Sans année'])[0];
    const monthMatch = rawDate.match(/(?:^|[\/\-\s])(\d{2})(?:[\/\-\s]|$)/);
    const month = monthMatch ? monthMatch[1] : 'Sans mois';

    if (!doc.company_id) return 'Non classés';
    if (doc.doc_type === 'releve') return `${company}/Relevés/${year}/Compte/${month}`;
    if (doc.doc_type === 'rib') return `${company}/RIB`;
    return `${company}/Documents/${year}/${month}`;
}

function buildFolderModelV036(docs) {
    const folders = new Map();

    function ensure(path) {
        if (!path) return null;
        if (!folders.has(path)) {
            const parts = path.split('/').filter(Boolean);
            folders.set(path, {
                path,
                name: parts[parts.length - 1],
                parent: parts.length > 1 ? parts.slice(0, -1).join('/') : '',
                depth: parts.length - 1,
                count: 0,
                hasChildren: false
            });
        }
        return folders.get(path);
    }

    function addPath(path, count = 0) {
        const parts = String(path || '').split('/').filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
            const current = parts.slice(0, i).join('/');
            const folder = ensure(current);
            if (i === parts.length && folder) folder.count += count;
            const parent = i > 1 ? ensure(parts.slice(0, i - 1).join('/')) : null;
            if (parent) parent.hasChildren = true;
        }
    }

    const companies = [...new Set(docs.map(doc => doc.company_name).filter(Boolean))].sort();
    companies.forEach(company => {
        addPath(company, 0);
        addPath(`${company}/Documents`, 0);
        addPath(`${company}/Relevés`, 0);
        addPath(`${company}/RIB`, 0);
    });

    addPath('⭐ Favoris', docs.filter(doc => Number(doc.favorite || 0) === 1).length);
    addPath('📥 Non classés', docs.filter(doc => !doc.company_id || !doc.folder_path).length);
    addPath('⚠ Doublons', 0);
    addPath('🔗 À rapprocher', docs.filter(doc => doc.status !== 'matched' && !['releve', 'rib'].includes(doc.doc_type || '')).length);
    addPath('🕒 Récents', Math.min(50, docs.length));
    addPath('🗑 Corbeille', 0);

    docs.forEach(doc => addPath(getDocFolderV033(doc), 1));

    return [...folders.values()].sort((a, b) => {
        const smartOrder = ['⭐ Favoris', '📥 Non classés', '⚠ Doublons', '🔗 À rapprocher', '🕒 Récents'];
        const ai = smartOrder.indexOf(a.path);
        const bi = smartOrder.indexOf(b.path);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);

        if (a.path === '🗑 Corbeille') return 1;
        if (b.path === '🗑 Corbeille') return -1;

        return a.path.localeCompare(b.path, 'fr', { numeric: true });
    });
}

function shouldShowFolderV036(folder, search) {
    if (search && !folder.path.toLowerCase().includes(search.toLowerCase())) return false;
    if (!folder.parent) return true;
    return expandedFoldersV036.has(folder.parent) || search;
}

function folderIconV036(folder) {
    if (folder.path.startsWith('⭐') || folder.path.startsWith('📥') || folder.path.startsWith('⚠') || folder.path.startsWith('🔗') || folder.path.startsWith('🕒') || folder.path.startsWith('🗑')) return '';
    if (folder.name === 'RIB') return '🏦';
    if (folder.name === 'Relevés') return '📄';
    if (folder.name === 'Documents') return '📂';
    if (/^\d{2}$/.test(folder.name)) return '📁';
    return '📁';
}

function renderDocumentTreeV033(docs) {
    const tree = document.getElementById('documentTreeV033');
    if (!tree) return;

    const search = document.getElementById('documentTreeSearchV036')?.value || '';
    tree.innerHTML = '';

    if (!expandedFoldersV036.size) {
        docs.forEach(doc => {
            const parts = getDocFolderV033(doc).split('/').filter(Boolean);
            if (parts[0]) expandedFoldersV036.add(parts[0]);
        });
    }

    const allButton = document.createElement('button');
    allButton.className = selectedDocumentFolderV033 ? 'tree-row-v036' : 'tree-row-v036 active';
    allButton.innerHTML = `<span class="tree-chevron-v036"></span><span class="tree-label-v036">📁 Tous les documents</span><span class="tree-count-v036">${docs.length}</span>`;
    allButton.addEventListener('click', async () => {
        selectedDocumentFolderV033 = '';
        activeSmartFolderV035 = '';
        await renderDocumentFolderV033();
    });
    tree.appendChild(allButton);

    buildFolderModelV036(docs).filter(folder => shouldShowFolderV036(folder, search)).forEach(folder => {
        const button = document.createElement('button');
        button.className = selectedDocumentFolderV033 === folder.path ? 'tree-row-v036 active' : 'tree-row-v036';
        button.style.setProperty('--depth', folder.depth);
        button.title = folder.path;
        button.dataset.folderPath = folder.path;

        const expanded = expandedFoldersV036.has(folder.path);
        const chevron = folder.hasChildren ? (expanded ? '▼' : '▶') : '';
        const icon = folderIconV036(folder);
        const name = /^\d{2}$/.test(folder.name) ? displayMonthV036(folder.name) : folder.name;

        button.innerHTML = `
            <span class="tree-chevron-v036">${chevron}</span>
            <span class="tree-label-v036">${icon ? icon + ' ' : ''}${name}</span>
            <span class="tree-count-v036">${folder.count || ''}</span>
        `;

        button.addEventListener('click', async event => {
            const clickedChevron = event.target.classList.contains('tree-chevron-v036');
            if (folder.hasChildren && (clickedChevron || selectedDocumentFolderV033 === folder.path)) {
                if (expandedFoldersV036.has(folder.path)) expandedFoldersV036.delete(folder.path);
                else expandedFoldersV036.add(folder.path);
            }

            selectedDocumentFolderV033 = folder.path;
            activeSmartFolderV035 = '';
            await renderDocumentFolderV033();
        });

        button.addEventListener('dragover', event => event.preventDefault());
        button.addEventListener('drop', async event => {
            event.preventDefault();
            const documentId = Number(event.dataTransfer.getData('text/plain'));
            if (!documentId || folder.path.startsWith('⚠') || folder.path.startsWith('🗑')) return;
            await window.api.moveDocumentFolder({ documentId, folderPath: folder.path.replace(/^[⭐📥⚠🔗🕒🗑]\s*/, '') });
            selectedDocumentFolderV033 = folder.path;
            await loadDocuments();
        });

        tree.appendChild(button);
    });
}

function documentIsInFolderV036(doc, folder) {
    if (!folder) return true;
    if (folder === '⭐ Favoris') return Number(doc.favorite || 0) === 1;
    if (folder === '📥 Non classés') return !doc.company_id || !doc.folder_path;
    if (folder === '🔗 À rapprocher') return doc.status !== 'matched' && !['releve', 'rib'].includes(doc.doc_type || '');
    if (folder === '🕒 Récents') return true;
    if (folder === '🗑 Corbeille') return false;
    if (folder === '⚠ Doublons') return true;

    const cleanFolder = folder.replace(/^[⭐📥⚠🔗🕒🗑]\s*/, '');
    const docFolder = getDocFolderV033(doc);
    return docFolder === cleanFolder || docFolder.startsWith(`${cleanFolder}/`);
}

async function renderDocumentFolderV033() {
    let docs = selectedDocumentRowsV033;

    if (selectedDocumentFolderV033 === '🗑 Corbeille') {
        docs = await window.api.getDocuments({
            companyId: selectedCompany ? selectedCompany.id : null,
            filters: { status: 'trash' }
        });
    } else if (selectedDocumentFolderV033 === '⚠ Doublons' && window.api.getDocumentDuplicates) {
        docs = await window.api.getDocumentDuplicates({ companyId: selectedCompany ? selectedCompany.id : null });
    } else if (selectedDocumentFolderV033) {
        docs = docs.filter(doc => documentIsInFolderV036(doc, selectedDocumentFolderV033));
        if (selectedDocumentFolderV033 === '🕒 Récents') {
            docs = docs.sort((a, b) => String(b.added_at || '').localeCompare(String(a.added_at || ''))).slice(0, 50);
        }
    }

    const breadcrumb = document.getElementById('documentBreadcrumbV033');
    if (breadcrumb) breadcrumb.textContent = selectedDocumentFolderV033 || 'Tous les documents';

    renderDocumentTableV033(document.getElementById('documentFolderFilesV033'), docs);
    renderDocumentTreeV033(selectedDocumentRowsV033);
}

function renderDocumentTableV033(container, docs) {
    if (!container) return;
    container.innerHTML = '';

    if (!docs.length) {
        container.innerHTML = '<div class="empty-state">Aucun fichier dans ce dossier.</div>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'documents-table-v033 documents-table-v036';
    table.innerHTML = `
        <thead>
            <tr>
                <th></th>
                <th>Nom</th>
                <th>Type</th>
                <th>Date</th>
                <th>Statut</th>
                <th>Tags</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const body = table.querySelector('tbody');
    docs.forEach(doc => {
        const tr = document.createElement('tr');
        tr.className = 'document-row-v033';
        tr.dataset.documentId = doc.id;
        tr.draggable = true;
        tr.innerHTML = `
            <td><input type="checkbox"></td>
            <td>
                <span class="file-icon-v033">${docTypeIconV033(doc.doc_type)}</span>
                <strong>${doc.filename}</strong>
                <small>${doc.company_name || 'Non classé'} · ${getDocFolderV033(doc)}</small>
            </td>
            <td>${docTypeLabelV033(doc.doc_type)}</td>
            <td>${doc.detected_date || (doc.added_at || '').slice(0, 10)}</td>
            <td>${doc.status === 'matched' ? '✅ Rapproché' : '🟡 Non rapproché'}</td>
            <td>${Number(doc.favorite || 0) ? '⭐ ' : ''}${doc.tags || ''}</td>
        `;

        tr.addEventListener('dragstart', event => {
            event.dataTransfer.setData('text/plain', String(doc.id));
        });

        tr.addEventListener('click', event => {
            if (event.target.tagName === 'INPUT') return;
            selectedDocumentV033 = doc;
            document.querySelectorAll('.document-row-v033').forEach(row => row.classList.remove('selected'));
            tr.classList.add('selected');
            renderDocumentPreviewV033(doc);
        });

        body.appendChild(tr);
    });

    container.appendChild(table);
}

function renderDocumentPreviewV033(doc) {
    const title = document.getElementById('documentPreviewTitleV033');
    const preview = document.getElementById('documentPreviewV033');
    if (!preview) return;

    if (!doc) {
        if (title) title.textContent = 'Aperçu';
        preview.className = 'document-preview-v033 empty-state';
        preview.textContent = 'Sélectionne un document.';
        return;
    }

    if (title) title.textContent = doc.filename;
    preview.className = 'document-preview-v033';

    document.querySelectorAll('.document-preview-tabs-v033 button').forEach(button => {
        button.classList.toggle('active', button.dataset.previewTab === previewTabV036);
    });

    const safePath = String(doc.filepath || '').replace(/\\/g, '/');
    const lower = String(doc.filename || '').toLowerCase();

    const actions = `
        <div class="document-preview-actions-v033">
            <button id="previewOpenV033">Ouvrir</button>
            <button id="previewRenameV033">Renommer</button>
            <button id="previewMoveV033">Déplacer</button>
            <button id="previewFavoriteV036">${Number(doc.favorite || 0) ? 'Retirer favori' : 'Ajouter favori'}</button>
            <button id="previewTagsV036">Tags</button>
        </div>
    `;

    let content = '';
    if (previewTabV036 === 'preview') {
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
            content = `<img src="file:///${safePath}" alt="${doc.filename}">`;
        } else if (lower.endsWith('.pdf')) {
            content = `<iframe class="pdf-frame-v034" src="file:///${safePath}"></iframe>`;
        } else {
            content = `<div class="pdf-placeholder-v033">📄<br>${doc.filename}<br><span>Utilise “Ouvrir” pour consulter le fichier.</span></div>`;
        }
    }

    if (previewTabV036 === 'info') {
        content = `
            <div class="document-info-v033">
                <strong>Informations document</strong>
                <span>Nom : ${doc.filename}</span>
                <span>Type : ${docTypeLabelV033(doc.doc_type)}</span>
                <span>Société : ${doc.company_name || 'Non classé'}</span>
                <span>Dossier : ${getDocFolderV033(doc)}</span>
                <span>Date : ${doc.detected_date || 'Non détectée'}</span>
                <span>Montant : ${doc.detected_amount ? formatAmount(doc.detected_amount) : '—'}</span>
                <span>Fournisseur : ${doc.detected_supplier || '—'}</span>
                <span>Référence : ${doc.detected_reference || '—'}</span>
                <span>Favori : ${Number(doc.favorite || 0) ? 'Oui' : 'Non'}</span>
                <span>Tags : ${doc.tags || '—'}</span>
            </div>
        `;
    }

    if (previewTabV036 === 'ocr') {
        content = `
            <div class="document-info-v033">
                <strong>OCR / données détectées</strong>
                <span>Fournisseur détecté : ${doc.detected_supplier || '—'}</span>
                <span>Date détectée : ${doc.detected_date || '—'}</span>
                <span>Montant détecté : ${doc.detected_amount ? formatAmount(doc.detected_amount) : '—'}</span>
                <span>Référence détectée : ${doc.detected_reference || '—'}</span>
                <textarea readonly>${doc.ocr_text || 'OCR complet non disponible pour ce document.'}</textarea>
            </div>
        `;
    }

    if (previewTabV036 === 'links') {
        content = `
            <div class="document-info-v033">
                <strong>Liens</strong>
                <span>Statut : ${doc.status === 'matched' ? 'Rapproché' : 'Non rapproché'}</span>
                <span>Opération liée : ${doc.transaction_label || 'Aucune'}</span>
                <span>Date opération : ${doc.date_operation || '—'}</span>
                <span>Montant opération : ${doc.transaction_amount ? formatAmount(doc.transaction_amount) : '—'}</span>
                <p class="muted">Les rapprochements se font dans le module Rapprochements.</p>
            </div>
        `;
    }

    preview.innerHTML = `${actions}${content}`;

    document.getElementById('previewOpenV033')?.addEventListener('click', async () => await window.api.openFile(doc.filepath));
    document.getElementById('previewRenameV033')?.addEventListener('click', async () => await renameDocumentV033(doc));
    document.getElementById('previewMoveV033')?.addEventListener('click', async () => await moveDocumentV033(doc));
    document.getElementById('previewFavoriteV036')?.addEventListener('click', async () => {
        await window.api.toggleDocumentFavorite(doc.id);
        await loadDocuments();
    });
    document.getElementById('previewTagsV036')?.addEventListener('click', async () => await tagDocumentV036(doc));
}

async function renameDocumentV033(doc) {
    const name = prompt('Nouveau nom du document', doc.filename);
    if (!name || name === doc.filename) return;
    const result = await window.api.renameDocument({ documentId: doc.id, newFilename: name });
    if (result && result.ok === false) alert(result.message || 'Renommage impossible.');
    await loadDocuments();
}

async function moveDocumentV033(doc) {
    const folder = prompt('Nouveau dossier logique', getDocFolderV033(doc));
    if (!folder) return;
    const result = await window.api.moveDocumentFolder({ documentId: doc.id, folderPath: folder });
    if (result && result.ok === false) alert(result.message || 'Déplacement impossible.');
    selectedDocumentFolderV033 = folder;
    await loadDocuments();
}

async function tagDocumentV036(doc) {
    const tags = prompt('Tags séparés par des virgules', doc.tags || '');
    if (tags === null) return;
    const result = await window.api.updateDocumentTags({ documentId: doc.id, tags });
    if (result && result.ok === false) alert(result.message || 'Tags impossibles.');
    await loadDocuments();
}

async function loadDocuments() {
    let docs = await fetchDocumentsV033();
    selectedDocumentRowsV033 = docs;
    updateDocumentKpisV033(docs);
    updateYearFilterV033(docs);
    renderDocumentTreeV033(docs);
    await renderDocumentFolderV033();

    if (selectedDocumentV033) {
        const refreshed = docs.find(doc => Number(doc.id) === Number(selectedDocumentV033.id));
        selectedDocumentV033 = refreshed || null;
        renderDocumentPreviewV033(selectedDocumentV033);
    } else {
        renderDocumentPreviewV033(null);
    }
}

(function bindDocumentV036() {
    function bind() {
        const search = document.getElementById('documentTreeSearchV036');
        if (search && !search.dataset.boundV036) {
            search.dataset.boundV036 = '1';
            search.addEventListener('input', () => renderDocumentTreeV033(selectedDocumentRowsV033 || []));
        }

        document.querySelectorAll('.document-preview-tabs-v033 button').forEach(button => {
            if (button.dataset.boundV036) return;
            button.dataset.boundV036 = '1';
            button.addEventListener('click', () => {
                previewTabV036 = button.dataset.previewTab || 'preview';
                renderDocumentPreviewV033(selectedDocumentV033);
            });
        });

        const fav = document.getElementById('favoriteSelectedDocumentV035');
        if (fav && !fav.dataset.boundV036) {
            fav.dataset.boundV036 = '1';
            fav.addEventListener('click', async () => {
                if (!selectedDocumentV033) return alert('Sélectionne un document.');
                await window.api.toggleDocumentFavorite(selectedDocumentV033.id);
                await loadDocuments();
            });
        }

        const tag = document.getElementById('tagSelectedDocumentV035');
        if (tag && !tag.dataset.boundV036) {
            tag.dataset.boundV036 = '1';
            tag.addEventListener('click', async () => {
                if (!selectedDocumentV033) return alert('Sélectionne un document.');
                await tagDocumentV036(selectedDocumentV033);
            });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();


// ===========================
// Focus Compta V0.37 - Refonte GED UX
// ===========================

let currentContextDocumentV037 = null;

function renderDocumentTableV033(container, docs) {
    if (!container) return;
    container.innerHTML = '';

    if (!docs.length) {
        container.innerHTML = '<div class="empty-state">Aucun fichier dans ce dossier.</div>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'documents-table-v033 documents-table-v037';
    table.innerHTML = `
        <thead>
            <tr>
                <th></th>
                <th>Nom</th>
                <th>Type</th>
                <th>Date</th>
                <th>Statut</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const body = table.querySelector('tbody');
    docs.forEach(doc => {
        const tr = document.createElement('tr');
        tr.className = 'document-row-v033 document-row-v037';
        tr.dataset.documentId = doc.id;
        tr.draggable = true;
        tr.innerHTML = `
            <td><input type="checkbox"></td>
            <td>
                <span class="file-icon-v033">${docTypeIconV033(doc.doc_type)}</span>
                <strong>${Number(doc.favorite || 0) ? '⭐ ' : ''}${Number(doc.important || 0) ? '📌 ' : ''}${doc.filename}</strong>
                <small>${doc.company_name || 'Non classé'} · ${getDocFolderV033(doc)}</small>
            </td>
            <td>${docTypeLabelV033(doc.doc_type)}</td>
            <td>${doc.detected_date || (doc.added_at || '').slice(0, 10)}</td>
            <td>${doc.status === 'matched' ? '✅ Rapproché' : '🟡 Non rapproché'}</td>
        `;

        tr.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', String(doc.id)));

        tr.addEventListener('click', event => {
            if (event.target.tagName === 'INPUT') return;
            selectedDocumentV033 = doc;
            document.querySelectorAll('.document-row-v033').forEach(row => row.classList.remove('selected'));
            tr.classList.add('selected');
            renderDocumentPreviewV033(doc);
        });

        tr.addEventListener('dblclick', async event => {
            event.preventDefault();
            await window.api.openFile(doc.filepath);
        });

        tr.addEventListener('contextmenu', event => {
            event.preventDefault();
            selectedDocumentV033 = doc;
            currentContextDocumentV037 = doc;
            document.querySelectorAll('.document-row-v033').forEach(row => row.classList.remove('selected'));
            tr.classList.add('selected');
            renderDocumentPreviewV033(doc);
            showDocumentContextMenuV037(event.clientX, event.clientY, doc);
        });

        body.appendChild(tr);
    });

    container.appendChild(table);
}

function showDocumentContextMenuV037(x, y, doc) {
    const menu = document.getElementById('documentContextMenuV037');
    if (!menu || !doc) return;

    const favoriteLabel = Number(doc.favorite || 0) ? 'Retirer des favoris' : 'Ajouter aux favoris';
    const importantLabel = Number(doc.important || 0) ? 'Retirer important' : 'Marquer important';

    menu.innerHTML = `
        <button data-action="open">📂 Ouvrir</button>
        <button data-action="preview">👁 Aperçu</button>
        <hr>
        <button data-action="rename">✏️ Renommer</button>
        <button data-action="move">📁 Déplacer</button>
        <button data-action="favorite">⭐ ${favoriteLabel}</button>
        <button data-action="important">📌 ${importantLabel}</button>
        <hr>
        <button data-action="third">👤 Associer un tiers</button>
        <button data-action="links">🔗 Voir les liens</button>
        <hr>
        <button data-action="copy">📋 Copier le chemin</button>
        <button data-action="download">⬇️ Télécharger / ouvrir</button>
        <hr>
        <button data-action="delete" class="danger-menu-action">🗑️ Supprimer</button>
    `;

    menu.style.display = 'block';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    menu.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', async () => {
            const action = button.dataset.action;
            hideDocumentContextMenuV037();

            if (action === 'open' || action === 'download') await window.api.openFile(doc.filepath);
            if (action === 'preview') renderDocumentPreviewV033(doc);
            if (action === 'rename') await renameDocumentV033(doc);
            if (action === 'move') await moveDocumentV033(doc);
            if (action === 'favorite') {
                await window.api.toggleDocumentFavorite(doc.id);
                await loadDocuments();
            }
            if (action === 'important') {
                await window.api.toggleDocumentImportant(doc.id);
                await loadDocuments();
            }
            if (action === 'third') await associateThirdPartyV037(doc);
            if (action === 'links') {
                previewTabV036 = 'links';
                renderDocumentPreviewV033(doc);
            }
            if (action === 'copy') {
                try {
                    await navigator.clipboard.writeText(doc.filepath || '');
                } catch (error) {
                    prompt('Chemin du fichier', doc.filepath || '');
                }
            }
            if (action === 'delete') await deleteDocumentV033(doc);
        });
    });
}

function hideDocumentContextMenuV037() {
    const menu = document.getElementById('documentContextMenuV037');
    if (menu) menu.style.display = 'none';
}

async function associateThirdPartyV037(doc) {
    const value = prompt('Nom du tiers à associer', doc.third_party_name || doc.detected_supplier || '');
    if (value === null) return;
    await window.api.updateDocumentThirdParty({ documentId: doc.id, thirdPartyName: value });
    await loadDocuments();
}

async function getHistoryHtmlV037(doc) {
    let history = [];
    if (window.api.getDocumentHistory) {
        try {
            history = await window.api.getDocumentHistory(doc.id);
        } catch (error) {
            history = [];
        }
    }

    if (!history.length) {
        history = [
            { at: doc.added_at || '', action: 'Importé', detail: doc.filename }
        ];
    }

    return `
        <div class="document-info-v033 history-v037">
            <strong>Historique</strong>
            ${history.map(item => `
                <div class="history-item-v037">
                    <span>${item.action || 'Action'}</span>
                    <small>${item.at ? new Date(item.at).toLocaleString('fr-FR') : ''}</small>
                    ${item.detail ? `<em>${item.detail}</em>` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

async function renderDocumentPreviewV033(doc) {
    const title = document.getElementById('documentPreviewTitleV033');
    const preview = document.getElementById('documentPreviewV033');
    if (!preview) return;

    if (!doc) {
        if (title) title.textContent = 'Aperçu';
        preview.className = 'document-preview-v033 empty-state';
        preview.textContent = 'Sélectionne un document.';
        return;
    }

    if (title) title.textContent = doc.filename;
    preview.className = 'document-preview-v033';

    document.querySelectorAll('.document-preview-tabs-v033 button').forEach(button => {
        button.classList.toggle('active', button.dataset.previewTab === previewTabV036);
    });

    const safePath = String(doc.filepath || '').replace(/\\/g, '/');
    const lower = String(doc.filename || '').toLowerCase();

    const actions = `
        <div class="document-preview-actions-v037">
            <button id="previewOpenV037">Ouvrir</button>
            <button id="previewMenuV037">⋮ Actions</button>
        </div>
    `;

    let content = '';
    if (previewTabV036 === 'preview') {
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
            content = `<img src="file:///${safePath}" alt="${doc.filename}">`;
        } else if (lower.endsWith('.pdf')) {
            content = `<iframe class="pdf-frame-v034" src="file:///${safePath}"></iframe>`;
        } else {
            content = `<div class="pdf-placeholder-v033">📄<br>${doc.filename}<br><span>Double-clic ou clic droit pour ouvrir.</span></div>`;
        }
    }

    if (previewTabV036 === 'info') {
        content = `
            <div class="document-info-v033">
                <strong>Informations document</strong>
                <span>Nom : ${doc.filename}</span>
                <span>Type : ${docTypeLabelV033(doc.doc_type)}</span>
                <span>Société : ${doc.company_name || 'Non classé'}</span>
                <span>Dossier : ${getDocFolderV033(doc)}</span>
                <span>Date : ${doc.detected_date || 'Non détectée'}</span>
                <span>Montant : ${doc.detected_amount ? formatAmount(doc.detected_amount) : '—'}</span>
                <span>Fournisseur : ${doc.detected_supplier || '—'}</span>
                <span>Tiers associé : ${doc.third_party_name || '—'}</span>
                <span>Référence : ${doc.detected_reference || '—'}</span>
                <span>Favori : ${Number(doc.favorite || 0) ? 'Oui' : 'Non'}</span>
                <span>Important : ${Number(doc.important || 0) ? 'Oui' : 'Non'}</span>
            </div>
        `;
    }

    if (previewTabV036 === 'ocr') {
        content = `
            <div class="document-info-v033">
                <strong>OCR / données détectées</strong>
                <span>Fournisseur : ${doc.detected_supplier || '—'}</span>
                <span>Date : ${doc.detected_date || '—'}</span>
                <span>Montant : ${doc.detected_amount ? formatAmount(doc.detected_amount) : '—'}</span>
                <span>Référence : ${doc.detected_reference || '—'}</span>
                <textarea readonly>${doc.ocr_text || 'OCR complet non disponible pour ce document.'}</textarea>
            </div>
        `;
    }

    if (previewTabV036 === 'links') {
        content = `
            <div class="document-info-v033">
                <strong>Liens</strong>
                <span>Statut : ${doc.status === 'matched' ? 'Rapproché' : 'Non rapproché'}</span>
                <span>Opération liée : ${doc.transaction_label || 'Aucune'}</span>
                <span>Date opération : ${doc.date_operation || '—'}</span>
                <span>Montant opération : ${doc.transaction_amount ? formatAmount(doc.transaction_amount) : '—'}</span>
                <p class="muted">Le rapprochement se fait dans le module Rapprochements.</p>
            </div>
        `;
    }

    if (previewTabV036 === 'history') {
        content = await getHistoryHtmlV037(doc);
    }

    preview.innerHTML = `${actions}${content}`;
    document.getElementById('previewOpenV037')?.addEventListener('click', async () => await window.api.openFile(doc.filepath));
    document.getElementById('previewMenuV037')?.addEventListener('click', event => showDocumentContextMenuV037(event.clientX, event.clientY, doc));
}

async function loadDocuments() {
    let docs = await fetchDocumentsV033();
    selectedDocumentRowsV033 = docs;
    updateDocumentKpisV033(docs);
    updateYearFilterV033(docs);
    renderDocumentTreeV033(docs);
    await renderDocumentFolderV033();

    if (selectedDocumentV033) {
        const refreshed = docs.find(doc => Number(doc.id) === Number(selectedDocumentV033.id));
        selectedDocumentV033 = refreshed || null;
        await renderDocumentPreviewV033(selectedDocumentV033);
    } else {
        await renderDocumentPreviewV033(null);
    }
}

(function bindDocumentV037() {
    function bind() {
        document.addEventListener('click', event => {
            const menu = document.getElementById('documentContextMenuV037');
            if (menu && !menu.contains(event.target)) hideDocumentContextMenuV037();
        });

        const important = document.getElementById('importantSelectedDocumentV037');
        if (important && !important.dataset.boundV037) {
            important.dataset.boundV037 = '1';
            important.addEventListener('click', async () => {
                if (!selectedDocumentV033) return alert('Sélectionne un document.');
                await window.api.toggleDocumentImportant(selectedDocumentV033.id);
                await loadDocuments();
            });
        }

        const tag = document.getElementById('tagSelectedDocumentV035');
        if (tag) tag.style.display = 'none';

        const tagSmart = document.querySelectorAll('[data-smart-folder="tags"]');
        tagSmart.forEach(el => el.remove());

        document.querySelectorAll('.document-preview-tabs-v033 button').forEach(button => {
            if (button.dataset.previewTab === 'history') return;
        });

        const tabs = document.querySelector('.document-preview-tabs-v033');
        if (tabs && !tabs.querySelector('[data-preview-tab="history"]')) {
            const history = document.createElement('button');
            history.dataset.previewTab = 'history';
            history.textContent = 'Historique';
            tabs.appendChild(history);
        }

        document.querySelectorAll('.document-preview-tabs-v033 button').forEach(button => {
            if (button.dataset.boundV037) return;
            button.dataset.boundV037 = '1';
            button.addEventListener('click', async () => {
                previewTabV036 = button.dataset.previewTab || 'preview';
                await renderDocumentPreviewV033(selectedDocumentV033);
            });
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();


// ===========================
// Focus Compta V0.37.1 - Correctifs menu contextuel + documents orphelins
// ===========================

function positionContextMenuV037(menu, x, y) {
    menu.style.display = 'block';
    menu.style.left = '0px';
    menu.style.top = '0px';

    const margin = 12;
    const rect = menu.getBoundingClientRect();
    const width = rect.width || 260;
    const height = rect.height || 360;

    let left = x;
    let top = y;

    if (left + width + margin > window.innerWidth) {
        left = window.innerWidth - width - margin;
    }
    if (top + height + margin > window.innerHeight) {
        top = window.innerHeight - height - margin;
    }

    left = Math.max(margin, left);
    top = Math.max(margin, top);

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.maxHeight = `${window.innerHeight - margin * 2}px`;
    menu.style.overflowY = 'auto';
}

function showDocumentContextMenuV037(x, y, doc) {
    const menu = document.getElementById('documentContextMenuV037');
    if (!menu || !doc) return;

    const favoriteLabel = Number(doc.favorite || 0) ? 'Retirer des favoris' : 'Ajouter aux favoris';
    const importantLabel = Number(doc.important || 0) ? 'Retirer important' : 'Marquer important';

    menu.innerHTML = `
        <button data-action="open">📂 Ouvrir</button>
        <button data-action="preview">👁 Aperçu</button>
        <hr>
        <button data-action="rename">✏️ Renommer</button>
        <button data-action="move">📁 Déplacer</button>
        <button data-action="favorite">⭐ ${favoriteLabel}</button>
        <button data-action="important">📌 ${importantLabel}</button>
        <hr>
        <button data-action="third">👤 Associer un tiers</button>
        <button data-action="links">🔗 Voir les liens</button>
        <hr>
        <button data-action="copy">📋 Copier le chemin</button>
        <button data-action="download">⬇️ Télécharger / ouvrir</button>
        <hr>
        <button data-action="delete" class="danger-menu-action">🗑️ Supprimer</button>
    `;

    positionContextMenuV037(menu, x, y);

    menu.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', async () => {
            const action = button.dataset.action;
            hideDocumentContextMenuV037();

            if (action === 'open' || action === 'download') await window.api.openFile(doc.filepath);
            if (action === 'preview') renderDocumentPreviewV033(doc);
            if (action === 'rename') await renameDocumentV033(doc);
            if (action === 'move') await moveDocumentV033(doc);
            if (action === 'favorite') {
                await window.api.toggleDocumentFavorite(doc.id);
                await loadDocuments();
            }
            if (action === 'important') {
                await window.api.toggleDocumentImportant(doc.id);
                await loadDocuments();
            }
            if (action === 'third') await associateThirdPartyV037(doc);
            if (action === 'links') {
                previewTabV036 = 'links';
                renderDocumentPreviewV033(doc);
            }
            if (action === 'copy') {
                try {
                    await navigator.clipboard.writeText(doc.filepath || '');
                } catch (error) {
                    prompt('Chemin du fichier', doc.filepath || '');
                }
            }
            if (action === 'delete') await deleteDocumentV033(doc);
        });
    });
}

window.addEventListener('resize', hideDocumentContextMenuV037);


// ===========================
// Focus Compta V0.37.2 - Arborescence métier simplifiée
// ===========================

function extractYearMonthV0372(doc) {
    const text = `${doc.detected_date || ''} ${doc.added_at || ''} ${doc.folder_path || ''}`;

    let m = String(text).match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/);
    if (m) return { year: m[3], month: String(m[2]).padStart(2, '0') };

    m = String(text).match(/\b(20\d{2})[\/.-](\d{1,2})\b/);
    if (m) return { year: m[1], month: String(m[2]).padStart(2, '0') };

    const year = (String(text).match(/20\d{2}/) || [new Date().getFullYear().toString()])[0];
    return { year, month: 'Sans mois' };
}

function getAccountFolderV0372(doc) {
    const folder = String(doc.folder_path || '');
    const parts = folder.split('/').filter(Boolean);
    const releveIndex = parts.findIndex(part => part.toLowerCase().includes('relev'));
    if (releveIndex !== -1 && parts[releveIndex + 2]) return parts[releveIndex + 2];
    if (doc.detected_reference) return String(doc.detected_reference).slice(0, 32);
    return 'Compte bancaire';
}

function getDocFolderV033(doc) {
    const company = doc.company_name || (selectedCompany ? selectedCompany.name : 'Non classés');
    const { year, month } = extractYearMonthV0372(doc);

    if (!doc.company_id) return 'Non classés';

    if (doc.doc_type === 'rib') {
        return `${company}/RIB`;
    }

    if (doc.doc_type === 'releve') {
        return `${company}/RELEVES/${getAccountFolderV0372(doc)}`;
    }

    // On ne classe plus par jour : seulement année > mois
    return `${company}/JUSTIFICATIFS/${year}/${month}`;
}

function displayFolderNameV0372(name) {
    const months = {
        '01': 'Janvier', '02': 'Février', '03': 'Mars', '04': 'Avril',
        '05': 'Mai', '06': 'Juin', '07': 'Juillet', '08': 'Août',
        '09': 'Septembre', '10': 'Octobre', '11': 'Novembre', '12': 'Décembre'
    };
    return months[String(name).padStart(2, '0')] || name;
}

function buildFolderModelV036(docs) {
    const folders = new Map();

    function ensure(path) {
        if (!path) return null;
        if (!folders.has(path)) {
            const parts = path.split('/').filter(Boolean);
            folders.set(path, {
                path,
                name: parts[parts.length - 1],
                parent: parts.length > 1 ? parts.slice(0, -1).join('/') : '',
                depth: parts.length - 1,
                count: 0,
                hasChildren: false
            });
        }
        return folders.get(path);
    }

    function addPath(path, count = 0) {
        const parts = String(path || '').split('/').filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
            const current = parts.slice(0, i).join('/');
            const folder = ensure(current);
            if (i === parts.length && folder) folder.count += count;
            const parent = i > 1 ? ensure(parts.slice(0, i - 1).join('/')) : null;
            if (parent) parent.hasChildren = true;
        }
    }

    // Dossiers intelligents utiles
    addPath('⭐ Favoris', docs.filter(doc => Number(doc.favorite || 0) === 1).length);
    addPath('📥 Non classés', docs.filter(doc => !doc.company_id).length);
    addPath('⚠ Doublons', 0);
    addPath('🔗 À rapprocher', docs.filter(doc => doc.status !== 'matched' && !['releve', 'rib'].includes(doc.doc_type || '')).length);
    addPath('🕒 Récents', Math.min(50, docs.length));

    const companies = [...new Set(docs.map(doc => doc.company_name).filter(Boolean))].sort();
    companies.forEach(company => {
        addPath(company, 0);
        addPath(`${company}/RIB`, 0);
        addPath(`${company}/RELEVES`, 0);
        addPath(`${company}/JUSTIFICATIFS`, 0);
    });

    docs.forEach(doc => addPath(getDocFolderV033(doc), 1));

    addPath('🗑 Corbeille', 0);

    return [...folders.values()].sort((a, b) => {
        const smartOrder = ['⭐ Favoris', '📥 Non classés', '⚠ Doublons', '🔗 À rapprocher', '🕒 Récents'];
        const ai = smartOrder.indexOf(a.path);
        const bi = smartOrder.indexOf(b.path);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        if (a.path === '🗑 Corbeille') return 1;
        if (b.path === '🗑 Corbeille') return -1;
        return a.path.localeCompare(b.path, 'fr', { numeric: true });
    });
}

function folderIconV036(folder) {
    if (folder.path.startsWith('⭐') || folder.path.startsWith('📥') || folder.path.startsWith('⚠') || folder.path.startsWith('🔗') || folder.path.startsWith('🕒') || folder.path.startsWith('🗑')) return '';
    if (folder.name === 'RIB') return '🏦';
    if (folder.name === 'RELEVES') return '📄';
    if (folder.name === 'JUSTIFICATIFS') return '🧾';
    if (/^20\d{2}$/.test(folder.name)) return '📁';
    if (/^\d{2}$/.test(folder.name)) return '📅';
    return folder.depth === 0 ? '📁' : '📂';
}

function renderDocumentTreeV033(docs) {
    const tree = document.getElementById('documentTreeV033');
    if (!tree) return;

    const search = document.getElementById('documentTreeSearchV036')?.value || '';
    tree.innerHTML = '';

    if (!expandedFoldersV036.size) {
        docs.forEach(doc => {
            const company = doc.company_name;
            if (company) {
                expandedFoldersV036.add(company);
                expandedFoldersV036.add(`${company}/JUSTIFICATIFS`);
                expandedFoldersV036.add(`${company}/RELEVES`);
            }
        });
    }

    const allButton = document.createElement('button');
    allButton.className = selectedDocumentFolderV033 ? 'tree-row-v036' : 'tree-row-v036 active';
    allButton.innerHTML = `<span class="tree-chevron-v036"></span><span class="tree-label-v036">📁 Tous les documents</span><span class="tree-count-v036">${docs.length}</span>`;
    allButton.addEventListener('click', async () => {
        selectedDocumentFolderV033 = '';
        activeSmartFolderV035 = '';
        await renderDocumentFolderV033();
    });
    tree.appendChild(allButton);

    buildFolderModelV036(docs).filter(folder => shouldShowFolderV036(folder, search)).forEach(folder => {
        const button = document.createElement('button');
        button.className = selectedDocumentFolderV033 === folder.path ? 'tree-row-v036 active' : 'tree-row-v036';
        button.style.setProperty('--depth', folder.depth);
        button.title = folder.path;
        button.dataset.folderPath = folder.path;

        const expanded = expandedFoldersV036.has(folder.path);
        const chevron = folder.hasChildren ? (expanded ? '▼' : '▶') : '';
        const icon = folderIconV036(folder);
        const name = displayFolderNameV0372(folder.name);

        button.innerHTML = `
            <span class="tree-chevron-v036">${chevron}</span>
            <span class="tree-label-v036">${icon ? icon + ' ' : ''}${name}</span>
            <span class="tree-count-v036">${folder.count || ''}</span>
        `;

        button.addEventListener('click', async event => {
            const clickedChevron = event.target.classList.contains('tree-chevron-v036');
            if (folder.hasChildren && (clickedChevron || selectedDocumentFolderV033 === folder.path)) {
                if (expandedFoldersV036.has(folder.path)) expandedFoldersV036.delete(folder.path);
                else expandedFoldersV036.add(folder.path);
            }

            selectedDocumentFolderV033 = folder.path;
            activeSmartFolderV035 = '';
            await renderDocumentFolderV033();
        });

        button.addEventListener('dragover', event => event.preventDefault());
        button.addEventListener('drop', async event => {
            event.preventDefault();
            const documentId = Number(event.dataTransfer.getData('text/plain'));
            if (!documentId || folder.path.startsWith('⚠') || folder.path.startsWith('🗑')) return;
            await window.api.moveDocumentFolder({ documentId, folderPath: folder.path.replace(/^[⭐📥⚠🔗🕒🗑]\s*/, '') });
            selectedDocumentFolderV033 = folder.path;
            await loadDocuments();
        });

        tree.appendChild(button);
    });
}

function renderDocumentTableV033(container, docs) {
    if (!container) return;
    container.innerHTML = '';

    if (!docs.length) {
        container.innerHTML = '<div class="empty-state">Aucun fichier dans ce dossier.</div>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'documents-table-v033 documents-table-v0372';
    table.innerHTML = `
        <thead>
            <tr>
                <th></th>
                <th>Nom</th>
                <th>Type</th>
                <th>Date</th>
                <th>Statut</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const body = table.querySelector('tbody');
    docs.forEach(doc => {
        const tr = document.createElement('tr');
        tr.className = 'document-row-v033 document-row-v037';
        tr.dataset.documentId = doc.id;
        tr.draggable = true;
        tr.innerHTML = `
            <td><input type="checkbox"></td>
            <td>
                <span class="file-icon-v033">${docTypeIconV033(doc.doc_type)}</span>
                <strong>${Number(doc.favorite || 0) ? '⭐ ' : ''}${Number(doc.important || 0) ? '📌 ' : ''}${doc.filename}</strong>
                <small>${doc.company_name || 'Non classé'} · ${getDocFolderV033(doc)}</small>
            </td>
            <td>${docTypeLabelV033(doc.doc_type)}</td>
            <td>${doc.detected_date || (doc.added_at || '').slice(0, 10)}</td>
            <td>${doc.status === 'matched' ? '✅ Rapproché' : '🟡 Non rapproché'}</td>
        `;

        tr.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', String(doc.id)));

        tr.addEventListener('click', event => {
            if (event.target.tagName === 'INPUT') return;
            selectedDocumentV033 = doc;
            document.querySelectorAll('.document-row-v033').forEach(row => row.classList.remove('selected'));
            tr.classList.add('selected');
            renderDocumentPreviewV033(doc);
        });

        tr.addEventListener('dblclick', async event => {
            event.preventDefault();
            await window.api.openFile(doc.filepath);
        });

        tr.addEventListener('contextmenu', event => {
            event.preventDefault();
            selectedDocumentV033 = doc;
            currentContextDocumentV037 = doc;
            document.querySelectorAll('.document-row-v033').forEach(row => row.classList.remove('selected'));
            tr.classList.add('selected');
            renderDocumentPreviewV033(doc);
            showDocumentContextMenuV037(event.clientX, event.clientY, doc);
        });

        body.appendChild(tr);
    });

    container.appendChild(table);
}

function renderDocumentPreviewV033(doc) {
    const title = document.getElementById('documentPreviewTitleV033');
    const preview = document.getElementById('documentPreviewV033');
    if (!preview) return;

    if (!doc) {
        if (title) title.textContent = 'Aperçu';
        preview.className = 'document-preview-v033 empty-state';
        preview.textContent = 'Sélectionne un document.';
        return;
    }

    if (title) title.textContent = doc.filename;
    preview.className = 'document-preview-v033';

    document.querySelectorAll('.document-preview-tabs-v033 button').forEach(button => {
        button.classList.toggle('active', button.dataset.previewTab === previewTabV036);
    });

    const safePath = String(doc.filepath || '').replace(/\\/g, '/');
    const lower = String(doc.filename || '').toLowerCase();

    let content = '';
    if (previewTabV036 === 'preview') {
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
            content = `<img src="file:///${safePath}" alt="${doc.filename}">`;
        } else if (lower.endsWith('.pdf')) {
            content = `<iframe class="pdf-frame-v034" src="file:///${safePath}"></iframe>`;
        } else {
            content = `<div class="pdf-placeholder-v033">📄<br>${doc.filename}<br><span>Double-clic ou clic droit pour ouvrir.</span></div>`;
        }
    }

    if (previewTabV036 === 'info') {
        content = `
            <div class="document-info-v033">
                <strong>Informations document</strong>
                <span>Nom : ${doc.filename}</span>
                <span>Type : ${docTypeLabelV033(doc.doc_type)}</span>
                <span>Société : ${doc.company_name || 'Non classé'}</span>
                <span>Dossier : ${getDocFolderV033(doc)}</span>
                <span>Date : ${doc.detected_date || 'Non détectée'}</span>
                <span>Montant : ${doc.detected_amount ? formatAmount(doc.detected_amount) : '—'}</span>
                <span>Fournisseur : ${doc.detected_supplier || '—'}</span>
                <span>Tiers associé : ${doc.third_party_name || '—'}</span>
                <span>Référence : ${doc.detected_reference || '—'}</span>
                <span>Favori : ${Number(doc.favorite || 0) ? 'Oui' : 'Non'}</span>
                <span>Important : ${Number(doc.important || 0) ? 'Oui' : 'Non'}</span>
            </div>
        `;
    }

    if (previewTabV036 === 'ocr') {
        content = `
            <div class="document-info-v033">
                <strong>OCR / données détectées</strong>
                <span>Fournisseur : ${doc.detected_supplier || '—'}</span>
                <span>Date : ${doc.detected_date || '—'}</span>
                <span>Montant : ${doc.detected_amount ? formatAmount(doc.detected_amount) : '—'}</span>
                <span>Référence : ${doc.detected_reference || '—'}</span>
                <textarea readonly>${doc.ocr_text || 'OCR complet non disponible pour ce document.'}</textarea>
            </div>
        `;
    }

    if (previewTabV036 === 'links') {
        content = `
            <div class="document-info-v033">
                <strong>Liens</strong>
                <span>Statut : ${doc.status === 'matched' ? 'Rapproché' : 'Non rapproché'}</span>
                <span>Opération liée : ${doc.transaction_label || 'Aucune'}</span>
                <span>Date opération : ${doc.date_operation || '—'}</span>
                <span>Montant opération : ${doc.transaction_amount ? formatAmount(doc.transaction_amount) : '—'}</span>
                <p class="muted">Le rapprochement se fait dans le module Rapprochements.</p>
            </div>
        `;
    }

    if (previewTabV036 === 'history') {
        getHistoryHtmlV037(doc).then(html => {
            preview.innerHTML = html;
        });
        return;
    }

    preview.innerHTML = content;
}



// ===========================
// Focus Compta V0.38 - Dashboard société + feuilles de caisse
// ===========================

async function loadCompanyDashboardV038(companyId) {
    if (!companyId) return;

    const dashboard = await window.api.getCompanyDashboard(companyId);
    if (!dashboard) return;

    selectedCompany = dashboard.company;

    const summary = document.getElementById('dashboardAccountSummary');
    const panel = document.getElementById('dashboardPanel');
    if (summary) summary.style.display = 'grid';
    if (panel) panel.style.display = 'grid';

    document.getElementById('dashboardTitle').textContent = `Tableau de bord — ${dashboard.company.name}`;
    document.getElementById('dashboardSubtitle').textContent = `Vue consolidée de tous les comptes bancaires et feuilles de caisse.`;

    const totals = dashboard.totals || {};
    const cash = dashboard.cash || {};

    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    set('dashboardTreasuryTotal', formatAmount(totals.balance || 0));
    set('dashboardTotalOps', totals.operations || 0);
    set('dashboardVerifiedOps', totals.verified || 0);
    set('dashboardMissingOps', totals.missing || 0);
    set('dashboardCreditTotal', formatAmount(totals.credit || 0));
    set('dashboardDebitTotal', formatAmount(Math.abs(totals.debit || 0)));
    set('dashboardCashCa', formatAmount(cash.totalInvoiced || 0));
    set('dashboardMissingAmount', formatAmount(totals.missingAmount || 0));
    set('dashboardMissingCount', `${totals.missing || 0} opération(s)`);

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
        alert('Sélectionne d’abord une société.');
        return;
    }

    const files = await window.api.selectCashSheets();
    if (!files || files.length === 0) return;

    const result = await window.api.importCashSheets({
        companyId: selectedCompany.id,
        files
    });

    let message = `${result.importedCount || 0} feuille(s) de caisse importée(s).`;
    if (result.errorCount) {
        message += `\n${result.errorCount} erreur(s) :\n` + (result.errors || []).map(e => `- ${e.filename}: ${e.message}`).join('\n');
    }
    if (result.imported && result.imported.length) {
        message += `\n\nCA détecté :\n` + result.imported.map(row => `- ${row.filename}: ${formatAmount(row.netCaTtc || row.invoicedCa || 0)}`).join('\n');
    }
    alert(message);
    await loadCompanyDashboardV038(selectedCompany.id);
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
                if (selectedCompany) await loadCompanyDashboardV038(selectedCompany.id);
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
            await loadCompanyDashboardV038(company.id);
            showPage('dashboardPage');
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

const originalLoadCompanyDashboardV039 = typeof loadCompanyDashboardV038 === 'function' ? loadCompanyDashboardV038 : null;
loadCompanyDashboardV038 = async function(companyId) {
    if (originalLoadCompanyDashboardV039) await originalLoadCompanyDashboardV039(companyId);

    const dashboard = await window.api.getCompanyDashboard(companyId);
    if (!dashboard) return;

    const cash = dashboard.cash || {};
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    set('dashboardCashCa', formatAmount(cash.lastMonth?.net_ca_ttc || cash.totalNetTtc || 0));

    const cashMonths = document.getElementById('dashboardCashMonths');
    if (cashMonths) {
        cashMonths.innerHTML = '';
        (cash.byMonth || []).slice().reverse().slice(0, 6).forEach(row => {
            const remise = row.gross_ca_ht ? (row.discount_ht / row.gross_ca_ht) * 100 : 0;
            const li = document.createElement('li');
            li.innerHTML = `<span>${monthNameV039(row.month)} ${row.year}</span><strong>${formatAmount(row.net_ca_ttc)}</strong><small>Remise ${remise.toFixed(1)} % · Écarts ${formatAmount(row.ecarts)}</small>`;
            cashMonths.appendChild(li);
        });
        if (!(cash.byMonth || []).length) {
            const li = document.createElement('li');
            li.className = 'muted';
            li.textContent = 'Aucune feuille de caisse importée.';
            cashMonths.appendChild(li);
        }
    }

    set('dashboardCashPaymentMix', `CA net TTC ${formatAmount(cash.lastMonth?.net_ca_ttc || cash.totalNetTtc || 0)} · TP ${formatAmount(cash.totalTiersPayant || 0)} · Acomptes ${formatAmount(cash.totalAcomptes || 0)} · Écarts ${formatAmount(cash.totalEcarts || 0)}`);

    renderCashTrendChartV039(cash.byMonth || []);
};

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
        alert(`Impossible de charger le tableau de bord société : ${error.message || error}`);
        return;
    }

    if (!dashboard) {
        alert('Tableau de bord introuvable pour cette société.');
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

    set('dashboardTitle', `Tableau de bord — ${company.name || 'Société sélectionnée'}`);
    set('dashboardSubtitle', 'Vue consolidée de tous les comptes bancaires et feuilles de caisse.');

    const totals = dashboard.totals || {};
    const cash = dashboard.cash || {};

    set('dashboardTreasuryTotal', formatAmount(totals.balance || 0));
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
// Focus Compta V0.39.6 - Aperçu document dans Rapprochements
// ===========================

function matchingPreviewHtmlV0396(doc) {
    const safePath = String(doc.filepath || '').replace(/\\/g, '/');
    const lower = String(doc.filename || '').toLowerCase();
    let previewContent = '';

    if (lower.endsWith('.pdf')) {
        previewContent = `<iframe class="matching-doc-preview-frame-v0396" src="file:///${safePath}"></iframe>`;
    } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
        previewContent = `<img class="matching-doc-preview-image-v0396" src="file:///${safePath}" alt="${doc.filename}">`;
    } else {
        previewContent = `<div class="matching-doc-preview-placeholder-v0396">Aperçu indisponible pour ce type de fichier.</div>`;
    }

    return `
        <div class="matching-doc-info-v0396">
            <strong>${doc.filename}</strong>
            <p>${documentTypeLabelV030(doc.doc_type || 'facture')}</p>
            <p>Montant : ${doc.detected_amount ? formatAmount(doc.detected_amount) : 'Non détecté'}</p>
            <p>Date : ${doc.detected_date || 'Non détectée'}</p>
            <p>Référence : ${doc.detected_reference || 'Non détectée'}</p>
            <p>Fournisseur : ${doc.detected_supplier || 'Non détecté'}</p>
            <button id="openMatchingDocV030">Ouvrir le document</button>
        </div>
        <div class="matching-doc-preview-v0396">
            ${previewContent}
        </div>
    `;
}

const originalShowMatchingSuggestionsV0396 = typeof showMatchingSuggestions === 'function' ? showMatchingSuggestions : null;
showMatchingSuggestions = async function(doc) {
    const preview = document.getElementById('matchingPreview');
    if (preview && doc) {
        preview.innerHTML = matchingPreviewHtmlV0396(doc);
        const open = document.getElementById('openMatchingDocV030');
        if (open) open.addEventListener('click', async () => await window.api.openFile(doc.filepath));
    }

    if (!originalShowMatchingSuggestionsV0396) return;

    await originalShowMatchingSuggestionsV0396(doc);

    // L'ancienne fonction réécrit le panneau ; on remet l'aperçu enrichi après elle.
    if (preview && doc) {
        preview.innerHTML = matchingPreviewHtmlV0396(doc);
        const open = document.getElementById('openMatchingDocV030');
        if (open) open.addEventListener('click', async () => await window.api.openFile(doc.filepath));
    }
};


// ===========================
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

renameDocumentV033 = async function(doc) {
    const name = await askInputV0397('Renommer le document', 'Nouveau nom', doc.filename);
    if (!name || name === doc.filename) return;
    const result = await window.api.renameDocument({ documentId: doc.id, newFilename: name });
    if (result && result.ok === false) alert(result.message || 'Renommage impossible.');
    await loadDocuments();
};

moveDocumentV033 = async function(doc) {
    const folder = await askInputV0397('Déplacer le document', 'Nouveau dossier logique', getDocFolderV033(doc));
    if (!folder) return;
    const result = await window.api.moveDocumentFolder({ documentId: doc.id, folderPath: folder });
    if (result && result.ok === false) alert(result.message || 'Déplacement impossible.');
    selectedDocumentFolderV033 = folder;
    await loadDocuments();
};

associateThirdPartyV037 = async function(doc) {
    const value = await askInputV0397('Associer un tiers', 'Nom du tiers', doc.third_party_name || doc.detected_supplier || '');
    if (value === null) return;
    await window.api.updateDocumentThirdParty({ documentId: doc.id, thirdPartyName: value });
    await loadDocuments();
};

changeDocumentTypeV033 = async function(doc) {
    if (!doc) return;
    const type = await askInputV0397('Modifier le type', 'facture, avoir, releve, contrat, rib, divers', doc.doc_type || 'facture');
    if (!type) return;
    await window.api.updateDocumentType({ documentId: doc.id, docType: type });
    await loadDocuments();
};

tagDocumentV036 = async function(doc) {
    // Tags désactivés dans l'UX Focus Compta.
    return;
};

function renderMatchCardsV0397(container, doc, matches) {
    container.innerHTML = '';
    if (!matches || !matches.length) {
        container.innerHTML = '<div class="empty-state">Aucune opération trouvée.</div>';
        return;
    }

    matches.forEach(match => {
        const card = document.createElement('article');
        card.className = 'match-card';
        const delta = doc.detected_amount ? Math.abs(Math.abs(Number(match.amount || 0)) - Math.abs(Number(doc.detected_amount || 0))) : null;
        card.innerHTML = `
            <strong>${match.date_operation || ''} — ${match.label}</strong>
            <span>${formatAmount(match.amount)}${match.match_score !== undefined ? ` · score ${match.match_score}` : ''}${delta !== null ? ` · écart ${formatAmount(delta)}` : ''}</span>
            <button>Associer</button>
        `;
        card.querySelector('button').addEventListener('click', async () => {
            await window.api.linkDocumentToTransaction({ documentId: doc.id, transactionId: match.id });
            if (selectedBankAccount) await refreshAccountView(false);
            await loadMatchingPage();
            await loadDocuments();
        });
        container.appendChild(card);
    });
}

const originalShowMatchingSuggestionsV0397 = typeof showMatchingSuggestions === 'function' ? showMatchingSuggestions : null;
showMatchingSuggestions = async function(doc) {
    const suggestions = document.getElementById('matchingSuggestionList');
    const help = document.getElementById('matchingHelp');

    if (help) help.textContent = `Suggestions pour ${doc.filename}`;
    if (!suggestions) return;

    if (originalShowMatchingSuggestionsV0397) {
        await originalShowMatchingSuggestionsV0397(doc);
    }

    if (!selectedCompany) return;

    const currentHtml = suggestions.innerHTML;
    suggestions.innerHTML = `
        <div class="matching-search-v0397">
            <input id="matchingSearchInputV0397" placeholder="Rechercher une opération : fournisseur, montant, libellé...">
            <button id="matchingSearchButtonV0397">Rechercher</button>
        </div>
        <div id="matchingSearchResultsV0397"></div>
        <div id="matchingSuggestedResultsV0397">${currentHtml}</div>
    `;

    const input = document.getElementById('matchingSearchInputV0397');
    const button = document.getElementById('matchingSearchButtonV0397');
    const results = document.getElementById('matchingSearchResultsV0397');

    const runSearch = async () => {
        const query = input.value.trim();
        if (!query) {
            results.innerHTML = '';
            return;
        }

        results.innerHTML = '<div class="empty-state">Recherche...</div>';
        const matches = await window.api.searchTransactionsForDocument({
            companyId: selectedCompany.id,
            query,
            limit: 30
        });

        results.innerHTML = '<h3>Résultats de recherche</h3>';
        const list = document.createElement('div');
        results.appendChild(list);
        renderMatchCardsV0397(list, doc, matches);
    };

    button.addEventListener('click', runSearch);
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') runSearch();
    });
};


// ===========================
// Focus Compta V0.39.8 - Associer rapprochements réparé + statut Validé
// ===========================

async function associateDocumentToTransactionV0398(doc, transactionId) {
    const result = await window.api.linkDocumentToTransaction({ documentId: doc.id, transactionId });
    if (result && result.ok === false) {
        alert('Association impossible.');
        return;
    }

    if (selectedBankAccount) await refreshAccountView(false);
    await loadMatchingPage();
    await loadDocuments();
}

function renderMatchCardV0398(container, doc, match) {
    const card = document.createElement('article');
    card.className = 'match-card';
    const delta = doc.detected_amount
        ? Math.abs(Math.abs(Number(match.amount || 0)) - Math.abs(Number(doc.detected_amount || 0)))
        : null;

    card.innerHTML = `
        <strong>${match.date_operation || ''} — ${match.label}</strong>
        <span>${formatAmount(match.amount)}${match.match_score !== undefined ? ` · score ${match.match_score}` : ''}${delta !== null ? ` · écart ${formatAmount(delta)}` : ''}</span>
        <button type="button">Associer</button>
    `;

    card.querySelector('button').addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        await associateDocumentToTransactionV0398(doc, match.id);
    });

    container.appendChild(card);
}

function renderMatchesV0398(container, doc, matches, emptyText = 'Aucune opération trouvée.') {
    container.innerHTML = '';
    if (!matches || !matches.length) {
        container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
        return;
    }
    matches.forEach(match => renderMatchCardV0398(container, doc, match));
}

showMatchingSuggestions = async function(doc) {
    const suggestions = document.getElementById('matchingSuggestionList');
    const preview = document.getElementById('matchingPreview');
    const help = document.getElementById('matchingHelp');

    if (help) help.textContent = `Suggestions pour ${doc.filename}`;

    if (preview && typeof matchingPreviewHtmlV0396 === 'function') {
        preview.innerHTML = matchingPreviewHtmlV0396(doc);
        const open = document.getElementById('openMatchingDocV030');
        if (open) open.addEventListener('click', async () => await window.api.openFile(doc.filepath));
    }

    if (!suggestions) return;

    if (!selectedCompany) {
        suggestions.innerHTML = '<div class="empty-state">Sélectionne une société.</div>';
        return;
    }

    suggestions.innerHTML = `
        <div class="matching-search-v0397">
            <input id="matchingSearchInputV0397" placeholder="Rechercher une opération : fournisseur, montant, libellé...">
            <button id="matchingSearchButtonV0397" type="button">Rechercher</button>
        </div>
        <div id="matchingSearchResultsV0397"></div>
        <h3>Suggestions</h3>
        <div id="matchingSuggestedResultsV0397"><div class="empty-state">Recherche des suggestions...</div></div>
    `;

    const suggested = document.getElementById('matchingSuggestedResultsV0397');
    const matches = await window.api.findDocumentMatches({
        companyId: selectedCompany.id,
        documentId: doc.id,
        limit: 10
    });
    renderMatchesV0398(suggested, doc, matches, 'Aucune suggestion. Utilise la recherche manuelle ci-dessus.');

    const input = document.getElementById('matchingSearchInputV0397');
    const button = document.getElementById('matchingSearchButtonV0397');
    const results = document.getElementById('matchingSearchResultsV0397');

    const runSearch = async () => {
        const query = input.value.trim();
        if (!query) {
            results.innerHTML = '';
            return;
        }

        results.innerHTML = '<div class="empty-state">Recherche...</div>';
        const rows = await window.api.searchTransactionsForDocument({
            companyId: selectedCompany.id,
            query,
            limit: 30
        });

        results.innerHTML = '<h3>Résultats de recherche</h3>';
        const list = document.createElement('div');
        list.className = 'matching-result-list-v0398';
        results.appendChild(list);
        renderMatchesV0398(list, doc, rows);
    };

    button.addEventListener('click', runSearch);
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') runSearch();
    });
};
