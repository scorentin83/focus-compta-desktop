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
        await selectCompany(company, true);
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
    document.getElementById('statementSection').style.display = 'none';
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
    if (!toolbar || !count) return;
    count.textContent = selectedTransactionIds.size;
    toolbar.style.display = selectedTransactionIds.size > 0 ? 'flex' : 'none';
    if (all) all.checked = false;
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

    document.getElementById('bankAccountForm').style.display = 'none';
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

    document.getElementById('statementSection').style.display = 'block';
    document.getElementById('summaryCards').style.display = 'grid';
    document.getElementById('toolsPanel').style.display = 'grid';
    document.getElementById('dashboardPanel').style.display = 'grid';
    document.getElementById('transactionTable').style.display = 'table';
    document.getElementById('statementSidebar').style.display = 'block';

    document.getElementById('bankAccountEdit').style.display = 'none';
    document.getElementById('bankAccountForm').style.display = 'none';
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
    homeCompanyCards.innerHTML = '';

    if (companies.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'Aucune société créée pour le moment.';
        companyList.appendChild(empty.cloneNode(true));
        homeCompanyCards.appendChild(empty);
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
        homeCompanyCards.appendChild(makeCompanyCard(company, { subtitle, details }));
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
        if (pageId === 'settingsPage') await loadCategoryOptions();
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

    document.getElementById('bankAccountForm').style.display = 'none';
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
        document.getElementById('bankAccountEdit').style.display = 'none';
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
            document.getElementById('bankAccountEdit').style.display = 'none';
            document.getElementById('selectedAccountTitle').textContent = 'Sélectionne un compte bancaire';
            await loadBankAccounts();
        }
    });
}

async function importStatementsFlow() {
    if (!selectedBankAccount) return;

    const pdfs = await window.api.selectPdf();
    if (!pdfs || pdfs.length === 0) return;

    const files = Array.isArray(pdfs) ? pdfs : [pdfs];
    const bulk = await window.api.addStatementsBulk({
        bankAccountId: selectedBankAccount.id,
        files
    });

    let message = `Import terminé\n\n${bulk.importedCount} relevé(s) importé(s)\n${bulk.skippedCount} ignoré(s)\n${bulk.transactionsCount} opération(s) ajoutée(s)`;
    const notBalanced = (bulk.results || []).filter(row => row.imported && row.importReport && !row.importReport.isBalanced);
    if (notBalanced.length > 0) {
        message += `\n\n⚠️ ${notBalanced.length} relevé(s) avec écart de contrôle.`;
    }
    alert(message);

    const lastImported = [...(bulk.results || [])].reverse().find(row => row.imported);
    if (lastImported) selectedStatementId = String(lastImported.statementId);

    await refreshAccountView(true);
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

async function loadDocuments() {
    const list = document.getElementById('documentList');
    if (!list) return;
    list.innerHTML = '';

    const docs = await window.api.getDocuments({
        companyId: selectedCompany ? selectedCompany.id : null,
        filters: {
            status: document.getElementById('documentStatusFilter')?.value || 'all',
            search: document.getElementById('documentSearch')?.value || ''
        }
    });

    const stats = document.getElementById('documentStatsV023');
    if (stats) {
        const matched = docs.filter(doc => doc.status === 'matched').length;
        const unmatched = docs.length - matched;
        stats.textContent = `${docs.length} document(s) · ${matched} rapproché(s) · ${unmatched} à rapprocher`;
    }

    if (docs.length === 0) {
        list.innerHTML = '<div class="empty-state">Aucun document. Importez des factures ou ajoutez une PJ depuis une opération.</div>';
        return;
    }

    docs.forEach(doc => {
        const item = document.createElement('article');
        item.className = `document-card ${doc.status === 'matched' ? 'matched' : 'unmatched'}`;
        item.innerHTML = `
            <div class="document-card-main">
                <strong>${doc.filename}</strong>
                <span>${doc.status === 'matched' ? '✅ Rapproché' : '🟡 À rapprocher'}</span>
                <span>${doc.detected_amount ? formatAmount(doc.detected_amount) : 'Montant non détecté'}</span>
                ${doc.transaction_label ? `<small>Lié à : ${doc.date_operation || ''} — ${doc.transaction_label} · ${formatAmount(doc.transaction_amount)}</small>` : '<small>Non lié à une opération.</small>'}
            </div>
            <div class="button-row">
                <button class="open-doc">Ouvrir</button>
                <button class="match-doc">Suggestions</button>
                <button class="manual-doc">Associer manuellement</button>
                <button class="danger-button delete-doc">Supprimer</button>
            </div>
        `;

        item.querySelector('.open-doc').addEventListener('click', async () => await window.api.openFile(doc.filepath));
        item.querySelector('.delete-doc').addEventListener('click', async () => {
            if (!confirm(`Supprimer ce document ?\n${doc.filename}`)) return;
            await window.api.deleteDocument(doc.id);
            await loadDocuments();
        });
        item.querySelector('.match-doc').addEventListener('click', async () => await showDocumentMatches(doc.id));
        item.querySelector('.manual-doc').addEventListener('click', async () => await showManualDocumentLink(doc.id, doc.filename));
        list.appendChild(item);
    });
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

const importDocumentsButton = document.getElementById('importDocuments');
if (importDocumentsButton) {
    importDocumentsButton.addEventListener('click', async () => {
        const files = await window.api.selectDocuments();
        if (!files || files.length === 0) return;
        const result = await window.api.addDocuments({ companyId: selectedCompany ? selectedCompany.id : null, files });
        alert(`${result.addedCount} document(s) ajouté(s).`);
        await loadDocuments();
    });
}

['documentStatusFilter', 'documentSearch'].forEach(id => {
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
