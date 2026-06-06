async function loadCompanies() {
    const companies = await window.api.getCompanies();

    const list = document.getElementById('companyList');
    list.innerHTML = '';

    companies.forEach(company => {
        const li = document.createElement('li');
        li.textContent = company.name;
        list.appendChild(li);
    });
}

document.getElementById('newCompany').addEventListener('click', async () => {
    const input = document.getElementById('companyName');
    const name = input.value.trim();

    if (!name) return;

    await window.api.addCompany(name);

    input.value = '';
    await loadCompanies();
});

loadCompanies();