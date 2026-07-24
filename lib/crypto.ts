import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Cifra los refresh tokens de Google antes de guardarlos (la clave vive en el
// entorno, nunca en la BD). AES-256-GCM: iv(12) + tag(16) + ciphertext.

function key(): Buffer {
  const hex = process.env.GOOGLE_TOKEN_ENC_KEY;
  if (!hex || hex.length !== 64) throw new Error('GOOGLE_TOKEN_ENC_KEY inválida (32 bytes hex)');
  return Buffer.from(hex, 'hex');
}

/** Devuelve el blob cifrado como string hex de bytea (`\x...`) para Postgres. */
export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return '\\x' + Buffer.concat([iv, tag, enc]).toString('hex');
}

/** Descifra desde el string hex de bytea que devuelve Postgres (`\x...`). */
export function decryptToken(byteaHex: string): string {
  const blob = Buffer.from(byteaHex.replace(/^\\x/, ''), 'hex');
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const enc = blob.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
