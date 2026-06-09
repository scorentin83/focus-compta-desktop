// Focus Compta V0.82 - Sécurité, sauvegardes avancées, profil sidebar et actualisation globale.
(function focusSecurityRefreshV082() {
    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
        else fn();
    }

    function esc(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function roleLabel(role) {
        if (role === 'admin') return 'Administrateur';
        if (role === 'direction') return 'Direction';
        if (role === 'collaborateur') return 'Collaborateur';
        if (role === 'expert_comptable') return 'Expert-comptable';
        return role || 'Utilisateur local';
    }

    function formatDate(value) {
        if (!value) return 'Jamais';
        try { return new Date(value).toLocaleString('fr-FR'); } catch (_) { return String(value); }
    }

    async function currentUser() {
        try { return window.api?.getCurrentUserV081 ? await window.api.getCurrentUserV081() : null; } catch (_) { return null; }
    }

    async function audit(actionType, label, details) {
        try {
            if (window.api?.addAuditLogV080) await window.api.addAuditLogV080({ actionType, entityType: 'system', label, details: details || {} });
        } catch (_) {}
    }

    function ensureGlobalRefreshButton() {
        const bar = document.getElementById('companyContextBar');
        if (!bar) return;
        let button = document.getElementById('globalRefreshV082');
        if (!button) {
            const wrap = document.createElement('div');
            wrap.className = 'global-refresh-wrap-v082';
            wrap.innerHTML = `
                <button id="globalRefreshV082" type="button" class="global-refresh-button-v082" title="Forcer la mise à jour de tous les modules">↻ Actualiser</button>
            `;
            bar.insertAdjacentElement('beforeend', wrap);
            button = document.getElementById('globalRefreshV082');
        }
        if (button && button.dataset.boundV082 !== '1') {
            button.dataset.boundV082 = '1';
            button.addEventListener('click', globalRefreshV082);
        }
    }

    function ensureSidebarProfile() {
        const footer = document.querySelector('.sidebar-footer');
        if (!footer || document.getElementById('sidebarUserProfileV082')) return;
        const profile = document.createElement('div');
        profile.id = 'sidebarUserProfileV082';
        profile.className = 'sidebar-user-profile-v082';
        profile.innerHTML = `
            <div class="sidebar-user-avatar-v082">U</div>
            <div class="sidebar-user-info-v082">
                <strong id="sidebarUserNameV082">Utilisateur local</strong>
                <span id="sidebarUserRoleV082">Chargement…</span>
                <small id="sidebarAppVersionV0832">v0.84.2</small>
            </div>
            <button id="sidebarUsersShortcutV082" type="button" title="Utilisateurs et rôles">⚙</button>
        `;
        footer.insertAdjacentElement('afterbegin', profile);
        document.getElementById('sidebarUsersShortcutV082')?.addEventListener('click', openUsersSettingsV082);
        updateSidebarProfileV082();
    }

    async function updateSidebarProfileV082() {
        const user = await currentUser();
        const name = document.getElementById('sidebarUserNameV082');
        const role = document.getElementById('sidebarUserRoleV082');
        const avatar = document.querySelector('.sidebar-user-avatar-v082');
        const displayName = user?.displayName || 'Utilisateur local';
        if (name) name.textContent = displayName;
        if (role) role.textContent = roleLabel(user?.role);
        if (avatar) avatar.textContent = displayName.trim().charAt(0).toUpperCase() || 'U';
        document.body.classList.toggle('expert-readonly-v081', user?.role === 'expert_comptable' || user?.permissions?.readOnly === true);
    }

    function openUsersSettingsV082() {
        if (window.showPage) window.showPage('settingsPage');
        setTimeout(() => {
            const tab = document.querySelector('[data-settings-tab="usersV081"]') || document.querySelector('[data-settings-tab="foundationV080"]');
            tab?.click();
        }, 150);
    }

    async function globalRefreshV082() {
        const btn = document.getElementById('globalRefreshV082');
        if (btn) { btn.disabled = true; btn.textContent = '↻ Actualisation…'; }
        const results = [];
        const run = async (name, fn) => {
            try {
                if (typeof fn === 'function') {
                    await fn();
                    results.push({ name, ok: true });
                }
            } catch (error) {
                console.warn('[V0.82] refresh failed:', name, error);
                results.push({ name, ok: false, error: String(error?.message || error) });
            }
        };

        // Recalcule / relit les principaux modules sans changer de page.
        await run('Accueil', window.renderCockpitV050 || window.renderHomeV050 || window.updateHomeFoundationV080);
        await run('Santé comptable', window.renderAccountingHealthV080);
        await run('TVA', window.renderVatCenterV073 || window.refreshVatCenterV073);
        await run('Audit', window.loadAuditV080);
        await run('Utilisateurs', window.renderUsersPanelV081);
        await run('Badge utilisateur', window.updateUserBadgeV081);
        await run('Profil sidebar', updateSidebarProfileV082);

        // Certains modules historiques sont branchés uniquement par boutons.
        ['refreshAccountingControlV047','refreshVatCenterV073','refreshHomeFoundationV080','refreshUsersV081','refreshAuditV080','refreshBackupsV080','refreshCashControlV0612','refreshCompanyCashV0602','refreshBankOperations','refreshDocumentTreeV033'].forEach(id => {
            const el = document.getElementById(id);
            try { if (el) { el.click(); results.push({ name: id, ok: true }); } } catch (_) {}
        });

        const now = new Date().toISOString();
        localStorage.setItem('focus.v082.lastRefresh', now);
        if (btn) { btn.disabled = false; btn.textContent = '↻ Actualiser'; }
        await audit('global_refresh', 'Actualisation globale', { modules: results });
        if (window.showToast) {
            const ok = results.filter(r => r.ok).length;
            const ko = results.filter(r => !r.ok).length;
            window.showToast(`Actualisation terminée : ${ok} module(s) relu(s)${ko ? `, ${ko} erreur(s)` : ''}.`, ko ? 'warning' : 'success');
        }
    }

    function enhanceFoundationBackupsPanel() {
        const panel = document.querySelector('[data-settings-panel="foundationV080"]');
        if (!panel || document.getElementById('backupAdvancedV082')) return;
        const firstPanel = panel.querySelector('.panel.clean-panel');
        if (!firstPanel) return;
        const advanced = document.createElement('div');
        advanced.id = 'backupAdvancedV082';
        advanced.className = 'backup-advanced-v082';
        advanced.innerHTML = `
            <div class="section-title-row compact-title-row">
                <div>
                    <span class="eyebrow">V0.82 · Sauvegardes avancées</span>
                    <h3>Sauvegarde automatique locale</h3>
                    <p class="muted">Crée une sauvegarde quotidienne au démarrage si aucune sauvegarde n'a été créée aujourd'hui.</p>
                </div>
            </div>
            <label class="toggle-line-v043"><input type="checkbox" id="autoBackupEnabledV082"> Activer la sauvegarde automatique quotidienne</label>
            <div class="backup-state-v082">
                <span>Dernière sauvegarde auto</span>
                <strong id="lastAutoBackupV082">${esc(formatDate(localStorage.getItem('focus.v082.lastAutoBackup')))}</strong>
            </div>
            <p class="muted small-v082">La restauration demande une confirmation forte pour éviter toute erreur.</p>
        `;
        firstPanel.appendChild(advanced);
        const checkbox = document.getElementById('autoBackupEnabledV082');
        if (checkbox) {
            checkbox.checked = localStorage.getItem('focus.v082.autoBackup') === '1';
            checkbox.addEventListener('change', () => {
                localStorage.setItem('focus.v082.autoBackup', checkbox.checked ? '1' : '0');
                if (window.showToast) window.showToast(checkbox.checked ? 'Sauvegarde automatique activée.' : 'Sauvegarde automatique désactivée.', 'success');
                if (checkbox.checked) maybeRunAutoBackupV082();
            });
        }
        hardenRestoreButtonsV082();
    }

    async function maybeRunAutoBackupV082() {
        if (localStorage.getItem('focus.v082.autoBackup') !== '1') return;
        if (!window.api?.createBackup) return;
        const today = new Date().toISOString().slice(0, 10);
        const last = localStorage.getItem('focus.v082.lastAutoBackupDay');
        if (last === today) return;
        try {
            await window.api.createBackup();
            localStorage.setItem('focus.v082.lastAutoBackupDay', today);
            const now = new Date().toISOString();
            localStorage.setItem('focus.v082.lastAutoBackup', now);
            const el = document.getElementById('lastAutoBackupV082');
            if (el) el.textContent = formatDate(now);
            await audit('auto_backup_created', 'Sauvegarde automatique quotidienne', { day: today });
            if (window.showToast) window.showToast('Sauvegarde automatique créée.', 'success');
        } catch (error) {
            console.warn('[V0.82] auto backup failed', error);
            if (window.showToast) window.showToast('Sauvegarde automatique impossible.', 'warning');
        }
    }

    function showRestoreConfirmModalV082(onConfirm) {
        const modal = document.createElement('div');
        modal.className = 'sticky-note-modal-v0832 active';
        modal.innerHTML = `
            <div class="sticky-note-modal-backdrop-v0832" data-restore-cancel></div>
            <div class="sticky-note-modal-card-v0832 small" role="dialog" aria-modal="true">
                <span class="eyebrow">Restauration</span>
                <h2>Confirmer la restauration</h2>
                <p class="muted">Cette action remplacera les données actuelles. Saisis RESTAURER pour confirmer.</p>
                <input id="restoreConfirmInputV082" type="text" placeholder="RESTAURER">
                <div class="button-row">
                    <button type="button" data-restore-confirm>Restaurer</button>
                    <button type="button" class="secondary-button" data-restore-cancel>Annuler</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.querySelectorAll('[data-restore-cancel]').forEach(btn => btn.addEventListener('click', () => {
            close();
            if (window.showToast) window.showToast('Restauration annulée.', 'warning');
        }));
        modal.querySelector('[data-restore-confirm]')?.addEventListener('click', () => {
            const value = modal.querySelector('#restoreConfirmInputV082')?.value || '';
            if (value !== 'RESTAURER') {
                if (window.showToast) window.showToast('Saisie incorrecte. Restauration annulée.', 'warning');
                return;
            }
            close();
            onConfirm();
        });
        setTimeout(() => modal.querySelector('#restoreConfirmInputV082')?.focus(), 50);
    }

    function hardenRestoreButtonsV082() {
        document.addEventListener('click', event => {
            const restore = event.target?.closest?.('[data-restore]');
            if (!restore || restore.dataset.v082StrongConfirm === '1') return;
            event.preventDefault();
            event.stopPropagation();
            showRestoreConfirmModalV082(() => {
                restore.dataset.v082StrongConfirm = '1';
                restore.click();
                setTimeout(() => { restore.dataset.v082StrongConfirm = '0'; }, 1000);
            });
        }, true);
    }

    function bindSettingsEnhancer() {
        document.addEventListener('click', event => {
            if (event.target?.closest?.('[data-page="settingsPage"], [data-settings-tab="foundationV080"]')) {
                setTimeout(enhanceFoundationBackupsPanel, 250);
            }
        });
    }

    function interceptDangerousDeletes() {
        document.addEventListener('click', event => {
            const target = event.target?.closest?.('button');
            if (!target || target.dataset.v082DeleteConfirmed === '1') return;
            const text = (target.textContent || '').trim();
            const danger = /supprimer|désactiver|restaurer|écraser/i.test(text) || target.className?.toString?.().includes('danger');
            if (!danger) return;
            // Restauration traitée séparément pour éviter double confirmation.
            if (target.hasAttribute('data-restore')) return;
            const ok = confirm(`Confirmer l'action sensible : ${text || 'action'} ?`);
            if (!ok) {
                event.preventDefault();
                event.stopPropagation();
            } else {
                target.dataset.v082DeleteConfirmed = '1';
                setTimeout(() => { target.dataset.v082DeleteConfirmed = '0'; }, 1000);
            }
        }, true);
    }

    ready(async () => {
        ensureGlobalRefreshButton();
        ensureSidebarProfile();
        bindSettingsEnhancer();
        interceptDangerousDeletes();
        setTimeout(enhanceFoundationBackupsPanel, 500);
        await maybeRunAutoBackupV082();
        document.addEventListener('click', event => {
            if (event.target?.closest?.('[data-action="set-current"], [data-action="save-user"], [data-action="disable-user"]')) {
                setTimeout(updateSidebarProfileV082, 400);
            }
        });
    });

    window.globalRefreshV082 = globalRefreshV082;
    window.updateSidebarProfileV082 = updateSidebarProfileV082;
})();
