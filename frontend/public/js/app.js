const API_URL = "http://localhost:3001/api";

async function loadCompanies() {
  const response = await fetch(`${API_URL}/companies`);
  const companies = await response.json();

  console.log("Sociétés :", companies);
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("Focus Compta Web v0.87 démarré");
  loadCompanies();
});