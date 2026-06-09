// Focus Compta V0.54.2 - correctifs Banque + Listes métier
// 1) Les clics sur les en-têtes de colonnes trient sans ouvrir le détail opération.
// 2) Les catégories métier deviennent modifiables et supprimables depuis Paramètres.
(function focusV0542Fixes() {
    function uniqCategories(values) {
        const map = new Map();
        (values || []).map(v => String(v || '').trim()).filter(Boolean).forEach(value => {
            const key = value.toLocaleLowerCase('fr-FR');
            if (!map.has(key)) map.set(key, value);
        });
        return [...map.values()].sort((a, b) => a.localeCompare(b, 'fr'));
    }

    function toast(message, type = 'success') {
        if (typeof window.focusToastV041 === 'function') return window.focusToastV041(message, type);
        if (typeof window.showToast === 'function') return window.showToast(message, type);
        console.log(`[Focus Compta] ${message}`);
    }


    function askTextV0832({ title = 'Modifier', label = 'Valeur', value = '' } = {}) {
        return new Promise(resolve => {
            const modal = document.createElement('div');
            modal.className = 'sticky-note-modal-v0832 active';
            modal.innerHTML = `
                <div class="sticky-note-modal-backdrop-v0832" data-text-cancel></div>
                <div class="sticky-note-modal-card-v0832 small" role="dialog" aria-modal="true">
                    <span class="eyebrow">Paramètres</span>
                    <h2>${title}</h2>
                    <label>${label}<input id="textModalInputV0832" type="text" value="${String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}"></label>
                    <div class="button-row">
                        <button type="button" data-text-save>Enregistrer</button>
                        <button type="button" class="secondary-button" data-text-cancel>Annuler</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            const input = modal.querySelector('#textModalInputV0832');
            const close = result => { modal.remove(); resolve(result); };
            modal.querySelectorAll('[data-text-cancel]').forEach(btn => btn.addEventListener('click', () => close(null)));
            modal.querySelector('[data-text-save]')?.addEventListener('click', () => close(input?.value || ''));
            input?.addEventListener('keydown', event => { if (event.key === 'Enter') close(input.value || ''); });
            setTimeout(() => { input?.focus(); input?.select(); }, 50);
        });
    }

    async function refreshCategoryConsumers() {
        try { window.dispatchEvent(new CustomEvent('focus-taxonomies-updated-v0405')); } catch (_) {}
        try {
            document.querySelectorAll('select.inline-category-select, #detailCategory, #categoryName, #automationCategoryV031').forEach(select => {
                const current = select.value;
                if (typeof window.focusPopulateCategorySelectV0405 === 'function') {
                    window.focusPopulateCategorySelectV0405(select, select.id === 'detailCategory' ? 'Non catégorisé' : undefined);
                    select.value = current;
                }
            });
        } catch (_) {}
        try {
            if (typeof window.loadTransactions === 'function') await window.loadTransactions();
        } catch (_) {}
    }

    function bindBankHeaderSortFix() {
        document.addEventListener('click', event => {
            const sortButton = event.target && event.target.closest ? event.target.closest('[data-bank-sort]') : null;
            if (!sortButton) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            try {
                if (typeof window.setBankSortOptionsV0415 === 'function') window.setBankSortOptionsV0415(sortButton.dataset.bankSort);
                if (typeof window.applyBankFiltersV0413 === 'function') window.applyBankFiltersV0413(false).catch(console.error);
            } catch (error) {
                console.error('Tri banque impossible', error);
            }
        }, true);

        document.addEventListener('mousedown', event => {
            const inHeader = event.target && event.target.closest ? event.target.closest('#transactionTable thead') : null;
            if (inHeader) event.stopPropagation();
        }, true);
    }

    async function renameCategory(category) {
        const next = await askTextV0832({ title: 'Renommer la catégorie', label: `Nouveau nom pour “${category}”`, value: category });
        if (!next || next.trim().toLocaleLowerCase('fr-FR') === String(category).trim().toLocaleLowerCase('fr-FR')) return;
        const nextName = next.trim();
        const categories = typeof window.focusGetCustomCategoriesV0405 === 'function' ? window.focusGetCustomCategoriesV0405() : [];
        const renamed = categories.map(item => String(item).toLocaleLowerCase('fr-FR') === String(category).toLocaleLowerCase('fr-FR') ? nextName : item);
        if (typeof window.focusSaveCustomCategoriesV0405 === 'function') window.focusSaveCustomCategoriesV0405(uniqCategories(renamed));
        try {
            if (window.api && window.api.renameCategoryEverywhere) await window.api.renameCategoryEverywhere({ oldName: category, newName: nextName });
        } catch (error) {
            console.error('Renommage catégorie partiel', error);
        }
        renderBusinessCategories();
        await refreshCategoryConsumers();
        toast('Catégorie renommée.');
    }

    async function deleteCategory(category) {
        const confirmed = window.confirm(`Supprimer la catégorie “${category}” de la liste métier ?\n\nLes opérations déjà classées peuvent conserver cette valeur, mais elle ne sera plus proposée dans les menus.`);
        if (!confirmed) return;
        const categories = typeof window.focusGetCustomCategoriesV0405 === 'function' ? window.focusGetCustomCategoriesV0405() : [];
        const kept = categories.filter(item => String(item).toLocaleLowerCase('fr-FR') !== String(category).toLocaleLowerCase('fr-FR'));
        if (typeof window.focusSaveCustomCategoriesV0405 === 'function') window.focusSaveCustomCategoriesV0405(uniqCategories(kept));
        // Supprime aussi les règles automatiques liées si l'API est disponible, sans effacer l'historique bancaire.
        try {
            if (window.api && window.api.applyCategoryDeletion) await window.api.applyCategoryDeletion({ oldName: category, mode: 'keep', newName: '' });
        } catch (error) {
            console.error('Suppression catégorie partielle', error);
        }
        renderBusinessCategories();
        await refreshCategoryConsumers();
        toast('Catégorie supprimée de la liste.');
    }

    function renderBusinessCategories() {
        const list = document.getElementById('settingsCategoriesListV0405');
        if (!list || typeof window.focusGetCustomCategoriesV0405 !== 'function') return;
        const categories = window.focusGetCustomCategoriesV0405();
        list.innerHTML = '';
        if (!categories.length) {
            list.innerHTML = '<li class="muted">Aucune catégorie.</li>';
            return;
        }
        categories.forEach(category => {
            const li = document.createElement('li');
            li.className = 'editable-category-row-v0542';
            const label = document.createElement('span');
            label.textContent = category;
            const actions = document.createElement('span');
            actions.className = 'row-actions-v0406';
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.textContent = 'Modifier';
            edit.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                renameCategory(category).catch(console.error);
            });
            const del = document.createElement('button');
            del.type = 'button';
            del.textContent = 'Supprimer';
            del.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                deleteCategory(category).catch(console.error);
            });
            actions.appendChild(edit);
            actions.appendChild(del);
            li.appendChild(label);
            li.appendChild(actions);
            list.appendChild(li);
        });
    }

    function bindCategorySettingsFix() {
        const addButton = document.getElementById('addSettingsCategoryV0405');
        const input = document.getElementById('settingsCategoryInputV0405');
        if (addButton && !addButton.dataset.v0542Bound) {
            addButton.dataset.v0542Bound = '1';
            addButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                const value = input ? input.value.trim() : '';
                if (!value) return;
                const categories = typeof window.focusGetCustomCategoriesV0405 === 'function' ? window.focusGetCustomCategoriesV0405() : [];
                if (typeof window.focusSaveCustomCategoriesV0405 === 'function') window.focusSaveCustomCategoriesV0405(uniqCategories([...categories, value]));
                if (input) input.value = '';
                renderBusinessCategories();
                refreshCategoryConsumers();
                toast('Catégorie ajoutée.');
            }, true);
        }
        renderBusinessCategories();
        window.addEventListener('focus-taxonomies-updated-v0405', () => window.setTimeout(renderBusinessCategories, 0));
    }

    function init() {
        bindBankHeaderSortFix();
        bindCategorySettingsFix();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
