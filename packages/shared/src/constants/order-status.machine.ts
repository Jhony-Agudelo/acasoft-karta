/**
 * Máquina de Estados Determinista del Ciclo de Vida del Pedido
 * Alineado con DEFINICION_TECNICA.md (v2.4.0 — Sección 9.1.3) y FASE_03A_MOTOR_PEDIDOS_ANTIFRAUDE_Y_WHATSAPP.md
 */

export type OrderOrigin = 'WHATSAPP' | 'WEB_DIRECT' | 'TABLE_QR' | 'STAFF';

export type FulfillmentType = 'PICKUP' | 'DELIVERY' | 'DINE_IN';

export type OrderStatus =
  | 'REQUESTED'
  | 'RECEIVED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'PICKED_UP'
  | 'SERVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED_UNPROCESSED';

export type OrderPaymentStatus =
  | 'NOT_TRACKED'
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'COURTESY'
  | 'WRITTEN_OFF';

export type OrderPaymentPolicy = 'NONE' | 'OFFLINE_ONLY';

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  'DELIVERED',
  'PICKED_UP',
  'SERVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED_UNPROCESSED',
] as const;

export const CANONICAL_STATUS_FLOW_BY_FULFILLMENT: Record<FulfillmentType, OrderStatus[]> = {
  PICKUP: ['ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP'],
  DELIVERY: ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'],
  DINE_IN: ['ACCEPTED', 'PREPARING', 'READY', 'SERVED'],
};

export interface OrderTransitionInput {
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  origin: OrderOrigin;
  fulfillmentType: FulfillmentType;
  activeStatusFlow?: OrderStatus[];
  requirePaymentBeforePreparation?: boolean;
  paymentStatus?: OrderPaymentStatus;
  paidTotalCop?: number;
}

export interface OrderTransitionResult {
  allowed: boolean;
  errorCode?: string;
  message?: string;
}

/**
 * Valida si una transición de estado de orden es legal y permitida según las reglas de negocio.
 */
export function canTransitionOrder(input: OrderTransitionInput): OrderTransitionResult {
  const {
    fromStatus,
    toStatus,
    fulfillmentType,
    activeStatusFlow,
    requirePaymentBeforePreparation = false,
    paymentStatus = 'NOT_TRACKED',
    paidTotalCop = 0,
  } = input;

  // 1. Estados idénticos: no hay transición
  if (fromStatus === toStatus) {
    return {
      allowed: false,
      errorCode: 'SAME_STATUS',
      message: 'El pedido ya se encuentra en este estado.',
    };
  }

  // 2. Si el estado actual es terminal, ninguna transición está permitida
  if (TERMINAL_ORDER_STATUSES.includes(fromStatus)) {
    return {
      allowed: false,
      errorCode: 'ORDER_ALREADY_IN_TERMINAL_STATE',
      message: `El pedido está en estado terminal '${fromStatus}' y no admite más transiciones.`,
    };
  }

  // 3. Regla obligatoria: si fromStatus === 'REQUESTED', debe ser aceptado, rechazado o expirado
  if (fromStatus === 'REQUESTED') {
    const validFromRequested: OrderStatus[] = ['ACCEPTED', 'REJECTED', 'EXPIRED_UNPROCESSED', 'CANCELLED'];
    if (!validFromRequested.includes(toStatus)) {
      return {
        allowed: false,
        errorCode: 'ORDER_MUST_BE_ACCEPTED_FIRST',
        message: `Un pedido en 'REQUESTED' no puede saltar a '${toStatus}' sin pasar primero por 'ACCEPTED'.`,
      };
    }
  }

  // 4. Incompatibilidad de estados finales o intermedios con la modalidad de entrega
  if ((toStatus === 'OUT_FOR_DELIVERY' || toStatus === 'DELIVERED') && fulfillmentType !== 'DELIVERY') {
    return {
      allowed: false,
      errorCode: 'INVALID_STATUS_FOR_FULFILLMENT_TYPE',
      message: `El estado '${toStatus}' es exclusivo para modalidad DELIVERY. Modalidad actual: '${fulfillmentType}'.`,
    };
  }

  if (toStatus === 'PICKED_UP' && fulfillmentType !== 'PICKUP') {
    return {
      allowed: false,
      errorCode: 'INVALID_STATUS_FOR_FULFILLMENT_TYPE',
      message: `El estado 'PICKED_UP' es exclusivo para modalidad PICKUP. Modalidad actual: '${fulfillmentType}'.`,
    };
  }

  if (toStatus === 'SERVED' && fulfillmentType !== 'DINE_IN') {
    return {
      allowed: false,
      errorCode: 'INVALID_STATUS_FOR_FULFILLMENT_TYPE',
      message: `El estado 'SERVED' es exclusivo para modalidad DINE_IN. Modalidad actual: '${fulfillmentType}'.`,
    };
  }

  // 5. Pre-cobro obligatorio antes de preparación y estados subsiguientes
  const operationalProgressStatuses: OrderStatus[] = [
    'PREPARING',
    'READY',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'PICKED_UP',
    'SERVED',
  ];

  if (
    operationalProgressStatuses.includes(toStatus) &&
    requirePaymentBeforePreparation &&
    paymentStatus !== 'PAID'
  ) {
    return {
      allowed: false,
      errorCode: 'PAYMENT_REQUIRED_BEFORE_PREPARATION',
      message: 'Se requiere pago completo confirmado antes de iniciar la preparación del pedido.',
    };
  }

  // 6. Rechazo o cancelación con cobros activos
  if ((toStatus === 'REJECTED' || toStatus === 'CANCELLED') && paidTotalCop > 0) {
    return {
      allowed: false,
      errorCode: 'ORDER_HAS_ACTIVE_PAYMENTS',
      message: 'No es posible cancelar o rechazar un pedido que tiene cobros registrados. Se requiere resolución financiera previa.',
    };
  }

  // 7. Caducidad automática solo permitida para pedidos no procesados
  if (toStatus === 'EXPIRED_UNPROCESSED') {
    if (fromStatus !== 'REQUESTED' && fromStatus !== 'RECEIVED') {
      return {
        allowed: false,
        errorCode: 'CANNOT_EXPIRE_PROCESSED_ORDER',
        message: `Solo pedidos en estado 'REQUESTED' o 'RECEIVED' pueden caducar automáticamente. Estado actual: '${fromStatus}'.`,
      };
    }
    return { allowed: true };
  }

  // 8. Rechazo y Cancelación
  if (toStatus === 'REJECTED') {
    // Solo puede rechazarse si aún no ha entrado en preparación
    if (fromStatus === 'REQUESTED' || fromStatus === 'RECEIVED' || fromStatus === 'ACCEPTED') {
      return { allowed: true };
    }
    return {
      allowed: false,
      errorCode: 'CANNOT_REJECT_PREPARING_ORDER',
      message: `Un pedido en '${fromStatus}' no puede rechazarse. Use cancelación si es necesario.`,
    };
  }

  if (toStatus === 'CANCELLED') {
    return { allowed: true };
  }

  // 9. Secuencia canónica de avance operativo
  // Si fromStatus es REQUESTED o RECEIVED y pasa a ACCEPTED: es válido
  if ((fromStatus === 'REQUESTED' || fromStatus === 'RECEIVED') && toStatus === 'ACCEPTED') {
    return { allowed: true };
  }

  // Usamos el flujo activo personalizado si existe, o el canónico por defecto
  const standardFlow = CANONICAL_STATUS_FLOW_BY_FULFILLMENT[fulfillmentType];
  const effectiveFlow = activeStatusFlow && activeStatusFlow.length > 0 ? activeStatusFlow : standardFlow;

  const fromIndex = effectiveFlow.indexOf(fromStatus);
  const toIndex = effectiveFlow.indexOf(toStatus);

  if (fromIndex === -1 && fromStatus !== 'REQUESTED' && fromStatus !== 'RECEIVED') {
    return {
      allowed: false,
      errorCode: 'INVALID_STATUS_TRANSITION',
      message: `El estado de origen '${fromStatus}' no pertenece al flujo operativo configurado.`,
    };
  }

  if (toIndex === -1) {
    return {
      allowed: false,
      errorCode: 'INVALID_STATUS_TRANSITION',
      message: `El estado de destino '${toStatus}' no pertenece al flujo operativo configurado.`,
    };
  }

  // Avance hacia atrás no permitido
  if (fromIndex !== -1 && toIndex <= fromIndex) {
    return {
      allowed: false,
      errorCode: 'INVALID_STATUS_TRANSITION',
      message: `No se permite retroceder de '${fromStatus}' a '${toStatus}'.`,
    };
  }

  // Si salta estados, verificar que no salte estados requeridos en effectiveFlow
  // Si toIndex > fromIndex + 1, verificar si el flujo permite saltos
  // Generalmente un pedido puede avanzar secuencialmente, o si un restaurante tiene flujo simplificado
  // configured in effectiveFlow, it follows that flow.
  return { allowed: true };
}

/**
 * Alias de compatibilidad para la máquina de estados.
 */
export const canTransitionOrderStatus = canTransitionOrder;

