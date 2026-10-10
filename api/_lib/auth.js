import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { query, transaction } from './db.js';
const scrypt = promisify(scryptCallback);
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function checkCredentials(username, password) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) throw new HttpError(400, '账号为3-40位字母、数字或 . _ -');
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new HttpError(400, '密码长度需为12-128位');
}
export async function encodePassword(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + Buffer.from(await scrypt(password, salt, 64)).toString('hex');
}
export async function matchesPassword(password, encoded) {
  const [salt, expected] = encoded.split(':');
  const actual = Buffer.from(await scrypt(String(password).slice(0, 128), salt, 64));
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
export function session(c) {
  const cookie = c.req.header('cookie') || '';
  const token = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('quote_session='))?.slice(14);
  return token && query('SELECT hash FROM sessions WHERE hash=? AND expires>?').get(hash(token), Date.now());
}
export function requireAdmin(c) { if (!session(c)) throw new HttpError(401, '请先登录后台'); }
export function sameOrigin(c) {
  const origin = c.req.header('origin');
  const expected = process.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
  if (origin && origin !== expected && origin !== new URL(c.req.url).origin) throw new HttpError(403, '请求来源不允许');
  if (!origin && c.req.header('sec-fetch-site') === 'cross-site') throw new HttpError(403, '请求来源不允许');
}
export function setSession(c) {
  query('DELETE FROM sessions WHERE expires<?').run(Date.now());
  const token = randomBytes(32).toString('hex');
  const expires = Date.now() + 7 * 86400000;
  query('INSERT INTO sessions(hash,expires) VALUES(?,?)').run(hash(token), expires);
  const secure = process.env.COOKIE_SECURE === 'true' || (process.env.PUBLIC_ORIGIN || c.req.url).startsWith('https:');
  c.header('Set-Cookie', 'quote_session=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800' + (secure ? '; Secure' : ''));
}
export function logout(c) {
  const token = (c.req.header('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith('quote_session='))?.slice(14);
  if (token) query('DELETE FROM sessions WHERE hash=?').run(hash(token));
  c.header('Set-Cookie', 'quote_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
}
const attempts = new Map();
export function throttle(c) {
  // Proxy headers are trusted only when deployment explicitly opts in.
  const key = process.env.TRUST_PROXY === 'true' ? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local' : 'local';
  const now = Date.now();
  for (const [k, v] of attempts) if (now - v.start > 600000) attempts.delete(k);
  const value = attempts.get(key) || { count: 0, start: now };
  if (++value.count > 12) throw new HttpError(429, '尝试次数过多，请10分钟后重试');
  attempts.set(key, value);
}
export async function setup(username, password) {
  checkCredentials(username, password);
  const encoded = await encodePassword(password);
  transaction(() => {
    if (query('SELECT id FROM admin WHERE id=1').get()) throw new HttpError(409, '管理员已设置，请登录');
    query('INSERT INTO admin(id,username,password) VALUES(1,?,?)').run(username, encoded);
  });
}
export function fail(c, error) {
  if (!(error instanceof HttpError)) console.error(error);
  return c.json({ error: error instanceof HttpError ? error.message : '服务暂时无法处理，请稍后重试' }, error.status || 500);
}
export async function body(c) {
  const raw = await c.req.text();
  if (Buffer.byteLength(raw) > 1024 * 1024) throw new HttpError(413, '内容超过1MB，请减少报价行');
  try { return JSON.parse(raw); } catch { throw new HttpError(400, '请求数据格式错误'); }
}
