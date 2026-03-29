import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const STORE_PATH = path.join(process.cwd(), '.data', 'auth-demo-store.json');
const CODE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SEND_COOLDOWN_MS = 60 * 1000;
const MAX_DAILY_DETECTIONS = 20;
const SESSION_COOKIE = 'verilens_session';

function now() {
  return Date.now();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function createEmptyStore() {
  return {
    users: [],
    codes: [],
    sessions: [],
    quotas: [],
  };
}

async function ensureStore() {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });

  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, JSON.stringify(createEmptyStore(), null, 2), 'utf8');
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(STORE_PATH, 'utf8');

  try {
    return JSON.parse(raw);
  } catch {
    return createEmptyStore();
  }
}

async function writeStore(store) {
  await ensureStore();
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';

  return header.split(';').reduce((accumulator, chunk) => {
    const [name, ...rest] = chunk.trim().split('=');
    if (!name) return accumulator;
    accumulator[name] = decodeURIComponent(rest.join('='));
    return accumulator;
  }, {});
}

function buildCookie(token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export async function sendLoginCode(emailInput) {
  const email = normalizeEmail(emailInput);

  if (!email || !email.includes('@')) {
    return { ok: false, status: 400, message: 'Please enter a valid email address.' };
  }

  const store = await readStore();
  const existingPending = store.codes.find(
    (item) => item.email === email && item.expiresAt > now() && item.usedAt === null
  );

  if (existingPending && now() - existingPending.createdAt < SEND_COOLDOWN_MS) {
    const retryAfter = Math.ceil((SEND_COOLDOWN_MS - (now() - existingPending.createdAt)) / 1000);
    return {
      ok: false,
      status: 429,
      message: `Please wait ${retryAfter}s before requesting another code.`,
    };
  }

  const code = randomCode();
  const record = {
    id: randomId('code'),
    email,
    codeHash: hashValue(code),
    createdAt: now(),
    expiresAt: now() + CODE_TTL_MS,
    usedAt: null,
    attempts: 0,
  };

  store.codes = store.codes.filter((item) => !(item.email === email && item.usedAt === null));
  store.codes.push(record);
  await writeStore(store);

  return {
    ok: true,
    status: 200,
    message: 'Verification code sent.',
    demoCode: code,
    expiresInSeconds: Math.floor(CODE_TTL_MS / 1000),
  };
}

export async function verifyLoginCode(emailInput, codeInput) {
  const email = normalizeEmail(emailInput);
  const code = String(codeInput || '').trim();

  if (!email || !code) {
    return { ok: false, status: 400, message: 'Email and code are required.' };
  }

  const store = await readStore();
  const codeRecord = store.codes.find(
    (item) => item.email === email && item.usedAt === null && item.expiresAt > now()
  );

  if (!codeRecord) {
    return { ok: false, status: 400, message: 'Code expired or not found.' };
  }

  if (codeRecord.attempts >= 5) {
    return { ok: false, status: 429, message: 'Too many attempts. Please request a new code.' };
  }

  if (codeRecord.codeHash !== hashValue(code)) {
    codeRecord.attempts += 1;
    await writeStore(store);
    return { ok: false, status: 400, message: 'Invalid verification code.' };
  }

  codeRecord.usedAt = now();

  let user = store.users.find((item) => item.email === email);
  if (!user) {
    user = {
      id: randomId('user'),
      email,
      createdAt: now(),
      status: 'active',
    };
    store.users.push(user);
  }

  const token = randomId('session');
  store.sessions.push({
    id: randomId('sess'),
    tokenHash: hashValue(token),
    userId: user.id,
    createdAt: now(),
    expiresAt: now() + SESSION_TTL_MS,
  });

  await writeStore(store);

  return {
    ok: true,
    status: 200,
    sessionToken: token,
    user: {
      id: user.id,
      email: user.email,
      status: user.status,
    },
  };
}

export function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', buildCookie(token, Math.floor(SESSION_TTL_MS / 1000)));
}

export async function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const store = await readStore();
  const tokenHash = hashValue(token);
  const session = store.sessions.find((item) => item.tokenHash === tokenHash && item.expiresAt > now());
  if (!session) return null;

  const user = store.users.find((item) => item.id === session.userId && item.status === 'active');
  if (!user) return null;

  const quota = await getUserQuotaByStore(store, user.id);

  return {
    id: user.id,
    email: user.email,
    status: user.status,
    quota,
  };
}

async function getUserQuotaByStore(store, userId) {
  let quota = store.quotas.find((item) => item.userId === userId && item.date === todayKey());
  if (!quota) {
    quota = {
      userId,
      date: todayKey(),
      used: 0,
    };
    store.quotas.push(quota);
    await writeStore(store);
  }

  return {
    used: quota.used,
    limit: MAX_DAILY_DETECTIONS,
    remaining: Math.max(0, MAX_DAILY_DETECTIONS - quota.used),
  };
}

export async function getUserQuota(userId) {
  const store = await readStore();
  return getUserQuotaByStore(store, userId);
}

export async function consumeDetectionQuota(userId) {
  const store = await readStore();
  let quota = store.quotas.find((item) => item.userId === userId && item.date === todayKey());

  if (!quota) {
    quota = {
      userId,
      date: todayKey(),
      used: 0,
    };
    store.quotas.push(quota);
  }

  if (quota.used >= MAX_DAILY_DETECTIONS) {
    return {
      ok: false,
      quota: {
        used: quota.used,
        limit: MAX_DAILY_DETECTIONS,
        remaining: 0,
      },
    };
  }

  quota.used += 1;
  await writeStore(store);

  return {
    ok: true,
    quota: {
      used: quota.used,
      limit: MAX_DAILY_DETECTIONS,
      remaining: Math.max(0, MAX_DAILY_DETECTIONS - quota.used),
    },
  };
}

export async function deleteSession(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  clearSessionCookie(res);

  if (!token) return;

  const store = await readStore();
  const tokenHash = hashValue(token);
  store.sessions = store.sessions.filter((item) => item.tokenHash !== tokenHash);
  await writeStore(store);
}
