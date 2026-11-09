import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class FactusCryptoService {
  private readonly logger = new Logger(FactusCryptoService.name);
  private readonly key: Buffer;

  constructor() {
    const rawKey =
      process.env.FACTUS_CREDENTIALS_ENCRYPTION_KEY ||
      process.env.ENCRYPTION_KEY ||
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
      this.key = Buffer.from(rawKey, 'hex');
    } else {
      // Derivar 32 bytes de forma determinista usando scrypt
      this.key = crypto.scryptSync(rawKey, 'karta-factus-crypto-salt', 32);
    }
  }

  /**
   * Cifra un texto plano usando AES-256-GCM
   * Retorna formato: ivHex:authTagHex:ciphertextHex
   */
  encrypt(plainText: string): string {
    if (!plainText) return '';
    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
      const encrypted = Buffer.concat([
        cipher.update(plainText, 'utf8'),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    } catch (err) {
      this.logger.error(`Error al cifrar credencial Factus: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Descifra un texto en formato ivHex:authTagHex:ciphertextHex usando AES-256-GCM
   */
  decrypt(cipherTextWithMeta: string): string {
    if (!cipherTextWithMeta) return '';
    const parts = cipherTextWithMeta.split(':');
    if (parts.length !== 3) {
      // Si no tiene el formato iv:tag:cipher, se asume texto no cifrado para resiliencia
      return cipherTextWithMeta;
    }

    const ivHex = parts[0];
    const authTagHex = parts[1];
    const encryptedHex = parts[2];
    if (!ivHex || !authTagHex || !encryptedHex) {
      return cipherTextWithMeta;
    }

    try {
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const encrypted = Buffer.from(encryptedHex, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch (err) {
      this.logger.error(`Error al descifrar credencial Factus: ${(err as Error).message}`);
      throw err;
    }
  }
}
