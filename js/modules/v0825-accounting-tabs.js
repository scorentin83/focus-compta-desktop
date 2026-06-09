// Focus Compta V0.82.5 - Comptabilité en onglets
(function initAccountingTabsV0825() {
    function activateAccountingTab(tab) {
        const key = tab || 'controls';
        document.querySelectorAll('.accounting-tab-v0825').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.accountingTab === key);
        });
        document.querySelectorAll('.accounting-tab-panel-v0825').forEach(panel => {
            panel.classList.toggle('active', panel.dataset.accountingPanel === key);
        });
        try { localStorage.setItem('focusComptaAccountingTabV0825', key); } catch (_) {}
        if (key === 'vat' && typeof window.refreshVatCenterV073 === 'function') {
            setTimeout(window.refreshVatCenterV073, 30);
        }
        if (key === 'expert' && typeof window.refreshAccountingControlV047 === 'function') {
            setTimeout(window.refreshAccountingControlV047, 30);
        }
    }

    function bind() {
        document.querySelectorAll('.accounting-tab-v0825').forEach(btn => {
            btn.addEventListener('click', () => activateAccountingTab(btn.dataset.accountingTab));
        });
        document.querySelectorAll('[data-accounting-tab-jump]').forEach(btn => {
            btn.addEventListener('click', () => activateAccountingTab(btn.dataset.accountingTabJump));
        });
        const saved = localStorage.getItem('focusComptaAccountingTabV0825');
        activateAccountingTab(saved || 'controls');
    }

    window.activateAccountingTabV0825 = activateAccountingTab;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
})();
