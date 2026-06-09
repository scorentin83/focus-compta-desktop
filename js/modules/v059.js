(function () {
    'use strict';

    const ready = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn();
    const esc = (value) => String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const toast = (msg, type = 'success') => {
        if (typeof window.showToastV0409 === 'function') return window.showToastV0409(msg, type);
        if (typeof window.focusToastV041 === 'function') return window.focusToastV041(msg, type);
        console.log(`[Focus Compta] ${msg}`);
    };

    function normalizePart(value, fallback = '') {
        return String(value || fallback || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .replace(/_+/g, '_');
    }
    function pad2(n) { return String(n || '').padStart(2, '0'); }
    function parseYearMonth(...values) {
        const raw = values.filter(Boolean).map(v => String(v)).join(' ');
        let m = raw.match(/(20\d{2})[-_/](0[1-9]|1[0-2])/);
        if (m) return `${m[1]}-${m[2]}`;
        m = raw.match(/(?:^|\D)(0?[1-9]|[12]\d|3[01])[\/-](0?[1-9]|1[0-2])[\/-](20\d{2})(?:\D|$)/);
        if (m) return `${m[3]}-${pad2(m[2])}`;
        m = raw.match(/(?:^|\D)(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])[\/-](20\d{2})(?:\D|$)/);
        if (m) return `${m[3]}-${pad2(m[1])}`;
        m = raw.match(/(20\d{2})/);
        return `${m ? m[1] : new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`;
    }
    function typeCode(type) {
        const t = String(type || 'facture').toLowerCase();
        if (t.includes('avoir')) return 'AVOIR';
        if (t.includes('relev')) return 'RELEVE';
        if (t.includes('contrat')) return 'CONTRAT';
        if (t.includes('admin')) return 'ADMIN';
        if (t.includes('info')) return 'INFO';
        if (t.includes('rib')) return 'RIB';
        if (t.includes('don')) return 'DON';
        if (t.includes('client')) return 'FAC_CLIENT';
        return 'FAC';
    }
    function smartNameV059(doc = {}, data = {}) {
        const ym = parseYearMonth(data.invoiceDate, data.detectedDate, doc.invoice_date, doc.detected_date, doc.filename, doc.added_at);
        const supplier = normalizePart(data.supplier || data.detectedSupplier || doc.detected_supplier || doc.third_party_name || doc.supplier || doc.document_title || '', 'Document');
        const code = typeCode(data.docType || doc.doc_type || doc.docType);
        const ref = normalizePart(data.invoiceNumber || data.detectedReference || doc.invoice_number || doc.detected_reference || '');
        const title = normalizePart(data.documentTitle || doc.document_title || '');
        const parts = [ym, supplier, code];
        if (ref) parts.push(ref.slice(0, 60));
        else if (title && !['FAC','AVOIR'].includes(code)) parts.push(title.slice(0, 50));
        return `${parts.filter(Boolean).join('_')}.pdf`;
    }
    window.focusBuildSmartDocumentFilenameV059 = smartNameV059;
    try { window.buildSmartDocumentFilenameV0581 = smartNameV059; } catch (_) {}

    function ensureMatchingNav() {
        const nav = document.querySelector('.main-nav');
        if (!nav || nav.querySelector('[data-page="matchingPage"]')) return;
        const bank = nav.querySelector('[data-page="bankPage"]');
        const btn = document.createElement('button');
        btn.className = 'nav-button';
        btn.dataset.page = 'matchingPage';
        btn.innerHTML = '🔗 Rapprochements';
        if (bank && bank.nextSibling) nav.insertBefore(btn, bank.nextSibling);
        else nav.appendChild(btn);
        btn.addEventListener('click', () => typeof window.showPage === 'function' && window.showPage('matchingPage'));
    }

    function fixHomeLinks() {
        const map = [
            [/opération|rapprocher|justificatif/i, 'matchingPage', 'Opérations à rapprocher'],
            [/relev/i, 'bankPage', 'Relevés avec écart'],
            [/tiers|doublon|anomal/i, 'thirdPartiesPage', 'Doublons tiers à vérifier'],
            [/document/i, 'receiptsPage', 'Documents à transmettre']
        ];
        document.querySelectorAll('#v055ActionNowBox [data-page], .action-now-v058 [data-page], .action-line-v058').forEach(btn => {
            const txt = btn.textContent || '';
            for (const [rx, page, label] of map) {
                if (rx.test(txt)) {
                    btn.dataset.page = page;
                    const first = btn.querySelector('span');
                    if (first && !/Ouvrir/.test(first.textContent || '')) first.innerHTML = `${first.textContent.split(' ').slice(0,1).join(' ')} ${label}`;
                    break;
                }
            }
        });
        const sub = document.getElementById('v050GlobalStatusSubtitle');
        if (sub) sub.textContent = sub.textContent.replace(/Anomalies détectées/gi, 'Doublons tiers à vérifier').replace(/Opérations bancaires sans justificatif/gi, 'Opérations à rapprocher');
    }

    function patchRenameAllButton() {
        const old = document.getElementById('smartRenameAllV0581');
        if (old && old.dataset.v059Bound !== '1') {
            const clone = old.cloneNode(true);
            clone.dataset.v059Bound = '1';
            clone.textContent = 'Renommer tous les documents';
            old.replaceWith(clone);
            clone.addEventListener('click', async () => {
                if (!window.api?.getDocuments || !window.api?.renameDocument) return toast('Renommage indisponible.', 'warning');
                const companyId = window.selectedCompany?.id || window.currentCompany?.id || null;
                const docs = await window.api.getDocuments({ companyId, filters: {} });
                let renamed = 0;
                for (const doc of docs || []) {
                    const next = smartNameV059(doc);
                    if (next && next !== doc.filename) {
                        await window.api.renameDocument({ documentId: doc.id, newFilename: next });
                        renamed += 1;
                    }
                }
                toast(`${renamed} document(s) renommé(s) au format AAAA-MM_TIERS_TYPE_REFERENCE.pdf.`);
                if (typeof window.loadDocuments === 'function') await window.loadDocuments();
            });
        }
    }

    function patchDocumentsTable() {
        const table = document.querySelector('.documents-table-v033, .documents-table-v0372');
        if (!table || table.dataset.v059Patched === '1') return;
        table.dataset.v059Patched = '1';
        table.querySelectorAll('tbody tr').forEach(row => {
            row.addEventListener('click', () => {
                const id = row.dataset.documentId;
                document.body.dataset.focusSelectedDocumentId = id || '';
            }, true);
        });
    }

    function stabilizeDocumentSelection() {
        // Empêche le panneau droit d'afficher un ancien document après un refresh partiel.
        const activeId = document.body.dataset.focusSelectedDocumentId;
        if (!activeId) return;
        const rows = document.querySelectorAll('.document-row-v033');
        rows.forEach(row => row.classList.toggle('selected', String(row.dataset.documentId) === String(activeId)));
    }

    function markMatchingAsDedicated() {
        const page = document.getElementById('matchingPage');
        if (!page) return;
        page.classList.add('matching-page-v059');
        const title = page.querySelector('h1');
        if (title) title.textContent = 'Rapprochements justificatifs';
        const intro = page.querySelector('.topbar p');
        if (intro) intro.textContent = 'Retrouve les opérations à rapprocher, les justificatifs disponibles et les suggestions automatiques.';
    }

    function patchDocumentTypeChangeWarning() {
        document.addEventListener('change', event => {
            const select = event.target?.closest?.('#documentEditorV0454 [name="docType"]');
            if (!select) return;
            const invoiceFields = ['facture', 'facture_client', 'avoir'];
            if (!invoiceFields.includes(String(select.value || '').toLowerCase())) {
                toast('Type modifié : les champs facture incompatibles seront supprimés à l’enregistrement.', 'info');
            }
            setTimeout(() => {
                const preview = document.querySelector('.smart-name-preview-v0581');
                const form = document.getElementById('documentEditorV0454');
                if (preview && form) {
                    const get = name => form.querySelector(`[name="${name}"]`)?.value || '';
                    preview.textContent = `Nom proposé : ${smartNameV059({}, { docType: get('docType'), supplier: get('supplier'), invoiceDate: get('invoiceDate'), invoiceNumber: get('invoiceNumber'), documentTitle: get('documentTitle') })}`;
                }
            }, 50);
        }, true);
    }

    function init() {
        document.body.classList.add('v059');
        ensureMatchingNav();
        markMatchingAsDedicated();
        patchDocumentTypeChangeWarning();
        patchRenameAllButton();
        fixHomeLinks();
        patchDocumentsTable();
        stabilizeDocumentSelection();
        // V0.60.1 : pas d'auto-refresh permanent sur l'accueil ni les rapprochements.
    }

    ready(init);
})();

// Focus Compta V0.59.1 — Correctif route Rapprochements
(function initFocusComptaV0591RapprochementsRoute() {
    'use strict';

    function setActivePageV0591(pageId) {
        const target = pageId || 'homePage';
        document.querySelectorAll('.page-section').forEach(section => {
            section.classList.toggle('active-page', section.id === target);
        });
        document.querySelectorAll('.nav-button').forEach(button => {
            button.classList.toggle('active', button.dataset.page === target);
        });
        try { document.body.dataset.focusActivePage = target; } catch (_) {}
    }

    async function runPageLoaderV0591(pageId) {
        try {
            if (pageId === 'receiptsPage' && typeof window.loadDocuments === 'function') await window.loadDocuments();
            if (pageId === 'matchingPage' && typeof window.loadMatchingPage === 'function') await window.loadMatchingPage();
            if (pageId === 'thirdPartiesPage' && typeof window.loadThirdParties === 'function') await window.loadThirdParties();
            if (pageId === 'settingsPage') {
                if (typeof window.loadCategoryOptions === 'function') await window.loadCategoryOptions();
                if (typeof window.loadAutomationRulesV031 === 'function') await window.loadAutomationRulesV031();
            }
        } catch (error) {
            console.error('Chargement page V0.59.1 impossible', pageId, error);
            if (typeof window.focusToastV041 === 'function') {
                window.focusToastV041(`Chargement ${pageId} incomplet : ${error.message || error}`, 'warning');
            }
        }
    }

    function focusShowPageV0591(pageId) {
        const target = pageId || 'homePage';
        setActivePageV0591(target);
        runPageLoaderV0591(target);
        return target;
    }

    function installShowPageV0591() {
        try {
            window.showPage = focusShowPageV0591;
            // Dans les scripts non-module, `showPage` est une variable globale : on la réassigne aussi.
            // eslint-disable-next-line no-global-assign
            showPage = focusShowPageV0591;
        } catch (_) {
            window.showPage = focusShowPageV0591;
        }
    }

    function bindMatchingNavigationV0591() {
        document.querySelectorAll('[data-page="matchingPage"]').forEach(button => {
            if (button.dataset.v0591MatchingBound === '1') return;
            button.dataset.v0591MatchingBound = '1';
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
                focusShowPageV0591('matchingPage');
            }, true);
        });
    }

    function improveMatchingEmptyStateV0591() {
        const page = document.getElementById('matchingPage');
        if (!page) return;
        const title = page.querySelector('h1');
        if (title) title.textContent = 'Rapprochements justificatifs';
        const intro = page.querySelector('.topbar p');
        if (intro) intro.textContent = 'Vue dédiée pour traiter les opérations à rapprocher, les justificatifs disponibles et les suggestions automatiques.';
    }

    function init() {
        installShowPageV0591();
        bindMatchingNavigationV0591();
        improveMatchingEmptyStateV0591();
        // V0.60.1 : suppression du polling qui réinstallait showPage toutes les secondes
        // et provoquait un mélange visuel entre deux états de navigation.
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
