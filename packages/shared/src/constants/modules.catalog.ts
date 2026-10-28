/**
 * Catálogo Central de Módulos, Dependencias y Perfiles de Operación
 * Alineado con DEFINICION_TECNICA.md (v2.4.0) y FASE_01_FUNDACION_Y_NUCLEO_SAAS.md
 */

export const MVP_MODULE_KEYS = [
  'ordering',
  'channel.pickup',
  'channel.delivery',
  'dining',
  'channel.dine_in_qr',
  'dining.consumption_split',
  'order_panel',
  'kitchen',
  'tracking',
  'payments.manual',
  'notifications.whatsapp_click',
  'notifications.email',
  'reporting',
] as const;

export const POST_MVP_MODULE_KEYS = [
  'payments.online',
  'payments.links',
  'notifications.whatsapp_api',
] as const;

export const CORE_SYSTEM_MODULE_KEYS = [
  'identity-access',
  'tenancy',
  'capabilities',
  'catalog',
  'audit',
] as const;

export type MvpModuleKey = (typeof MVP_MODULE_KEYS)[number];
export type PostMvpModuleKey = (typeof POST_MVP_MODULE_KEYS)[number];
export type CoreSystemModuleKey = (typeof CORE_SYSTEM_MODULE_KEYS)[number];
export type ModuleKey = MvpModuleKey | PostMvpModuleKey;

export interface ModuleDefinition {
  readonly key: ModuleKey;
  readonly name: string;
  readonly description: string;
  readonly depends_on_all: readonly ModuleKey[];
  readonly depends_on_any: readonly ModuleKey[];
  readonly is_core: boolean;
  readonly is_post_mvp: boolean;
}

export const MODULES_CATALOG: Readonly<Record<ModuleKey, ModuleDefinition>> = {
  ordering: {
    key: 'ordering',
    name: 'Pedidos Digitales y Carrito',
    description: 'Carrito de compras y recepción de pedidos digitales en el sitio público',
    depends_on_all: [],
    depends_on_any: [],
    is_core: false,
    is_post_mvp: false,
  },
  'channel.pickup': {
    key: 'channel.pickup',
    name: 'Recogida en Tienda',
    description: 'Modalidad de pedido para llevar (fulfillment_type = PICKUP)',
    depends_on_all: ['ordering'],
    depends_on_any: [],
    is_core: false,
    is_post_mvp: false,
  },
  'channel.delivery': {
    key: 'channel.delivery',
    name: 'Servicio a Domicilio',
    description: 'Modalidad de entrega a domicilio, cobertura y cálculo de envío',
    depends_on_all: ['ordering'],
    depends_on_any: [],
    is_core: false,
    is_post_mvp: false,
  },
  dining: {
    key: 'dining',
    name: 'Operación de Salón y Mesas',
    description: 'Áreas, plano de mesas y cuentas abiertas de salón (DiningAccount)',
    depends_on_all: ['payments.manual'],
    depends_on_any: [],
    is_core: false,
    is_post_mvp: false,
  },
  'channel.dine_in_qr': {
    key: 'channel.dine_in_qr',
    name: 'Autopedido QR en Mesa',
    description: 'Autopedido del comensal escaneando el código QR de su mesa con confirmación de mesero',
    depends_on_all: ['ordering', 'dining'],
    depends_on_any: [],
    is_core: false,
    is_post_mvp: false,
  },
  'dining.consumption_split': {
    key: 'dining.consumption_split',
    name: 'Distribución Informativa por Persona',
    description: 'Cálculo y desglose informativo del consumo individual por comensal en salón',
    depends_on_all: ['dining'],
    depends_on_any: [],
    is_core: false,
    is_post_mvp: false,
  },
  order_panel: {
    key: 'order_panel',
    name: 'Consola y Panel de Pedidos',
    description: 'Panel operativo de recepción, ajuste de pedidos y avance de estados',
    depends_on_all: [],
    depends_on_any: ['ordering', 'dining'],
    is_core: false,
    is_post_mvp: false,
  },
  kitchen: {
    key: 'kitchen',
    name: 'Pantalla de Cocina (KDS)',
    description: 'Visualización de comandas por estaciones de preparación en cocina/barra',
    depends_on_all: ['order_panel'],
    depends_on_any: ['ordering', 'dining'],
    is_core: false,
    is_post_mvp: false,
  },
  tracking: {
    key: 'tracking',
    name: 'Seguimiento en Vivo para el Cliente',
    description: 'Página pública de consulta en tiempo real del estado del pedido vía SSE',
    depends_on_all: ['ordering', 'order_panel'],
    depends_on_any: [],
    is_core: false,
    is_post_mvp: false,
  },
  'payments.manual': {
    key: 'payments.manual',
    name: 'Registro Manual de Pagos y Caja',
    description: 'Control de cobros presenciales (efectivo, datáfono, transferencia) e instrucciones de pago',
    depends_on_all: [],
    depends_on_any: ['order_panel', 'dining'],
    is_core: false,
    is_post_mvp: false,
  },
  'notifications.whatsapp_click': {
    key: 'notifications.whatsapp_click',
    name: 'Integración WhatsApp Click-to-Chat',
    description: 'Enlaces profundos https://wa.me/ con mensajes prellenados sin costo de API',
    depends_on_all: ['ordering'],
    depends_on_any: [],
    is_core: false,
    is_post_mvp: false,
  },
  'notifications.email': {
    key: 'notifications.email',
    name: 'Avisos Operativos por Email al Comensal',
    description: 'Notificaciones comerciales y recibos por correo dirigidos exclusivamente a comensales',
    depends_on_all: ['ordering'],
    depends_on_any: [],
    is_core: false,
    is_post_mvp: false,
  },
  reporting: {
    key: 'reporting',
    name: 'Reportes y Conciliación',
    description: 'Conciliación de ventas, tiempos operativos, arqueo de caja y exportación CSV',
    depends_on_all: [],
    depends_on_any: ['order_panel', 'dining'],
    is_core: false,
    is_post_mvp: false,
  },
  'payments.online': {
    key: 'payments.online',
    name: 'Pasarela de Pagos en Línea (Post-MVP)',
    description: 'Pasarela de pagos en línea integrada con webhooks (PSE, Tarjetas)',
    depends_on_all: [],
    depends_on_any: ['ordering', 'dining'],
    is_core: false,
    is_post_mvp: true,
  },
  'payments.links': {
    key: 'payments.links',
    name: 'Links Bancarios Compartibles (Post-MVP)',
    description: 'Generación de links de pago compartibles directamente por WhatsApp',
    depends_on_all: ['payments.online'],
    depends_on_any: [],
    is_core: false,
    is_post_mvp: true,
  },
  'notifications.whatsapp_api': {
    key: 'notifications.whatsapp_api',
    name: 'WhatsApp Business API Automatizada (Post-MVP)',
    description: 'Envíos automatizados server-to-server mediante WhatsApp Cloud API',
    depends_on_all: ['ordering'],
    depends_on_any: [],
    is_core: false,
    is_post_mvp: true,
  },
};

export const OPERATING_PROFILES = {
  MENU_ONLY: {
    key: 'MENU_ONLY',
    name: 'Solo menú',
    description: 'Presencia web y código QR para consulta de carta sin pedidos digitales',
    module_keys: [] as const,
    default_pickup_delivery_policy: 'NONE' as const,
  },
  WHATSAPP_SIMPLE: {
    key: 'WHATSAPP_SIMPLE',
    name: 'WhatsApp simple',
    description: 'Pedidos estructurados hacia WhatsApp con Panel Liviano de 1 pantalla y link de seguimiento',
    module_keys: [
      'ordering',
      'channel.pickup',
      'channel.delivery',
      'notifications.whatsapp_click',
      'order_panel',
      'tracking',
    ] as const,
    default_pickup_delivery_policy: 'NONE' as const,
  },
  FULL_PANEL: {
    key: 'FULL_PANEL',
    name: 'Panel completo',
    description: 'Control de caja manual, instrucciones de pago (Nequi/DaviPlata), KDS opcional y reportes',
    module_keys: [
      'ordering',
      'channel.pickup',
      'channel.delivery',
      'notifications.whatsapp_click',
      'order_panel',
      'tracking',
      'payments.manual',
      'reporting',
    ] as const,
    default_pickup_delivery_policy: 'OFFLINE_ONLY' as const,
  },
  DINING_ROOM: {
    key: 'DINING_ROOM',
    name: 'Salón',
    description: 'Servicio a la mesa con meseros, autopedido QR confirmado, cocina KDS, división de cuenta y caja',
    module_keys: [
      'dining',
      'ordering',
      'channel.dine_in_qr',
      'order_panel',
      'kitchen',
      'tracking',
      'dining.consumption_split',
      'payments.manual',
      'reporting',
    ] as const,
    default_pickup_delivery_policy: 'OFFLINE_ONLY' as const,
  },
  ENTERPRISE_MULTI: {
    key: 'ENTERPRISE_MULTI',
    name: 'Completo / Multi-sucursal',
    description: 'Todos los 13 módulos del MVP activos con configuración independiente por sucursal',
    module_keys: [
      'ordering',
      'channel.pickup',
      'channel.delivery',
      'dining',
      'channel.dine_in_qr',
      'dining.consumption_split',
      'order_panel',
      'kitchen',
      'tracking',
      'payments.manual',
      'notifications.whatsapp_click',
      'notifications.email',
      'reporting',
    ] as const,
    default_pickup_delivery_policy: 'OFFLINE_ONLY' as const,
  },
} as const;

export type OperatingProfileKey = keyof typeof OPERATING_PROFILES;

export interface ModuleValidationSuccess {
  readonly valid: true;
}

export interface ModuleValidationFailure {
  readonly valid: false;
  readonly errorCode:
    | 'MODULE_RESERVED_POST_MVP'
    | 'PLAN_UPGRADE_REQUIRED'
    | 'MISSING_MODULE_DEPENDENCY'
    | 'MISSING_ANY_MODULE_DEPENDENCY'
    | 'UNKNOWN_MODULE';
  readonly message: string;
  readonly moduleKey?: string;
  readonly missingDependency?: string;
  readonly requiredAnyOf?: readonly string[];
}

export type ModuleValidationResult = ModuleValidationSuccess | ModuleValidationFailure;

/**
 * Evalúa atómicamente el conjunto resultante de módulos activos en lote.
 * Permite resolver dependencias conjuntas y disyuntivas sin bloqueos por orden secuencial.
 */
export function validateModuleSetAtomically(
  targetEnabledKeys: ReadonlySet<string> | readonly string[],
  planAllowedModules?: ReadonlySet<string> | readonly string[],
): ModuleValidationResult {
  const finalSet = targetEnabledKeys instanceof Set
    ? targetEnabledKeys
    : new Set(targetEnabledKeys);

  const planSet = planAllowedModules
    ? (planAllowedModules instanceof Set ? planAllowedModules : new Set(planAllowedModules))
    : null;

  for (const key of finalSet) {
    const mod = MODULES_CATALOG[key as ModuleKey];
    if (!mod) {
      return {
        valid: false,
        errorCode: 'UNKNOWN_MODULE',
        message: `El módulo '${key}' no existe en el catálogo.`,
        moduleKey: key,
      };
    }

    if (mod.is_post_mvp) {
      return {
        valid: false,
        errorCode: 'MODULE_RESERVED_POST_MVP',
        message: `El módulo '${key}' está reservado para la etapa Post-MVP y no puede activarse en esta versión.`,
        moduleKey: key,
      };
    }

    if (planSet && !planSet.has(key)) {
      return {
        valid: false,
        errorCode: 'PLAN_UPGRADE_REQUIRED',
        message: `El plan comercial actual no incluye el módulo '${key}'. Se requiere actualización de plan.`,
        moduleKey: key,
      };
    }

    // Regla de dependencias conjuntivas (depends_on_all)
    for (const dep of mod.depends_on_all) {
      if (!finalSet.has(dep)) {
        return {
          valid: false,
          errorCode: 'MISSING_MODULE_DEPENDENCY',
          message: `El módulo '${key}' requiere que el módulo '${dep}' esté activado.`,
          moduleKey: key,
          missingDependency: dep,
        };
      }
    }

    // Regla de dependencias disyuntivas (depends_on_any)
    if (mod.depends_on_any.length > 0) {
      const hasAny = mod.depends_on_any.some((dep) => finalSet.has(dep));
      if (!hasAny) {
        return {
          valid: false,
          errorCode: 'MISSING_ANY_MODULE_DEPENDENCY',
          message: `El módulo '${key}' requiere al menos uno de los siguientes módulos activos: [${mod.depends_on_any.join(', ')}].`,
          moduleKey: key,
          requiredAnyOf: mod.depends_on_any,
        };
      }
    }
  }

  return { valid: true };
}

export class ModuleValidationError extends Error {
  public readonly errorCode: ModuleValidationFailure['errorCode'];
  public readonly moduleKey?: string;
  public readonly missingDependency?: string;
  public readonly requiredAnyOf?: readonly string[];

  constructor(failure: ModuleValidationFailure) {
    super(failure.message);
    this.name = 'ModuleValidationError';
    this.errorCode = failure.errorCode;
    this.moduleKey = failure.moduleKey;
    this.missingDependency = failure.missingDependency;
    this.requiredAnyOf = failure.requiredAnyOf;
  }
}

export function assertModuleSetValidAtomically(
  targetEnabledKeys: ReadonlySet<string> | readonly string[],
  planAllowedModules?: ReadonlySet<string> | readonly string[],
): void {
  const result = validateModuleSetAtomically(targetEnabledKeys, planAllowedModules);
  if (!result.valid) {
    throw new ModuleValidationError(result);
  }
}
