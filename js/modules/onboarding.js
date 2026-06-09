// Focus Compta V0.40.1 - Assistant de démarrage
(function initOnboardingWizardV0401() {
    let step = 0;
    let company = null;

    const $ = (id) => document.getElementById(id);

    function setStatus(id, message, kind = '') {
        const el = $(id);
        if (!el) return;
        el.textContent = message;
        el.className = `onboarding-status ${kind}`.trim();
    }

    function syncStepUi() {
        document.querySelectorAll('#onboardingSteps li').forEach(item => {
            const itemStep = Number(item.dataset.step);
            item.classList.toggle('active', itemStep === step);
            item.classList.toggle('done', itemStep < step);
        });
        document.querySelectorAll('.onboarding-pane').forEach(pane => {
            pane.classList.toggle('active', Number(pane.dataset.pane) === step);
        });
        const prev = $('onboardingPrev');
        const next = $('onboardingNext');
        if (prev) prev.disabled = step === 0;
        if (next) next.textContent = step === 3 ? 'Terminer' : 'Suivant';
    }

    async function refreshCompanies() {
        const list = $('onboardingCompanyChoices');
        if (!list || !window.api?.getCompanies) return;
        const companies = await window.api.getCompanies();
        list.innerHTML = '';
        if (!companies.length) {
            list.innerHTML = '<p class="muted">Aucune société existante.</p>';
            return;
        }
        companies.forEach(row => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'onboarding-choice';
            button.textContent = row.name;
            button.addEventListener('click', async () => {
                company = row;
                if (typeof selectCompany === 'function') await selectCompany(row, false);
                await refreshAccounts();
                step = 1;
                syncStepUi();
            });
            list.appendChild(button);
        });
    }

    async function refreshAccounts() {
        const label = $('onboardingSelectedCompanyLabel');
        const list = $('onboardingAccountList');
        if (label) label.textContent = company ? `Société sélectionnée : ${company.name}` : 'Aucune société sélectionnée.';
        if (!list) return;
        list.innerHTML = '';
        if (!company) {
            list.innerHTML = '<li class="muted">Sélectionne d’abord une société.</li>';
            return;
        }
        const accounts = await window.api.getBankAccounts(company.id);
        if (!accounts.length) {
            list.innerHTML = '<li class="muted">Aucun compte ajouté pour le moment.</li>';
            return;
        }
        accounts.forEach(account => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${account.bank_name || 'Banque'} — ${account.account_name || 'Compte'}</span><strong>${account.iban || account.account_number || ''}</strong>`;
            list.appendChild(li);
        });
    }

    async function createCompanyFromWizard() {
        const input = $('onboardingCompanyName');
        const name = (input?.value || '').trim();
        if (!name) return;
        await window.api.addCompany(name);
        const companies = await window.api.getCompanies();
        company = companies.find(row => row.name === name) || companies[companies.length - 1] || null;
        if (input) input.value = '';
        if (typeof loadCompanies === 'function') await loadCompanies();
        if (company && typeof selectCompany === 'function') await selectCompany(company, false);
        await refreshCompanies();
        await refreshAccounts();
        step = 1;
        syncStepUi();
    }

    async function addAccountFromWizard() {
        if (!company) {
            step = 0;
            syncStepUi();
            return;
        }
        const data = {
            companyId: company.id,
            bankName: ($('onboardingBankName')?.value || '').trim(),
            accountName: ($('onboardingAccountName')?.value || '').trim(),
            accountNumber: ($('onboardingAccountNumber')?.value || '').trim(),
            iban: ($('onboardingIban')?.value || '').trim(),
            bic: ($('onboardingBic')?.value || '').trim()
        };
        if (!data.bankName) return;
        await window.api.addBankAccount(data);
        ['onboardingBankName','onboardingAccountName','onboardingAccountNumber','onboardingIban','onboardingBic'].forEach(id => { const el = $(id); if (el) el.value = ''; });
        if (typeof loadBankAccounts === 'function') await loadBankAccounts();
        await refreshAccounts();
    }

    async function importStatementsFromWizard() {
        if (!company) {
            step = 0;
            syncStepUi();
            return;
        }
        if (typeof selectCompany === 'function') await selectCompany(company, false);
        if (typeof importStatementsFlow === 'function') {
            await importStatementsFlow();
            setStatus('onboardingStatementStatus', 'Import terminé ou annulé. Vérifie le détail dans Banque.', 'success');
        } else {
            setStatus('onboardingStatementStatus', 'Import indisponible : module Banque non chargé.', 'danger');
        }
    }

    async function importCashSheetsFromWizard() {
        if (!company) {
            step = 0;
            syncStepUi();
            return;
        }
        selectedCompany = company;
        if (typeof importCashSheetsV038 === 'function') {
            await importCashSheetsV038();
            setStatus('onboardingCashStatus', 'Import terminé ou annulé. Vérifie le détail dans Tableau de bord.', 'success');
        } else {
            setStatus('onboardingCashStatus', 'Import indisponible : module Dashboard non chargé.', 'danger');
        }
    }

    async function openWizard() {
        const modal = $('onboardingWizard');
        if (!modal) return;
        if (!company && selectedCompany) company = selectedCompany;
        modal.style.display = 'flex';
        await refreshCompanies();
        await refreshAccounts();
        syncStepUi();
    }

    function closeWizard() {
        const modal = $('onboardingWizard');
        if (modal) modal.style.display = 'none';
    }

    function bind() {
        $('openOnboardingWizard')?.addEventListener('click', openWizard);
        $('closeOnboardingWizard')?.addEventListener('click', closeWizard);
        $('onboardingCreateCompany')?.addEventListener('click', createCompanyFromWizard);
        $('onboardingAddAccount')?.addEventListener('click', addAccountFromWizard);
        $('onboardingImportStatements')?.addEventListener('click', importStatementsFromWizard);
        $('onboardingImportCashSheets')?.addEventListener('click', importCashSheetsFromWizard);
        $('onboardingPrev')?.addEventListener('click', () => { step = Math.max(0, step - 1); syncStepUi(); });
        $('onboardingNext')?.addEventListener('click', () => {
            if (step === 3) { closeWizard(); return; }
            step = Math.min(3, step + 1);
            syncStepUi();
        });
        document.querySelectorAll('[data-onboarding-page]').forEach(button => {
            button.addEventListener('click', async () => {
                closeWizard();
                const page = button.dataset.onboardingPage;
                if (page === 'dashboardPage' && company && typeof loadCompanyDashboardV038 === 'function') await loadCompanyDashboardV038(company.id);
                if (page && typeof showPage === 'function') showPage(page);
            });
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && $('onboardingWizard')?.style.display === 'flex') closeWizard();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();
