// Focus Compta V0.47 + V0.48 - Centre de Contrôle Comptable & Pilotage Dirigeant
(function initAccountingControlV047() {
    const MONTHS = {
        '01':'Janvier','02':'Février','03':'Mars','04':'Avril','05':'Mai','06':'Juin',
        '07':'Juillet','08':'Août','09':'Septembre','10':'Octobre','11':'Novembre','12':'Décembre'
    };

    function currentYear() { return String(new Date().getFullYear()); }
    function currentMonth() { return String(new Date().getMonth() + 1).padStart(2, '0'); }
    function money(value) {
        return Number(value || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    }
    function percent(value) {
        const n = Number.isFinite(Number(value)) ? Number(value) : 0;
        return `${Math.max(0, Math.min(100, Math.round(n)))} %`;
    }
    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
    }
    function getCompany() {
        try {
            if (typeof selectedCompany !== 'undefined' && selectedCompany) return selectedCompany;
        } catch (_) {}
        return window.selectedCompany || null;
    }
    function toast(message, type = 'success') {
        if (typeof focusToastV041 === 'function') focusToastV041(message, type);
        else console.log(`[${type}] ${message}`);
    }
    function setHtml(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }
    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }
    function scoreTone(score) {
        if (score >= 90) return 'good';
        if (score >= 70) return 'warn';
        return 'danger';
    }
    function metric(label, value, small = '') {
        return `<article class="accounting-metric-v047"><span>${esc(label)}</span><strong>${esc(value)}</strong>${small ? `<small>${esc(small)}</small>` : ''}</article>`;
    }
    function line(label, value, tone = '') {
        return `<div class="accounting-line-v047 ${tone ? 'tone-' + tone : ''}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
    }
    function blankState(message) {
        return `<div class="empty-state accounting-empty-v047">${esc(message)}</div>`;
    }

    function getSelectedPeriod() {
        const year = document.getElementById('accountingControlYearV047')?.value || currentYear();
        const month = document.getElementById('accountingControlMonthV047')?.value || currentMonth();
        return { year: String(year), month: String(month).padStart(2, '0') };
    }

    async function loadExecutiveData() {
        const company = getCompany();
        const { year } = getSelectedPeriod();
        if (!company?.id) return null;
        return window.api.getExecutiveDashboardV046({ companyId: company.id, year });
    }

    async function loadFinancialIntelligenceV049() {
        const company = getCompany();
        const { year, month } = getSelectedPeriod();
        if (!company?.id || !window.api.getFinancialIntelligenceV049) return null;
        return window.api.getFinancialIntelligenceV049({ companyId: company.id, year, month });
    }

    function variationBadgeV049(value) {
        if (value === null || value === undefined || value === '') return '<small>—</small>';
        const n = Number(value || 0);
        const cls = n > 0 ? 'up' : n < 0 ? 'down' : 'stable';
        const sign = n > 0 ? '+' : '';
        return `<small class="variation-v049 ${cls}">${sign}${n.toLocaleString('fr-FR')} %</small>`;
    }

    function financeRowV049(label, amount, right = '') {
        return `<div class="finance-row-v049"><span>${esc(label || 'Non identifié')}</span><strong>${money(amount || 0)}</strong>${right || ''}</div>`;
    }

    function renderFinancialSummaryV049(finance) {
        const target = document.getElementById('financeExecutiveSummaryV049');
        if (!target) return;
        if (!finance) { target.innerHTML = blankState('Intelligence financière indisponible.'); return; }
        const revenueDelta = Number(finance.revenue?.previousYearTtc || 0)
            ? ((Number(finance.revenue.currentYearTtc || 0) - Number(finance.revenue.previousYearTtc || 0)) / Number(finance.revenue.previousYearTtc || 1)) * 100
            : null;
        target.innerHTML = `
            ${metric('Trésorerie actuelle', money(finance.cashForecast?.today || 0))}
            ${metric('Prévision +30 jours', money(finance.cashForecast?.plus30 || 0))}
            ${metric('CA TTC année', money(finance.revenue?.currentYearTtc || 0), revenueDelta === null ? 'comparatif indisponible' : `${revenueDelta >= 0 ? '+' : ''}${Math.round(revenueDelta)} % vs ${esc(finance.previousYear)}`)}
            ${metric('Alertes financières', (finance.anomalies || []).length)}
        `;
    }

    function renderCashForecastV049(finance) {
        const target = document.getElementById('financeCashForecastV049');
        if (!target) return;
        if (!finance) { target.innerHTML = blankState('Aucune donnée de trésorerie.'); return; }
        const forecast = finance.cashForecast || {};
        const upcoming = forecast.upcoming || [];
        target.innerHTML = `
            <div class="finance-forecast-cards-v049">
                ${metric('Aujourd’hui', money(forecast.today || 0))}
                ${metric('+30 jours', money(forecast.plus30 || 0))}
                ${metric('+60 jours', money(forecast.plus60 || 0))}
                ${metric('+90 jours', money(forecast.plus90 || 0))}
            </div>
            <h4>Prochaines sorties prévues</h4>
            ${upcoming.length ? upcoming.slice(0, 8).map(row => financeRowV049(`${row.date || 'Date inconnue'} · ${row.supplier || row.filename || 'Document'}`, row.amount, `<small>${row.days === null || row.days === undefined ? '' : `J${row.days >= 0 ? '+' : ''}${row.days}`}</small>`)).join('') : blankState('Aucune échéance fournisseur détectée.')}
        `;
    }

    function renderSuppliersV049(finance) {
        const target = document.getElementById('financeSuppliersV049');
        if (!target) return;
        const rows = finance?.suppliers?.top || [];
        if (!rows.length) { target.innerHTML = blankState('Aucun fournisseur exploitable sur l’année.'); return; }
        target.innerHTML = rows.slice(0, 10).map(row => financeRowV049(row.supplier, row.current_amount, variationBadgeV049(row.variation_percent))).join('');
    }

    function renderChargesV049(finance) {
        const target = document.getElementById('financeChargesV049');
        if (!target) return;
        const rows = finance?.charges?.categories || [];
        if (!rows.length) { target.innerHTML = blankState('Aucune charge catégorisée exploitable.'); return; }
        target.innerHTML = rows.slice(0, 10).map(row => financeRowV049(row.category, row.current_amount, variationBadgeV049(row.variation_percent))).join('');
    }

    function renderMutualsV049(finance) {
        const target = document.getElementById('financeMutualsV049');
        if (!target) return;
        const rows = finance?.mutuals?.rows || [];
        if (!rows.length) { target.innerHTML = blankState('Aucun flux mutuelle / tiers-payant identifié.'); return; }
        target.innerHTML = rows.slice(0, 10).map(row => financeRowV049(row.name, row.current_received, variationBadgeV049(row.variation_percent))).join('');
    }

    function renderFinancialAnomaliesV049(finance) {
        const target = document.getElementById('financeAnomaliesV049');
        if (!target) return;
        const rows = finance?.anomalies || [];
        if (!rows.length) { target.innerHTML = blankState('Aucune alerte financière notable.'); return; }
        target.innerHTML = rows.slice(0, 12).map(row => `
            <article class="finance-alert-v049 ${esc(row.level || 'info')}">
                <strong>${row.level === 'danger' ? 'À surveiller' : row.level === 'warning' ? 'Variation' : 'Info'}</strong>
                <span>${esc(row.label)}</span>
                ${row.amount ? `<em>${money(row.amount)}</em>` : ''}
            </article>
        `).join('');
    }

    function renderFinancialIntelligenceV049(finance) {
        renderFinancialSummaryV049(finance);
        renderCashForecastV049(finance);
        renderSuppliersV049(finance);
        renderChargesV049(finance);
        renderMutualsV049(finance);
        renderFinancialAnomaliesV049(finance);
    }


    function computeScores(data, transmissionPreview) {
        const docs = data?.documents || {};
        const bank = data?.bank || {};
        const statements = data?.statements || {};
        const totalDocs = Number(docs.accounting_docs || docs.total || 0);
        const docProblems = Number(docs.not_transmitted || 0) + Number(docs.unpaid_count || 0) + Number(docs.overdue_count || 0);
        const docScore = totalDocs ? Math.max(0, 100 - Math.round((docProblems / totalDocs) * 100)) : 100;
        const bankScore = Number(bank.operations || 0) ? Math.round(((Number(bank.operations || 0) - Number(bank.missing || 0)) / Number(bank.operations || 1)) * 100) : 100;
        const statementsScore = Number(statements.total || 0) ? Math.round(((Number(statements.total || 0) - Number(statements.not_transmitted || 0)) / Number(statements.total || 1)) * 100) : 100;
        const transmissionDocs = Number(transmissionPreview?.totals?.documentsCount || docs.not_transmitted || 0);
        const transmissionScore = totalDocs ? Math.max(0, 100 - Math.round((transmissionDocs / totalDocs) * 100)) : 100;
        const global = Math.round((docScore + bankScore + statementsScore + transmissionScore) / 4);
        return { docScore, bankScore, statementsScore, transmissionScore, global };
    }

    function renderHealth(data, transmissionPreview) {
        const scores = computeScores(data, transmissionPreview);
        const tone = scoreTone(scores.global);
        setHtml('accountingHealthV047', `
            <section class="accounting-health-card-v047 ${tone}">
                <div>
                    <span class="eyebrow-v047">Santé comptable</span>
                    <strong>${percent(scores.global)}</strong>
                    <small>Score global indicatif. Il vérifie la complétude, pas la déclaration comptable.</small>
                </div>
                <div class="accounting-health-breakdown-v047">
                    ${metric('Documents', percent(scores.docScore))}
                    ${metric('Banque', percent(scores.bankScore))}
                    ${metric('Relevés', percent(scores.statementsScore))}
                    ${metric('Transmission', percent(scores.transmissionScore))}
                </div>
            </section>
        `);
        setText('accountingScoreTextV047', `Fiabilité globale ${percent(scores.global)}`);
    }

    function renderDocuments(data) {
        const docs = data?.documents || {};
        const payments = data?.payments || {};
        setHtml('accountingDocumentsV047', `
            <div class="accounting-metrics-v047">
                ${metric('Documents comptables', docs.accounting_docs || 0)}
                ${metric('Non transmis', docs.not_transmitted || 0)}
                ${metric('Factures à payer', payments.unpaidCount || 0, money(payments.unpaidTtc || 0))}
            </div>
            <div class="accounting-lines-v047">
                ${line('Factures échues', payments.overdueCount || 0, Number(payments.overdueCount || 0) ? 'danger' : 'good')}
                ${line('Montant TTC documents', money(docs.amount_ttc || 0))}
                ${line('HT détecté', money(docs.amount_ht || 0))}
            </div>
        `);
    }

    function renderBank(data) {
        const bank = data?.bank || {};
        const tp = data?.thirdPartyPayments || {};
        const operations = Number(bank.operations || 0);
        const missing = Number(bank.missing || 0);
        setHtml('accountingBankV047', `
            <div class="accounting-metrics-v047">
                ${metric('Opérations', operations)}
                ${metric('Catégorisées', bank.categorized || 0, percent(bank.automationRate || 0))}
                ${metric('À rapprocher / PJ', missing)}
            </div>
            <div class="accounting-lines-v047">
                ${line('Encaissements', money(bank.credits || 0))}
                ${line('Décaissements', money(bank.debits || 0))}
                ${line('Tiers-payant reçu', money(tp.received || 0))}
                ${line('Tiers-payant à contrôler', money(tp.to_check || 0), Number(tp.to_check || 0) ? 'warn' : 'good')}
            </div>
        `);
    }

    function renderVat(data) {
        const vat = data?.vat || {};
        const docs = data?.documents || {};
        const nonTransmittedRatio = Number(docs.amount_ttc || 0) ? Number(docs.not_transmitted || 0) / Math.max(Number(docs.accounting_docs || 1), 1) : 0;
        const indicativeUnsentVat = Number(vat.deductible || 0) * nonTransmittedRatio;
        setHtml('accountingVatV047', `
            <div class="accounting-metrics-v047">
                ${metric('TVA détectée', money(vat.deductible || 0))}
                ${metric('HT documents', money(vat.ht || 0))}
                ${metric('TTC documents', money(vat.ttc || 0))}
            </div>
            <div class="accounting-lines-v047">
                ${line('TVA potentiellement non transmise', money(indicativeUnsentVat), indicativeUnsentVat ? 'warn' : 'good')}
                ${line('Factures échues à contrôler', data?.payments?.overdueCount || 0, Number(data?.payments?.overdueCount || 0) ? 'danger' : 'good')}
                ${line('Rôle', 'Contrôle de cohérence uniquement')}
            </div>
        `);
    }

    async function getTransmissionPreview() {
        const company = getCompany();
        const { year, month } = getSelectedPeriod();
        if (!company?.id) return null;
        return window.api.getAccountingExportPreviewV0456({ companyId: company.id, year, month, mode: 'transmission' });
    }

    async function getArchivePreview() {
        const company = getCompany();
        const { year, month } = getSelectedPeriod();
        if (!company?.id) return null;
        return window.api.getAccountingExportPreviewV0456({ companyId: company.id, year, month, mode: 'archive' });
    }

    function renderTransmission(preview, data) {
        const lots = data?.exports || {};
        const docs = preview?.documents || [];
        const statements = preview?.statements || [];
        setHtml('accountingTransmissionV047', `
            <div class="accounting-metrics-v047">
                ${metric('Documents à transmettre', docs.length)}
                ${metric('Relevés du mois', statements.length)}
                ${metric('Total TTC docs', money(preview?.totals?.totalTtc || 0))}
            </div>
            <div class="accounting-lines-v047">
                ${line('Lots de transmission année', lots.transmission_lots || 0)}
                ${line('Documents déjà exportés année', lots.documents_exported || 0)}
                ${line('Relevés déjà exportés année', lots.statements_exported || 0)}
            </div>
            <div class="accounting-actions-v047">
                <button id="createAccountingFromControlV047" type="button">Créer ZIP + marquer transmis</button>
                <button id="openExportsFromControlV047" class="secondary-button" type="button">Voir Exports</button>
            </div>
        `);
        document.getElementById('createAccountingFromControlV047')?.addEventListener('click', createTransmissionFromAccounting);
        document.getElementById('openExportsFromControlV047')?.addEventListener('click', () => showPage('exportsPage'));
    }

    function renderArchives(preview, data) {
        const { year, month } = getSelectedPeriod();
        const docs = preview?.documents || [];
        const statements = preview?.statements || [];
        setHtml('accountingArchivesV047', `
            <div class="accounting-metrics-v047">
                ${metric(`${MONTHS[month]} ${year}`, 'Archive')}
                ${metric('Documents classés', docs.length)}
                ${metric('Relevés bancaires', statements.length)}
            </div>
            <p class="muted">Archive = tous les documents du mois comptable, transmis ou non. Utile si la comptable redemande un mois complet.</p>
            <div class="accounting-actions-v047">
                <button id="createArchiveFromControlV047" type="button">Générer ZIP archive</button>
                <button id="openArchivesFromControlV047" class="secondary-button" type="button">Voir Exports</button>
            </div>
        `);
        document.getElementById('createArchiveFromControlV047')?.addEventListener('click', createArchiveFromAccounting);
        document.getElementById('openArchivesFromControlV047')?.addEventListener('click', () => showPage('exportsPage'));
    }

    function renderExecutive(data) {
        const payments = data?.payments || {};
        const tp = data?.thirdPartyPayments || {};
        setHtml('accountingExecutiveV048', `
            <div class="accounting-metrics-v047">
                ${metric('Trésorerie', money(data?.treasury || 0))}
                ${metric('Factures à payer', money(payments.unpaidTtc || 0), `${payments.unpaidCount || 0} facture(s)`)}
                ${metric('Tiers-payant reçu', money(tp.received || 0))}
            </div>
            <div class="accounting-lines-v047">
                ${line('Décaissements banque', money(data?.bank?.debits || 0))}
                ${line('Encaissements banque', money(data?.bank?.credits || 0))}
                ${line('Taux d’automatisation banque', percent(data?.bank?.automationRate || 0))}
            </div>
        `);
    }

    function renderAlerts(data, transmissionPreview, archivePreview) {
        const alerts = Array.isArray(data?.alerts) ? [...data.alerts] : [];
        const docsToTransmit = Number(transmissionPreview?.totals?.documentsCount || 0);
        const statementsToTransmit = Number(transmissionPreview?.totals?.statementsCount || 0);
        if (docsToTransmit) alerts.unshift({ level: 'warning', label: `${docsToTransmit} document(s) à transmettre au comptable` });
        if (statementsToTransmit) alerts.unshift({ level: 'warning', label: `${statementsToTransmit} relevé(s) bancaire(s) inclus dans l’export du mois` });
        if (Number(data?.payments?.unpaidCount || 0)) alerts.push({ level: 'danger', label: `${data.payments.unpaidCount} facture(s) non payée(s) ou non rapprochée(s)` });
        if (Number(data?.thirdPartyPayments?.to_check || 0)) alerts.push({ level: 'warning', label: `${money(data.thirdPartyPayments.to_check)} de tiers-payant à contrôler` });
        if (!alerts.length) {
            setHtml('accountingAlertsV047', blankState('Aucune alerte prioritaire sur la période sélectionnée.'));
            return;
        }
        setHtml('accountingAlertsV047', alerts.slice(0, 10).map(alert => `
            <article class="accounting-alert-v047 ${esc(alert.level || 'warning')}">
                <strong>${alert.level === 'danger' ? 'À corriger' : 'À vérifier'}</strong>
                <span>${esc(alert.label)}</span>
            </article>
        `).join(''));
    }

    async function renderLots() {
        const company = getCompany();
        const target = document.getElementById('accountingLotsV047');
        if (!target) return;
        if (!company?.id) { target.innerHTML = blankState('Sélectionne une société.'); return; }
        try {
            const rows = await window.api.getAccountingExportLotsV0456(company.id);
            if (!rows?.length) { target.innerHTML = blankState('Aucun lot généré pour cette société.'); return; }
            target.innerHTML = `
                <table class="compact-table-v0456 accounting-lots-table-v047">
                    <thead><tr><th>Date</th><th>Type</th><th>Période</th><th>Documents</th><th>Relevés</th><th>Total</th><th>Action</th></tr></thead>
                    <tbody>${rows.slice(0, 20).map(row => `
                        <tr>
                            <td>${esc(String(row.created_at || '').slice(0, 10))}</td>
                            <td>${row.export_type === 'archive' ? 'Archive' : 'Transmission'}</td>
                            <td>${esc((row.period_year || '') + '-' + (row.period_month || ''))}</td>
                            <td>${row.documents_count || 0}</td>
                            <td>${row.statements_count || 0}</td>
                            <td>${money(row.total_ttc || 0)}</td>
                            <td>${row.filepath ? `<button class="secondary-button small-button" data-open-lot-v047="${esc(row.filepath)}">Ouvrir</button>` : '—'}</td>
                        </tr>
                    `).join('')}</tbody>
                </table>
            `;
            target.querySelectorAll('[data-open-lot-v047]').forEach(btn => btn.addEventListener('click', () => window.api.openFile(btn.dataset.openLotV047)));
        } catch (error) {
            target.innerHTML = `<p class="error-text">${esc(error.message || error)}</p>`;
        }
    }

    async function createTransmissionFromAccounting() {
        const company = getCompany();
        const { year, month } = getSelectedPeriod();
        if (!company?.id) { toast('Sélectionne une société.', 'warning'); return; }
        try {
            const result = await window.api.createAccountingTransmissionExportV0456({ companyId: company.id, year, month });
            toast(`Export comptable créé : ${result.filename || 'ZIP'}`, 'success');
            if (result.filepath) await window.api.openFile(result.filepath);
            await refreshAccountingControlV047();
            if (typeof window.refreshAccountingExportsV0456 === 'function') window.refreshAccountingExportsV0456();
        } catch (error) { toast(error.message || 'Export impossible.', 'danger'); }
    }

    async function createArchiveFromAccounting() {
        const company = getCompany();
        const { year, month } = getSelectedPeriod();
        if (!company?.id) { toast('Sélectionne une société.', 'warning'); return; }
        try {
            const result = await window.api.createAccountingArchiveV0456({ companyId: company.id, year, month });
            toast(`Archive comptable créée : ${result.filename || 'ZIP'}`, 'success');
            if (result.filepath) await window.api.openFile(result.filepath);
            await refreshAccountingControlV047();
            if (typeof window.refreshAccountingExportsV0456 === 'function') window.refreshAccountingExportsV0456();
        } catch (error) { toast(error.message || 'Archive impossible.', 'danger'); }
    }

    async function refreshAccountingControlV047() {
        const company = getCompany();
        const { year, month } = getSelectedPeriod();
        setText('accountingControlCompanyV047', company?.name ? `${company.name} · ${year} · ${MONTHS[month]}` : 'Aucune société ouverte.');
        if (!company?.id) {
            ['accountingHealthV047','accountingDocumentsV047','accountingBankV047','accountingVatV047','accountingTransmissionV047','accountingArchivesV047','accountingExecutiveV048','accountingAlertsV047','accountingLotsV047','financeExecutiveSummaryV049','financeCashForecastV049','financeSuppliersV049','financeChargesV049','financeMutualsV049','financeAnomaliesV049']
                .forEach(id => setHtml(id, blankState('Sélectionne une société pour charger le contrôle comptable.')));
            return;
        }
        try {
            const [data, transmissionPreview, archivePreview, finance] = await Promise.all([
                loadExecutiveData(),
                getTransmissionPreview(),
                getArchivePreview(),
                loadFinancialIntelligenceV049()
            ]);
            renderHealth(data, transmissionPreview);
            renderDocuments(data);
            renderBank(data);
            renderVat(data);
            renderTransmission(transmissionPreview, data);
            renderArchives(archivePreview, data);
            renderExecutive(data);
            renderFinancialIntelligenceV049(finance);
            renderAlerts(data, transmissionPreview, archivePreview);
            await renderLots();
        } catch (error) {
            console.error('Comptabilité V0.47 impossible', error);
            setHtml('accountingAlertsV047', `<p class="error-text">${esc(error.message || error)}</p>`);
            toast('Chargement Comptabilité incomplet.', 'danger');
        }
    }

    function bind() {
        const year = document.getElementById('accountingControlYearV047');
        const month = document.getElementById('accountingControlMonthV047');
        if (year && !year.value) year.value = currentYear();
        if (month && !month.value) month.value = currentMonth();
        document.getElementById('refreshAccountingControlV047')?.addEventListener('click', refreshAccountingControlV047);
        document.getElementById('refreshAccountingLotsV047')?.addEventListener('click', renderLots);
        document.getElementById('goAccountingExportV047')?.addEventListener('click', () => showPage('exportsPage'));
        document.getElementById('previewAccountingFromControlV047')?.addEventListener('click', refreshAccountingControlV047);
        document.getElementById('previewArchiveFromControlV047')?.addEventListener('click', refreshAccountingControlV047);
        year?.addEventListener('change', refreshAccountingControlV047);
        month?.addEventListener('change', refreshAccountingControlV047);
        document.querySelectorAll('[data-accounting-open]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.accountingOpen)));
        document.querySelectorAll('.nav-button[data-page="accountingPage"], .nav-shortcut[data-page="accountingPage"]').forEach(btn => {
            btn.addEventListener('click', () => setTimeout(refreshAccountingControlV047, 50));
        });
        setTimeout(refreshAccountingControlV047, 300);
    }

    window.refreshAccountingControlV047 = refreshAccountingControlV047;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
})();
