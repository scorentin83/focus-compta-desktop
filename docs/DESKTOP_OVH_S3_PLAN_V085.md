# Focus Compta Desktop + OVH S3

## Architecture retenue

- Application : Electron Desktop Windows.
- Base : SQLite locale dans le dossier utilisateur Electron.
- Documents : local actuellement, OVH S3 ensuite.
- Cache : local, dans FocusComptaData.
- Bucket OVH : privé.

## Dossier de données

Electron définit le dossier utilisateur via `app.getPath('userData')`.
La base est stockée dans :

```txt
<userData>/FocusComptaData/FocusCompta.db
```

Les sauvegardes sont stockées dans :

```txt
<userData>/FocusComptaBackups/
```

## Champs S3 ajoutés

Les tables `documents`, `statements` et `receipts` reçoivent :

```txt
storage_provider
s3_bucket
s3_key
s3_etag
mime_type
file_size
local_cache_path
sync_status
uploaded_at
```

## Étape suivante v0.86

- Upload automatique vers OVH S3 à l'import.
- Génération des clés S3 par société/type/document.
- Ouverture par URL signée temporaire ou cache local.
- Migration des documents locaux existants vers S3.
- Rapport de fichiers manquants/non synchronisés.
