import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { normalizePhone } from '../../shared/phone.ts';
export const opaqueToken = () => randomBytes(32).toString('base64url');
export const digestToken = (t:string) => createHash('sha256').update(t).digest('hex');
export const hashPhone = (p:string, secret:string) => createHmac('sha256',secret).update(normalizePhone(p)).digest('hex');
export function hashPin(pin:string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(pin,salt,32).toString('hex');
}
export function verifyPin(pin:string, encoded:string) {
  const [salt, hash] = encoded.split(':');
  const actual = scryptSync(pin,salt,32);
  const expected = Buffer.from(hash,'hex');
  return expected.length === actual.length && timingSafeEqual(actual,expected);
}
export function secureEqual(a:string,b:string) {
  return timingSafeEqual(Buffer.from(digestToken(a),'hex'),Buffer.from(digestToken(b),'hex'));
}
