// Focus Compta V0.71.1 — Module Caisse mensuelle société
// Contrôle banque pleine largeur : CB = Carte Bleue + AMEX ; Banque = Remise(s) CB + Remise(s) AMEX.
(function initFocusCaisseV0603() {
    const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const BANK_TOLERANCE = 1;

    function safeNumber(value) {
        const number = Number(value || 0);
        return Number.isFinite(number) ? number : 0;
    }

    function money(value) {
        return typeof formatAmount === 'function' ? formatAmount(value) : `${safeNumber(value).toFixed(2)} €`;
    }

    function isPlausibleCashRow(row = {}) {
        const net = safeNumber(row.net_ca_ttc || row.invoiced_ca);
        const values = [
            row.net_ca_ttc, row.invoiced_ca, row.net_ca_ht, row.tva_nette,
            row.card_total, row.cash_total, row.check_total, row.cofidis_total,
            row.p3x_total, row.p4x_total, row.p10x_total, row.paylater_total,
            row.tiers_payant, row.acompte_total
        ].map(safeNumber);
        return Math.abs(net) <= 500000 && values.every(value => Math.abs(value) <= 250000);
    }

    function kpiWithTitle(label, value, title = '') {
        const escapedTitle = escapeHtml(title || '');
        return `<div ${escapedTitle ? `title="${escapedTitle}"` : ''}><span>${label}</span><strong>${money(value)}</strong></div>`;
    }

    function escapeHtml(value) {
        if (typeof focusEscapeHtmlV04116 === 'function') return focusEscapeHtmlV04116(value);
        return String(value ?? '').replace(/[&<>'"]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[char]));
    }

    function normalizeText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function monthLabel(row) {
        const month = String(row?.month || row?.period_month || '').padStart(2, '0');
        const year = row?.year || row?.period_year || '';
        const monthIndex = Number(month) - 1;
        if (monthIndex >= 0 && monthIndex < 12 && year) return `${MONTHS[monthIndex]} ${year}`;
        return escapeHtml(row?.period || 'Période inconnue');
    }

    function variation(current, previous) {
        const prev = safeNumber(previous);
        if (!prev) return null;
        return ((safeNumber(current) - prev) / prev) * 100;
    }

    function formatVariation(value) {
        if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
        const sign = Number(value) > 0 ? '+' : '';
        return `${sign}${Number(value).toFixed(1)} %`;
    }

    function bankCategory(label) {
        const value = normalizeText(label);

        // V0.61.1 : les catégories validées manuellement sont prioritaires.
        // Cela évite de dépendre des libellés bancaires, souvent variables selon la banque.
        if (/\bremises?\s*cofidis\b/.test(value)) return 'cofidis';
        // V0.61.2 : AMEX est volontairement regroupé avec CB.
        // En magasin, une AMEX peut être saisie comme CB par les collaborateurs ;
        // on contrôle donc le flux Carte global : CB + AMEX.
        if (/\bremises?\s*amex\b/.test(value)) return 'card';
        if (/\bremises?\s*cb\b/.test(value) || /\bremises?\s*carte\b/.test(value)) return 'card';
        if (/\bremises?\s*es\b/.test(value) || /\bremises?\s*especes?\b/.test(value)) return 'cash';
        if (/\bremises?\s*ch\b/.test(value) || /\bremises?\s*cheques?\b/.test(value)) return 'check';

        // Fallback heuristique pour les relevés non encore catégorisés.
        if (/(cofidis|p3x|p4x|p10x|paylater)/.test(value)) return 'cofidis';
        if (/(amex|american express)/.test(value)) return 'card';
        if (/(remise|encaissement|telecollecte|tpe|cb|carte|monetique|monetique)/.test(value) && !/(cheq|cheque|espece|cofidis)/.test(value)) return 'card';
        if (/(espece|versement especes|depot espece|depot especes)/.test(value)) return 'cash';
        if (/(cheq|cheque|remise cheque)/.test(value)) return 'check';
        return null;
    }

    async function loadCash(companyId) {
        if (!window.api?.getCashSheetInsights) return {};
        return await window.api.getCashSheetInsights({ companyId });
    }

    async function loadBankControls(companyId, months) {
        const controls = {};
        if (!window.api?.getBankAccounts || !window.api?.getTransactions || !Array.isArray(months)) return controls;

        const accounts = await window.api.getBankAccounts(companyId);
        if (!Array.isArray(accounts) || !accounts.length) return controls;

        for (const month of months) {
            const periodKey = `${month.year}-${String(month.month).padStart(2, '0')}`;
            controls[periodKey] = { card: 0, cash: 0, check: 0, amex: 0, cofidis: 0, transactions: 0 };

            for (const account of accounts) {
                const transactions = await window.api.getTransactions({
                    bankAccountId: account.id,
                    filters: {
                        year: String(month.year),
                        month: String(month.month).padStart(2, '0')
                    }
                });

                (transactions || []).forEach(transaction => {
                    const amount = safeNumber(transaction.amount);
                    if (amount <= 0) return;
                    const category = bankCategory(`${transaction.label || ''} ${transaction.category || ''} ${transaction.third_party_name || ''}`);
                    if (!category) return;
                    controls[periodKey][category] += amount;
                    controls[periodKey].transactions += 1;
                });
            }
        }
        return controls;
    }

    function controlStatus(cashValue, bankValue) {
        const diff = safeNumber(bankValue) - safeNumber(cashValue);
        const hasCash = Math.abs(safeNumber(cashValue)) > BANK_TOLERANCE;
        const hasBank = Math.abs(safeNumber(bankValue)) > BANK_TOLERANCE;
        if (!hasCash && !hasBank) return { label: '—', className: 'neutral', diff };
        if (Math.abs(diff) <= BANK_TOLERANCE) return { label: 'OK', className: 'success', diff };
        if (!hasBank) return { label: 'Non retrouvé', className: 'danger', diff };
        const className = Math.abs(diff) > 50 ? 'danger' : 'warning';
        return { label: `Écart ${money(diff)}`, className, diff };
    }

    function expectedCofidis(row = {}) {
        const details = safeNumber(row.p3x_total) + safeNumber(row.p4x_total) + safeNumber(row.p10x_total) + safeNumber(row.paylater_total);
        const grouped = safeNumber(row.cofidis_total);
        // V0.70 : priorité aux détails P3X/P4X/P10X/Paylater uniquement s'ils sont plausibles.
        // Une erreur d'import/OCR ne doit plus exploser les contrôles.
        if (details > 0 && details <= 250000) return details;
        return grouped > 0 && grouped <= 250000 ? grouped : 0;
    }

    function expectedCard(row = {}) {
        return safeNumber(row.card_total) + safeNumber(row.amex_total);
    }

    function expectedCash(row = {}) {
        return safeNumber(row.bank_remise_cash || row.cash_total);
    }

    function expectedCheck(row = {}) {
        return safeNumber(row.bank_remise_check || row.check_total) + safeNumber(row.bank_remise_deferred_check || 0);
    }

    function totalBankGap(months, bankControls) {
        return (months || []).reduce((sum, row) => {
            const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
            const bank = bankControls[key] || {};
            return sum
                + controlStatus(expectedCard(row), safeNumber(bank.card) + safeNumber(bank.amex)).diff
                + controlStatus(expectedCofidis(row), bank.cofidis).diff
                + controlStatus(expectedCash(row), bank.cash).diff
                + controlStatus(expectedCheck(row), bank.check).diff;
        }, 0);
    }

    function renderMonthlyEvolution(months) {
        if (!Array.isArray(months) || !months.length) return '<p class="muted">Aucune feuille de caisse importée.</p>';
        const maxCa = Math.max(...months.map(row => safeNumber(row.net_ca_ttc || row.invoiced_ca)), 1);
        return `
            <div class="cash-evolution-list">
                ${months.map((row, index) => {
                    const ca = safeNumber(row.net_ca_ttc || row.invoiced_ca);
                    const previous = index > 0 ? safeNumber(months[index - 1].net_ca_ttc || months[index - 1].invoiced_ca) : 0;
                    const width = Math.max(4, Math.round((ca / maxCa) * 100));
                    return `
                        <div class="cash-evolution-row">
                            <div class="cash-evolution-label"><strong>${monthLabel(row)}</strong><span>${safeNumber(row.count)} import(s)</span></div>
                            <div class="cash-evolution-bar"><span style="width:${width}%"></span></div>
                            <div class="cash-evolution-values"><strong>${money(ca)}</strong><small>${formatVariation(variation(ca, previous))}</small></div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderBankControlTable(months, bankControls) {
        if (!Array.isArray(months) || !months.length) return '<p class="muted">Importez une feuille de caisse mensuelle pour activer le contrôle bancaire.</p>';

        const orderedMonths = months.slice();
        const reversedMonths = orderedMonths.slice().reverse();
        const totals = reversedMonths.reduce((acc, row) => {
            const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
            const bank = bankControls[key] || { card: 0, cash: 0, check: 0, cofidis: 0, transactions: 0 };
            acc.ca += safeNumber(row.net_ca_ttc || row.invoiced_ca);
            acc.cardExpected += expectedCard(row);
            acc.cardBank += safeNumber(bank.card);
            acc.cofidisExpected += expectedCofidis(row);
            acc.cofidisBank += safeNumber(bank.cofidis);
            acc.cashExpected += expectedCash(row);
            acc.cashBank += safeNumber(bank.cash);
            acc.checkExpected += expectedCheck(row);
            acc.checkBank += safeNumber(bank.check);
            return acc;
        }, { ca: 0, cardExpected: 0, cardBank: 0, cofidisExpected: 0, cofidisBank: 0, cashExpected: 0, cashBank: 0, checkExpected: 0, checkBank: 0 });

        const cardDiff = totals.cardBank - totals.cardExpected;
        const cofidisDiff = totals.cofidisBank - totals.cofidisExpected;
        const cashDiff = totals.cashBank - totals.cashExpected;
        const checkDiff = totals.checkBank - totals.checkExpected;
        const globalDiff = cardDiff + cofidisDiff + cashDiff + checkDiff;
        const globalClass = Math.abs(globalDiff) <= BANK_TOLERANCE ? 'success' : (Math.abs(globalDiff) > 50 ? 'danger' : 'warning');

        const diffCell = (status) => `<span class="status-pill ${status.className}">${status.label}</span>`;

        return `
            <div class="cash-control-table-wrap cash-control-table-wrap-v0613 cash-control-table-wrap-v0711">
                <table class="cash-control-table cash-control-table-v0613 cash-control-table-v0711">
                    <thead>
                        <tr>
                            <th rowspan="2">Mois</th>
                            <th rowspan="2">CA net TTC</th>
                            <th colspan="3" class="cash-flow-group-v0711 cash-flow-card-v0711">CB + AMEX</th>
                            <th colspan="3" class="cash-flow-group-v0711 cash-flow-cofidis-v0711">Cofidis</th>
                            <th colspan="3" class="cash-flow-group-v0711 cash-flow-cash-v0711">Espèces</th>
                            <th colspan="3" class="cash-flow-group-v0711 cash-flow-check-v0711">Chèques</th>
                        </tr>
                        <tr>
                            <th>Attendu</th><th>Banque</th><th>Écart</th>
                            <th>Attendu</th><th>Banque</th><th>Écart</th>
                            <th>Attendu</th><th>Banque</th><th>Écart</th>
                            <th>Attendu</th><th>Banque</th><th>Écart</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reversedMonths.map(row => {
                            const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
                            const bank = bankControls[key] || { card: 0, cash: 0, check: 0, cofidis: 0, transactions: 0 };
                            const cardExpected = expectedCard(row);
                            const cardBank = safeNumber(bank.card);
                            const cofidisExpected = expectedCofidis(row);
                            const cofidisBank = safeNumber(bank.cofidis);
                            const cashExpected = expectedCash(row);
                            const cashBank = safeNumber(bank.cash);
                            const checkExpectedValue = expectedCheck(row);
                            const checkBank = safeNumber(bank.check);
                            const cardStatus = controlStatus(cardExpected, cardBank);
                            const cofidisStatus = controlStatus(cofidisExpected, cofidisBank);
                            const cashStatus = controlStatus(cashExpected, cashBank);
                            const checkStatus = controlStatus(checkExpectedValue, checkBank);
                            const rowClass = [cardStatus, cofidisStatus, cashStatus, checkStatus].some(item => item.className === 'danger')
                                ? 'has-danger-gap'
                                : ([cardStatus, cofidisStatus, cashStatus, checkStatus].some(item => item.className === 'warning') ? 'has-warning-gap' : 'is-ok');
                            return `
                                <tr class="${rowClass}">
                                    <td><strong>${monthLabel(row)}</strong><small>${safeNumber(row.count)} feuille(s)</small></td>
                                    <td title="HT : ${money(row.net_ca_ht)} · TVA nette : ${money(row.tva_nette)}">${money(row.net_ca_ttc || row.invoiced_ca)}</td>
                                    <td>${money(cardExpected)}<small>incl. AMEX ${money(row.amex_total || 0)}</small></td>
                                    <td>${money(cardBank)}</td>
                                    <td>${diffCell(cardStatus)}</td>
                                    <td>${money(cofidisExpected)}</td>
                                    <td>${money(cofidisBank)}</td>
                                    <td>${diffCell(cofidisStatus)}</td>
                                    <td>${money(cashExpected)}</td>
                                    <td>${money(cashBank)}</td>
                                    <td>${diffCell(cashStatus)}</td>
                                    <td>${money(checkExpectedValue)}</td>
                                    <td>${money(checkBank)}</td>
                                    <td>${diffCell(checkStatus)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr class="cash-control-summary-row">
                            <td><strong>Récap écarts</strong><small>Total des mois affichés</small></td>
                            <td>${money(totals.ca)}</td>
                            <td>${money(totals.cardExpected)}</td>
                            <td>${money(totals.cardBank)}</td>
                            <td>${money(cardDiff)}</td>
                            <td>${money(totals.cofidisExpected)}</td>
                            <td>${money(totals.cofidisBank)}</td>
                            <td>${money(cofidisDiff)}</td>
                            <td>${money(totals.cashExpected)}</td>
                            <td>${money(totals.cashBank)}</td>
                            <td>${money(cashDiff)}</td>
                            <td>${money(totals.checkExpected)}</td>
                            <td>${money(totals.checkBank)}</td>
                            <td><span class="status-pill ${globalClass}">${money(globalDiff)}</span></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    }

    function renderRecentRows(rows) {
        if (!Array.isArray(rows) || !rows.length) return '<li class="muted">Aucun historique disponible.</li>';
        return rows.map(row => {
            const invalid = !isPlausibleCashRow(row);
            const period = `${String(row.period_month || '').padStart(2, '0')}/${row.period_year || ''}`;
            return `
                <li class="cash-import-row ${invalid ? 'cash-import-row-danger' : ''}">
                    <span>
                        <strong>${escapeHtml(row.filename || 'Feuille de caisse')}</strong>
                        <small>${escapeHtml(period)} · ${escapeHtml(row.sheet_date || row.imported_at || '')}${invalid ? ' · Montants incohérents ignorés des totaux' : ''}</small>
                    </span>
                    <strong>${money(row.net_ca_ttc || row.invoiced_ca || 0)}</strong>
                    <button type="button" class="ghost-button danger small-button delete-cash-sheet-btn" data-cash-sheet-id="${escapeHtml(row.id)}">Supprimer</button>
                </li>
            `;
        }).join('');
    }

    function renderInvalidImportWarning(cash) {
        const count = safeNumber(cash?.ignoredInvalidCount || 0);
        if (!count) return '';
        return `
            <div class="status-card danger cash-invalid-warning">
                <strong>${count} import(s) caisse ignoré(s) des calculs</strong>
                <span>Un relevé ou un document incorrect semble avoir été importé dans la caisse. Tu peux supprimer l’import concerné dans “Derniers imports” ou lancer un nettoyage automatique.</span>
                <button type="button" id="cleanInvalidCashSheetsV070" class="ghost-button danger small-button">Nettoyer les imports corrompus</button>
            </div>
        `;
    }

    function renderErrorList(errors) {
        if (!Array.isArray(errors) || !errors.length) return '';
        return `
            <div class="status-card danger">
                <strong>${errors.length} fichier(s) non importé(s)</strong>
                <ul class="mini-list">
                    ${errors.map(error => `<li><span>${escapeHtml(error.filename || 'Fichier')}</span><small>${escapeHtml(error.message || 'Erreur inconnue')}</small></li>`).join('')}
                </ul>
            </div>
        `;
    }

    window.renderCompanyCashDashboard = async function renderCompanyCashDashboardV0603(companyId) {
        const container = document.getElementById('companyCashDashboard');
        if (!container) return;
        if (!companyId) {
            container.innerHTML = '<p class="muted">Sélectionnez une société pour afficher la caisse.</p>';
            return;
        }

        container.innerHTML = '<p class="muted">Chargement de la caisse mensuelle…</p>';

        let cash = {};
        let bankControls = {};
        try {
            cash = await loadCash(companyId);
            bankControls = await loadBankControls(companyId, cash.byMonth || []);
        } catch (error) {
            console.warn('Impossible de charger la caisse société', error);
            container.innerHTML = '<p class="muted">Impossible de charger les données caisse.</p>';
            return;
        }

        const months = cash.byMonth || [];
        const lastMonth = cash.lastMonth || months[months.length - 1] || {};
        const previousMonth = cash.previousMonth || months[months.length - 2] || {};
        const lastCa = safeNumber(lastMonth.net_ca_ttc || lastMonth.invoiced_ca);
        const previousCa = safeNumber(previousMonth.net_ca_ttc || previousMonth.invoiced_ca);

        container.innerHTML = `
            <div class="section-title-row compact-title-row">
                <div>
                    <span class="eyebrow">Caisse mensuelle</span>
                    <h2>Feuilles de caisse</h2>
                    <p class="muted">Suivi mensuel optique : CA net TTC, TVA nette, Cofidis, tiers-payants, acomptes et contrôle avec les relevés bancaires.</p>
                </div>
                <div class="cash-actions-v0711">
                    <button id="companyRefreshCashDashboard" type="button" class="secondary-button">Actualiser</button>
                    <button id="companyImportCashSheets" type="button" class="primary-button">Importer feuilles de caisse</button>
                </div>
            </div>

            <div id="companyCashImportStatus"></div>
            ${renderInvalidImportWarning(cash)}

            <div class="focus-v070-note">V0.70 : imports sécurisés, nettoyage des erreurs, apprentissage des catégories bancaires et contrôles caisse/banque fiabilisés.</div>

            <div class="dossier-kpi-grid-v050">
                ${kpiWithTitle('Dernier CA net TTC', lastCa, `HT : ${money(lastMonth.net_ca_ht || 0)} · TVA nette : ${money(lastMonth.tva_nette || 0)}`)}
                <div><span>Évolution vs mois précédent</span><strong>${formatVariation(variation(lastCa, previousCa))}</strong></div>
                ${kpiWithTitle('CA net TTC 12 mois', cash.totalNetTtc || cash.totalInvoiced || 0, `HT : ${money(cash.totalNetHt || 0)} · TVA nette : ${money(cash.totalTvaNette || 0)}`)}
                <div><span>TVA nette collectée</span><strong>${money(cash.totalTvaNette || 0)}</strong></div>
                <div><span>Tiers-payants</span><strong>${money(cash.totalTiersPayant || 0)}</strong></div>
                <div><span>Acomptes clients</span><strong>${money(cash.totalAcomptes || 0)}</strong></div>
                <div><span>Cofidis</span><strong>${money(cash.totalFinancing || 0)}</strong></div>
                <div><span>Écarts caisse</span><strong>${money(cash.totalEcarts || 0)}</strong></div>
                <div class="cash-cumulated-gap-card-v0613"><span>Écart banque cumulé</span><strong>${money(totalBankGap(months, bankControls))}</strong><small>J + F + M + A + …</small></div>
            </div>

            <article class="dashboard-panel cash-panel-wide">
                <h3>Évolution du CA mois par mois</h3>
                ${renderMonthlyEvolution(months)}
            </article>

            <article class="dashboard-panel cash-panel-wide cash-bank-control-panel-v0711">
                <div class="cash-panel-header-v0711">
                    <div>
                        <h3>Contrôle avec les relevés bancaires</h3>
                        <p class="muted">Focus Compta compare les montants attendus de la feuille de caisse aux opérations positives des relevés. Les catégories normalisées sont prioritaires : Remise(s) CB + Remise(s) AMEX regroupées en CB, puis Remise COFIDIS, Remise ES et Remise CH.</p>
                    </div>
                    <button id="companyRefreshCashBankControl" type="button" class="secondary-button small-button">Actualiser le contrôle</button>
                </div>
                ${renderBankControlTable(months, bankControls)}
            </article>

            <div class="dashboard-grid">
                <article class="dashboard-panel">
                    <h3>Composition caisse</h3>
                    <ul class="mini-list">
                        <li><span>CA net TTC</span><strong title="HT : ${money(cash.totalNetHt || 0)} · TVA nette : ${money(cash.totalTvaNette || 0)}">${money(cash.totalNetTtc || cash.totalInvoiced || 0)}</strong></li>
                        <li><span>TVA brute</span><strong>${money(cash.totalTvaBrute || 0)}</strong></li>
                        <li><span>TVA remises</span><strong>${money(cash.totalDiscountTva || 0)}</strong></li>
                        <li><span>TVA nette</span><strong>${money(cash.totalTvaNette || 0)}</strong></li>
                        <li><span>CB + AMEX</span><strong>${money(safeNumber(cash.totalCard) + safeNumber(cash.totalAmex))}</strong></li>
                    </ul>
                </article>
                <article class="dashboard-panel">
                    <h3>Autres éléments caisse</h3>
                    <ul class="mini-list">
                        <li><span>Tiers-payant à suivre</span><strong>${money(cash.totalTiersPayant || 0)}</strong></li>
                        <li><span>Acomptes clients</span><strong>${money(cash.totalAcomptes || 0)}</strong></li>
                        <li><span>Cofidis (P3X/P4X/P10X/Paylater)</span><strong>${money(cash.totalFinancing || 0)}</strong></li>
                        <li><span>AMEX incluse dans CB</span><strong>${money(cash.totalAmex || 0)}</strong></li>
                        <li><span>Écarts caisse</span><strong>${money(cash.totalEcarts || 0)}</strong></li>
                    </ul>
                </article>
            </div>

            <article class="dashboard-panel cash-panel-wide">
                <h3>Derniers imports</h3>
                <ul class="mini-list">${renderRecentRows(cash.recent || [])}</ul>
            </article>
        `;

        container.querySelectorAll('.delete-cash-sheet-btn').forEach(button => {
            button.addEventListener('click', async () => {
                const cashSheetId = Number(button.dataset.cashSheetId || 0);
                if (!cashSheetId || !window.api?.deleteCashSheet) return;
                try {
                    const result = await window.api.deleteCashSheet({ companyId, cashSheetId });
                    if (result?.deleted) {
                        if (window.showToast) window.showToast('Import caisse supprimé.', 'success');
                        await window.renderCompanyCashDashboard(companyId);
                    }
                } catch (error) {
                    console.error('Suppression import caisse impossible', error);
                    if (window.showToast) window.showToast(error.message || 'Suppression impossible.', 'danger');
                }
            });
        });

        document.getElementById('cleanInvalidCashSheetsV070')?.addEventListener('click', async () => {
            if (!window.api?.deleteInvalidCashSheetsV070) return;
            try {
                const result = await window.api.deleteInvalidCashSheetsV070({ companyId });
                if (result?.deleted) {
                    if (window.showToast) window.showToast(`${safeNumber(result.deleted)} import(s) corrompu(s) supprimé(s).`, 'success');
                    await window.renderCompanyCashDashboard(companyId);
                }
            } catch (error) {
                console.error('Nettoyage caisse impossible', error);
                if (window.showToast) window.showToast(error.message || 'Nettoyage impossible.', 'danger');
            }
        });

        const refreshCashViewV0711 = async () => {
            const status = document.getElementById('companyCashImportStatus');
            if (status) status.innerHTML = '<p class="muted">Actualisation des données caisse et banque…</p>';
            try {
                await window.renderCompanyCashDashboard(companyId);
                if (window.showToast) window.showToast('Caisse actualisée.', 'success');
            } catch (error) {
                console.error('Actualisation caisse impossible', error);
                if (window.showToast) window.showToast(error.message || 'Actualisation impossible.', 'danger');
            }
        };

        document.getElementById('companyRefreshCashDashboard')?.addEventListener('click', refreshCashViewV0711);
        document.getElementById('companyRefreshCashBankControl')?.addEventListener('click', refreshCashViewV0711);

        document.getElementById('companyImportCashSheets')?.addEventListener('click', async () => {
            const status = document.getElementById('companyCashImportStatus');
            try {
                const files = await window.api.selectCashSheets();
                if (!Array.isArray(files) || !files.length) return;
                if (status) status.innerHTML = '<p class="muted">Import des feuilles de caisse… Analyse en cours.</p>';
                const result = await window.api.importCashSheets({ companyId, files });
                if (status) {
                    status.innerHTML = `
                        <div class="status-card success">
                            <strong>${safeNumber(result.importedCount)} feuille(s) importée(s)</strong>
                            <span>${safeNumber(result.replacedCount)} remplacée(s) · ${safeNumber(result.skippedCount)} ignorée(s) · ${safeNumber(result.errorCount)} erreur(s)</span>
                        </div>
                        ${renderErrorList(result.errors)}
                    `;
                }
                if (window.showToast) {
                    const tone = result.errorCount ? 'warning' : 'success';
                    window.showToast(`${safeNumber(result.importedCount)} feuille(s) importée(s), ${safeNumber(result.replacedCount)} remplacée(s), ${safeNumber(result.skippedCount)} ignorée(s).`, tone);
                }
                await window.renderCompanyCashDashboard(companyId);
            } catch (error) {
                console.error('Import feuilles de caisse impossible', error);
                if (status) status.innerHTML = `<p class="muted">Import impossible : ${escapeHtml(error.message || 'erreur inconnue')}</p>`;
                if (window.showToast) window.showToast(error.message || 'Import feuilles de caisse impossible.', 'danger');
            }
        });
    };
})();
