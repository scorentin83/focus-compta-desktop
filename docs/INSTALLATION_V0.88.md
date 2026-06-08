# Focus Compta Web v0.88

Pack de remplacement à copier à la racine de `theta-compta`.

## Contenu

- Frontend web complet v0.88
- Backend Express avec routes sociétés
- Base SQLite persistante dans volume Docker
- Proxy `/api` via Nginx
- Docker Compose prêt Portainer

## Commandes

```bash
git add .
git commit -m "Deploy Focus Compta Web v0.88 companies"
git push origin migration-web
```

Puis Portainer : `Pull and redeploy`.

## Tests

- `https://finance.thefocuscompany.fr/api/health`
- `https://finance.thefocuscompany.fr/api/companies`
- `https://finance.thefocuscompany.fr`
