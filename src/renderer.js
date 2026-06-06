let selectedCompany = null;
let selectedBankAccount = null;

async function loadCompanies() {
    const companies = await window.api.getCompanies();

    const list = document.getElementById('companyList');
    list.innerHTML = '';

    companies.forEach(company => {
        const li = document.createElement('li');
        li.textContent = company.name;
        li.className = 'clickable';

        li.addEventListener('click', async () => {
            selectedCompany = company;
            selectedBankAccount = null;

            document.getElementById('selectedCompanyTitle').textContent = company.name;
            document.getElementById('bankSection').style.display = 'block';

            document.getElementById('selectedAccountTitle').textContent = 'Sélectionne un compte bancaire';
            document.getElementById('statementSection').style.display = 'none';

            await loadBankAccounts();
        });

        list.appendChild(li);
    });
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

            document.getElementById('selectedAccountTitle').textContent = title;
            document.getElementById('statementSection').style.display = 'block';

            await loadStatements();
        });

        list.appendChild(li);
    });
}

async function loadStatements() {
    if (!selectedBankAccount) return;

    const statements = await window.api.getStatements(selectedBankAccount.id);

    const list = document.getElementById('statementList');
    list.innerHTML = '';

    statements.forEach(statement => {
        const li = document.createElement('li');

        li.textContent = `${statement.filename} — importé le ${statement.imported_at}`;

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

    await window.api.addStatement({
        bankAccountId: selectedBankAccount.id,
        filename: pdf.filename,
        filepath: pdf.filepath
    });

    await loadStatements();
});

loadCompanies();