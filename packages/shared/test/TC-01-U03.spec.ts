import { describe, it, expect } from 'vitest';
import {
  validateModuleSetAtomically,
  assertModuleSetValidAtomically,
  ModuleValidationError,
} from '../src/constants/modules.catalog';

describe('TC-01-U03: Evaluación Atómica del Grafo (depends_on_all y depends_on_any)', () => {
  it('debe validar exitosamente cuando dining y payments.manual se activan juntos en lote', () => {
    // dining -> depends_on_all: ['payments.manual']
    // payments.manual -> depends_on_any: ['order_panel', 'dining']
    // Juntos satisfacen recíprocamente el grafo
    const result = validateModuleSetAtomically(['dining', 'payments.manual']);
    expect(result.valid).toBe(true);
    expect(() => assertModuleSetValidAtomically(['dining', 'payments.manual'])).not.toThrow();
  });

  it('debe fallar con MISSING_MODULE_DEPENDENCY si dining se activa solo sin payments.manual', () => {
    const result = validateModuleSetAtomically(['dining']);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorCode).toBe('MISSING_MODULE_DEPENDENCY');
      expect(result.moduleKey).toBe('dining');
      expect(result.missingDependency).toBe('payments.manual');
    }

    expect(() => assertModuleSetValidAtomically(['dining'])).toThrowError(ModuleValidationError);
  });

  it('debe fallar con MISSING_ANY_MODULE_DEPENDENCY si payments.manual no tiene ni order_panel ni dining activos', () => {
    // payments.manual requiere ANY de ['order_panel', 'dining']
    const result = validateModuleSetAtomically(['payments.manual']);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorCode).toBe('MISSING_ANY_MODULE_DEPENDENCY');
      expect(result.moduleKey).toBe('payments.manual');
      expect(result.requiredAnyOf).toEqual(['order_panel', 'dining']);
    }
  });

  it('debe ser válido si payments.manual está acompañado de order_panel', () => {
    // order_panel requiere ANY de ['ordering', 'dining']
    // así que agregamos ordering + order_panel + payments.manual
    const result = validateModuleSetAtomically(['ordering', 'order_panel', 'payments.manual']);
    expect(result.valid).toBe(true);
  });

  it('debe rechazar con MODULE_RESERVED_POST_MVP cualquier intento de activar payments.online', () => {
    const result = validateModuleSetAtomically(['ordering', 'payments.online']);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorCode).toBe('MODULE_RESERVED_POST_MVP');
      expect(result.moduleKey).toBe('payments.online');
    }
  });

  it('debe rechazar con PLAN_UPGRADE_REQUIRED si el módulo no está en el plan', () => {
    const allowedPlanModules = new Set(['ordering', 'channel.pickup']);
    const result = validateModuleSetAtomically(['ordering', 'channel.pickup', 'channel.delivery'], allowedPlanModules);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorCode).toBe('PLAN_UPGRADE_REQUIRED');
      expect(result.moduleKey).toBe('channel.delivery');
    }
  });
});
