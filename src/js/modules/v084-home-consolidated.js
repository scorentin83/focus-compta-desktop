// Focus Compta V0.84 — Accueil consolidé dynamique par structure.
(function focusHomeConsolidatedV084() {
    function esc(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function num(value) { return Number(value || 0); }
    function money(value) {
        if (typeof formatAmount === 'function') return formatAmount(value);
        return `${num(value).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
    }

    function roleLabel(role) {
        if (role === 'admin') return 'Administrateur';
        if (role === 'direction') return 'Direction';
        if (role === 'collaborateur') return 'Collaborateur';
        if (role === 'expert_comptable') return 'Expert-comptable';
        return role || 'Utilisateur';
    }

    function firstName(name) {
        const clean = String(name || '').trim();
        if (!clean) return 'Corentin';
        return clean.split(/\s+/)[0];
    }

    async function getCurrentUserV084() {
        try { return window.api?.getCurrentUserV081 ? await window.api.getCurrentUserV081() : null; } catch (_) { return null; }
    }

    async function updateGreetingV084() {
        const target = document.getElementById('homeGreetingV084');
        if (!target) return;
        const user = await getCurrentUserV084();
        target.textContent = `Ravi de vous revoir ${firstName(user?.displayName || user?.display_name || user?.name)} 👋`;
    }

    function statusForRow(row) {
        if (row.statementGaps > 0 || Math.abs(row.cashEcarts) > 50) return { tone: 'danger', label: 'À contrôler' };
        if (row.actions > 0) return { tone: 'warning', label: 'À vérifier' };
        return { tone: 'ok', label: 'À jour' };
    }

    async function statementGapsForCompany(companyId) {
        let gaps = 0;
        try {
            const accounts = await window.api.getBankAccounts(companyId);
            for (const account of (accounts || [])) {
                const statements = await window.api.getStatements(account.id);
                for (const statement of (statements || [])) {
                    if (typeof statementHasControlGap === 'function' && statementHasControlGap(statement)) gaps += 1;
                }
            }
        } catch (_) {}
        return gaps;
    }

    async function collectCompanyV084(company) {
        const row = {
            company,
            treasury: 0,
            missingBank: 0,
            documents: 0,
            documentsToTreat: 0,
            payable: 0,
            vat: 0,
            cashAcomptes: 0,
            cashEcarts: 0,
            statementGaps: 0,
            actions: 0
        };

        try {
            const dashboard = await window.api.getCompanyDashboard(company.id);
            row.treasury = num(dashboard?.treasury?.total ?? dashboard?.totals?.balance ?? 0);
            row.missingBank = num(dashboard?.totals?.missing ?? 0);
        } catch (_) {}

        try {
            const docs = window.api.getDocumentsDashboard
                ? await window.api.getDocumentsDashboard({ companyId: company.id })
                : null;
            row.documents = num(docs?.total);
            row.documentsToTreat = num(docs?.unmatched);
            row.payable = num(docs?.payable_ttc);
            row.vat += num(docs?.vat_detected) * -1;
        } catch (_) {}

        try {
            const cash = window.api.getCashSheetInsights
                ? await window.api.getCashSheetInsights({ companyId: company.id })
                : null;
            row.cashAcomptes = num(cash?.totalAcomptes);
            row.cashEcarts = num(cash?.totalEcarts);
            row.vat += num(cash?.totalTvaNette);
        } catch (_) {}

        row.statementGaps = await statementGapsForCompany(company.id);
        row.actions = row.missingBank + row.documentsToTreat + row.statementGaps;
        return row;
    }

    function metric(label, value, extra = '') {
        return `<div class="home-card-metric-v084"><span>${esc(label)}</span><strong>${esc(value)}</strong>${extra ? `<small>${esc(extra)}</small>` : ''}</div>`;
    }

    function companyCard(row) {
        const status = statusForRow(row);
        return `
            <article class="home-company-card-v084 ${status.tone}" data-company-id="${esc(row.company.id)}">
                <div class="home-company-card-head-v084">
                    <div>
                        <h2>${esc(row.company.name)}</h2>
                    </div>
                    <span class="home-company-status-v084 ${status.tone}" title="${esc(status.label)}">●</span>
                </div>
                <div class="home-card-metrics-v084">
                    ${metric('Trésorerie', money(row.treasury))}
                    ${metric('À rapprocher', row.missingBank)}
                    ${metric('Documents', row.documentsToTreat)}
                    ${metric('TVA estimée', money(row.vat))}
                </div>
                <button class="home-open-company-v084" type="button" data-company-id="${esc(row.company.id)}">Ouvrir la structure →</button>
            </article>`;
    }

    function allCompaniesCard(rows) {
        const totals = rows.reduce((acc, row) => {
            acc.treasury += num(row.treasury);
            acc.actions += num(row.actions);
            acc.documents += num(row.documentsToTreat);
            acc.missing += num(row.missingBank);
            acc.vat += num(row.vat);
            acc.payable += num(row.payable);
            acc.gaps += num(row.statementGaps);
            return acc;
        }, { treasury: 0, actions: 0, documents: 0, missing: 0, vat: 0, payable: 0, gaps: 0 });
        const tone = totals.gaps > 0 ? 'danger' : (totals.actions > 0 ? 'warning' : 'ok');
        const label = totals.actions > 0 ? `${totals.actions} point(s) à suivre` : 'Groupe à jour';
        return `
            <article class="home-company-card-v084 all-companies-v084 ${tone}" data-all-companies="1">
                <div class="home-company-card-head-v084">
                    <div>
                        <h2>Toutes les sociétés</h2>
                    </div>
                    <span class="home-company-status-v084 ${tone}" title="${esc(label)}">●</span>
                </div>
                <div class="home-card-metrics-v084">
                    ${metric('Trésorerie consolidée', money(totals.treasury))}
                    ${metric('À rapprocher', totals.missing)}
                    ${metric('Documents', totals.documents)}
                    ${metric('TVA estimée', money(totals.vat))}
                </div>
            </article>`;
    }

    async function openCompanyV084(companyId, companies) {
        const company = (companies || []).find(c => String(c.id) === String(companyId));
        if (!company) return;
        if (typeof selectCompany === 'function') await selectCompany(company, false);
        if (typeof renderSelectedCompanyDossierV050 === 'function') await renderSelectedCompanyDossierV050();
        if (typeof showPage === 'function') showPage('companiesPage');
    }

    async function renderHomeCardsV084(companies) {
        const holder = document.getElementById('homeCompanyCardsV084');
        if (!holder) return;
        let list = Array.isArray(companies) ? companies : [];
        if (!list.length && window.api?.getCompanies) {
            try { list = await window.api.getCompanies(); } catch (_) { list = []; }
        }
        if (!list.length) {
            holder.innerHTML = `
                <article class="home-company-card-v084 empty-v084">
                    <h2>Aucune structure créée</h2>
                    <p>Créez votre première société pour démarrer Focus Compta.</p>
                    <button type="button" class="home-open-company-v084" data-page="companiesPage">Créer une structure →</button>
                </article>`;
            holder.querySelector('[data-page]')?.addEventListener('click', event => showPage(event.currentTarget.dataset.page));
            return;
        }
        const rows = [];
        for (const company of list) rows.push(await collectCompanyV084(company));
        holder.innerHTML = [allCompaniesCard(rows), ...rows.map(companyCard)].join('');
        holder.querySelectorAll('[data-company-id]').forEach(btn => {
            btn.addEventListener('click', event => openCompanyV084(event.currentTarget.dataset.companyId, list));
        });
        // La carte consolidée est informative pour l'instant : pas d'action associée.
    }

    function toggleHomeContextV084(pageId) {
        const isHome = pageId === 'homePage';
        document.body.classList.toggle('home-consolidated-active-v084', isHome);
        document.body.dataset.focusActivePage = pageId || '';
    }

    const previousShowPage = typeof showPage === 'function' ? showPage : null;
    window.showPage = showPage = function showPageV084(pageId) {
        if (previousShowPage) previousShowPage(pageId);
        toggleHomeContextV084(pageId);
        if (pageId === 'homePage') {
            updateGreetingV084();
            renderHomeCardsV084();
        }
    };

    window.renderHomeConsolidatedV084 = async function renderHomeConsolidatedV084(companies) {
        await updateGreetingV084();
        await renderHomeCardsV084(companies);
        toggleHomeContextV084(document.querySelector('.page-section.active-page')?.id || 'homePage');
        try { document.dispatchEvent(new CustomEvent('focus-cockpit-rendered')); } catch (_) {}
    };

    window.loadHomeInsights = loadHomeInsights = async function loadHomeInsightsV084(companies) {
        await window.renderHomeConsolidatedV084(companies);
    };

    document.addEventListener('DOMContentLoaded', () => {
        updateGreetingV084();
        renderHomeCardsV084();
        toggleHomeContextV084(document.querySelector('.page-section.active-page')?.id || 'homePage');
        const observer = new MutationObserver(() => {
            toggleHomeContextV084(document.querySelector('.page-section.active-page')?.id || 'homePage');
        });
        observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
    });
})();
