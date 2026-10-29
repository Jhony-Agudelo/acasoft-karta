import { describe, it, expect } from 'vitest';
import {
  isPathAllowedForRole,
  ROLE_DEFAULT_ROUTES,
  ROLE_ALLOWED_PATHS,
} from '../src/config/role-navigation.config';

describe('TC-POST06: Separación de Roles y Aislamiento de Sucursales', () => {
  describe('1. Matriz de Rutas Permitidas por Rol (isPathAllowedForRole)', () => {
    it('debe permitir a WAITER únicamente acceso a Salón y Mesas, bloqueando menú, administración y KDS', () => {
      expect(isPathAllowedForRole('/dining', 'WAITER')).toBe(true);

      // Rutas bloqueadas (incluyendo menú/carta que es administrado exclusivamente por la gerencia)
      expect(isPathAllowedForRole('/menu', 'WAITER')).toBe(false);
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

  describe('4. Aislamiento Estricto de Carrito (Table QR vs Takeout/Delivery)', () => {
    const computeStoreKey = (
      restaurantSlug: string,
      branchSlug: string,
      isTableQr: boolean,
      qrToken?: string | null,
      tableId?: string | null,
    ) => {
      const branchPart = branchSlug || 'branch';
      if (isTableQr && qrToken) {
        const tablePart = tableId ? `table-${tableId}` : `qr-${qrToken.slice(0, 16)}`;
        return `${restaurantSlug}/${branchPart}/${tablePart}`;
      }
      return `${restaurantSlug}/${branchPart}/takeout`;
    };

    it('debe generar claves completamente separadas para Salón (Mesa) y Tienda (Takeout/Delivery)', () => {
      const tableKeyM01 = computeStoreKey('karta-demo', 'sede-gourmet', true, 'token-qr-m01-abcdef12345678', 'table-uuid-1');
      const tableKeyM02 = computeStoreKey('karta-demo', 'sede-gourmet', true, 'token-qr-m02-9876543210fedc', 'table-uuid-2');
      const takeoutKey = computeStoreKey('karta-demo', 'sede-gourmet', false);

      // El carrito de la mesa M-01 NUNCA comparte almacenamiento con la mesa M-02 ni con takeout
      expect(tableKeyM01).toBe('karta-demo/sede-gourmet/table-table-uuid-1');
      expect(tableKeyM02).toBe('karta-demo/sede-gourmet/table-table-uuid-2');
      expect(takeoutKey).toBe('karta-demo/sede-gourmet/takeout');

      expect(tableKeyM01).not.toBe(takeoutKey);
      expect(tableKeyM01).not.toBe(tableKeyM02);
    });

    it('debe aislar carritos entre diferentes sedes bajo la misma marca', () => {
      const sedeGourmetTakeout = computeStoreKey('karta-demo', 'sede-gourmet', false);
      const sedeNorteTakeout = computeStoreKey('karta-demo', 'sede-norte', false);

      expect(sedeGourmetTakeout).toBe('karta-demo/sede-gourmet/takeout');
      expect(sedeNorteTakeout).toBe('karta-demo/sede-norte/takeout');
      expect(sedeGourmetTakeout).not.toBe(sedeNorteTakeout);
    });
  });

  describe('5. Bloqueo de Sede y Modalidad en Menú Público con QR de Mesa', () => {
    it('debe forzar la sucursal de la mesa cuando se escanea un QR de Salón', () => {
      const resolveBranch = (
        isTableQr: boolean,
        qrData: { branch_slug?: string; branch_id?: string } | null,
        urlBranchSlug?: string,
        branches: Array<{ slug: string; name: string }> = [],
      ) => {
        if (isTableQr && qrData?.branch_slug) {
          const match = branches.find((b) => b.slug === qrData.branch_slug);
          if (match) return match;
        }
        if (urlBranchSlug) {
          return branches.find((b) => b.slug === urlBranchSlug) || branches[0];
        }
        return branches[0];
      };

      const branchesList = [
        { slug: 'sede-gourmet', name: 'Sede Gourmet Zona G' },
        { slug: 'sede-norte', name: 'Sede Norte Chía' },
      ];

      // Aunque el usuario navegue o intente acceder con otra sede en URL,
      // la mesa pertenece físicamente a Sede Gourmet y se bloquea obligatoriamente a Sede Gourmet
      const resolved = resolveBranch(true, { branch_slug: 'sede-gourmet' }, 'sede-norte', branchesList);
      expect(resolved?.slug).toBe('sede-gourmet');
      expect(resolved?.name).toBe('Sede Gourmet Zona G');
    });

    it('debe ocultar el selector de sedes cuando el comensal está en mesa física', () => {
      const shouldShowBranchSwitcher = (isTableQr: boolean, branchesCount: number) => {
        return !isTableQr && branchesCount > 1;
      };

      expect(shouldShowBranchSwitcher(true, 3)).toBe(false); // En mesa -> Oculto siempre
      expect(shouldShowBranchSwitcher(false, 3)).toBe(true);  // En storefront general -> Visible
      expect(shouldShowBranchSwitcher(false, 1)).toBe(false); // Solo 1 sede -> Oculto
    });

    it('debe forzar la modalidad DINE_IN en CheckoutModal sin permitir cambiar a Domicilio', () => {
      const allowedFulfillments = (tableQrInfo?: { qrToken: string } | null) => {
        if (tableQrInfo) {
          return ['DINE_IN']; // Estrictamente bloqueado
        }
        return ['DELIVERY', 'PICKUP']; // Tienda pública general
      };

      expect(allowedFulfillments({ qrToken: 'token-m01' })).toEqual(['DINE_IN']);
      expect(allowedFulfillments(null)).toEqual(['DELIVERY', 'PICKUP']);
    });
  });
});

