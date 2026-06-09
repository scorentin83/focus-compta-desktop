// Focus Compta V0.55 - correctifs finaux + cockpit actionnable + apprentissage bancaire
(function focusV055LatestUpgrade() {
    const SYSTEM_CATEGORIES_V055 = new Set(['banque', 'salaires', 'tva', 'ventes', 'achats']);

    function toast(message, type = 'success') {
        if (typeof window.focusToastV041 === 'function') return window.focusToastV041(message, type);
        if (typeof window.showToast === 'function') return window.showToast(message, type);
        console.log(`[Focus Compta] ${message}`);
    }

    function normalize(value) {
        return String(value || '').trim();
    }

    function uniqCategories(values) {
        const map = new Map();
        (values || []).map(normalize).filter(Boolean).forEach(value => {
            const key = value.toLocaleLowerCase('fr-FR');
            if (!map.has(key)) map.set(key, value);
        });
        return [...map.values()].sort((a, b) => a.localeCompare(b, 'fr'));
    }

    function getCategories() {
        return typeof window.focusGetCustomCategoriesV0405 === 'function' ? window.focusGetCustomCategoriesV0405() : [];
    }

    function saveCategories(categories) {
        if (typeof window.focusSaveCustomCategoriesV0405 === 'function') window.focusSaveCustomCategoriesV0405(uniqCategories(categories));
    }

    function createModalShell(id) {
        let modal = document.getElementById(id);
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = id;
        modal.className = 'focus-modal-v055 hidden';
        document.body.appendChild(modal);
        return modal;
    }

    function askTextV055(title, label, defaultValue = '') {
        if (typeof window.showTextInputModal === 'function' && window.showTextInputModal !== askTextV055) {
            return window.showTextInputModal(title, label, defaultValue);
        }
        return new Promise(resolve => {
            const modal = createModalShell('focusTextModalV055');
            modal.innerHTML = `
                <div class="focus-modal-card-v055">
                    <h3>${title}</h3>
                    <label>${label}<input id="focusTextInputV055" type="text" value="${String(defaultValue || '').replace(/"/g, '&quot;')}"></label>
                    <div class="focus-modal-actions-v055">
                        <button type="button" id="focusTextCancelV055" class="secondary-button">Annuler</button>
                        <button type="button" id="focusTextOkV055">Enregistrer</button>
                    </div>
                </div>`;
            modal.classList.remove('hidden');
            const input = modal.querySelector('#focusTextInputV055');
            const close = value => { modal.classList.add('hidden'); resolve(value); };
            modal.querySelector('#focusTextCancelV055').onclick = () => close('');
            modal.querySelector('#focusTextOkV055').onclick = () => close(input.value.trim());
            input.onkeydown = event => {
                if (event.key === 'Enter') close(input.value.trim());
                if (event.key === 'Escape') close('');
            };
            window.setTimeout(() => input.focus(), 0);
        });
    }

    function askConfirmV055(title, message, okLabel = 'Confirmer') {
        if (typeof window.showFocusConfirmModalV0412 === 'function') {
            return window.showFocusConfirmModalV0412(title, message, okLabel, 'Annuler');
        }
        return new Promise(resolve => {
            const modal = createModalShell('focusConfirmModalV055');
            modal.innerHTML = `
                <div class="focus-modal-card-v055">
                    <h3>${title}</h3>
                    <p>${message}</p>
                    <div class="focus-modal-actions-v055">
                        <button type="button" id="focusConfirmCancelV055" class="secondary-button">Annuler</button>
                        <button type="button" id="focusConfirmOkV055">${okLabel}</button>
                    </div>
                </div>`;
            modal.classList.remove('hidden');
            const close = value => { modal.classList.add('hidden'); resolve(value); };
            modal.querySelector('#focusConfirmCancelV055').onclick = () => close(false);
            modal.querySelector('#focusConfirmOkV055').onclick = () => close(true);
        });
    }

    async function refreshCategoryConsumers() {
        try { window.dispatchEvent(new CustomEvent('focus-taxonomies-updated-v0405')); } catch (_) {}
        try {
            document.querySelectorAll('select.inline-category-select, #detailCategory, #bulkCategory, #automationCategoryV031').forEach(select => {
                const current = select.value;
                if (typeof window.focusPopulateCategorySelectV0405 === 'function') {
                    window.focusPopulateCategorySelectV0405(select, select.id === 'detailCategory' ? 'Non catégorisé' : undefined);
                    select.value = current;
                }
            });
        } catch (_) {}
        try { if (typeof window.loadCategoryRules === 'function') await window.loadCategoryRules(); } catch (_) {}
        try { if (typeof window.loadTransactions === 'function') await window.loadTransactions(); } catch (_) {}
    }

    async function renameCategoryV055(category) {
        const oldName = normalize(category);
        const next = await askTextV055('Modifier la catégorie', `Nouveau nom pour “${oldName}”`, oldName);
        const nextName = normalize(next);
        if (!nextName || nextName.toLocaleLowerCase('fr-FR') === oldName.toLocaleLowerCase('fr-FR')) return;
        const categories = getCategories().map(item => String(item).toLocaleLowerCase('fr-FR') === oldName.toLocaleLowerCase('fr-FR') ? nextName : item);
        saveCategories(categories);
        try { if (window.api?.renameCategoryEverywhere) await window.api.renameCategoryEverywhere({ oldName, newName: nextName }); } catch (error) { console.error(error); }
        await refreshCategoryConsumers();
        toast('Catégorie renommée.');
    }

    async function deleteCategoryV055(category) {
        const name = normalize(category);
        if (SYSTEM_CATEGORIES_V055.has(name.toLocaleLowerCase('fr-FR'))) {
            toast('Cette catégorie système est protégée.', 'warning');
            return;
        }
        const ok = await askConfirmV055('Supprimer la catégorie', `Supprimer “${name}” de la liste métier ? Les opérations déjà classées conservent leur historique.`, 'Supprimer');
        if (!ok) return;
        saveCategories(getCategories().filter(item => String(item).toLocaleLowerCase('fr-FR') !== name.toLocaleLowerCase('fr-FR')));
        try { if (window.api?.applyCategoryDeletion) await window.api.applyCategoryDeletion({ oldName: name, mode: 'keep', newName: '' }); } catch (error) { console.error(error); }
        await refreshCategoryConsumers();
        toast('Catégorie supprimée de la liste.');
    }

    function bindCategoryButtonsWithoutPrompt() {
        document.addEventListener('click', event => {
            const list = event.target?.closest?.('#settingsCategoriesListV0405');
            const button = event.target?.closest?.('button');
            if (!list || !button) return;
            const li = button.closest('li');
            const category = li?.querySelector('span')?.textContent?.trim();
            if (!category) return;
            const actionText = button.textContent.trim().toLocaleLowerCase('fr-FR');
            if (!actionText.includes('modifier') && !actionText.includes('supprimer')) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            if (actionText.includes('modifier')) renameCategoryV055(category).catch(console.error);
            else deleteCategoryV055(category).catch(console.error);
        }, true);
    }

    function keywordFromLabel(label) {
        return normalize(label)
            .replace(/\s+/g, ' ')
            .replace(/^(prlv|virement|cb|sepa|vir|paiement)\s+/i, '')
            .slice(0, 80);
    }

    async function learnCategoryRuleFromTransaction(label, category) {
        const cleanCategory = normalize(category);
        const keyword = keywordFromLabel(label);
        if (!keyword || !cleanCategory || cleanCategory === 'Non catégorisé') return;
        try {
            if (window.api?.addCategoryRule) {
                await window.api.addCategoryRule({ keyword, category: cleanCategory });
                toast(`Règle mémorisée : “${keyword}” → ${cleanCategory}.`);
                if (typeof window.loadCategoryRules === 'function') await window.loadCategoryRules();
            }
        } catch (error) {
            console.error('Apprentissage bancaire impossible', error);
        }
    }

    function bindBankCategoryLearning() {
        document.addEventListener('change', event => {
            const select = event.target?.closest?.('select.inline-category-select');
            if (!select) return;
            const row = select.closest('tr');
            const label = row?.children?.[2]?.textContent || '';
            window.setTimeout(() => learnCategoryRuleFromTransaction(label, select.value), 100);
        }, true);

        document.addEventListener('click', event => {
            const save = event.target?.closest?.('#saveTransactionDetails');
            if (!save) return;
            const category = document.getElementById('detailCategory')?.value || '';
            let label = '';
            try { label = selectedTransaction?.label || selectedTransaction?.description || ''; } catch (_) {}
            window.setTimeout(() => learnCategoryRuleFromTransaction(label, category), 200);
        }, true);
    }

    function improveCockpitActionability() {
        const home = document.getElementById('homePage');
        if (!home) return;
        let isRendering = false;
        let lastSignature = '';
        let scheduled = null;

        const collectAlerts = () => [...document.querySelectorAll('#v050AlertsList .alert-line-v050')]
            .map(el => {
                const label = el.querySelector('span')?.textContent?.replace(/\s+/g, ' ').trim() || '';
                const value = el.querySelector('strong')?.textContent?.replace(/\s+/g, ' ').trim() || '';
                const page = el.dataset.page || 'homePage';
                const numeric = Number((value.match(/\d+/) || ['0'])[0]);
                return { label, value, page, numeric };
            })
            .filter(item => item.label);

        const render = () => {
            if (isRendering) return;
            const alerts = collectAlerts();
            const actionable = alerts.filter(item => item.numeric > 0).slice(0, 5);
            const signature = actionable.map(item => `${item.label}:${item.value}`).join('|');
            if (signature === lastSignature && document.getElementById('v055ActionNowBox')) return;
            lastSignature = signature;
            isRendering = true;
            try {
                let box = document.getElementById('v055ActionNowBox');
                if (!box) {
                    box = document.createElement('section');
                    box.id = 'v055ActionNowBox';
                    box.className = 'panel clean-panel cockpit-panel-v050 action-now-v055';
                    const grid = document.querySelector('.cockpit-grid-v050');
                    if (grid) grid.prepend(box);
                }
                if (box) {
                    box.innerHTML = `
                        <div class="panel-heading"><span>À traiter maintenant</span><h3>${actionable.length ? 'Priorités concrètes' : 'Rien d’urgent'}</h3></div>
                        <div class="action-now-list-v055">
                            ${actionable.length ? actionable.map(item => `
                                <button type="button" class="action-line-v055" data-page="${item.page}">
                                    <span>${item.label}</span>
                                    <strong>${item.value}</strong>
                                </button>`).join('') : '<div class="action-line-v055 is-empty"><span>Aucune action bloquante détectée</span><strong>OK</strong></div>'}
                        </div>`;
                    box.querySelectorAll('[data-page]').forEach(btn => {
                        btn.onclick = () => typeof showPage === 'function' && showPage(btn.dataset.page);
                    });
                }
                const subtitle = document.getElementById('v050GlobalStatusSubtitle');
                if (subtitle && actionable.length) subtitle.textContent = actionable.map(item => `${item.label} : ${item.value}`).join(' · ');
            } finally {
                window.setTimeout(() => { isRendering = false; }, 0);
            }
        };

        const schedule = () => {
            if (scheduled) window.clearTimeout(scheduled);
            scheduled = window.setTimeout(render, 120);
        };

        render();
        const alertsNode = document.getElementById('v050AlertsList');
        if (alertsNode) new MutationObserver(schedule).observe(alertsNode, { childList: true, subtree: true, characterData: true });
        document.addEventListener('focus-cockpit-rendered', schedule);
    }

    function init() {
        bindCategoryButtonsWithoutPrompt();
        bindBankCategoryLearning();
        improveCockpitActionability();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
