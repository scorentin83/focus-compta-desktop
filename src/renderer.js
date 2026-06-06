const companies = [
    "Lucas Optical",
    "Phil&Joe Optical"
];

const list = document.getElementById('companyList');

companies.forEach(company => {

    const li = document.createElement('li');

    li.textContent = company;

    list.appendChild(li);

});

document
.getElementById('newCompany')
.addEventListener('click', () => {

    alert('Création société à venir');

});