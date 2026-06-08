# Focus Compta — architecture cible

## Positionnement
Focus Compta est un cockpit financier de pré-comptabilité. L'utilisateur ne manipule pas des modules techniques séparés : OCR, GED, banque, rapprochement et export doivent rester invisibles derrière un parcours métier simple.

## Domaines métier

### 1. Cockpit
Point d'entrée unique : trésorerie, éléments à traiter, documents à transmettre, opérations à rapprocher, relevés avec écart, doublons tiers, timeline comptable.

### 2. Sociétés
Centre du système. Une société contient : synthèse, documents, banques, caisse, comptabilité.

### 3. Banque
Comptes, relevés, opérations et rapprochements. Les relevés bancaires servent de source aux opérations et ne doivent pas être traités comme des factures à rapprocher.

### 4. Documents
Deux familles uniquement :

- Documents comptables : facture fournisseur, facture client, avoir.
- Documents non comptables : contrat, administratif, RIB, relevé, divers, don, informatif.

Seuls les documents comptables peuvent entrer dans le workflow de rapprochement et d'export comptable.

### 5. Caisse
Les feuilles de caisse ne sont pas des documents GED. Elles vivent dans Société > Caisse avec import, analyse, contrôle, historique.

### 6. Tiers
Référentiel central : recherche, fusion, doublons, typologie, règles d'apprentissage.

### 7. Comptabilité
Contrôles, exports, archives, transmission à l'expert-comptable.

## Règles structurantes V1

- Rapprochements : afficher uniquement facture fournisseur, facture client et avoir avec statut à rapprocher.
- Documents non comptables : OCR, classement, archivage, puis fin du workflow.
- Renommage intelligent : `AAAA-MM_TIERS_TYPE_REFERENCE.pdf` basé sur la date du document détectée par OCR, pas sur la date d'import.
- Apprentissage : chaque correction utilisateur doit être mémorisée comme une règle ou un événement d'apprentissage.

## Préparation mise en ligne
L'application actuelle est une base Electron locale. Pour `finance.thefocuscompany.fr`, la cible recommandée est une application web :

- Frontend : React/Next.js ou équivalent.
- Backend API : Node.js/NestJS ou Express structuré.
- Base de données : PostgreSQL en production.
- Stockage fichiers : S3 compatible ou stockage objet chiffré.
- Authentification : comptes utilisateurs, MFA possible, sessions sécurisées.
- Séparation sociétés : contrôle d'accès par organisation/société.
- Journal d'audit : imports, validations, rapprochements, exports, suppressions.
