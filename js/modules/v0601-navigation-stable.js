// Focus Compta V0.60.1 — Stabilisation navigation et suppression des doubles rendus
(function initFocusComptaV0601NavigationStable() {
    'use strict';

    const VALID_PAGES = new Set([
        'homePage', 'companiesPage', 'bankPage', 'receiptsPage',
        'matchingPage', 'thirdPartiesPage', 'accountingPage', 'exportsPage', 'settingsPage'
    ]);

    let currentPage = document.querySelector('.page-section.active-page')?.id || 'homePage';
    let loadingToken = 0;

    function normalizePage(pageId) {
        if (pageId === 'dashboardPage') return 'homePage';
        return VALID_PAGES.has(pageId) ? pageId : 'homePage';
    }

    function setActivePage(pageId) {
        const target = normalizePage(pageId);
        currentPage = target;
        document.querySelectorAll('.page-section').forEach(section => {
            section.classList.toggle('active-page', section.id === target);
        });
        document.querySelectorAll('.nav-button').forEach(button => {
            button.classList.toggle('active', button.dataset.page === target);
        });
        document.body.dataset.focusActivePage = target;
        return target;
    }

    async function runLoader(pageId, token) {
        try {
            if (pageId === 'receiptsPage' && typeof window.loadDocuments === 'function') await window.loadDocuments();
            if (pageId === 'matchingPage' && typeof window.loadMatchingPage === 'function') await window.loadMatchingPage();
            if (pageId === 'thirdPartiesPage' && typeof window.loadThirdParties === 'function') await window.loadThirdParties();
            if (pageId === 'accountingPage') {
                if (typeof window.refreshAccountingControlV047 === 'function') await window.refreshAccountingControlV047();
                if (typeof window.refreshVatCenterV073 === 'function') await window.refreshVatCenterV073();
            }
            if (pageId === 'settingsPage') {
                if (typeof window.loadCategoryOptions === 'function') await window.loadCategoryOptions();
                if (typeof window.loadAutomationRulesV031 === 'function') await window.loadAutomationRulesV031();
            }
        } catch (error) {
            console.warn('Chargement page interrompu', pageId, error);
        } finally {
            if (token === loadingToken) setActivePage(pageId);
        }
    }

    function stableShowPage(pageId) {
        const target = setActivePage(pageId);
        const token = ++loadingToken;
        Promise.resolve().then(() => runLoader(target, token));
        return target;
    }

    function bindNavigationOnce() {
        document.querySelectorAll('.nav-button, .nav-shortcut, [data-page]').forEach(button => {
            if (button.dataset.boundV0601 === '1') return;
            button.dataset.boundV0601 = '1';
            button.addEventListener('click', event => {
                const page = button.dataset.page;
                if (!page || !VALID_PAGES.has(page)) return;
                event.preventDefault();
                event.stopPropagation();
                if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
                stableShowPage(page);
            }, true);
        });
    }

    function protectActivePage() {
        const active = document.querySelector('.page-section.active-page')?.id;
        const activeNav = document.querySelector('.nav-button.active')?.dataset?.page;
        if (active && activeNav && active !== activeNav) setActivePage(currentPage || active);
    }

    function init() {
        window.showPage = stableShowPage;
        try { showPage = stableShowPage; } catch (_) {}
        bindNavigationOnce();
        setActivePage(currentPage);
        document.addEventListener('click', event => {
            if (event.target?.closest?.('[data-page]')) setTimeout(protectActivePage, 0);
        }, true);
        const observer = new MutationObserver(() => bindNavigationOnce());
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
