// Focus Compta V0.45.6 - Exports comptables, archives et rapprochements partiels
(function initAccountingExportsV0456() {
    function padMonth(value) { return String(value || '').padStart(2, '0'); }
    function currentYear() { return String(new Date().getFullYear()); }
    function currentMonth() { return String(new Date().getMonth() + 1).padStart(2, '0'); }
    function money(value) {
        const n = Number(value || 0);
        return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    }
    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
    }
    function toast(message, type = 'success') {
        if (typeof focusToastV041 === 'function') focusToastV041(message, type);
        else console.log(message);
    }
    function getCompanyId() {
        return window.selectedCompany?.id || (typeof selectedCompany !== 'undefined' && selectedCompany ? selectedCompany.id : null);
    }
    function setDefaultPeriodsV0456() {
        const year = document.getElementById('accountingExportYearV0456');
        const month = document.getElementById('accountingExportMonthV0456');
        const archiveYear = document.getElementById('accountingArchiveYearV0456');
        const archiveMonth = document.getElementById('accountingArchiveMonthV0456');
        if (year && !year.value) year.value = currentYear();
        if (month && !month.value) month.value = currentMonth();
        if (archiveYear && !archiveYear.value) archiveYear.value = currentYear();
        if (archiveMonth && !archiveMonth.value) archiveMonth.value = currentMonth();
    }
    function renderPreviewV0456(targetId, preview, mode) {
        const target = document.getElementById(targetId);
        if (!target) return;
        const docs = preview?.documents || [];
        const statements = preview?.statements || [];
        const total = preview?.totals?.totalTtc || 0;
        target.innerHTML = `
            <div class="export-preview-summary-v0456">
                <article><span>Documents</span><strong>${docs.length}</strong></article>
                <article><span>Relevés bancaires</span><strong>${statements.length}</strong></article>
                <article><span>Total TTC documents</span><strong>${money(total)}</strong></article>
            </div>
            <div class="export-preview-grid-v0456">
                <section>
                    <h4>${mode === 'archive' ? 'Documents du mois demandé' : 'Documents comptables non transmis'}</h4>
                    ${docs.length ? `<table class="compact-table-v0456"><thead><tr><th>Période</th><th>Document</th><th>Fournisseur</th><th>TTC</th><th>Transmission</th></tr></thead><tbody>${docs.slice(0, 80).map(doc => `<tr><td>${escapeHtml((doc.period?.year || '') + '-' + (doc.period?.month || ''))}</td><td>${escapeHtml(doc.filename)}</td><td>${escapeHtml(doc.supplier || '')}</td><td>${money(doc.amountTtc)}</td><td>${escapeHtml(doc.transmissionStatus || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun document.</p>'}
                </section>
                <section>
                    <h4>Relevés bancaires de la période</h4>
                    ${statements.length ? `<table class="compact-table-v0456"><thead><tr><th>Période</th><th>Relevé</th><th>Compte</th><th>Transmission</th></tr></thead><tbody>${statements.map(st => `<tr><td>${escapeHtml(st.period || '')}</td><td>${escapeHtml(st.filename)}</td><td>${escapeHtml([st.bankName, st.accountName].filter(Boolean).join(' '))}</td><td>${escapeHtml(st.transmissionStatus || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun relevé pour cette période.</p>'}
                </section>
            </div>`;
    }
    async function refreshTransmissionPreviewV0456() {
        const companyId = getCompanyId();
        const target = document.getElementById('accountingExportPreviewV0456');
        if (!companyId) { if (target) target.innerHTML = '<p class="muted">Sélectionne une société.</p>'; return; }
        const year = document.getElementById('accountingExportYearV0456')?.value || currentYear();
        const month = padMonth(document.getElementById('accountingExportMonthV0456')?.value || currentMonth());
        try {
            const preview = await window.api.getAccountingExportPreviewV0456({ companyId, year, month, mode: 'transmission' });
            renderPreviewV0456('accountingExportPreviewV0456', preview, 'transmission');
        } catch (error) {
            if (target) target.innerHTML = `<p class="error-text">${escapeHtml(error.message || error)}</p>`;
        }
    }
    async function refreshArchivePreviewV0456() {
        const companyId = getCompanyId();
        const target = document.getElementById('accountingArchivePreviewV0456');
        if (!companyId) { if (target) target.innerHTML = '<p class="muted">Sélectionne une société.</p>'; return; }
        const year = document.getElementById('accountingArchiveYearV0456')?.value || currentYear();
        const month = padMonth(document.getElementById('accountingArchiveMonthV0456')?.value || currentMonth());
        try {
            const preview = await window.api.getAccountingExportPreviewV0456({ companyId, year, month, mode: 'archive' });
            renderPreviewV0456('accountingArchivePreviewV0456', preview, 'archive');
        } catch (error) {
            if (target) target.innerHTML = `<p class="error-text">${escapeHtml(error.message || error)}</p>`;
        }
    }
    async function createTransmissionExportV0456() {
        const companyId = getCompanyId();
        if (!companyId) return toast('Sélectionne une société.', 'warning');
        const year = document.getElementById('accountingExportYearV0456')?.value || currentYear();
        const month = padMonth(document.getElementById('accountingExportMonthV0456')?.value || currentMonth());
        try {
            const result = await window.api.createAccountingTransmissionExportV0456({ companyId, year, month });
            toast(`Export comptable généré : ${result.documentsCount} document(s), ${result.statementsCount} relevé(s).`, 'success');
            if (result.filepath && window.api.openFile) window.api.openFile(result.filepath);
            await refreshTransmissionPreviewV0456();
            await refreshExportLotsV0456();
        } catch (error) { toast(error.message || 'Export impossible.', 'danger'); }
    }
    async function createArchiveExportV0456() {
        const companyId = getCompanyId();
        if (!companyId) return toast('Sélectionne une société.', 'warning');
        const year = document.getElementById('accountingArchiveYearV0456')?.value || currentYear();
        const month = padMonth(document.getElementById('accountingArchiveMonthV0456')?.value || currentMonth());
        try {
            const result = await window.api.createAccountingArchiveV0456({ companyId, year, month });
            toast(`Archive générée : ${result.documentsCount} document(s), ${result.statementsCount} relevé(s).`, 'success');
            if (result.filepath && window.api.openFile) window.api.openFile(result.filepath);
            await refreshArchivePreviewV0456();
            await refreshExportLotsV0456();
        } catch (error) { toast(error.message || 'Archive impossible.', 'danger'); }
    }
    async function refreshExportLotsV0456() {
        const target = document.getElementById('accountingExportLotsV0456');
        if (!target) return;
        const companyId = getCompanyId();
        try {
            const rows = await window.api.getAccountingExportLotsV0456(companyId || null);
            target.innerHTML = rows?.length ? `<table class="compact-table-v0456"><thead><tr><th>Date</th><th>Type</th><th>Période</th><th>Documents</th><th>Relevés</th><th>Fichier</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHtml(String(row.created_at || '').slice(0, 19))}</td><td>${row.export_type === 'archive' ? 'Archive' : 'Transmission'}</td><td>${escapeHtml((row.period_year || '') + '-' + (row.period_month || ''))}</td><td>${row.documents_count || 0}</td><td>${row.statements_count || 0}</td><td><button class="secondary-button small-button" data-open-export-v0456="${escapeHtml(row.filepath || '')}">Ouvrir</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun lot généré.</p>';
            target.querySelectorAll('[data-open-export-v0456]').forEach(btn => btn.addEventListener('click', () => window.api.openFile(btn.dataset.openExportV0456)));
        } catch (error) { target.innerHTML = `<p class="error-text">${escapeHtml(error.message || error)}</p>`; }
    }
    function bindAccountingExportsV0456() {
        setDefaultPeriodsV0456();
        document.getElementById('previewAccountingExportV0456')?.addEventListener('click', refreshTransmissionPreviewV0456);
        document.getElementById('createAccountingExportV0456')?.addEventListener('click', createTransmissionExportV0456);
        document.getElementById('previewAccountingArchiveV0456')?.addEventListener('click', refreshArchivePreviewV0456);
        document.getElementById('createAccountingArchiveV0456')?.addEventListener('click', createArchiveExportV0456);
        ['accountingExportYearV0456','accountingExportMonthV0456'].forEach(id => document.getElementById(id)?.addEventListener('change', refreshTransmissionPreviewV0456));
        ['accountingArchiveYearV0456','accountingArchiveMonthV0456'].forEach(id => document.getElementById(id)?.addEventListener('change', refreshArchivePreviewV0456));
        refreshTransmissionPreviewV0456();
        refreshArchivePreviewV0456();
        refreshExportLotsV0456();
    }
    window.refreshAccountingExportsV0456 = function() { refreshTransmissionPreviewV0456(); refreshArchivePreviewV0456(); refreshExportLotsV0456(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindAccountingExportsV0456, { once: true });
    else bindAccountingExportsV0456();
})();
