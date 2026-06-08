# AUDIT TECHNIQUE V0.85 – FOCUS COMPTA

## Version analysée

Version : V0.84.2 – Polish UI + Post-its avancés

Date de l'audit : Juin 2026

---

## Architecture actuelle

Type d'application :

* Electron Desktop
* Frontend HTML / CSS / JavaScript
* Base SQLite
* Stockage local des documents

---

## Modules fonctionnels présents

### Accueil consolidé

Fonctions :

* Trésorerie consolidée
* Documents à rapprocher
* TVA estimée
* Vue multi-sociétés

### Sociétés

Fonctions :

* Création
* Modification
* Suppression
* Paramètres

### Banque

Fonctions :

* Import relevés
* Catégorisation
* Recherche
* Contrôle
* Historique

### Rapprochements

Fonctions :

* Association document ↔ opération bancaire
* Suggestions automatiques
* Validation

### Documents / GED

Fonctions :

* Import PDF
* Classement
* Recherche
* Aperçu

### Tiers

Fonctions :

* Création
* Modification
* Fusion

### Caisse

Fonctions :

* Feuilles de caisse
* Contrôle caisse
* Validation

### TVA

Fonctions :

* Estimation TVA
* Contrôle

### Comptabilité

Fonctions :

* Visualisation des écritures
* Préparation expert-comptable

### Dossier Expert

Fonctions :

* Exports
* Contrôles

### Utilisateurs

Fonctions :

* Gestion des accès
* Rôles

### Audit

Fonctions :

* Historique des actions

### Post-its

Fonctions :

* Notes persistantes
* Réorganisation

---

## Technologies identifiées

Frontend :

* HTML
* CSS
* JavaScript

Desktop :

* Electron

Base de données :

* SQLite
* better-sqlite3

---

## Points à migrer vers la version web

* IPC Electron
* Base SQLite
* Stockage local des documents
* Authentification locale

---

## Points déjà réutilisables

* Logique métier
* Interface utilisateur
* Gestion documentaire
* Contrôles métiers
* TVA
* Rapprochements
* Audit

---

## Conclusion

La partie fonctionnelle est largement avancée.

La migration restante concerne principalement :

* backend API
* base PostgreSQL
* authentification
* hébergement sécurisé
* stockage documentaire distant
