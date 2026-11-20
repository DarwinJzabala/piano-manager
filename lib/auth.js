// Autenticación de Piano Manager para Cloudflare Workers + D1.
// Contraseñas: PBKDF2-SHA256 con sal aleatoria. Tokens: aleatorios, guardados sólo con hash.

const enc = new TextEncoder();
export const SESSION_COOKIE = 'pm_session';
export const REMEMBER_COOKIE = 'pm_remember';
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const REMEMBER_DAYS = 30;
const SESSION_HOURS = 12;
const RENEW_WINDOW_DAYS = 7;

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(hex) {
  const clean = String(hex || '').replace(/[^0-9a-f]/gi, '');
  if (clean.length % 2) return new Uint8Array();
  return Uint8Array.from(clean.match(/.{2}/g) || [], b => parseInt(b, 16));
}
function constantEqual(a, b) {
  const x = String(a || ''), y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
function sqlDate(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}
function iterations(env) {
  const n = Number(env?.AUTH_PBKDF2_ITERATIONS);
  // Cloudflare Workers limita PBKDF2 a 100.000 iteraciones.
  return Number.isInteger(n) && n >= 10000 && n <= 100000 ? n : 100000;
}

export async function hashPassword(password, env) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iterations(env)
  }, key, 256);
  return `pbkdf2$${iterations(env)}$${toHex(salt)}$${toHex(bits)}`;
}

export async function verifyPassword(password, stored, env) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const n = Number(parts[1]);
  if (!Number.isInteger(n) || n < 1000 || n > 200000) return false;
  const salt = fromHex(parts[2]);
  if (salt.length !== 16) return false;
  try {
    const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
      name: 'PBKDF2', hash: 'SHA-256', salt, iterations: n
    }, key, 256);
    return constantEqual(toHex(bits), parts[3]);
  } catch { return false; }
}

export function randomToken(bytes = 32) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}
export async function sha256(text) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(text)))));
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (name) out[name] = part.slice(i + 1).trim();
  }
  return out;
}
function isSecure(request) {
  return new URL(request.url).protocol === 'https:';
}
export function makeCookie(name, value, { maxAge, request, httpOnly = true, sameSite = 'Lax' } = {}) {
  const attrs = [`${name}=${value}`, 'Path=/', `SameSite=${sameSite}`];
  if (httpOnly) attrs.push('HttpOnly');
  if (isSecure(request)) attrs.push('Secure');
  if (Number.isFinite(maxAge)) {
    attrs.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
    attrs.push(`Expires=${new Date(Date.now() + Math.max(0, Math.floor(maxAge)) * 1000).toUTCString()}`);
  }
  return attrs.join('; ');
}
export function clearCookie(name, request) {
  return makeCookie(name, '', { maxAge: 0, request });
}

async function first(db, sql, binds = []) {
  const st = db.prepare(sql);
  return (binds.length ? st.bind(...binds) : st).first();
}
async function run(db, sql, binds = []) {
  const st = db.prepare(sql);
  return (binds.length ? st.bind(...binds) : st).run();
}

async function storedToken(type, raw) {
  return `${type}:${await sha256(raw)}`;
}

// Devuelve la sesión válida asociada a la cookie, o null.
export async function getSession(db, request) {
  const value = parseCookies(request.headers.get('Cookie') || '')[SESSION_COOKIE] || '';
  const m = /^([rs])\.([0-9a-f]{64})$/.exec(value);
  if (!m) return null;
  const [, type, raw] = m;
  const row = await first(db, `
    SELECT s.id AS session_id, s.token, s.expires_at, s.created_at,
           u.id, u.email, u.name, u.role, u.active
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? LIMIT 1`, [await storedToken(type, raw)]);
  if (!row || !row.active || row.expires_at <= new Date().toISOString().replace('T', ' ').slice(0, 19)) return null;
  return {
    type, raw,
    user: { id: row.id, email: row.email, name: row.name, role: row.role },
    sessionId: row.session_id,
    expiresAt: row.expires_at,
    renewCookie: null
  };
}

// Renovación con rotación de token para sesiones persistentes.
export async function maybeRenew(db, session, request) {
  if (session.type !== 'r') return null;
  const limit = Date.now() + RENEW_WINDOW_DAYS * 86400000;
  if (new Date(session.expiresAt.replace(' ', 'T') + 'Z').getTime() > limit) return null;
  const raw = randomToken();
  const expires = sqlDate(Date.now() + REMEMBER_DAYS * 86400000);
  await run(db, 'UPDATE sessions SET token = ?, expires_at = ? WHERE id = ?',
    [await storedToken('r', raw), expires, session.sessionId]);
  return makeCookie(SESSION_COOKIE, `r.${raw}`, { maxAge: REMEMBER_DAYS * 86400, request });
}

export async function createSession(db, user, keepSignedIn, request) {
  const type = keepSignedIn ? 'r' : 's';
  const raw = randomToken();
  const hours = keepSignedIn ? REMEMBER_DAYS * 24 : SESSION_HOURS;
  await run(db, `INSERT INTO sessions (user_id, token, expires_at, created_at)
    VALUES (?, ?, ?, datetime('now'))`, [user.id, await storedToken(type, raw), sqlDate(Date.now() + hours * 3600000)]);
  return makeCookie(SESSION_COOKIE, `${type}.${raw}`,
    { maxAge: keepSignedIn ? REMEMBER_DAYS * 86400 : undefined, request });
}

export async function destroySession(db, request) {
  const value = parseCookies(request.headers.get('Cookie') || '')[SESSION_COOKIE] || '';
  const m = /^([rs])\.([0-9a-f]{64})$/.exec(value);
  if (m) await run(db, 'DELETE FROM sessions WHERE token = ?', [await storedToken(m[1], m[2])]);
}

export async function destroyAllSessions(db, userId) {
  await run(db, 'DELETE FROM sessions WHERE user_id = ?', [userId]);
}

export async function rememberedUsername(request) {
  const value = parseCookies(request.headers.get('Cookie') || '')[REMEMBER_COOKIE] || '';
  try { return decodeURIComponent(value).slice(0, 254); } catch { return value.slice(0, 254); }
}

export async function loginKey(request, identifier) {
  const ip = request.headers.get('CF-Connecting-IP')
    || String(request.headers.get('X-Forwarded-For') || '').split(',')[0].trim()
    || 'local';
  return sha256(`${ip}|${identifier}`);
}

export async function loginLocked(db, key) {
  const row = await first(db, 'SELECT attempts, locked_until FROM login_attempts WHERE key = ?', [key]);
  if (!row) return false;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  if (row.locked_until && row.locked_until > now) return true;
  if (row.locked_until) await run(db, 'DELETE FROM login_attempts WHERE key = ?', [key]);
  return false;
}

export async function recordLoginFailure(db, key) {
  await run(db, `INSERT INTO login_attempts (key, attempts, locked_until, updated_at)
    VALUES (?, 1, NULL, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      attempts = CASE WHEN login_attempts.locked_until IS NOT NULL THEN login_attempts.attempts ELSE login_attempts.attempts + 1 END,
      locked_until = CASE WHEN login_attempts.attempts + 1 >= ${MAX_ATTEMPTS}
        THEN datetime('now', '+${LOCK_MINUTES} minutes') ELSE NULL END,
      updated_at = datetime('now')`, [key]);
}

export async function clearLoginFailures(db, key) {
  await run(db, 'DELETE FROM login_attempts WHERE key = ?', [key]);
}

export { MAX_ATTEMPTS, LOCK_MINUTES, REMEMBER_DAYS };
