// Focus Compta V0.56 — Stabilisation produit, Cockpit actionnable, Banque propre, Répertoire Tiers
(function () {
    'use strict';

    const escape = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const money = (value) => {
        try {
            if (typeof formatAmount === 'function') return formatAmount(Number(value || 0));
        } catch (_) {}
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
    };

    const norm = (value) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\b(SAS|SARL|SASU|SA|EURL|SCI|SCM|SELARL|SOCIETE|STE|AG|ET|DE|DU|DES|LA|LE|LES|FRANCE)\b/g, ' ')
        .replace(/\b(FACTURE|FAC|N|NO|NUM|PRLV|PRELEVEMENT|VIR|VIREMENT|CARTE|CB|COM|SEPA)\b/g, ' ')
        .replace(/\b[A-Z]*\d{2,}[A-Z0-9]*\b/g, ' ')
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    function similarity(a, b) {
        const aa = norm(a); const bb = norm(b);
        if (!aa || !bb) return 0;
        if (aa === bb) return 100;
        if (aa.includes(bb) || bb.includes(aa)) return Math.round(85 + 15 * Math.min(aa.length, bb.length) / Math.max(aa.length, bb.length));
        const A = new Set(aa.split(' ').filter(w => w.length > 2));
        const B = new Set(bb.split(' ').filter(w => w.length > 2));
        if (!A.size || !B.size) return 0;
        const common = [...A].filter(w => B.has(w)).length;
        return Math.round(100 * common / Math.max(A.size, B.size));
    }

    function findDuplicatePairs(tiers) {
        const pairs = [];
        const list = Array.isArray(tiers) ? tiers : [];
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const score = similarity(list[i].name, list[j].name);
                if (score >= 82) pairs.push({ a: list[i], b: list[j], score });
            }
        }
        return pairs.sort((x, y) => y.score - x.score).slice(0, 8);
    }

    function firstLetter(name) {
        const s = norm(name);
        const c = s.charAt(0);
        return /[A-Z]/.test(c) ? c : '#';
    }

    function getIds(third) {
        if (Array.isArray(third.third_party_ids)) return third.third_party_ids.map(Number).filter(Boolean);
        return [Number(third.id)].filter(Boolean);
    }

    function getCustomThirdPartyTypesV0561() {
        try { return JSON.parse(localStorage.getItem('focusCustomThirdPartyTypesV0561') || '[]').filter(Boolean); }
        catch (_) { return []; }
    }

    function saveCustomThirdPartyTypeV0561(type) {
        const clean = String(type || '').trim();
        if (!clean) return false;
        const current = getCustomThirdPartyTypesV0561();
        if (!current.some(t => t.toLowerCase() === clean.toLowerCase())) {
            current.push(clean);
            localStorage.setItem('focusCustomThirdPartyTypesV0561', JSON.stringify(current));
        }
        return true;
    }

    function typesFrom(tiers) {
        return Array.from(new Set(['fournisseur','client','banque','assurance','administration','organisme','Mutuelle','Tiers-payant','autre', ...getCustomThirdPartyTypesV0561(), ...(tiers || []).map(t => t.type || 'autre')]))
            .sort((a,b) => String(a).localeCompare(String(b), 'fr', { sensitivity:'base' }));
    }

    let v056Letter = 'all';
    let v056Search = '';
    let v056Type = 'all';
    let v056Page = 0;

    async function loadThirdPartiesV056(options = {}) {
        const list = document.getElementById('thirdPartiesList');
        const summary = document.getElementById('thirdPartiesSummary');
        if (!list) return;
        if (!window.selectedCompany && typeof selectedCompany !== 'undefined') window.selectedCompany = selectedCompany;
        const company = window.selectedCompany || (typeof selectedCompany !== 'undefined' ? selectedCompany : null);
        if (!company) {
            list.innerHTML = '<div class="empty-state">Sélectionne une société pour afficher le répertoire tiers.</div>';
            if (summary) summary.textContent = 'Aucune société sélectionnée.';
            return;
        }
        list.innerHTML = '<div class="empty-state">Chargement du répertoire tiers…</div>';
        try { if (!options.skipCleanup) await window.api.backfillThirdParties({ companyId: company.id }); } catch (_) {}
        let tiers = [];
        try { tiers = await window.api.getThirdParties({ companyId: company.id, year: 'all' }); } catch (e) { console.error(e); }
        tiers = Array.isArray(tiers) ? tiers : [];
        const pairs = findDuplicatePairs(tiers);
        const types = typesFrom(tiers);
        const search = v056Search.trim().toLowerCase();
        const filtered = tiers.filter(t => {
            const letterOk = v056Letter === 'all' || firstLetter(t.name) === v056Letter;
            const typeOk = v056Type === 'all' || String(t.type || 'autre') === v056Type;
            const searchOk = !search || String(t.name || '').toLowerCase().includes(search) || String(t.type || '').toLowerCase().includes(search);
            return letterOk && typeOk && searchOk;
        }).sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity:'base' }));
        const pageSize = 50;
        const shown = filtered.slice(0, (v056Page + 1) * pageSize);
        const letters = ['all', '#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
        const countByType = (type) => tiers.filter(t => String(t.type || 'autre') === type).length;
        if (summary) summary.innerHTML = `${tiers.length} tiers · ${pairs.length} doublon(s) probable(s) · ${tiers.filter(t => (t.type || 'autre') === 'autre').length} à qualifier`;
        list.innerHTML = `
            <section class="tiers-directory-v056">
                <div class="tiers-hero-v056">
                    <div><span class="eyebrow">Répertoire tiers intelligent</span><h2>${tiers.length} tiers</h2><p>Recherche, validation manuelle et détection des doublons avant création comptable.</p></div>
                    <div class="tiers-kpis-v056"><strong>${pairs.length}</strong><span>doublons probables</span></div>
                    <div class="tiers-kpis-v056"><strong>${countByType('autre')}</strong><span>à qualifier</span></div>
                </div>
                ${pairs.length ? `<div class="tiers-priority-v056"><h3>Doublons probables à vérifier</h3>${pairs.slice(0,4).map(p => `
                    <article class="duplicate-card-v056">
                        <div><strong>${escape(p.a.name)}</strong><span>↔</span><strong>${escape(p.b.name)}</strong><small>Confiance ${p.score}%</small></div>
                        <button type="button" data-v056-merge-a="${getIds(p.a)[0]}" data-v056-merge-b="${getIds(p.b)[0]}">Fusionner</button>
                    </article>`).join('')}</div>` : ''}
                <div class="tiers-searchbar-v056 tiers-searchbar-v0561">
                    <input id="tiersSearchV056" type="search" placeholder="Rechercher nom, type, IBAN, SIRET…" value="${escape(v056Search)}">
                    <select id="tiersTypeV056"><option value="all">Tous les types</option>${types.map(t => `<option value="${escape(t)}" ${v056Type === t ? 'selected' : ''}>${escape(t)}</option>`).join('')}</select>
                </div>
                <div class="tiers-add-type-v0561">
                    <input id="tiersNewTypeV0561" type="text" placeholder="Ajouter un type, ex : bailleur, transporteur…">
                    <button id="tiersAddTypeBtnV0561" type="button" class="secondary-button">+ Ajouter le type</button>
                </div>
                <div class="alphabet-v056">${letters.map(l => `<button type="button" class="${v056Letter === l ? 'active' : ''}" data-letter="${l}">${l === 'all' ? 'Tous' : l}</button>`).join('')}</div>
                <div class="tiers-table-card-v056">
                    <div class="table-head-v056"><strong>${filtered.length} résultat(s)</strong><span>${shown.length} affiché(s)</span></div>
                    <table class="third-party-table-v04117 tiers-table-v056"><thead><tr><th>Nom</th><th>Type</th><th>Opérations</th><th>Débits</th><th>Crédits</th><th></th></tr></thead><tbody>
                        ${shown.map(t => {
                            const id = getIds(t)[0] || t.id;
                            return `<tr>
                                <td><strong>${escape(t.name)}</strong>${(t.type || 'autre') === 'autre' ? '<small class="badge-warning-v056">à qualifier</small>' : ''}</td>
                                <td><select data-v056-type-id="${id}">${types.map(type => `<option value="${escape(type)}" ${String(type) === String(t.type || 'autre') ? 'selected' : ''}>${escape(type)}</option>`).join('')}</select></td>
                                <td>${Number(t.operations_count || 0)}</td>
                                <td class="debit">${money(Math.abs(Number(t.debit_total || 0)))}</td>
                                <td class="credit">${money(Number(t.credit_total || 0))}</td>
                                <td><button class="menu-dot-v056" data-v056-details="${id}" type="button">Détails</button><button class="menu-dot-v056" data-v056-merge="${id}" type="button">Fusionner</button></td>
                            </tr>`;
                        }).join('')}
                    </tbody></table>
                    ${shown.length < filtered.length ? '<button id="tiersShowMoreV056" type="button" class="secondary-button show-more-v056">Afficher 50 de plus</button>' : ''}
                </div>
            </section>`;

        const searchInput = document.getElementById('tiersSearchV056');
        if (searchInput) searchInput.addEventListener('input', (e) => { v056Search = e.target.value; v056Page = 0; setTimeout(() => loadThirdPartiesV056({ skipCleanup:true }), 100); });
        const typeSelect = document.getElementById('tiersTypeV056');
        if (typeSelect) typeSelect.addEventListener('change', (e) => { v056Type = e.target.value || 'all'; v056Page = 0; loadThirdPartiesV056({ skipCleanup:true }); });
        const addTypeBtn = document.getElementById('tiersAddTypeBtnV0561');
        const addTypeInput = document.getElementById('tiersNewTypeV0561');
        if (addTypeBtn && addTypeInput) addTypeBtn.addEventListener('click', async () => {
            const value = addTypeInput.value.trim();
            if (!value) return;
            saveCustomThirdPartyTypeV0561(value);
            v056Type = 'all';
            if (typeof showToastV0409 === 'function') showToastV0409(`Type ajouté : ${value}`);
            await loadThirdPartiesV056({ skipCleanup:true });
        });
        if (addTypeInput) addTypeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('tiersAddTypeBtnV0561')?.click(); } });
        list.querySelectorAll('[data-letter]').forEach(btn => btn.addEventListener('click', () => { v056Letter = btn.dataset.letter; v056Page = 0; loadThirdPartiesV056({ skipCleanup:true }); }));
        const showMore = document.getElementById('tiersShowMoreV056');
        if (showMore) showMore.addEventListener('click', () => { v056Page += 1; loadThirdPartiesV056({ skipCleanup:true }); });
        list.querySelectorAll('[data-v056-type-id]').forEach(sel => sel.addEventListener('change', async e => {
            await window.api.updateThirdPartyTypeBulk({ thirdPartyIds: [Number(e.target.dataset.v056TypeId)], type: e.target.value || 'autre' });
            if (typeof showToastV0409 === 'function') showToastV0409('Type de tiers mis à jour.');
            await loadThirdPartiesV056({ skipCleanup:true });
            try { if (typeof refreshAccountView === 'function' && selectedBankAccount) await refreshAccountView(false); } catch (_) {}
        }));
        list.querySelectorAll('[data-v056-details]').forEach(btn => btn.addEventListener('click', async () => {
            const t = tiers.find(x => String(getIds(x)[0] || x.id) === String(btn.dataset.v056Details));
            if (t && typeof showThirdPartyDetailsModalV0421 === 'function') await showThirdPartyDetailsModalV0421({ ...t, id: Number(btn.dataset.v056Details) });
        }));
        list.querySelectorAll('[data-v056-merge]').forEach(btn => btn.addEventListener('click', async () => {
            const t = tiers.find(x => String(getIds(x)[0] || x.id) === String(btn.dataset.v056Merge));
            if (t && typeof showThirdPartyMergeModalV04112 === 'function') await showThirdPartyMergeModalV04112({ ...t, id: Number(btn.dataset.v056Merge) }, tiers);
            await loadThirdPartiesV056({ skipCleanup:true });
        }));
        list.querySelectorAll('[data-v056-merge-a]').forEach(btn => btn.addEventListener('click', async () => {
            const t = tiers.find(x => String(getIds(x)[0] || x.id) === String(btn.dataset.v056MergeA));
            if (t && typeof showThirdPartyMergeModalV04112 === 'function') await showThirdPartyMergeModalV04112({ ...t, id: Number(btn.dataset.v056MergeA) }, tiers);
            await loadThirdPartiesV056({ skipCleanup:true });
        }));
    }

    function patchTiers() {
        window.loadThirdParties = loadThirdPartiesV056;
        const refresh = document.getElementById('refreshThirdParties');
        if (refresh && !refresh.dataset.v0561Patched) {
            refresh.dataset.v0561Patched = '1';
            refresh.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
                loadThirdPartiesV056({ skipCleanup:false });
            }, true);
        }
        document.querySelectorAll('.nav-button[data-page="thirdPartiesPage"], .nav-shortcut[data-page="thirdPartiesPage"]').forEach(button => {
            if (button.dataset.v0561NavPatched) return;
            button.dataset.v0561NavPatched = '1';
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (typeof showPage === 'function') showPage('thirdPartiesPage');
                loadThirdPartiesV056({ skipCleanup:true });
            }, true);
        });
    }

    function improveCockpitV056() {
        const rebuild = () => {
            const alerts = [...document.querySelectorAll('#v050AlertsList .alert-line-v050')].map(btn => {
                const label = btn.querySelector('span')?.textContent?.trim() || '';
                const value = btn.querySelector('strong')?.textContent?.trim() || '';
                const n = Number((value.match(/\d+/) || ['0'])[0]);
                return { label, value, n, page: btn.dataset.page || 'homePage' };
            }).filter(x => x.label && x.n > 0);
            const subtitle = document.getElementById('v050GlobalStatusSubtitle');
            if (subtitle && alerts.length) subtitle.textContent = alerts.map(a => `${a.label} : ${a.value}`).join(' · ');
            let box = document.getElementById('v055ActionNowBox');
            if (!box) return;
            const rows = alerts.map(a => {
                let help = 'Ouvrir le module concerné';
                let icon = '⚠️';
                if (/justificatif|opérations/i.test(a.label)) { help = 'Filtrer les opérations non vérifiées dans Banque'; icon = '🏦'; }
                if (/document/i.test(a.label)) { help = 'Ouvrir les documents à transmettre'; icon = '📄'; }
                if (/relev/i.test(a.label)) { help = 'Contrôler les relevés importés'; icon = '📑'; }
                if (/anomal/i.test(a.label)) { help = 'Voir le détail des contrôles : relevés avec écart ou doublons de tiers'; icon = '🔎'; }
                return `<button type="button" class="action-line-v055 action-line-v056" data-page="${a.page}"><span>${icon} ${escape(a.label)}</span><small>${escape(help)}</small><strong>${escape(a.value)}</strong></button>`;
            }).join('');
            box.innerHTML = `<div class="panel-heading"><span>À traiter maintenant</span><h3>Priorités concrètes</h3></div><div class="action-now-list-v055">${rows || '<div class="action-line-v055 is-empty"><span>Aucune action bloquante détectée</span><strong>OK</strong></div>'}</div>`;
            box.querySelectorAll('[data-page]').forEach(btn => btn.onclick = () => typeof showPage === 'function' && showPage(btn.dataset.page));
        };
        setTimeout(rebuild, 500);
    }

    function patchStatementLayout() {
        // UX uniquement : on retire les scrollbars horizontales et on rend les cartes lisibles.
        document.body.classList.add('v056-stabilized');
    }

    function init() {
        patchTiers();
        // V0.60.1 : pas de polling permanent.
        improveCockpitV056();
        patchStatementLayout();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
