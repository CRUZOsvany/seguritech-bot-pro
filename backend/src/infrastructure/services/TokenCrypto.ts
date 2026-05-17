import crypto from 'crypto';

/**
 * Cifrado simétrico AES-256-GCM para access tokens de Meta.
 *
 * Formato del ciphertext almacenado (base64):
 *   IV (12 bytes) || authTag (16 bytes) || encrypted
 *
 * Clave: 32 bytes hex (64 caracteres) desde META_TOKEN_ENCRYPTION_KEY.
 * Generar con: `openssl rand -hex 32`
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

export class TokenCrypto {
  private readonly key: Buffer;

  constructor(hexKey: string) {
    if (!hexKey || hexKey.length !== 64) {
      throw new Error(
        'META_TOKEN_ENCRYPTION_KEY debe ser 32 bytes en hex (64 caracteres). ' +
        'Genera con: openssl rand -hex 32',
      );
    }
    this.key = Buffer.from(hexKey, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  decrypt(ciphertextB64: string): string {
    const buf = Buffer.from(ciphertextB64, 'base64');
    if (buf.length < IV_LEN + TAG_LEN + 1) {
      throw new Error('Ciphertext inválido: longitud insuficiente');
    }
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const encrypted = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}