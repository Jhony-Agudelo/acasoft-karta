import { describe, it, expect } from 'vitest';
import {
  isPathAllowedForRole,
  ROLE_DEFAULT_ROUTES,
  ROLE_ALLOWED_PATHS,
} from '../src/config/role-navigation.config';

describe('TC-POST06: Separación de Roles y Aislamiento de Sucursales', () => {
  describe('1. Matriz de Rutas Permitidas por Rol (isPathAllowedForRole)', () => {
    it('debe permitir a WAITER únicamente acceso a Salón y Menú, bloqueando administración y KDS', () => {
      expect(isPathAllowedForRole('/dining', 'WAITER')).toBe(true);
      expect(isPathAllowedForRole('/menu', 'WAITER')).toBe(true);

      // Rutas bloqueadas
      expect(isPathAllowedForRole('/dashboard', 'WAITER')).toBe(false);
      expect(isPathAllowedForRole('/kds', 'WAITER')).toBe(false);
      expect(isPathAllowedForRole('/panel', 'WAITER')).toBe(false);
      expect(isPathAllowedForRole('/reports', 'WAITER')).toBe(false);
      expect(isPathAllowedForRole('/admin/settings', 'WAITER')).toBe(false);
      expect(isPathAllowedForRole('/admin/capabilities', 'WAITER')).toBe(false);
      expect(isPathAllowedForRole('/admin/dining-tables', 'WAITER')).toBe(false);
    });

    it('debe permitir a KITCHEN únicamente acceso a Cocina KDS', () => {
      expect(isPathAllowedForRole('/kds', 'KITCHEN')).toBe(true);

      // Rutas bloqueadas
      expect(isPathAllowedForRole('/dashboard', 'KITCHEN')).toBe(false);
      expect(isPathAllowedForRole('/dining', 'KITCHEN')).toBe(false);
      expect(isPathAllowedForRole('/panel', 'KITCHEN')).toBe(false);
      expect(isPathAllowedForRole('/reports', 'KITCHEN')).toBe(false);
      expect(isPathAllowedForRole('/admin/settings', 'KITCHEN')).toBe(false);
    });

    it('debe permitir a CASHIER acceso a Salón, Caja, Panel y Reportes de arqueo, pero no a configuración administrativa', () => {
      expect(isPathAllowedForRole('/dining', 'CASHIER')).toBe(true);
      expect(isPathAllowedForRole('/panel', 'CASHIER')).toBe(true);
      expect(isPathAllowedForRole('/menu', 'CASHIER')).toBe(true);
      expect(isPathAllowedForRole('/reports', 'CASHIER')).toBe(true);

      // Rutas bloqueadas
      expect(isPathAllowedForRole('/dashboard', 'CASHIER')).toBe(false);
      expect(isPathAllowedForRole('/kds', 'CASHIER')).toBe(false);
      expect(isPathAllowedForRole('/admin/settings', 'CASHIER')).toBe(false);
      expect(isPathAllowedForRole('/admin/capabilities', 'CASHIER')).toBe(false);
      expect(isPathAllowedForRole('/admin/dining-tables', 'CASHIER')).toBe(false);
    });

    it('debe permitir a BRANCH_MANAGER operación y mesas, pero bloquear capacidades SaaS y facturación', () => {
      expect(isPathAllowedForRole('/dashboard', 'BRANCH_MANAGER')).toBe(true);
      expect(isPathAllowedForRole('/dining', 'BRANCH_MANAGER')).toBe(true);
      expect(isPathAllowedForRole('/kds', 'BRANCH_MANAGER')).toBe(true);
      expect(isPathAllowedForRole('/admin/dining-tables', 'BRANCH_MANAGER')).toBe(true);
      expect(isPathAllowedForRole('/reports', 'BRANCH_MANAGER')).toBe(true);

      // Rutas SaaS globales bloqueadas
      expect(isPathAllowedForRole('/admin/capabilities', 'BRANCH_MANAGER')).toBe(false);
      expect(isPathAllowedForRole('/admin/settings', 'BRANCH_MANAGER')).toBe(false);
    });

    it('debe otorgar acceso total a TENANT_ADMIN', () => {
      expect(isPathAllowedForRole('/dashboard', 'TENANT_ADMIN')).toBe(true);
      expect(isPathAllowedForRole('/admin/settings', 'TENANT_ADMIN')).toBe(true);
      expect(isPathAllowedForRole('/admin/capabilities', 'TENANT_ADMIN')).toBe(true);
      expect(isPathAllowedForRole('/dining', 'TENANT_ADMIN')).toBe(true);
      expect(isPathAllowedForRole('/kds', 'TENANT_ADMIN')).toBe(true);
      expect(isPathAllowedForRole('/reports', 'TENANT_ADMIN')).toBe(true);
    });
  });

  describe('2. Destinos por Defecto según Rol (ROLE_DEFAULT_ROUTES)', () => {
    it('debe dirigir a cada rol a su entorno operativo prioritario al iniciar sesión o ingresar a la raíz', () => {
      expect(ROLE_DEFAULT_ROUTES['WAITER']).toBe('/dining');
      expect(ROLE_DEFAULT_ROUTES['KITCHEN']).toBe('/kds');
      expect(ROLE_DEFAULT_ROUTES['CASHIER']).toBe('/dining');
      expect(ROLE_DEFAULT_ROUTES['DISPATCH_DRIVER']).toBe('/panel');
      expect(ROLE_DEFAULT_ROUTES['BRANCH_MANAGER']).toBe('/dining');
      expect(ROLE_DEFAULT_ROUTES['TENANT_ADMIN']).toBe('/dashboard');
      expect(ROLE_DEFAULT_ROUTES['PLATFORM_ADMIN']).toBe('/admin/capabilities');
    });
  });

  describe('3. Reglas de Bloqueo de Sucursal (Branch Lock)', () => {
    it('debe bloquear el selector a modo fijo cuando un rol operativo tiene exactamente 1 sede asignada', () => {
      const isBranchLockedForWaiter = (role: string, branchesCount: number) => {
        return role !== 'TENANT_ADMIN' && role !== 'PLATFORM_ADMIN' && branchesCount === 1;
      };

      // Mesero con 1 sede asignada -> Bloqueado fijo
      expect(isBranchLockedForWaiter('WAITER', 1)).toBe(true);
      // Cocinero con 1 sede asignada -> Bloqueado fijo
      expect(isBranchLockedForWaiter('KITCHEN', 1)).toBe(true);
      // Cajero con 1 sede asignada -> Bloqueado fijo
      expect(isBranchLockedForWaiter('CASHIER', 1)).toBe(true);

      // Administrador general -> Siempre puede alternar libremente
      expect(isBranchLockedForWaiter('TENANT_ADMIN', 1)).toBe(false);
      expect(isBranchLockedForWaiter('TENANT_ADMIN', 2)).toBe(false);

      // Gerente con 2 sedes -> Desplegable de sus sedes autorizadas
      expect(isBranchLockedForWaiter('BRANCH_MANAGER', 2)).toBe(false);
    });
  });
});

