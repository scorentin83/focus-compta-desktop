// Focus Compta V0.81 - Utilisateurs & rôles : préparation SaaS, accès société, lecture seule expert.
(function focusUsersRolesV081() {
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

    function roleBadge(role) {
        if (role === 'admin') return 'Administrateur';
        if (role === 'direction') return 'Direction';
        if (role === 'collaborateur') return 'Collaborateur';
        if (role === 'expert_comptable') return 'Expert-comptable';
        return role || '—';
    }

    async function getCompaniesSafe() {
        try { return window.api?.getCompanies ? await window.api.getCompanies() : []; } catch (_) { return []; }
    }

    async function getUsersSafe() {
        try { return window.api?.getAppUsersV081 ? await window.api.getAppUsersV081() : []; } catch (_) { return []; }
    }

    async function getRolesSafe() {
        try { return window.api?.getAppRolesV081 ? await window.api.getAppRolesV081() : []; } catch (_) { return []; }
    }

    async function getCurrentSafe() {
        try { return window.api?.getCurrentUserV081 ? await window.api.getCurrentUserV081() : null; } catch (_) { return null; }
    }

    function ensureUserBadgeV081() {
        const bar = document.getElementById('companyContextBar');
        if (!bar || document.getElementById('contextUserV081')) return;
        const pill = document.createElement('div');
        pill.className = 'context-pill user-pill-v081';
        pill.innerHTML = '<span>Utilisateur</span><strong id="contextUserV081">—</strong>';
        bar.appendChild(pill);
    }

    async function updateUserBadgeV081() {
        ensureUserBadgeV081();
        const badge = document.getElementById('contextUserV081');
        if (!badge) return;
        const current = await getCurrentSafe();
        badge.textContent = current ? `${current.displayName} · ${roleBadge(current.role)}` : 'Utilisateur local';
        document.body.classList.toggle('expert-readonly-v081', current?.role === 'expert_comptable' || current?.permissions?.readOnly === true);
    }

    function renderRoleOptions(roles, selected) {
        return (roles || []).map(role => `<option value="${esc(role.roleKey)}" ${role.roleKey === selected ? 'selected' : ''}>${esc(role.roleLabel)}</option>`).join('');
    }

    function renderCompanyChecks(companies, selectedIds = []) {
        const set = new Set((selectedIds || []).map(Number));
        if (!companies.length) return '<p class="muted">Aucune société créée pour le moment.</p>';
        return companies.map(company => `
            <label class="user-company-check-v081">
                <input type="checkbox" value="${Number(company.id)}" ${set.has(Number(company.id)) ? 'checked' : ''}>
                <span>${esc(company.name || company.company_name || 'Société')}</span>
            </label>
        `).join('');
    }

    function getCheckedCompanyIds(root) {
        return [...root.querySelectorAll('.user-company-check-v081 input:checked')].map(input => Number(input.value)).filter(Boolean);
    }

    function ensureSettingsPanelV081() {
        const sidebar = document.querySelector('.settings-sidebar-v043');
        const content = document.querySelector('.settings-content-v043');
        if (!sidebar || !content || document.querySelector('[data-settings-tab="usersV081"]')) return;

        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'settings-tab-v043';
        tab.dataset.settingsTab = 'usersV081';
        tab.textContent = '👥 Utilisateurs';
        const foundationTab = sidebar.querySelector('[data-settings-tab="foundationV080"]');
        if (foundationTab) sidebar.insertBefore(tab, foundationTab); else sidebar.appendChild(tab);

        const panel = document.createElement('div');
        panel.className = 'settings-panel-v043 users-panel-v081';
        panel.dataset.settingsPanel = 'usersV081';
        panel.innerHTML = `
            <div class="panel clean-panel">
                <div class="section-title-row compact-title-row">
                    <div>
                        <span class="eyebrow">V0.81 · Préparation SaaS</span>
                        <h2>Utilisateurs & rôles</h2>
                        <p class="muted">Prépare les accès par rôle et par société avant la mise en ligne sécurisée.</p>
                    </div>
                    <button id="refreshUsersV081" type="button" class="secondary-button">Actualiser</button>
                </div>
                <div id="currentUserBoxV081" class="current-user-box-v081 muted">Chargement…</div>
                <div id="usersListV081" class="users-list-v081 muted">Chargement…</div>
            </div>
            <div class="panel clean-panel">
                <span class="eyebrow">Nouvel utilisateur</span>
                <h2>Créer un accès</h2>
                <div class="user-form-grid-v081">
                    <input id="newUserNameV081" placeholder="Nom, ex : Expert-comptable">
                    <input id="newUserEmailV081" placeholder="Email optionnel">
                    <select id="newUserRoleV081"></select>
                </div>
                <div id="newUserCompaniesV081" class="user-company-grid-v081"></div>
                <textarea id="newUserNotesV081" placeholder="Notes internes, optionnel"></textarea>
                <div class="button-row">
                    <button id="createUserV081" type="button">Créer l'utilisateur</button>
                </div>
            </div>
            <div class="panel clean-panel">
                <span class="eyebrow">Permissions</span>
                <h2>Matrice des rôles</h2>
                <div id="rolesMatrixV081" class="roles-matrix-v081 muted">Chargement…</div>
            </div>
        `;
        content.appendChild(panel);

        document.querySelectorAll('.settings-tab-v043').forEach(btn => {
            if (btn.dataset.v081Bound) return;
            btn.dataset.v081Bound = '1';
            btn.addEventListener('click', () => {
                const selected = btn.dataset.settingsTab;
                document.querySelectorAll('.settings-tab-v043').forEach(b => b.classList.toggle('active', b === btn));
                document.querySelectorAll('.settings-panel-v043').forEach(p => p.classList.toggle('active', p.dataset.settingsPanel === selected));
                if (selected === 'usersV081') renderUsersPanelV081();
            });
        });

        document.getElementById('refreshUsersV081')?.addEventListener('click', renderUsersPanelV081);
        document.getElementById('createUserV081')?.addEventListener('click', createUserFromFormV081);
    }

    async function renderUsersPanelV081() {
        const panel = document.querySelector('[data-settings-panel="usersV081"]');
        if (!panel) return;
        const [roles, users, companies, current] = await Promise.all([getRolesSafe(), getUsersSafe(), getCompaniesSafe(), getCurrentSafe()]);

        const roleSelect = document.getElementById('newUserRoleV081');
        if (roleSelect) roleSelect.innerHTML = renderRoleOptions(roles, 'collaborateur');
        const companyBox = document.getElementById('newUserCompaniesV081');
        if (companyBox) companyBox.innerHTML = renderCompanyChecks(companies, companies.map(c => c.id));

        const currentBox = document.getElementById('currentUserBoxV081');
        if (currentBox) {
            currentBox.innerHTML = `
                <div class="current-user-card-v081">
                    <div>
                        <strong>${esc(current?.displayName || 'Utilisateur local')}</strong>
                        <small>${esc(roleBadge(current?.role))}${current?.email ? ' · ' + esc(current.email) : ''}</small>
                    </div>
                    <span>${current?.permissions?.readOnly ? 'Lecture seule' : 'Lecture / écriture'}</span>
                </div>
            `;
        }

        const list = document.getElementById('usersListV081');
        if (list) {
            list.innerHTML = users.length ? users.map(user => `
                <article class="user-card-v081 ${Number(user.isActive) ? '' : 'inactive'}" data-user-id="${Number(user.id)}">
                    <div class="user-card-main-v081">
                        <div>
                            <strong>${esc(user.displayName)}</strong>
                            <small>${esc(user.email || 'Email non renseigné')}</small>
                        </div>
                        <span class="role-chip-v081">${esc(user.roleLabel || roleBadge(user.role))}</span>
                        <span class="status-chip-v081 ${Number(user.isActive) ? 'ok' : 'off'}">${Number(user.isActive) ? 'Actif' : 'Inactif'}</span>
                    </div>
                    <div class="user-card-companies-v081">
                        ${(user.companies || []).length ? user.companies.map(c => `<span>${esc(c.name)}</span>`).join('') : '<span>Toutes / non limité</span>'}
                    </div>
                    <details>
                        <summary>Modifier</summary>
                        <div class="user-edit-form-v081">
                            <input data-field="displayName" value="${esc(user.displayName)}" placeholder="Nom">
                            <input data-field="email" value="${esc(user.email)}" placeholder="Email">
                            <select data-field="role">${renderRoleOptions(roles, user.role)}</select>
                            <textarea data-field="notes" placeholder="Notes">${esc(user.notes || '')}</textarea>
                            <div class="user-company-grid-v081">${renderCompanyChecks(companies, user.companyIds || [])}</div>
                            <label class="user-active-v081"><input type="checkbox" data-field="isActive" ${Number(user.isActive) ? 'checked' : ''}> Utilisateur actif</label>
                            <div class="button-row">
                                <button type="button" data-action="save-user">Enregistrer</button>
                                <button type="button" class="secondary-button" data-action="set-current" ${Number(user.isActive) ? '' : 'disabled'}>Définir comme utilisateur actif</button>
                                <button type="button" class="danger-soft-button-v081" data-action="disable-user" ${Number(user.isActive) ? '' : 'disabled'}>Désactiver</button>
                            </div>
                        </div>
                    </details>
                </article>
            `).join('') : '<p class="muted">Aucun utilisateur.</p>';

            list.querySelectorAll('[data-action="save-user"]').forEach(btn => btn.addEventListener('click', saveUserCardV081));
            list.querySelectorAll('[data-action="set-current"]').forEach(btn => btn.addEventListener('click', setCurrentUserFromCardV081));
            list.querySelectorAll('[data-action="disable-user"]').forEach(btn => btn.addEventListener('click', disableUserFromCardV081));
        }

        const matrix = document.getElementById('rolesMatrixV081');
        if (matrix) {
            matrix.innerHTML = roles.map(role => {
                const p = role.permissions || {};
                const modules = (p.modules || []).includes('*') ? 'Tous les modules' : (p.modules || []).join(', ');
                return `<div class="role-row-v081"><strong>${esc(role.roleLabel)}</strong><span>${esc(modules)}</span><em>${p.readOnly ? 'Lecture seule' : 'Écriture autorisée'}${p.canExport ? ' · Export' : ''}</em></div>`;
            }).join('');
        }
        await updateUserBadgeV081();
    }

    async function createUserFromFormV081() {
        const root = document.querySelector('[data-settings-panel="usersV081"]');
        const data = {
            displayName: document.getElementById('newUserNameV081')?.value || '',
            email: document.getElementById('newUserEmailV081')?.value || '',
            role: document.getElementById('newUserRoleV081')?.value || 'collaborateur',
            notes: document.getElementById('newUserNotesV081')?.value || '',
            companyIds: getCheckedCompanyIds(document.getElementById('newUserCompaniesV081') || root)
        };
        const result = await window.api.createAppUserV081(data);
        if (!result?.ok) return window.showToast ? window.showToast(result?.reason || 'Création impossible.', 'error') : alert(result?.reason || 'Création impossible.');
        ['newUserNameV081','newUserEmailV081','newUserNotesV081'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        if (window.showToast) window.showToast('Utilisateur créé.', 'success');
        await renderUsersPanelV081();
    }

    function getCardPayload(card) {
        return {
            id: Number(card.dataset.userId),
            displayName: card.querySelector('[data-field="displayName"]')?.value || '',
            email: card.querySelector('[data-field="email"]')?.value || '',
            role: card.querySelector('[data-field="role"]')?.value || 'collaborateur',
            notes: card.querySelector('[data-field="notes"]')?.value || '',
            isActive: Boolean(card.querySelector('[data-field="isActive"]')?.checked),
            companyIds: getCheckedCompanyIds(card)
        };
    }

    async function saveUserCardV081(event) {
        const card = event.target.closest('.user-card-v081');
        if (!card) return;
        const result = await window.api.updateAppUserV081(getCardPayload(card));
        if (!result?.ok) return window.showToast ? window.showToast(result?.reason || 'Mise à jour impossible.', 'error') : alert(result?.reason || 'Mise à jour impossible.');
        if (window.showToast) window.showToast('Utilisateur mis à jour.', 'success');
        await renderUsersPanelV081();
    }

    async function setCurrentUserFromCardV081(event) {
        const card = event.target.closest('.user-card-v081');
        if (!card) return;
        const result = await window.api.setCurrentUserV081(Number(card.dataset.userId));
        if (!result?.ok) return window.showToast ? window.showToast(result?.reason || 'Changement impossible.', 'error') : alert(result?.reason || 'Changement impossible.');
        if (window.showToast) window.showToast('Utilisateur actif changé.', 'success');
        await renderUsersPanelV081();
    }

    async function disableUserFromCardV081(event) {
        const card = event.target.closest('.user-card-v081');
        if (!card) return;
        if (!confirm('Désactiver cet utilisateur ?')) return;
        const result = await window.api.disableAppUserV081(Number(card.dataset.userId));
        if (!result?.ok) return window.showToast ? window.showToast(result?.reason || 'Désactivation impossible.', 'error') : alert(result?.reason || 'Désactivation impossible.');
        if (window.showToast) window.showToast('Utilisateur désactivé.', 'success');
        await renderUsersPanelV081();
    }

    function applySoftReadOnlyV081() {
        document.addEventListener('click', async event => {
            const current = await getCurrentSafe();
            if (!current?.permissions?.readOnly) return;
            const target = event.target?.closest?.('button, input, select, textarea');
            if (!target) return;
            const allowedIds = new Set(['refreshUsersV081','refreshAuditV080','refreshBackupsV080']);
            const allowedActions = ['set-current'];
            if (target.closest('[data-settings-panel="usersV081"]') || target.closest('[data-settings-panel="auditV080"]')) return;
            if (allowedIds.has(target.id) || allowedActions.includes(target.dataset.action)) return;
            if (target.matches('[data-page], .settings-tab-v043, summary')) return;
            const mutatingText = /import|supprimer|enregistrer|valider|associer|créer|sauvegarde|restaurer|modifier|renommer/i.test(target.textContent || target.value || '');
            if (mutatingText) {
                event.preventDefault();
                event.stopPropagation();
                if (window.showToast) window.showToast('Mode expert-comptable : lecture seule.', 'warning');
            }
        }, true);
    }

    ready(async () => {
        ensureUserBadgeV081();
        ensureSettingsPanelV081();
        await updateUserBadgeV081();
        applySoftReadOnlyV081();
        document.addEventListener('click', event => {
            if (event.target?.closest?.('[data-page="settingsPage"]')) setTimeout(renderUsersPanelV081, 300);
        });
    });

    window.renderUsersPanelV081 = renderUsersPanelV081;
    window.updateUserBadgeV081 = updateUserBadgeV081;
})();
