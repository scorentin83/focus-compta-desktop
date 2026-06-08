// Focus Compta V0.80 - Foundation : santé comptable, audit, sauvegardes et préparation SaaS.
(function focusFoundationV080() {
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

    function money(value) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(value || 0));
    }

    function currentCompanyId() {
        try {
            if (typeof selectedCompany !== 'undefined' && selectedCompany && selectedCompany.id) return selectedCompany.id;
        } catch (_) {}
        return null;
    }

    function currentPeriod() {
        const now = new Date();
        const y = document.getElementById('accountingControlYearV047')?.value || String(now.getFullYear());
        const m = document.getElementById('accountingControlMonthV047')?.value || String(now.getMonth() + 1).padStart(2, '0');
        return { year: String(y), month: String(m).padStart(2, '0') };
    }

    function statusLabel(status) {
        if (status === 'ok') return '🟢 Conforme';
        if (status === 'warning') return '🟠 À contrôler';
        return '🔴 Prioritaire';
    }

    async function renderAccountingHealthV080() {
        if (!window.api?.getAccountingHealthV080) return;
        const holder = document.getElementById('accountingHealthV047');
        if (!holder) return;
        const { year, month } = currentPeriod();
        const health = await window.api.getAccountingHealthV080({ companyId: currentCompanyId(), year, month });
        holder.classList.add('foundation-health-v080');
        holder.innerHTML = `
            <section class="panel clean-panel foundation-score-card-v080 ${esc(health.status)}">
                <div>
                    <span class="eyebrow">Santé comptable V0.80</span>
                    <h2>Dossier ${esc(month)}/${esc(year)}</h2>
                    <p class="muted">Score global basé sur Banque, Documents, Caisse, TVA et Rapprochements.</p>
                </div>
                <strong>${Number(health.score || 0)}/100</strong>
            </section>
            <div class="foundation-health-grid-v080">
                ${(health.checks || []).map(check => `
                    <article class="foundation-check-v080 ${Number(check.score || 0) >= 85 ? 'ok' : Number(check.score || 0) >= 65 ? 'warning' : 'danger'}">
                        <div><strong>${esc(check.label)}</strong><span>${esc(check.detail)}</span></div>
                        <b>${Math.round(Number(check.score || 0))}%</b>
                    </article>
                `).join('')}
            </div>
        `;
    }

    async function renderHomeFoundationV080() {
        if (!window.api?.getAccountingHealthV080) return;
        const home = document.getElementById('homePage');
        if (!home || document.getElementById('homeFoundationHealthV080')) return;
        const target = document.getElementById('v050AccountingTimeline')?.parentElement || home.querySelector('.clean-panel:last-of-type') || home;
        const panel = document.createElement('section');
        panel.id = 'homeFoundationHealthV080';
        panel.className = 'panel clean-panel home-foundation-v080';
        panel.innerHTML = `
            <div class="section-title-row compact-title-row">
                <div><span class="eyebrow">Foundation V0.80</span><h2>Santé comptable</h2></div>
                <button id="refreshHomeFoundationV080" type="button" class="secondary-button">Actualiser</button>
            </div>
            <div id="homeFoundationHealthBodyV080" class="muted">Chargement…</div>
        `;
        target.insertAdjacentElement('afterend', panel);
        document.getElementById('refreshHomeFoundationV080')?.addEventListener('click', updateHomeFoundationV080);
        await updateHomeFoundationV080();
    }

    async function updateHomeFoundationV080() {
        const body = document.getElementById('homeFoundationHealthBodyV080');
        if (!body || !window.api?.getAccountingHealthV080) return;
        const { year, month } = currentPeriod();
        const health = await window.api.getAccountingHealthV080({ companyId: currentCompanyId(), year, month });
        body.innerHTML = `
            <div class="home-foundation-score-v080">
                <strong>${Number(health.score || 0)}/100</strong>
                <span>${statusLabel(health.status)} · ${esc(month)}/${esc(year)}</span>
                <button type="button" class="link-button-v047" data-page="accountingPage">Voir le détail</button>
            </div>
            <div class="home-foundation-mini-v080">
                ${(health.checks || []).map(check => `<span>${esc(check.label)} <b>${Math.round(Number(check.score || 0))}%</b></span>`).join('')}
            </div>
        `;
        body.querySelector('[data-page="accountingPage"]')?.addEventListener('click', () => window.showPage ? window.showPage('accountingPage') : null);
    }

    function ensureSettingsPanelV080() {
        const sidebar = document.querySelector('.settings-sidebar-v043');
        const content = document.querySelector('.settings-content-v043');
        if (!sidebar || !content || document.querySelector('[data-settings-tab="foundationV080"]')) return;

        const backupTab = document.createElement('button');
        backupTab.type = 'button';
        backupTab.className = 'settings-tab-v043';
        backupTab.dataset.settingsTab = 'foundationV080';
        backupTab.textContent = '🧱 Foundation';
        sidebar.appendChild(backupTab);

        const auditTab = document.createElement('button');
        auditTab.type = 'button';
        auditTab.className = 'settings-tab-v043';
        auditTab.dataset.settingsTab = 'auditV080';
        auditTab.textContent = '🕘 Audit';
        sidebar.appendChild(auditTab);

        const panel = document.createElement('div');
        panel.className = 'settings-panel-v043';
        panel.dataset.settingsPanel = 'foundationV080';
        panel.innerHTML = `
            <div class="panel clean-panel">
                <span class="eyebrow">V0.80 Foundation</span>
                <h2>Sauvegardes & préparation SaaS</h2>
                <p class="muted">Stabilisation avant mise en ligne : sauvegarde locale, restauration prudente, rôles préparés et santé technique.</p>
                <div class="foundation-actions-v080">
                    <button id="createBackupV080" type="button">Créer une sauvegarde maintenant</button>
                    <button id="refreshBackupsV080" type="button" class="secondary-button">Actualiser la liste</button>
                    <button id="openDataFolderV080" type="button" class="secondary-button">Ouvrir les données</button>
                </div>
                <div id="backupListV080" class="foundation-list-v080 muted">Chargement des sauvegardes…</div>
            </div>
            <div class="panel clean-panel">
                <span class="eyebrow">Préparation SaaS</span>
                <h2>Utilisateurs & rôles</h2>
                <p class="muted">Structure prête pour les futures permissions : Administrateur, Direction, Collaborateur, Expert-comptable.</p>
                <div id="rolesUsersV080" class="foundation-list-v080 muted">Chargement…</div>
            </div>
        `;
        content.appendChild(panel);

        const auditPanel = document.createElement('div');
        auditPanel.className = 'settings-panel-v043';
        auditPanel.dataset.settingsPanel = 'auditV080';
        auditPanel.innerHTML = `
            <div class="panel clean-panel">
                <div class="section-title-row compact-title-row">
                    <div><span class="eyebrow">Journal d'audit</span><h2>Actions récentes</h2></div>
                    <button id="refreshAuditV080" type="button" class="secondary-button">Actualiser</button>
                </div>
                <p class="muted">Trace les opérations importantes : sauvegardes, restaurations, imports, suppressions et futures actions multi-utilisateurs.</p>
                <div id="auditLogV080" class="foundation-list-v080 muted">Chargement…</div>
            </div>
        `;
        content.appendChild(auditPanel);

        document.querySelectorAll('.settings-tab-v043').forEach(btn => {
            if (btn.dataset.v080Bound) return;
            btn.dataset.v080Bound = '1';
            btn.addEventListener('click', () => {
                const tab = btn.dataset.settingsTab;
                document.querySelectorAll('.settings-tab-v043').forEach(b => b.classList.toggle('active', b === btn));
                document.querySelectorAll('.settings-panel-v043').forEach(p => p.classList.toggle('active', p.dataset.settingsPanel === tab));
                if (tab === 'foundationV080') { loadBackupsV080(); loadRolesUsersV080(); }
                if (tab === 'auditV080') loadAuditV080();
            });
        });

        document.getElementById('createBackupV080')?.addEventListener('click', async () => {
            const result = await window.api.createBackup();
            if (window.showToast) window.showToast('Sauvegarde créée.', 'success');
            await loadBackupsV080();
            await loadAuditV080();
        });
        document.getElementById('refreshBackupsV080')?.addEventListener('click', loadBackupsV080);
        document.getElementById('openDataFolderV080')?.addEventListener('click', () => window.api.openDataFolder());
        document.getElementById('refreshAuditV080')?.addEventListener('click', loadAuditV080);
    }

    async function loadBackupsV080() {
        const box = document.getElementById('backupListV080');
        if (!box || !window.api?.listBackupsV080) return;
        const backups = await window.api.listBackupsV080();
        if (!backups.length) { box.innerHTML = '<p class="muted">Aucune sauvegarde locale pour le moment.</p>'; return; }
        box.innerHTML = backups.slice(0, 12).map(backup => `
            <div class="foundation-row-v080">
                <span><strong>${esc(backup.name)}</strong><small>${esc(new Date(backup.modifiedAt).toLocaleString('fr-FR'))}</small></span>
                <button type="button" class="secondary-button" data-restore="${esc(backup.path)}">Restaurer</button>
            </div>
        `).join('');
        box.querySelectorAll('[data-restore]').forEach(btn => btn.addEventListener('click', async () => {
            const result = await window.api.restoreBackupV080({ backupPath: btn.dataset.restore });
            if (result?.ok && window.showToast) window.showToast('Sauvegarde restaurée. Redémarre l’application pour sécuriser le rechargement complet.', 'success');
            await loadAuditV080();
        }));
    }

    async function loadAuditV080() {
        const box = document.getElementById('auditLogV080');
        if (!box || !window.api?.getAuditLogV080) return;
        const rows = await window.api.getAuditLogV080({ companyId: currentCompanyId(), limit: 80 });
        if (!rows.length) { box.innerHTML = '<p class="muted">Aucune action auditée pour le moment.</p>'; return; }
        box.innerHTML = rows.map(row => `
            <div class="foundation-row-v080 audit-row-v080">
                <span><strong>${esc(row.label || row.actionType)}</strong><small>${esc(row.actionType)} · ${esc(new Date(row.createdAt).toLocaleString('fr-FR'))}</small></span>
                <em>${esc(row.entityType || '')}</em>
            </div>
        `).join('');
    }

    async function loadRolesUsersV080() {
        const box = document.getElementById('rolesUsersV080');
        if (!box || !window.api?.getAppRolesV080) return;
        const [roles, users] = await Promise.all([window.api.getAppRolesV080(), window.api.getAppUsersV080()]);
        box.innerHTML = `
            <h3>Rôles préparés</h3>
            ${(roles || []).map(role => `<div class="foundation-row-v080"><span><strong>${esc(role.roleLabel)}</strong><small>${esc(role.roleKey)}</small></span></div>`).join('')}
            <h3>Utilisateur local</h3>
            ${(users || []).map(user => `<div class="foundation-row-v080"><span><strong>${esc(user.displayName)}</strong><small>${esc(user.role)}${user.email ? ' · ' + esc(user.email) : ''}</small></span></div>`).join('')}
        `;
    }

    function bindRefreshHooksV080() {
        document.getElementById('refreshAccountingControlV047')?.addEventListener('click', () => setTimeout(renderAccountingHealthV080, 300));
        document.getElementById('accountingControlYearV047')?.addEventListener('change', renderAccountingHealthV080);
        document.getElementById('accountingControlMonthV047')?.addEventListener('change', renderAccountingHealthV080);
        document.addEventListener('click', event => {
            if (event.target?.closest?.('[data-page="accountingPage"]')) setTimeout(renderAccountingHealthV080, 300);
        });
    }

    ready(async () => {
        ensureSettingsPanelV080();
        bindRefreshHooksV080();
        await renderAccountingHealthV080();
        await loadBackupsV080();
        await loadAuditV080();
        await loadRolesUsersV080();
    });

    window.renderAccountingHealthV080 = renderAccountingHealthV080;
    window.loadAuditV080 = loadAuditV080;
})();
