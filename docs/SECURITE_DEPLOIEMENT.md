# Focus Compta — sécurité et déploiement

## État actuel
Le code fourni est une application Electron. Elle peut fonctionner localement, mais elle ne doit pas être exposée directement sur un domaine web.

## Minimum avant mise en ligne

1. Remplacer SQLite local par PostgreSQL hébergé et sauvegardé.
2. Stocker les PDF et images dans un stockage objet privé, jamais dans un dossier public.
3. Ajouter authentification, rôles et permissions par société.
4. Chiffrer les secrets via variables d'environnement, jamais dans le code.
5. Ajouter HTTPS obligatoire, cookies `HttpOnly`, `Secure`, `SameSite`.
6. Ajouter journal d'audit sur les actions sensibles.
7. Valider les fichiers importés : type MIME, taille, extension, antivirus si possible.
8. Isoler les données par société et par utilisateur.
9. Mettre en place sauvegardes automatiques et procédure de restauration.
10. Prévoir une politique RGPD : durée de conservation, droit de suppression, export des données.

## Architecture recommandée pour finance.thefocuscompany.fr

- Reverse proxy : Nginx ou Traefik.
- Runtime : Docker Compose ou plateforme managée.
- App : frontend web + API backend.
- DB : PostgreSQL.
- Fichiers : stockage objet privé.
- OCR : worker asynchrone séparé.
- Exports : worker séparé avec file d'attente.

## Décision importante
Ne pas publier la version Electron actuelle telle quelle. Elle doit servir de prototype fonctionnel et de socle métier pour une migration web sécurisée.
