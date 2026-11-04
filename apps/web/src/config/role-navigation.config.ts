/**
 * Configuración centralizada de rutas permitidas y destinos por rol operativo.
 * Garantiza que roles como mesero, cocina o caja no vean opciones ajenas ni accedan por URL.
 */

export const ROLE_DEFAULT_ROUTES: Record<string, string> = {
  TENANT_ADMIN: '/dashboard',
  BRANCH_MANAGER: '/dining',
  CASHIER: '/dining',
  WAITER: '/dining',
  KITCHEN: '/kds',
  DISPATCH_DRIVER: '/panel',
  PLATFORM_ADMIN: '/admin/capabilities',
};

export const ROLE_ALLOWED_PATHS: Record<string, string[]> = {
  TENANT_ADMIN: [
    '/dashboard',
    '/panel',
    '/panel/lite',
    '/menu',
    '/admin/menu',
    '/admin/qr-codes',
    '/dining',
    '/delivery',
    '/pickup',
    '/kds',
    '/reports',
    '/admin/delivery-zones',
    '/admin/dining-tables',
    '/admin/customers',
    '/admin/cash-shifts',
    '/admin/capabilities',
    '/admin/settings',
  ],
  BRANCH_MANAGER: [
    '/dashboard',
    '/panel',
    '/panel/lite',
    '/menu',
    '/admin/menu',
    '/admin/qr-codes',
    '/dining',
    '/delivery',
    '/pickup',
    '/kds',
    '/reports',
    '/admin/delivery-zones',
    '/admin/dining-tables',
    '/admin/customers',
    '/admin/cash-shifts',
  ],
  CASHIER: [
    '/dining',
    '/panel',
    '/panel/lite',
    '/reports',
  ],
  WAITER: [
    '/dining',
  ],
  KITCHEN: [
    '/kds',
  ],
  DISPATCH_DRIVER: [
    '/panel',
    '/delivery',
  ],
  PLATFORM_ADMIN: [
    '/dashboard',
    '/admin/capabilities',
    '/admin/settings',
    '/admin/cash-shifts',
    '/reports',
  ],
};

/**
 * Determina si una ruta está autorizada para un rol específico.
 */
export function isPathAllowedForRole(path: string, roleKey?: string): boolean {
  if (!roleKey) return false;
  if (roleKey === 'TENANT_ADMIN') return true;

  const allowed = ROLE_ALLOWED_PATHS[roleKey];
  if (!allowed) return false;

  // Comparación por ruta exacta o prefijo
  return allowed.some((allowedPath) => {
    if (allowedPath === path) return true;
    if (path.startsWith(allowedPath + '/')) return true;
    return false;
  });
}

