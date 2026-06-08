(function () {
    'use strict';

    const ready = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn();
    const esc = (value) => String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const toast = (msg, type = 'success') => {
        if (typeof window.showToastV0409 === 'function') return window.showToastV0409(msg, type);
        if (typeof window.focusToastV041 === 'function') return window.focusToastV041(msg, type);
        console.log(`[Focus Compta] ${msg}`);
    };
    const money = (n) => Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    const slug = (value) => String(value || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9€.,()\-\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    function getCategories() {
        const fromCustom = typeof window.focusGetCustomCategoriesV0405 === 'function' ? window.focusGetCustomCategoriesV0405() : [];
        return [...new Set([...(fromCustom || []), 'Achats', 'Banque', 'Capital social', 'Électricité', 'Frais bancaires', 'Frais bancaires / CB', 'Loyer', 'Salaires', 'Tiers-payant', 'Ventes'].filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' }));
    }

    function getCompanyId() {
        return window.selectedCompany?.id || window.currentCompany?.id || null;
    }

    function notifyTaxonomyUpdated() {
        window.dispatchEvent(new CustomEvent('focus-taxonomies-updated-v0405'));
        window.dispatchEvent(new CustomEvent('focus-v058-sync-needed'));
    }

    function selectOptions(values, selected, empty = '') {
        return `${empty ? `<option value="">${esc(empty)}</option>` : ''}${values.map(v => `<option value="${esc(v)}" ${String(v) === String(selected || '') ? 'selected' : ''}>${esc(v)}</option>`).join('')}`;
    }

    // ---------------------------------------------------------------------
    // 1. Cockpit final : un seul bloc À TRAITER, plus de doublon Alertes.
    // ---------------------------------------------------------------------
    function normalizeAlertLabel(label) {
        const raw = String(label || '').trim();
        if (/anomal/i.test(raw)) return 'Doublons tiers à vérifier';
        if (/justificatif|opérations/i.test(raw)) return 'Opérations à rapprocher';
        if (/relev/i.test(raw)) return 'Relevés avec écart';
        if (/document/i.test(raw)) return 'Documents à transmettre';
        return raw;
    }

    function iconForLabel(label) {
        if (/document/i.test(label)) return '📄';
        if (/opération|banque|rapprocher/i.test(label)) return '🏦';
        if (/relev/i.test(label)) return '📑';
        if (/tiers|doublon/i.test(label)) return '👥';
        return '⚠️';
    }

    function pageForLabel(label, fallback) {
        if (/document/i.test(label)) return 'receiptsPage';
        if (/opération|banque|rapprocher|relev/i.test(label)) return 'bankPage';
        if (/tiers|doublon/i.test(label)) return 'thirdPartiesPage';
        return fallback || 'homePage';
    }

    function rebuildCockpit() {
        const alertList = document.getElementById('v050AlertsList');
        const alerts = [...document.querySelectorAll('#v050AlertsList .alert-line-v050')].map(el => {
            const label = normalizeAlertLabel(el.querySelector('span')?.textContent || '');
            const value = el.querySelector('strong')?.textContent?.trim() || '0';
            const n = Number((value.match(/\d+/) || ['0'])[0]);
            return { label, value, n, page: pageForLabel(label, el.dataset.page) };
        }).filter(a => a.label && a.n > 0);

        if (alertList) {
            const panel = alertList.closest('.cockpit-panel-v050, .clean-panel, .panel');
            if (panel) panel.style.display = 'none';
        }

        let box = document.getElementById('v055ActionNowBox');
        if (!box) {
            box = document.createElement('section');
            box.id = 'v055ActionNowBox';
            box.className = 'panel clean-panel cockpit-panel-v050 action-now-v055 action-now-v058';
            const grid = document.querySelector('.cockpit-grid-v050');
            if (grid) grid.prepend(box);
        }
        if (!box) return;

        const total = alerts.reduce((sum, a) => sum + a.n, 0);
        box.classList.add('action-now-v058');
        box.innerHTML = `
            <div class="panel-heading action-heading-v058">
                <span>À traiter</span>
                <h3>${total ? `${total} élément(s) à traiter` : 'Tout est à jour'}</h3>
                <small>${total ? 'Clique sur une ligne pour ouvrir le module concerné.' : 'Aucune action bloquante détectée.'}</small>
            </div>
            <div class="action-now-list-v055 action-list-v058">
                ${alerts.length ? alerts.map(a => `
                    <button type="button" class="action-line-v055 action-line-v058" data-page="${a.page}">
                        <span>${iconForLabel(a.label)} ${esc(a.label)}</span>
                        <small>Ouvrir le module concerné</small>
                        <strong>${esc(a.value)}</strong>
                    </button>`).join('') : '<div class="action-line-v055 is-empty"><span>✅ Aucune action bloquante</span><strong>OK</strong></div>'}
            </div>`;
        box.querySelectorAll('[data-page]').forEach(btn => btn.addEventListener('click', () => typeof window.showPage === 'function' && window.showPage(btn.dataset.page)));

        const subtitle = document.getElementById('v050GlobalStatusSubtitle');
        if (subtitle) subtitle.textContent = alerts.length ? alerts.map(a => `${a.label} : ${a.value}`).join(' · ') : 'Aucune action bloquante détectée.';
    }

    function patchCockpit() {
        rebuildCockpit();
        const observerTarget = document.getElementById('v050AlertsList');
        if (observerTarget && !observerTarget.dataset.v058Observed) {
            observerTarget.dataset.v058Observed = '1';
            new MutationObserver(() => window.requestAnimationFrame(rebuildCockpit)).observe(observerTarget, { childList: true, subtree: true });
        }
        setTimeout(rebuildCockpit, 700);
    }

    // ---------------------------------------------------------------------
    // 2. Règles bancaires unifiées + bouton Appliquer les changements.
    // ---------------------------------------------------------------------
    let pendingRules = [];
    let cachedRulesSignature = '';

    async function loadUnifiedRules() {
        const [catRules, autoRules] = await Promise.all([
            window.api.getCategoryRules ? window.api.getCategoryRules() : [],
            window.api.getAutomationRules ? window.api.getAutomationRules({ companyId: getCompanyId() }) : []
        ]);
        const simple = (catRules || []).map(rule => ({
            uid: `cat-${rule.id}`,
            source: 'category_rule',
            id: rule.id,
            target: 'label',
            keyword: rule.keyword || '',
            category: rule.category || '',
            thirdPartyName: '',
            status: '',
            _delete: false
        }));
        const advanced = (autoRules || []).map(rule => ({
            uid: `auto-${rule.id}`,
            source: 'automation_rule',
            id: rule.id,
            target: rule.target || 'all',
            keyword: rule.keyword || '',
            category: rule.category || '',
            thirdPartyName: rule.third_party_name || rule.thirdPartyName || '',
            status: rule.status || '',
            _delete: false
        }));
        return [...simple, ...advanced];
    }

    function rulesSignature(rules) {
        return JSON.stringify(rules.map(r => [r.uid, r.source, r.id, r.target, r.keyword, r.category, r.thirdPartyName, r.status, r._delete]));
    }

    function setPendingRules(rules) {
        pendingRules = rules;
        const badge = document.getElementById('v058PendingRulesBadge');
        const apply = document.getElementById('v058ApplyRulesChanges');
        const changed = cachedRulesSignature && rulesSignature(pendingRules) !== cachedRulesSignature;
        if (badge) badge.textContent = changed ? 'Modifications non appliquées' : 'Système synchronisé';
        if (badge) badge.className = changed ? 'status-pill warning' : 'status-pill success';
        if (apply) apply.disabled = !changed;
    }

    function addUnifiedRulesPanel() {
        const container = document.querySelector('[data-settings-panel="bankRules"]');
        if (!container || document.getElementById('v058UnifiedRulesPanel')) return;
        const oldPanels = [...container.querySelectorAll('.panel.clean-panel')];
        oldPanels.forEach(p => p.classList.add('legacy-rules-panel-v058'));
        const panel = document.createElement('div');
        panel.id = 'v058UnifiedRulesPanel';
        panel.className = 'panel clean-panel unified-rules-v058';
        panel.innerHTML = `
            <div class="section-title-row compact-title-row">
                <div>
                    <span class="eyebrow">V0.58</span>
                    <h2>Règles bancaires automatiques</h2>
                    <p class="muted">Une seule liste pour les anciennes catégories automatiques et les règles banque avancées.</p>
                </div>
                <span id="v058PendingRulesBadge" class="status-pill success">Système synchronisé</span>
            </div>
            <div class="unified-rule-create-v058">
                <input id="v058RuleKeyword" placeholder="Mot-clé détecté, ex : COM CARTE, EDF, SIAGI">
                <select id="v058RuleCategory"></select>
                <input id="v058RuleThirdParty" placeholder="Tiers optionnel">
                <select id="v058RuleStatus">
                    <option value="verified">Vérifié</option>
                    <option value="ignored">Validé sans justificatif</option>
                    <option value="review">À vérifier</option>
                    <option value="missing">Justificatif manquant</option>
                    <option value="">Ne pas changer</option>
                </select>
                <button id="v058AddUnifiedRule" type="button">Ajouter</button>
            </div>
            <div class="unified-rules-toolbar-v058">
                <input id="v058RuleSearch" type="search" placeholder="Rechercher une règle…">
                <button id="v058ApplyRulesChanges" type="button" disabled>Appliquer les changements</button>
            </div>
            <div id="v058UnifiedRulesList" class="unified-rules-list-v058 muted">Chargement…</div>
            <p class="muted small-note-v058">Au clic sur “Appliquer”, Focus Compta sauvegarde les règles, synchronise les catégories et réapplique les règles aux opérations existantes.</p>`;
        container.prepend(panel);
    }

    function renderUnifiedRules() {
        const list = document.getElementById('v058UnifiedRulesList');
        const catSelect = document.getElementById('v058RuleCategory');
        if (catSelect) catSelect.innerHTML = selectOptions(getCategories(), '', 'Catégorie…');
        if (!list) return;
        const q = document.getElementById('v058RuleSearch')?.value?.trim().toLowerCase() || '';
        const cats = getCategories();
        const targets = [['all', 'Compte + libellé + tiers'], ['label', 'Libellé'], ['account_name', 'Compte'], ['third_party_name', 'Tiers']];
        const statuses = [['', 'Ne pas changer'], ['verified', 'Vérifié'], ['ignored', 'Validé sans justificatif'], ['review', 'À vérifier'], ['missing', 'Justificatif manquant'], ['attached', 'Pièce jointe']];
        const rows = pendingRules.filter(r => !q || [r.keyword, r.category, r.thirdPartyName, r.status].join(' ').toLowerCase().includes(q));
        list.classList.remove('muted');
        list.innerHTML = rows.length ? `
            <div class="rule-table-v058">
                <div class="rule-head-v058"><span>Détection</span><span>Catégorie</span><span>Tiers</span><span>Statut</span><span>Actions</span></div>
                ${rows.map(rule => `
                    <div class="rule-row-v058 ${rule._delete ? 'is-deleted' : ''}" data-uid="${esc(rule.uid)}">
                        <div class="rule-detect-v058">
                            <select data-field="target">${targets.map(([v, l]) => `<option value="${v}" ${v === rule.target ? 'selected' : ''}>${l}</option>`).join('')}</select>
                            <input data-field="keyword" value="${esc(rule.keyword)}" placeholder="Mot-clé">
                        </div>
                        <select data-field="category">${selectOptions(cats, rule.category, 'Catégorie inchangée')}</select>
                        <input data-field="thirdPartyName" value="${esc(rule.thirdPartyName)}" placeholder="Tiers optionnel">
                        <select data-field="status">${statuses.map(([v, l]) => `<option value="${v}" ${v === rule.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
                        <div class="rule-actions-v058">
                            <button type="button" data-test-rule="${esc(rule.uid)}">Tester</button>
                            <button type="button" class="secondary-button" data-delete-rule="${esc(rule.uid)}">${rule._delete ? 'Annuler' : 'Supprimer'}</button>
                        </div>
                    </div>`).join('')}
            </div>` : '<div class="empty-state">Aucune règle bancaire.</div>';
        list.querySelectorAll('.rule-row-v058 [data-field]').forEach(input => input.addEventListener('input', onRuleFieldChange));
        list.querySelectorAll('.rule-row-v058 select[data-field]').forEach(input => input.addEventListener('change', onRuleFieldChange));
        list.querySelectorAll('[data-delete-rule]').forEach(btn => btn.addEventListener('click', () => {
            const uid = btn.dataset.deleteRule;
            const next = pendingRules.map(r => r.uid === uid ? { ...r, _delete: !r._delete } : r);
            setPendingRules(next);
            renderUnifiedRules();
        }));
        list.querySelectorAll('[data-test-rule]').forEach(btn => btn.addEventListener('click', () => toast('Test de règle : sauvegarde puis applique les changements pour recalculer les opérations.')));
    }

    function onRuleFieldChange(event) {
        const row = event.target.closest('.rule-row-v058');
        if (!row) return;
        const uid = row.dataset.uid;
        const field = event.target.dataset.field;
        const value = event.target.value;
        setPendingRules(pendingRules.map(r => r.uid === uid ? { ...r, [field]: value } : r));
    }

    async function initUnifiedRules() {
        addUnifiedRulesPanel();
        const rules = await loadUnifiedRules();
        cachedRulesSignature = rulesSignature(rules);
        setPendingRules(rules);
        renderUnifiedRules();

        document.getElementById('v058RuleSearch')?.addEventListener('input', renderUnifiedRules);
        document.getElementById('v058AddUnifiedRule')?.addEventListener('click', () => {
            const keyword = document.getElementById('v058RuleKeyword')?.value?.trim();
            const category = document.getElementById('v058RuleCategory')?.value || '';
            const thirdPartyName = document.getElementById('v058RuleThirdParty')?.value?.trim() || '';
            const status = document.getElementById('v058RuleStatus')?.value || 'verified';
            if (!keyword) return toast('Mot-clé obligatoire.', 'error');
            const next = [...pendingRules, { uid: `new-${Date.now()}`, source: 'automation_rule', id: null, target: 'all', keyword, category, thirdPartyName, status, _delete: false }];
            ['v058RuleKeyword','v058RuleThirdParty'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            setPendingRules(next);
            renderUnifiedRules();
        });
        document.getElementById('v058ApplyRulesChanges')?.addEventListener('click', applyUnifiedRulesChanges);
    }

    async function applyUnifiedRulesChanges() {
        const companyId = getCompanyId();
        let saved = 0, removed = 0;
        for (const rule of pendingRules) {
            const keyword = String(rule.keyword || '').trim();
            const category = String(rule.category || '').trim();
            if (rule._delete) {
                if (rule.source === 'category_rule' && rule.id && window.api.deleteCategoryRule) await window.api.deleteCategoryRule(Number(rule.id));
                if (rule.source === 'automation_rule' && rule.id && window.api.deleteAutomationRule) await window.api.deleteAutomationRule(Number(rule.id));
                removed += 1;
                continue;
            }
            if (!keyword) continue;
            const payload = { companyId, target: rule.target || 'all', keyword, category, thirdPartyName: rule.thirdPartyName || '', status: rule.status || '' };
            if (rule.source === 'automation_rule' && rule.id && window.api.updateAutomationRule) {
                await window.api.updateAutomationRule({ ...payload, ruleId: Number(rule.id) });
                saved += 1;
            } else if (rule.source === 'category_rule' && rule.id) {
                // L'ancien référentiel simple ne possède pas d'update : on remplace par une règle banque unifiée.
                if (window.api.deleteCategoryRule) await window.api.deleteCategoryRule(Number(rule.id));
                if (window.api.createAutomationRule) await window.api.createAutomationRule(payload);
                saved += 1;
            } else if (window.api.createAutomationRule) {
                await window.api.createAutomationRule(payload);
                saved += 1;
            }
        }
        let applied = null;
        try { if (window.api.applyAutomationRules) applied = await window.api.applyAutomationRules({ companyId }); } catch (e) { console.warn(e); }
        notifyTaxonomyUpdated();
        await initUnifiedRules();
        try { if (typeof window.refreshAccountView === 'function') await window.refreshAccountView(false); } catch (_) {}
        toast(`Changements appliqués : ${saved} règle(s) sauvegardée(s), ${removed} supprimée(s)${applied?.changed ? `, ${applied.changed} opération(s) reclassée(s)` : ''}.`);
    }

    function patchCategorySync() {
        const sync = () => {
            const cats = getCategories();
            document.querySelectorAll('select.auto-category-v057, select.rule-category-v057, select.inline-category-select, #detailCategory, #v058RuleCategory').forEach(select => {
                const current = select.value;
                select.innerHTML = select.id === 'detailCategory' ? selectOptions(cats, current, 'Non catégorisé') : selectOptions(cats, current, select.id === 'v058RuleCategory' ? 'Catégorie…' : 'Catégorie inchangée');
                if ([...select.options].some(o => o.value === current)) select.value = current;
            });
        };
        window.addEventListener('focus-taxonomies-updated-v0405', sync);
        window.addEventListener('focus-v058-sync-needed', sync);
        setTimeout(sync, 500);
    }

    // ---------------------------------------------------------------------
    // 3. Tiers V2 : différents / plus tard, mémorisés définitivement.
    // ---------------------------------------------------------------------
    function ignoreKey(a, b) { return [String(a || ''), String(b || '')].sort().join('::'); }
    function ignoredPairs() {
        try { return JSON.parse(localStorage.getItem('focusIgnoredDuplicatePairsV058') || '[]'); } catch (_) { return []; }
    }
    function saveIgnoredPair(a, b) {
        const all = new Set(ignoredPairs());
        all.add(ignoreKey(a, b));
        localStorage.setItem('focusIgnoredDuplicatePairsV058', JSON.stringify([...all]));
    }

    function patchDuplicateCards() {
        document.querySelectorAll('.duplicate-card-v057, .duplicate-card-v056').forEach(card => {
            if (card.dataset.v058Patched) return;
            const mergeBtn = card.querySelector('[data-v057-merge-a], [data-v056-merge-a]');
            const ignoreBtn = card.querySelector('[data-v057-ignore-a]');
            if (!mergeBtn && !ignoreBtn) return;
            const a = mergeBtn?.dataset.v057MergeA || mergeBtn?.dataset.v056MergeA || ignoreBtn?.dataset.v057IgnoreA;
            const b = mergeBtn?.dataset.v057MergeB || mergeBtn?.dataset.v056MergeB || ignoreBtn?.dataset.v057IgnoreB;
            if (ignoredPairs().includes(ignoreKey(a, b))) { card.remove(); return; }
            card.dataset.v058Patched = '1';
            const actions = card.querySelector('.duplicate-actions-v057') || card.querySelector('div:last-child') || card;
            if (ignoreBtn) ignoreBtn.textContent = 'Différents';
            const later = document.createElement('button');
            later.type = 'button'; later.className = 'secondary-button'; later.textContent = 'Plus tard';
            later.addEventListener('click', () => card.remove());
            const different = ignoreBtn || document.createElement('button');
            if (!ignoreBtn) { different.type = 'button'; different.className = 'secondary-button'; different.textContent = 'Différents'; actions.appendChild(different); }
            different.addEventListener('click', (event) => {
                event.preventDefault(); event.stopImmediatePropagation();
                saveIgnoredPair(a, b);
                card.remove();
                toast('Fusion refusée : cette proposition ne sera plus reproposée.');
            }, true);
            actions.appendChild(later);
        });
    }

    // ---------------------------------------------------------------------
    // 4. Import bancaire : historique + rapport plus pédagogique.
    // ---------------------------------------------------------------------
    function getImportHistory() {
        try { return JSON.parse(localStorage.getItem('focusImportHistoryV058') || '[]'); } catch (_) { return []; }
    }
    function saveImportHistory(item) {
        const all = [item, ...getImportHistory()].slice(0, 25);
        localStorage.setItem('focusImportHistoryV058', JSON.stringify(all));
        renderImportHistory();
    }

    function renderImportHistory() {
        const bankPage = document.getElementById('bankPage');
        if (!bankPage) return;
        let panel = document.getElementById('importHistoryV057') || document.getElementById('importHistoryV058');
        if (!panel) {
            panel = document.createElement('section');
            panel.id = 'importHistoryV058';
            panel.className = 'panel clean-panel import-history-v058';
            bankPage.appendChild(panel);
        }
        panel.id = 'importHistoryV058';
        const rows = getImportHistory();
        panel.innerHTML = `<div class="section-title-row compact-title-row"><div><span class="eyebrow">Banque</span><h2>Historique des imports</h2></div><span class="muted">${rows.length} import(s)</span></div>
            ${rows.length ? `<div class="import-history-list-v058">${rows.map(row => `<article class="import-history-row-v058 ${row.ok ? 'ok' : 'warning'}"><strong>${esc(row.title)}</strong><span>${row.ok ? '✓ Conforme' : '⚠ À contrôler'}</span><small>${esc(row.detail || '')}</small></article>`).join('')}</div>` : '<p class="muted">Les prochains imports afficheront ici le résultat : conforme, écart, lignes manquantes et totaux débit/crédit.</p>'}`;
    }

    function patchImportReport() {
        if (typeof window.focusShowImportReportV041 !== 'function' || window.focusShowImportReportV041._v058) return;
        const original = window.focusShowImportReportV041;
        const patched = async function (bulk, options = {}) {
            const result = await original.call(this, bulk, options);
            try {
                const rows = Array.isArray(bulk?.results) ? bulk.results : [];
                rows.filter(r => r.imported).forEach(row => {
                    const report = row.importReport || {};
                    const ok = report.isBalanced !== false;
                    const expectedDebit = Number(report.expectedDebit || report.expected_debit || 0);
                    const importedDebit = Number(report.importedDebit || report.imported_debit || 0);
                    const expectedCredit = Number(report.expectedCredit || report.expected_credit || 0);
                    const importedCredit = Number(report.importedCredit || report.imported_credit || 0);
                    saveImportHistory({
                        at: new Date().toISOString(),
                        ok,
                        title: row.filename || 'Relevé importé',
                        detail: ok
                            ? `${Number(row.transactionsCount || bulk.transactionsCount || 0)} opération(s) · débits/crédits conformes`
                            : `Débit PDF ${money(expectedDebit)} / import ${money(importedDebit)} · Crédit PDF ${money(expectedCredit)} / import ${money(importedCredit)}`
                    });
                });
                setTimeout(() => enrichOpenImportModal(), 50);
            } catch (error) { console.warn('Historique import V0.58', error); }
            return result;
        };
        patched._v058 = true;
        window.focusShowImportReportV041 = patched;
    }

    function enrichOpenImportModal() {
        const details = document.querySelector('#treatmentModalV041 .treatment-details-v041');
        if (!details || details.dataset.v058) return;
        details.dataset.v058 = '1';
        const info = document.createElement('div');
        info.className = 'import-diagnostic-help-v058';
        info.innerHTML = '<strong>Contrôle V0.58</strong><p>Si un écart apparaît, compare débits PDF/importés, crédits PDF/importés, puis recherche une ligne du même montant dans le relevé. Focus Compta mémorise cet import dans Banque > Historique imports.</p>';
        details.before(info);
    }

    // ---------------------------------------------------------------------
    // 5. GED intelligente : nom métier + doublons plus compréhensibles.
    // ---------------------------------------------------------------------
    function monthNameFromValue(value) {
        const m = String(value || '').match(/(?:^|[-_/])(0?[1-9]|1[0-2])(?:[-_/]|$)/);
        if (!m) return '';
        return ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][Number(m[1]) - 1] || '';
    }

    function buildSmartName(doc = {}) {
        const type = String(doc.doc_type || doc.type || '').toLowerCase();
        const original = String(doc.filename || doc.name || 'Document');
        const lower = original.toLowerCase();
        const year = (original.match(/20\d{2}/) || [new Date().getFullYear()])[0];
        const month = monthNameFromValue(original) || (doc.date ? monthNameFromValue(doc.date) : '');
        const third = slug(doc.supplier || doc.vendor || doc.third_party_name || doc.thirdPartyName || '');
        if (type.includes('relev') || lower.includes('relev')) return slug(`Relevé ${third || 'bancaire'} ${month || ''} ${year}`);
        if (type.includes('contrat') || lower.includes('contrat')) return slug(`Contrat ${third || ''} ${lower.includes('pret') || lower.includes('prêt') ? 'Prêt Pro' : ''}`);
        if (type.includes('rib') || lower.includes('rib')) return slug(`RIB ${third || ''}`);
        if (type.includes('don')) return slug(`Don ${third || ''} ${month || ''} ${year}`);
        if (third) return slug(`${third} ${month || ''} ${year}`);
        return slug(original.replace(/\.pdf$/i, ''));
    }

    function patchDocumentsSmartRename() {
        document.addEventListener('click', async (event) => {
            const btn = event.target?.closest?.('[data-smart-rename-v058]');
            if (!btn) return;
            event.preventDefault();
            const id = Number(btn.dataset.smartRenameV058);
            const name = btn.dataset.smartNameV058;
            if (!id || !name || !window.api.renameDocument) return;
            await window.api.renameDocument({ documentId: id, newFilename: `${name}.pdf` });
            toast(`Document renommé : ${name}`);
            try { if (typeof window.loadDocuments === 'function') await window.loadDocuments(); } catch (_) {}
        }, true);

        const enhance = () => {
            document.querySelectorAll('[data-document-id], .document-card-v033, .receipt-card, .document-row').forEach(card => {
                if (card.dataset.v058Rename) return;
                const id = card.dataset.documentId || card.querySelector('[data-document-id]')?.dataset.documentId;
                if (!id) return;
                const text = card.textContent || '';
                const proposed = buildSmartName({ filename: text });
                if (!proposed || proposed.length < 4) return;
                card.dataset.v058Rename = '1';
                const action = document.createElement('button');
                action.type = 'button'; action.className = 'secondary-button smart-rename-v058';
                action.textContent = 'Nom intelligent';
                action.dataset.smartRenameV058 = id;
                action.dataset.smartNameV058 = proposed;
                action.title = `Renommer en : ${proposed}`;
                const area = card.querySelector('.row-actions, .document-actions, .button-row') || card;
                area.appendChild(action);
            });
        };
        setTimeout(enhance, 800);
    }

    // ---------------------------------------------------------------------
    // 6. Stabilisation UI : éviter les panneaux qui changent seuls.
    // ---------------------------------------------------------------------
    function stabilizePanels() {
        let lastUserPage = document.querySelector('.page-section.active-page')?.id || 'homePage';
        document.addEventListener('click', event => {
            const nav = event.target?.closest?.('[data-page]');
            if (nav?.dataset.page) lastUserPage = nav.dataset.page;
        }, true);
        const originalShowPage = window.showPage;
        if (typeof originalShowPage === 'function' && !originalShowPage._v058) {
            const wrapped = function (pageId) {
                if (!pageId) pageId = lastUserPage;
                lastUserPage = pageId;
                return originalShowPage.call(this, pageId);
            };
            wrapped._v058 = true;
            window.showPage = wrapped;
        }
        document.body.classList.add('v058-stable-ui');
    }

    function init() {
        document.body.classList.add('v058');
        patchCockpit();
        initUnifiedRules().catch(err => console.warn('Règles V0.58', err));
        patchCategorySync();
        patchImportReport();
        renderImportHistory();
        patchDocumentsSmartRename();
        stabilizePanels();
        // V0.58.1 : on évite les rafraîchissements répétés qui faisaient alterner l'accueil.
        setTimeout(() => { patchCockpit(); patchDuplicateCards(); }, 800);
    }

    ready(init);
})();
