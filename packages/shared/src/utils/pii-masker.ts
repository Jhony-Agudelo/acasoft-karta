/**
 * Enmascaramiento de Datos Personales (PII)
 * Cumplimiento de la Ley Estatutaria 1581 de 2012 (Habeas Data Colombia)
 * Alineado con DEFINICION_TECNICA.md (v2.4.0) y FASE_03B_PANEL_LIVIANO_AJUSTES_Y_TRACKING_SSE.md
 */

import type { CustomerSnapshot } from '../schemas/order-snapshots.schema';

export interface MaskedCustomerResult extends CustomerSnapshot {
  phone_masked: string;
  address_masked: string;
}

export interface MaskCustomerInput {
  name: string;
  phone_e164: string;
  address_line?: string | null;
  neighborhood?: string | null;
  delivery_zone_id?: string | null;
  delivery_zone_name?: string | null;
  reference_notes?: string | null;
  privacy_consent_at?: string;
  anonymized_at?: string | null;
}

/**
 * Enmascara el nombre del cliente conservando el primer nombre y la inicial del segundo apellido o nombre.
 * Ej: "María Fernanda Gómez" -> "María F."
 *     "Carlos Rodríguez" -> "Carlos R."
 *     "Santiago" -> "Santiago"
 */
export function maskCustomerName(name: string): string {
  if (!name || typeof name !== 'string') return 'Cliente';
  if (name.trim() === 'Anonimizado' || name.trim() === 'Cliente Anonimizado') {
    return 'Anonimizado';
  }

  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
  }
  return parts[0] || 'Cliente';
}

/**
 * Enmascara un número E.164 conservando el código de país y los últimos 4 dígitos.
 * Ej: "+573159876543" -> "+57 *** *** 6543"
 */
export function maskCustomerPhone(phoneE164: string): string {
  if (!phoneE164 || typeof phoneE164 !== 'string') return '+57 *** *** 0000';
  if (phoneE164.startsWith('ANON_') || phoneE164 === 'REDACTED') {
    return 'REDACTED';
  }

  const digitsOnly = phoneE164.replace(/\D/g, '');
  if (digitsOnly.length >= 10) {
    const last4 = digitsOnly.slice(-4);
    return `+57 *** *** ${last4}`;
  }
  return '+57 *** *** 0000';
}

/**
 * Enmascara la dirección domiciliaria ocultando numeración específica pero conservando vía principal y barrio.
 * Ej: "Carrera 15 # 85-20 Apto 502", Barrio "Virrey" -> "Carrera 15 # ***, Virrey"
 */
export function maskCustomerAddress(addressLine?: string | null, neighborhood?: string | null): string {
  if (!addressLine || addressLine === 'REDACTED') {
    return neighborhood ? `***, ${neighborhood}` : 'REDACTED';
  }

  let maskedBase: string;
  if (addressLine.includes('#')) {
    const mainStreet = addressLine.split('#')[0]!.trim();
    maskedBase = `${mainStreet} # ***`;
  } else {
    maskedBase = addressLine.replace(/\d+/g, '***').trim();
  }

  if (neighborhood && neighborhood !== 'REDACTED') {
    return `${maskedBase}, ${neighborhood}`;
  }
  return maskedBase;
}

/**
 * Enmascara un snapshot completo de cliente para vistas públicas o no autorizadas.
 */
export function maskCustomerSnapshot(input: MaskCustomerInput): MaskedCustomerResult {
  const maskedName = maskCustomerName(input.name);
  const maskedPhone = maskCustomerPhone(input.phone_e164);
  const maskedAddressMasked = maskCustomerAddress(input.address_line, input.neighborhood);
  const maskedAddressLine = input.address_line
    ? input.address_line.replace(/\d/g, '*')
    : null;

  return {
    name: maskedName,
    phone_e164: maskedPhone,
    phone_masked: maskedPhone,
    address_line: maskedAddressLine,
    address_masked: maskedAddressMasked,
    neighborhood: input.neighborhood && input.neighborhood !== 'REDACTED' ? input.neighborhood : null,
    delivery_zone_id: input.delivery_zone_id || null,
    delivery_zone_name: input.delivery_zone_name || null,
    reference_notes: input.reference_notes && input.reference_notes !== 'REDACTED'
      ? input.reference_notes.replace(/\d/g, '*')
      : null,
    privacy_consent_at: input.privacy_consent_at || new Date().toISOString(),
    anonymized_at: input.anonymized_at || null,
  };
}
