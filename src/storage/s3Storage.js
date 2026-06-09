const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

require('dotenv').config();

function getS3Config() {
  const endpoint = process.env.OVH_S3_ENDPOINT || '';
  const region = process.env.OVH_S3_REGION || '';
  const bucket = process.env.OVH_S3_BUCKET || '';
  const accessKeyId = process.env.OVH_S3_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.OVH_S3_SECRET_ACCESS_KEY || '';

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    isConfigured: Boolean(endpoint && region && bucket && accessKeyId && secretAccessKey)
  };
}

function createS3Client() {
  const config = getS3Config();

  if (!config.isConfigured) {
    throw new Error('Configuration OVH S3 incomplète. Vérifie le fichier .env.');
  }

  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
}

async function testS3Connection() {
  const config = getS3Config();

  if (!config.isConfigured) {
    return {
      ok: false,
      message: 'Configuration OVH S3 incomplète.',
      config: {
        endpoint: config.endpoint,
        region: config.region,
        bucket: config.bucket,
        hasAccessKey: Boolean(config.accessKeyId),
        hasSecretKey: Boolean(config.secretAccessKey)
      }
    };
  }

  try {
    const client = createS3Client();

    await client.send(new HeadBucketCommand({
      Bucket: config.bucket
    }));

    return {
      ok: true,
      message: `Connexion OVH S3 OK. Bucket accessible : ${config.bucket}`,
      bucket: config.bucket,
      endpoint: config.endpoint,
      region: config.region
    };
  } catch (error) {
    return {
      ok: false,
      message: 'Connexion OVH S3 impossible.',
      error: error.message,
      name: error.name,
      bucket: config.bucket,
      endpoint: config.endpoint,
      region: config.region
    };
  }
}

function cleanS3Segment(value, fallback = 'non-classe') {
  const clean = String(value || fallback || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._ -]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return clean || fallback;
}

function cleanS3Filename(filename = 'file.bin') {
  const ext = path.extname(String(filename || 'file.bin')) || '.bin';
  const base = path.basename(String(filename || 'file.bin'), ext)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 120) || 'document';

  return `${base}${ext.toLowerCase()}`;
}

function parseYearMonthFromDocumentDate(value, fallbackYear = '', fallbackMonth = '') {
  const raw = String(value || '').trim();

  let match = raw.match(/\b(20\d{2})[\/._-](0?[1-9]|1[0-2])(?:[\/._-]([0-3]?\d))?\b/);
  if (match) return { year: match[1], month: String(match[2]).padStart(2, '0') };

  match = raw.match(/\b([0-3]?\d)[\/._-](0?[1-9]|1[0-2])[\/._-](20\d{2})\b/);
  if (match) return { year: match[3], month: String(match[2]).padStart(2, '0') };

  if (fallbackYear && fallbackMonth) {
    return { year: String(fallbackYear), month: String(fallbackMonth).padStart(2, '0') };
  }

  const now = new Date();
  return { year: String(now.getFullYear()), month: String(now.getMonth() + 1).padStart(2, '0') };
}

function documentTypeToGedFolder(docType = 'document') {
  const type = cleanS3Segment(docType, 'documents');
  const map = {
    facture: 'factures',
    facture_client: 'factures-client',
    avoir: 'avoirs',
    contrat: 'contrats',
    rib: 'rib',
    releve: 'releves',
    relevé: 'releves',
    social: 'social',
    admin: 'administratif',
    administratif: 'administratif',
    divers: 'divers',
    don: 'dons',
    document: 'documents',
    documents: 'documents'
  };

  return map[type] || type || 'documents';
}

function cleanGedFolderSegments(folderPath = '', year = '', month = '') {
  const rawSegments = String(folderPath || '')
    .replace(/\\/g, '/')
    .split('/')
    .map(part => part.trim())
    .filter(Boolean);

  const knownRoots = new Set(['ged', 'documents', 'document', 'justificatifs', 'justificatif']);
  let segments = rawSegments;

  // Les folder_path actuels commencent souvent par "Nom société/JUSTIFICATIFS/...".
  // Le companyId existe déjà dans la clé S3, on retire donc ce premier segment technique.
  if (segments.length > 1 && knownRoots.has(cleanS3Segment(segments[1], ''))) {
    segments = segments.slice(1);
  }

  return segments
    .map(segment => cleanS3Segment(segment, ''))
    .filter(Boolean)
    .filter(segment => !knownRoots.has(segment))
    .filter(segment => segment !== String(year) && segment !== String(month).padStart(2, '0'))
    .filter(segment => !/^20\d{2}$/.test(segment))
    // Les dossiers locaux peuvent contenir le jour du document (ex: 06).
    // Dans S3, on garde le miroir GED utile : année/mois/type/fichier, sans sous-dossier jour.
    .filter(segment => {
      const n = Number(segment);
      return !( /^\d{1,2}$/.test(segment) && n >= 1 && n <= 31 );
    });
}

function createGedObjectKey({
  companyId = 'global',
  filename = 'file.bin',
  docType = 'document',
  documentDate = '',
  year = '',
  month = '',
  folderPath = '',
  uniquePrefix = ''
} = {}) {
  const ym = parseYearMonthFromDocumentDate(documentDate, year, month);
  const typeFolder = documentTypeToGedFolder(docType);
  const folderSegments = cleanGedFolderSegments(folderPath, ym.year, ym.month);
  const prefix = String(uniquePrefix || '').match(/^[a-f0-9]{16}$/i)
    ? String(uniquePrefix)
    : crypto.randomBytes(8).toString('hex');
  const cleanFilename = cleanS3Filename(filename);

  return [
    'focus-compta',
    'companies',
    cleanS3Segment(companyId, 'global'),
    'ged',
    ym.year,
    ym.month,
    typeFolder,
    ...folderSegments,
    `${prefix}-${cleanFilename}`
  ].join('/');
}

function createObjectKey({ companyId = 'global', type = 'tests', filename = 'file.bin', documentDate = '', year = '', month = '', docType = '', folderPath = '', uniquePrefix = '', layout = '' } = {}) {
  if (layout === 'ged') {
    return createGedObjectKey({ companyId, filename, docType: docType || type, documentDate, year, month, folderPath, uniquePrefix });
  }

  const cleanFilename = cleanS3Filename(filename);
  const date = new Date();
  const objectYear = String(year || date.getFullYear());
  const objectMonth = String(month || date.getMonth() + 1).padStart(2, '0');
  const random = String(uniquePrefix || '').match(/^[a-f0-9]{16}$/i) ? String(uniquePrefix) : crypto.randomBytes(8).toString('hex');

  return [
    'focus-compta',
    'companies',
    cleanS3Segment(companyId, 'global'),
    cleanS3Segment(type || 'documents', 'documents'),
    objectYear,
    objectMonth,
    `${random}-${cleanFilename}`
  ].join('/');
}

async function uploadFileToS3(localFilePath, options = {}) {
  const config = getS3Config();
  const client = createS3Client();

  if (!localFilePath || !fs.existsSync(localFilePath)) {
    throw new Error(`Fichier introuvable : ${localFilePath}`);
  }

  const filename = options.filename || path.basename(localFilePath);
  const key = options.key || createObjectKey({
    companyId: options.companyId || 'global',
    type: options.type || 'documents',
    filename,
    layout: options.layout || options.storageLayout || '',
    docType: options.docType || options.type || 'documents',
    documentDate: options.documentDate || '',
    year: options.year || '',
    month: options.month || '',
    folderPath: options.folderPath || '',
    uniquePrefix: options.uniquePrefix || ''
  });

  const fileBuffer = fs.readFileSync(localFilePath);
  const contentType = options.contentType || 'application/octet-stream';

  const result = await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType
  }));

  return {
    ok: true,
    bucket: config.bucket,
    key,
    etag: result.ETag || '',
    size: fileBuffer.length,
    filename
  };
}

async function getSignedDownloadUrl(key, expiresInSeconds = 300) {
  const config = getS3Config();
  const client = createS3Client();

  if (!key) {
    throw new Error('Clé S3 manquante.');
  }

  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key
  });

  return getSignedUrl(client, command, {
    expiresIn: expiresInSeconds
  });
}

async function deleteObjectFromS3(key) {
  const config = getS3Config();
  const client = createS3Client();

  if (!key) {
    throw new Error('Clé S3 manquante.');
  }

  await client.send(new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: key
  }));

  return {
    ok: true,
    bucket: config.bucket,
    key
  };
}


function encodeCopySource(bucket, key) {
  return `${bucket}/${encodeURIComponent(String(key || '')).replace(/%2F/g, '/')}`;
}

async function moveObjectInS3(oldKey, newKey) {
  const config = getS3Config();
  const client = createS3Client();

  if (!oldKey || !newKey) {
    throw new Error('Clés S3 manquantes pour le déplacement.');
  }

  if (oldKey === newKey) {
    return { ok: true, skipped: true, bucket: config.bucket, oldKey, newKey };
  }

  const copied = await client.send(new CopyObjectCommand({
    Bucket: config.bucket,
    Key: newKey,
    CopySource: encodeCopySource(config.bucket, oldKey)
  }));

  await client.send(new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: oldKey
  }));

  return {
    ok: true,
    bucket: config.bucket,
    oldKey,
    newKey,
    etag: copied.CopyObjectResult?.ETag || copied.ETag || ''
  };
}

module.exports = {
  getS3Config,
  testS3Connection,
  createObjectKey,
  createGedObjectKey,
  uploadFileToS3,
  getSignedDownloadUrl,
  deleteObjectFromS3,
  moveObjectInS3
};
