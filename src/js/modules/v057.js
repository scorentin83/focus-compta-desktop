// Focus Compta V0.57 - Stabilisation cockpit, règles banque et tiers
(function focusComptaV057() {
    const IGNORE_KEY = 'focus_ignored_third_party_duplicate_pairs_v057';

    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function money(value) {
        const n = Number(value || 0);
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
    }

    function toast(message, type = 'success') {
        if (typeof window.showToast === 'function') return window.showToast(message, type);
        if (typeof window.focusToastV041 === 'function') return window.focusToastV041(message, type);
        console.log(message);
    }

    function normalize(value) {
        return String(value || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\b(SAS|SASU|SARL|SA|SCI|EURL|SOCIETE|STE|AG|ETS|ETABLISSEMENTS|FACTURE|N|NO|NUMERO)\b/g, ' ')
            .replace(/[^A-Z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getIgnoredPairs() {
        try { return JSON.parse(localStorage.getItem(IGNORE_KEY) || '[]'); } catch (_) { return []; }
    }

    function pairKey(a, b) {
        const ids = [Number(a), Number(b)].filter(Boolean).sort((x, y) => x - y);
        return ids.join(':');
    }

    function ignorePair(a, b) {
        const key = pairKey(a, b);
        if (!key) return;
        const next = Array.from(new Set([...getIgnoredPairs(), key]));
        localStorage.setItem(IGNORE_KEY, JSON.stringify(next));
    }

    function levenshtein(a, b) {
        a = normalize(a); b = normalize(b);
        if (!a || !b) return 0;
        const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
        for (let j = 1; j <= b.length; j++) m[0][j] = j;
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
            }
        }
        const dist = m[a.length][b.length];
        return Math.round((1 - dist / Math.max(a.length, b.length)) * 100);
    }

    function firstLetter(name) {
        const s = normalize(name);
        const c = s.charAt(0);
        return /[A-Z]/.test(c) ? c : '#';
    }

    function getId(item) {
        if (!item) return null;
        if (Array.isArray(item.ids) && item.ids.length) return Number(item.ids[0]);
        return Number(item.id || item.third_party_id || 0) || null;
    }

    function getTypes(tiers) {
        const custom = (() => { try { return JSON.parse(localStorage.getItem('focus_custom_third_party_types_v0561') || '[]'); } catch (_) { return []; } })();
        const base = ['administration','assurance','autre','banque','client','fournisseur','Mutuelle','organisme','Tiers-payant'];
        const fromTiers = (tiers || []).map(t => t.type).filter(Boolean);
        return Array.from(new Set([...base, ...custom, ...fromTiers].map(x => String(x || '').trim()).filter(Boolean)))
            .sort((a, b) => a.localeCompare(b, 'fr'));
    }

    function addCustomType(type) {
        const clean = String(type || '').trim();
        if (!clean) return;
        let list = [];
        try { list = JSON.parse(localStorage.getItem('focus_custom_third_party_types_v0561') || '[]'); } catch (_) { list = []; }
        list = Array.from(new Set([...list, clean])).sort((a, b) => a.localeCompare(b, 'fr'));
        localStorage.setItem('focus_custom_third_party_types_v0561', JSON.stringify(list));
    }

    function findPairs(tiers) {
        const ignored = new Set(getIgnoredPairs());
        const pairs = [];
        for (let i = 0; i < tiers.length; i++) {
            for (let j = i + 1; j < tiers.length; j++) {
                const a = tiers[i], b = tiers[j];
                const ia = getId(a), ib = getId(b);
                if (!ia || !ib || ignored.has(pairKey(ia, ib))) continue;
                const na = normalize(a.name), nb = normalize(b.name);
                if (!na || !nb || na === nb) continue;
                const score = levenshtein(na, nb);
                const containsScore = (na.includes(nb) || nb.includes(na)) && Math.min(na.length, nb.length) >= 5 ? 91 : 0;
                const finalScore = Math.max(score, containsScore);
                if (finalScore >= 86) pairs.push({ a, b, score: finalScore });
            }
        }
        return pairs.sort((x, y) => y.score - x.score).slice(0, 20);
    }

    let v57Search = '';
    let v57Letter = 'all';
    let v57Type = 'all';
    let v57Page = 0;

    async function loadThirdPartiesV057(options = {}) {
        const company = window.selectedCompany || window.currentCompany || null;
        const list = document.getElementById('thirdPartiesList');
        const summary = document.getElementById('thirdPartiesSummary');
        if (!list) return;
        if (!company || !company.id) {
            list.innerHTML = '<div class="empty-state">Sélectionne une société pour gérer les tiers.</div>';
            return;
        }
        if (!options.skipCleanup) {
            try { await window.api.backfillThirdParties({ companyId: company.id }); } catch (e) { console.warn(e); }
        }
        let tiers = [];
        try { tiers = await window.api.getThirdParties({ companyId: company.id, year: 'all' }); } catch (e) { console.error(e); }
        tiers = Array.isArray(tiers) ? tiers : [];
        const pairs = findPairs(tiers);
        const types = getTypes(tiers);
        const search = v57Search.trim().toLowerCase();
        const filtered = tiers.filter(t => {
            const name = String(t.name || '');
            const hay = [t.name, t.type, t.iban, t.siret].map(x => String(x || '').toLowerCase()).join(' ');
            return (v57Letter === 'all' || firstLetter(name) === v57Letter)
                && (v57Type === 'all' || String(t.type || 'autre') === v57Type)
                && (!search || hay.includes(search));
        }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' }));
        const shown = filtered.slice(0, (v57Page + 1) * 50);
        const toQualify = tiers.filter(t => String(t.type || 'autre').toLowerCase() === 'autre').length;
        if (summary) summary.textContent = `${tiers.length} tiers · ${pairs.length} doublon(s) probable(s) · ${toQualify} à qualifier`;
        const letters = ['all', '#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
        list.innerHTML = `
            <section class="tiers-directory-v057">
                <div class="tiers-hero-v056 tiers-hero-v057">
                    <div><span class="eyebrow">Répertoire tiers intelligent</span><h2>${tiers.length} tiers</h2><p>Recherche alphabétique, qualification et contrôle des doublons.</p></div>
                    <div class="tiers-kpis-v056"><strong>${pairs.length}</strong><span>doublons probables</span></div>
                    <div class="tiers-kpis-v056"><strong>${toQualify}</strong><span>à qualifier</span></div>
                </div>
                ${pairs.length ? `<div class="tiers-priority-v056 tiers-priority-v057"><h3>Doublons probables à vérifier</h3>${pairs.slice(0, 6).map(p => {
                    const ia = getId(p.a), ib = getId(p.b);
                    return `<article class="duplicate-card-v056 duplicate-card-v057">
                        <div><strong>${escapeHtml(p.a.name)}</strong><span>↔</span><strong>${escapeHtml(p.b.name)}</strong><small>Confiance ${p.score}%</small></div>
                        <div class="duplicate-actions-v057">
                            <button type="button" data-v057-merge-a="${ia}" data-v057-merge-b="${ib}">Fusionner</button>
                            <button type="button" class="secondary-button" data-v057-ignore-a="${ia}" data-v057-ignore-b="${ib}">Ignorer définitivement</button>
                        </div>
                    </article>`;
                }).join('')}</div>` : ''}
                <div class="tiers-searchbar-v056 tiers-searchbar-v0561">
                    <input id="tiersSearchV057" type="search" placeholder="Rechercher nom, type, IBAN, SIRET…" value="${escapeHtml(v57Search)}">
                    <select id="tiersTypeV057"><option value="all">Tous les types</option>${types.map(t => `<option value="${escapeHtml(t)}" ${v57Type === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select>
                </div>
                <div class="tiers-add-type-v0561">
                    <input id="tiersNewTypeV057" type="text" placeholder="Ajouter un type, ex : bailleur, transporteur…">
                    <button id="tiersAddTypeBtnV057" type="button" class="secondary-button">+ Ajouter le type</button>
                </div>
                <div class="alphabet-v056">${letters.map(l => `<button type="button" class="${v57Letter === l ? 'active' : ''}" data-v057-letter="${l}">${l === 'all' ? 'Tous' : l}</button>`).join('')}</div>
                <div class="tiers-table-card-v056">
                    <div class="table-head-v056"><strong>${filtered.length} résultat(s)</strong><span>${shown.length} affiché(s)</span></div>
                    <table class="third-party-table-v04117 tiers-table-v056"><thead><tr><th>Nom</th><th>Type</th><th>Opérations</th><th>Débits</th><th>Crédits</th><th>Actions</th></tr></thead><tbody>
                    ${shown.map(t => {
                        const id = getId(t);
                        return `<tr>
                            <td><strong>${escapeHtml(t.name)}</strong>${String(t.type || 'autre').toLowerCase() === 'autre' ? '<small class="badge-warning-v056">à qualifier</small>' : ''}</td>
                            <td><select data-v057-type-id="${id}">${types.map(type => `<option value="${escapeHtml(type)}" ${String(type) === String(t.type || 'autre') ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}</select></td>
                            <td>${Number(t.operations_count || 0)}</td>
                            <td class="debit">${money(Math.abs(Number(t.debit_total || 0)))}</td>
                            <td class="credit">${money(Number(t.credit_total || 0))}</td>
                            <td><button class="menu-dot-v056" data-v057-details="${id}" type="button">Détails</button><button class="menu-dot-v056" data-v057-merge="${id}" type="button">Fusionner</button></td>
                        </tr>`;
                    }).join('')}</tbody></table>
                    ${shown.length < filtered.length ? '<button id="tiersShowMoreV057" type="button" class="secondary-button show-more-v056">Afficher 50 de plus</button>' : ''}
                </div>
            </section>`;

        document.getElementById('tiersSearchV057')?.addEventListener('input', e => { v57Search = e.target.value; v57Page = 0; setTimeout(() => loadThirdPartiesV057({ skipCleanup: true }), 120); });
        document.getElementById('tiersTypeV057')?.addEventListener('change', e => { v57Type = e.target.value || 'all'; v57Page = 0; loadThirdPartiesV057({ skipCleanup: true }); });
        document.querySelectorAll('[data-v057-letter]').forEach(btn => btn.addEventListener('click', () => { v57Letter = btn.dataset.v057Letter; v57Page = 0; loadThirdPartiesV057({ skipCleanup: true }); }));
        document.getElementById('tiersShowMoreV057')?.addEventListener('click', () => { v57Page += 1; loadThirdPartiesV057({ skipCleanup: true }); });
        document.getElementById('tiersAddTypeBtnV057')?.addEventListener('click', async () => {
            const input = document.getElementById('tiersNewTypeV057');
            const value = input?.value?.trim();
            if (!value) return;
            addCustomType(value);
            toast(`Type ajouté : ${value}`);
            await loadThirdPartiesV057({ skipCleanup: true });
        });
        list.querySelectorAll('[data-v057-type-id]').forEach(sel => sel.addEventListener('change', async e => {
            await window.api.updateThirdPartyTypeBulk({ thirdPartyIds: [Number(e.target.dataset.v057TypeId)], type: e.target.value || 'autre' });
            toast('Type de tiers mis à jour.');
            await loadThirdPartiesV057({ skipCleanup: true });
        }));
        list.querySelectorAll('[data-v057-ignore-a]').forEach(btn => btn.addEventListener('click', async () => {
            ignorePair(btn.dataset.v057IgnoreA, btn.dataset.v057IgnoreB);
            toast('Proposition ignorée définitivement.');
            await loadThirdPartiesV057({ skipCleanup: true });
        }));
        list.querySelectorAll('[data-v057-merge-a]').forEach(btn => btn.addEventListener('click', async () => {
            const a = tiers.find(t => String(getId(t)) === String(btn.dataset.v057MergeA));
            if (a && typeof window.showThirdPartyMergeModalV04112 === 'function') await window.showThirdPartyMergeModalV04112({ ...a, id: getId(a) }, tiers);
            await loadThirdPartiesV057({ skipCleanup: true });
        }));
        list.querySelectorAll('[data-v057-merge]').forEach(btn => btn.addEventListener('click', async () => {
            const t = tiers.find(x => String(getId(x)) === String(btn.dataset.v057Merge));
            if (t && typeof window.showThirdPartyMergeModalV04112 === 'function') await window.showThirdPartyMergeModalV04112({ ...t, id: getId(t) }, tiers);
            await loadThirdPartiesV057({ skipCleanup: true });
        }));
        list.querySelectorAll('[data-v057-details]').forEach(btn => btn.addEventListener('click', async () => {
            const t = tiers.find(x => String(getId(x)) === String(btn.dataset.v057Details));
            if (t && typeof window.showThirdPartyDetailsModalV0421 === 'function') await window.showThirdPartyDetailsModalV0421({ ...t, id: getId(t) });
        }));
    }

    function patchThirdParties() {
        window.loadThirdParties = loadThirdPartiesV057;
        const refresh = document.getElementById('refreshThirdParties');
        if (refresh && !refresh.dataset.v057Bound) {
            refresh.dataset.v057Bound = '1';
            refresh.addEventListener('click', event => {
                event.preventDefault(); event.stopImmediatePropagation();
                loadThirdPartiesV057({ skipCleanup: false });
            }, true);
        }
    }

    function categories() {
        if (typeof window.focusGetCustomCategoriesV0405 === 'function') return window.focusGetCustomCategoriesV0405();
        return ['Achats', 'Banque', 'Électricité', 'Frais bancaires', 'Loyer', 'Salaires', 'Tiers-payant', 'Ventes'];
    }

    function ensureSelect(id, placeholder) {
        let el = document.getElementById(id);
        if (!el) return null;
        if (el.tagName !== 'SELECT') {
            const select = document.createElement('select');
            select.id = id;
            select.className = el.className;
            select.title = el.title || placeholder || '';
            el.replaceWith(select);
            el = select;
        }
        const current = el.value;
        el.innerHTML = `<option value="">${escapeHtml(placeholder || 'Choisir…')}</option>` + categories().map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        if ([...el.options].some(o => o.value === current)) el.value = current;
        return el;
    }

    function syncCategoryInputs() {
        ensureSelect('categoryName', 'Catégorie automatique…');
        ensureSelect('automationCategoryV031', 'Catégorie à appliquer…');
        document.querySelectorAll('select.inline-category-select, #detailCategory').forEach(select => {
            const current = select.value;
            if (typeof window.focusPopulateCategorySelectV0405 === 'function') window.focusPopulateCategorySelectV0405(select, select.id === 'detailCategory' ? 'Non catégorisé' : undefined);
            if ([...select.options].some(o => o.value === current)) select.value = current;
        });
    }

    async function renderCategoryRulesV057() {
        const list = document.getElementById('categoryRulesList');
        if (!list || !window.api.getCategoryRules) return;
        const rules = await window.api.getCategoryRules();
        list.classList.add('rules-table-v057');
        list.innerHTML = rules.length ? rules.map(rule => `
            <li class="rule-row-v057" data-rule-id="${rule.id}">
                <input class="rule-keyword-v057" value="${escapeHtml(rule.keyword || '')}" placeholder="Mot-clé">
                <select class="rule-category-v057">${categories().map(c => `<option value="${escapeHtml(c)}" ${c === rule.category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
                <span class="row-actions-v0406"><button type="button" data-save-category-rule="${rule.id}">Enregistrer</button><button type="button" data-delete-category-rule="${rule.id}">Supprimer</button></span>
            </li>`).join('') : '<li class="muted">Aucune catégorie automatique.</li>';
        list.querySelectorAll('[data-save-category-rule]').forEach(btn => btn.addEventListener('click', async () => {
            const li = btn.closest('li');
            const old = rules.find(r => String(r.id) === String(btn.dataset.saveCategoryRule));
            const keyword = li.querySelector('.rule-keyword-v057')?.value?.trim();
            const category = li.querySelector('.rule-category-v057')?.value?.trim();
            if (!keyword || !category) return toast('Mot-clé et catégorie obligatoires.', 'error');
            if (old && old.keyword && old.keyword !== keyword && window.api.deleteCategoryRule) await window.api.deleteCategoryRule(old.id);
            await window.api.addCategoryRule({ keyword, category });
            toast('Catégorie automatique modifiée.');
            await renderCategoryRulesV057();
        }));
        list.querySelectorAll('[data-delete-category-rule]').forEach(btn => btn.addEventListener('click', async () => {
            if (window.api.deleteCategoryRule) await window.api.deleteCategoryRule(Number(btn.dataset.deleteCategoryRule));
            toast('Catégorie automatique supprimée.');
            await renderCategoryRulesV057();
        }));
    }

    async function renderAutomationRulesV057() {
        const list = document.getElementById('automationRulesListV031');
        if (!list || !window.api.getAutomationRules) return;
        const companyId = window.selectedCompany?.id || null;
        const rules = await window.api.getAutomationRules({ companyId });
        list.classList.add('rules-table-v057');
        const statuses = [
            ['', 'Ne pas changer'], ['verified', 'Vérifié'], ['attached', 'Pièce jointe'], ['missing', 'Justificatif manquant'], ['review', 'À vérifier'], ['ignored', 'Validé sans justificatif']
        ];
        const targets = [['all','Compte + libellé + tiers'], ['account_name','Nom du compte'], ['label','Libellé opération'], ['third_party_name','Fournisseur / tiers']];
        list.innerHTML = rules.length ? rules.map(rule => `
            <li class="rule-row-v057" data-rule-id="${rule.id}">
                <select class="auto-target-v057">${targets.map(([v,l]) => `<option value="${v}" ${v === (rule.target || 'all') ? 'selected' : ''}>${l}</option>`).join('')}</select>
                <input class="auto-keyword-v057" value="${escapeHtml(rule.keyword || '')}" placeholder="Contient…">
                <select class="auto-category-v057"><option value="">Catégorie inchangée</option>${categories().map(c => `<option value="${escapeHtml(c)}" ${c === rule.category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
                <input class="auto-third-v057" value="${escapeHtml(rule.third_party_name || '')}" placeholder="Tiers optionnel">
                <select class="auto-status-v057">${statuses.map(([v,l]) => `<option value="${v}" ${v === (rule.status || '') ? 'selected' : ''}>${l}</option>`).join('')}</select>
                <span class="row-actions-v0406"><button type="button" data-save-auto-rule="${rule.id}">Enregistrer</button><button type="button" data-delete-auto-rule="${rule.id}">Supprimer</button></span>
            </li>`).join('') : '<li class="muted">Aucune règle automatique.</li>';
        list.querySelectorAll('[data-save-auto-rule]').forEach(btn => btn.addEventListener('click', async () => {
            const li = btn.closest('li');
            await window.api.updateAutomationRule({
                ruleId: Number(btn.dataset.saveAutoRule),
                companyId,
                target: li.querySelector('.auto-target-v057')?.value || 'all',
                keyword: li.querySelector('.auto-keyword-v057')?.value?.trim() || '',
                category: li.querySelector('.auto-category-v057')?.value || '',
                thirdPartyName: li.querySelector('.auto-third-v057')?.value?.trim() || '',
                status: li.querySelector('.auto-status-v057')?.value || ''
            });
            toast('Règle automatique modifiée.');
            await renderAutomationRulesV057();
        }));
        list.querySelectorAll('[data-delete-auto-rule]').forEach(btn => btn.addEventListener('click', async () => {
            await window.api.deleteAutomationRule(Number(btn.dataset.deleteAutoRule));
            toast('Règle automatique supprimée.');
            await renderAutomationRulesV057();
        }));
    }

    function patchRuleButtons() {
        const addCat = document.getElementById('addCategoryRule');
        if (addCat && !addCat.dataset.v057Bound) {
            addCat.dataset.v057Bound = '1';
            addCat.addEventListener('click', async event => {
                event.preventDefault(); event.stopImmediatePropagation();
                const keyword = document.getElementById('categoryKeyword')?.value?.trim();
                const category = document.getElementById('categoryName')?.value?.trim();
                if (!keyword || !category) return toast('Mot-clé et catégorie obligatoires.', 'error');
                await window.api.addCategoryRule({ keyword, category });
                document.getElementById('categoryKeyword').value = '';
                document.getElementById('categoryName').value = '';
                await renderCategoryRulesV057();
                toast('Catégorie automatique enregistrée.');
            }, true);
        }
        const addAuto = document.getElementById('addAutomationRuleV031');
        if (addAuto && !addAuto.dataset.v057Bound) {
            addAuto.dataset.v057Bound = '1';
            addAuto.addEventListener('click', () => setTimeout(renderAutomationRulesV057, 250));
        }
        const apply = document.getElementById('applyAutomationRulesV031');
        if (apply && !apply.dataset.v057AfterBound) {
            apply.dataset.v057AfterBound = '1';
            apply.addEventListener('click', () => setTimeout(() => {
                try { if (typeof window.refreshAccountView === 'function') window.refreshAccountView(false); } catch (_) {}
            }, 400));
        }
    }

    function patchSettingsRules() {
        syncCategoryInputs();
        renderCategoryRulesV057();
        renderAutomationRulesV057();
        patchRuleButtons();
        window.addEventListener('focus-taxonomies-updated-v0405', () => {
            syncCategoryInputs();
            renderCategoryRulesV057();
            renderAutomationRulesV057();
            toast('Référentiels synchronisés.');
        });
    }

    function simplifyHome() {
        const rebuild = () => {
            const alerts = [...document.querySelectorAll('#v050AlertsList .alert-line-v050')]
                .map(el => {
                    const label = el.querySelector('span')?.textContent?.replace(/Anomalies détectées/i, 'Doublons tiers à vérifier').trim() || '';
                    const value = el.querySelector('strong')?.textContent?.trim() || '';
                    const n = Number((value.match(/\d+/) || ['0'])[0]);
                    return { label, value, n, page: el.dataset.page || 'homePage' };
                }).filter(x => x.label && x.n > 0);
            const box = document.getElementById('v055ActionNowBox');
            if (box) {
                box.classList.add('action-now-v057');
                box.innerHTML = `<div class="panel-heading"><span>À traiter</span><h3>${alerts.length ? 'Actions concrètes' : 'Tout est à jour'}</h3></div>
                    <div class="action-now-list-v055">${alerts.length ? alerts.map(a => `<button type="button" class="action-line-v055 action-line-v056" data-page="${a.page}"><span>${escapeHtml(a.label)}</span><small>Ouvrir le module concerné</small><strong>${escapeHtml(a.value)}</strong></button>`).join('') : '<div class="action-line-v055 is-empty"><span>Aucune action bloquante détectée</span><strong>OK</strong></div>'}</div>`;
                box.querySelectorAll('[data-page]').forEach(btn => btn.onclick = () => typeof window.showPage === 'function' && window.showPage(btn.dataset.page));
            }
            const alertList = document.getElementById('v050AlertsList');
            if (alertList) {
                const panel = alertList.closest('.cockpit-panel-v050, .clean-panel, .panel');
                if (panel) panel.classList.add('hide-duplicate-alerts-v057');
            }
            const subtitle = document.getElementById('v050GlobalStatusSubtitle');
            if (subtitle && alerts.length) subtitle.textContent = alerts.map(a => `${a.label} : ${a.value}`).join(' · ');
        };
        setTimeout(rebuild, 500);
    }

    function addImportHistoryPlaceholder() {
        // Ajoute un accès clair sans perturber le moteur existant.
        const bankPage = document.getElementById('bankPage');
        if (!bankPage || document.getElementById('importHistoryV057')) return;
        const panel = document.createElement('section');
        panel.id = 'importHistoryV057';
        panel.className = 'panel clean-panel import-history-v057';
        panel.innerHTML = '<h3>Historique des imports</h3><p class="muted">Les prochains imports afficheront ici le résultat détaillé : conforme, écart, lignes manquantes et totaux débit/crédit.</p>';
        bankPage.appendChild(panel);
    }

    function init() {
        document.body.classList.add('v057');
        patchThirdParties();
        patchSettingsRules();
        simplifyHome();
        addImportHistoryPlaceholder();
        setTimeout(() => { patchThirdParties(); syncCategoryInputs(); patchRuleButtons(); }, 500);
    }

    ready(init);
})();
