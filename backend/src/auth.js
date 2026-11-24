const crypto = require('crypto');

const { getDb } = require('./db');
const fallbackOtp = new Map();
const fallbackRequests = new Map();
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const OTP_REQUEST_LIMIT = 5;
const OTP_REQUEST_COOLDOWN_MS = 60 * 1000;
const OTP_VERIFY_LIMIT = 5;
const OTP_STORE_MAX = 10000;
const TOKEN_TTL_SECONDS = 24 * 60 * 60;


function pruneFallbackStores(nowMs = Date.now()) {
  for (const [phone, record] of fallbackOtp) {
    if (!record || record.expiresAt <= nowMs) fallbackOtp.delete(phone);
  }
  for (const [phone, record] of fallbackRequests) {
    if (!record || nowMs - record.windowStart >= OTP_REQUEST_WINDOW_MS) fallbackRequests.delete(phone);
  }
  while (fallbackOtp.size >= OTP_STORE_MAX) fallbackOtp.delete(fallbackOtp.keys().next().value);
  while (fallbackRequests.size >= OTP_STORE_MAX) fallbackRequests.delete(fallbackRequests.keys().next().value);
}

class AuthError extends Error {
  constructor(message, statusCode = 503) {
    super(message);
    this.statusCode = statusCode;
  }
}

function getJwtSecret() {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (!secret || secret === 'replace_with_secure_secret' || secret.length < 32) {
    throw new AuthError('JWT_SECRET is not securely configured');
  }
  return secret;
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(input, secret) {
  return crypto.createHmac('sha256', secret).update(input).digest('base64url');
}

function createToken(phone) {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: String(phone),
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  }));
  return `${header}.${payload}.${sign(`${header}.${payload}`, secret)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (header?.alg !== 'HS256' || header?.typ !== 'JWT') return null;
  const now = Math.floor(Date.now() / 1000);
  if (!payload?.sub || !Number.isFinite(payload.iat) || payload.iat > now + 60 || !Number.isFinite(payload.exp) || payload.exp <= now || payload.exp <= payload.iat) return null;
  let expected;
  try {
    expected = sign(`${parts[0]}.${parts[1]}`, getJwtSecret());
  } catch {
    return null;
  }
  const provided = Buffer.from(parts[2]);
  const calculated = Buffer.from(expected);
  if (provided.length !== calculated.length || !crypto.timingSafeEqual(provided, calculated)) return null;
  return payload;
}

async function sendOtp(phone, otp) {
  const providerUrl = (process.env.OTP_PROVIDER_URL || '').trim();
  const accessToken = (process.env.OTP_PROVIDER_TOKEN || '').trim();
  if (providerUrl) {
    let parsedProviderUrl;
    try { parsedProviderUrl = new URL(providerUrl); } catch { throw new AuthError('OTP provider URL is invalid'); }
    const allowLocalHttp = process.env.NODE_ENV !== 'production' &&
      ['localhost', '127.0.0.1'].includes(parsedProviderUrl.hostname);
    if (parsedProviderUrl.protocol !== 'https:' && !allowLocalHttp) {
      throw new AuthError('OTP provider URL must use HTTPS');
    }
  }

  if (!providerUrl || !accessToken) {
    if (process.env.NODE_ENV === 'production') {
      throw new AuthError('OTP provider is not configured');
    }
    return { delivery: 'development', devOtp: otp };
  }

  const response = await fetch(providerUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: String(phone),
      message: `Your Ayansha Health Care verification code is ${otp}. It expires in 5 minutes.`
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new AuthError('OTP provider rejected the request', 502);
  return { delivery: 'provider_accepted' };
}

function otpHash(phone, otp) {
  const secret = (process.env.OTP_HASH_SECRET || process.env.JWT_SECRET || 'development-otp-hash').trim();
  return crypto.createHmac('sha256', secret).update(phone + ':' + otp).digest('hex');
}

function safeHashEquals(expectedHex, providedHex) {
  if (typeof expectedHex !== 'string' || typeof providedHex !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(expectedHex) || !/^[a-f0-9]{64}$/i.test(providedHex)) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const provided = Buffer.from(providedHex, 'hex');
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

async function issueOtp(phone, purpose = 'patient') {
  if (!['patient', 'doctor'].includes(purpose)) throw new AuthError('Invalid OTP purpose', 400);
  const normalizedPhone = String(phone).trim();
  const storeKey = `${purpose}:${normalizedPhone}`;
  if (!/^\+?[1-9]\d{9,14}$/.test(normalizedPhone)) throw new AuthError('phone must be a valid international phone number', 422);
  const db = await getDb();
  const otp = String(crypto.randomInt(100000, 1000000));
  if (!db) {
    if (process.env.NODE_ENV === 'production') throw new AuthError('OTP service requires database storage');
    const nowMs = Date.now();
    pruneFallbackStores(nowMs);
    const prior = fallbackRequests.get(storeKey);
    if (prior && nowMs-prior.lastRequestAt < OTP_REQUEST_COOLDOWN_MS) throw new AuthError('Please wait before requesting another OTP',429);
    if (prior && nowMs-prior.windowStart < OTP_REQUEST_WINDOW_MS && prior.count>=OTP_REQUEST_LIMIT) throw new AuthError('OTP request limit reached; try again later',429);
    fallbackRequests.set(storeKey,{windowStart:prior && nowMs-prior.windowStart<OTP_REQUEST_WINDOW_MS?prior.windowStart:nowMs,count:prior && nowMs-prior.windowStart<OTP_REQUEST_WINDOW_MS?prior.count+1:1,lastRequestAt:nowMs});
    fallbackOtp.set(storeKey,{hash:otpHash(normalizedPhone,otp),expiresAt:nowMs+OTP_TTL_MS,attempts:0});
    const delivery=await sendOtp(normalizedPhone,otp);
    return {...delivery,expiresInSeconds:OTP_TTL_MS/1000};
  }
  const now = new Date();
  const windowStart = new Date(now.getTime() - OTP_REQUEST_WINDOW_MS);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const prior = await client.query('SELECT * FROM auth_otp_request_state WHERE phone=$1 FOR UPDATE', [normalizedPhone]);
    const record = prior.rows[0];
    if (record && now.getTime() - new Date(record.last_request_at).getTime() < OTP_REQUEST_COOLDOWN_MS) {
      await client.query('ROLLBACK'); throw new AuthError('Please wait before requesting another OTP', 429);
    }
    if (record && now.getTime() - new Date(record.window_start).getTime() < OTP_REQUEST_WINDOW_MS && Number(record.request_count) >= OTP_REQUEST_LIMIT) {
      await client.query('ROLLBACK'); throw new AuthError('OTP request limit reached; try again later', 429);
    }
    await client.query(
      `INSERT INTO auth_otp_request_state(phone,window_start,request_count,last_request_at)
       VALUES($1,$2,1,$3) ON CONFLICT(phone) DO UPDATE SET
       window_start=CASE WHEN auth_otp_request_state.window_start <= $4 THEN $2 ELSE auth_otp_request_state.window_start END,
       request_count=CASE WHEN auth_otp_request_state.window_start <= $4 THEN 1 ELSE auth_otp_request_state.request_count+1 END,
       last_request_at=$3`,
      [normalizedPhone, now, now, windowStart]
    );
    await client.query(
      `INSERT INTO auth_otp_state(phone,purpose,otp_hash,expires_at,attempts,created_at)
       VALUES($1,$2,$3,$4,0,$5) ON CONFLICT(phone,purpose) DO UPDATE SET otp_hash=$3,expires_at=$4,attempts=0,created_at=$5`,
      [normalizedPhone, purpose, otpHash(normalizedPhone, otp), new Date(now.getTime()+OTP_TTL_MS), now]
    );
    await client.query('COMMIT');
  } catch(error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
  finally { client.release(); }
  try {
    const delivery = await sendOtp(normalizedPhone, otp);
    return { ...delivery, expiresInSeconds: OTP_TTL_MS / 1000 };
  } catch(error) {
    await db.query('DELETE FROM auth_otp_state WHERE phone=$1 AND purpose=$2', [normalizedPhone,purpose]);
    throw error;
  }
}

async function verifyOtp(phone, otp, purpose = 'patient') {
  if (typeof phone !== 'string' || typeof otp !== 'string' || !['patient', 'doctor'].includes(purpose)) return false;
  const normalizedPhone=phone.trim(), normalizedOtp=otp.trim();
  const storeKey = `${purpose}:${normalizedPhone}`;
  if (!/^\+?[1-9]\d{9,14}$/.test(normalizedPhone) || !/^\d{6}$/.test(normalizedOtp)) return false;
  const db=await getDb(); if(!db){ if(process.env.NODE_ENV==='production') return false; const record=fallbackOtp.get(storeKey); if(!record||record.expiresAt<=Date.now()||record.attempts>=OTP_VERIFY_LIMIT){fallbackOtp.delete(storeKey);return false;} if(!safeHashEquals(record.hash,otpHash(normalizedPhone,normalizedOtp))){record.attempts++;if(record.attempts>=OTP_VERIFY_LIMIT)fallbackOtp.delete(storeKey);return false;} fallbackOtp.delete(storeKey);return true; }
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    const q=await client.query('SELECT * FROM auth_otp_state WHERE phone=$1 AND purpose=$2 FOR UPDATE',[normalizedPhone,purpose]);
    const row=q.rows[0];
    if(!row || new Date(row.expires_at).getTime()<=Date.now() || Number(row.attempts)>=OTP_VERIFY_LIMIT){
      await client.query('DELETE FROM auth_otp_state WHERE phone=$1 AND purpose=$2',[normalizedPhone,purpose]); await client.query('COMMIT'); return false;
    }
    if(!safeHashEquals(row.otp_hash,otpHash(normalizedPhone,normalizedOtp))){
      const attempts=Number(row.attempts)+1;
      if(attempts>=OTP_VERIFY_LIMIT) await client.query('DELETE FROM auth_otp_state WHERE phone=$1 AND purpose=$2',[normalizedPhone,purpose]);
      else await client.query('UPDATE auth_otp_state SET attempts=$3 WHERE phone=$1 AND purpose=$2',[normalizedPhone,purpose,attempts]);
      await client.query('COMMIT'); return false;
    }
    await client.query('DELETE FROM auth_otp_state WHERE phone=$1 AND purpose=$2',[normalizedPhone,purpose]);
    await client.query('COMMIT'); return true;
  } catch(e){try{await client.query('ROLLBACK')}catch{} throw e;}
  finally{client.release();}
}

module.exports = { issueOtp, verifyOtp, createToken, verifyToken, AuthError };
