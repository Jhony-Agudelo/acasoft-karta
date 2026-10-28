import { describe, it, expect } from 'vitest';
import { validateModuleSetAtomically, OPERATING_PROFILES } from '@restaurante-saas/shared';
import { useAuthStore } from '../src/stores/auth.store';
import { useBrandStore } from '../src/stores/brand.store';

describe('Frontend Capabilities & Stores Suite', () => {
  it('debe validar atómicamente dependencias de módulos en el cliente', () => {
    // Intentar activar dining.consumption_split sin dining
    const res1 = validateModuleSetAtomically(['dining.consumption_split']);
    expect(res1.valid).toBe(false);
    if (!res1.valid) {
      expect(res1.errorCode).toBe('MISSING_MODULE_DEPENDENCY');
      expect(res1.missingDependency).toBe('dining');
    }

    // Activar payments.manual, dining y dining.consumption_split
    const res2 = validateModuleSetAtomically(['payments.manual', 'dining', 'dining.consumption_split']);
    expect(res2.valid).toBe(true);
  });

  it('debe cargar los perfiles operativos predefinidos correctamente', () => {
    expect(OPERATING_PROFILES.FULL_PANEL).toBeDefined();
    expect(OPERATING_PROFILES.FULL_PANEL.module_keys).toContain('payments.manual');
    expect(OPERATING_PROFILES.MENU_ONLY.module_keys).not.toContain('payments.manual');
    expect(OPERATING_PROFILES.DINING_ROOM.module_keys).toContain('dining');
  });

  it('debe manejar el estado de autenticación y mustChangePassword en auth.store', () => {
    const store = useAuthStore.getState();

    store.setSession(
      {
        id: 'user-123',
        name: 'Cajero Prueba',
        email: 'cajero@restaurante.co',
        phone: '3001234567',
        tenantId: 'tenant-123',
        roleKey: 'CASHIER',
        permissions: ['orders:read'],
        branchScope: null,
        mustChangePassword: true,
      },
      'fake-jwt-token',
    );

    const updated = useAuthStore.getState();
    expect(updated.isAuthenticated).toBe(true);
    expect(updated.mustChangePassword).toBe(true);
    expect(updated.user?.name).toBe('Cajero Prueba');

    // Simular actualización tras cambiar clave
    updated.setUser({
      ...updated.user!,
      mustChangePassword: false,
    });

    expect(useAuthStore.getState().mustChangePassword).toBe(false);
  });

  it('debe actualizar los colores de marca y variables de tema', () => {
    const brandStore = useBrandStore.getState();
    brandStore.setBrandSettings({
      display_name: 'Pizzería Napolitana',
      primary_color: '#e11d48',
      secondary_color: '#059669',
    });

    const state = useBrandStore.getState();
    expect(state.settings.display_name).toBe('Pizzería Napolitana');
    expect(state.settings.primary_color).toBe('#e11d48');
    expect(state.settings.secondary_color).toBe('#059669');
  });
});
