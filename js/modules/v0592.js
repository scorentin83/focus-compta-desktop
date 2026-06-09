// Focus Compta V0.59.2 — Documents simplifiés + rapprochements fiables
(function initFocusComptaV0592() {
    'use strict';

    const ready = fn => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn();
    const toast = (msg, type = 'success') => {
        if (typeof window.focusToastV041 === 'function') return window.focusToastV041(msg, type);
        if (typeof window.showToastV0409 === 'function') return window.showToastV0409(msg, type);
        console.log(`[Focus Compta V0.59.2] ${msg}`);
    };
    const escapeHtml = value => String(value ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const amount = value => typeof window.formatAmount === 'function' ? window.formatAmount(value) : `${Number(value || 0).toFixed(2)} €`;
    const pad2 = value => String(value || '').padStart(2, '0');

    function normalizePart(value, fallback = '') {
        return String(value || fallback || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .replace(/_+/g, '_');
    }

    function normalizeDocType(type) {
        const t = String(type || 'facture').toLowerCase().trim();
        if (['facture fournisseur', 'invoice', 'supplier_invoice'].includes(t)) return 'facture';
        if (t.includes('client')) return 'facture_client';
        if (t.includes('avoir')) return 'avoir';
        if (t.includes('relev')) return 'releve';
        if (t.includes('contrat') || t.includes('pret')) return 'contrat';
        if (t.includes('admin')) return 'administratif';
        if (t.includes('info')) return 'informatif';
        if (t === 'rib' || t.includes('iban')) return 'rib';
        if (t.includes('don')) return 'don';
        return t || 'divers';
    }

    function isAccountingDocument(type) {
        return ['facture', 'facture_client', 'avoir'].includes(normalizeDocType(type));
    }

    function isToMatchStatus(status) {
        const s = String(status || 'unmatched').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return ['unmatched', 'a_rapprocher', 'a rapprocher', 'to_match', 'pending'].includes(s);
    }

    function typeLabel(type) {
        const t = normalizeDocType(type);
        const labels = {
            facture: 'Facture fournisseur',
            facture_client: 'Facture client',
            avoir: 'Avoir',
            releve: 'Relevé bancaire',
            contrat: 'Contrat',
            administratif: 'Administratif',
            informatif: 'Informatif',
            rib: 'RIB',
            don: 'Don',
            divers: 'Divers'
        };
        return labels[t] || 'Document';
    }

    function typeCode(type) {
        const t = normalizeDocType(type);
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

    function parseYearMonthFromCandidates(...candidates) {
        const raw = candidates.filter(Boolean).map(String).join(' ');
        let m = raw.match(/(20\d{2})[-_/](0?[1-9]|1[0-2])[-_/](0?[1-9]|[12]\d|3[01])?/);
        if (m) return `${m[1]}-${pad2(m[2])}`;
        m = raw.match(/(?:^|\D)(0?[1-9]|[12]\d|3[01])[\/-](0?[1-9]|1[0-2])[\/-](20\d{2})(?:\D|$)/);
        if (m) return `${m[3]}-${pad2(m[2])}`;
        m = raw.match(/(?:^|\D)(0?[1-9]|1[0-2])[\/-](20\d{2})(?:\D|$)/);
        if (m) return `${m[2]}-${pad2(m[1])}`;
        m = raw.match(/(?:^|\D)(20\d{2})[\/-](0?[1-9]|1[0-2])(?:\D|$)/);
        if (m) return `${m[1]}-${pad2(m[2])}`;
        m = raw.match(/(20\d{2})/);
        return `${m ? m[1] : new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`;
    }

    function buildSmartFilenameV0592(data = {}, doc = {}) {
        const ym = parseYearMonthFromCandidates(
            data.invoiceDate,
            data.detectedDate,
            data.documentDate,
            doc.invoice_date,
            doc.detected_date,
            doc.document_date,
            doc.ocr_text,
            doc.filename
        );
        const supplier = normalizePart(
            data.supplier || data.detectedSupplier || doc.detected_supplier || doc.third_party_name || doc.supplier || doc.document_title,
            'Document'
        );
        const code = typeCode(data.docType || data.doc_type || doc.doc_type || doc.docType);
        const ref = normalizePart(data.invoiceNumber || data.detectedReference || doc.invoice_number || doc.detected_reference || '');
        const title = normalizePart(data.documentTitle || data.title || doc.document_title || '');
        const parts = [ym, supplier, code];
        if (ref) parts.push(ref.slice(0, 70));
        else if (title) parts.push(title.slice(0, 55));
        return `${parts.filter(Boolean).join('_')}.pdf`;
    }

    // Remplace toutes les variantes précédentes de génération de nom.
    window.focusBuildSmartDocumentFilenameV0592 = buildSmartFilenameV0592;
    window.focusBuildSmartDocumentFilenameV059 = buildSmartFilenameV0592;
    window.focusBuildSmartDocumentFilenameV0581 = buildSmartFilenameV0592;
    window.buildSmartDocumentFilenameV0581 = buildSmartFilenameV0592;


    function getSelectedCompanyV0592() {
        try { if (typeof selectedCompany !== 'undefined' && selectedCompany) return selectedCompany; } catch (_) {}
        return window.selectedCompany || window.currentCompany || null;
    }
    function getSelectedBankAccountV0592() {
        try { if (typeof selectedBankAccount !== 'undefined' && selectedBankAccount) return selectedBankAccount; } catch (_) {}
        return window.selectedBankAccount || null;
    }

    function ignoredMatchKey(docId, transactionId) {
        return `focus-compta:ignored-match:${docId}:${transactionId}`;
    }
    function isIgnoredMatch(docId, transactionId) {
        try { return localStorage.getItem(ignoredMatchKey(docId, transactionId)) === '1'; } catch (_) { return false; }
    }
    function ignoreMatch(docId, transactionId, payload = {}) {
        try { localStorage.setItem(ignoredMatchKey(docId, transactionId), '1'); } catch (_) {}
        try {
            window.api?.saveUserLearningEvent?.({
                companyId: getSelectedCompanyV0592()?.id || null,
                eventType: 'ignored_match',
                entityType: 'document_transaction',
                entityId: `${docId}:${transactionId}`,
                sourceValue: payload.documentName || '',
                targetValue: payload.transactionLabel || '',
                payload
            });
        } catch (_) {}
    }

    async function getAccountingDocsToMatch() {
        if (!window.api?.getDocuments) return [];
        const companyId = getSelectedCompanyV0592()?.id || null;
        let docs = [];
        try {
            docs = await window.api.getDocuments({ companyId, filters: { status: 'unmatched' } });
        } catch (_) {
            docs = [];
        }
        if (!Array.isArray(docs) || !docs.length) {
            docs = await window.api.getDocuments({ companyId, filters: {} });
        }
        return (docs || []).filter(doc => isAccountingDocument(doc.doc_type) && isToMatchStatus(doc.status));
    }

    window.loadMatchingPage = async function loadMatchingPageV0592() {
        const list = document.getElementById('matchingDocumentList');
        const suggestions = document.getElementById('matchingSuggestionList');
        const preview = document.getElementById('matchingPreview');
        const help = document.getElementById('matchingHelp');
        if (!list) return;

        list.innerHTML = '<div class="empty-state">Chargement des factures et avoirs à rapprocher…</div>';
        if (suggestions) suggestions.innerHTML = '';
        if (preview) preview.innerHTML = 'Aucun document sélectionné.';
        if (help) help.textContent = 'Seules les factures et avoirs au statut “À rapprocher” sont proposés ici.';

        const docs = await getAccountingDocsToMatch();
        window.__focusMatchingDocsV040 = docs;
        list.innerHTML = '';

        if (!docs.length) {
            list.innerHTML = '<div class="empty-state">Aucune facture ni aucun avoir à rapprocher.</div>';
            return;
        }

        docs.forEach(doc => {
            const item = document.createElement('article');
            item.className = 'document-card matching-doc-v030 matching-doc-v0592';
            item.dataset.documentId = doc.id;
            item.innerHTML = `
                <strong title="${escapeHtml(doc.filename)}">${escapeHtml(doc.filename)}</strong>
                <span>${escapeHtml(typeLabel(doc.doc_type))} · À rapprocher</span>
                <span>${doc.detected_amount || doc.amount_ttc ? amount(doc.detected_amount || doc.amount_ttc) : 'Montant non détecté'}</span>
                ${doc.detected_supplier || doc.third_party_name ? `<small>${escapeHtml(doc.detected_supplier || doc.third_party_name)}</small>` : ''}
            `;
            item.addEventListener('click', async () => {
                document.querySelectorAll('.matching-doc-v030').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                await window.showMatchingSuggestions(doc);
            });
            list.appendChild(item);
        });
    };

    function renderPreview(doc) {
        const safePath = String(doc.filepath || '').replace(/\\/g, '/');
        const lower = String(doc.filename || '').toLowerCase();
        let content = '<div class="matching-doc-preview-placeholder-v0396">Aperçu indisponible.</div>';
        if (lower.endsWith('.pdf') && safePath) content = `<iframe class="matching-doc-preview-frame-v0396" src="file:///${safePath}"></iframe>`;
        if (/\.(png|jpe?g|webp)$/i.test(lower) && safePath) content = `<img class="matching-doc-preview-image-v0396" src="file:///${safePath}" alt="${escapeHtml(doc.filename)}">`;
        return `
            <div class="matching-doc-info-v0396">
                <strong>${escapeHtml(doc.filename)}</strong>
                <p>${escapeHtml(typeLabel(doc.doc_type))}</p>
                <p>Montant : ${doc.detected_amount || doc.amount_ttc ? amount(doc.detected_amount || doc.amount_ttc) : 'Non détecté'}</p>
                <p>Date : ${escapeHtml(doc.invoice_date || doc.detected_date || 'Non détectée')}</p>
                <p>Référence : ${escapeHtml(doc.invoice_number || doc.detected_reference || 'Non détectée')}</p>
                <p>Tiers : ${escapeHtml(doc.detected_supplier || doc.third_party_name || 'Non détecté')}</p>
                <button id="openMatchingDocV030" type="button">Ouvrir le document</button>
            </div>
            <div class="matching-doc-preview-v0396">${content}</div>
        `;
    }

    function confidenceClass(score) {
        const s = Number(score || 0);
        if (s >= 90) return 'match-score-high-v0592';
        if (s >= 70) return 'match-score-medium-v0592';
        return 'match-score-low-v0592';
    }

    function renderMatch(container, doc, match) {
        if (isIgnoredMatch(doc.id, match.id)) return;
        const delta = doc.detected_amount || doc.amount_ttc
            ? Math.abs(Math.abs(Number(match.amount || 0)) - Math.abs(Number(doc.detected_amount || doc.amount_ttc || 0)))
            : null;
        const card = document.createElement('article');
        card.className = 'match-card match-card-v0592';
        card.innerHTML = `
            <div class="match-main-v0592">
                <strong>${escapeHtml(match.date_operation || '')} — ${escapeHtml(match.label || '')}</strong>
                <span>${amount(match.amount)}${delta !== null ? ` · écart ${amount(delta)}` : ''}</span>
            </div>
            <span class="match-score-v0592 ${confidenceClass(match.match_score)}">${Number(match.match_score || 0)}%</span>
            <div class="match-actions-v0592">
                <button type="button" data-action="link">Associer</button>
                <button type="button" class="secondary-button" data-action="reject">Refuser</button>
                <button type="button" class="secondary-button" data-action="ignore">Ne plus proposer</button>
            </div>
        `;
        card.querySelector('[data-action="link"]').addEventListener('click', async e => {
            e.preventDefault(); e.stopPropagation();
            await window.api.linkDocumentToTransaction({ documentId: doc.id, transactionId: match.id });
            toast('Justificatif rapproché.');
            if (typeof window.refreshAccountView === 'function' && getSelectedBankAccountV0592()) await window.refreshAccountView(false);
            await window.loadMatchingPage();
            if (typeof window.loadDocuments === 'function') await window.loadDocuments();
        });
        card.querySelector('[data-action="reject"]').addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            card.remove();
            if (!container.querySelector('.match-card')) container.innerHTML = '<div class="empty-state">Toutes les suggestions visibles ont été refusées pour cette session.</div>';
        });
        card.querySelector('[data-action="ignore"]').addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            ignoreMatch(doc.id, match.id, { documentName: doc.filename, transactionLabel: match.label, documentId: doc.id, transactionId: match.id });
            card.remove();
            toast('Cette suggestion ne sera plus proposée sur ce poste.');
            if (!container.querySelector('.match-card')) container.innerHTML = '<div class="empty-state">Aucune suggestion restante.</div>';
        });
        container.appendChild(card);
    }

    window.showMatchingSuggestions = async function showMatchingSuggestionsV0592(doc) {
        const suggestions = document.getElementById('matchingSuggestionList');
        const preview = document.getElementById('matchingPreview');
        const help = document.getElementById('matchingHelp');
        if (help) help.textContent = `Suggestions pour ${doc.filename}`;
        if (preview) {
            preview.innerHTML = renderPreview(doc);
            document.getElementById('openMatchingDocV030')?.addEventListener('click', () => window.api.openFile(doc.filepath));
        }
        if (!suggestions) return;
        if (!getSelectedCompanyV0592()) {
            suggestions.innerHTML = '<div class="empty-state">Sélectionne une société.</div>';
            return;
        }
        suggestions.innerHTML = `
            <div class="matching-search-v0397 matching-search-v040 matching-search-v0821">
                <input id="matchingSearchInputV0397" placeholder="Libellé, fournisseur, référence…">
                <input id="matchingSupplierFilterV040" placeholder="Tiers" value="${escapeHtml(doc.detected_supplier || doc.third_party_name || '')}">
                <input id="matchingAmountFilterV040" type="number" step="0.01" placeholder="Montant" value="${escapeHtml(doc.detected_amount || doc.amount_ttc || '')}">
                <input id="matchingDateFilterV040" type="date" value="${escapeHtml(doc.invoice_date || doc.detected_date || '')}">
                <button id="matchingSearchButtonV0397" type="button">Rechercher</button>
            </div>
            <div id="matchingSearchResultsV0397"></div>
            <h3>Suggestions</h3>
            <div id="matchingSuggestedResultsV0397"><div class="empty-state">Recherche des opérations candidates…</div></div>
        `;

        const suggested = document.getElementById('matchingSuggestedResultsV0397');
        const results = document.getElementById('matchingSearchResultsV0397');
        const renderList = (container, rows, emptyText) => {
            if (!container) return;
            container.innerHTML = '';
            const visible = (rows || []).filter(match => !isIgnoredMatch(doc.id, match.id));
            if (!visible.length) {
                container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
                return;
            }
            visible.forEach(match => renderMatch(container, doc, match));
        };

        const matches = await window.api.findDocumentMatches({
            companyId: getSelectedCompanyV0592()?.id,
            documentId: doc.id,
            limit: 12
        });
        renderList(suggested, matches, 'Aucune suggestion pertinente. Utilise la recherche manuelle ci-dessus.');

        const input = document.getElementById('matchingSearchInputV0397');
        const supplierInput = document.getElementById('matchingSupplierFilterV040');
        const amountInput = document.getElementById('matchingAmountFilterV040');
        const dateInput = document.getElementById('matchingDateFilterV040');
        const searchButton = document.getElementById('matchingSearchButtonV0397');
        const runSearch = async () => {
            const query = [input?.value, supplierInput?.value, amountInput?.value, dateInput?.value]
                .map(value => String(value || '').trim())
                .filter(Boolean)
                .join(' ');
            if (!query) {
                if (results) results.innerHTML = '<div class="empty-state">Renseigne au moins un filtre.</div>';
                return;
            }
            if (results) results.innerHTML = '<div class="empty-state">Recherche en cours…</div>';
            const rows = await window.api.searchTransactionsForDocument({
                companyId: getSelectedCompanyV0592()?.id,
                query,
                limit: 30
            });
            renderList(results, rows, 'Aucune opération bancaire ne correspond à cette recherche.');
        };
        searchButton?.addEventListener('click', runSearch);
        [input, supplierInput, amountInput, dateInput].forEach(el => {
            el?.addEventListener('keydown', event => { if (event.key === 'Enter') runSearch(); });
        });
    };

    // Sécurise le formulaire document : deux familles seulement.
    function patchDocumentEditor() {
        const root = document.getElementById('documentEditorV0454');
        if (!root || root.dataset.v0592Patched === '1') return;
        root.dataset.v0592Patched = '1';
        const select = root.querySelector('[name="docType"]');
        const preview = root.querySelector('.smart-name-preview-v0581');
        const refresh = () => {
            const type = select?.value || 'facture';
            const accounting = isAccountingDocument(type);
            root.classList.toggle('document-editor-accounting-v0592', accounting);
            root.classList.toggle('document-editor-non-accounting-v0592', !accounting);
            if (typeof window.purgeEditorIncompatibleFieldsV0581 === 'function' && !accounting) window.purgeEditorIncompatibleFieldsV0581(root, type);
            if (preview) {
                const get = name => root.querySelector(`[name="${name}"]`)?.value || '';
                const name = buildSmartFilenameV0592({
                    docType: get('docType'),
                    supplier: get('supplier'),
                    invoiceDate: get('invoiceDate'),
                    invoiceNumber: get('invoiceNumber'),
                    documentTitle: get('documentTitle')
                }, window.selectedDocumentV033 || {});
                preview.textContent = `Nom proposé : ${name}`;
            }
        };
        root.querySelectorAll('input, select, textarea').forEach(el => {
            el.addEventListener('input', refresh);
            el.addEventListener('change', refresh);
        });
        if (select) select.addEventListener('change', () => {
            if (!isAccountingDocument(select.value)) toast('Document non comptable : les champs facture sont supprimés et le document sort des rapprochements.', 'info');
        });
        refresh();
    }

    function patchPageTitles() {
        const page = document.getElementById('matchingPage');
        if (page) {
            const title = page.querySelector('h1');
            const subtitle = page.querySelector('.topbar p');
            if (title) title.textContent = 'Rapprochements justificatifs';
            if (subtitle) subtitle.textContent = 'Uniquement factures et avoirs au statut À rapprocher.';
        }
    }

    function init() {
        document.body.classList.add('v0592-documents-simplifies');
        patchPageTitles();
        patchDocumentEditor();
        // V0.60.1 : patch initial uniquement, pas de polling UI permanent.
    }

    ready(init);
})();
