let selectedCompany = null;
let selectedBankAccount = null;
let selectedStatementId = 'all';
let selectedTransaction = null;
let searchTimer = null;

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

    accounts.forEach(account => {
        const li = document.createElement('li');

        const title = [
            account.bank_name,
            account.account_name,
            account.iban
        ].filter(Boolean).join(' — ');

        li.textContent = title;
        li.className = 'clickable';

        li.addEventListener('click', async () => {
            selectedBankAccount = account;
            selectedStatementId = 'all';

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

            resetTransactionDetail();
            await refreshAccountView(true);
        });

        list.appendChild(li);
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

    if (transactions.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="7" class="muted">Aucune opération ne correspond aux filtres.</td>';
        body.appendChild(tr);
        return;
    }

    transactions.forEach(transaction => {
        const tr = document.createElement('tr');
        tr.className = 'transaction-row';

        const amount = Number(transaction.amount || 0);
        const amountClass = amount >= 0 ? 'amount-credit' : 'amount-debit';

        tr.innerHTML = `
            <td>${transaction.date_operation || ''}</td>
            <td>${transaction.label || ''}</td>
            <td class="${amountClass}">${formatAmount(amount)}</td>
            <td>${transaction.category || '<span class="muted">Non catégorisé</span>'}</td>
            <td>${getStatusLabel(transaction.status)}</td>
            <td>${transaction.receipts_count || 0}</td>
            <td>${transaction.statement_filename || ''}</td>
        `;

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
    await 

document.querySelectorAll('.nav-button, .nav-shortcut').forEach(button => {
    button.addEventListener('click', () => {
        const pageId = button.dataset.page;
        if (pageId) showPage(pageId);
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

loadCompanies();
});

document.getElementById('newBankAccount').addEventListener('click', async () => {
    if (!selectedCompany) return;

    const bankNameInput = document.getElementById('bankName');
    const accountNameInput = document.getElementById('accountName');
    const ibanInput = document.getElementById('iban');

    const bankName = bankNameInput.value.trim();
    const accountName = accountNameInput.value.trim();
    const iban = ibanInput.value.trim();

    if (!bankName) return;

    await window.api.addBankAccount({
        companyId: selectedCompany.id,
        bankName,
        accountName,
        iban
    });

    bankNameInput.value = '';
    accountNameInput.value = '';
    ibanInput.value = '';

    await loadBankAccounts();
});

document.getElementById('importStatement').addEventListener('click', async () => {
    if (!selectedBankAccount) return;

    const pdf = await window.api.selectPdf();
    if (!pdf) return;

    const result = await window.api.addStatement({
        bankAccountId: selectedBankAccount.id,
        filename: pdf.filename,
        filepath: pdf.filepath
    });

    if (!result.imported) {
        alert(result.message);
    } else {
        alert(`${result.transactionsCount} opération(s) détectée(s)`);
        selectedStatementId = String(result.statementId);
    }

    await refreshAccountView(true);
});

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
        filepath: receipt.filepath
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



document.querySelectorAll('.nav-button, .nav-shortcut').forEach(button => {
    button.addEventListener('click', () => {
        const pageId = button.dataset.page;
        if (pageId) showPage(pageId);
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

loadCompanies();
