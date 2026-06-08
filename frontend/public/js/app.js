const API_URL = "/api";
let companiesCache = [];

const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => Array.from(document.querySelectorAll(selector));

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Erreur API" }));
    throw new Error(error.error || "Erreur API");
  }
  return response.json();
}

async function checkApi() {
  try {
    const health = await api("/health");
    qs("#api-status").textContent = `API ${health.version} OK`;
    qs("#api-status").className = "status-pill ok";
  } catch (error) {
    qs("#api-status").textContent = "API hors ligne";
    qs("#api-status").className = "status-pill ko";
  }
}

async function loadStats() {
  const stats = await api("/stats");
  qs("#stat-companies").textContent = stats.companies;
  qs("#stat-documents").textContent = stats.documents;
  qs("#stat-transactions").textContent = stats.transactions;
  qs("#stat-last-reco").textContent = stats.lastReconciliation || "-";
}

async function loadCompanies() {
  companiesCache = await api("/companies");
  console.log("Sociétés :", companiesCache);
  renderCompanies();
  qs("#stat-companies").textContent = companiesCache.length;
}

function renderCompanies() {
  const container = qs("#companies-list");
  if (!companiesCache.length) {
    container.className = "list empty";
    container.textContent = "Aucune société pour le moment.";
    return;
  }
  container.className = "list";
  container.innerHTML = companiesCache.map(company => `
    <div class="company-row" data-id="${company.id}">
      <div>
        <strong>${escapeHtml(company.name)}</strong>
        <small>SIREN : ${escapeHtml(company.siren || "-")} · TVA : ${escapeHtml(company.vat_regime || "-")} · Clôture : ${escapeHtml(company.fiscal_year_end || "-")}</small>
      </div>
      <div class="row-actions">
        <button class="secondary" data-action="edit" data-id="${company.id}">Modifier</button>
        <button class="danger" data-action="delete" data-id="${company.id}">Supprimer</button>
      </div>
    </div>
  `).join("");
}

function resetCompanyForm() {
  qs("#company-id").value = "";
  qs("#company-name").value = "";
  qs("#company-siren").value = "";
  qs("#company-vat").value = "normal";
  qs("#company-fiscal").value = "";
  qs("#company-notes").value = "";
}

async function saveCompany(event) {
  event.preventDefault();
  const id = qs("#company-id").value;
  const payload = {
    name: qs("#company-name").value,
    siren: qs("#company-siren").value,
    vat_regime: qs("#company-vat").value,
    fiscal_year_end: qs("#company-fiscal").value,
    notes: qs("#company-notes").value,
  };

  if (id) {
    await api(`/companies/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  } else {
    await api("/companies", { method: "POST", body: JSON.stringify(payload) });
  }
  resetCompanyForm();
  await loadCompanies();
  await loadStats();
}

function editCompany(id) {
  const company = companiesCache.find(item => String(item.id) === String(id));
  if (!company) return;
  qs("#company-id").value = company.id;
  qs("#company-name").value = company.name || "";
  qs("#company-siren").value = company.siren || "";
  qs("#company-vat").value = company.vat_regime || "normal";
  qs("#company-fiscal").value = company.fiscal_year_end || "";
  qs("#company-notes").value = company.notes || "";
}

async function deleteCompany(id) {
  if (!confirm("Supprimer cette société ?")) return;
  await api(`/companies/${id}`, { method: "DELETE" });
  await loadCompanies();
  await loadStats();
}

function setupNavigation() {
  qsa(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      qsa(".nav-item").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      qsa(".view").forEach(section => section.classList.remove("active"));
      qs(`#view-${view}`).classList.add("active");
      qs("#page-title").textContent = button.textContent.replace(/[📊🏢🏦📄🔗📤⚙️]/g, "").trim();
    });
  });
}

function setupCompanyEvents() {
  qs("#company-form").addEventListener("submit", saveCompany);
  qs("#reset-company-form").addEventListener("click", resetCompanyForm);
  qs("#companies-list").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit") editCompany(button.dataset.id);
    if (button.dataset.action === "delete") deleteCompany(button.dataset.id);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Focus Compta Web v0.88 démarré");
  setupNavigation();
  setupCompanyEvents();
  await checkApi();
  await loadStats();
  await loadCompanies();
});
