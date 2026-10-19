'use strict';

const crypto = require('node:crypto');
const { S3Client, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');

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

async function createUploadForm({ objectKey, contentType }) {
  const { client, config } = getClient();
  // The POST policy enforces a server-side request-size range, avoiding an unrestricted signed PUT.
  return createPresignedPost(client, {
    Bucket: config.bucket,
    Key: objectKey,
    Expires: 300,
    Fields: { 'Content-Type': contentType },
    Conditions: [
      ['content-length-range', 1, 10 * 1024 * 1024 + 16 * 1024],
      ['eq', '$Content-Type', contentType]
    ]
  });
}

function detectContentType(bytes) {
  if (bytes.length >= 5 && bytes.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

async function inspectObject({ objectKey }) {
  const { client, config } = getClient();
  const result = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }));
  const contentType = String(result.ContentType || '').toLowerCase().trim();
  const range = await client.send(new GetObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    Range: 'bytes=0-15'
  }));
  let signatureType = null;
  try {
    const prefix = await range.Body.transformToByteArray();
    signatureType = detectContentType(Buffer.from(prefix));
  } finally {
    if (range.Body && typeof range.Body.destroy === 'function') range.Body.destroy();
  }
  return {
    sizeBytes: Number(result.ContentLength),
    contentType,
    detectedContentType: signatureType
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

module.exports = { isStorageConfigured, makeObjectKey, createUploadForm, inspectObject, createDownloadUrl, detectContentType };
