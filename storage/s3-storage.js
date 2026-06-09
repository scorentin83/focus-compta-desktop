const fs = require('fs');
const path = require('path');

function getAwsSdk() {
    try {
        return {
            ...require('@aws-sdk/client-s3'),
            presigner: require('@aws-sdk/s3-request-presigner')
        };
    } catch (error) {
        const wrapped = new Error("Module S3 manquant. Lance d'abord : npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner");
        wrapped.cause = error;
        throw wrapped;
    }
}

function buildS3Client(config = {}) {
    const { S3Client } = getAwsSdk();
    if (!config.endpoint || !config.region || !config.accessKeyId || !config.secretAccessKey) {
        throw new Error('Configuration OVH S3 incomplète.');
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

function normalizeKeyPart(value) {
    return String(value || 'item')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 100) || 'item';
}

function buildObjectKey({ companyId, type, recordId, filename }) {
    const safeName = normalizeKeyPart(path.basename(filename || 'document'));
    return ['companies', companyId || 'no-company', type || 'documents', recordId || 'pending', safeName].join('/');
}

async function testConnection(config = {}) {
    const { HeadBucketCommand } = getAwsSdk();
    const client = buildS3Client(config);
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    return { ok: true, bucket: config.bucket, endpoint: config.endpoint, region: config.region };
}

async function uploadFile(config = {}, sourcePath, key, contentType = undefined) {
    const { PutObjectCommand } = getAwsSdk();
    const client = buildS3Client(config);
    const stat = fs.statSync(sourcePath);
    const result = await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: fs.createReadStream(sourcePath),
        ContentType: contentType
    }));
    return {
        storage_provider: 'ovh-s3',
        s3_bucket: config.bucket,
        s3_key: key,
        s3_etag: result.ETag || null,
        file_size: stat.size,
        mime_type: contentType || null,
        sync_status: 'uploaded',
        uploaded_at: new Date().toISOString()
    };
}

async function getSignedUrl(config = {}, key, expiresIn = 900) {
    const { GetObjectCommand, presigner } = getAwsSdk();
    const client = buildS3Client(config);
    return presigner.getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), { expiresIn });
}

module.exports = {
    buildS3Client,
    buildObjectKey,
    testConnection,
    uploadFile,
    getSignedUrl
};
