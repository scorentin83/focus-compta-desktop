// Focus Compta V0.40 module
function documentTypeLabelV030(type) {
    const labels = {
        facture: '🧾 Facture',
        releve: '📄 Relevé',
        contrat: '📑 Contrat',
        rib: '🏦 RIB',
        divers: '📁 Divers'
    };
    return labels[type] || labels.facture;
}

async function loadMatchingPage() {
    const list = document.getElementById('matchingDocumentList');
    const suggestions = document.getElementById('matchingSuggestionList');
    const preview = document.getElementById('matchingPreview');
    const help = document.getElementById('matchingHelp');

    if (!list) return;

    list.innerHTML = '';
    if (suggestions) suggestions.innerHTML = '';
    if (preview) preview.innerHTML = 'Aucun document sélectionné.';
    if (help) help.textContent = 'Sélectionne un document à gauche.';

    const docs = await window.api.getDocuments({
        companyId: selectedCompany ? selectedCompany.id : null,
        filters: { status: 'unmatched' }
    });

    window.__focusMatchingDocsV040 = docs;

    if (!docs.length) {
        list.innerHTML = '<div class="empty-state">Aucun document à rapprocher.</div>';
        return;
    }

    docs.forEach(doc => {
        const item = document.createElement('article');
        item.className = 'document-card matching-doc-v030';
        item.innerHTML = `
            <strong>${doc.filename}</strong>
            <span>${documentTypeLabelV030(doc.doc_type || 'facture')}</span>
            <span>${doc.detected_amount ? formatAmount(doc.detected_amount) : 'Montant non détecté'}</span>
            ${doc.detected_supplier ? `<small>${doc.detected_supplier}</small>` : ''}
        `;
        item.addEventListener('click', async () => {
            document.querySelectorAll('.matching-doc-v030').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            await showMatchingSuggestions(doc);
        });
        list.appendChild(item);
    });
}

async function showMatchingSuggestions(doc) {
    const suggestions = document.getElementById('matchingSuggestionList');
    const preview = document.getElementById('matchingPreview');
    const help = document.getElementById('matchingHelp');

    if (help) help.textContent = `Suggestions pour ${doc.filename}`;
    if (preview) {
        preview.innerHTML = `
            <strong>${doc.filename}</strong>
            <p>${documentTypeLabelV030(doc.doc_type || 'facture')}</p>
            <p>Montant : ${doc.detected_amount ? formatAmount(doc.detected_amount) : 'Non détecté'}</p>
            <p>Date : ${doc.detected_date || 'Non détectée'}</p>
            <p>Référence : ${doc.detected_reference || 'Non détectée'}</p>
            <p>Fournisseur : ${doc.detected_supplier || 'Non détecté'}</p>
            <button id="openMatchingDocV030">Ouvrir le document</button>
        `;
        const open = document.getElementById('openMatchingDocV030');
        if (open) open.addEventListener('click', async () => await window.api.openFile(doc.filepath));
    }

    if (!suggestions) return;
    suggestions.innerHTML = '<div class="empty-state">Recherche des suggestions...</div>';

    if (!selectedCompany) {
        suggestions.innerHTML = '<div class="empty-state">Sélectionne une société.</div>';
        return;
    }

    const matches = await window.api.findDocumentMatches({
        companyId: selectedCompany.id,
        documentId: doc.id,
        limit: 10
    });

    suggestions.innerHTML = '';
    if (!matches.length) {
        suggestions.innerHTML = '<div class="empty-state">Aucune suggestion. Utilise l’onglet Documents pour l’association manuelle.</div>';
        return;
    }

    matches.forEach(match => {
        const card = document.createElement('article');
        card.className = 'match-card';
        card.innerHTML = `
            <strong>${match.date_operation || ''} — ${match.label}</strong>
            <span>${formatAmount(match.amount)} · score ${match.match_score}</span>
            <button>Associer</button>
        `;
        card.querySelector('button').addEventListener('click', async () => {
            await window.api.linkDocumentToTransaction({ documentId: doc.id, transactionId: match.id });
            if (selectedBankAccount) await refreshAccountView(false);
            await loadMatchingPage();
            await loadDocuments();
        });
        suggestions.appendChild(card);
    });
}
// Focus Compta V0.39.6 - Aperçu document dans Rapprochements
// ===========================

function matchingPreviewHtmlV0396(doc) {
    const safePath = String(doc.filepath || '').replace(/\\/g, '/');
    const lower = String(doc.filename || '').toLowerCase();
    let previewContent = '';

    if (lower.endsWith('.pdf')) {
        previewContent = `<iframe class="matching-doc-preview-frame-v0396" src="file:///${safePath}"></iframe>`;
    } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
        previewContent = `<img class="matching-doc-preview-image-v0396" src="file:///${safePath}" alt="${doc.filename}">`;
    } else {
        previewContent = `<div class="matching-doc-preview-placeholder-v0396">Aperçu indisponible pour ce type de fichier.</div>`;
    }

    return `
        <div class="matching-doc-info-v0396">
            <strong>${doc.filename}</strong>
            <p>${documentTypeLabelV030(doc.doc_type || 'facture')}</p>
            <p>Montant : ${doc.detected_amount ? formatAmount(doc.detected_amount) : 'Non détecté'}</p>
            <p>Date : ${doc.detected_date || 'Non détectée'}</p>
            <p>Référence : ${doc.detected_reference || 'Non détectée'}</p>
            <p>Fournisseur : ${doc.detected_supplier || 'Non détecté'}</p>
            <button id="openMatchingDocV030">Ouvrir le document</button>
        </div>
        <div class="matching-doc-preview-v0396">
            ${previewContent}
        </div>
    `;
}

/* Ancien wrapper showMatchingSuggestions V0.39.6 supprimé : la version fiable V0.39.8 est conservée plus bas. */


// ===========================
/* Ancien rendu de cartes V0.39.7 supprimé : rendu unique via renderMatchesV0398. */



// ===========================
// Focus Compta V0.39.8 - Associer rapprochements réparé + statut Validé
// ===========================

async function associateDocumentToTransactionV0398(doc, transactionId) {
    if (!doc || !transactionId) return;

    const result = await window.api.linkDocumentToTransaction({ documentId: doc.id, transactionId });
    if (result && result.ok === false) {
        focusToastV041(result.message || 'Association impossible.', 'warning');
        return;
    }

    if (selectedBankAccount) await refreshAccountView(false);
    await loadMatchingPage();
    await loadDocuments();

    const seriesMode = document.getElementById('matchingSeriesModeV040');
    if (seriesMode && seriesMode.checked && Array.isArray(window.__focusMatchingDocsV040) && window.__focusMatchingDocsV040.length) {
        await showMatchingSuggestions(window.__focusMatchingDocsV040[0]);
        const firstCard = document.querySelector('.matching-doc-v030');
        if (firstCard) firstCard.classList.add('selected');
    }
}

function renderMatchCardV0398(container, doc, match) {
    const card = document.createElement('article');
    card.className = 'match-card';
    const delta = doc.detected_amount
        ? Math.abs(Math.abs(Number(match.amount || 0)) - Math.abs(Number(doc.detected_amount || 0)))
        : null;

    card.innerHTML = `
        <strong>${match.date_operation || ''} — ${match.label}</strong>
        <span>${formatAmount(match.amount)}${match.match_score !== undefined ? ` · score ${match.match_score}` : ''}${delta !== null ? ` · écart ${formatAmount(delta)}` : ''}</span>
        <button type="button">Associer</button>
    `;

    card.querySelector('button').addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        await associateDocumentToTransactionV0398(doc, match.id);
    });

    container.appendChild(card);
}

function renderMatchesV0398(container, doc, matches, emptyText = 'Aucune opération trouvée.') {
    container.innerHTML = '';
    if (!matches || !matches.length) {
        container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
        return;
    }
    matches.forEach(match => renderMatchCardV0398(container, doc, match));
}

showMatchingSuggestions = async function(doc) {
    const suggestions = document.getElementById('matchingSuggestionList');
    const preview = document.getElementById('matchingPreview');
    const help = document.getElementById('matchingHelp');

    if (help) help.textContent = `Suggestions pour ${doc.filename}`;

    if (preview && typeof matchingPreviewHtmlV0396 === 'function') {
        preview.innerHTML = matchingPreviewHtmlV0396(doc);
        const open = document.getElementById('openMatchingDocV030');
        if (open) open.addEventListener('click', async () => await window.api.openFile(doc.filepath));
    }

    if (!suggestions) return;

    if (!selectedCompany) {
        suggestions.innerHTML = '<div class="empty-state">Sélectionne une société.</div>';
        return;
    }

    suggestions.innerHTML = `
        <div class="matching-search-v0397 matching-search-v040">
            <input id="matchingSearchInputV0397" placeholder="Libellé, fournisseur, référence...">
            <input id="matchingSupplierFilterV040" placeholder="Fournisseur" value="${doc.detected_supplier || ''}">
            <input id="matchingAmountFilterV040" type="number" step="0.01" placeholder="Montant" value="${doc.detected_amount || ''}">
            <input id="matchingDateFilterV040" type="date" value="${doc.detected_date || ''}">
            <label class="matching-series-v040"><input id="matchingSeriesModeV040" type="checkbox"> Rapprochement en série</label>
            <button id="matchingSearchButtonV0397" type="button">Rechercher</button>
        </div>
        <div id="matchingSearchResultsV0397"></div>
        <h3>Suggestions</h3>
        <div id="matchingSuggestedResultsV0397"><div class="empty-state">Recherche des suggestions...</div></div>
    `;

    const suggested = document.getElementById('matchingSuggestedResultsV0397');
    const matches = await window.api.findDocumentMatches({
        companyId: selectedCompany.id,
        documentId: doc.id,
        limit: 10
    });
    renderMatchesV0398(suggested, doc, matches, 'Aucune suggestion. Utilise la recherche manuelle ci-dessus.');

    const input = document.getElementById('matchingSearchInputV0397');
    const supplierInput = document.getElementById('matchingSupplierFilterV040');
    const amountInput = document.getElementById('matchingAmountFilterV040');
    const dateInput = document.getElementById('matchingDateFilterV040');
    const button = document.getElementById('matchingSearchButtonV0397');
    const results = document.getElementById('matchingSearchResultsV0397');

    const runSearch = async () => {
        const queryParts = [
            input.value.trim(),
            supplierInput.value.trim(),
            amountInput.value.trim(),
            dateInput.value.trim()
        ].filter(Boolean);
        const query = queryParts.join(' ');
        if (!query) {
            results.innerHTML = '<div class="empty-state">Renseigne au moins un filtre.</div>';
            return;
        }

        results.innerHTML = '<div class="empty-state">Recherche...</div>';
        const rows = await window.api.searchTransactionsForDocument({
            companyId: selectedCompany.id,
            query,
            limit: 30
        });

        results.innerHTML = '<h3>Résultats de recherche</h3>';
        const list = document.createElement('div');
        list.className = 'matching-result-list-v0398';
        results.appendChild(list);
        renderMatchesV0398(list, doc, rows);
    };

    button.addEventListener('click', runSearch);
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') runSearch();
    });
};

// ===========================
// Focus Compta V0.45 - Score de confiance + auto rapprochement
// ===========================
function confidenceClassV045(score) {
    const value = Number(score || 0);
    if (value >= 90) return 'high';
    if (value >= 60) return 'medium';
    return 'low';
}

const renderMatchCardV0398OriginalV045 = renderMatchCardV0398;
renderMatchCardV0398 = function(container, doc, match) {
    const card = document.createElement('article');
    card.className = `match-card smart-match-card-v045 ${confidenceClassV045(match.match_score)}`;
    const delta = doc.amount_ttc || doc.detected_amount
        ? Math.abs(Math.abs(Number(match.amount || 0)) - Math.abs(Number(doc.amount_ttc || doc.detected_amount || 0)))
        : null;
    const score = Number(match.match_score || 0);
    card.innerHTML = `
        <div class="smart-match-main-v045">
            <strong>${match.date_operation || ''} — ${match.label}</strong>
            <span>${formatAmount(match.amount)}${delta !== null ? ` · écart ${formatAmount(delta)}` : ''}</span>
            <small>${match.match_reasons || 'Score calculé sur montant, libellé et date.'}</small>
        </div>
        <div class="smart-match-actions-v045">
            <span class="confidence-pill-v045 ${confidenceClassV045(score)}">${score}%</span>
            <button type="button">Associer</button>
        </div>
    `;
    card.querySelector('button').addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        await associateDocumentToTransactionV0398(doc, match.id);
    });
    container.appendChild(card);
};

async function runAutoReconcileFromMatchingV045() {
    if (!selectedCompany || !window.api.autoReconcileDocuments) {
        focusToastV041('Sélectionne une société.', 'warning');
        return;
    }
    showProgressV0409?.('Rapprochement automatique', 'Recherche des associations avec confiance élevée...');
    try {
        const result = await window.api.autoReconcileDocuments({ companyId: selectedCompany.id, threshold: 95, limit: 300 });
        focusToastV041(`${result.linked || 0} document(s) rapproché(s) automatiquement.`, result.linked ? 'success' : 'info');
        await loadMatchingPage();
        if (typeof loadDocuments === 'function') await loadDocuments();
        if (selectedCompany && typeof loadCompanyDashboardV038 === 'function') await loadCompanyDashboardV038(selectedCompany.id);
    } finally {
        hideProgressV0409?.();
    }
}

(function bindMatchingV045() {
    function bind() {
        const button = document.getElementById('matchingAutoReconcileV045');
        if (button && !button.dataset.boundV045) {
            button.dataset.boundV045 = '1';
            button.addEventListener('click', runAutoReconcileFromMatchingV045);
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();

// ===========================
// Focus Compta V0.45.6 - Rapprochement multiple / partiel
// ===========================
async function showGroupedMatchForTransactionV0456(transactionId, doc) {
    if (!selectedCompany || !transactionId) return;
    const container = document.getElementById('matchingSuggestedResultsV0397') || document.getElementById('matchingSearchResultsV0397') || document.getElementById('matchingSuggestionList');
    if (!container) return;
    const block = document.createElement('article');
    block.className = 'match-card grouped-match-card-v0456';
    block.innerHTML = '<strong>Recherche de rapprochement multiple...</strong>';
    container.prepend(block);
    try {
        const result = await window.api.findMultipleDocumentMatchesV0456({ companyId: selectedCompany.id, transactionId, options: { tolerance: 0.02 } });
        const best = result?.best || {};
        const docs = best.docs || [];
        const rows = docs.map(d => `<li><label><input type="checkbox" checked data-group-doc-v0456="${d.id}"> ${d.filename} — ${formatAmount(d.amount_ttc || d.detected_amount || 0)}</label></li>`).join('');
        block.innerHTML = `
            <div class="smart-match-main-v045">
                <strong>Rapprochement multiple proposé</strong>
                <span>Opération : ${formatAmount(result.targetAmount || 0)}</span>
                <small>Retrouvé : ${formatAmount(best.total || 0)} · Reste : ${formatAmount(best.remaining || 0)} · Complétude ${best.completeness || 0}%</small>
                ${docs.length ? `<ul class="grouped-doc-list-v0456">${rows}</ul>` : '<p class="muted">Aucune combinaison fiable trouvée.</p>'}
            </div>
            <div class="smart-match-actions-v045">
                <span class="confidence-pill-v045 ${best.exact ? 'high' : (best.partial ? 'medium' : 'low')}">${best.exact ? 'Complet' : (best.partial ? 'Partiel' : 'À vérifier')}</span>
                ${docs.length ? '<button type="button" data-group-validate-v0456>Valider sélection</button>' : ''}
            </div>`;
        const validate = block.querySelector('[data-group-validate-v0456]');
        if (validate) validate.addEventListener('click', async () => {
            const ids = Array.from(block.querySelectorAll('[data-group-doc-v0456]:checked')).map(input => Number(input.dataset.groupDocV0456)).filter(Boolean);
            if (!ids.length) return focusToastV041('Sélectionne au moins un document.', 'warning');
            const linked = await window.api.linkMultipleDocumentsToTransactionV0456({ transactionId, documentIds: ids, tolerance: 0.02 });
            focusToastV041(`Rapprochement ${linked.status === 'matched' ? 'complet' : 'partiel'} : reste ${formatAmount(linked.remaining || 0)}.`, linked.status === 'matched' ? 'success' : 'warning');
            await loadMatchingPage();
            if (typeof loadDocuments === 'function') await loadDocuments();
        });
    } catch (error) {
        block.innerHTML = `<strong>Rapprochement multiple impossible</strong><small>${String(error.message || error)}</small>`;
    }
}

const renderMatchCardBeforeV0456 = renderMatchCardV0398;
renderMatchCardV0398 = function(container, doc, match) {
    renderMatchCardBeforeV0456(container, doc, match);
    const card = container.lastElementChild;
    if (!card || !match?.id) return;
    const actions = card.querySelector('.smart-match-actions-v045') || card;
    const multi = document.createElement('button');
    multi.type = 'button';
    multi.className = 'secondary-button small-button';
    multi.textContent = 'Associer plusieurs';
    multi.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        await showGroupedMatchForTransactionV0456(match.id, doc);
    });
    actions.appendChild(multi);
};
