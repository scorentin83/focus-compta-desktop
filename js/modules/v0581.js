(function () {
    'use strict';

    const ready = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn();
    const toast = (msg, type = 'success') => {
        if (typeof window.showToastV0409 === 'function') return window.showToastV0409(msg, type);
        if (typeof window.focusToastV041 === 'function') return window.focusToastV041(msg, type);
        console.log(`[Focus Compta] ${msg}`);
    };
    const safe = (value) => String(value || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');
    const pad2 = (n) => String(n || '').padStart(2, '0');

    function normalizeType(type) {
        const t = String(type || 'divers').toLowerCase().trim();
        if (t === 'invoice' || t === 'facture fournisseur') return 'facture';
        if (t.includes('client')) return 'facture_client';
        if (t.includes('avoir')) return 'avoir';
        if (t.includes('relev')) return 'releve';
        if (t.includes('contrat')) return 'contrat';
        if (t.includes('admin')) return 'administratif';
        if (t.includes('info')) return 'informatif';
        if (t === 'rib') return 'rib';
        if (t.includes('don')) return 'don';
        return t;
    }

    function typeCode(type) {
        const t = normalizeType(type);
        if (t === 'facture' || t === 'facture_client') return 'FAC';
        if (t === 'avoir') return 'AVOIR';
        if (t === 'releve') return 'RELEVE';
        if (t === 'contrat') return 'CONTRAT';
        if (t === 'administratif') return 'ADMIN';
        if (t === 'informatif') return 'INFO';
        if (t === 'rib') return 'RIB';
        if (t === 'don') return 'DON';
        return 'DOC';
    }

    function extractYearMonth(doc = {}) {
        const raw = [doc.invoice_date, doc.detected_date, doc.added_at, doc.filename].filter(Boolean).join(' ');
        const iso = raw.match(/(20\d{2})[-_/](0[1-9]|1[0-2])/);
        if (iso) return `${iso[1]}-${iso[2]}`;
        const fr = raw.match(/(?:^|\D)(0?[1-9]|1[0-2])[-_/](20\d{2})(?:\D|$)/);
        if (fr) return `${fr[2]}-${pad2(fr[1])}`;
        const y = (raw.match(/20\d{2}/) || [String(new Date().getFullYear())])[0];
        return `${y}-${pad2(new Date().getMonth() + 1)}`;
    }

    function smartFilename(doc = {}) {
        const ym = extractYearMonth(doc);
        const supplier = safe(doc.detected_supplier || doc.third_party_name || doc.supplier || doc.document_title || 'Document');
        const code = typeCode(doc.doc_type || doc.docType);
        const ref = safe(doc.invoice_number || doc.detected_reference || doc.document_title || '');
        const parts = [ym, supplier || 'Document', code];
        if (ref) parts.push(ref.slice(0, 60));
        return `${parts.join('_')}.pdf`;
    }

    window.focusBuildSmartDocumentFilenameV0581 = smartFilename;

    function addRenameAllButton() {
        const page = document.getElementById('receiptsPage');
        if (!page || document.getElementById('smartRenameAllV0581')) return;
        const target = page.querySelector('.documents-toolbar-v033, .section-title-row, .document-toolbar-v033') || page.querySelector('h1')?.parentElement || page;
        const btn = document.createElement('button');
        btn.id = 'smartRenameAllV0581';
        btn.type = 'button';
        btn.className = 'secondary-button smart-rename-all-v0581';
        btn.textContent = 'Renommer tous les documents';
        btn.title = 'Applique le format AAAA-MM_TIERS_TYPE_REFERENCE.pdf aux documents connus';
        btn.addEventListener('click', renameAllDocuments);
        target.appendChild(btn);
    }

    async function renameAllDocuments() {
        if (!window.api?.getDocuments || !window.api?.renameDocument) return toast('Renommage indisponible.', 'warning');
        const companyId = window.selectedCompany?.id || window.currentCompany?.id || null;
        const docs = await window.api.getDocuments({ companyId, filters: {} });
        let count = 0;
        for (const doc of docs || []) {
            const next = smartFilename(doc);
            if (next && next !== doc.filename) {
                await window.api.renameDocument({ documentId: doc.id, newFilename: next });
                count += 1;
            }
        }
        toast(`${count} document(s) renommé(s) intelligemment.`);
        if (typeof window.loadDocuments === 'function') await window.loadDocuments();
    }

    function fixCockpitAutoSwitch() {
        // Le refresh V0.58 pouvait recréer l'accueil régulièrement. Ici on bloque les doubles rendus visibles.
        document.body.classList.add('v0581-stable-cockpit');
        const hideDuplicate = () => {
            const oldAlerts = document.getElementById('v050AlertsList')?.closest('.cockpit-panel-v050, .clean-panel, .panel');
            if (oldAlerts) oldAlerts.style.display = 'none';
        };
        hideDuplicate();
        setTimeout(hideDuplicate, 500);
        setTimeout(hideDuplicate, 1500);
    }

    function init() {
        document.body.classList.add('v0581');
        addRenameAllButton();
        fixCockpitAutoSwitch();
        // V0.60.1 : pas de polling permanent.
    }

    ready(init);
})();
