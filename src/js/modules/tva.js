// Focus Compta V0.73.2 — Centre TVA réel dans Comptabilité
(function initVatCenterV073() {
    'use strict';

    const MONTHS = {
        '01':'Janvier','02':'Février','03':'Mars','04':'Avril','05':'Mai','06':'Juin',
        '07':'Juillet','08':'Août','09':'Septembre','10':'Octobre','11':'Novembre','12':'Décembre'
    };

    let lastVatDataV073 = null;

    function money(value) {
        return Number(value || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    }

    function esc(value) {
        return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
    }

    function getCompany() {
        try { if (typeof selectedCompany !== 'undefined' && selectedCompany) return selectedCompany; } catch (_) {}
        return window.selectedCompany || null;
    }

    function getYear() {
        return String(document.getElementById('accountingControlYearV047')?.value || new Date().getFullYear());
    }

    function setHtml(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    function tone(value) {
        const n = Math.abs(Number(value || 0));
        if (n <= 1) return 'good';
        if (n <= 1000) return 'warn';
        return 'danger';
    }

    function kpi(label, value, small = '', extraClass = '') {
        return `
            <article class="vat-kpi-v073 ${extraClass}">
                <span>${esc(label)}</span>
                <strong>${esc(value)}</strong>
                ${small ? `<small>${esc(small)}</small>` : ''}
            </article>
        `;
    }

    function renderKpis(data) {
        const totals = data?.totals || {};
        const balance = Number(totals.balance || 0);
        setHtml('vatKpisV073', `
            ${kpi('TVA collectée caisse', money(totals.collected || 0), 'TVA nette après remises')}
            ${kpi('TVA déductible fournisseurs', money(totals.deductible || 0), `${Number(totals.documents || 0)} document(s)`)}
            ${kpi(balance >= 0 ? 'TVA estimée à payer' : 'Crédit TVA estimé', money(Math.abs(balance)), data.year || '', balance >= 0 ? 'vat-due' : 'vat-credit')}
            ${kpi('TVA brute', money(totals.grossVat || 0), `Remises TVA : ${money(totals.discountVat || 0)}`)}
            ${kpi('Mois incomplets', Number(totals.missingVat || 0), 'Factures sans TVA détectée', Number(totals.missingVat || 0) ? 'vat-warning' : '')}
        `);
    }

    function renderChart(data) {
        const rows = data?.months || [];
        const max = Math.max(...rows.map(row => Math.max(Number(row.collected || 0), Number(row.deductible || 0), Math.abs(Number(row.balance || 0)))), 1);
        const visibleRows = rows.filter(row => row.cashSheets || row.documents || row.collected || row.deductible);
        const finalRows = visibleRows.length ? visibleRows : rows.slice(0, 12);
        setHtml('vatChartV073', `
            <div class="vat-chart-legend-v073">
                <span><i class="collected"></i>TVA collectée</span>
                <span><i class="deductible"></i>TVA déductible</span>
                <span><i class="balance"></i>Solde</span>
            </div>
            <div class="vat-chart-bars-v073">
                ${finalRows.map(row => {
                    const collected = Math.max(2, Math.round((Number(row.collected || 0) / max) * 100));
                    const deductible = Math.max(2, Math.round((Number(row.deductible || 0) / max) * 100));
                    const balance = Math.max(2, Math.round((Math.abs(Number(row.balance || 0)) / max) * 100));
                    return `
                        <div class="vat-month-bar-v073" title="${esc(row.label)} · Collectée ${money(row.collected)} · Déductible ${money(row.deductible)}">
                            <span>${esc(String(row.label || '').slice(0, 3))}</span>
                            <div><b class="collected" style="height:${collected}%"></b><b class="deductible" style="height:${deductible}%"></b><b class="balance" style="height:${balance}%"></b></div>
                        </div>
                    `;
                }).join('')}
            </div>
        `);
    }

    function renderTable(data) {
        const rows = data?.months || [];
        setHtml('vatTableV073', `
            <table class="vat-table-v073">
                <thead>
                    <tr>
                        <th>Mois</th>
                        <th>TVA collectée</th>
                        <th>TVA déductible</th>
                        <th>Solde estimé</th>
                        <th>Sources</th>
                        <th>État</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr class="vat-row-${esc(row.status || 'empty')}">
                            <td><strong>${esc(row.label || MONTHS[row.month] || row.month)}</strong><small>${esc(data.year || '')}</small></td>
                            <td title="TVA brute ${money(row.grossVat)} · TVA remises ${money(row.discountVat)}">${money(row.collected)}</td>
                            <td>${money(row.deductible)}</td>
                            <td><span class="vat-pill-v073 ${tone(row.balance)}">${money(row.balance)}</span></td>
                            <td><small>${Number(row.cashSheets || 0)} caisse(s) · ${Number(row.documents || 0)} doc(s)</small></td>
                            <td>${row.status === 'warning' ? '<span class="vat-state warn">À vérifier</span>' : row.status === 'ok' ? '<span class="vat-state good">OK</span>' : '<span class="vat-state muted">—</span>'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `);
    }

    async function refreshVatCenterV073() {
        const company = getCompany();
        const year = getYear();
        if (!company?.id) {
            setHtml('vatKpisV073', '<p class="muted">Sélectionne une société pour charger la TVA.</p>');
            setHtml('vatChartV073', '');
            setHtml('vatTableV073', '<p class="muted">Aucune société ouverte.</p>');
            return;
        }
        try {
            const data = await window.api.getVatCenterV073({ companyId: company.id, year });
            lastVatDataV073 = data;
            renderKpis(data);
            renderChart(data);
            renderTable(data);
        } catch (error) {
            console.error('Centre TVA indisponible', error);
            setHtml('vatTableV073', `<p class="error-text">${esc(error.message || error)}</p>`);
        }
    }

    function exportCsvV073() {
        const data = lastVatDataV073;
        if (!data) { refreshVatCenterV073(); return; }
        const sep = ';';
        const lines = [
            ['Mois','TVA collectée','TVA déductible','Solde estimé','TVA brute','TVA remises','Feuilles caisse','Documents','TVA manquante'].join(sep),
            ...(data.months || []).map(row => [
                `${row.label} ${data.year}`,
                Number(row.collected || 0).toFixed(2).replace('.', ','),
                Number(row.deductible || 0).toFixed(2).replace('.', ','),
                Number(row.balance || 0).toFixed(2).replace('.', ','),
                Number(row.grossVat || 0).toFixed(2).replace('.', ','),
                Number(row.discountVat || 0).toFixed(2).replace('.', ','),
                row.cashSheets || 0,
                row.documents || 0,
                row.missingVat || 0
            ].join(sep))
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `focus-compta-tva-${data.year || getYear()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function bindVatCenterV073() {
        document.getElementById('refreshVatCenterV073')?.addEventListener('click', refreshVatCenterV073);
        document.getElementById('exportVatCsvV073')?.addEventListener('click', exportCsvV073);
        document.getElementById('scrollToVatCenterV073')?.addEventListener('click', () => {
            document.getElementById('vatCenterV073')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        document.getElementById('accountingControlYearV047')?.addEventListener('change', () => setTimeout(refreshVatCenterV073, 80));
        document.querySelectorAll('.nav-button[data-page="accountingPage"], .nav-shortcut[data-page="accountingPage"]').forEach(btn => {
            btn.addEventListener('click', () => setTimeout(refreshVatCenterV073, 200));
        });
        setTimeout(refreshVatCenterV073, 500);
    }

    window.refreshVatCenterV073 = refreshVatCenterV073;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindVatCenterV073);
    else bindVatCenterV073();
})();
