import { describe, it, expect } from 'vitest';
import {
  normalizeColombianPhoneToE164,
  isValidColombianMobileE164,
  buildWhatsAppLink,
  buildStaffInviteWhatsAppMessage,
  InvalidPhoneNumberError,
} from '../src/utils/whatsapp-templates';
import { ColombianPhoneSchema } from '../src/schemas/foundation.schema';

describe('TC-01-U02: Normalización E.164 Colombia y Enlaces WhatsApp', () => {
  it('debe normalizar números colombianos de 10 dígitos a +573XXXXXXXXX', () => {
    expect(normalizeColombianPhoneToE164('300 123 4567')).toBe('+573001234567');
    expect(normalizeColombianPhoneToE164('3001234567')).toBe('+573001234567');
    expect(normalizeColombianPhoneToE164('+57 300 123 4567')).toBe('+573001234567');
    expect(normalizeColombianPhoneToE164('573001234567')).toBe('+573001234567');
    expect(normalizeColombianPhoneToE164('(315) 987-6543')).toBe('+573159876543');
  });

  it('debe rechazar números inválidos en la función pura', () => {
    expect(() => normalizeColombianPhoneToE164('12345')).toThrowError(InvalidPhoneNumberError);
    expect(() => normalizeColombianPhoneToE164('2001234567')).toThrowError(InvalidPhoneNumberError);
    expect(isValidColombianMobileE164('12345')).toBe(false);
  });

  it('debe validar y transformar correctamente a través del esquema Zod', () => {
    const parsed = ColombianPhoneSchema.safeParse('300 123 4567');
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toBe('+573001234567');
    }

    const invalid = ColombianPhoneSchema.safeParse('12345');
    expect(invalid.success).toBe(false);
  });

  it('debe construir URLs de WhatsApp bien formadas', () => {
    const url = buildWhatsAppLink('+573001234567', 'Hola #A104');
    expect(url).toBe('https://wa.me/573001234567?text=Hola%20%23A104');
  });

  it('debe generar mensaje de invitación de personal por WhatsApp', () => {
    const message = buildStaffInviteWhatsAppMessage({
      staffName: 'Carlos',
      restaurantName: 'La Parrilla Central',
      roleName: 'Mesero',
      inviteUrl: 'https://restaurante.co/invite?token=xyz',
      tempPassword: 'TEMP_PASS_123',
    });

    expect(message).toContain('Carlos');
    expect(message).toContain('La Parrilla Central');
    expect(message).toContain('TEMP_PASS_123');
    expect(message).toContain('https://restaurante.co/invite?token=xyz');
  });
});
