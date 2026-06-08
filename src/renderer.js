// Focus Compta V0.40
// Le renderer principal a été volontairement allégé.
// Modules chargés depuis index.html : core, banque, documents, rapprochements, tiers, dashboard, paramètres.


// Focus Compta V0.41.9 - restauration fiable au démarrage
(function initFocusComptaStartupV0419() {
    async function boot() {
        try {
            if (typeof loadCompanies === 'function') {
                await loadCompanies();
            }

            if (!window.api || typeof window.api.getCompanies !== 'function') return;
            const companies = await window.api.getCompanies();
            if (!Array.isArray(companies) || companies.length === 0) {
                if (typeof updateCompanyContextBar === 'function') await updateCompanyContextBar();
                return;
            }

            if (typeof selectedCompany !== 'undefined' && selectedCompany) {
                if (typeof updateCompanyContextBar === 'function') await updateCompanyContextBar();
                return;
            }

            let storedId = null;
            try { storedId = localStorage.getItem('focus_active_company_id'); } catch (_) {}
            const restored = companies.find(company => String(company.id) === String(storedId)) || companies[0];

            if (restored && typeof selectCompany === 'function') {
                await selectCompany(restored, false);
            }
        } catch (error) {
            console.error('Initialisation Focus Compta V0.41.9 impossible', error);
            if (typeof focusToastV041 === 'function') {
                focusToastV041(`Chargement initial incomplet : ${error.message || error}`, 'warning');
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
