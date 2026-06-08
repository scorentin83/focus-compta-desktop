// Focus Compta — référentiel métier centralisé.
// Ce module rend explicite la séparation entre documents comptables,
// documents non comptables et feuilles de caisse.
(function initFocusDomain() {
    'use strict';

    const ACCOUNTING_DOCUMENT_TYPES = Object.freeze(['facture', 'facture_client', 'avoir']);
    const NON_ACCOUNTING_DOCUMENT_TYPES = Object.freeze(['contrat', 'administratif', 'rib', 'releve', 'divers', 'don', 'informatif']);
    const MATCHABLE_STATUSES = Object.freeze(['unmatched', 'a_rapprocher', 'a rapprocher', 'to_match', 'pending']);

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
        return ACCOUNTING_DOCUMENT_TYPES.includes(normalizeDocType(type));
    }

    function isMatchableDocument(doc) {
        const status = String(doc?.status || 'unmatched').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return isAccountingDocument(doc?.doc_type) && MATCHABLE_STATUSES.includes(status);
    }

    window.FocusComptaDomain = Object.freeze({
        ACCOUNTING_DOCUMENT_TYPES,
        NON_ACCOUNTING_DOCUMENT_TYPES,
        MATCHABLE_STATUSES,
        normalizeDocType,
        isAccountingDocument,
        isMatchableDocument
    });
})();
