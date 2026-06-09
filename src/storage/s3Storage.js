const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
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

function createObjectKey({ companyId = 'global', type = 'tests', filename = 'file.bin' } = {}) {
  const cleanFilename = String(filename || 'file.bin')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const date = new Date();
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = crypto.randomBytes(8).toString('hex');

  return [
    'focus-compta',
    'companies',
    String(companyId || 'global'),
    String(type || 'documents'),
    year,
    month,
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
    filename
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

module.exports = {
  getS3Config,
  testS3Connection,
  createObjectKey,
  uploadFileToS3,
  getSignedDownloadUrl,
  deleteObjectFromS3
};
