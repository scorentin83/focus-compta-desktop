// Focus Compta V0.84.2 — Polish UI + post-its avancés
(function focusPolishUiNotesV0842() {
    const STORAGE_KEY = 'focus_compta_global_sticky_notes_v0831';
    const COLORS = ['note-soft-yellow', 'note-soft-blue', 'note-soft-green', 'note-soft-pink'];
    let editingNoteId = null;
    let draggedNoteId = null;

    function esc(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function readNotes() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) { return []; }
    }

    function saveNotes(notes) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify((notes || []).map((note, index) => ({ ...note, order: index }))));
    }

    function normalizeNotes(notes) {
        return (Array.isArray(notes) ? notes : [])
            .map((note, index) => ({ ...note, order: Number.isFinite(Number(note.order)) ? Number(note.order) : index }))
            .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    }

    function formatDate(value) {
        if (!value) return '';
        try { return new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
        catch (_) { return ''; }
    }

    function attachmentLabel(note) {
        if (!note?.attachment) return '';
        return note.attachment.name || note.attachment.filename || note.attachment.filepath || 'Pièce jointe';
    }

    function ensureNoteModal() {
        let modal = document.getElementById('stickyNoteModalV0842');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'stickyNoteModalV0842';
        modal.className = 'sticky-note-modal-v0832';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="sticky-note-modal-backdrop-v0832" data-note-cancel></div>
            <div class="sticky-note-modal-card-v0832" role="dialog" aria-modal="true" aria-labelledby="stickyNoteModalTitleV0842">
                <div class="section-title-row compact-title-row">
                    <div>
                        <span class="eyebrow">Post-it</span>
                        <h2 id="stickyNoteModalTitleV0842">Nouvelle note</h2>
                    </div>
                    <button type="button" class="secondary-button" data-note-cancel>Fermer</button>
                </div>
                <label>Titre
                    <input id="stickyNoteTitleV0842" type="text" placeholder="À penser">
                </label>
                <label>Note
                    <textarea id="stickyNoteContentV0842" rows="5" placeholder="Écris ta note ici…"></textarea>
                </label>
                <label>Couleur
                    <select id="stickyNoteColorV0842">
                        <option value="note-soft-yellow">Jaune doux</option>
                        <option value="note-soft-blue">Bleu doux</option>
                        <option value="note-soft-green">Vert doux</option>
                        <option value="note-soft-pink">Rose doux</option>
                    </select>
                </label>
                <div class="note-attachment-box-v0842">
                    <div>
                        <span class="eyebrow">Pièce jointe</span>
                        <strong id="stickyNoteAttachmentLabelV0842">Aucune pièce jointe</strong>
                    </div>
                    <div class="button-row">
                        <button id="attachExistingDocumentV0842" type="button" class="secondary-button small-button">Document existant</button>
                        <button id="attachNewDocumentV0842" type="button" class="secondary-button small-button">Importer</button>
                        <button id="removeNoteAttachmentV0842" type="button" class="secondary-button small-button">Retirer</button>
                    </div>
                </div>
                <div class="button-row sticky-note-modal-actions-v0832">
                    <button id="saveStickyNoteV0842" type="button">Enregistrer</button>
                    <button type="button" class="secondary-button" data-note-cancel>Annuler</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelectorAll('[data-note-cancel]').forEach(btn => btn.addEventListener('click', closeNoteModal));
        document.getElementById('saveStickyNoteV0842')?.addEventListener('click', saveNoteFromModal);
        document.getElementById('attachExistingDocumentV0842')?.addEventListener('click', chooseExistingDocumentForNote);
        document.getElementById('attachNewDocumentV0842')?.addEventListener('click', importAttachmentForNote);
        document.getElementById('removeNoteAttachmentV0842')?.addEventListener('click', () => {
            modal.dataset.attachment = '';
            updateAttachmentLabel(null);
        });
        return modal;
    }

    function updateAttachmentLabel(attachment) {
        const label = document.getElementById('stickyNoteAttachmentLabelV0842');
        if (!label) return;
        label.textContent = attachment ? attachmentLabel({ attachment }) : 'Aucune pièce jointe';
    }

    function openNoteModal(note = null) {
        const modal = ensureNoteModal();
        editingNoteId = note?.id || null;
        const attachment = note?.attachment || null;
        modal.dataset.attachment = attachment ? JSON.stringify(attachment) : '';
        document.getElementById('stickyNoteModalTitleV0842').textContent = note ? 'Modifier le post-it' : 'Nouveau post-it';
        document.getElementById('stickyNoteTitleV0842').value = note?.title || '';
        document.getElementById('stickyNoteContentV0842').value = note?.content || '';
        document.getElementById('stickyNoteColorV0842').value = note?.color || COLORS[0];
        updateAttachmentLabel(attachment);
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        setTimeout(() => document.getElementById('stickyNoteTitleV0842')?.focus(), 50);
    }

    function closeNoteModal() {
        const modal = document.getElementById('stickyNoteModalV0842');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        modal.dataset.attachment = '';
        editingNoteId = null;
    }

    function getModalAttachment() {
        const raw = document.getElementById('stickyNoteModalV0842')?.dataset.attachment || '';
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (_) { return null; }
    }

    function saveNoteFromModal() {
        const notes = normalizeNotes(readNotes());
        const title = document.getElementById('stickyNoteTitleV0842')?.value?.trim() || 'Post-it';
        const content = document.getElementById('stickyNoteContentV0842')?.value?.trim() || '';
        const color = document.getElementById('stickyNoteColorV0842')?.value || COLORS[0];
        const attachment = getModalAttachment();
        if (editingNoteId) {
            const note = notes.find(item => item.id === editingNoteId);
            if (note) {
                note.title = title;
                note.content = content;
                note.color = color;
                note.attachment = attachment;
                note.updatedAt = new Date().toISOString();
            }
        } else {
            notes.unshift({
                id: `note_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                title,
                content,
                color,
                attachment,
                updatedAt: new Date().toISOString(),
                order: 0
            });
        }
        saveNotes(notes);
        closeNoteModal();
        renderNotesV0842();
    }

    async function chooseExistingDocumentForNote() {
        try {
            const docs = await window.api?.getDocuments?.({ companyId: null, filters: {} });
            const list = Array.isArray(docs) ? docs : (docs?.documents || docs?.items || []);
            if (!list.length) {
                showTinyToastV0842('Aucun document disponible.');
                return;
            }
            openDocumentPicker(list);
        } catch (error) {
            console.warn('Sélection document post-it impossible', error);
            showTinyToastV0842('Impossible de charger les documents.');
        }
    }

    function openDocumentPicker(documents) {
        const modal = document.createElement('div');
        modal.className = 'sticky-note-modal-v0832 active';
        modal.innerHTML = `
            <div class="sticky-note-modal-backdrop-v0832" data-picker-close></div>
            <div class="sticky-note-modal-card-v0832" role="dialog" aria-modal="true">
                <div class="section-title-row compact-title-row">
                    <div>
                        <span class="eyebrow">Documents</span>
                        <h2>Attacher un document</h2>
                    </div>
                    <button type="button" class="secondary-button" data-picker-close>Fermer</button>
                </div>
                <div class="note-document-picker-v0842">
                    ${documents.slice(0, 80).map(doc => `
                        <button type="button" data-doc-id="${esc(doc.id)}">
                            <strong>${esc(doc.filename || doc.original_filename || 'Document')}</strong>
                            <span>${esc(doc.detected_supplier || doc.detectedSupplier || doc.doc_type || '')}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.querySelectorAll('[data-picker-close]').forEach(btn => btn.addEventListener('click', close));
        modal.querySelectorAll('[data-doc-id]').forEach(btn => btn.addEventListener('click', () => {
            const doc = documents.find(item => String(item.id) === String(btn.dataset.docId));
            if (!doc) return;
            const attachment = {
                type: 'document',
                id: doc.id,
                name: doc.filename || doc.original_filename || 'Document',
                filepath: doc.filepath || doc.path || ''
            };
            const noteModal = document.getElementById('stickyNoteModalV0842');
            if (noteModal) noteModal.dataset.attachment = JSON.stringify(attachment);
            updateAttachmentLabel(attachment);
            close();
        }));
    }

    async function importAttachmentForNote() {
        try {
            const files = await window.api?.selectDocuments?.();
            if (!Array.isArray(files) || !files.length) return;
            const file = files[0];
            let attachment = { type: 'file', name: file.filename || 'Pièce jointe', filepath: file.filepath || '' };
            const activeCompany = (typeof selectedCompany !== 'undefined') ? selectedCompany : null;
            if (window.api?.addDocuments && activeCompany) {
                try {
                    const result = await window.api.addDocuments({ companyId: activeCompany.id, companyName: activeCompany.name, docType: 'informatif', files: [file] });
                    const added = result?.added?.[0];
                    if (added) attachment = { type: 'document', id: added.id, name: added.filename || file.filename, filepath: added.filepath || file.filepath };
                } catch (importError) {
                    console.warn('Import document post-it impossible, pièce attachée en lien fichier', importError);
                }
            }
            const noteModal = document.getElementById('stickyNoteModalV0842');
            if (noteModal) noteModal.dataset.attachment = JSON.stringify(attachment);
            updateAttachmentLabel(attachment);
        } catch (error) {
            console.warn('Import pièce jointe post-it impossible', error);
            showTinyToastV0842('Import de la pièce jointe impossible.');
        }
    }

    function editNote(id) {
        const note = normalizeNotes(readNotes()).find(item => item.id === id);
        if (note) openNoteModal(note);
    }

    function askDeleteNote(id) {
        const notes = normalizeNotes(readNotes());
        const note = notes.find(item => item.id === id);
        if (!note) return;
        const modal = document.createElement('div');
        modal.className = 'sticky-note-modal-v0832 active';
        modal.innerHTML = `
            <div class="sticky-note-modal-backdrop-v0832" data-delete-cancel></div>
            <div class="sticky-note-modal-card-v0832 small" role="dialog" aria-modal="true">
                <span class="eyebrow">Suppression</span>
                <h2>Supprimer ce post-it ?</h2>
                <p class="muted">${esc(note.title || 'Post-it')}</p>
                <div class="button-row">
                    <button type="button" class="danger-soft-button-v081" data-delete-confirm>Supprimer</button>
                    <button type="button" class="secondary-button" data-delete-cancel>Annuler</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.querySelectorAll('[data-delete-cancel]').forEach(btn => btn.addEventListener('click', close));
        modal.querySelector('[data-delete-confirm]')?.addEventListener('click', () => {
            saveNotes(notes.filter(item => item.id !== id));
            close();
            renderNotesV0842();
        });
    }

    async function openAttachment(note) {
        const attachment = note?.attachment;
        if (!attachment) return;
        if (attachment.filepath && window.api?.openFile) {
            await window.api.openFile(attachment.filepath);
            return;
        }
        showTinyToastV0842('Pièce jointe introuvable.');
    }

    function renderNotesV0842() {
        const holder = document.getElementById('stickyNotesV0831');
        if (!holder) return;
        const notes = normalizeNotes(readNotes());
        if (!notes.length) {
            holder.innerHTML = '<p class="muted empty-notes-v0831">Aucun post-it pour le moment.</p>';
            return;
        }
        holder.innerHTML = notes.map(note => `
            <article class="sticky-note-v0831 draggable-note-v0842 ${esc(note.color || COLORS[0])}" data-note-id="${esc(note.id)}" draggable="true">
                <div class="sticky-note-head-v0831">
                    <strong>${esc(note.title || 'Post-it')}</strong>
                    <span class="drag-handle-v0842" title="Déplacer">⋮⋮</span>
                </div>
                <p>${esc(note.content || '').replace(/\n/g, '<br>')}</p>
                ${note.attachment ? `<button type="button" class="note-attachment-link-v0842" data-note-open-attachment="${esc(note.id)}">📎 ${esc(attachmentLabel(note))}</button>` : ''}
                <div class="sticky-note-actions-v0831">
                    <span>${esc(formatDate(note.updatedAt))}</span>
                    <button type="button" data-note-edit="${esc(note.id)}">Modifier</button>
                    <button type="button" data-note-delete="${esc(note.id)}" class="danger-link-v0831">Supprimer</button>
                </div>
            </article>
        `).join('');
        holder.querySelectorAll('[data-note-edit]').forEach(btn => btn.addEventListener('click', () => editNote(btn.dataset.noteEdit)));
        holder.querySelectorAll('[data-note-delete]').forEach(btn => btn.addEventListener('click', () => askDeleteNote(btn.dataset.noteDelete)));
        holder.querySelectorAll('[data-note-open-attachment]').forEach(btn => btn.addEventListener('click', () => {
            const note = normalizeNotes(readNotes()).find(item => item.id === btn.dataset.noteOpenAttachment);
            openAttachment(note).catch(console.error);
        }));
        bindDragAndDrop(holder);
    }

    function bindDragAndDrop(holder) {
        holder.querySelectorAll('.draggable-note-v0842').forEach(card => {
            card.addEventListener('dragstart', event => {
                draggedNoteId = card.dataset.noteId;
                card.classList.add('dragging-v0842');
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', draggedNoteId);
            });
            card.addEventListener('dragend', () => {
                draggedNoteId = null;
                holder.querySelectorAll('.dragging-v0842').forEach(el => el.classList.remove('dragging-v0842'));
            });
            card.addEventListener('dragover', event => {
                event.preventDefault();
                const target = event.currentTarget;
                if (!draggedNoteId || target.dataset.noteId === draggedNoteId) return;
                const rect = target.getBoundingClientRect();
                const before = event.clientY < rect.top + rect.height / 2;
                const dragged = holder.querySelector(`[data-note-id="${CSS.escape(draggedNoteId)}"]`);
                if (!dragged) return;
                holder.insertBefore(dragged, before ? target : target.nextSibling);
            });
            card.addEventListener('drop', event => {
                event.preventDefault();
                saveCurrentNoteOrder(holder);
            });
        });
        holder.addEventListener('drop', () => saveCurrentNoteOrder(holder), { once: true });
    }

    function saveCurrentNoteOrder(holder) {
        const notes = normalizeNotes(readNotes());
        const ids = Array.from(holder.querySelectorAll('[data-note-id]')).map(el => el.dataset.noteId);
        const ordered = ids.map(id => notes.find(note => note.id === id)).filter(Boolean);
        notes.forEach(note => { if (!ids.includes(note.id)) ordered.push(note); });
        saveNotes(ordered);
    }

    function showTinyToastV0842(message) {
        let toast = document.getElementById('tinyToastV0842');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'tinyToastV0842';
            toast.className = 'tiny-toast-v0842';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('active');
        setTimeout(() => toast.classList.remove('active'), 2200);
    }

    function ensureCompanySelectorModal() {
        let modal = document.getElementById('companySelectorModalV0842');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'companySelectorModalV0842';
        modal.className = 'sticky-note-modal-v0832';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="sticky-note-modal-backdrop-v0832" data-company-selector-close></div>
            <div class="sticky-note-modal-card-v0832 small" role="dialog" aria-modal="true">
                <div class="section-title-row compact-title-row">
                    <div><span class="eyebrow">Structure</span><h2>Choisir une société</h2></div>
                    <button type="button" class="secondary-button" data-company-selector-close>Fermer</button>
                </div>
                <div id="companySelectorListV0842" class="company-selector-list-v0842"></div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelectorAll('[data-company-selector-close]').forEach(btn => btn.addEventListener('click', closeCompanySelector));
        return modal;
    }

    function closeCompanySelector() {
        const modal = document.getElementById('companySelectorModalV0842');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    async function openCompanySelector() {
        const modal = ensureCompanySelectorModal();
        const list = document.getElementById('companySelectorListV0842');
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        if (!list) return;
        list.innerHTML = '<p class="muted">Chargement…</p>';
        try {
            const companies = await window.api.getCompanies();
            list.innerHTML = (companies || []).map(company => `
                <button type="button" data-company-select="${esc(company.id)}">
                    <strong>${esc(company.name)}</strong>
                    <span>${(typeof selectedCompany !== 'undefined') && selectedCompany && String(selectedCompany.id) === String(company.id) ? 'Société ouverte' : 'Ouvrir'}</span>
                </button>
            `).join('') || '<p class="muted">Aucune société créée.</p>';
            list.querySelectorAll('[data-company-select]').forEach(btn => btn.addEventListener('click', async () => {
                const company = companies.find(item => String(item.id) === String(btn.dataset.companySelect));
                if (!company) return;
                if (typeof selectCompany === 'function') await selectCompany(company, false);
                if (typeof renderSelectedCompanyDossierV050 === 'function') await renderSelectedCompanyDossierV050();
                closeCompanySelector();
            }));
        } catch (error) {
            console.warn('Sélecteur société impossible', error);
            list.innerHTML = '<p class="muted">Impossible de charger les sociétés.</p>';
        }
    }

    function bindContextBarSelector() {
        const btn = document.getElementById('contextCompanyButton');
        if (!btn || btn.dataset.v0842Bound === '1') return;
        btn.dataset.v0842Bound = '1';
        btn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            openCompanySelector();
        }, true);
    }

    function createAddCompanyCard() {
        const article = document.createElement('article');
        article.className = 'company-add-card-v0842';
        article.innerHTML = `
            <span class="eyebrow">Nouvelle structure</span>
            <h3>Ajouter une société</h3>
            <input id="companyNameCardV0842" type="text" placeholder="Nom de la société">
            <button id="newCompanyCardV0842" type="button" class="primary-button">Ajouter</button>
        `;
        article.querySelector('#newCompanyCardV0842')?.addEventListener('click', async () => {
            const input = article.querySelector('#companyNameCardV0842');
            const name = input?.value?.trim();
            if (!name) return;
            await window.api.addCompany(name);
            input.value = '';
            if (typeof loadCompanies === 'function') await loadCompanies();
        });
        article.querySelector('#companyNameCardV0842')?.addEventListener('keydown', event => {
            if (event.key === 'Enter') article.querySelector('#newCompanyCardV0842')?.click();
        });
        return article;
    }

    function injectAddCompanyCard() {
        const list = document.getElementById('companyList');
        if (!list || list.querySelector('.company-add-card-v0842')) return;
        list.prepend(createAddCompanyCard());
    }

    function patchCompaniesLoad() {
        if (typeof loadCompanies !== 'function' || loadCompanies.datasetV0842 === '1') return;
        const original = loadCompanies;
        const patched = async function loadCompaniesV0842(...args) {
            const result = await original.apply(this, args);
            injectAddCompanyCard();
            return result;
        };
        patched.datasetV0842 = '1';
        window.loadCompanies = loadCompanies = patched;
    }

    function setVersionLabel() {
        const version = document.getElementById('sidebarAppVersionV0832');
        if (version) version.textContent = 'v0.84.2';
    }

    function watchSidebarVersion() {
        if (window.__focusV0842VersionObserver) return;
        window.__focusV0842VersionObserver = new MutationObserver(() => setVersionLabel());
        window.__focusV0842VersionObserver.observe(document.body, { childList: true, subtree: true });
        setVersionLabel();
    }

    function boot() {
        bindContextBarSelector();
        patchCompaniesLoad();
        injectAddCompanyCard();
        setVersionLabel();
        watchSidebarVersion();
        const oldAdd = document.getElementById('addStickyNoteV0831');
        if (oldAdd && oldAdd.dataset.v0842Bound !== '1') {
            oldAdd.dataset.v0842Bound = '1';
            oldAdd.replaceWith(oldAdd.cloneNode(true));
            document.getElementById('addStickyNoteV0831')?.addEventListener('click', () => openNoteModal());
        }
        renderNotesV0842();
    }

    document.addEventListener('DOMContentLoaded', boot);
    setTimeout(boot, 400);
    window.renderStickyNotesV0831 = renderNotesV0842;
    window.renderStickyNotesV0842 = renderNotesV0842;
})();
