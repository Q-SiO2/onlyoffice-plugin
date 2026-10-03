import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { normalizePhone } from '../../shared/phone.ts';
export const opaqueToken = () => randomBytes(32).toString('base64url');
export const digestToken = (t: string) => createHash('sha256').update(t).digest('hex');
export const hashPhone = (p: string, secret: string) =>
  createHmac('sha256', secret).update(normalizePhone(p)).digest('hex');
export const hashPresentationCode = (code: string, secret: string) =>
  createHmac('sha256', secret)
    .update('presentation:' + code.trim())
    .digest('hex');
export function hashPin(pin: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(pin, salt, 32).toString('hex');
}
export function verifyPin(pin: string, encoded: string) {
  const [salt, hash] = encoded.split(':');
  const actual = scryptSync(pin, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export function secureEqual(a: string, b: string) {
  return timingSafeEqual(Buffer.from(digestToken(a), 'hex'), Buffer.from(digestToken(b), 'hex'));
}
export function seal(value: string, secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}
export function unseal(value: string, secret: string) {
  const [iv, tag, data] = value.split('.').map((s) => Buffer.from(s, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
