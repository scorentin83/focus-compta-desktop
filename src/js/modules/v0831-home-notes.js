// Focus Compta V0.84.2 — Post-its avancés : modal, drag & drop, pièces jointes.
(function focusHomeNotesV0842() {
    const STORAGE_KEY = 'focus_compta_global_sticky_notes_v0831';
    const COLORS = ['note-soft-yellow', 'note-soft-blue', 'note-soft-green', 'note-soft-pink'];
    let editingNoteId = null;
    let currentAttachment = null;
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
            return Array.isArray(parsed) ? parsed.map((note, index) => ({ sortOrder: index, ...note })) : [];
        } catch (_) { return []; }
    }

    function saveNotes(notes) {
        const normalized = (notes || []).map((note, index) => ({ ...note, sortOrder: index }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }

    function formatDate(value) {
        if (!value) return '';
        try { return new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
        catch (_) { return ''; }
    }

    function attachmentLabel(att) {
        if (!att) return '';
        if (att.type === 'document') return `Document · ${att.name || 'Pièce jointe'}`;
        if (att.type === 'file') return `PJ · ${att.name || 'Fichier importé'}`;
        return att.name || 'Pièce jointe';
    }

    function ensureModal() {
        let modal = document.getElementById('stickyNoteModalV0832');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'stickyNoteModalV0832';
        modal.className = 'sticky-note-modal-v0832';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="sticky-note-modal-backdrop-v0832" data-note-cancel></div>
            <div class="sticky-note-modal-card-v0832" role="dialog" aria-modal="true" aria-labelledby="stickyNoteModalTitleV0832">
                <div class="section-title-row compact-title-row">
                    <div>
                        <span class="eyebrow">Post-it</span>
                        <h2 id="stickyNoteModalTitleV0832">Nouvelle note</h2>
                    </div>
                    <button type="button" class="secondary-button" data-note-cancel>Fermer</button>
                </div>
                <label>Titre
                    <input id="stickyNoteTitleV0832" type="text" placeholder="À penser">
                </label>
                <label>Note
                    <textarea id="stickyNoteContentV0832" rows="5" placeholder="Écris ta note ici…"></textarea>
                </label>
                <label>Couleur
                    <select id="stickyNoteColorV0832">
                        <option value="note-soft-yellow">Jaune doux</option>
                        <option value="note-soft-blue">Bleu doux</option>
                        <option value="note-soft-green">Vert doux</option>
                        <option value="note-soft-pink">Rose doux</option>
                    </select>
                </label>
                <div>
                    <span class="eyebrow">Pièce jointe</span>
                    <div class="sticky-note-attachment-controls-v0842">
                        <button id="attachExistingDocumentV0842" type="button">Document existant</button>
                        <button id="attachNewDocumentV0842" type="button">Importer une PJ</button>
                        <button id="removeAttachmentV0842" type="button">Retirer</button>
                    </div>
                    <p id="stickyNoteAttachmentPreviewV0842" class="sticky-note-attachment-preview-v0842 muted">Aucune pièce jointe.</p>
                </div>
                <div class="button-row sticky-note-modal-actions-v0832">
                    <button id="saveStickyNoteV0832" type="button">Enregistrer</button>
                    <button type="button" class="secondary-button" data-note-cancel>Annuler</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.querySelectorAll('[data-note-cancel]').forEach(btn => btn.addEventListener('click', closeModal));
        document.getElementById('saveStickyNoteV0832')?.addEventListener('click', saveFromModal);
        document.getElementById('attachExistingDocumentV0842')?.addEventListener('click', openExistingDocumentPicker);
        document.getElementById('attachNewDocumentV0842')?.addEventListener('click', attachNewDocument);
        document.getElementById('removeAttachmentV0842')?.addEventListener('click', () => { currentAttachment = null; updateAttachmentPreview(); });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && modal.classList.contains('active')) closeModal();
        });
        return modal;
    }

    function updateAttachmentPreview() {
        const preview = document.getElementById('stickyNoteAttachmentPreviewV0842');
        if (!preview) return;
        preview.textContent = currentAttachment ? attachmentLabel(currentAttachment) : 'Aucune pièce jointe.';
        preview.classList.toggle('muted', !currentAttachment);
    }

    function openModal(note = null) {
        const modal = ensureModal();
        editingNoteId = note?.id || null;
        currentAttachment = note?.attachment || null;
        document.getElementById('stickyNoteModalTitleV0832').textContent = note ? 'Modifier le post-it' : 'Nouveau post-it';
        document.getElementById('stickyNoteTitleV0832').value = note?.title || '';
        document.getElementById('stickyNoteContentV0832').value = note?.content || '';
        document.getElementById('stickyNoteColorV0832').value = note?.color || COLORS[0];
        updateAttachmentPreview();
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        setTimeout(() => document.getElementById('stickyNoteTitleV0832')?.focus(), 50);
    }

    function closeModal() {
        const modal = document.getElementById('stickyNoteModalV0832');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        editingNoteId = null;
        currentAttachment = null;
    }

    function saveFromModal() {
        const notes = readNotes();
        const title = document.getElementById('stickyNoteTitleV0832')?.value?.trim() || 'Note';
        const content = document.getElementById('stickyNoteContentV0832')?.value?.trim() || '';
        const color = document.getElementById('stickyNoteColorV0832')?.value || COLORS[0];
        if (editingNoteId) {
            const note = notes.find(item => item.id === editingNoteId);
            if (note) Object.assign(note, { title, content, color, attachment: currentAttachment, updatedAt: new Date().toISOString() });
        } else {
            notes.unshift({
                id: `note_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                title, content, color, attachment: currentAttachment,
                updatedAt: new Date().toISOString(), sortOrder: 0
            });
        }
        saveNotes(notes);
        closeModal();
        renderNotes();
    }

    async function openExistingDocumentPicker() {
        let docs = [];
        try { docs = await window.api.getDocuments({ companyId: null, filters: { status: 'all' } }); } catch (_) { docs = []; }
        const picker = document.createElement('div');
        picker.className = 'sticky-note-modal-v0832 active';
        picker.innerHTML = `
            <div class="sticky-note-modal-backdrop-v0832" data-picker-close></div>
            <div class="sticky-note-modal-card-v0832 small" role="dialog" aria-modal="true">
                <span class="eyebrow">Document existant</span>
                <h2>Choisir une pièce jointe</h2>
                <div class="sticky-doc-picker-v0842">
                    ${(docs || []).slice(0, 80).map(doc => `<button type="button" data-doc-id="${esc(doc.id)}">${esc(doc.filename || doc.detected_supplier || 'Document')}<br><small>${esc(doc.company_name || 'Toutes sociétés')} · ${esc(doc.detected_date || '')}</small></button>`).join('') || '<p class="muted">Aucun document disponible.</p>'}
                </div>
                <div class="button-row"><button type="button" class="secondary-button" data-picker-close>Annuler</button></div>
            </div>`;
        document.body.appendChild(picker);
        const close = () => picker.remove();
        picker.querySelectorAll('[data-picker-close]').forEach(btn => btn.addEventListener('click', close));
        picker.querySelectorAll('[data-doc-id]').forEach(btn => btn.addEventListener('click', () => {
            const doc = docs.find(item => String(item.id) === String(btn.dataset.docId));
            if (doc) {
                currentAttachment = { type: 'document', documentId: doc.id, name: doc.filename || doc.detected_supplier || 'Document', filepath: doc.filepath || '' };
                updateAttachmentPreview();
            }
            close();
        }));
    }

    async function attachNewDocument() {
        let files = [];
        try { files = await window.api.selectDocuments(); } catch (_) { files = []; }
        if (!files?.length) return;
        const first = files[0];
        try {
            if (window.api.addDocuments && window.selectedCompany?.id) {
                const result = await window.api.addDocuments({ companyId: window.selectedCompany.id, companyName: window.selectedCompany.name, files: [first], docType: 'divers' });
                const added = result?.added?.[0];
                if (added) {
                    currentAttachment = { type: 'document', documentId: added.id, name: added.filename || first.filename, filepath: added.filepath || first.filepath };
                    updateAttachmentPreview();
                    return;
                }
            }
        } catch (error) { console.warn('Import PJ post-it impossible, lien fichier direct utilisé.', error); }
        currentAttachment = { type: 'file', name: first.filename, filepath: first.filepath };
        updateAttachmentPreview();
    }

    function editNote(id) { const note = readNotes().find(item => item.id === id); if (note) openModal(note); }

    function askDeleteNote(id) {
        const notes = readNotes();
        const note = notes.find(item => item.id === id);
        if (!note) return;
        const modal = document.createElement('div');
        modal.className = 'sticky-note-modal-v0832 active';
        modal.innerHTML = `
            <div class="sticky-note-modal-backdrop-v0832" data-delete-cancel></div>
            <div class="sticky-note-modal-card-v0832 small" role="dialog" aria-modal="true">
                <span class="eyebrow">Suppression</span>
                <h2>Supprimer ce post-it ?</h2>
                <p class="muted">${esc(note.title || 'Note')}</p>
                <div class="button-row">
                    <button type="button" class="danger-soft-button-v081" data-delete-confirm>Supprimer</button>
                    <button type="button" class="secondary-button" data-delete-cancel>Annuler</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.querySelectorAll('[data-delete-cancel]').forEach(btn => btn.addEventListener('click', close));
        modal.querySelector('[data-delete-confirm]')?.addEventListener('click', () => {
            saveNotes(notes.filter(item => item.id !== id));
            close(); renderNotes();
        });
    }

    function openAttachment(att) {
        if (!att?.filepath || !window.api?.openFile) return;
        window.api.openFile(att.filepath);
    }

    function moveNoteBefore(sourceId, targetId) {
        if (!sourceId || !targetId || sourceId === targetId) return;
        const notes = readNotes();
        const sourceIndex = notes.findIndex(note => note.id === sourceId);
        const targetIndex = notes.findIndex(note => note.id === targetId);
        if (sourceIndex < 0 || targetIndex < 0) return;
        const [source] = notes.splice(sourceIndex, 1);
        notes.splice(targetIndex, 0, source);
        saveNotes(notes);
        renderNotes();
    }

    function renderNotes() {
        const holder = document.getElementById('stickyNotesV0831');
        if (!holder) return;
        const notes = readNotes().sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
        if (!notes.length) {
            holder.innerHTML = '<p class="muted empty-notes-v0831">Aucun post-it pour le moment. Ajoute une note pour la retrouver à chaque session.</p>';
            return;
        }
        holder.innerHTML = notes.map(note => `
            <article class="sticky-note-v0831 ${esc(note.color || COLORS[0])}" draggable="true" data-note-id="${esc(note.id)}">
                <div class="sticky-note-head-v0831">
                    <strong>${esc(note.title || 'Note')}</strong>
                    <span>${esc(formatDate(note.updatedAt))}</span>
                </div>
                <p>${esc(note.content || '').replace(/\n/g, '<br>')}</p>
                ${note.attachment ? `<div class="sticky-note-attachment-v0842"><span>📎 ${esc(attachmentLabel(note.attachment))}</span><button type="button" data-note-open-attachment="${esc(note.id)}">Ouvrir</button></div>` : ''}
                <div class="sticky-note-actions-v0831">
                    <button type="button" data-note-edit="${esc(note.id)}">Modifier</button>
                    <button type="button" data-note-delete="${esc(note.id)}" class="danger-link-v0831">Supprimer</button>
                </div>
            </article>`).join('');
        holder.querySelectorAll('[data-note-edit]').forEach(btn => btn.addEventListener('click', () => editNote(btn.dataset.noteEdit)));
        holder.querySelectorAll('[data-note-delete]').forEach(btn => btn.addEventListener('click', () => askDeleteNote(btn.dataset.noteDelete)));
        holder.querySelectorAll('[data-note-open-attachment]').forEach(btn => btn.addEventListener('click', () => {
            const note = readNotes().find(item => item.id === btn.dataset.noteOpenAttachment);
            if (note?.attachment) openAttachment(note.attachment);
        }));
        holder.querySelectorAll('.sticky-note-v0831').forEach(card => {
            card.addEventListener('dragstart', event => { draggedNoteId = card.dataset.noteId; card.classList.add('dragging-v0842'); event.dataTransfer.effectAllowed = 'move'; });
            card.addEventListener('dragend', () => { draggedNoteId = null; card.classList.remove('dragging-v0842'); holder.querySelectorAll('.drag-over-v0842').forEach(el => el.classList.remove('drag-over-v0842')); });
            card.addEventListener('dragover', event => { event.preventDefault(); card.classList.add('drag-over-v0842'); });
            card.addEventListener('dragleave', () => card.classList.remove('drag-over-v0842'));
            card.addEventListener('drop', event => { event.preventDefault(); card.classList.remove('drag-over-v0842'); moveNoteBefore(draggedNoteId, card.dataset.noteId); });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('addStickyNoteV0831')?.addEventListener('click', () => openModal());
        renderNotes();
    });

    window.renderStickyNotesV0831 = renderNotes;
})();
