// Focus Compta V0.40 module
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

const matchingRefreshButton = document.getElementById('matchingRefresh');
if (matchingRefreshButton) matchingRefreshButton.addEventListener('click', loadMatchingPage);

const parametresRefreshThirdPartiesButton = document.getElementById('refreshThirdParties');
if (parametresRefreshThirdPartiesButton) parametresRefreshThirdPartiesButton.addEventListener('click', loadThirdParties);


// V0.31 - multisélection : cocher/décocher toutes les lignes visibles
(function selectAllTransactionsV031() {
    const bind = () => {
        const selectAll = document.getElementById('selectAllTransactions');
        if (!selectAll || selectAll.dataset.v031Bound) return;
        selectAll.dataset.v031Bound = '1';

        selectAll.addEventListener('change', () => {
            document.querySelectorAll('.transaction-check').forEach(check => {
                check.checked = selectAll.checked;
                const id = Number(check.dataset.transactionId);
                if (selectAll.checked) selectedTransactionIds.add(id);
                else selectedTransactionIds.delete(id);
            });
            updateBulkToolbar();
        });
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();


function automationStatusLabelV0404(status) {
    const labels = {
        verified: 'Validé',
        attached: 'Pièce jointe',
        missing: 'Justificatif manquant',
        review: 'À vérifier',
        ignored: 'Validé sans justificatif'
    };
    return labels[status] || '';
}

function automationTargetLabelV0404(target) {
    const labels = {
        all: 'Compte + libellé + tiers',
        account_name: 'Nom du compte',
        label: 'Libellé opération',
        third_party_name: 'Fournisseur / tiers'
    };
    return labels[target] || labels.all;
}


async function loadAutomationStatsV072() {
    const box = document.getElementById('automationStatsV072');
    if (!box || !window.api.getAutomationStatsV072) return;
    const stats = await window.api.getAutomationStatsV072({ companyId: selectedCompany ? selectedCompany.id : null });
    box.className = 'automation-stats-v072';
    box.innerHTML = `
        <div><strong>${stats.activeRules || 0}</strong><span>règles actives</span></div>
        <div><strong>${stats.averageConfidence || 0}%</strong><span>confiance moyenne</span></div>
        <div><strong>${stats.pendingSuggestions || 0}</strong><span>suggestions Banque</span></div>
        <div><strong>${stats.usages || 0}</strong><span>utilisations</span></div>
    `;
}

async function loadAutomationRulesV031() {
    await loadAutomationStatsV072();
    const list = document.getElementById('automationRulesListV031');
    if (!list) return;
    const rules = await window.api.getAutomationRules({ companyId: selectedCompany ? selectedCompany.id : null });
    list.innerHTML = '';
    if (!rules.length) {
        list.innerHTML = '<li class="muted">Aucune règle. Utilise les modèles rapides ou ajoute ta première règle.</li>';
        return;
    }
    rules.forEach(rule => {
        const li = document.createElement('li');
        const actions = [];
        if (rule.category) actions.push(`catégorie <strong>${rule.category}</strong>`);
        if (rule.status) actions.push(`statut <strong>${getStatusLabel(rule.status)}</strong>`);
        if (rule.third_party_name) actions.push(`tiers <strong>${rule.third_party_name}</strong>`);
        const metaV072 = `Confiance ${Math.round(Number(rule.confidence || 0))}% · ${Number(rule.usage_count || 0)} utilisation(s)${Number(rule.auto_apply || 0) ? ' · auto' : ''}`;
        li.innerHTML = `
            <span><strong>Si</strong> ${automationTargetLabelV0404(rule.target)} contient <strong>${rule.keyword}</strong><br><small>${actions.join(' + ') || 'aucune action'}<br>${metaV072}</small></span>
            <span class="row-actions-v0406"><button type="button" data-action="edit">Modifier</button><button type="button" data-action="delete">Supprimer</button></span>`;
        li.querySelector('[data-action="edit"]').addEventListener('click', () => {
            const addButton = document.getElementById('addAutomationRuleV031');
            const targetEl = document.getElementById('automationTargetV0404');
            const keywordEl = document.getElementById('automationKeywordV031');
            const categoryEl = document.getElementById('automationCategoryV031');
            const statusEl = document.getElementById('automationStatusV031');
            const thirdPartyEl = document.getElementById('automationThirdPartyV0404');
            if (targetEl) targetEl.value = rule.target || 'all';
            if (keywordEl) keywordEl.value = rule.keyword || '';
            if (categoryEl) categoryEl.value = rule.category || '';
            if (statusEl) statusEl.value = rule.status || '';
            if (thirdPartyEl) thirdPartyEl.value = rule.third_party_name || '';
            if (addButton) { addButton.dataset.editingRuleId = rule.id; addButton.textContent = 'Enregistrer règle'; }
        });
        li.querySelector('[data-action="delete"]').addEventListener('click', async () => {
            if (!(await showFocusConfirmModalV0412('Supprimer la règle automatique', `Supprimer la règle automatique "${rule.keyword}" ?`, 'Supprimer', 'Annuler'))) return;
            await window.api.deleteAutomationRule(rule.id);
            await loadAutomationRulesV031();
        });
        list.appendChild(li);
    });
}

async function createAutomationRuleFromFormV0404(prefill = null) {
    const targetEl = document.getElementById('automationTargetV0404');
    const keywordEl = document.getElementById('automationKeywordV031');
    const categoryEl = document.getElementById('automationCategoryV031');
    const statusEl = document.getElementById('automationStatusV031');
    const thirdPartyEl = document.getElementById('automationThirdPartyV0404');
    const data = prefill || {
        target: targetEl ? targetEl.value : 'all',
        keyword: keywordEl ? keywordEl.value.trim() : '',
        category: categoryEl ? categoryEl.value.trim() : '',
        status: statusEl ? statusEl.value : '',
        thirdPartyName: thirdPartyEl ? thirdPartyEl.value.trim() : ''
    };
    if (!data.keyword) return;
    const addButton = document.getElementById('addAutomationRuleV031');
    const editingRuleId = addButton && addButton.dataset.editingRuleId ? Number(addButton.dataset.editingRuleId) : null;
    const payload = {
        companyId: selectedCompany ? selectedCompany.id : null,
        target: data.target || 'all',
        keyword: data.keyword,
        category: data.category || '',
        status: data.status || '',
        thirdPartyName: data.thirdPartyName || ''
    };
    if (editingRuleId && !prefill && window.api.updateAutomationRule) {
        await window.api.updateAutomationRule({ ...payload, ruleId: editingRuleId });
        delete addButton.dataset.editingRuleId;
        addButton.textContent = 'Ajouter règle';
    } else {
        await window.api.createAutomationRule(payload);
    }
    if (!prefill) {
        if (keywordEl) keywordEl.value = '';
        if (categoryEl) categoryEl.value = '';
        if (statusEl) statusEl.value = '';
        if (thirdPartyEl) thirdPartyEl.value = '';
    }
    await loadAutomationRulesV031();
}

(function automationRulesUiV031() {
    const bind = () => {
        const add = document.getElementById('addAutomationRuleV031');
        const apply = document.getElementById('applyAutomationRulesV031');
        if (add && !add.dataset.bound) {
            add.dataset.bound = '1';
            add.addEventListener('click', () => createAutomationRuleFromFormV0404());
        }
        document.querySelectorAll('.quick-rule-v0404').forEach(button => {
            if (button.dataset.bound) return;
            button.dataset.bound = '1';
            button.addEventListener('click', () => createAutomationRuleFromFormV0404({
                target: button.dataset.target || 'all',
                keyword: button.dataset.keyword || '',
                category: button.dataset.category || '',
                status: button.dataset.status || '',
                thirdPartyName: button.dataset.thirdPartyName || ''
            }));
        });
        if (apply && !apply.dataset.bound) {
            apply.dataset.bound = '1';
            apply.addEventListener('click', async () => {
                const changed = await window.api.applyAutomationRules({ companyId: selectedCompany ? selectedCompany.id : null });
                if (window.showToast) window.showToast(`${changed} opération(s) mise(s) à jour par les règles.`, 'success');
                else focusToastV041(`${changed} opération(s) mise(s) à jour par les règles.`, 'success');
                if (selectedBankAccount) await refreshAccountView(false);
                await loadAutomationRulesV031();
                if (typeof updateCompanyContextBar === 'function') updateCompanyContextBar();
            });
        }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();


// V0.33 - Documents mini Dropbox controls

// Focus Compta V0.40.5 - édition catégories/statuts depuis Paramètres
(function settingsTaxonomiesV0405() {
    function renderDatalist() {
        const datalist = document.getElementById('settingsCategoriesDatalistV0405');
        if (!datalist) return;
        datalist.innerHTML = '';
        focusGetCustomCategoriesV0405().forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            datalist.appendChild(option);
        });
    }

    function renderCategories() {
        const list = document.getElementById('settingsCategoriesListV0405');
        if (!list) return;
        const categories = focusGetCustomCategoriesV0405();
        list.innerHTML = '';
        categories.forEach(category => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${category}</span><button type="button">Supprimer</button>`;
            li.querySelector('button').addEventListener('click', () => {
                focusSaveCustomCategoriesV0405(categories.filter(item => item !== category));
                renderAll();
            });
            list.appendChild(li);
        });
        if (!categories.length) list.innerHTML = '<li class="muted">Aucune catégorie.</li>';
    }

    function renderStatuses() {
        const list = document.getElementById('settingsStatusesListV0405');
        if (!list) return;
        const statuses = focusGetCustomStatusesV0405();
        const defaultCodes = new Set(FOCUS_DEFAULT_STATUSES_V0405.map(item => item.code));
        list.innerHTML = '';
        statuses.forEach(status => {
            const locked = defaultCodes.has(status.code);
            const li = document.createElement('li');
            li.innerHTML = `<span>${status.icon ? status.icon + ' ' : ''}${status.label}<small>${status.code}</small></span>${locked ? '<em>Par défaut</em>' : '<button type="button">Supprimer</button>'}`;
            const button = li.querySelector('button');
            if (button) button.addEventListener('click', () => {
                focusSaveCustomStatusesV0405(statuses.filter(item => item.code !== status.code));
                renderAll();
            });
            list.appendChild(li);
        });
    }

    function renderStatusSelects() {
        focusPopulateStatusSelectV0405(document.getElementById('automationStatusV031'), { empty: 'Ne pas changer le statut' });
        focusPopulateStatusSelectV0405(document.getElementById('statusFilter'), { all: true });
        focusPopulateStatusSelectV0405(document.getElementById('bulkStatus'), { empty: 'Statut...' });
        focusPopulateStatusSelectV0405(document.getElementById('detailStatus'));
    }

    function renderAll() {
        renderDatalist();
        renderCategories();
        renderStatuses();
        renderStatusSelects();
    }

    function bind() {
        renderAll();
        const addCategory = document.getElementById('addSettingsCategoryV0405');
        const categoryInput = document.getElementById('settingsCategoryInputV0405');
        if (addCategory && !addCategory.dataset.bound) {
            addCategory.dataset.bound = '1';
            addCategory.addEventListener('click', () => {
                const value = categoryInput ? categoryInput.value.trim() : '';
                if (!value) return;
                focusSaveCustomCategoriesV0405([...focusGetCustomCategoriesV0405(), value]);
                if (categoryInput) categoryInput.value = '';
                renderAll();
            });
        }

        const addStatus = document.getElementById('addSettingsStatusV0405');
        const labelInput = document.getElementById('settingsStatusLabelV0405');
        const codeInput = document.getElementById('settingsStatusCodeV0405');
        if (addStatus && !addStatus.dataset.bound) {
            addStatus.dataset.bound = '1';
            addStatus.addEventListener('click', () => {
                const label = labelInput ? labelInput.value.trim() : '';
                if (!label) return;
                const code = focusSlugV0405(codeInput && codeInput.value.trim() ? codeInput.value : label);
                const statuses = focusGetCustomStatusesV0405();
                focusSaveCustomStatusesV0405([...statuses, { code, label, icon: '' }]);
                if (labelInput) labelInput.value = '';
                if (codeInput) codeInput.value = '';
                renderAll();
            });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
    window.addEventListener('focus-taxonomies-updated-v0405', renderAll);
})();


// Focus Compta V0.40.8 - saisie robuste pour renommage catégories
function focusAskTextV0408(title, label, defaultValue = '') {
    if (typeof askInputV0397 === 'function') {
        return askInputV0397(title, label, defaultValue);
    }
    if (typeof window !== 'undefined' && typeof window.askInputV0397 === 'function') {
        return window.askInputV0397(title, label, defaultValue);
    }
    if (typeof window !== 'undefined' && typeof window.showTextInputModal === 'function') {
        return window.showTextInputModal(title, label, defaultValue);
    }
    return Promise.resolve(defaultValue || '');
}
if (typeof window !== 'undefined' && typeof window.showTextInputModal !== 'function') {
    window.showTextInputModal = focusAskTextV0408;
}

// Focus Compta V0.40.6 - ergonomie catégories et règles à l'import
(function enhancedCategoriesAndRulesV0406() {
    function uniqueSorted(values) {
        if (typeof focusUniqueCategoriesV0407 === 'function') return focusUniqueCategoriesV0407(values);
        const map = new Map();
        (values || []).map(v => String(v || '').trim()).filter(Boolean).forEach(value => {
            const key = value.toLocaleLowerCase('fr-FR');
            if (!map.has(key)) map.set(key, value);
        });
        return [...map.values()].sort((a, b) => a.localeCompare(b, 'fr'));
    }

    async function renameCategory(oldName) {
        const next = await focusAskTextV0408('Renommer la catégorie', `Nouveau nom pour “${oldName}”`, oldName);
        if (!next || next === oldName) return;
        const categories = focusGetCustomCategoriesV0405().map(item => item.toLowerCase() === oldName.toLowerCase() ? next : item);
        focusSaveCustomCategoriesV0405(uniqueSorted(categories));
        if (window.api.renameCategoryEverywhere) await window.api.renameCategoryEverywhere({ oldName, newName: next });
        categoryRules = await window.api.getCategoryRules();
        renderEnhancedCategories();
        if (typeof loadCategoryOptions === 'function') await loadCategoryOptions();
        if (window.showToast) window.showToast('Catégorie renommée partout où c’est possible.', 'success');
    }

    function ensureCategoryDeleteModal() {
        let modal = document.getElementById('categoryDeleteModalV0407');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'categoryDeleteModalV0407';
        modal.className = 'input-modal-v0397';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="input-modal-card-v0397 category-delete-card-v0407">
                <h2>Supprimer une catégorie</h2>
                <p id="categoryDeleteMessageV0407" class="muted"></p>
                <label class="radio-line-v0407"><input type="radio" name="categoryDeleteModeV0407" value="keep" checked> Retirer seulement de la liste personnalisée</label>
                <label class="radio-line-v0407"><input type="radio" name="categoryDeleteModeV0407" value="clear"> Retirer aussi cette catégorie des opérations déjà classées et des règles</label>
                <label class="radio-line-v0407"><input type="radio" name="categoryDeleteModeV0407" value="replace"> Remplacer dans les opérations et règles par :</label>
                <input id="categoryDeleteReplacementV0407" type="text" list="categorySuggestionsV0405" placeholder="Nouvelle catégorie">
                <div class="input-modal-actions-v0397">
                    <button id="categoryDeleteOkV0407" type="button">Appliquer</button>
                    <button id="categoryDeleteCancelV0407" type="button" class="secondary-button">Annuler</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        return modal;
    }

    function askCategoryDeleteOptions(category) {
        return new Promise(resolve => {
            const modal = ensureCategoryDeleteModal();
            const message = modal.querySelector('#categoryDeleteMessageV0407');
            const replacement = modal.querySelector('#categoryDeleteReplacementV0407');
            const ok = modal.querySelector('#categoryDeleteOkV0407');
            const cancel = modal.querySelector('#categoryDeleteCancelV0407');
            if (message) message.textContent = `Que faire pour “${category}” ?`;
            if (replacement) replacement.value = '';
            modal.style.display = 'flex';

            const close = value => {
                modal.style.display = 'none';
                ok.onclick = null;
                cancel.onclick = null;
                modal.onkeydown = null;
                resolve(value);
            };
            ok.onclick = () => {
                const checked = modal.querySelector('input[name="categoryDeleteModeV0407"]:checked');
                const mode = checked ? checked.value : 'keep';
                const newName = replacement ? replacement.value.trim() : '';
                if (mode === 'replace' && !newName) {
                    if (window.showToast) window.showToast('Choisis une catégorie de remplacement.', 'error');
                    replacement && replacement.focus();
                    return;
                }
                close({ mode, newName });
            };
            cancel.onclick = () => close(null);
            modal.onkeydown = event => { if (event.key === 'Escape') close(null); };
        });
    }

    async function deleteCategory(category) {
        const options = await askCategoryDeleteOptions(category);
        if (!options) return;
        const categories = focusGetCustomCategoriesV0405();
        const kept = categories.filter(item => item.toLowerCase() !== String(category).toLowerCase());
        const nextCategories = options.mode === 'replace' && options.newName
            ? uniqueSorted([...kept, options.newName])
            : uniqueSorted(kept);
        focusSaveCustomCategoriesV0405(nextCategories);
        let result = null;
        if (window.api.applyCategoryDeletion) {
            result = await window.api.applyCategoryDeletion({ oldName: category, mode: options.mode, newName: options.newName || '' });
        }
        categoryRules = window.api.getCategoryRules ? await window.api.getCategoryRules() : categoryRules;
        renderEnhancedCategories();
        await renderCategoryRulesEditor();
        if (typeof loadCategoryOptions === 'function') await loadCategoryOptions();
        const changed = result && result.changed ? ` (${result.changed} élément(s) mis à jour)` : '';
        if (window.showToast) window.showToast(`Catégorie supprimée${changed}.`, 'success');
    }

    function renderEnhancedCategories() {
        const list = document.getElementById('settingsCategoriesListV0405');
        if (!list) return;
        const categories = focusGetCustomCategoriesV0405();
        list.innerHTML = '';
        categories.forEach(category => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${category}</span><span class="row-actions-v0406"><button type="button" data-action="rename">Renommer</button><button type="button" data-action="delete">Supprimer</button></span>`;
            li.querySelector('[data-action="rename"]').addEventListener('click', () => renameCategory(category));
            li.querySelector('[data-action="delete"]').addEventListener('click', () => deleteCategory(category));
            list.appendChild(li);
        });
        if (!categories.length) list.innerHTML = '<li class="muted">Aucune catégorie.</li>';
    }

    async function renderCategoryRulesEditor() {
        const list = document.getElementById('categoryRulesList');
        if (!list || !window.api.getCategoryRules) return;
        categoryRules = await window.api.getCategoryRules();
        list.innerHTML = '';
        categoryRules.forEach(rule => {
            const li = document.createElement('li');
            li.innerHTML = `<span><strong>${rule.keyword}</strong><br><small>→ ${rule.category}</small></span><span class="row-actions-v0406"><button type="button" data-action="edit">Modifier</button><button type="button" data-action="delete">Supprimer</button></span>`;
            li.querySelector('[data-action="edit"]').addEventListener('click', () => {
                const keyword = document.getElementById('categoryKeyword');
                const name = document.getElementById('categoryName');
                if (keyword) keyword.value = rule.keyword || '';
                if (name) name.value = rule.category || '';
            });
            li.querySelector('[data-action="delete"]').addEventListener('click', async () => {
                if (!(await showFocusConfirmModalV0412('Supprimer la règle catégorie', `Supprimer la règle catégorie “${rule.keyword}” ?`, 'Supprimer', 'Annuler'))) return;
                if (window.api.deleteCategoryRule) await window.api.deleteCategoryRule(rule.id);
                await renderCategoryRulesEditor();
            });
            list.appendChild(li);
        });
        if (!categoryRules.length) list.innerHTML = '<li class="muted">Aucune catégorie automatique.</li>';
    }

    function bind() {
        renderEnhancedCategories();
        renderCategoryRulesEditor();
        window.addEventListener('focus-taxonomies-updated-v0405', () => {
            renderEnhancedCategories();
            renderCategoryRulesEditor();
        });
        const addCategoryRule = document.getElementById('addCategoryRule');
        if (addCategoryRule && !addCategoryRule.dataset.refreshV0406) {
            addCategoryRule.dataset.refreshV0406 = '1';
            addCategoryRule.addEventListener('click', () => setTimeout(renderCategoryRulesEditor, 250));
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();

// V0.43 - Paramètres moteur technique : onglets, référentiel tiers, règles métier et maintenance
(function initTechnicalSettingsV043() {
    function escapeHtmlV043(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function toastV043(message, type = 'success') {
        if (window.showToast) window.showToast(message, type);
        else console.log(message);
    }

    function activeCompanyIdV043() {
        return window.selectedCompany && window.selectedCompany.id ? window.selectedCompany.id : null;
    }

    function bindTabsV043() {
        document.querySelectorAll('.settings-tab-v043').forEach(button => {
            if (button.dataset.boundV043) return;
            button.dataset.boundV043 = '1';
            button.addEventListener('click', () => {
                const tab = button.dataset.settingsTab;
                document.querySelectorAll('.settings-tab-v043').forEach(el => el.classList.toggle('active', el === button));
                document.querySelectorAll('.settings-panel-v043').forEach(panel => panel.classList.toggle('active', panel.dataset.settingsPanel === tab));
                localStorage.setItem('focus_settings_tab_v043', tab);
                refreshCurrentSettingsPanelV043(tab);
            });
        });
        const stored = localStorage.getItem('focus_settings_tab_v043');
        const target = stored ? document.querySelector(`.settings-tab-v043[data-settings-tab="${stored}"]`) : null;
        if (target) target.click();
    }

    async function refreshSnapshotV043() {
        const box = document.getElementById('technicalSnapshotV043');
        if (!box || !window.api.getTechnicalSettingsSnapshotV043) return;
        const data = await window.api.getTechnicalSettingsSnapshotV043(activeCompanyIdV043());
        const counts = data.counts || {};
        const current = data.currentCompany;
        box.innerHTML = `
            <div class="snapshot-grid-v043">
                <div><strong>${counts.companies || 0}</strong><span>Sociétés</span></div>
                <div><strong>${counts.bankAccounts || 0}</strong><span>Comptes</span></div>
                <div><strong>${counts.statements || 0}</strong><span>Relevés</span></div>
                <div><strong>${counts.transactions || 0}</strong><span>Opérations</span></div>
                <div><strong>${counts.documents || 0}</strong><span>Documents</span></div>
                <div><strong>${counts.thirdParties || 0}</strong><span>Tiers</span></div>
                <div><strong>${counts.aliases || 0}</strong><span>Alias tiers</span></div>
                <div><strong>${counts.automationRules || 0}</strong><span>Règles banque</span></div>
            </div>
            ${current ? `<p class="muted">Société ouverte : ${current.transactions || 0} opération(s), ${current.thirdParties || 0} tiers, ${current.documents || 0} document(s).</p>` : '<p class="muted">Aucune société ouverte pour le détail société.</p>'}
        `;
    }

    async function loadTypeOptionsV043() {
        const selects = [
            document.getElementById('canonicalThirdPartyTypeV043'),
            document.getElementById('thirdPartyAliasTypeV043')
        ].filter(Boolean);
        const chips = document.getElementById('thirdPartyTypesSettingsV043');
        if (!window.api.getThirdPartyTypeOptions) return [];
        const types = await window.api.getThirdPartyTypeOptions();
        selects.forEach(select => {
            const current = select.value;
            select.innerHTML = types.map(type => `<option value="${escapeHtmlV043(type)}">${escapeHtmlV043(type)}</option>`).join('');
            if (current) select.value = current;
        });
        if (chips) {
            chips.innerHTML = types.map(type => `<span>${escapeHtmlV043(type)}</span>`).join('');
        }
        return types;
    }

    async function renderCanonicalThirdPartiesV043() {
        const box = document.getElementById('canonicalThirdPartiesListV043');
        if (!box || !window.api.getThirdPartyCanonicalListV043) return;
        const rows = await window.api.getThirdPartyCanonicalListV043();
        if (!rows.length) {
            box.innerHTML = '<p class="muted">Aucun tiers canonisé.</p>';
            return;
        }
        box.innerHTML = `
            <table class="settings-table-v043">
                <thead><tr><th>Tiers</th><th>Type</th><th>Sociétés</th><th>Actions</th></tr></thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            <td>${escapeHtmlV043(row.name)}</td>
                            <td>${escapeHtmlV043(row.type || 'autre')}</td>
                            <td>${row.companies_count || 0}</td>
                            <td><button type="button" data-edit-canonical="${escapeHtmlV043(row.name)}" data-type="${escapeHtmlV043(row.type || 'autre')}">Modifier</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        box.querySelectorAll('[data-edit-canonical]').forEach(button => {
            button.addEventListener('click', () => {
                const name = button.dataset.editCanonical || '';
                const type = button.dataset.type || 'autre';
                const nameInput = document.getElementById('canonicalThirdPartyNameV043');
                const typeSelect = document.getElementById('canonicalThirdPartyTypeV043');
                if (nameInput) nameInput.value = name;
                if (typeSelect) typeSelect.value = type;
            });
        });
    }

    async function renderAliasesV043() {
        const box = document.getElementById('thirdPartyAliasesListV043');
        if (!box || !window.api.getThirdPartyAliasesV043) return;
        const rows = await window.api.getThirdPartyAliasesV043();
        if (!rows.length) {
            box.innerHTML = '<p class="muted">Aucun alias enregistré. Exemple : Swisslife TP → SwissLife.</p>';
            return;
        }
        box.innerHTML = `
            <table class="settings-table-v043">
                <thead><tr><th>Alias</th><th>Vers</th><th>Type</th><th>Mode</th><th></th></tr></thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            <td>${escapeHtmlV043(row.alias_label)}</td>
                            <td>${escapeHtmlV043(row.canonical_name)}</td>
                            <td>${escapeHtmlV043(row.type || 'autre')}</td>
                            <td>${row.mode === 'split' ? 'Ne pas refusionner' : 'Toujours fusionner'}</td>
                            <td><button type="button" data-delete-alias="${row.id}">Supprimer</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        box.querySelectorAll('[data-delete-alias]').forEach(button => {
            button.addEventListener('click', async () => {
                if (window.showFocusConfirmModalV0412) {
                    const ok = await window.showFocusConfirmModalV0412('Supprimer alias', 'Supprimer cet alias du référentiel ?', 'Supprimer', 'Annuler');
                    if (!ok) return;
                }
                await window.api.deleteThirdPartyAliasV043(Number(button.dataset.deleteAlias));
                await renderAliasesV043();
        await renderDocumentLearningV0452();
                toastV043('Alias supprimé.');
            });
        });
    }

    async function saveCanonicalV043() {
        const name = document.getElementById('canonicalThirdPartyNameV043')?.value.trim();
        const type = document.getElementById('canonicalThirdPartyTypeV043')?.value || 'autre';
        if (!name) return toastV043('Indique un nom de tiers.', 'error');
        await window.api.createOrUpdateCanonicalThirdPartyV043({ name, type });
        await renderCanonicalThirdPartiesV043();
        await loadTypeOptionsV043();
        toastV043('Tiers canonique enregistré.');
    }

    async function saveAliasV043() {
        const aliasLabel = document.getElementById('thirdPartyAliasLabelV043')?.value.trim();
        const canonicalName = document.getElementById('thirdPartyAliasCanonicalV043')?.value.trim();
        const type = document.getElementById('thirdPartyAliasTypeV043')?.value || 'autre';
        const mode = document.getElementById('thirdPartyAliasModeV043')?.value || 'merge';
        if (!aliasLabel || !canonicalName) return toastV043('Indique l’alias et le tiers cible.', 'error');
        await window.api.saveThirdPartyAliasRule({ aliasLabel, canonicalName, type, mode });
        await renderAliasesV043();
        await renderCanonicalThirdPartiesV043();
        toastV043('Alias enregistré.');
    }

    async function runMaintenanceV043(mode) {
        const box = document.getElementById('maintenanceResultV043');
        if (box) box.textContent = 'Maintenance en cours…';
        const result = await window.api.runTechnicalMaintenanceV043({ companyId: activeCompanyIdV043(), mode });
        if (box) box.textContent = JSON.stringify(result, null, 2);
        await refreshSnapshotV043();
        await renderCanonicalThirdPartiesV043();
        await renderAliasesV043();
        toastV043('Maintenance terminée.');
    }

    async function applyBusinessRulesFromSettingsV043() {
        const result = await window.api.applyThirdPartyBusinessRules({ companyId: activeCompanyIdV043(), force: false });
        toastV043(`${result.updated || 0} opération(s) mise(s) à jour.`);
    }



    async function renderDocumentLearningV0452() {
        const box = document.getElementById('documentLearningRulesV0452');
        if (!box || !window.api.getDocumentLearningRulesV0452) return;
        const rows = await window.api.getDocumentLearningRulesV0452({ companyId: activeCompanyIdV043() });
        if (!rows.length) {
            box.innerHTML = '<p class="muted">Aucune règle apprise pour le moment. Les règles apparaîtront après correction d’un document importé.</p>';
            return;
        }
        box.innerHTML = `
            <table class="settings-table-v043">
                <thead><tr><th>Fournisseur</th><th>Champ</th><th>Valeur apprise</th><th>Utilisations</th><th></th></tr></thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            <td>${escapeHtmlV043(row.supplier)}</td>
                            <td>${escapeHtmlV043(row.field_name)}</td>
                            <td>${escapeHtmlV043(row.learned_value)}</td>
                            <td>${row.usage_count || 0}</td>
                            <td><button type="button" data-delete-learning-v0452="${row.id}">Supprimer</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        box.querySelectorAll('[data-delete-learning-v0452]').forEach(button => {
            button.addEventListener('click', async () => {
                const ok = window.showFocusConfirmModalV0412 ? await window.showFocusConfirmModalV0412('Supprimer règle apprise', 'Cette correction ne sera plus réutilisée.', 'Supprimer', 'Annuler') : true;
                if (!ok) return;
                await window.api.deleteDocumentLearningRuleV0452(Number(button.dataset.deleteLearningV0452));
                await renderDocumentLearningV0452();
                toastV043('Règle supprimée.');
            });
        });
    }

    async function renderDocumentsToValidateV0452() {
        const box = document.getElementById('documentsToValidateV0452');
        if (!box || !window.api.getDocumentsToValidateV0452) return;
        const rows = await window.api.getDocumentsToValidateV0452(activeCompanyIdV043());
        if (!rows.length) {
            box.innerHTML = '<p class="muted">Aucun document en attente de validation.</p>';
            return;
        }
        box.innerHTML = `
            <table class="settings-table-v043">
                <thead><tr><th>Document</th><th>Fournisseur</th><th>TTC</th><th>Échéance</th><th>Confiance</th><th>Statut</th></tr></thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            <td>${escapeHtmlV043(row.filename)}</td>
                            <td>${escapeHtmlV043(row.detected_supplier || row.third_party_name || '')}</td>
                            <td>${row.amount_ttc != null ? Number(row.amount_ttc).toFixed(2) + ' €' : '-'}</td>
                            <td>${escapeHtmlV043(row.due_date || '')}</td>
                            <td>${Math.round(Number(row.ocr_confidence || 0))}%</td>
                            <td>${escapeHtmlV043(row.validation_status || 'pending')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function bindActionsV043() {
        const map = [
            ['refreshTechnicalSnapshotV043', refreshSnapshotV043],
            ['saveCanonicalThirdPartyV043', saveCanonicalV043],
            ['saveThirdPartyAliasV043', saveAliasV043],
            ['applyBusinessRulesSettingsV043', applyBusinessRulesFromSettingsV043],
            ['maintenanceLightV043', () => runMaintenanceV043('light')],
            ['maintenanceThirdPartiesV043', () => runMaintenanceV043('thirdParties')],
            ['maintenanceBusinessRulesV043', () => runMaintenanceV043('businessRules')],
            ['maintenanceFullV043', () => runMaintenanceV043('full')],
            ['refreshDocumentLearningV0452', renderDocumentLearningV0452],
            ['openDocumentsToValidateV0452', renderDocumentsToValidateV0452]
        ];
        map.forEach(([id, handler]) => {
            const el = document.getElementById(id);
            if (el && !el.dataset.boundV043) {
                el.dataset.boundV043 = '1';
                el.addEventListener('click', handler);
            }
        });
        const compact = document.getElementById('compactSettingsV043');
        if (compact && !compact.dataset.boundV043) {
            compact.checked = localStorage.getItem('focus_compact_settings_v043') === '1';
            document.body.classList.toggle('settings-compact-v043', compact.checked);
            compact.dataset.boundV043 = '1';
            compact.addEventListener('change', () => {
                localStorage.setItem('focus_compact_settings_v043', compact.checked ? '1' : '0');
                document.body.classList.toggle('settings-compact-v043', compact.checked);
            });
        }
        const hideDetails = document.getElementById('hideImportDetailsV043');
        if (hideDetails && !hideDetails.dataset.boundV043) {
            hideDetails.checked = localStorage.getItem('focus_hide_import_details_v043') === '1';
            hideDetails.dataset.boundV043 = '1';
            hideDetails.addEventListener('change', () => localStorage.setItem('focus_hide_import_details_v043', hideDetails.checked ? '1' : '0'));
        }
    }

    function refreshCurrentSettingsPanelV043(tab) {
        if (tab === 'data') refreshSnapshotV043();
        if (tab === 'lists') loadTypeOptionsV043();
        if (tab === 'thirdPartyRef') {
            loadTypeOptionsV043();
            renderCanonicalThirdPartiesV043();
            renderAliasesV043();
        }
        if (tab === 'documentLearning') {
            renderDocumentLearningV0452();
            renderDocumentsToValidateV0452();
        }
    }

    async function initV043() {
        bindTabsV043();
        bindActionsV043();
        await loadTypeOptionsV043();
        await refreshSnapshotV043();
        await renderCanonicalThirdPartiesV043();
        await renderAliasesV043();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initV043);
    else initV043();
})();
