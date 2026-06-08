// Focus Compta V0.71 — Centre de contrôle + Timeline comptable dernier mois
(function initFocusComptaV052() {
    const MONTHS_V050 = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const TIMELINE_MONTHS_V052 = 6;
    const LAST_TIMELINE_ROWS_V052 = [];
    let SELECTED_TIMELINE_KEY_V0831 = null;

    function safeNumber(value) { return Number(value || 0); }
    function padMonth(value) { return String(value || '').padStart(2, '0'); }
    function money(value) { return typeof formatAmount === 'function' ? formatAmount(value) : `${safeNumber(value).toFixed(2)} €`; }
    function escape(value) { return typeof focusEscapeHtmlV04116 === 'function' ? focusEscapeHtmlV04116(value) : String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
    function setTextSafe(id, value) { if (typeof setText === 'function') setText(id, value); else { const el = document.getElementById(id); if (el) el.textContent = value; } }

    const originalShowPageV050 = typeof showPage === 'function' ? showPage : null;
    window.showPage = showPage = function showPageV052(pageId) {
        const redirect = { dashboardPage: 'companiesPage', matchingPage: 'bankPage', exportsPage: 'accountingPage' };
        const target = redirect[pageId] || pageId;
        if (originalShowPageV050) originalShowPageV050(target);
        if (target === 'companiesPage') setTimeout(renderSelectedCompanyDossierV050, 0);
    };

    const originalMakeCompanyCardV050 = typeof makeCompanyCard === 'function' ? makeCompanyCard : null;
    window.makeCompanyCard = makeCompanyCard = function makeCompanyCardV052(company, options = {}) {
        const card = originalMakeCompanyCardV050 ? originalMakeCompanyCardV050(company, options) : document.createElement('article');
        card.classList.add('company-card-v050');
        const open = card.querySelector('.company-open-button-v04116');
        if (open) {
            open.textContent = 'Ouvrir la fiche';
            open.onclick = async event => {
                event.preventDefault();
                event.stopPropagation();
                await selectCompany(company, false);
                await renderSelectedCompanyDossierV050();
                showPage('companiesPage');
            };
        }
        return card;
    };

    function monthKeyV050(offset = 0) {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() + offset);
        return {
            key: `${date.getFullYear()}-${padMonth(date.getMonth() + 1)}`,
            label: `${MONTHS_V050[date.getMonth()]} ${date.getFullYear()}`,
            month: padMonth(date.getMonth() + 1),
            year: String(date.getFullYear()),
            index: date.getMonth()
        };
    }

    function visibleMonthsV052() {
        const months = [];
        for (let i = -(TIMELINE_MONTHS_V052 - 1); i <= 0; i += 1) months.push(monthKeyV050(i));
        return months;
    }

    function defaultTimelineKeyV0831() {
        return monthKeyV050(-1).key;
    }

    function timelineIndexByKeyV0831(rows, key) {
        const idx = rows.findIndex(row => row.key === key);
        return idx >= 0 ? idx : Math.max(0, rows.length - 2);
    }

    function selectedTimelineMonthV0831(rows) {
        if (!Array.isArray(rows) || !rows.length) return null;
        if (!SELECTED_TIMELINE_KEY_V0831) SELECTED_TIMELINE_KEY_V0831 = defaultTimelineKeyV0831();
        const idx = timelineIndexByKeyV0831(rows, SELECTED_TIMELINE_KEY_V0831);
        SELECTED_TIMELINE_KEY_V0831 = rows[idx]?.key || rows[rows.length - 1]?.key;
        return rows[idx] || rows[rows.length - 1];
    }

    function moveTimelineSelectionV0831(direction) {
        if (!LAST_TIMELINE_ROWS_V052.length) return;
        const currentIdx = timelineIndexByKeyV0831(LAST_TIMELINE_ROWS_V052, SELECTED_TIMELINE_KEY_V0831 || defaultTimelineKeyV0831());
        const nextIdx = Math.max(0, Math.min(LAST_TIMELINE_ROWS_V052.length - 1, currentIdx + direction));
        SELECTED_TIMELINE_KEY_V0831 = LAST_TIMELINE_ROWS_V052[nextIdx]?.key;
        renderTimelineSelectionV0831();
    }

    function renderTimelineSelectionV0831() {
        const timeline = document.getElementById('v050AccountingTimeline');
        if (!timeline || !LAST_TIMELINE_ROWS_V052.length) return;
        const selected = selectedTimelineMonthV0831(LAST_TIMELINE_ROWS_V052);
        timeline.innerHTML = selected ? buildTimelineMonthV050(selected, selected.key === monthKeyV050(0).key) : '<p class="muted">Aucun mois disponible.</p>';
        timeline.querySelectorAll('[data-v052-period]').forEach(card => {
            card.addEventListener('click', () => openTimelinePeriodV052(card.dataset.v052Period));
            card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') openTimelinePeriodV052(card.dataset.v052Period); });
        });
        const progress = selected ? timelineProgressV071(selected, selected.key === monthKeyV050(0).key) : 0;
        setTextSafe('v0831TimelineMonthTitle', selected?.label || 'Mois précédent');
        setTextSafe('v050TimelineSummary', `${selected?.label || 'M-1'} · ${progress} % terminé`);
        const idx = timelineIndexByKeyV0831(LAST_TIMELINE_ROWS_V052, selected?.key);
        const prev = document.getElementById('v0831TimelinePrev');
        const next = document.getElementById('v0831TimelineNext');
        if (prev) prev.disabled = idx <= 0;
        if (next) next.disabled = idx >= LAST_TIMELINE_ROWS_V052.length - 1;
    }

    function periodFromDocumentV052(doc) {
        const explicitYear = doc.accounting_period_year || '';
        const explicitMonth = doc.accounting_period_month || '';
        if (explicitYear && explicitMonth) return { year: String(explicitYear), month: padMonth(explicitMonth), key: `${explicitYear}-${padMonth(explicitMonth)}` };
        const rawDate = doc.invoice_date || doc.detected_date || doc.added_at || doc.created_at || '';
        const match = String(rawDate).match(/(20\d{2})[-/](\d{1,2})/);
        if (match) return { year: match[1], month: padMonth(match[2]), key: `${match[1]}-${padMonth(match[2])}` };
        return null;
    }

    function emptyMonthStatsV052(month) {
        return {
            ...month,
            accounts: 0,
            statements: 0,
            transactions: 0,
            missingReceipts: 0,
            documents: 0,
            documentsToTransmit: 0,
            documentsToValidate: 0,
            unmatchedDocuments: 0,
            duplicates: 0,
            statementGaps: 0,
            exportLots: 0,
            archives: 0,
            cashSheets: 0,
            cashRevenue: 0,
            cashTiersPayant: 0,
            cashAcomptes: 0,
            cashTvaNette: 0,
            cashEcarts: 0,
            hasData: false
        };
    }

    function ensureMonthStatsV052(monthMap, month) {
        if (!monthMap.has(month.key)) monthMap.set(month.key, emptyMonthStatsV052(month));
        return monthMap.get(month.key);
    }

    async function collectCompanyCockpitV050(company) {
        const months = visibleMonthsV052();
        const monthMap = new Map(months.map(month => [month.key, emptyMonthStatsV052(month)]));
        const cockpit = {
            company,
            treasury: 0,
            accounts: 0,
            statements: 0,
            transactions: 0,
            missingReceipts: 0,
            missingAmount: 0,
            documentsToTransmit: 0,
            documentsToValidate: 0,
            unmatchedDocuments: 0,
            duplicates: 0,
            statementGaps: 0,
            exportLots: 0,
            archives: 0,
            cashSheets: 0,
            cashMissing: 0,
            cashRevenue: 0,
            cashTiersPayant: 0,
            cashAcomptes: 0,
            cashTvaNette: 0,
            cashEcarts: 0,
            timelineMonths: []
        };

        try {
            const dashboard = await window.api.getCompanyDashboard(company.id);
            cockpit.treasury = safeNumber(dashboard?.treasury?.total ?? dashboard?.totals?.balance ?? 0);
        } catch (_) {}

        try {
            const accounts = await window.api.getBankAccounts(company.id);
            cockpit.accounts = Array.isArray(accounts) ? accounts.length : 0;
            for (const account of (accounts || [])) {
                const summary = await window.api.getTransactionSummary({ bankAccountId: account.id, filters: {} });
                const insights = await window.api.getDashboardInsights({ bankAccountId: account.id, filters: {} });
                const statements = await window.api.getStatements(account.id);
                cockpit.transactions += safeNumber(summary.total);
                cockpit.missingReceipts += safeNumber(summary.missing);
                cockpit.missingAmount += Math.abs(safeNumber(insights?.missing?.total));
                cockpit.statements += Array.isArray(statements) ? statements.length : 0;
                cockpit.statementGaps += (statements || []).filter(statement => typeof statementHasControlGap === 'function' && statementHasControlGap(statement)).length;

                for (const statement of (statements || [])) {
                    const year = statement.statement_year;
                    const month = padMonth(statement.statement_month);
                    const key = year && month ? `${year}-${month}` : null;
                    if (!key || !monthMap.has(key)) continue;
                    const m = monthMap.get(key);
                    m.accounts = Math.max(m.accounts, cockpit.accounts);
                    m.statements += 1;
                    m.transactions += safeNumber(statement.transactions_count);
                    m.statementGaps += typeof statementHasControlGap === 'function' && statementHasControlGap(statement) ? 1 : 0;
                    m.hasData = true;
                    try {
                        const txSummary = await window.api.getTransactionSummary({ bankAccountId: account.id, filters: { year: String(year), month } });
                        m.missingReceipts += safeNumber(txSummary.missing);
                    } catch (_) {}
                }
            }
            monthMap.forEach(m => { if (cockpit.accounts > 0) m.accounts = cockpit.accounts; });
        } catch (error) { console.warn('V0.52 banque indisponible', company.name, error); }

        try {
            const docs = await window.api.getDocuments({ companyId: company.id, filters: { status: 'all' } });
            const documents = Array.isArray(docs) ? docs.filter(doc => !doc.deleted_at) : [];
            const visibleDocs = documents.filter(doc => !['releve', 'rib'].includes(doc.doc_type || ''));
            cockpit.documentsToTransmit = visibleDocs.filter(doc => (doc.transmission_status || 'not_transmitted') !== 'transmitted' && !['archived', 'ignored'].includes(doc.status || '')).length;
            cockpit.documentsToValidate = visibleDocs.filter(doc => ['review', 'to_validate', 'ocr_pending', 'pending'].includes(doc.status || '') || ['pending', 'to_review'].includes(doc.validation_status || '') || ['to_review', 'poor'].includes(doc.ocr_quality_status || '')).length;
            cockpit.unmatchedDocuments = visibleDocs.filter(doc => doc.status !== 'matched' && doc.payment_status !== 'paid').length;

            visibleDocs.forEach(doc => {
                const period = periodFromDocumentV052(doc);
                if (!period || !monthMap.has(period.key)) return;
                const m = monthMap.get(period.key);
                const toTransmit = (doc.transmission_status || 'not_transmitted') !== 'transmitted' && !['archived', 'ignored'].includes(doc.status || '');
                const toValidate = ['review', 'to_validate', 'ocr_pending', 'pending'].includes(doc.status || '') || ['pending', 'to_review'].includes(doc.validation_status || '') || ['to_review', 'poor'].includes(doc.ocr_quality_status || '');
                const unmatched = doc.status !== 'matched' && doc.payment_status !== 'paid';
                m.documents += 1;
                if (toTransmit) m.documentsToTransmit += 1;
                if (toValidate) m.documentsToValidate += 1;
                if (unmatched) m.unmatchedDocuments += 1;
                m.hasData = true;
            });
        } catch (_) {}

        try {
            if (window.api.getDocumentsToValidateV0452) {
                const toValidate = await window.api.getDocumentsToValidateV0452(company.id);
                if (Array.isArray(toValidate)) cockpit.documentsToValidate = toValidate.length;
            }
        } catch (_) {}

        try {
            if (window.api.getDocumentSmartFolders) {
                const folders = await window.api.getDocumentSmartFolders({ companyId: company.id });
                cockpit.unmatchedDocuments = safeNumber(folders?.unmatched ?? cockpit.unmatchedDocuments);
            }
        } catch (_) {}

        try {
            if (window.api.getDocumentDuplicates) {
                const duplicates = await window.api.getDocumentDuplicates({ companyId: company.id });
                cockpit.duplicates = Array.isArray(duplicates) ? duplicates.length : 0;
                (duplicates || []).forEach(doc => {
                    const period = periodFromDocumentV052(doc);
                    if (period && monthMap.has(period.key)) monthMap.get(period.key).duplicates += 1;
                });
            }
        } catch (_) {}


        try {
            if (window.api.getCashSheetInsights) {
                const cash = await window.api.getCashSheetInsights({ companyId: company.id });
                cockpit.cashSheets = safeNumber(cash?.count);
                cockpit.cashRevenue = safeNumber(cash?.totalInvoiced || cash?.totalNetTtc || cash?.totalNetCaTtc);
                cockpit.cashTiersPayant = safeNumber(cash?.totalTiersPayant);
                cockpit.cashAcomptes = safeNumber(cash?.totalAcomptes);
                cockpit.cashTvaNette = safeNumber(cash?.totalTvaNette);
                cockpit.cashEcarts = safeNumber(cash?.totalEcarts);
                (cash?.byMonth || []).forEach(row => {
                    const year = String(row.period_year || row.periodYear || '').trim();
                    const month = padMonth(row.period_month || row.periodMonth || '');
                    const key = year && month ? `${year}-${month}` : null;
                    if (!key || !monthMap.has(key)) return;
                    const m = monthMap.get(key);
                    m.cashSheets += safeNumber(row.count || 1);
                    m.cashRevenue += safeNumber(row.invoiced_ca || row.net_ca_ttc || row.ca || row.total || 0);
                    m.cashTiersPayant += safeNumber(row.tiers_payant || row.third_party || 0);
                    m.cashAcomptes += safeNumber(row.acomptes || row.acompte_total || 0);
                    m.cashTvaNette += safeNumber(row.tva_nette || 0);
                    m.cashEcarts += safeNumber(row.ecarts || row.ecart_total || 0);
                    m.hasData = true;
                });
            }
            if (window.api.getCashSheetReminders) {
                const reminders = await window.api.getCashSheetReminders();
                cockpit.cashMissing = (reminders?.missing || reminders || []).filter(item => String(item.companyId || item.company_id) === String(company.id)).length;
            }
        } catch (_) {}

        try {
            if (window.api.getAccountingExportLotsV0456) {
                const lots = await window.api.getAccountingExportLotsV0456(company.id);
                cockpit.exportLots = Array.isArray(lots) ? lots.length : 0;
                cockpit.archives = (lots || []).filter(lot => String(lot.export_type || '').includes('archive')).length;
                (lots || []).forEach(lot => {
                    const year = String(lot.period_year || '');
                    const month = padMonth(lot.period_month || '');
                    const key = year && month ? `${year}-${month}` : null;
                    if (!key || !monthMap.has(key)) return;
                    const m = monthMap.get(key);
                    m.exportLots += 1;
                    if (String(lot.export_type || '').includes('archive')) m.archives += 1;
                    m.hasData = true;
                });
            }
        } catch (_) {}

        cockpit.timelineMonths = months.map(month => ensureMonthStatsV052(monthMap, month));
        return cockpit;
    }

    function mergeTimelineMonthsV052(rows) {
        return visibleMonthsV052().map(month => {
            const merged = emptyMonthStatsV052(month);
            rows.forEach(row => {
                const m = (row.timelineMonths || []).find(item => item.key === month.key);
                if (!m) return;
                ['accounts','statements','transactions','missingReceipts','documents','documentsToTransmit','documentsToValidate','unmatchedDocuments','duplicates','statementGaps','exportLots','archives','cashSheets','cashRevenue','cashTiersPayant','cashAcomptes','cashTvaNette','cashEcarts'].forEach(key => merged[key] += safeNumber(m[key]));
                merged.hasData = merged.hasData || !!m.hasData;
            });
            return merged;
        });
    }

    function renderAlertLineV050(label, value, page, tone = 'warning') {
        return `<button class="alert-line-v050 ${tone} nav-shortcut" data-page="${page}" type="button"><span>${escape(label)}</span><strong>${escape(value)}</strong></button>`;
    }

    function timelineStatusV050(label, state, detail) {
        const icon = state === 'done' ? '✓' : state === 'warning' ? '!' : state === 'blocked' ? '×' : '·';
        return `<div class="timeline-step-v050 ${state}"><span>${icon}</span><div><strong>${escape(label)}</strong><small>${escape(detail)}</small></div></div>`;
    }


    function timelineStepStatesV071(month, isCurrent) {
        const statementState = month.accounts === 0 ? 'pending' : (month.statements > 0 && month.statementGaps === 0 ? 'done' : 'warning');
        const cashState = month.cashSheets > 0 && Math.abs(safeNumber(month.cashEcarts)) <= 50 ? 'done' : (month.cashSheets > 0 ? 'warning' : 'pending');
        const docsState = month.documents === 0 ? 'pending' : (month.documentsToTransmit + month.unmatchedDocuments === 0 ? 'done' : 'warning');
        const ocrState = month.documents === 0 ? 'pending' : (month.documentsToValidate === 0 ? 'done' : 'warning');
        const matchState = month.documents === 0 && month.transactions === 0 ? 'pending' : (month.unmatchedDocuments + month.missingReceipts === 0 ? 'done' : 'warning');
        const vatState = month.cashTvaNette > 0 || month.documents > 0 ? (month.duplicates === 0 ? 'done' : 'warning') : 'pending';
        const exportState = month.exportLots > 0 ? 'done' : (isCurrent ? 'pending' : (month.hasData ? 'blocked' : 'pending'));
        const archiveState = month.archives > 0 ? 'done' : (month.exportLots > 0 ? 'warning' : 'pending');
        return { statementState, cashState, docsState, ocrState, matchState, vatState, exportState, archiveState };
    }

    function timelineProgressV071(month, isCurrent) {
        const states = timelineStepStatesV071(month, isCurrent);
        const values = Object.values(states).filter(state => state !== 'pending');
        if (!values.length) return 0;
        const done = values.filter(state => state === 'done').length;
        return Math.round((done / values.length) * 100);
    }

    function buildTimelineMonthV050(month, isCurrent) {
        const noData = !month.hasData && month.accounts === 0;
        const { statementState, cashState, docsState, ocrState, matchState, vatState, exportState, archiveState } = timelineStepStatesV071(month, isCurrent);
        const progress = timelineProgressV071(month, isCurrent);

        return `
            <article class="timeline-month-v050 ${isCurrent ? 'current' : ''} ${noData ? 'empty' : ''}" data-v052-period="${escape(month.key)}" tabindex="0" role="button" aria-label="Ouvrir ${escape(month.label)}">
                <div class="timeline-month-head-v050"><h3>${escape(month.label)}</h3><span>${progress} % terminé</span></div>
                ${timelineStatusV050('Relevés importés', statementState, month.accounts === 0 ? 'Aucun compte bancaire' : (month.statements ? `${month.statements} relevé(s)` : 'Relevé manquant'))}
                ${timelineStatusV050('Feuille de caisse', cashState, month.cashSheets ? `${month.cashSheets} import(s) · CA ${money(month.cashRevenue)}` : 'Feuille de caisse manquante')}
                ${timelineStatusV050('Documents importés', docsState, month.documents ? `${month.documents} document(s) · ${month.documentsToTransmit} à transmettre` : 'Aucun document')}
                ${timelineStatusV050('OCR validé', ocrState, month.documents ? (month.documentsToValidate ? `${month.documentsToValidate} document(s) à valider` : 'Validation à jour') : 'En attente documents')}
                ${timelineStatusV050('Rapprochements terminés', matchState, (month.unmatchedDocuments + month.missingReceipts) ? `${month.unmatchedDocuments + month.missingReceipts} élément(s) à rapprocher` : 'Banque et documents cohérents')}
                ${timelineStatusV050('TVA sous contrôle', vatState, month.duplicates ? `${month.duplicates} doublon(s) à vérifier` : (month.documents ? 'Aucune anomalie visible' : 'En attente documents'))}
                ${timelineStatusV050('Export comptable effectué', exportState, month.exportLots ? `${month.exportLots} export(s)` : 'Export non généré')}
                ${timelineStatusV050('Archive disponible', archiveState, month.archives ? 'Archive créée' : (month.exportLots ? 'Archive à créer' : 'En attente export'))}
            </article>`;
    }

    function openTimelinePeriodV052(key) {
        const period = LAST_TIMELINE_ROWS_V052.find(item => item.key === key);
        if (!period) return;
        window.focusSelectedAccountingPeriodV052 = { year: period.year, month: period.month };
        showPage(period.documents || period.missingReceipts || period.unmatchedDocuments ? 'accountingPage' : 'bankPage');
    }

    window.loadHomeInsights = loadHomeInsights = async function loadHomeInsightsV052(companies) {
        if (typeof updateCompanyContextBar === 'function') updateCompanyContextBar();
        let list = Array.isArray(companies) ? companies : [];
        // V0.55.2 — l'accueil doit recalculer les données réelles même si aucune société n'est ouverte
        // ou si l'appelant ne fournit pas la liste des sociétés.
        if (!list.length && window.api?.getCompanies) {
            try { list = await window.api.getCompanies(); } catch (_) { list = []; }
        }
        const rows = [];
        for (const company of list) rows.push(await collectCompanyCockpitV050(company));

        const totals = rows.reduce((acc, row) => {
            Object.keys(acc).forEach(key => acc[key] += safeNumber(row[key]));
            return acc;
        }, { treasury: 0, statements: 0, missingReceipts: 0, documentsToTransmit: 0, documentsToValidate: 0, unmatchedDocuments: 0, duplicates: 0, statementGaps: 0, exportLots: 0, archives: 0, cashTiersPayant: 0, cashAcomptes: 0, cashTvaNette: 0, cashEcarts: 0, cashMissing: 0 });

        const timelineRows = mergeTimelineMonthsV052(rows);
        LAST_TIMELINE_ROWS_V052.splice(0, LAST_TIMELINE_ROWS_V052.length, ...timelineRows);
        const anomalies = totals.statementGaps + totals.duplicates;
        // V0.55.2 — aligner l'accueil avec la Banque : les paiements sans justificatif
        // correspondent au compteur Banque "Manquantes". On ne mélange plus documents non rapprochés,
        // OCR et paiements bancaires dans une seule valeur incompréhensible.
        const actions = totals.missingReceipts + totals.documentsToTransmit + totals.documentsToValidate + totals.statementGaps + totals.cashMissing + anomalies;

        setTextSafe('v050TreasuryTotal', money(totals.treasury));
        setTextSafe('v071BankTotal', money(totals.treasury));
        setTextSafe('v071ThirdPartyTotal', money(totals.cashTiersPayant));
        setTextSafe('v071AcomptesTotal', money(totals.cashAcomptes));
        setTextSafe('v071VatTotal', money(totals.cashTvaNette));
        setTextSafe('v071DocsValidate', totals.documentsToValidate);
        setTextSafe('v071DocsTransmit', totals.documentsToTransmit);
        setTextSafe('v071BankMissing', totals.missingReceipts);
        setTextSafe('v071StatementGaps', totals.statementGaps);
        const treasuryList = document.getElementById('v050TreasuryList');
        if (treasuryList) {
            treasuryList.innerHTML = rows.length ? rows.map(row => `<button class="company-money-row-v050" type="button" data-v050-company-id="${row.company.id}"><span>${escape(row.company.name)}</span><strong>${money(row.treasury)}</strong></button>`).join('') : '<p class="muted">Aucune société créée.</p>';
            treasuryList.querySelectorAll('[data-v050-company-id]').forEach(btn => btn.addEventListener('click', async () => {
                const company = list.find(c => String(c.id) === String(btn.dataset.v050CompanyId));
                if (company) { await selectCompany(company, false); await renderSelectedCompanyDossierV050(); showPage('companiesPage'); }
            }));
        }

        const globalCard = document.getElementById('v050GlobalStatusCard');
        if (globalCard) {
            globalCard.classList.toggle('is-ok', actions === 0);
            globalCard.classList.toggle('has-actions', actions > 0);
        }
        setTextSafe('v050GlobalStatusTitle', actions > 0 ? 'Actions requises' : 'Comptabilité à jour');
        setTextSafe('v050GlobalStatusSubtitle', actions > 0 ? `${actions} élément(s) nécessitent votre attention.` : 'Tous les éléments visibles sont traités.');
        setTextSafe('v050GlobalActionCount', actions > 0 ? `${actions} à traiter` : 'OK');

        const alerts = document.getElementById('v050AlertsList');
        if (alerts) {
            const html = [
                renderAlertLineV050('Documents à valider', totals.documentsToValidate ? `${totals.documentsToValidate} document(s)` : '0', 'receiptsPage', totals.documentsToValidate ? 'warning' : 'ok'),
                renderAlertLineV050('Documents à transmettre', totals.documentsToTransmit ? `${totals.documentsToTransmit} document(s)` : '0', 'accountingPage', totals.documentsToTransmit ? 'warning' : 'ok'),
                renderAlertLineV050('Opérations à rapprocher', totals.missingReceipts ? `${totals.missingReceipts} opération(s)` : '0', 'bankPage', totals.missingReceipts ? 'warning' : 'ok'),
                renderAlertLineV050('Relevés avec écart', totals.statementGaps ? `${totals.statementGaps} relevé(s)` : '0', 'bankPage', totals.statementGaps ? 'danger' : 'ok'),
                renderAlertLineV050('Feuilles de caisse manquantes', totals.cashMissing ? `${totals.cashMissing} mois` : '0', 'companiesPage', totals.cashMissing ? 'warning' : 'ok'),
                renderAlertLineV050('Doublons tiers / anomalies', anomalies ? `${anomalies} anomalie(s)` : '0', 'accountingPage', anomalies ? 'danger' : 'ok')
            ].join('');
            alerts.innerHTML = html;
            alerts.querySelectorAll('.nav-shortcut').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
        }

        if (!SELECTED_TIMELINE_KEY_V0831) SELECTED_TIMELINE_KEY_V0831 = defaultTimelineKeyV0831();
        renderTimelineSelectionV0831();

        setTextSafe('homeExpenses', money(0)); setTextSafe('homeIncome', money(0)); setTextSafe('homeMissing', totals.missingReceipts);
        setTextSafe('homeMissingAmount', money(totals.missingAmount)); setTextSafe('homeTransactions', 0); setTextSafe('homeStatements', totals.statements); setTextSafe('homeAlerts', actions);
        try { document.dispatchEvent(new CustomEvent('focus-cockpit-rendered')); } catch (_) {}
    };

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('v0831TimelinePrev')?.addEventListener('click', () => moveTimelineSelectionV0831(-1));
        document.getElementById('v0831TimelineNext')?.addEventListener('click', () => moveTimelineSelectionV0831(1));
    });

    window.renderSelectedCompanyDossierV050 = async function renderSelectedCompanyDossierV052(tab = 'summary') {
        const title = document.getElementById('v050CompanyDossierTitle');
        const body = document.getElementById('v050CompanyDossierBody');
        if (!title || !body) return;
        document.querySelectorAll('[data-v050-company-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.v050CompanyTab === tab));
        if (!selectedCompany) {
            title.textContent = 'Sélectionnez une société';
            body.innerHTML = '<p class="muted">Ouvrez une société pour afficher son cockpit complet.</p>';
            return;
        }
        title.textContent = selectedCompany.name;
        body.innerHTML = '<p class="muted">Chargement de la fiche société…</p>';
        const row = await collectCompanyCockpitV050(selectedCompany);
        const reliability = Math.max(0, 100 - ((row.missingReceipts + row.documentsToValidate + row.statementGaps + row.duplicates) * 8));
        const companyTimeline = row.timelineMonths.slice(-4).map((month, index, array) => buildTimelineMonthV050(month, index === array.length - 1)).join('');
        const views = {
            summary: `
                <div class="dossier-kpi-grid-v050">
                    <div><span>Trésorerie</span><strong>${money(row.treasury)}</strong></div>
                    <div><span>Factures à payer</span><strong>${row.missingReceipts}</strong></div>
                    <div><span>Documents à transmettre</span><strong>${row.documentsToTransmit}</strong></div>
                    <div><span>TVA sous contrôle</span><strong>${row.duplicates === 0 ? 'Oui' : 'À vérifier'}</strong></div>
                    <div><span>Score fiabilité</span><strong>${reliability} %</strong></div>
                </div>
                <div class="company-mini-timeline-v052">${companyTimeline}</div>`,
            documents: `<div class="dossier-kpi-grid-v050"><div><span>Validation OCR</span><strong>${row.documentsToValidate}</strong></div><div><span>Non rapprochés</span><strong>${row.unmatchedDocuments}</strong></div><div><span>À transmettre</span><strong>${row.documentsToTransmit}</strong></div></div><button class="nav-shortcut primary-button" data-page="receiptsPage">Ouvrir les documents</button>`,
            banks: `<div class="dossier-kpi-grid-v050"><div><span>Comptes</span><strong>${row.accounts}</strong></div><div><span>Relevés</span><strong>${row.statements}</strong></div><div><span>Opérations</span><strong>${row.transactions}</strong></div><div><span>Rapprochements à faire</span><strong>${row.missingReceipts}</strong></div></div><button class="nav-shortcut primary-button" data-page="bankPage">Ouvrir la banque</button>`,
            cash: `
                <div id="companyCashDashboard">
                    <p class="muted">Chargement de la caisse…</p>
                </div>`,
            accounting: `<div class="dossier-kpi-grid-v050"><div><span>Contrôles</span><strong>${row.statementGaps + row.duplicates}</strong></div><div><span>Exports</span><strong>${row.exportLots}</strong></div><div><span>Archives</span><strong>${row.archives > 0 ? 'Disponible' : 'À créer'}</strong></div></div><button class="nav-shortcut primary-button" data-page="accountingPage">Ouvrir la comptabilité</button>`
        };
        body.innerHTML = views[tab] || views.summary;
        if (tab === 'cash' && typeof window.renderCompanyCashDashboard === 'function') {
            await window.renderCompanyCashDashboard(selectedCompany.id);
        }
        body.querySelectorAll('.nav-shortcut').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
    };

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-v050-company-tab]').forEach(btn => btn.addEventListener('click', () => renderSelectedCompanyDossierV050(btn.dataset.v050CompanyTab)));
        document.querySelectorAll('.daily-actions-v050 .nav-shortcut, .cockpit-topbar-v050 .nav-shortcut').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
    });
})();
