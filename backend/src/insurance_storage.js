'use strict';

const crypto = require('node:crypto');
const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

let client;
let clientFingerprint;

function getConfig() {
  const bucket = (process.env.INSURANCE_S3_BUCKET || '').trim();
  const region = (process.env.INSURANCE_S3_REGION || '').trim();
  const accessKeyId = (process.env.INSURANCE_S3_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.INSURANCE_S3_SECRET_ACCESS_KEY || '').trim();
  const endpoint = (process.env.INSURANCE_S3_ENDPOINT || '').trim();
  const forcePathStyle = (process.env.INSURANCE_S3_FORCE_PATH_STYLE || '').trim() === 'true';

  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;
  if (endpoint) {
    try {
      const parsed = new URL(endpoint);
      const allowLocalTest = process.env.NODE_ENV === 'test' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
      if (parsed.protocol !== 'https:' && !allowLocalTest) return null;
      if (parsed.username || parsed.password) return null;
    } catch (_) {
      return null;
    }
  }

  return { bucket, region, accessKeyId, secretAccessKey, endpoint: endpoint || undefined, forcePathStyle };
}

function isStorageConfigured() {
  return Boolean(getConfig());
}

function getClient() {
  const config = getConfig();
  if (!config) throw new Error('Private insurance document storage is not configured');
  const fingerprint = [config.bucket, config.region, config.accessKeyId, config.secretAccessKey, config.endpoint || '', config.forcePathStyle].join('|');
  if (!client || clientFingerprint !== fingerprint) {
    client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      maxAttempts: 2
    });
    clientFingerprint = fingerprint;
  }
  return { client, config };
}

function makeObjectKey() {
  return 'insurance-documents/' + crypto.randomUUID();
}

async function createUploadUrl({ objectKey, contentType }) {
  const { client, config } = getClient();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    ContentType: contentType
  });
  return getSignedUrl(client, command, { expiresIn: 300 });
}

async function inspectObject({ objectKey }) {
  const { client, config } = getClient();
  const result = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }));
  return {
    sizeBytes: Number(result.ContentLength),
    contentType: String(result.ContentType || '').toLowerCase().trim()
  };
}

async function createDownloadUrl({ objectKey, filename }) {
  const { client, config } = getClient();
  const safeName = String(filename || 'insurance-document').replace(/[\r\n"\\]/g, '_').slice(0, 160);
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    ResponseContentDisposition: 'attachment; filename="' + safeName + '"',
    ResponseCacheControl: 'private, no-store'
  });
  return getSignedUrl(client, command, { expiresIn: 60 });
}

module.exports = { isStorageConfigured, makeObjectKey, createUploadUrl, inspectObject, createDownloadUrl };
