// Focus Compta V0.40 module
// Focus Compta V0.41.2 - état GED global restauré après modularisation
// Ces variables étaient utilisées par les fonctions V0.33/V0.36 mais n'étaient plus déclarées
// dans le module Documents, ce qui provoquait un ReferenceError à l'ouverture de la GED.
let selectedDocumentFolderV033 = '';
let selectedDocumentV033 = null;
let selectedDocumentRowsV033 = [];


// ===========================
// Focus Compta V0.54 - Référentiel documentaire unifié
// Source unique pour tous les menus Type de document.
// ===========================
const FOCUS_DOCUMENT_TYPES_V054 = [
    { value: 'facture', label: 'Facture fournisseur', shortLabel: 'Facture', icon: '🧾' },
    { value: 'facture_client', label: 'Facture client', shortLabel: 'Facture client', icon: '🧾' },
    { value: 'avoir', label: 'Avoir', shortLabel: 'Avoir', icon: '↩️' },
    { value: 'releve', label: 'Relevé bancaire', shortLabel: 'Relevé', icon: '📄' },
    { value: 'contrat', label: 'Contrat', shortLabel: 'Contrat', icon: '📑' },
    { value: 'administratif', label: 'Administratif', shortLabel: 'Administratif', icon: '📨' },
    { value: 'informatif', label: 'Informatif', shortLabel: 'Informatif', icon: 'ℹ️' },
    { value: 'don', label: 'Don', shortLabel: 'Don', icon: '🎁' },
    { value: 'rib', label: 'RIB', shortLabel: 'RIB', icon: '🏦' },
    { value: 'divers', label: 'Divers', shortLabel: 'Divers', icon: '📁' }
];

function normalizeDocumentTypeV054(type) {
    const raw = String(type || '').toLowerCase().trim();
    const aliases = {
        'facture fournisseur': 'facture',
        'facture': 'facture',
        'invoice': 'facture',
        'facture client': 'facture_client',
        'avoir': 'avoir',
        'releve bancaire': 'releve',
        'relevé bancaire': 'releve',
        'releve': 'releve',
        'relevé': 'releve',
        'contrat': 'contrat',
        'administratif': 'administratif',
        'informatif': 'informatif',
        'don': 'don',
        'rib': 'rib',
        'divers': 'divers'
    };
    return aliases[raw] || (FOCUS_DOCUMENT_TYPES_V054.some(t => t.value === raw) ? raw : 'divers');
}

function documentTypeOptionsV054(selected = 'facture', includeAll = false) {
    const value = normalizeDocumentTypeV054(selected);
    const all = includeAll ? '<option value="all">Type : Tous</option>' : '';
    return all + FOCUS_DOCUMENT_TYPES_V054.map(t => `<option value="${t.value}"${t.value === value ? ' selected' : ''}>${escapeHtmlV0454 ? escapeHtmlV0454(t.label) : t.label}</option>`).join('');
}

function documentTypeLabelV054(type, short = false) {
    const value = normalizeDocumentTypeV054(type);
    const found = FOCUS_DOCUMENT_TYPES_V054.find(t => t.value === value);
    return found ? (short ? found.shortLabel : found.label) : 'Divers';
}

function documentTypeIconV054(type) {
    const value = normalizeDocumentTypeV054(type);
    const found = FOCUS_DOCUMENT_TYPES_V054.find(t => t.value === value);
    return found ? found.icon : '📁';
}

if (typeof window !== 'undefined') {
    window.FOCUS_DOCUMENT_TYPES_V054 = FOCUS_DOCUMENT_TYPES_V054;
    window.normalizeDocumentTypeV054 = normalizeDocumentTypeV054;
    window.documentTypeOptionsV054 = documentTypeOptionsV054;
    window.documentTypeLabelV054 = documentTypeLabelV054;
    window.documentTypeIconV054 = documentTypeIconV054;
}

async function confirmDocumentActionV0412(title, message, okLabel = 'Confirmer') {
    if (typeof showFocusConfirmModalV0412 === 'function') {
        return showFocusConfirmModalV0412(title, message, okLabel);
    }
    if (typeof window !== 'undefined' && typeof window.showFocusConfirmModalV0412 === 'function') {
        return window.showFocusConfirmModalV0412(title, message, okLabel);
    }
    return true;
}

function docTypeIconV033(type) {
    return documentTypeIconV054(type);
}

function docTypeLabelV033(type) {
    return documentTypeLabelV054(type, false);
}

function getDocumentFiltersV033(extra = {}) {
    const filters = {
        status: 'all',
        search: document.getElementById('documentSearch')?.value || '',
        ...extra
    };
    const type = document.getElementById('documentTypeFilter')?.value || 'all';
    if (type !== 'all') filters.type = type;

    return filters;
}

async function fetchDocumentsV033(extra = {}) {
    let docs = await window.api.getDocuments({
        companyId: selectedCompany ? selectedCompany.id : null,
        filters: getDocumentFiltersV033(extra)
    });

    const year = document.getElementById('documentYearFilterV033')?.value || 'all';
    if (year !== 'all') {
        docs = docs.filter(doc => String(doc.detected_date || doc.added_at || doc.folder_path || '').includes(year));
    }

    return docs;
}

function updateDocumentKpisV033(docs) {
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    set('docsKpiTotalV033', docs.length);
    set('docsKpiStatementsV033', docs.filter(doc => doc.doc_type === 'releve').length);
    set('docsKpiDocsV033', docs.filter(doc => !['releve', 'rib'].includes(doc.doc_type || 'facture')).length);
    set('docsKpiRibV033', docs.filter(doc => doc.doc_type === 'rib').length);
    set('docsKpiContractsV033', docs.filter(doc => doc.doc_type === 'contrat').length);
}

function updateYearFilterV033(docs) {
    const select = document.getElementById('documentYearFilterV033');
    if (!select) return;

    const current = select.value || 'all';
    const years = [...new Set(docs.map(doc => {
        const text = `${doc.detected_date || ''} ${doc.added_at || ''} ${doc.folder_path || ''}`;
        const match = text.match(/20\d{2}/);
        return match ? match[0] : null;
    }).filter(Boolean))].sort().reverse();

    select.innerHTML = '<option value="all">Année : Toutes</option>';
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `Année : ${year}`;
        select.appendChild(option);
    });
    if (years.includes(current)) select.value = current;
}


/* Ancienne version redondante de buildVirtualFoldersV033 supprimée pour V0.40. */



/* Ancienne version redondante de renderDocumentTreeV033 supprimée pour V0.40. */



/* Ancienne version redondante de getDocFolderV033 supprimée pour V0.40. */



/* Ancienne version redondante de renderDocumentTableV033 supprimée pour V0.40. */



/* Ancienne version redondante de renderDocumentFolderV033 supprimée pour V0.40. */



/* Ancienne version redondante de renderDocumentPreviewV033 supprimée pour V0.40. */



/* Ancienne version redondante de renameDocumentV033 supprimée pour V0.40. */



/* Ancienne version redondante de moveDocumentV033 supprimée pour V0.40. */


async function deleteDocumentV033(doc) {
    if (!doc) return;
    const confirmed = await confirmDocumentActionV0412('Supprimer le document', `Supprimer définitivement ce document ?\n\n${doc.filename}`, 'Supprimer');
    if (!confirmed) return;

    const linkedTransactionId = doc.linked_transaction_id;
    await window.api.deleteDocument(doc.id);

    selectedDocumentV033 = null;
    await loadDocuments();

    if (typeof refreshAccountView === 'function' && selectedBankAccount) {
        await refreshAccountView(false);
    }
    if (typeof loadMatchingPage === 'function') {
        await loadMatchingPage();
    }
}

async function changeDocumentTypeV033(doc) {
    if (!doc) return;
    const type = await askInputV0397('Modifier le type', 'facture, avoir, releve, contrat, administratif, informatif, don, rib, divers', doc.doc_type || 'facture');
    if (!type) return;
    await window.api.updateDocumentType({ documentId: doc.id, docType: type });
    await loadDocuments();
}


/* Ancienne version redondante de loadDocuments supprimée pour V0.40. */



async function showManualDocumentLink(documentId, filename = '') {
    selectedDocumentId = documentId;
    const target = document.getElementById('documentMatchList');
    const help = document.getElementById('documentMatchHelp');
    if (!target) return;
    target.innerHTML = '';

    if (!selectedCompany) {
        if (help) help.textContent = 'Sélectionne une société pour associer ce document.';
        return;
    }

    if (help) help.textContent = `Association manuelle : ${filename}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'manual-link-box-v023';
    wrapper.innerHTML = `
        <label>Rechercher une opération</label>
        <div class="manual-link-search-row">
            <input id="manualOperationSearchV023" type="text" placeholder="Libellé, montant, fournisseur, date...">
            <button id="manualOperationSearchButtonV023">Rechercher</button>
        </div>
        <div id="manualOperationResultsV023" class="document-match-list"></div>
    `;
    target.appendChild(wrapper);

    const input = wrapper.querySelector('#manualOperationSearchV023');
    const button = wrapper.querySelector('#manualOperationSearchButtonV023');
    const results = wrapper.querySelector('#manualOperationResultsV023');

    async function runSearch() {
        const query = input.value.trim();
        results.innerHTML = '<div class="empty-state">Recherche...</div>';

        const rows = await window.api.searchTransactionsForDocument({
            companyId: selectedCompany.id,
            query,
            limit: 30
        });

        results.innerHTML = '';
        if (!rows || rows.length === 0) {
            results.innerHTML = '<div class="empty-state">Aucune opération trouvée.</div>';
            return;
        }

        rows.forEach(row => {
            const card = document.createElement('article');
            card.className = 'match-card manual-match-card-v023';
            card.innerHTML = `
                <strong>${row.date_operation || ''} — ${row.label}</strong>
                <span>${formatAmount(row.amount)} · ${row.category || 'Non catégorisé'} · ${row.receipts_count || 0} PJ</span>
                <button>Associer</button>
            `;
            card.querySelector('button').addEventListener('click', async () => {
                await window.api.linkDocumentToTransaction({ documentId, transactionId: row.id });
                await loadDocuments();
                await showDocumentMatches(documentId);
                if (selectedBankAccount) await refreshAccountView(false);
            });
            results.appendChild(card);
        });
    }

    button.addEventListener('click', runSearch);
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') runSearch();
    });

    input.value = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
    await runSearch();
}

async function showDocumentMatches(documentId) {
    selectedDocumentId = documentId;
    const target = document.getElementById('documentMatchList');
    const help = document.getElementById('documentMatchHelp');
    if (!target) return;
    target.innerHTML = '';
    if (!selectedCompany) {
        help.textContent = 'Sélectionne une société pour obtenir des suggestions.';
        return;
    }
    const matches = await window.api.findDocumentMatches({ companyId: selectedCompany.id, documentId, limit: 8 });
    help.textContent = matches.length ? 'Suggestions triées par pertinence.' : 'Aucune suggestion trouvée.';
    matches.forEach(match => {
        const card = document.createElement('article');
        card.className = 'match-card';
        card.innerHTML = `
            <strong>${match.date_operation || ''} — ${match.label}</strong>
            <span>${formatAmount(match.amount)} · score ${match.match_score}</span>
            <button>Associer</button>
        `;
        card.querySelector('button').addEventListener('click', async () => {
            await window.api.linkDocumentToTransaction({ documentId, transactionId: match.id });
            await loadDocuments();
            await showDocumentMatches(documentId);
            if (selectedBankAccount) await refreshAccountView(false);
        });
        target.appendChild(card);
    });
}
(function documentActionsV033() {
    function bind() {
        const refresh = document.getElementById('refreshDocumentTreeV033');
        if (refresh && !refresh.dataset.boundV033) {
            refresh.dataset.boundV033 = '1';
            refresh.addEventListener('click', loadDocuments);
        }

        const newFolder = document.getElementById('newDocumentFolderV033');
        if (newFolder && !newFolder.dataset.boundV033) {
            newFolder.dataset.boundV033 = '1';
            newFolder.addEventListener('click', async () => {
                const folder = await askInputV0397('Nouveau dossier', 'Nom du nouveau dossier logique', selectedDocumentFolderV033 || (selectedCompany ? selectedCompany.name : 'Nouveau dossier'));
                if (!folder) return;
                selectedDocumentFolderV033 = folder;
                await renderDocumentFolderV033();
            });
        }

        const openBtn = document.getElementById('openSelectedDocumentV033');
        if (openBtn && !openBtn.dataset.boundV033) {
            openBtn.dataset.boundV033 = '1';
            openBtn.addEventListener('click', async () => {
                if (!selectedDocumentV033) return focusToastV041('Sélectionne un document.', 'warning');
                await window.api.openFile(selectedDocumentV033.filepath);
            });
        }

        const previewBtn = document.getElementById('previewSelectedDocumentV033');
        if (previewBtn && !previewBtn.dataset.boundV033) {
            previewBtn.dataset.boundV033 = '1';
            previewBtn.addEventListener('click', () => renderDocumentPreviewV033(selectedDocumentV033));
        }

        const renameBtn = document.getElementById('renameSelectedDocumentV033');
        if (renameBtn && !renameBtn.dataset.boundV033) {
            renameBtn.dataset.boundV033 = '1';
            renameBtn.addEventListener('click', async () => {
                if (!selectedDocumentV033) return focusToastV041('Sélectionne un document.', 'warning');
                await renameDocumentV033(selectedDocumentV033);
            });
        }

        const moveBtn = document.getElementById('moveSelectedDocumentV033');
        if (moveBtn && !moveBtn.dataset.boundV033) {
            moveBtn.dataset.boundV033 = '1';
            moveBtn.addEventListener('click', async () => {
                if (!selectedDocumentV033) return focusToastV041('Sélectionne un document.', 'warning');
                await moveDocumentV033(selectedDocumentV033);
            });
        }

        const downloadBtn = document.getElementById('downloadSelectedDocumentV033');
        if (downloadBtn && !downloadBtn.dataset.boundV033) {
            downloadBtn.dataset.boundV033 = '1';
            downloadBtn.addEventListener('click', async () => {
                if (!selectedDocumentV033) return focusToastV041('Sélectionne un document.', 'warning');
                await window.api.openFile(selectedDocumentV033.filepath);
            });
        }

        const deleteBtn = document.getElementById('deleteSelectedDocumentV033');
        if (deleteBtn && !deleteBtn.dataset.boundV033) {
            deleteBtn.dataset.boundV033 = '1';
            deleteBtn.addEventListener('click', async () => {
                if (!selectedDocumentV033) return focusToastV041('Sélectionne un document.', 'warning');
                await deleteDocumentV033(selectedDocumentV033);
            });
        }

        const closePreview = document.getElementById('closeDocumentPreviewV033');
        if (closePreview && !closePreview.dataset.boundV033) {
            closePreview.dataset.boundV033 = '1';
            closePreview.addEventListener('click', () => {
                selectedDocumentV033 = null;
                renderDocumentPreviewV033(null);
            });
        }

        document.querySelectorAll('.document-preview-tabs-v033 button').forEach(button => {
            if (button.dataset.boundV033) return;
            button.dataset.boundV033 = '1';
            button.addEventListener('click', () => {
                document.querySelectorAll('.document-preview-tabs-v033 button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                renderDocumentPreviewV033(selectedDocumentV033);
            });
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();


// ===========================
// Focus Compta V0.34 - GED améliorée
// ===========================


/* Ancienne version redondante de getDocFolderV033 supprimée pour V0.40. */


function buildVirtualFoldersV033(docs) {
    const folders = new Map();

    function add(path, count = 0, system = false) {
        if (!folders.has(path)) folders.set(path, { path, count: 0, system });
        folders.get(path).count += count;
    }

    const companies = [...new Set(docs.map(doc => doc.company_name || (doc.company_id ? 'Société' : null)).filter(Boolean))].sort();
    companies.forEach(company => {
        add(company, 0);
        add(`${company}/Documents`, 0);
        add(`${company}/Relevés`, 0);
        add(`${company}/RIB`, 0);
    });

    add('Non classés', docs.filter(doc => !doc.company_id || !doc.folder_path).length, true);
    add('Corbeille', 0, true);

    docs.forEach(doc => {
        const folder = getDocFolderV033(doc);
        const parts = folder.split('/').filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
            const path = parts.slice(0, i).join('/');
            add(path, i === parts.length ? 1 : 0);
        }
    });

    const orderScore = (folder) => {
        if (folder.path === 'Non classés') return 900000;
        if (folder.path === 'Corbeille') return 900001;
        return folder.path.split('/').length * 1000 + folder.path.localeCompare('', 'fr');
    };

    return [...folders.values()].sort((a, b) => {
        const aRoot = a.path.split('/')[0];
        const bRoot = b.path.split('/')[0];
        if (aRoot !== bRoot) return aRoot.localeCompare(bRoot, 'fr');
        return orderScore(a) - orderScore(b);
    });
}


/* Ancienne version redondante de renderDocumentTreeV033 supprimée pour V0.40. */



/* Ancienne version redondante de renderDocumentTableV033 supprimée pour V0.40. */



/* Ancienne version redondante de renderDocumentPreviewV033 supprimée pour V0.40. */



/* Ancienne version redondante de renderDocumentFolderV033 supprimée pour V0.40. */


(function documentActionsV034() {
    function bind() {
        const unclassified = document.getElementById('showUnclassifiedV034');
        if (unclassified && !unclassified.dataset.boundV034) {
            unclassified.dataset.boundV034 = '1';
            unclassified.addEventListener('click', async () => {
                selectedDocumentFolderV033 = 'Non classés';
                await loadDocuments();
            });
        }

        const trash = document.getElementById('showTrashV034');
        if (trash && !trash.dataset.boundV034) {
            trash.dataset.boundV034 = '1';
            trash.addEventListener('click', async () => {
                selectedDocumentFolderV033 = 'Corbeille';
                await loadDocuments();
            });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();




// ===========================
// Focus Compta V0.53 - Types de documents intelligents
// ===========================
const DOCUMENT_TYPE_RULES_V053 = {
    facture: {
        label: 'Facture fournisseur', icon: '🧾', matching: 'required', nature: 'comptable', impact: 'yes',
        help: 'À rapprocher avec un paiement bancaire. Champs facture, TVA et paiement affichés.',
        fields: ['title','supplier','invoiceNumber','invoiceDate','dueDate','plannedPaymentDate','amounts','vat','paymentStatus','paymentMethod','paymentSchedule','notes']
    },
    facture_client: {
        label: 'Facture client', icon: '🧾', matching: 'required', nature: 'comptable', impact: 'yes',
        help: 'À rapprocher avec un encaissement bancaire. Champs facture, TVA et paiement affichés.',
        fields: ['title','supplier','invoiceNumber','invoiceDate','dueDate','plannedPaymentDate','amounts','vat','paymentStatus','paymentMethod','paymentSchedule','notes']
    },
    avoir: {
        label: 'Avoir', icon: '↩️', matching: 'required', nature: 'comptable', impact: 'yes',
        help: 'À rapprocher avec un remboursement ou une compensation bancaire.',
        fields: ['title','supplier','invoiceNumber','invoiceDate','amounts','vat','paymentStatus','paymentMethod','notes']
    },
    releve: {
        label: 'Relevé bancaire', icon: '📄', matching: 'none', nature: 'banque', impact: 'no',
        help: 'Pas de rapprochement : le relevé sert de source aux opérations bancaires.',
        fields: ['title','supplier','invoiceDate','notes']
    },
    contrat: {
        label: 'Contrat', icon: '📑', matching: 'none', nature: 'contractuel', impact: 'no',
        help: 'Titre, organisme, dates et notes. Aucun champ facture ni rapprochement bancaire.',
        fields: ['title','supplier','invoiceDate','dueDate','notes']
    },
    administratif: {
        label: 'Administratif', icon: '📨', matching: 'none', nature: 'administratif', impact: 'no',
        help: 'Titre, date et notes uniquement. Aucun champ facture conservé.',
        fields: ['title','supplier','invoiceDate','notes']
    },
    informatif: {
        label: 'Informatif', icon: 'ℹ️', matching: 'none', nature: 'informatif', impact: 'no',
        help: 'Titre, date et notes uniquement. Aucun impact comptable direct.',
        fields: ['title','supplier','invoiceDate','notes']
    },
    don: {
        label: 'Don', icon: '🎁', matching: 'optional', nature: 'comptable', impact: 'yes',
        help: 'Rapprochement facultatif. Pas de TVA ni numéro de facture obligatoire.',
        fields: ['title','supplier','invoiceDate','amounts','paymentMethod','notes']
    },
    rib: {
        label: 'RIB', icon: '🏦', matching: 'none', nature: 'administratif', impact: 'no',
        help: 'Coordonnées bancaires à vérifier et classer. Aucun rapprochement bancaire.',
        fields: ['title','supplier','invoiceDate','notes']
    },
    divers: {
        label: 'Divers', icon: '📁', matching: 'optional', nature: 'mixte', impact: 'optional',
        help: 'À qualifier si nécessaire. Rapprochement possible mais non obligatoire.',
        fields: ['title','supplier','invoiceDate','notes']
    }
};

function getDocumentTypeRuleV053(type) {
    return DOCUMENT_TYPE_RULES_V053[normalizeDocumentTypeV054(type || 'facture')] || DOCUMENT_TYPE_RULES_V053.divers;
}

function documentRequiresMatchingV053(docOrType) {
    const type = normalizeDocumentTypeV054(typeof docOrType === 'string' ? docOrType : (docOrType?.doc_type || docOrType?.docType || 'facture'));
    return getDocumentTypeRuleV053(type).matching === 'required';
}

function renderDocumentTypeHelpV053(type) {
    const rule = getDocumentTypeRuleV053(type);
    const pill = rule.matching === 'required' ? 'Rapprochement obligatoire' : rule.matching === 'optional' ? 'Rapprochement facultatif' : 'Aucun rapprochement requis';
    return `<div id="documentTypeHelpV053" class="document-type-help-v053 ${rule.matching}"><strong>${rule.icon} ${rule.label}</strong><span>${pill}</span><p>${escapeHtmlV0454(rule.help)}</p></div>`;
}

function applyDocumentTypeRulesV053(root, type) {
    const rule = getDocumentTypeRuleV053(type);
    const visible = new Set(rule.fields || []);
    root.querySelectorAll('[data-doc-field-v053]').forEach(el => {
        const key = el.dataset.docFieldV053;
        el.style.display = visible.has(key) ? '' : 'none';
        el.querySelectorAll('input,select,textarea').forEach(input => { input.disabled = !visible.has(key); });
    });
    const help = root.querySelector('#documentTypeHelpV053');
    if (help) help.outerHTML = renderDocumentTypeHelpV053(type);
    const vatCheck = root.querySelector('#documentVatCheckV0454');
    if (vatCheck) vatCheck.style.display = visible.has('vat') || visible.has('amounts') ? '' : 'none';
}


if (typeof window !== 'undefined') {
    window.DOCUMENT_TYPE_RULES_V053 = DOCUMENT_TYPE_RULES_V053;
    window.getDocumentTypeRuleV053 = getDocumentTypeRuleV053;
    window.documentRequiresMatchingV053 = documentRequiresMatchingV053;
    window.renderDocumentTypeHelpV053 = renderDocumentTypeHelpV053;
    window.applyDocumentTypeRulesV053 = applyDocumentTypeRulesV053;
}

// ===========================
// Focus Compta V0.35 - Favoris / Tags / Dossiers intelligents / Doublons
// ===========================

let activeSmartFolderV035 = '';

async function updateSmartFoldersV035() {
    if (!window.api.getDocumentSmartFolders) return;
    const stats = await window.api.getDocumentSmartFolders({ companyId: selectedCompany ? selectedCompany.id : null });

    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    set('smartFavCountV035', stats.favorites || 0);
    set('smartUnclassifiedCountV035', stats.unclassified || 0);
    set('smartDuplicatesCountV035', stats.duplicates || 0);
    set('smartUnmatchedCountV035', stats.unmatched || 0);
    set('smartContractsCountV035', stats.contracts || 0);
}

function documentMatchesSmartFolderV035(doc) {
    if (!activeSmartFolderV035) return true;

    if (activeSmartFolderV035 === 'favorites') return Number(doc.favorite || 0) === 1;
    if (activeSmartFolderV035 === 'unclassified') return !doc.company_id || !doc.folder_path;
    if (activeSmartFolderV035 === 'unmatched') return doc.status !== 'matched' && documentRequiresMatchingV053(doc);
    if (activeSmartFolderV035 === 'contracts') return doc.doc_type === 'contrat';
    if (activeSmartFolderV035 === 'recent') return true;
    if (activeSmartFolderV035 === 'duplicates') return true;

    return true;
}

const originalFetchDocumentsV035 = fetchDocumentsV033;
fetchDocumentsV033 = async function(extra = {}) {
    let docs = await originalFetchDocumentsV035(extra);

    if (activeSmartFolderV035 === 'duplicates' && window.api.getDocumentDuplicates) {
        docs = await window.api.getDocumentDuplicates({ companyId: selectedCompany ? selectedCompany.id : null });
    } else {
        docs = docs.filter(documentMatchesSmartFolderV035);
    }

    if (activeSmartFolderV035 === 'recent') {
        docs = [...docs].sort((a, b) => String(b.added_at || '').localeCompare(String(a.added_at || ''))).slice(0, 50);
    }

    return docs;
};

const originalUpdateDocumentKpisV035 = updateDocumentKpisV033;
updateDocumentKpisV033 = function(docs) {
    originalUpdateDocumentKpisV035(docs);
    updateSmartFoldersV035();
};

const originalRenderDocumentPreviewV035 = renderDocumentPreviewV033;
renderDocumentPreviewV033 = function(doc) {
    originalRenderDocumentPreviewV035(doc);

    const preview = document.getElementById('documentPreviewV033');
    if (!preview || !doc) return;

    const info = preview.querySelector('.document-info-v033');
    if (info) {
        const fav = Number(doc.favorite || 0) ? '⭐ Oui' : '—';
        const tags = doc.tags || '—';
        info.insertAdjacentHTML('beforeend', `<span>Favori : ${fav}</span><span>Tags : ${tags}</span>`);
    }

    const actions = preview.querySelector('.document-preview-actions-v033');
    if (actions) {
        const favoriteButton = document.createElement('button');
        favoriteButton.textContent = Number(doc.favorite || 0) ? 'Retirer favori' : 'Ajouter favori';
        favoriteButton.addEventListener('click', async () => {
            await window.api.toggleDocumentFavorite(doc.id);
            await loadDocuments();
        });

        const tagButton = document.createElement('button');
        tagButton.textContent = 'Tags';
        tagButton.addEventListener('click', async () => {
            const tags = await askInputV0397('Tags du document', 'Tags séparés par des virgules', doc.tags || '');
            if (tags === null) return;
            await window.api.updateDocumentTags({ documentId: doc.id, tags });
            await loadDocuments();
        });

        actions.appendChild(favoriteButton);
        actions.appendChild(tagButton);
    }
};

const originalRenderDocumentTableV035 = renderDocumentTableV033;
renderDocumentTableV033 = function(container, docs) {
    originalRenderDocumentTableV035(container, docs);

    const table = container?.querySelector('table');
    if (!table) return;

    const headRow = table.querySelector('thead tr');
    if (headRow && !headRow.dataset.v035) {
        headRow.dataset.v035 = '1';
        const th = document.createElement('th');
        th.textContent = 'Tags';
        headRow.appendChild(th);
    }

    table.querySelectorAll('tbody tr').forEach(row => {
        if (row.dataset.v035) return;
        row.dataset.v035 = '1';
        const docId = Number(row.dataset.documentId);
        const doc = docs.find(item => Number(item.id) === docId);
        if (!doc) return;
        const td = document.createElement('td');
        td.innerHTML = `${Number(doc.favorite || 0) ? '⭐ ' : ''}${doc.tags || ''}`;
        row.appendChild(td);
    });
};

(function documentSmartFoldersUiV035() {
    function bind() {
        document.querySelectorAll('#documentSmartFoldersV035 button').forEach(button => {
            if (button.dataset.boundV035) return;
            button.dataset.boundV035 = '1';
            button.addEventListener('click', async () => {
                document.querySelectorAll('#documentSmartFoldersV035 button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                activeSmartFolderV035 = button.dataset.smartFolder || '';
                selectedDocumentFolderV033 = '';
                await loadDocuments();
            });
        });

        const favButton = document.getElementById('favoriteSelectedDocumentV035');
        if (favButton && !favButton.dataset.boundV035) {
            favButton.dataset.boundV035 = '1';
            favButton.addEventListener('click', async () => {
                if (!selectedDocumentV033) return focusToastV041('Sélectionne un document.', 'warning');
                await window.api.toggleDocumentFavorite(selectedDocumentV033.id);
                await loadDocuments();
            });
        }

        const tagButton = document.getElementById('tagSelectedDocumentV035');
        if (tagButton && !tagButton.dataset.boundV035) {
            tagButton.dataset.boundV035 = '1';
            tagButton.addEventListener('click', async () => {
                if (!selectedDocumentV033) return focusToastV041('Sélectionne un document.', 'warning');
                const tags = await askInputV0397('Tags du document', 'Tags séparés par des virgules', selectedDocumentV033.tags || '');
                if (tags === null) return;
                await window.api.updateDocumentTags({ documentId: selectedDocumentV033.id, tags });
                await loadDocuments();
            });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();


// ===========================
// Focus Compta V0.36 - Correctifs GED utilisables
// ===========================

let previewTabV036 = 'preview';
let expandedFoldersV036 = new Set();

function folderDepthV036(path) {
    return String(path || '').split('/').filter(Boolean).length - 1;
}

function rootFolderV036(path) {
    return String(path || '').split('/').filter(Boolean)[0] || '';
}

function displayMonthV036(value) {
    const months = {
        '01': 'Janvier', '02': 'Février', '03': 'Mars', '04': 'Avril',
        '05': 'Mai', '06': 'Juin', '07': 'Juillet', '08': 'Août',
        '09': 'Septembre', '10': 'Octobre', '11': 'Novembre', '12': 'Décembre'
    };
    return months[String(value).padStart(2, '0')] || value;
}


/* Ancienne version redondante de getDocFolderV033 supprimée pour V0.40. */



/* Ancienne version redondante de buildFolderModelV036 supprimée pour V0.40. */


function shouldShowFolderV036(folder, search) {
    if (search && !folder.path.toLowerCase().includes(search.toLowerCase())) return false;
    if (!folder.parent) return true;
    return expandedFoldersV036.has(folder.parent) || search;
}


/* Ancienne version redondante de folderIconV036 supprimée pour V0.40. */



/* Ancienne version redondante de renderDocumentTreeV033 supprimée pour V0.40. */


function documentIsInFolderV036(doc, folder) {
    if (!folder) return true;
    if (folder === '⭐ Favoris') return Number(doc.favorite || 0) === 1;
    if (folder === '📥 Non classés') return !doc.company_id || !doc.folder_path;
    if (folder === '🔗 À rapprocher') return doc.status !== 'matched' && documentRequiresMatchingV053(doc);
    if (folder === '🕒 Récents') return true;
    if (folder === '🗑 Corbeille') return false;
    if (folder === '⚠ Doublons') return true;

    const cleanFolder = folder.replace(/^[⭐📥⚠🔗🕒🗑]\s*/, '');
    const docFolder = getDocFolderV033(doc);
    return docFolder === cleanFolder || docFolder.startsWith(`${cleanFolder}/`);
}

async function renderDocumentFolderV033() {
    let docs = selectedDocumentRowsV033;

    if (selectedDocumentFolderV033 === '🗑 Corbeille') {
        docs = await window.api.getDocuments({
            companyId: selectedCompany ? selectedCompany.id : null,
            filters: { status: 'trash' }
        });
    } else if (selectedDocumentFolderV033 === '⚠ Doublons' && window.api.getDocumentDuplicates) {
        docs = await window.api.getDocumentDuplicates({ companyId: selectedCompany ? selectedCompany.id : null });
    } else if (selectedDocumentFolderV033) {
        docs = docs.filter(doc => documentIsInFolderV036(doc, selectedDocumentFolderV033));
        if (selectedDocumentFolderV033 === '🕒 Récents') {
            docs = docs.sort((a, b) => String(b.added_at || '').localeCompare(String(a.added_at || ''))).slice(0, 50);
        }
    }

    const breadcrumb = document.getElementById('documentBreadcrumbV033');
    if (breadcrumb) breadcrumb.textContent = selectedDocumentFolderV033 || 'Tous les documents';

    renderDocumentTableV033(document.getElementById('documentFolderFilesV033'), docs);
    renderDocumentTreeV033(selectedDocumentRowsV033);
}


/* Ancienne version redondante de renderDocumentTableV033 supprimée pour V0.40. */



/* Ancienne version redondante de renderDocumentPreviewV033 supprimée pour V0.40. */


async function renameDocumentV033(doc) {
    const name = await askInputV0397('Renommer le document', 'Nouveau nom', doc.filename);
    if (!name || name === doc.filename) return;
    const result = await window.api.renameDocument({ documentId: doc.id, newFilename: name });
    if (result && result.ok === false) focusToastV041(result.message || 'Renommage impossible.', 'danger');
    await loadDocuments();
}

async function moveDocumentV033(doc) {
    const folder = await askInputV0397('Déplacer le document', 'Nouveau dossier logique', getDocFolderV033(doc));
    if (!folder) return;
    const result = await window.api.moveDocumentFolder({ documentId: doc.id, folderPath: folder });
    if (result && result.ok === false) focusToastV041(result.message || 'Déplacement impossible.', 'danger');
    selectedDocumentFolderV033 = folder;
    await loadDocuments();
}

async function tagDocumentV036(doc) {
    const tags = await askInputV0397('Tags du document', 'Tags séparés par des virgules', doc.tags || '');
    if (tags === null) return;
    const result = await window.api.updateDocumentTags({ documentId: doc.id, tags });
    if (result && result.ok === false) focusToastV041(result.message || 'Tags impossibles.', 'danger');
    await loadDocuments();
}


/* Ancienne version redondante de loadDocuments supprimée pour V0.40. */


(function bindDocumentV036() {
    function bind() {
        const search = document.getElementById('documentTreeSearchV036');
        if (search && !search.dataset.boundV036) {
            search.dataset.boundV036 = '1';
            search.addEventListener('input', () => renderDocumentTreeV033(selectedDocumentRowsV033 || []));
        }

        document.querySelectorAll('.document-preview-tabs-v033 button').forEach(button => {
            if (button.dataset.boundV036) return;
            button.dataset.boundV036 = '1';
            button.addEventListener('click', () => {
                previewTabV036 = button.dataset.previewTab || 'preview';
                renderDocumentPreviewV033(selectedDocumentV033);
            });
        });

        const fav = document.getElementById('favoriteSelectedDocumentV035');
        if (fav && !fav.dataset.boundV036) {
            fav.dataset.boundV036 = '1';
            fav.addEventListener('click', async () => {
                if (!selectedDocumentV033) return focusToastV041('Sélectionne un document.', 'warning');
                await window.api.toggleDocumentFavorite(selectedDocumentV033.id);
                await loadDocuments();
            });
        }

        const tag = document.getElementById('tagSelectedDocumentV035');
        if (tag && !tag.dataset.boundV036) {
            tag.dataset.boundV036 = '1';
            tag.addEventListener('click', async () => {
                if (!selectedDocumentV033) return focusToastV041('Sélectionne un document.', 'warning');
                await tagDocumentV036(selectedDocumentV033);
            });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();


// ===========================
// Focus Compta V0.37 - Refonte GED UX
// ===========================

let currentContextDocumentV037 = null;


/* Ancienne version redondante de renderDocumentTableV033 supprimée pour V0.40. */



/* Ancienne version redondante de showDocumentContextMenuV037 supprimée pour V0.40. */


function hideDocumentContextMenuV037() {
    const menu = document.getElementById('documentContextMenuV037');
    if (menu) menu.style.display = 'none';
}

async function associateThirdPartyV037(doc) {
    const value = await askInputV0397('Associer un tiers', 'Nom du tiers à associer', doc.third_party_name || doc.detected_supplier || '');
    if (value === null) return;
    await window.api.updateDocumentThirdParty({ documentId: doc.id, thirdPartyName: value });
    await loadDocuments();
}

async function getHistoryHtmlV037(doc) {
    let history = [];
    if (window.api.getDocumentHistory) {
        try {
            history = await window.api.getDocumentHistory(doc.id);
        } catch (error) {
            history = [];
        }
    }

    if (!history.length) {
        history = [
            { at: doc.added_at || '', action: 'Importé', detail: doc.filename }
        ];
    }

    return `
        <div class="document-info-v033 history-v037">
            <strong>Historique</strong>
            ${history.map(item => `
                <div class="history-item-v037">
                    <span>${item.action || 'Action'}</span>
                    <small>${item.at ? new Date(item.at).toLocaleString('fr-FR') : ''}</small>
                    ${item.detail ? `<em>${item.detail}</em>` : ''}
                </div>
            `).join('')}
        </div>
    `;
}


/* Ancienne version redondante de renderDocumentPreviewV033 supprimée pour V0.40. */


async function loadDocuments() {
    let docs = await fetchDocumentsV033();
    selectedDocumentRowsV033 = docs;
    updateDocumentKpisV033(docs);
    updateYearFilterV033(docs);
    renderDocumentTreeV033(docs);
    await renderDocumentFolderV033();

    if (selectedDocumentV033) {
        const refreshed = docs.find(doc => Number(doc.id) === Number(selectedDocumentV033.id));
        selectedDocumentV033 = refreshed || null;
        await renderDocumentPreviewV033(selectedDocumentV033);
    } else {
        await renderDocumentPreviewV033(null);
    }
}

(function bindDocumentV037() {
    function bind() {
        document.addEventListener('click', event => {
            const menu = document.getElementById('documentContextMenuV037');
            if (menu && !menu.contains(event.target)) hideDocumentContextMenuV037();
        });

        const important = document.getElementById('importantSelectedDocumentV037');
        if (important && !important.dataset.boundV037) {
            important.dataset.boundV037 = '1';
            important.addEventListener('click', async () => {
                if (!selectedDocumentV033) return focusToastV041('Sélectionne un document.', 'warning');
                await window.api.toggleDocumentImportant(selectedDocumentV033.id);
                await loadDocuments();
            });
        }

        const tag = document.getElementById('tagSelectedDocumentV035');
        if (tag) tag.style.display = 'none';

        const tagSmart = document.querySelectorAll('[data-smart-folder="tags"]');
        tagSmart.forEach(el => el.remove());

        document.querySelectorAll('.document-preview-tabs-v033 button').forEach(button => {
            if (button.dataset.previewTab === 'history') return;
        });

        const tabs = document.querySelector('.document-preview-tabs-v033');
        if (tabs && !tabs.querySelector('[data-preview-tab="history"]')) {
            const history = document.createElement('button');
            history.dataset.previewTab = 'history';
            history.textContent = 'Historique';
            tabs.appendChild(history);
        }

        document.querySelectorAll('.document-preview-tabs-v033 button').forEach(button => {
            if (button.dataset.boundV037) return;
            button.dataset.boundV037 = '1';
            button.addEventListener('click', async () => {
                previewTabV036 = button.dataset.previewTab || 'preview';
                await renderDocumentPreviewV033(selectedDocumentV033);
            });
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();


// ===========================
// Focus Compta V0.37.1 - Correctifs menu contextuel + documents orphelins
// ===========================

function positionContextMenuV037(menu, x, y) {
    menu.style.display = 'block';
    menu.style.left = '0px';
    menu.style.top = '0px';

    const margin = 12;
    const rect = menu.getBoundingClientRect();
    const width = rect.width || 260;
    const height = rect.height || 360;

    let left = x;
    let top = y;

    if (left + width + margin > window.innerWidth) {
        left = window.innerWidth - width - margin;
    }
    if (top + height + margin > window.innerHeight) {
        top = window.innerHeight - height - margin;
    }

    left = Math.max(margin, left);
    top = Math.max(margin, top);

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.maxHeight = `${window.innerHeight - margin * 2}px`;
    menu.style.overflowY = 'auto';
}

function showDocumentContextMenuV037(x, y, doc) {
    const menu = document.getElementById('documentContextMenuV037');
    if (!menu || !doc) return;

    const favoriteLabel = Number(doc.favorite || 0) ? 'Retirer des favoris' : 'Ajouter aux favoris';
    const importantLabel = Number(doc.important || 0) ? 'Retirer important' : 'Marquer important';

    menu.innerHTML = `
        <button data-action="open">📂 Ouvrir</button>
        <button data-action="preview">👁 Aperçu</button>
        <hr>
        <button data-action="rename">✏️ Renommer</button>
        <button data-action="move">📁 Déplacer</button>
        <button data-action="favorite">⭐ ${favoriteLabel}</button>
        <button data-action="important">📌 ${importantLabel}</button>
        <hr>
        <button data-action="third">👤 Associer un tiers</button>
        <button data-action="links">🔗 Voir les liens</button>
        <hr>
        <button data-action="copy">📋 Copier le chemin</button>
        <button data-action="download">⬇️ Télécharger / ouvrir</button>
        <hr>
        <button data-action="delete" class="danger-menu-action">🗑️ Supprimer</button>
    `;

    positionContextMenuV037(menu, x, y);

    menu.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', async () => {
            const action = button.dataset.action;
            hideDocumentContextMenuV037();

            if (action === 'open' || action === 'download') await window.api.openFile(doc.filepath);
            if (action === 'preview') renderDocumentPreviewV033(doc);
            if (action === 'rename') await renameDocumentV033(doc);
            if (action === 'move') await moveDocumentV033(doc);
            if (action === 'favorite') {
                await window.api.toggleDocumentFavorite(doc.id);
                await loadDocuments();
            }
            if (action === 'important') {
                await window.api.toggleDocumentImportant(doc.id);
                await loadDocuments();
            }
            if (action === 'third') await associateThirdPartyV037(doc);
            if (action === 'links') {
                previewTabV036 = 'links';
                renderDocumentPreviewV033(doc);
            }
            if (action === 'copy') {
                try {
                    await navigator.clipboard.writeText(doc.filepath || '');
                } catch (error) {
                    await askInputV0397('Chemin du fichier', 'Chemin du fichier', doc.filepath || '');
                }
            }
            if (action === 'delete') await deleteDocumentV033(doc);
        });
    });
}

window.addEventListener('resize', hideDocumentContextMenuV037);


// ===========================
// Focus Compta V0.37.2 - Arborescence métier simplifiée
// ===========================

function extractYearMonthV0372(doc) {
    const text = `${doc.detected_date || ''} ${doc.added_at || ''} ${doc.folder_path || ''}`;

    let m = String(text).match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/);
    if (m) return { year: m[3], month: String(m[2]).padStart(2, '0') };

    m = String(text).match(/\b(20\d{2})[\/.-](\d{1,2})\b/);
    if (m) return { year: m[1], month: String(m[2]).padStart(2, '0') };

    const year = (String(text).match(/20\d{2}/) || [new Date().getFullYear().toString()])[0];
    return { year, month: 'Sans mois' };
}

function getAccountFolderV0372(doc) {
    const folder = String(doc.folder_path || '');
    const parts = folder.split('/').filter(Boolean);
    const releveIndex = parts.findIndex(part => part.toLowerCase().includes('relev'));
    if (releveIndex !== -1 && parts[releveIndex + 2]) return parts[releveIndex + 2];
    if (doc.detected_reference) return String(doc.detected_reference).slice(0, 32);
    return 'Compte bancaire';
}

function getDocFolderV033(doc) {
    const company = doc.company_name || (selectedCompany ? selectedCompany.name : 'Non classés');
    const { year, month } = extractYearMonthV0372(doc);

    if (!doc.company_id) return 'Non classés';

    if (doc.doc_type === 'rib') {
        return `${company}/RIB`;
    }

    if (doc.doc_type === 'releve') {
        return `${company}/RELEVES/${getAccountFolderV0372(doc)}`;
    }

    // On ne classe plus par jour : seulement année > mois
    return `${company}/JUSTIFICATIFS/${year}/${month}`;
}

function displayFolderNameV0372(name) {
    const months = {
        '01': 'Janvier', '02': 'Février', '03': 'Mars', '04': 'Avril',
        '05': 'Mai', '06': 'Juin', '07': 'Juillet', '08': 'Août',
        '09': 'Septembre', '10': 'Octobre', '11': 'Novembre', '12': 'Décembre'
    };
    return months[String(name).padStart(2, '0')] || name;
}

function buildFolderModelV036(docs) {
    const folders = new Map();

    function ensure(path) {
        if (!path) return null;
        if (!folders.has(path)) {
            const parts = path.split('/').filter(Boolean);
            folders.set(path, {
                path,
                name: parts[parts.length - 1],
                parent: parts.length > 1 ? parts.slice(0, -1).join('/') : '',
                depth: parts.length - 1,
                count: 0,
                hasChildren: false
            });
        }
        return folders.get(path);
    }

    function addPath(path, count = 0) {
        const parts = String(path || '').split('/').filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
            const current = parts.slice(0, i).join('/');
            const folder = ensure(current);
            if (i === parts.length && folder) folder.count += count;
            const parent = i > 1 ? ensure(parts.slice(0, i - 1).join('/')) : null;
            if (parent) parent.hasChildren = true;
        }
    }

    // Dossiers intelligents utiles
    addPath('⭐ Favoris', docs.filter(doc => Number(doc.favorite || 0) === 1).length);
    addPath('📥 Non classés', docs.filter(doc => !doc.company_id).length);
    addPath('⚠ Doublons', 0);
    addPath('🔗 À rapprocher', docs.filter(doc => doc.status !== 'matched' && documentRequiresMatchingV053(doc)).length);
    addPath('🕒 Récents', Math.min(50, docs.length));

    const companies = [...new Set(docs.map(doc => doc.company_name).filter(Boolean))].sort();
    companies.forEach(company => {
        addPath(company, 0);
        addPath(`${company}/RIB`, 0);
        addPath(`${company}/RELEVES`, 0);
        addPath(`${company}/JUSTIFICATIFS`, 0);
    });

    docs.forEach(doc => addPath(getDocFolderV033(doc), 1));

    addPath('🗑 Corbeille', 0);

    return [...folders.values()].sort((a, b) => {
        const smartOrder = ['⭐ Favoris', '📥 Non classés', '⚠ Doublons', '🔗 À rapprocher', '🕒 Récents'];
        const ai = smartOrder.indexOf(a.path);
        const bi = smartOrder.indexOf(b.path);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        if (a.path === '🗑 Corbeille') return 1;
        if (b.path === '🗑 Corbeille') return -1;
        return a.path.localeCompare(b.path, 'fr', { numeric: true });
    });
}

function folderIconV036(folder) {
    if (folder.path.startsWith('⭐') || folder.path.startsWith('📥') || folder.path.startsWith('⚠') || folder.path.startsWith('🔗') || folder.path.startsWith('🕒') || folder.path.startsWith('🗑')) return '';
    if (folder.name === 'RIB') return '🏦';
    if (folder.name === 'RELEVES') return '📄';
    if (folder.name === 'JUSTIFICATIFS') return '🧾';
    if (/^20\d{2}$/.test(folder.name)) return '📁';
    if (/^\d{2}$/.test(folder.name)) return '📅';
    return folder.depth === 0 ? '📁' : '📂';
}

function renderDocumentTreeV033(docs) {
    const tree = document.getElementById('documentTreeV033');
    if (!tree) return;

    const search = document.getElementById('documentTreeSearchV036')?.value || '';
    tree.innerHTML = '';

    if (!expandedFoldersV036.size) {
        docs.forEach(doc => {
            const company = doc.company_name;
            if (company) {
                expandedFoldersV036.add(company);
                expandedFoldersV036.add(`${company}/JUSTIFICATIFS`);
                expandedFoldersV036.add(`${company}/RELEVES`);
            }
        });
    }

    const allButton = document.createElement('button');
    allButton.className = selectedDocumentFolderV033 ? 'tree-row-v036' : 'tree-row-v036 active';
    allButton.innerHTML = `<span class="tree-chevron-v036"></span><span class="tree-label-v036">📁 Tous les documents</span><span class="tree-count-v036">${docs.length}</span>`;
    allButton.addEventListener('click', async () => {
        selectedDocumentFolderV033 = '';
        activeSmartFolderV035 = '';
        await renderDocumentFolderV033();
    });
    tree.appendChild(allButton);

    buildFolderModelV036(docs).filter(folder => shouldShowFolderV036(folder, search)).forEach(folder => {
        const button = document.createElement('button');
        button.className = selectedDocumentFolderV033 === folder.path ? 'tree-row-v036 active' : 'tree-row-v036';
        button.style.setProperty('--depth', folder.depth);
        button.title = folder.path;
        button.dataset.folderPath = folder.path;

        const expanded = expandedFoldersV036.has(folder.path);
        const chevron = folder.hasChildren ? (expanded ? '▼' : '▶') : '';
        const icon = folderIconV036(folder);
        const name = displayFolderNameV0372(folder.name);

        button.innerHTML = `
            <span class="tree-chevron-v036">${chevron}</span>
            <span class="tree-label-v036">${icon ? icon + ' ' : ''}${name}</span>
            <span class="tree-count-v036">${folder.count || ''}</span>
        `;

        button.addEventListener('click', async event => {
            const clickedChevron = event.target.classList.contains('tree-chevron-v036');
            if (folder.hasChildren && (clickedChevron || selectedDocumentFolderV033 === folder.path)) {
                if (expandedFoldersV036.has(folder.path)) expandedFoldersV036.delete(folder.path);
                else expandedFoldersV036.add(folder.path);
            }

            selectedDocumentFolderV033 = folder.path;
            activeSmartFolderV035 = '';
            await renderDocumentFolderV033();
        });

        button.addEventListener('dragover', event => event.preventDefault());
        button.addEventListener('drop', async event => {
            event.preventDefault();
            const documentId = Number(event.dataTransfer.getData('text/plain'));
            if (!documentId || folder.path.startsWith('⚠') || folder.path.startsWith('🗑')) return;
            await window.api.moveDocumentFolder({ documentId, folderPath: folder.path.replace(/^[⭐📥⚠🔗🕒🗑]\s*/, '') });
            selectedDocumentFolderV033 = folder.path;
            await loadDocuments();
        });

        tree.appendChild(button);
    });
}

function renderDocumentTableV033(container, docs) {
    if (!container) return;
    container.innerHTML = '';

    if (!docs.length) {
        container.innerHTML = '<div class="empty-state">Aucun fichier dans ce dossier.</div>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'documents-table-v033 documents-table-v0372';
    table.innerHTML = `
        <thead>
            <tr>
                <th></th>
                <th>Nom</th>
                <th>Type</th>
                <th>Date</th>
                <th>TTC</th>
                <th>TVA</th>
                <th>Échéance</th>
                <th>Statut</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const body = table.querySelector('tbody');
    docs.forEach(doc => {
        const tr = document.createElement('tr');
        tr.className = 'document-row-v033 document-row-v037';
        tr.dataset.documentId = doc.id;
        tr.draggable = true;
        tr.innerHTML = `
            <td><input type="checkbox"></td>
            <td>
                <span class="file-icon-v033">${docTypeIconV033(doc.doc_type)}</span>
                <strong>${Number(doc.favorite || 0) ? '⭐ ' : ''}${Number(doc.important || 0) ? '📌 ' : ''}${doc.filename}</strong>
                <small>${doc.company_name || 'Non classé'} · ${getDocFolderV033(doc)}</small>
            </td>
            <td>${docTypeLabelV033(doc.doc_type)}</td>
            <td>${doc.invoice_date || doc.detected_date || (doc.added_at || '').slice(0, 10)}</td>
            <td>${doc.amount_ttc || doc.detected_amount ? formatAmount(doc.amount_ttc || doc.detected_amount) : '—'}</td>
            <td>${doc.amount_tva ? formatAmount(doc.amount_tva) : '—'}</td>
            <td>${doc.due_date || '—'}</td>
            <td>${documentDisplayStatusV0542(doc)}</td>
        `;

        tr.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', String(doc.id)));

        tr.addEventListener('click', event => {
            if (event.target.tagName === 'INPUT') return;
            selectedDocumentV033 = doc;
            document.querySelectorAll('.document-row-v033').forEach(row => row.classList.remove('selected'));
            tr.classList.add('selected');
            renderDocumentPreviewV033(doc);
        });

        tr.addEventListener('dblclick', async event => {
            event.preventDefault();
            await window.api.openFile(doc.filepath);
        });

        tr.addEventListener('contextmenu', event => {
            event.preventDefault();
            selectedDocumentV033 = doc;
            currentContextDocumentV037 = doc;
            document.querySelectorAll('.document-row-v033').forEach(row => row.classList.remove('selected'));
            tr.classList.add('selected');
            renderDocumentPreviewV033(doc);
            showDocumentContextMenuV037(event.clientX, event.clientY, doc);
        });

        body.appendChild(tr);
    });

    container.appendChild(table);
}

function renderDocumentPreviewV033(doc) {
    const title = document.getElementById('documentPreviewTitleV033');
    const preview = document.getElementById('documentPreviewV033');
    if (!preview) return;

    if (!doc) {
        if (title) title.textContent = 'Aperçu';
        preview.className = 'document-preview-v033 empty-state';
        preview.textContent = 'Sélectionne un document.';
        return;
    }

    if (title) title.textContent = doc.filename;
    preview.className = 'document-preview-v033';

    document.querySelectorAll('.document-preview-tabs-v033 button').forEach(button => {
        button.classList.toggle('active', button.dataset.previewTab === previewTabV036);
    });

    const safePath = String(doc.filepath || '').replace(/\\/g, '/');
    const lower = String(doc.filename || '').toLowerCase();

    let content = '';
    if (previewTabV036 === 'preview') {
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
            content = `<img src="file:///${safePath}" alt="${doc.filename}">`;
        } else if (lower.endsWith('.pdf')) {
            content = `<iframe class="pdf-frame-v034" src="file:///${safePath}"></iframe>`;
        } else {
            content = `<div class="pdf-placeholder-v033">📄<br>${doc.filename}<br><span>Double-clic ou clic droit pour ouvrir.</span></div>`;
        }
    }

    if (previewTabV036 === 'info') {
        content = `
            <div class="document-info-v033">
                <strong>Informations document</strong>
                <span>Nom : ${doc.filename}</span>
                <span>Type : ${docTypeLabelV033(doc.doc_type)}</span>
                <span>Société : ${doc.company_name || 'Non classé'}</span>
                <span>Dossier : ${getDocFolderV033(doc)}</span>
                <span>Date facture : ${doc.invoice_date || doc.detected_date || 'Non détectée'}</span>
                <span>Échéance : ${doc.due_date || '—'}</span>
                <span>HT : ${doc.amount_ht ? formatAmount(doc.amount_ht) : '—'}</span>
                <span>TVA : ${doc.amount_tva ? formatAmount(doc.amount_tva) : '—'}</span>
                <span>TTC : ${doc.amount_ttc || doc.detected_amount ? formatAmount(doc.amount_ttc || doc.detected_amount) : '—'}</span>
                <span>Fournisseur : ${doc.detected_supplier || '—'}</span>
                <span>Tiers associé : ${doc.third_party_name || '—'}</span>
                <span>N° facture / Référence : ${doc.invoice_number || doc.detected_reference || '—'}</span>
                <span>Statut paiement : ${doc.payment_status || 'unknown'}</span>
                <span>Favori : ${Number(doc.favorite || 0) ? 'Oui' : 'Non'}</span>
                <span>Important : ${Number(doc.important || 0) ? 'Oui' : 'Non'}</span>
            </div>
        `;
    }

    if (previewTabV036 === 'ocr') {
        content = `
            <div class="document-info-v033">
                <strong>OCR / données détectées</strong>
                <span>Fournisseur : ${doc.detected_supplier || '—'}</span>
                <span>Date facture : ${doc.invoice_date || doc.detected_date || '—'}</span>
                <span>Échéance : ${doc.due_date || '—'}</span>
                <span>HT : ${doc.amount_ht ? formatAmount(doc.amount_ht) : '—'}</span>
                <span>TVA : ${doc.amount_tva ? formatAmount(doc.amount_tva) : '—'}</span>
                <span>TTC : ${doc.amount_ttc || doc.detected_amount ? formatAmount(doc.amount_ttc || doc.detected_amount) : '—'}</span>
                <span>Taux TVA : ${doc.vat_rate ? `${doc.vat_rate}%` : '—'}</span>
                <span>N° facture / Référence : ${doc.invoice_number || doc.detected_reference || '—'}</span>
                <textarea readonly>${doc.ocr_text || 'OCR complet non disponible pour ce document.'}</textarea>
            </div>
        `;
    }

    if (previewTabV036 === 'links') {
        content = `
            <div class="document-info-v033">
                <strong>Liens</strong>
                <span>Statut : ${documentDisplayStatusV0542(doc).replace(/^[^\s]+\s*/, '')}</span>
                <span>Opération liée : ${doc.transaction_label || 'Aucune'}</span>
                <span>Date opération : ${doc.date_operation || '—'}</span>
                <span>Montant opération : ${doc.transaction_amount ? formatAmount(doc.transaction_amount) : '—'}</span>
                <p class="muted">Le rapprochement se fait dans le module Rapprochements.</p>
            </div>
        `;
    }

    if (previewTabV036 === 'history') {
        getHistoryHtmlV037(doc).then(html => {
            preview.innerHTML = html;
        });
        return;
    }

    preview.innerHTML = content;
}



// ===========================
// Focus Compta V0.38 - Dashboard société + feuilles de caisse
// ===========================
renameDocumentV033 = async function(doc) {
    const name = await askInputV0397('Renommer le document', 'Nouveau nom', doc.filename);
    if (!name || name === doc.filename) return;
    const result = await window.api.renameDocument({ documentId: doc.id, newFilename: name });
    if (result && result.ok === false) focusToastV041(result.message || 'Renommage impossible.', 'danger');
    await loadDocuments();
};

moveDocumentV033 = async function(doc) {
    const folder = await askInputV0397('Déplacer le document', 'Nouveau dossier logique', getDocFolderV033(doc));
    if (!folder) return;
    const result = await window.api.moveDocumentFolder({ documentId: doc.id, folderPath: folder });
    if (result && result.ok === false) focusToastV041(result.message || 'Déplacement impossible.', 'danger');
    selectedDocumentFolderV033 = folder;
    await loadDocuments();
};

associateThirdPartyV037 = async function(doc) {
    const value = await askInputV0397('Associer un tiers', 'Nom du tiers', doc.third_party_name || doc.detected_supplier || '');
    if (value === null) return;
    await window.api.updateDocumentThirdParty({ documentId: doc.id, thirdPartyName: value });
    await loadDocuments();
};

changeDocumentTypeV033 = async function(doc) {
    if (!doc) return;
    const type = await askInputV0397('Modifier le type', 'facture, avoir, releve, contrat, administratif, informatif, don, rib, divers', doc.doc_type || 'facture');
    if (!type) return;
    await window.api.updateDocumentType({ documentId: doc.id, docType: type });
    await loadDocuments();
};

tagDocumentV036 = async function(doc) {
    // Tags désactivés dans l'UX Focus Compta.
    return;
};

// ===========================
// Focus Compta V0.45.4 - OCR Expert+ : édition complète + candidats cliquables + apprentissage
// ===========================
function escapeHtmlV0454(value = '') {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function parseAmountInputV0454(value) {
    if (value === null || value === undefined || value === '') return '';
    const cleaned = String(value).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : '';
}

function amountInputV0454(value) {
    const n = parseAmountInputV0454(value);
    return n === '' ? '' : String(n.toFixed(2));
}

function normalizeDocumentDateInputV0454(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return raw;
    const fr = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (!fr) return raw;
    const y = fr[3].length === 2 ? `20${fr[3]}` : fr[3];
    return `${y}-${fr[2].padStart(2,'0')}-${fr[1].padStart(2,'0')}`;
}

function displayDateV0454(value = '') {
    const raw = String(value || '').trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    return raw;
}

function getDocumentTextV0454(doc) {
    return String(doc?.ocr_text || doc?.extractedText || doc?.filename || '');
}

function collectAmountsV0454(doc) {
    const text = getDocumentTextV0454(doc).replace(/\r/g, '\n');
    const candidates = [];
    const push = (amount, label, score, context = '') => {
        const n = parseAmountInputV0454(amount);
        if (n === '' || n <= 0 || n > 10000000) return;
        const key = `${label}:${n.toFixed(2)}`;
        if (candidates.some(c => c.key === key)) return;
        candidates.push({ key, amount: n, label, score, context: context.trim().slice(0, 220) });
    };
    const labelled = [
        { label: 'TTC', score: 98, re: /(?:net\s+a\s+payer|net\s+à\s+payer|net\s+a\s+regler|net\s+à\s+régler|total\s+ttc|montant\s+ttc|total\s+facture|total\s+à\s+payer|total\s+a\s+payer|montant\s+total)[^\d-]{0,120}(-?\d[\d\s]*(?:[,.]\d{2}))/ig },
        { label: 'HT', score: 90, re: /(?:total\s+ht|montant\s+ht|base\s+ht|hors\s+taxes|total\s+hors\s+taxes|total\s+net\s+ht)[^\d-]{0,120}(-?\d[\d\s]*(?:[,.]\d{2}))/ig },
        { label: 'TVA', score: 86, re: /(?:total\s+tva|montant\s+tva|tva\s+totale|dont\s+tva|taxe\s+sur\s+la\s+valeur|\btva\b)[^\d-]{0,120}(-?\d[\d\s]*(?:[,.]\d{2}))/ig }
    ];
    for (const item of labelled) {
        let m;
        while ((m = item.re.exec(text)) !== null) {
            push(m[1], item.label, item.score, text.slice(Math.max(0, m.index - 70), m.index + 180));
        }
    }
    const all = [...text.matchAll(/\b(-?\d[\d\s]{0,12}[,.]\d{2})\s*(?:€|eur|euro)?\b/ig)];
    for (const m of all) push(m[1], 'Montant', 45, text.slice(Math.max(0, m.index - 70), m.index + 150));
    return candidates.sort((a, b) => b.score - a.score || b.amount - a.amount).slice(0, 30);
}

function collectDatesV0454(doc) {
    const text = `${getDocumentTextV0454(doc)}\n${doc?.filename || ''}`;
    const candidates = [];
    const push = (value, label, score, context = '') => {
        const normalized = normalizeDocumentDateInputV0454(value);
        const key = `${label}:${normalized}`;
        if (!normalized || candidates.some(c => c.key === key)) return;
        candidates.push({ key, value: normalized, display: displayDateV0454(normalized), label, score, context: context.trim().slice(0, 180) });
    };
    const patterns = [
        { label: 'Échéance', score: 95, re: /(?:échéance|echeance|date\s+limite|à\s+régler\s+avant|a\s+regler\s+avant|payable\s+le)[^0-9]{0,100}(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/ig },
        { label: 'Date facture', score: 90, re: /(?:date\s+facture|date\s+d['’]?émission|date\s+d['’]?emission|factur[eé]\s+le)[^0-9]{0,100}(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/ig },
        { label: 'Date', score: 50, re: /\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b/g }
    ];
    for (const p of patterns) {
        let m;
        while ((m = p.re.exec(text)) !== null) push(m[1], p.label, p.score, text.slice(Math.max(0, m.index - 60), m.index + 130));
    }
    return candidates.sort((a, b) => b.score - a.score).slice(0, 20);
}

function collectSupplierCandidatesV0454(doc) {
    const text = getDocumentTextV0454(doc);
    const known = ['NIDEK SA','Essilor','GrandVision','Hoya','BBGR','Zeiss','EDF','Orange','SwissLife','Almerys','Viamedis','Carte Blanche','Kalixia','Itelis','Santéclair','MMA IARD','Allianz','CPAM','DGFIP','URSSAF','Crédit Agricole'];
    const out = [];
    const push = (name, score, context = '') => {
        const cleaned = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        if (!cleaned || out.some(x => x.name.toLowerCase() === cleaned.toLowerCase())) return;
        out.push({ name: cleaned, score, context: context.trim().slice(0, 180) });
    };
    known.forEach(name => {
        const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'i');
        const m = text.match(re);
        if (m) push(name, 95, text.slice(Math.max(0, m.index - 50), m.index + 120));
    });
    if (doc.detected_supplier) push(doc.detected_supplier, 80, 'Fournisseur actuellement détecté');
    const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length >= 3 && l.length <= 80);
    const noise = /(facture|date|total|tva|siret|iban|page|montant|client|livraison|donneur d'ordre|référence|reference)/i;
    lines.slice(0, 25).forEach(line => {
        if (!noise.test(line) && /[A-ZÀ-Ÿ]{3,}/.test(line)) push(line, 55, 'Ligne haute du document');
    });
    return out.sort((a,b)=>b.score-a.score).slice(0, 12);
}

function renderInlinePreviewV0454(doc) {
    const safePath = String(doc?.filepath || '').replace(/\\/g, '/');
    const lower = String(doc?.filename || '').toLowerCase();
    if (!safePath) return '<div class="document-preview-empty-v0453">Aucun fichier.</div>';
    if (lower.endsWith('.pdf')) return `<iframe src="file:///${safePath}"></iframe>`;
    if (/\.(jpg|jpeg|png|webp)$/i.test(lower)) return `<img src="file:///${safePath}" alt="${escapeHtmlV0454(doc.filename)}">`;
    return `<div class="document-preview-empty-v0453">Aperçu non disponible.<br><button data-doc-action-v0454="open">Ouvrir le fichier</button></div>`;
}

function vatWarningV0454(ht, tva, ttc) {
    const h = parseAmountInputV0454(ht), v = parseAmountInputV0454(tva), t = parseAmountInputV0454(ttc);
    if (h === '' || v === '' || t === '') return '';
    const delta = Math.abs((h + v) - t);
    if (delta <= 0.05) return '<div class="doc-check-ok-v0454">✓ HT + TVA = TTC</div>';
    return `<div class="doc-check-warning-v0454">⚠ Écart HT + TVA / TTC : ${delta.toFixed(2)} €</div>`;
}

function formDataFromDocumentEditorV0454() {
    const root = document.getElementById('documentEditorV0454');
    if (!root || !selectedDocumentV033) return null;
    const get = name => root.querySelector(`[name="${name}"]`)?.value ?? '';
    return {
        documentId: selectedDocumentV033.id,
        docType: get('docType') || 'facture',
        supplier: get('supplier'),
        documentTitle: get('documentTitle'),
        documentNotes: get('documentNotes'),
        invoiceNumber: get('invoiceNumber'),
        invoiceDate: get('invoiceDate'),
        dueDate: get('dueDate'),
        plannedPaymentDate: get('plannedPaymentDate'),
        paymentMethod: get('paymentMethod'),
        paymentScheduleJson: get('paymentScheduleJson'),
        amountHt: parseAmountInputV0454(get('amountHt')),
        amountTva: parseAmountInputV0454(get('amountTva')),
        amountTtc: parseAmountInputV0454(get('amountTtc')),
        vatRate: parseAmountInputV0454(get('vatRate')),
        paymentStatus: get('paymentStatus') || 'unknown',
        validationStatus: 'validated',
        accountingImpact: getDocumentTypeRuleV053(get('docType') || 'facture').impact === 'no' ? 'no' : 'yes',
        documentNature: getDocumentTypeRuleV053(get('docType') || 'facture').nature
    };
}


function documentTypeKeepsInvoiceFieldsV0581(type) {
    return ['facture','facture_client','avoir'].includes(normalizeDocumentTypeV054(type || 'facture'));
}
function documentTypeKeepsAmountsV0581(type) {
    return ['facture','facture_client','avoir','don'].includes(normalizeDocumentTypeV054(type || 'facture'));
}
function purgeEditorIncompatibleFieldsV0581(root, type) {
    if (!root) return;
    const normalized = normalizeDocumentTypeV054(type || 'facture');
    const invoiceLike = documentTypeKeepsInvoiceFieldsV0581(normalized);
    const amountLike = documentTypeKeepsAmountsV0581(normalized);
    const clear = (name) => { const el = root.querySelector(`[name="${name}"]`); if (el) el.value = ''; };
    if (!invoiceLike) {
        ['invoiceNumber','plannedPaymentDate','vatRate','paymentStatus','paymentScheduleJson'].forEach(clear);
        const paymentStatus = root.querySelector('[name="paymentStatus"]');
        if (paymentStatus) paymentStatus.value = 'unknown';
    }
    if (!invoiceLike && normalized !== 'contrat') clear('dueDate');
    if (!amountLike) ['amountHt','amountTva','amountTtc'].forEach(clear);
    if (!invoiceLike && normalized !== 'don') clear('paymentMethod');
}
function pad2V0581(value) { return String(value || '').padStart(2, '0'); }
function safeFilenamePartV0581(value) {
    return String(value || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');
}
function documentTypeCodeV0581(type) {
    const t = normalizeDocumentTypeV054(type || 'divers');
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
function buildSmartDocumentFilenameV0581(data = {}, doc = {}) {
    const date = String(data.invoiceDate || data.detectedDate || doc.invoice_date || doc.detected_date || doc.added_at || '').slice(0, 10);
    const y = (date.match(/(20\d{2})/) || String(doc.filename || '').match(/(20\d{2})/) || [String(new Date().getFullYear())])[0];
    let m = (date.match(/20\d{2}-(\d{2})/) || String(doc.filename || '').match(/(?:^|[-_])(0[1-9]|1[0-2])(?:[-_]|$)/) || [null, pad2V0581(new Date().getMonth()+1)])[1];
    m = pad2V0581(m);
    const supplier = safeFilenamePartV0581(data.supplier || doc.detected_supplier || doc.third_party_name || 'Document');
    const code = documentTypeCodeV0581(data.docType || doc.doc_type);
    const title = safeFilenamePartV0581(data.documentTitle || doc.document_title || '');
    const ref = safeFilenamePartV0581(data.invoiceNumber || doc.invoice_number || doc.detected_reference || '');
    const parts = [`${y}-${m}`, supplier || title || 'Document', code];
    if (ref) parts.push(ref);
    else if (title && !parts.includes(title)) parts.push(title.slice(0, 40));
    return parts.filter(Boolean).join('_') + '.pdf';
}

async function saveDocumentEditorV0454() {
    const data = formDataFromDocumentEditorV0454();
    if (!data) return;
    const before = selectedDocumentV033 || {};
    const updated = await window.api.updateDocumentAccountingV0452(data);
    try {
        const shouldRename = document.getElementById('autoRenameDocumentV0581')?.checked !== false;
        if (shouldRename && window.api.renameDocument) {
            const smartFilename = buildSmartDocumentFilenameV0581(data, before);
            if (smartFilename && smartFilename !== before.filename) {
                await window.api.renameDocument({ documentId: data.documentId, newFilename: smartFilename });
            }
        }
    } catch (renameError) {
        console.warn('Renommage intelligent V0.58.1 impossible', renameError);
    }
    const rules = [];
    if ((data.supplier || '') && data.supplier !== (before.detected_supplier || before.third_party_name || '')) {
        rules.push({ supplier: data.supplier, fieldName: 'supplier', learnedValue: data.supplier, keyword: data.supplier, sourceLabel: before.detected_supplier || before.filename || '' });
    }
    ['amountHt','amountTva','amountTtc','invoiceDate','dueDate','plannedPaymentDate','paymentMethod','invoiceNumber'].forEach(field => {
        const oldMap = { amountHt:'amount_ht', amountTva:'amount_tva', amountTtc:'amount_ttc', invoiceDate:'invoice_date', dueDate:'due_date', plannedPaymentDate:'planned_payment_date', paymentMethod:'payment_method', invoiceNumber:'invoice_number' };
        const oldValue = before[oldMap[field]] ?? '';
        const newValue = data[field] ?? '';
        if (String(newValue) && String(newValue) !== String(oldValue) && data.supplier) {
            rules.push({ supplier: data.supplier, fieldName: field, learnedValue: String(newValue), keyword: field, sourceLabel: before.filename || '' });
        }
    });
    if (rules.length && window.api.saveDocumentLearningRulesV0452) {
        await window.api.saveDocumentLearningRulesV0452({ companyId: selectedCompany ? selectedCompany.id : null, rules });
    }
    selectedDocumentV033 = updated || { ...selectedDocumentV033, ...data };
    focusToastV041('Document enregistré, nettoyé selon son type et renommage intelligent appliqué si possible.', 'success');
    await loadDocuments();
    if (selectedDocumentV033) renderDocumentPreviewV033(selectedDocumentV033);
}

function setEditorFieldV0454(name, value) {
    const root = document.getElementById('documentEditorV0454');
    const input = root?.querySelector(`[name="${name}"]`);
    if (!input) return;
    input.value = value;
    const check = document.getElementById('documentVatCheckV0454');
    if (check) {
        const data = formDataFromDocumentEditorV0454() || {};
        check.innerHTML = vatWarningV0454(data.amountHt, data.amountTva, data.amountTtc);
    }
}

async function rerunDocumentAnalysisV0454() {
    focusToastV041('Réanalyse OCR : relance l’import du document si les données sources ont changé. Les candidats affichés sont recalculés depuis le texte OCR stocké.', 'info');
    renderDocumentPreviewV033(selectedDocumentV033);
}

function bindDocumentExpertActionsV0454(doc) {
    const root = document.getElementById('documentPreviewV033');
    if (!root || !doc) return;
    root.querySelectorAll('[data-use-field-v0454]').forEach(btn => {
        btn.addEventListener('click', () => setEditorFieldV0454(btn.dataset.useFieldV0454, btn.dataset.useValueV0454 || ''));
    });
    root.querySelectorAll('#documentEditorV0454 input, #documentEditorV0454 select').forEach(input => {
        input.addEventListener('input', () => {
            const data = formDataFromDocumentEditorV0454() || {};
            const check = document.getElementById('documentVatCheckV0454');
            if (check) check.innerHTML = vatWarningV0454(data.amountHt, data.amountTva, data.amountTtc);
        });
    });
    const editor = root.querySelector('#documentEditorV0454');
    const typeSelect = editor?.querySelector('[name="docType"]');
    if (editor && typeSelect) {
        applyDocumentTypeRulesV053(editor, typeSelect.value || doc.doc_type || 'facture');
        typeSelect.addEventListener('change', () => {
            purgeEditorIncompatibleFieldsV0581(editor, typeSelect.value);
            applyDocumentTypeRulesV053(editor, typeSelect.value);
        });
    }
    root.querySelector('[data-doc-action-v0454="save"]')?.addEventListener('click', saveDocumentEditorV0454);
    root.querySelector('[data-doc-action-v0454="reanalyze"]')?.addEventListener('click', rerunDocumentAnalysisV0454);
    root.querySelector('[data-doc-action-v0454="open"]')?.addEventListener('click', () => window.api.openFile(doc.filepath));
}

function renderCandidateButtonsV0454(doc) {
    const amounts = collectAmountsV0454(doc);
    const dates = collectDatesV0454(doc);
    const suppliers = collectSupplierCandidatesV0454(doc);
    const amountButtons = amounts.map(c => `
        <button class="doc-candidate-chip-v0453" data-use-field-v0454="${c.label === 'HT' ? 'amountHt' : c.label === 'TVA' ? 'amountTva' : c.label === 'TTC' ? 'amountTtc' : 'amountTtc'}" data-use-value-v0454="${c.amount.toFixed(2)}" title="${escapeHtmlV0454(c.context)}">${escapeHtmlV0454(c.label)} · ${formatAmount(c.amount)}</button>
    `).join('');
    const dateButtons = dates.map(c => `
        <button class="doc-candidate-chip-v0453" data-use-field-v0454="${c.label === 'Échéance' ? 'dueDate' : 'invoiceDate'}" data-use-value-v0454="${escapeHtmlV0454(c.value)}" title="${escapeHtmlV0454(c.context)}">${escapeHtmlV0454(c.label)} · ${escapeHtmlV0454(c.display)}</button>
    `).join('');
    const supplierButtons = suppliers.map(c => `
        <button class="doc-candidate-chip-v0453" data-use-field-v0454="supplier" data-use-value-v0454="${escapeHtmlV0454(c.name)}" title="${escapeHtmlV0454(c.context)}">${escapeHtmlV0454(c.name)} · ${c.score}%</button>
    `).join('');
    return `
        <div class="doc-candidates-v0453">
            <h4>Fournisseurs candidats</h4><div>${supplierButtons || '<span class="muted">Aucun candidat fiable.</span>'}</div>
            <h4>Montants candidats</h4><div>${amountButtons || '<span class="muted">Aucun montant détecté.</span>'}</div>
            <h4>Dates candidates</h4><div>${dateButtons || '<span class="muted">Aucune date détectée.</span>'}</div>
        </div>
    `;
}


function renderFieldConfidenceV0455(doc) {
    let data = {};
    try { data = JSON.parse(doc.field_confidence_json || '{}') || {}; } catch (error) { data = {}; }
    const labels = {
        supplier: 'Fournisseur', invoiceNumber: 'N° facture', invoiceDate: 'Date facture', dueDate: 'Échéance',
        plannedPaymentDate: 'Date prélèvement', amountHt: 'HT', amountTva: 'TVA', amountTtc: 'TTC', paymentMethod: 'Règlement'
    };
    const items = Object.entries(labels).map(([key, label]) => {
        const value = Number(data[key] || 0);
        const cls = value >= 90 ? 'ok' : value >= 65 ? 'warn' : 'bad';
        return `<span class="doc-field-confidence-v0455 ${cls}">${label} ${value || 0}%</span>`;
    }).join('');
    return `<div class="doc-field-confidence-wrap-v0455"><strong>Confiance par champ</strong><div>${items}</div></div>`;
}

const renderDocumentPreviewBeforeV0454 = renderDocumentPreviewV033;
renderDocumentPreviewV033 = function(doc) {
    const title = document.getElementById('documentPreviewTitleV033');
    const preview = document.getElementById('documentPreviewV033');
    if (!preview) return;
    if (!doc) return renderDocumentPreviewBeforeV0454(doc);
    if (title) title.textContent = doc.filename;
    preview.className = 'document-preview-v033 document-preview-v0454';
    document.querySelectorAll('.document-preview-tabs-v033 button').forEach(button => {
        button.classList.toggle('active', button.dataset.previewTab === previewTabV036);
    });

    if (previewTabV036 === 'info') {
        const supplier = doc.detected_supplier || doc.third_party_name || '';
        preview.innerHTML = `
            <div class="document-expert-split-v0454">
                <form id="documentEditorV0454" class="document-editor-v0454" onsubmit="return false;">
                    <div class="document-editor-header-v0454">
                        <strong>Validation comptable</strong>
                        <span>Corrige les champs, puis enregistre. Les corrections alimentent l’apprentissage.</span>
                    </div>
                    <label>Type<select name="docType">
                        ${['facture','avoir','releve','contrat','administratif','informatif','don','rib','divers'].map(t => `<option value="${t}" ${String(doc.doc_type || 'facture') === t ? 'selected' : ''}>${docTypeLabelV033(t)}</option>`).join('')}
                    </select></label>
                    ${renderDocumentTypeHelpV053(doc.doc_type || 'facture')}
                    <label data-doc-field-v053="title">Titre / libellé<input name="documentTitle" value="${escapeHtmlV0454(doc.document_title || '')}" placeholder="Ex : Courrier URSSAF mars 2026, Contrat mutuelle..."></label>
                    <label data-doc-field-v053="supplier">Tiers / organisme<input name="supplier" value="${escapeHtmlV0454(supplier)}" placeholder="Ex : EDF, SwissLife, URSSAF..."></label>
                    <label data-doc-field-v053="invoiceNumber">N° facture / référence<input name="invoiceNumber" value="${escapeHtmlV0454(doc.invoice_number || doc.detected_reference || '')}"></label>
                    <div class="document-editor-grid-v0454">
                        <label data-doc-field-v053="invoiceDate">Date document<input name="invoiceDate" type="date" value="${escapeHtmlV0454(normalizeDocumentDateInputV0454(doc.invoice_date || doc.detected_date || ''))}"></label>
                        <label data-doc-field-v053="dueDate">Échéance / fin contrat<input name="dueDate" type="date" value="${escapeHtmlV0454(normalizeDocumentDateInputV0454(doc.due_date || ''))}"></label>
                        <label data-doc-field-v053="plannedPaymentDate">Date prélèvement prévue<input name="plannedPaymentDate" type="date" value="${escapeHtmlV0454(normalizeDocumentDateInputV0454(doc.planned_payment_date || ''))}"></label>
                    </div>
                    <div class="document-editor-grid-v0454" data-doc-field-v053="amounts">
                        <label>HT<input name="amountHt" inputmode="decimal" value="${escapeHtmlV0454(amountInputV0454(doc.amount_ht || ''))}"></label>
                        <label>TVA<input name="amountTva" inputmode="decimal" value="${escapeHtmlV0454(amountInputV0454(doc.amount_tva || ''))}"></label>
                        <label>TTC / montant<input name="amountTtc" inputmode="decimal" value="${escapeHtmlV0454(amountInputV0454(doc.amount_ttc || doc.detected_amount || ''))}"></label>
                    </div>
                    <div class="document-editor-grid-v0454">
                        <label data-doc-field-v053="vat">Taux TVA %<input name="vatRate" inputmode="decimal" value="${escapeHtmlV0454(amountInputV0454(doc.vat_rate || ''))}"></label>
                        <label data-doc-field-v053="paymentStatus">Statut paiement<select name="paymentStatus">
                            ${['unknown','unpaid','paid','partial'].map(s => `<option value="${s}" ${String(doc.payment_status || 'unknown') === s ? 'selected' : ''}>${s === 'unknown' ? 'À déterminer' : s === 'unpaid' ? 'À payer' : s === 'paid' ? 'Payée' : 'Partiel'}</option>`).join('')}
                        </select></label>
                        <label data-doc-field-v053="paymentMethod">Mode règlement<select name="paymentMethod">
                            ${['','Prélèvement','CB','Virement','Chèque','Espèces','Fintecture'].map(m => `<option value="${m}" ${String(doc.payment_method || '') === m ? 'selected' : ''}>${m || 'Non détecté'}</option>`).join('')}
                        </select></label>
                    </div>
                    <label data-doc-field-v053="paymentSchedule">Échéancier paiement<textarea name="paymentScheduleJson" rows="3" placeholder='[{"date":"2026-03-15","amount":1000,"status":"planned"}]'>${escapeHtmlV0454(doc.payment_schedule_json || '')}</textarea></label>
                    <label data-doc-field-v053="notes">Informations / notes<textarea name="documentNotes" rows="3" placeholder="Informations utiles, commentaire interne, consignes de classement...">${escapeHtmlV0454(doc.document_notes || '')}</textarea></label>
                    <label class="auto-rename-toggle-v0581"><input id="autoRenameDocumentV0581" type="checkbox" checked> Renommer automatiquement au format AAAA-MM_TIERS_TYPE_REFERENCE.pdf</label>
                    <div class="smart-name-preview-v0581">Nom proposé : ${escapeHtmlV0454(buildSmartDocumentFilenameV0581({ docType: doc.doc_type, supplier, invoiceDate: doc.invoice_date || doc.detected_date, invoiceNumber: doc.invoice_number || doc.detected_reference, documentTitle: doc.document_title }, doc))}</div>
                    ${renderFieldConfidenceV0455(doc)}
                    <div id="documentVatCheckV0454">${vatWarningV0454(doc.amount_ht, doc.amount_tva, doc.amount_ttc || doc.detected_amount)}</div>
                    <div class="document-editor-actions-v0454">
                        <button type="button" data-doc-action-v0454="save">Enregistrer</button>
                        <button type="button" class="secondary-button" data-doc-action-v0454="reanalyze">Réanalyser</button>
                        <button type="button" class="secondary-button" data-doc-action-v0454="open">Ouvrir</button>
                    </div>
                    ${renderCandidateButtonsV0454(doc)}
                </form>
                <div class="document-preview-panel-v0453">
                    <div class="document-preview-toolbar-v0453"><strong>Aperçu du document</strong><button type="button" data-doc-action-v0454="open">Ouvrir</button></div>
                    ${renderInlinePreviewV0454(doc)}
                </div>
            </div>
        `;
        bindDocumentExpertActionsV0454(doc);
        return;
    }

    if (previewTabV036 === 'ocr') {
        preview.innerHTML = `
            <div class="document-expert-split-v0454">
                <div>
                    <div class="document-editor-header-v0454"><strong>OCR Expert</strong><span>Clique sur une valeur pour la recopier dans le formulaire Informations.</span></div>
                    ${renderCandidateButtonsV0454(doc)}
                    <textarea class="document-ocr-text-v0454" readonly>${escapeHtmlV0454(doc.ocr_text || 'OCR complet non disponible pour ce document.')}</textarea>
                </div>
                <div class="document-preview-panel-v0453">
                    <div class="document-preview-toolbar-v0453"><strong>Aperçu du document</strong><button type="button" data-doc-action-v0454="open">Ouvrir</button></div>
                    ${renderInlinePreviewV0454(doc)}
                </div>
            </div>
        `;
        bindDocumentExpertActionsV0454(doc);
        return;
    }

    renderDocumentPreviewBeforeV0454(doc);
};


// ===========================
// Focus Compta V0.54.3 - Correctif statuts documentaires + fermeture aperçu
// ===========================
function documentDisplayStatusV0542(doc = {}) {
    const type = normalizeDocumentTypeV054(doc.doc_type || doc.docType || 'divers');
    const rule = getDocumentTypeRuleV053(type);
    const status = String(doc.status || '').toLowerCase();
    const payment = String(doc.payment_status || '').toLowerCase();

    if (status === 'matched') return '✅ Rapproché';
    if (status === 'archived') return '✅ Archivé';
    if (status === 'ignored') return '⚪ Ignoré';

    if (rule.matching === 'none') {
        if (type === 'contrat') {
            if (doc.due_date) {
                const end = new Date(doc.due_date);
                if (!Number.isNaN(end.getTime())) {
                    const now = new Date();
                    const days = Math.ceil((end - now) / 86400000);
                    if (days < 0) return '🔴 Expiré';
                    if (days <= 90) return '🟠 Expire bientôt';
                }
            }
            return '✅ Actif';
        }
        if (type === 'rib') return '✅ À vérifier';
        if (type === 'releve') return '✅ Importé';
        if (type === 'administratif' || type === 'informatif') return '✅ Classé';
        return '✅ Archivé';
    }

    if (rule.matching === 'optional' && payment !== 'unpaid') return '🟡 Rapprochement facultatif';
    if (payment === 'paid') return '✅ Payé';
    return '🟡 Non rapproché';
}

function closeDocumentPreviewPanelV0542() {
    selectedDocumentV033 = null;
    document.querySelectorAll('.document-row-v033').forEach(row => row.classList.remove('selected'));
    const title = document.getElementById('documentPreviewTitleV033');
    const preview = document.getElementById('documentPreviewV033');
    const panel = document.querySelector('.document-preview-panel-v033');
    if (title) title.textContent = 'Aperçu';
    if (preview) {
        preview.className = 'document-preview-v033 empty-state';
        preview.textContent = 'Sélectionne un document.';
    }
    if (panel) panel.classList.add('document-preview-hidden-v0542');
}

function openDocumentPreviewPanelV0542() {
    const panel = document.querySelector('.document-preview-panel-v033');
    if (panel) panel.classList.remove('document-preview-hidden-v0542');
}

const renderDocumentPreviewBeforeV0542 = renderDocumentPreviewV033;
renderDocumentPreviewV033 = function(doc) {
    if (doc) openDocumentPreviewPanelV0542();
    return renderDocumentPreviewBeforeV0542(doc);
};

if (!window.__focusDocumentPreviewCloseV0542) {
    window.__focusDocumentPreviewCloseV0542 = true;
    document.addEventListener('click', event => {
        const close = event.target && event.target.closest && event.target.closest('#closeDocumentPreviewV033');
        if (!close) return;
        event.preventDefault();
        event.stopPropagation();
        closeDocumentPreviewPanelV0542();
    }, true);
}

if (typeof window !== 'undefined') {
    window.documentDisplayStatusV0542 = documentDisplayStatusV0542;
    window.closeDocumentPreviewPanelV0542 = closeDocumentPreviewPanelV0542;
}
