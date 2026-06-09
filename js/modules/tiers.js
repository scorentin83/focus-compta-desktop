// Focus Compta V0.42 - Référentiel tiers intelligent, alias, split et recherche stable

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

let thirdPartySearchV0416 = '';
let thirdPartyTypeV0416 = 'all';
let thirdPartyYearV04117 = 'all';
let thirdPartySortFieldV04112 = 'debit';
let thirdPartySortDirectionV04112 = 'desc';
let selectedThirdPartyIdsV04117 = new Set();
let thirdPartySearchDebounceV042 = null;
let thirdPartyTypeOptionsV0423 = null;

function normalizeThirdPartyNameClientV0416(name) {
    return String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\b(SAS|SARL|SA|EURL|SCI|SELARL|SOCIETE|FRANCE|COMPANY|COMPAGNIE)\b/g, ' ')
        .replace(/\b(FR|FRA|VIRE|VIREMENT|PRLV|PRELEVEMENT|CARTE|PISP|FINTE)\b/g, ' ')
        .replace(/\b[A-F0-9]{12,}\b/g, ' ')
        .replace(/\b[A-Z]*\d{4,}[A-Z0-9]*\b/g, ' ')
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function guessDuplicateGroupsV0416(tiers) {
    const groups = new Map();
    tiers.forEach(third => {
        const key = normalizeThirdPartyNameClientV0416(third.name);
        if (!key || key.length < 3) return;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(third);
    });
    return Array.from(groups.values()).filter(group => group.length > 1);
}

function getThirdPartyIdsV04117(third) {
    if (Array.isArray(third.third_party_ids)) return third.third_party_ids.map(Number).filter(Boolean);
    return [Number(third.id)].filter(Boolean);
}

function getAvailableThirdPartyTypesV04117(tiers) {
    const base = thirdPartyTypeOptionsV0423 || ['Mutuelle', 'Tiers-payant', 'fournisseur', 'client', 'organisme', 'banque', 'assurance', 'administration', 'autre'];
    const custom = tiers.map(t => t.type || 'autre').filter(Boolean);
    return Array.from(new Set([...base, ...custom])).sort((a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' }));
}

function renderThirdPartyToolbarV04117(tiers, duplicateGroups, years) {
    const types = getAvailableThirdPartyTypesV04117(tiers);
    const totalDebit = tiers.reduce((sum, t) => sum + Math.abs(Number(t.debit_total || 0)), 0);
    const totalCredit = tiers.reduce((sum, t) => sum + Math.abs(Number(t.credit_total || 0)), 0);

    return `
        <div class="third-party-header-v04117">
            <div class="third-party-toolbar-v04117">
                <input id="thirdPartySearchV0416" placeholder="Rechercher un tiers…" value="${escapeHtml(thirdPartySearchV0416)}">
                <select id="thirdPartyYearV04117">
                    <option value="all">Toutes les années</option>
                    ${(years || []).map(year => `<option value="${escapeHtml(year)}" ${thirdPartyYearV04117 === String(year) ? 'selected' : ''}>${escapeHtml(year)}</option>`).join('')}
                </select>
                <select id="thirdPartyTypeV0416">
                    <option value="all">Tous les types</option>
                    ${types.map(type => `<option value="${escapeHtml(type)}" ${thirdPartyTypeV0416 === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
                </select>
                <button id="thirdPartyApplyBusinessRulesV0423" type="button" class="btn-secondary">Appliquer règles métier</button>
                <button id="thirdPartyAutoCleanV0416" type="button">Nettoyer les doublons</button>
            </div>
            <div class="third-party-kpis-v04117">
                <div><strong>${tiers.length}</strong><span>tiers</span></div>
                <div><strong>${tiers.reduce((sum, t) => sum + Number(t.operations_count || 0), 0)}</strong><span>opérations</span></div>
                <div><strong>${formatAmount(totalDebit)}</strong><span>débits</span></div>
                <div><strong>${formatAmount(totalCredit)}</strong><span>crédits</span></div>
                <div><strong>${duplicateGroups.length}</strong><span>doublon(s)</span></div>
            </div>
        </div>
    `;
}

function getThirdPartySortValueV04112(third, field) {
    if (field === 'name') return String(third.name || '').toLowerCase();
    if (field === 'type') return String(third.type || 'autre').toLowerCase();
    if (field === 'operations') return Number(third.operations_count || 0);
    if (field === 'debit') return Math.abs(Number(third.debit_total || 0));
    if (field === 'credit') return Math.abs(Number(third.credit_total || 0));
    return String(third.name || '').toLowerCase();
}

function sortThirdPartiesV04112(tiers) {
    return [...tiers].sort((a, b) => {
        const av = getThirdPartySortValueV04112(a, thirdPartySortFieldV04112);
        const bv = getThirdPartySortValueV04112(b, thirdPartySortFieldV04112);
        let result = 0;
        if (typeof av === 'string' || typeof bv === 'string') result = String(av).localeCompare(String(bv), 'fr', { sensitivity: 'base' });
        else result = av - bv;
        return thirdPartySortDirectionV04112 === 'asc' ? result : -result;
    });
}

function renderSortHeaderV0421(field, label, className = '') {
    const active = thirdPartySortFieldV04112 === field;
    const arrow = active ? (thirdPartySortDirectionV04112 === 'asc' ? '↑' : '↓') : '↕';
    return `<button type="button" class="third-party-th-sort-v0421 ${active ? 'active' : ''}" data-sort="${field}">${label}<span>${arrow}</span></button>`;
}

function renderBulkTypeControlsV04117(types) {
    return `
        <div class="third-party-bulk-v04117">
            <label><input type="checkbox" id="thirdPartySelectAllV04117"> Tout sélectionner</label>
            <span id="thirdPartySelectionCountV04117">0 sélectionné</span>
            <select id="thirdPartyBulkTypeV04117">
                <option value="">Modifier le type…</option>
                ${types.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('')}
            </select>
            <button id="thirdPartyApplyBulkTypeV04117" type="button">Appliquer</button>
        </div>
    `;
}

function updateThirdPartySelectionCountV04117() {
    const count = selectedThirdPartyIdsV04117.size;
    const el = document.getElementById('thirdPartySelectionCountV04117');
    if (el) el.textContent = `${count} sélectionné${count > 1 ? 's' : ''}`;
}

async function loadThirdParties(options = {}) {
    const list = document.getElementById('thirdPartiesList');
    const summary = document.getElementById('thirdPartiesSummary');
    if (!list) return;

    list.innerHTML = '';
    if (!selectedCompany) {
        if (summary) summary.textContent = 'Sélectionne une société.';
        return;
    }

    if (!options.skipCleanup) await window.api.backfillThirdParties({ companyId: selectedCompany.id });
    const cleanup = options.skipCleanup ? null : await window.api.cleanupThirdParties({ companyId: selectedCompany.id });
    const years = typeof window.api.getThirdPartyYears === 'function'
        ? await window.api.getThirdPartyYears({ companyId: selectedCompany.id })
        : [];
    if (typeof window.api.getThirdPartyTypeOptions === 'function') {
        try { thirdPartyTypeOptionsV0423 = await window.api.getThirdPartyTypeOptions(); } catch (error) { console.warn(error); }
    }
    const tiers = await window.api.getThirdParties({ companyId: selectedCompany.id, year: thirdPartyYearV04117 });
    const duplicateGroups = guessDuplicateGroupsV0416(tiers);

    if (summary) {
        const merged = cleanup && typeof cleanup === 'object' ? cleanup.merged || 0 : 0;
        const yearLabel = thirdPartyYearV04117 === 'all' ? 'toutes années' : thirdPartyYearV04117;
        summary.innerHTML = `${tiers.length} tiers détecté(s) sur ${escapeHtml(yearLabel)}.${merged ? ` <strong>${merged} doublon(s) fusionné(s).</strong>` : ''}`;
    }

    const search = thirdPartySearchV0416.toLowerCase().trim();
    const filtered = tiers.filter(third => {
        const matchesSearch = !search || String(third.name || '').toLowerCase().includes(search) || String(third.type || '').toLowerCase().includes(search);
        const matchesType = thirdPartyTypeV0416 === 'all' || String(third.type || 'autre') === thirdPartyTypeV0416;
        return matchesSearch && matchesType;
    });
    const sorted = sortThirdPartiesV04112(filtered);
    const types = getAvailableThirdPartyTypesV04117(tiers);

    list.innerHTML = renderThirdPartyToolbarV04117(tiers, duplicateGroups, years);

    const searchInput = document.getElementById('thirdPartySearchV0416');
    if (searchInput) {
        searchInput.addEventListener('input', event => {
            thirdPartySearchV0416 = event.target.value;
            clearTimeout(thirdPartySearchDebounceV042);
            thirdPartySearchDebounceV042 = setTimeout(() => {
                loadThirdParties({ skipCleanup: true, preserveSearchFocus: true });
            }, 220);
        });
        if (options.preserveSearchFocus) {
            setTimeout(() => {
                const refreshed = document.getElementById('thirdPartySearchV0416');
                if (refreshed) {
                    refreshed.focus();
                    const pos = refreshed.value.length;
                    refreshed.setSelectionRange(pos, pos);
                }
            }, 0);
        }
    }

    const yearSelect = document.getElementById('thirdPartyYearV04117');
    if (yearSelect) yearSelect.addEventListener('change', event => {
        thirdPartyYearV04117 = event.target.value || 'all';
        selectedThirdPartyIdsV04117.clear();
        loadThirdParties();
    });

    const typeSelect = document.getElementById('thirdPartyTypeV0416');
    if (typeSelect) typeSelect.addEventListener('change', event => {
        thirdPartyTypeV0416 = event.target.value;
        selectedThirdPartyIdsV04117.clear();
        loadThirdParties();
    });

    const applyBusinessRules = document.getElementById('thirdPartyApplyBusinessRulesV0423');
    if (applyBusinessRules) applyBusinessRules.addEventListener('click', async () => {
        const result = await window.api.applyThirdPartyBusinessRules({ companyId: selectedCompany.id, force: true });
        if (typeof showToastV0409 === 'function') showToastV0409(`${result?.updated || 0} opération(s) Mutuelle classée(s) en Tiers-Payant / Vérifié.`);
        await loadThirdParties({ skipCleanup: true });
        if (selectedBankAccount) await refreshAccountView(false);
    });

    const autoClean = document.getElementById('thirdPartyAutoCleanV0416');
    if (autoClean) autoClean.addEventListener('click', async () => {
        const result = await window.api.cleanupThirdParties({ companyId: selectedCompany.id });
        const rules = await window.api.applyThirdPartyBusinessRules({ companyId: selectedCompany.id, force: true });
        if (typeof showToastV0409 === 'function') showToastV0409(`Nettoyage terminé : ${result?.merged || 0} fusion(s), ${result?.renamed || 0} renommage(s), ${rules?.updated || 0} opération(s) reclassée(s).`);
        await loadThirdParties();
        if (selectedBankAccount) await refreshAccountView(false);
    });

    const tableWrap = document.createElement('div');
    tableWrap.className = 'third-party-table-wrap-v04117';
    tableWrap.innerHTML = `
        <div class="third-party-table-top-v04117">
            <div><strong>${sorted.length}</strong> tiers affiché(s)</div>
        </div>
        ${renderBulkTypeControlsV04117(types)}
        <table class="third-party-table-v04117">
            <thead>
                <tr>
                    <th></th>
                    <th>${renderSortHeaderV0421('name', 'Nom')}</th>
                    <th>${renderSortHeaderV0421('type', 'Type')}</th>
                    <th class="number">${renderSortHeaderV0421('operations', 'Opérations')}</th>
                    <th class="number">${renderSortHeaderV0421('debit', 'Débits')}</th>
                    <th class="number">${renderSortHeaderV0421('credit', 'Crédits')}</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `;

    tableWrap.querySelectorAll('button[data-sort]').forEach(button => {
        button.addEventListener('click', () => {
            const field = button.dataset.sort;
            if (thirdPartySortFieldV04112 === field) thirdPartySortDirectionV04112 = thirdPartySortDirectionV04112 === 'asc' ? 'desc' : 'asc';
            else {
                thirdPartySortFieldV04112 = field;
                thirdPartySortDirectionV04112 = field === 'name' || field === 'type' ? 'asc' : 'desc';
            }
            loadThirdParties();
        });
    });

    const tbody = tableWrap.querySelector('tbody');
    sorted.forEach(third => {
        const ids = getThirdPartyIdsV04117(third);
        const primaryId = ids[0] || third.id;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="third-party-select-cell-v04117"><input type="checkbox" class="third-party-select-v04117" data-id="${primaryId}" ${selectedThirdPartyIdsV04117.has(primaryId) ? 'checked' : ''}></td>
            <td class="third-party-name-cell-v04117">
                <div class="third-party-name-editor-v0826">
                    <input class="third-party-name-input-v0826" value="${escapeHtml(third.name)}" title="Modifier le nom du tiers">
                    <button class="save-third-name-v0826 secondary-button" type="button" title="Enregistrer le nom">OK</button>
                </div>
            </td>
            <td>
                <select class="third-party-type-select-v0423" title="Modifier le type">
                    ${types.map(type => `<option value="${escapeHtml(type)}" ${String(type) === String(third.type || 'autre') ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
                </select>
            </td>
            <td class="number">${Number(third.operations_count || 0)}</td>
            <td class="number debit">${formatAmount(Math.abs(Number(third.debit_total || 0)))}</td>
            <td class="number credit">${formatAmount(Number(third.credit_total || 0))}</td>
            <td class="third-party-row-actions-v04117">
                <button class="details-third" type="button">Détails</button>
                <button class="edit-third" type="button">Modifier</button>
                <button class="merge-third" type="button">Fusionner</button>
                <button class="split-third" type="button">Dissocier</button>
            </td>
        `;
        row.querySelector('.third-party-select-v04117').addEventListener('change', event => {
            if (event.target.checked) selectedThirdPartyIdsV04117.add(primaryId);
            else selectedThirdPartyIdsV04117.delete(primaryId);
            updateThirdPartySelectionCountV04117();
        });
        row.querySelector('.save-third-name-v0826')?.addEventListener('click', async () => {
            const input = row.querySelector('.third-party-name-input-v0826');
            const name = String(input?.value || '').trim();
            if (!name) {
                if (typeof showToastV0409 === 'function') showToastV0409('Le nom du tiers ne peut pas être vide.');
                return;
            }
            const currentType = row.querySelector('.third-party-type-select-v0423')?.value || third.type || 'autre';
            const result = await window.api.updateThirdParty({ thirdPartyId: primaryId, name, type: currentType });
            if (result === false || result?.ok === false) {
                if (typeof showToastV0409 === 'function') showToastV0409('Modification impossible.');
                return;
            }
            if (typeof showToastV0409 === 'function') showToastV0409('Nom du tiers mis à jour.');
            await loadThirdParties({ skipCleanup: true });
            if (selectedBankAccount) await refreshAccountView(false);
        });
        row.querySelector('.third-party-name-input-v0826')?.addEventListener('keydown', event => {
            if (event.key === 'Enter') row.querySelector('.save-third-name-v0826')?.click();
        });
        row.querySelector('.third-party-type-select-v0423')?.addEventListener('change', async event => {
            const selectedType = event.target.value || 'autre';
            const result = await window.api.updateThirdPartyTypeBulk({ thirdPartyIds: [primaryId], type: selectedType });
            const txCount = Number(result?.transactionsUpdated || 0);
            if (typeof showToastV0409 === 'function') {
                showToastV0409(txCount
                    ? `Type mis à jour. ${txCount} opération(s) classée(s) en Tiers-Payant / Vérifié.`
                    : 'Type mis à jour.');
            }
            await loadThirdParties({ skipCleanup: true });
            if (selectedBankAccount) await refreshAccountView(false);
        });
        row.querySelector('.details-third').addEventListener('click', async () => {
            await showThirdPartyDetailsModalV0421({ ...third, id: primaryId });
        });
        row.querySelector('.edit-third').addEventListener('click', async () => {
            const name = await askInputV0397('Renommer le tiers', 'Nom du tiers', third.name);
            if (!name) return;
            const newType = (await askInputV0397('Type du tiers', 'fournisseur, client, Mutuelle, organisme, banque, assurance, autre', third.type || 'autre')) || third.type || 'autre';
            await window.api.updateThirdParty({ thirdPartyId: primaryId, name, type: newType });
            if (typeof showToastV0409 === 'function') showToastV0409('Tiers mis à jour sur toutes les sociétés concernées.');
            await loadThirdParties();
            if (selectedBankAccount) await refreshAccountView(false);
        });
        row.querySelector('.merge-third').addEventListener('click', async () => {
            await showThirdPartyMergeModalV04112({ ...third, id: primaryId }, tiers);
        });
        row.querySelector('.split-third').addEventListener('click', async () => {
            await showThirdPartySplitModalV042({ ...third, id: primaryId });
        });
        tbody.appendChild(row);
    });

    if (!sorted.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'Aucun tiers ne correspond aux filtres.';
        list.appendChild(empty);
        return;
    }

    list.appendChild(tableWrap);

    const selectAll = document.getElementById('thirdPartySelectAllV04117');
    if (selectAll) selectAll.addEventListener('change', event => {
        sorted.forEach(third => {
            const id = getThirdPartyIdsV04117(third)[0] || third.id;
            if (event.target.checked) selectedThirdPartyIdsV04117.add(Number(id));
            else selectedThirdPartyIdsV04117.delete(Number(id));
        });
        tableWrap.querySelectorAll('.third-party-select-v04117').forEach(input => { input.checked = event.target.checked; });
        updateThirdPartySelectionCountV04117();
    });

    const applyBulk = document.getElementById('thirdPartyApplyBulkTypeV04117');
    if (applyBulk) applyBulk.addEventListener('click', async () => {
        const selectedType = document.getElementById('thirdPartyBulkTypeV04117')?.value || '';
        const ids = Array.from(selectedThirdPartyIdsV04117).map(Number).filter(Boolean);
        if (!selectedType || !ids.length) {
            if (typeof showToastV0409 === 'function') showToastV0409('Sélectionne au moins un tiers et un type.');
            return;
        }
        const result = await window.api.updateThirdPartyTypeBulk({ thirdPartyIds: ids, type: selectedType });
        selectedThirdPartyIdsV04117.clear();
        const txCount = Number(result?.transactionsUpdated || 0);
        if (typeof showToastV0409 === 'function') showToastV0409(`${result?.updated || ids.length} tiers mis à jour.${txCount ? ` ${txCount} opération(s) classée(s) en Tiers-Payant / Vérifié.` : ''}`);
        await loadThirdParties();
        if (selectedBankAccount) await refreshAccountView(false);
    });

    updateThirdPartySelectionCountV04117();
}


async function showThirdPartyDetailsModalV0421(third) {
    let preview = { aliases: [] };
    let txData = { transactions: [], totals: { debit: 0, credit: 0, count: 0 } };
    try {
        if (typeof window.api.getThirdPartyAliasPreview === 'function') preview = await window.api.getThirdPartyAliasPreview(third.id);
        if (typeof window.api.getThirdPartyTransactionsV083 === 'function') txData = await window.api.getThirdPartyTransactionsV083({ thirdPartyId: third.id, year: thirdPartyYearV04117 });
    } catch (error) {
        console.error(error);
    }
    const rows = Array.isArray(preview.aliases) ? preview.aliases : [];
    const transactions = Array.isArray(txData.transactions) ? txData.transactions : [];
    const totals = txData.totals || {};
    const formatDate = value => String(value || '').replace(/^(\d{4})-(\d{2})-(\d{2}).*/, '$3/$2/$1');
    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'focus-merge-modal-v04112 third-party-detail-modal-v0421 third-party-detail-modal-v083';
        modal.innerHTML = `
            <div class="focus-merge-card-v04112 third-party-detail-card-v0421 third-party-detail-card-v083">
                <h3>${escapeHtml(third.name)}</h3>
                <p class="muted">Type : <strong>${escapeHtml(third.type || 'autre')}</strong> · ${Number(totals.count || third.operations_count || 0)} opération(s) ${thirdPartyYearV04117 === 'all' ? '' : `sur ${escapeHtml(thirdPartyYearV04117)}`}</p>
                <div class="third-party-detail-kpis-v0421">
                    <div><span>Débits</span><strong>${formatAmount(Math.abs(Number(totals.debit ?? third.debit_total ?? 0)))}</strong></div>
                    <div><span>Crédits</span><strong>${formatAmount(Math.abs(Number(totals.credit ?? third.credit_total ?? 0)))}</strong></div>
                    <div><span>Solde</span><strong>${formatAmount(Number(totals.credit || 0) - Number(totals.debit || 0))}</strong></div>
                </div>
                <h4>Transactions détaillées</h4>
                <div class="third-party-transactions-v083">
                    ${transactions.length ? `
                        <table class="compact-table-v0456 third-party-transaction-table-v083">
                            <thead><tr><th>Date</th><th>Montant</th><th>Catégorie</th><th>Statut</th><th>Libellé</th><th>Compte</th></tr></thead>
                            <tbody>
                                ${transactions.map(tx => `
                                    <tr>
                                        <td>${escapeHtml(formatDate(tx.date))}</td>
                                        <td class="number ${Number(tx.amount || 0) < 0 ? 'debit' : 'credit'}">${formatAmount(Number(tx.amount || 0))}</td>
                                        <td>${escapeHtml(tx.category || '—')}</td>
                                        <td>${escapeHtml(tx.status || '—')}</td>
                                        <td>${escapeHtml(tx.label || '')}</td>
                                        <td>${escapeHtml([tx.bankName, tx.accountName].filter(Boolean).join(' · ') || '—')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : '<p class="muted">Aucune transaction détaillée disponible pour ce tiers.</p>'}
                </div>
                <details class="third-party-alias-details-v083">
                    <summary>Libellés regroupés (${rows.length})</summary>
                    <div class="third-party-alias-list-v0421">
                        ${rows.length ? rows.map(row => `
                            <div class="third-party-alias-row-v0421">
                                <span>${escapeHtml(row.label)}</span>
                                <strong>${Number(row.operations_count || 0)} op.</strong>
                            </div>
                        `).join('') : '<p class="muted">Aucun libellé regroupé disponible.</p>'}
                    </div>
                </details>
                <div class="focus-merge-actions-v04112">
                    <button type="button" class="btn-secondary" id="thirdDetailAliasRuleV0421">Toujours fusionner…</button>
                    <button type="button" class="btn-secondary" id="thirdDetailSplitV0421">Dissocier…</button>
                    <button type="button" class="btn-primary" id="thirdDetailCloseV0421">Fermer</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const close = value => { modal.remove(); resolve(value); };
        modal.querySelector('#thirdDetailCloseV0421').onclick = () => close(false);
        modal.querySelector('#thirdDetailSplitV0421').onclick = async () => {
            close(false);
            await showThirdPartySplitModalV042(third);
        };
        modal.querySelector('#thirdDetailAliasRuleV0421').onclick = async () => {
            close(false);
            await showThirdPartyAliasRuleModalV042(third);
        };
        modal.addEventListener('click', event => { if (event.target === modal) close(false); });
    });
}

async function showThirdPartySplitModalV042(third) {
    let preview = { aliases: [] };
    try {
        if (typeof window.api.getThirdPartyAliasPreview === 'function') preview = await window.api.getThirdPartyAliasPreview(third.id);
    } catch (error) {
        console.error(error);
    }
    const aliases = Array.isArray(preview.aliases) ? preview.aliases : [];
    const firstLabel = aliases[0]?.label || third.name || '';
    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'focus-merge-modal-v04112 third-party-split-modal-v0421';
        modal.innerHTML = `
            <div class="focus-merge-card-v04112 third-party-detail-card-v0421">
                <h3>Dissocier un regroupement</h3>
                <p>Retirer une partie des opérations de <strong>${escapeHtml(third.name)}</strong> vers un nouveau tiers.</p>
                <label>Libellés détectés dans ce tiers</label>
                <select id="thirdSplitAliasChoiceV0421">
                    ${aliases.map(row => `<option value="${escapeHtml(row.label)}">${escapeHtml(row.label)} — ${Number(row.operations_count || 0)} op.</option>`).join('')}
                </select>
                <label>Texte à rechercher dans le libellé</label>
                <input id="thirdSplitKeywordV0421" value="${escapeHtml(firstLabel)}" placeholder="Ex : Arnaudo, Pessione, Action Callian…">
                <label>Nouveau tiers</label>
                <input id="thirdSplitNameV0421" value="" placeholder="Ex : MMA IARD Arnaudo François">
                <label>Type</label>
                <select id="thirdSplitTypeV0421">
                    ${getAvailableThirdPartyTypesV04117([third]).map(type => `<option value="${escapeHtml(type)}" ${String(type) === String(third.type || 'autre') ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
                </select>
                <label class="third-party-checkbox-line-v0421"><input type="checkbox" id="thirdSplitNeverMergeV0421" checked> Ne plus refusionner automatiquement ce libellé</label>
                <div class="focus-merge-actions-v04112">
                    <button type="button" class="btn-secondary" id="thirdSplitCancelV0421">Annuler</button>
                    <button type="button" class="btn-primary" id="thirdSplitOkV0421">Dissocier</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const close = value => { modal.remove(); resolve(value); };
        const choice = modal.querySelector('#thirdSplitAliasChoiceV0421');
        const keyword = modal.querySelector('#thirdSplitKeywordV0421');
        const newName = modal.querySelector('#thirdSplitNameV0421');
        if (choice) choice.addEventListener('change', () => {
            keyword.value = choice.value;
            if (!newName.value) newName.value = choice.value;
        });
        if (newName && !newName.value) newName.value = firstLabel;
        modal.querySelector('#thirdSplitCancelV0421').onclick = () => close(false);
        modal.querySelector('#thirdSplitOkV0421').onclick = async () => {
            const data = {
                thirdPartyId: third.id,
                keyword: keyword?.value || '',
                newName: newName?.value || '',
                type: modal.querySelector('#thirdSplitTypeV0421')?.value || third.type || 'autre',
                neverMerge: Boolean(modal.querySelector('#thirdSplitNeverMergeV0421')?.checked)
            };
            if (!data.keyword.trim() || !data.newName.trim()) {
                if (typeof showToastV0409 === 'function') showToastV0409('Indique le libellé à dissocier et le nouveau nom.');
                return;
            }
            const result = await window.api.splitThirdPartyByKeyword(data);
            if (typeof showToastV0409 === 'function') showToastV0409(result?.ok ? `${result.updated || 0} opération(s) dissociée(s).` : (result?.message || 'Dissociation impossible.'));
            close(true);
            await loadThirdParties({ skipCleanup: true });
            if (selectedBankAccount) await refreshAccountView(false);
        };
        modal.addEventListener('click', event => { if (event.target === modal) close(false); });
        setTimeout(() => keyword?.focus(), 30);
    });
}

async function showThirdPartyAliasRuleModalV042(third) {
    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'focus-merge-modal-v04112 third-party-alias-modal-v0421';
        modal.innerHTML = `
            <div class="focus-merge-card-v04112">
                <h3>Toujours fusionner</h3>
                <p>Créer une règle globale vers <strong>${escapeHtml(third.name)}</strong>.</p>
                <label>Texte reconnu dans le libellé</label>
                <input id="thirdAliasLabelV0421" value="${escapeHtml(third.name)}" placeholder="Ex : Allianz, MMA IARD, Viamedis…">
                <label>Nom canonique</label>
                <input id="thirdAliasCanonicalV0421" value="${escapeHtml(third.name)}">
                <label>Type</label>
                <input id="thirdAliasTypeV0421" value="${escapeHtml(third.type || 'autre')}">
                <div class="focus-merge-actions-v04112">
                    <button type="button" class="btn-secondary" id="thirdAliasCancelV0421">Annuler</button>
                    <button type="button" class="btn-primary" id="thirdAliasOkV0421">Enregistrer</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const close = value => { modal.remove(); resolve(value); };
        modal.querySelector('#thirdAliasCancelV0421').onclick = () => close(false);
        modal.querySelector('#thirdAliasOkV0421').onclick = async () => {
            const result = await window.api.saveThirdPartyAliasRule({
                aliasLabel: modal.querySelector('#thirdAliasLabelV0421')?.value || '',
                canonicalName: modal.querySelector('#thirdAliasCanonicalV0421')?.value || third.name,
                type: modal.querySelector('#thirdAliasTypeV0421')?.value || third.type || 'autre',
                mode: 'merge'
            });
            if (typeof showToastV0409 === 'function') showToastV0409(result?.ok ? 'Règle de fusion enregistrée.' : (result?.message || 'Règle impossible à enregistrer.'));
            close(true);
            await loadThirdParties();
        };
        modal.addEventListener('click', event => { if (event.target === modal) close(false); });
    });
}

async function showThirdPartyMergeModalV04112(source, tiers) {
    const candidates = tiers
        .filter(item => item.id !== source.id)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' }));
    if (!candidates.length) return;

    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'focus-merge-modal-v04112';
        modal.innerHTML = `
            <div class="focus-merge-card-v04112">
                <h3>Fusionner un tiers</h3>
                <p>Fusionner <strong>${escapeHtml(source.name)}</strong> vers un tiers existant.</p>
                <label for="mergeThirdPartyTargetV04112">Tiers de destination</label>
                <select id="mergeThirdPartyTargetV04112">
                    ${candidates.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}
                </select>
                <p class="muted">Les opérations de la société ouverte seront rattachées au tiers choisi.</p>
                <div class="focus-merge-actions-v04112">
                    <button type="button" class="btn-secondary" id="mergeThirdCancelV04112">Annuler</button>
                    <button type="button" class="btn-primary" id="mergeThirdOkV04112">Fusionner</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const close = value => { modal.remove(); resolve(value); };
        modal.querySelector('#mergeThirdCancelV04112').onclick = () => close(false);
        modal.querySelector('#mergeThirdOkV04112').onclick = async () => {
            const targetId = Number(modal.querySelector('#mergeThirdPartyTargetV04112')?.value || 0);
            if (!targetId) return close(false);
            await window.api.mergeThirdParties({ sourceId: source.id, targetId });
            if (typeof showToastV0409 === 'function') showToastV0409('Tiers fusionné.');
            close(true);
            await loadThirdParties();
            if (selectedBankAccount) await refreshAccountView(false);
        };
        modal.addEventListener('click', event => { if (event.target === modal) close(false); });
        setTimeout(() => modal.querySelector('#mergeThirdPartyTargetV04112')?.focus(), 30);
    });
}

// V0.82.6 : plus de bouton topbar "Mettre à jour les tiers" ; le chargement se fait à l'ouverture de la page.



function escapeHtmlV0452(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function numberInputValueV0452(value) {
    if (value === null || value === undefined || value === '') return '';
    const n = Number(value);
    return Number.isFinite(n) ? String(n.toFixed(2)).replace('.', ',') : '';
}

function parseFrenchNumberV0452(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(String(value).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
}

function isoToFrenchV0452(value) {
    const text = String(value || '').trim();
    const iso = text.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    return text;
}

function frenchToStorageDateV0452(value) {
    const text = String(value || '').trim();
    const fr = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (!fr) return text;
    const year = fr[3].length === 2 ? `20${fr[3]}` : fr[3];
    return `${String(fr[1]).padStart(2,'0')}/${String(fr[2]).padStart(2,'0')}/${year}`;
}

async function showDocumentValidationModalV0452(item, index, total) {
    const analysis = item.analysis || {};
    const amountCandidates = Array.isArray(analysis.amountCandidates) ? analysis.amountCandidates : [];
    const dateCandidates = Array.isArray(analysis.dateCandidates) ? analysis.dateCandidates : [];
    let previewData = null;
    try {
        if (window.api.getDocumentPreviewDataV0453 && item.filepath) {
            previewData = await window.api.getDocumentPreviewDataV0453(item.filepath);
        }
    } catch (error) {
        previewData = null;
    }

    const candidateButton = (field, value, label) => {
        if (value === null || value === undefined || value === '') return '';
        const display = typeof value === 'number' ? `${value.toFixed(2).replace('.', ',')} €` : value;
        return `<button type="button" class="doc-candidate-chip-v0453" data-field="${field}" data-value="${escapeHtmlV0452(String(value))}">${escapeHtmlV0452(label || display)}</button>`;
    };

    const amountChips = amountCandidates
        .filter((candidate, idx, arr) => idx === arr.findIndex(other => other.field === candidate.field && other.amount === candidate.amount))
        .slice(0, 12)
        .map(candidate => candidateButton(candidate.field === 'unknown' ? 'amountTtc' : candidate.field, candidate.amount, `${candidate.field === 'amountHt' ? 'HT' : candidate.field === 'amountTva' ? 'TVA' : candidate.field === 'amountTtc' ? 'TTC' : 'Montant'} · ${Number(candidate.amount).toFixed(2).replace('.', ',')} €`))
        .join('');

    const dateChips = dateCandidates
        .filter((candidate, idx, arr) => idx === arr.findIndex(other => other.field === candidate.field && other.value === candidate.value))
        .slice(0, 8)
        .map(candidate => candidateButton(candidate.field === 'dueDate' ? 'dueDate' : 'invoiceDate', candidate.value, `${candidate.field === 'dueDate' ? 'Échéance' : 'Date'} · ${candidate.value}`))
        .join('');

    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'document-validation-backdrop-v0452';
        modal.innerHTML = `
            <div class="document-validation-card-v0452 document-validation-card-v0453">
                <div class="document-validation-header-v0452">
                    <div>
                        <h2>Validation document expert</h2>
                        <p>${index + 1}/${total} — ${escapeHtmlV0452(item.filename || 'Document')}</p>
                    </div>
                    <span class="confidence-pill-v0452">Confiance ${Math.round(Number(analysis.ocrConfidence || 0))}%${analysis.learningApplied ? ' · apprentissage' : ''}</span>
                </div>
                <div class="document-validation-split-v0453">
                    <section class="document-validation-form-v0453">
                        <div class="document-validation-grid-v0452">
                            <label>Type
                                <select id="docValTypeV0452">
                                    ${window.documentTypeOptionsV054 ? window.documentTypeOptionsV054(analysis.docType || 'facture') : '<option value="facture">Facture fournisseur</option><option value="facture_client">Facture client</option><option value="avoir">Avoir</option><option value="releve">Relevé bancaire</option><option value="contrat">Contrat</option><option value="administratif">Administratif</option><option value="informatif">Informatif</option><option value="don">Don</option><option value="rib">RIB</option><option value="divers">Divers</option>'}
                                </select>
                            </label>
                            <label data-doc-field-v053="supplier">Tiers / organisme
                                <input id="docValSupplierV0452" value="${escapeHtmlV0452(analysis.detectedSupplier || '')}" placeholder="Ex : EDF, Orange, SwissLife">
                            </label>
                            <label data-doc-field-v053="invoiceNumber">N° facture
                                <input id="docValInvoiceNumberV0452" value="${escapeHtmlV0452(analysis.invoiceNumber || '')}">
                            </label>
                            <label data-doc-field-v053="invoiceDate">Date du document
                                <input id="docValInvoiceDateV0452" value="${escapeHtmlV0452(isoToFrenchV0452(analysis.invoiceDate || ''))}" placeholder="JJ/MM/AAAA">
                            </label>
                            <label data-doc-field-v053="dueDate">Échéance / fin
                                <input id="docValDueDateV0452" value="${escapeHtmlV0452(isoToFrenchV0452(analysis.dueDate || ''))}" placeholder="JJ/MM/AAAA">
                            </label>
                            <label data-doc-field-v053="amounts">HT
                                <input id="docValHtV0452" value="${escapeHtmlV0452(numberInputValueV0452(analysis.amountHt))}">
                            </label>
                            <label data-doc-field-v053="vat">TVA
                                <input id="docValTvaV0452" value="${escapeHtmlV0452(numberInputValueV0452(analysis.amountTva))}">
                            </label>
                            <label data-doc-field-v053="amounts">TTC
                                <input id="docValTtcV0452" value="${escapeHtmlV0452(numberInputValueV0452(analysis.amountTtc))}">
                            </label>
                        </div>
                        <div id="documentTypeHelpV053"></div>
                        <div class="doc-candidates-v0453">
                            <h4>Montants détectés</h4>
                            <div>${amountChips || '<span>Aucun montant fiable détecté.</span>'}</div>
                            <h4>Dates détectées</h4>
                            <div>${dateChips || '<span>Aucune date fiable détectée.</span>'}</div>
                        </div>
                        <div id="docValWarningV0452" class="document-validation-warning-v0452"></div>
                        <label class="document-learning-toggle-v0452"><input id="docValLearnV0452" type="checkbox" checked> Mémoriser mes corrections pour les prochains documents similaires</label>
                        <div class="document-validation-actions-v0452">
                            <button type="button" id="docValSkipV0452" class="secondary-button">Valider sans modifier</button>
                            <button type="button" id="docValCancelV0452" class="secondary-button">Plus tard</button>
                            <button type="button" id="docValSaveV0452">Valider et enregistrer</button>
                        </div>
                    </section>
                    <section class="document-preview-panel-v0453">
                        <div class="document-preview-toolbar-v0453">
                            <strong>Aperçu document</strong>
                            ${item.filepath ? '<button type="button" id="docValOpenPdfV0453" class="secondary-button">Ouvrir</button>' : ''}
                        </div>
                        ${previewData?.dataUrl ? (previewData.mime === 'application/pdf'
                            ? `<iframe src="${previewData.dataUrl}" title="Aperçu PDF"></iframe>`
                            : `<img src="${previewData.dataUrl}" alt="Aperçu document">`)
                            : `<div class="document-preview-empty-v0453">Aperçu indisponible. Utilise le bouton Ouvrir pour consulter le fichier.</div>`}
                    </section>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const type = modal.querySelector('#docValTypeV0452');
        if (type) type.value = window.normalizeDocumentTypeV054 ? window.normalizeDocumentTypeV054(analysis.docType || 'facture') : (analysis.docType || 'facture');
        const applyTypeRules = () => {
            if (window.applyDocumentTypeRulesV053 && type) window.applyDocumentTypeRulesV053(modal, type.value);
            const candidates = modal.querySelector('.doc-candidates-v0453');
            const rule = window.getDocumentTypeRuleV053 ? window.getDocumentTypeRuleV053(type?.value) : null;
            if (candidates && rule && !['facture','facture_client','avoir','don','divers'].includes(rule.nature === 'comptable' ? (window.normalizeDocumentTypeV054 ? window.normalizeDocumentTypeV054(type.value) : type.value) : '')) {
                candidates.style.display = 'none';
            } else if (candidates) {
                candidates.style.display = '';
            }
        };
        if (type) type.addEventListener('change', () => { applyTypeRules(); warn(); });
        applyTypeRules();

        modal.querySelectorAll('.doc-candidate-chip-v0453').forEach(button => {
            button.addEventListener('click', () => {
                const field = button.dataset.field;
                const value = button.dataset.value;
                const map = { amountHt: '#docValHtV0452', amountTva: '#docValTvaV0452', amountTtc: '#docValTtcV0452', invoiceDate: '#docValInvoiceDateV0452', dueDate: '#docValDueDateV0452' };
                const input = modal.querySelector(map[field]);
                if (input) {
                    input.value = /amount/.test(field) ? numberInputValueV0452(value) : isoToFrenchV0452(value);
                    input.dispatchEvent(new Event('input'));
                    input.focus();
                }
            });
        });

        modal.querySelector('#docValOpenPdfV0453')?.addEventListener('click', async () => {
            if (item.filepath && window.api.openFile) await window.api.openFile(item.filepath);
        });

        const warn = () => {
            const currentType = window.normalizeDocumentTypeV054 ? window.normalizeDocumentTypeV054(modal.querySelector('#docValTypeV0452')?.value) : modal.querySelector('#docValTypeV0452')?.value;
            const needsAccountingAmounts = ['facture','facture_client','avoir','don'].includes(currentType);
            const ht = parseFrenchNumberV0452(modal.querySelector('#docValHtV0452')?.value || '');
            const tva = parseFrenchNumberV0452(modal.querySelector('#docValTvaV0452')?.value || '');
            const ttc = parseFrenchNumberV0452(modal.querySelector('#docValTtcV0452')?.value || '');
            const box = modal.querySelector('#docValWarningV0452');
            if (!box) return;
            if (needsAccountingAmounts && ht !== null && tva !== null && ttc !== null && Math.abs((ht + tva) - ttc) > 0.06) {
                box.textContent = `⚠ HT + TVA ne correspond pas au TTC (${(ht + tva).toFixed(2)} ≠ ${ttc.toFixed(2)}).`;
                box.style.display = 'block';
            } else if (!modal.querySelector('#docValSupplierV0452').value.trim() || (needsAccountingAmounts && ttc === null)) {
                box.textContent = needsAccountingAmounts ? '⚠ Fournisseur ou TTC manquant : vérifie le document avant validation.' : '⚠ Tiers / organisme manquant : vérifie le document avant validation.';
                box.style.display = 'block';
            } else {
                box.textContent = '';
                box.style.display = 'none';
            }
        };
        ['#docValHtV0452','#docValTvaV0452','#docValTtcV0452','#docValSupplierV0452'].forEach(sel => modal.querySelector(sel)?.addEventListener('input', warn));
        warn();
        const close = value => { modal.remove(); resolve(value); };
        modal.querySelector('#docValCancelV0452').onclick = () => close({ skipped: true });
        modal.querySelector('#docValSkipV0452').onclick = () => close({ save: true, noLearning: true });
        modal.querySelector('#docValSaveV0452').onclick = async () => {
            const payload = {
                documentId: item.id,
                docType: window.normalizeDocumentTypeV054 ? window.normalizeDocumentTypeV054(modal.querySelector('#docValTypeV0452').value) : modal.querySelector('#docValTypeV0452').value,
                detectedSupplier: modal.querySelector('#docValSupplierV0452').value.trim(),
                invoiceNumber: modal.querySelector('#docValInvoiceNumberV0452').value.trim(),
                invoiceDate: frenchToStorageDateV0452(modal.querySelector('#docValInvoiceDateV0452').value),
                dueDate: frenchToStorageDateV0452(modal.querySelector('#docValDueDateV0452').value),
                amountHt: parseFrenchNumberV0452(modal.querySelector('#docValHtV0452').value),
                amountTva: parseFrenchNumberV0452(modal.querySelector('#docValTvaV0452').value),
                amountTtc: parseFrenchNumberV0452(modal.querySelector('#docValTtcV0452').value),
                paymentStatus: 'unknown',
                validationStatus: 'validated'
            };
            await window.api.updateDocumentAccountingV0452(payload);
            if (modal.querySelector('#docValLearnV0452').checked && payload.detectedSupplier) {
                const rules = [
                    ['supplier', payload.detectedSupplier, analysis.detectedSupplier],
                    ['invoiceNumber', payload.invoiceNumber, analysis.invoiceNumber],
                    ['invoiceDate', payload.invoiceDate, analysis.invoiceDate],
                    ['dueDate', payload.dueDate, analysis.dueDate],
                    ['amountHt', payload.amountHt, analysis.amountHt],
                    ['amountTva', payload.amountTva, analysis.amountTva],
                    ['amountTtc', payload.amountTtc, analysis.amountTtc]
                ].filter(([field, value, old]) => value !== null && value !== undefined && String(value) !== '' && String(value) !== String(old ?? ''))
                 .map(([field, value]) => ({ supplier: payload.detectedSupplier, fieldName: field, learnedValue: value, keyword: payload.detectedSupplier, sourceLabel: item.filename || '' }));
                if (rules.length && window.api.saveDocumentLearningRulesV0452) {
                    await window.api.saveDocumentLearningRulesV0452({ companyId: selectedCompany ? selectedCompany.id : null, rules });
                }
            }
            close({ save: true });
        };
        setTimeout(() => modal.querySelector('#docValSupplierV0452')?.focus(), 50);
    });
}

async function validateImportedDocumentsV0452(added = []) {
    if (!Array.isArray(added) || !added.length || !window.api.updateDocumentAccountingV0452) return;
    for (let i = 0; i < added.length; i += 1) {
        const result = await showDocumentValidationModalV0452(added[i], i, added.length);
        if (result?.skipped) continue;
        if (result?.noLearning) {
            const a = added[i].analysis || {};
            await window.api.updateDocumentAccountingV0452({
                documentId: added[i].id,
                docType: 'facture',
                detectedSupplier: a.detectedSupplier || '',
                invoiceNumber: a.invoiceNumber || '',
                invoiceDate: a.invoiceDate || '',
                dueDate: a.dueDate || '',
                amountHt: a.amountHt ?? null,
                amountTva: a.amountTva ?? null,
                amountTtc: a.amountTtc ?? null,
                vatRate: a.vatRate ?? null,
                validationStatus: 'validated',
                paymentStatus: 'unknown'
            });
        }
    }
}

// Compatibilité : anciens écouteurs qui étaient encore dans ce module après la découpe V0.40.
const importDocumentsButton = document.getElementById('importDocuments');
if (importDocumentsButton && !importDocumentsButton.dataset.boundV0416) {
    importDocumentsButton.dataset.boundV0416 = '1';
    importDocumentsButton.addEventListener('click', async () => {
        const files = await window.api.selectDocuments();
        if (!files || files.length === 0) return;

        let result;
        try {
            showProgressV0409('Import des pièces jointes', `${files.length} document(s) sélectionné(s). Copie, analyse et classement en cours…`);
            result = await window.api.addDocuments({
                companyId: selectedCompany ? selectedCompany.id : null,
                companyName: selectedCompany ? selectedCompany.name : 'Société inconnue',
                docType: 'facture',
                files
            });
        } finally {
            hideProgressV0409();
        }

        if (result?.added?.length) {
            await validateImportedDocumentsV0452(result.added);
        }
        const message = `${result?.addedCount || 0} document(s) ajouté(s).${result?.duplicateCount ? ` ${result.duplicateCount} doublon(s) ignoré(s).` : ''}`;
        if (typeof showToastV0409 === 'function') showToastV0409(message);
        else focusToastV041(message, 'success');
        await loadDocuments();
    });
}

['documentSearch', 'documentTypeFilter', 'documentYearFilterV033'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.boundV0416) {
        el.dataset.boundV0416 = '1';
        el.addEventListener('input', loadDocuments);
        el.addEventListener('change', loadDocuments);
    }
});

const closeDetailButton = document.getElementById('closeDetailPanel');
if (closeDetailButton && !closeDetailButton.dataset.boundV0416) {
    closeDetailButton.dataset.boundV0416 = '1';
    closeDetailButton.addEventListener('click', () => {
        document.getElementById('detailPanel')?.classList.remove('open');
    });
}
