import { describe, it, expect } from 'vitest';
import {
  OPERATING_PROFILES,
  validateModuleSetAtomically,
} from '../src/constants/modules.catalog';

describe('TC-01-U05: Verificación de los 5 Perfiles Operativos del MVP', () => {
  it('el perfil MENU_ONLY debe pasar la validación atómica del grafo', () => {
    const profile = OPERATING_PROFILES.MENU_ONLY;
    expect(profile.default_pickup_delivery_policy).toBe('NONE');
    const result = validateModuleSetAtomically(profile.module_keys);
    expect(result.valid).toBe(true);
  });

  it('el perfil WHATSAPP_SIMPLE debe pasar la validación atómica del grafo', () => {
    const profile = OPERATING_PROFILES.WHATSAPP_SIMPLE;
    expect(profile.default_pickup_delivery_policy).toBe('NONE');
    const result = validateModuleSetAtomically(profile.module_keys);
    expect(result.valid).toBe(true);
  });

  it('el perfil FULL_PANEL debe pasar la validación atómica del grafo', () => {
    const profile = OPERATING_PROFILES.FULL_PANEL;
    expect(profile.default_pickup_delivery_policy).toBe('OFFLINE_ONLY');
    const result = validateModuleSetAtomically(profile.module_keys);
    expect(result.valid).toBe(true);
  });

  it('el perfil DINING_ROOM debe pasar la validación atómica del grafo', () => {
    const profile = OPERATING_PROFILES.DINING_ROOM;
    expect(profile.default_pickup_delivery_policy).toBe('OFFLINE_ONLY');
    const result = validateModuleSetAtomically(profile.module_keys);
    expect(result.valid).toBe(true);
  });

  it('el perfil ENTERPRISE_MULTI debe pasar la validación atómica del grafo', () => {
    const profile = OPERATING_PROFILES.ENTERPRISE_MULTI;
    expect(profile.default_pickup_delivery_policy).toBe('OFFLINE_ONLY');
    const result = validateModuleSetAtomically(profile.module_keys);
    expect(result.valid).toBe(true);
  });

  it('los 5 perfiles deben estar definidos y cubrir los casos de uso del MVP', () => {
    const keys = Object.keys(OPERATING_PROFILES);
    expect(keys).toEqual([
      'MENU_ONLY',
      'WHATSAPP_SIMPLE',
      'FULL_PANEL',
      'DINING_ROOM',
      'ENTERPRISE_MULTI',
    ]);
  });
});
