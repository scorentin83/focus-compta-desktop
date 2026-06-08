const API_URL = "/api";

async function loadCompanies() {
  try {
    const response = await fetch(`${API_URL}/companies`);
    const companies = await response.json();

    console.log("Sociétés :", companies);
  } catch (error) {
    console.error("Erreur API :", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("Focus Compta Web v0.87 démarré");

  loadCompanies();
});