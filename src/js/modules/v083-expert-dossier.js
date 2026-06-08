// Focus Compta V0.83 - Dossier Expert, verrouillage période et contrôle intégrité
(function initExpertDossierV083() {
    const MONTHS = {
        '01':'Janvier','02':'Février','03':'Mars','04':'Avril','05':'Mai','06':'Juin',
        '07':'Juillet','08':'Août','09':'Septembre','10':'Octobre','11':'Novembre','12':'Décembre'
    };
    function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c])); }
    function money(value) { return Number(value || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }); }
    function percent(value) { return `${Math.max(0, Math.min(100, Math.round(Number(value || 0))))} %`; }
    function getCompany() {
        try { if (typeof selectedCompany !== 'undefined' && selectedCompany) return selectedCompany; } catch (_) {}
        return window.selectedCompany || null;
    }
    function getPeriod() {
        const year = document.getElementById('accountingControlYearV047')?.value || String(new Date().getFullYear());
        const month = document.getElementById('accountingControlMonthV047')?.value || String(new Date().getMonth() + 1).padStart(2, '0');
        return { year: String(year), month: String(month).padStart(2, '0') };
    }
    function toast(message, type = 'success') {
        if (typeof focusToastV041 === 'function') focusToastV041(message, type);
        else if (typeof showToastV0409 === 'function') showToastV0409(message);
        else console.log(message);
    }
    function checkIcon(check) { return check.ok ? '✅' : '⚠️'; }
    function statusLabel(status) {
        if (status === 'ready') return 'Prêt';
        if (status === 'to_review') return 'À contrôler';
        return 'Incomplet';
    }
    async function refreshExpertDossierV083() {
        const target = document.getElementById('expertDossierV083');
        if (!target) return;
        const company = getCompany();
        const { year, month } = getPeriod();
        if (!company?.id) {
            target.innerHTML = '<div class="empty-state">Sélectionne une société pour préparer le dossier expert.</div>';
            return;
        }
        target.classList.add('loading');
        try {
            const dossier = await window.api.getExpertDossierV083({ companyId: company.id, year, month });
            const checks = Array.isArray(dossier.checks) ? dossier.checks : [];
            const missing = Array.isArray(dossier.missing) ? dossier.missing : [];
            target.innerHTML = `
                <div class="expert-header-v083 ${esc(dossier.status || '')}">
                    <div>
                        <span class="eyebrow">${esc(MONTHS[month] || month)} ${esc(year)}</span>
                        <h2>Dossier expert ${dossier.locked ? '🔒' : ''}</h2>
                        <p class="muted">Score de préparation avant transmission au cabinet comptable.</p>
                    </div>
                    <div class="expert-score-v083">
                        <strong>${percent(dossier.readyScore || 0)}</strong>
                        <span>${esc(statusLabel(dossier.status))}</span>
                    </div>
                </div>
                <div class="expert-checks-v083">
                    ${checks.map(check => `
                        <article class="expert-check-v083 ${check.ok ? 'ok' : 'warn'}">
                            <strong>${checkIcon(check)} ${esc(check.label)}</strong>
                            <span>${esc(check.detail || '')}</span>
                        </article>
                    `).join('')}
                </div>
                <div class="expert-summary-v083">
                    <div><span>Documents à transmettre</span><strong>${Number(dossier.exportPreview?.documentsCount || 0)}</strong></div>
                    <div><span>Relevés du mois</span><strong>${Number(dossier.exportPreview?.statementsCount || 0)}</strong></div>
                    <div><span>Total TTC docs</span><strong>${money(dossier.exportPreview?.totalTtc || 0)}</strong></div>
                    <div><span>État période</span><strong>${dossier.locked ? 'Verrouillée' : 'Ouverte'}</strong></div>
                </div>
                ${missing.length ? `
                    <div class="expert-missing-v083">
                        <h4>Points à corriger avant transmission</h4>
                        ${missing.map(item => `<div><strong>${esc(item.label)}</strong><span>${esc(item.detail || '')}</span></div>`).join('')}
                    </div>
                ` : '<p class="expert-ready-v083">✅ Aucun blocage majeur détecté pour ce mois.</p>'}
                <div class="expert-actions-v083">
                    <button id="expertExportMonthV083" type="button">Exporter le mois</button>
                    <button id="expertArchiveMonthV083" class="secondary-button" type="button">Archive complète</button>
                    <button id="expertToggleLockV083" class="${dossier.locked ? 'danger-button' : 'secondary-button'}" type="button">${dossier.locked ? 'Déverrouiller la période' : 'Verrouiller la période'}</button>
                    <button id="expertRefreshV083" class="secondary-button" type="button">Actualiser</button>
                </div>
                ${dossier.locked ? `<p class="muted lock-note-v083">Période verrouillée ${dossier.lock?.lockedAt ? `le ${esc(String(dossier.lock.lockedAt).slice(0, 16))}` : ''}. Les réimports de caisse sont bloqués pour cette période.</p>` : ''}
            `;
            target.querySelector('#expertExportMonthV083')?.addEventListener('click', async () => {
                try {
                    const result = await window.api.createAccountingTransmissionExportV0456({ companyId: company.id, year, month });
                    toast(`Export du mois créé : ${result.filename || 'ZIP'}`);
                    if (result.filepath) await window.api.openFile(result.filepath);
                    await refreshExpertDossierV083();
                    if (typeof window.refreshAccountingControlV047 === 'function') window.refreshAccountingControlV047();
                } catch (error) { toast(error.message || 'Export impossible.', 'danger'); }
            });
            target.querySelector('#expertArchiveMonthV083')?.addEventListener('click', async () => {
                try {
                    const result = await window.api.createAccountingArchiveV0456({ companyId: company.id, year, month });
                    toast(`Archive du mois créée : ${result.filename || 'ZIP'}`);
                    if (result.filepath) await window.api.openFile(result.filepath);
                    await refreshExpertDossierV083();
                } catch (error) { toast(error.message || 'Archive impossible.', 'danger'); }
            });
            target.querySelector('#expertToggleLockV083')?.addEventListener('click', async () => {
                const currentUser = typeof window.api.getCurrentUserV081 === 'function' ? await window.api.getCurrentUserV081() : null;
                const nextLocked = !dossier.locked;
                const msg = nextLocked
                    ? `Verrouiller ${MONTHS[month] || month} ${year} ? Les réimports de caisse seront bloqués sur cette période.`
                    : `Déverrouiller ${MONTHS[month] || month} ${year} ?`;
                if (!confirm(msg)) return;
                await window.api.setPeriodLockV083({ companyId: company.id, year, month, locked: nextLocked, actor: currentUser?.displayName || currentUser?.display_name || 'Utilisateur', note: nextLocked ? 'Validation dossier expert' : 'Déverrouillage manuel' });
                toast(nextLocked ? 'Période verrouillée.' : 'Période déverrouillée.');
                await refreshExpertDossierV083();
            });
            target.querySelector('#expertRefreshV083')?.addEventListener('click', refreshExpertDossierV083);
        } catch (error) {
            console.error(error);
            target.innerHTML = `<p class="error-text">${esc(error.message || error)}</p>`;
        } finally {
            target.classList.remove('loading');
        }
    }
    function bind() {
        document.querySelectorAll('.accounting-tab-v0825[data-accounting-tab="expert"]').forEach(btn => btn.addEventListener('click', () => setTimeout(refreshExpertDossierV083, 40)));
        document.getElementById('accountingControlYearV047')?.addEventListener('change', refreshExpertDossierV083);
        document.getElementById('accountingControlMonthV047')?.addEventListener('change', refreshExpertDossierV083);
        document.querySelectorAll('.nav-button[data-page="accountingPage"], .nav-shortcut[data-page="accountingPage"]').forEach(btn => btn.addEventListener('click', () => setTimeout(refreshExpertDossierV083, 120)));
        setTimeout(refreshExpertDossierV083, 500);
    }
    window.refreshExpertDossierV083 = refreshExpertDossierV083;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();
