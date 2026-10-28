/**
 * Utilidades de Telefonía E.164 (Colombia) y Enlaces WhatsApp (Click-to-chat)
 * Alineado con TC-01-U02 y Sección 4.6.3 de DEFINICION_TECNICA.md (v2.4.0)
 */

export class InvalidPhoneNumberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPhoneNumberError';
  }
}

/**
 * Normaliza y valida un número telefónico móvil de Colombia a formato estándar E.164 (+573XXXXXXXXX).
 * Acepta formatos con espacios, guiones, paréntesis o prefijos internacionales ("57", "+57").
 */
export function normalizeColombianPhoneToE164(rawPhone: string): string {
  if (!rawPhone || typeof rawPhone !== 'string') {
    throw new InvalidPhoneNumberError('El número telefónico no puede estar vacío.');
  }

  // Eliminar espacios, guiones, paréntesis, puntos
  const digitsAndPlus = rawPhone.trim().replace(/[\s\-().]/g, '');

  let digitsOnly = digitsAndPlus;
  if (digitsAndPlus.startsWith('+')) {
    digitsOnly = digitsAndPlus.slice(1);
  }

  // Si tiene 10 dígitos y empieza por 3 (móvil nacional de Colombia)
  if (/^3\d{9}$/.test(digitsOnly)) {
    return `+57${digitsOnly}`;
  }

  // Si tiene 12 dígitos y empieza por 573 (prefijo Colombia + móvil)
  if (/^573\d{9}$/.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }

  throw new InvalidPhoneNumberError(
    `El número '${rawPhone}' no es un teléfono móvil válido de Colombia. Debe tener 10 dígitos iniciando por 3 (ej: 300 123 4567 o +573001234567).`,
  );
}

/**
 * Validador seguro que retorna booleano en lugar de lanzar excepción.
 */
export function isValidColombianMobileE164(rawPhone: string): boolean {
  try {
    normalizeColombianPhoneToE164(rawPhone);
    return true;
  } catch {
    return false;
  }
}

/**
 * Construye un enlace seguro de WhatsApp Web / App (https://wa.me/)
 */
export function buildWhatsAppLink(phoneE164: string, message: string): string {
  const normalizedPhone = normalizeColombianPhoneToE164(phoneE164);
  const cleanNumber = normalizedPhone.replace('+', '');
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}

/**
 * Plantilla de mensaje de WhatsApp para invitar a un miembro del equipo o entregarle acceso temporal.
 */
export function buildStaffInviteWhatsAppMessage(params: {
  readonly staffName: string;
  readonly restaurantName: string;
  readonly roleName: string;
  readonly inviteUrl: string;
  readonly tempPassword?: string;
}): string {
  const { staffName, restaurantName, roleName, inviteUrl, tempPassword } = params;

  let message = `Hola ${staffName}, te damos la bienvenida al equipo de ${restaurantName}.\n`;
  message += `Se te ha asignado el rol de *${roleName}* en nuestra plataforma operativa.\n\n`;

  if (tempPassword) {
    message += `Tu contraseña temporal de acceso es: *${tempPassword}*\n`;
    message += `(Deberás definir tu propia contraseña al iniciar sesión).\n\n`;
    message += `Ingresa desde el siguiente enlace:\n${inviteUrl}`;
  } else {
    message += `Para activar tu cuenta y definir tu contraseña de acceso, pulsa el siguiente enlace (válido por 24 horas):\n${inviteUrl}`;
  }

  return message;
}

import { formatMoneyCop } from './money-cop';
import type { FulfillmentType } from '../constants/order-status.machine';
import type { CustomerSnapshot } from '../schemas/order-snapshots.schema';

/**
 * Plantilla de mensaje de confirmación y seguimiento que el restaurante envía al comensal tras procesar su pedido.
 */
export function buildOrderFollowupWhatsAppMessage(params: {
  readonly customerName: string;
  readonly restaurantName: string;
  readonly orderCode: string;
  readonly trackingUrl: string;
}): string {
  const { customerName, restaurantName, orderCode, trackingUrl } = params;
  return `¡Hola ${customerName}! En *${restaurantName}* hemos confirmado tu pedido *${orderCode}*.\n\nPuedes consultar el estado de preparación y despacho en vivo desde este enlace:\n${trackingUrl}\n\n¡Gracias por tu compra!`;
}

/**
 * Genera el enlace directo wa.me con el mensaje de invitación listo para compartir por WhatsApp
 */
export function generateStaffInvitationLink(
  phoneE164: string,
  restaurantName: string,
  inviteUrl: string,
  staffName = 'colaborador',
): string {
  const message = buildStaffInviteWhatsAppMessage({
    staffName,
    restaurantName,
    roleName: 'Equipo',
    inviteUrl,
  });
  return buildWhatsAppLink(phoneE164, message);
}

// ---------------------------------------------------------------------------
// Checkout Vitrina -> WhatsApp (Cliente -> Restaurante) y Privacidad
// ---------------------------------------------------------------------------

export interface CustomerWhatsAppOrderItem {
  quantity: number;
  productName: string;
  variantName?: string | null;
  modifiers?: string[];
  unitPriceCop?: number;
  lineTotalCop: number;
}

export interface CustomerWhatsAppOrderParams {
  branchWhatsAppPhone: string;
  orderCode: string;
  restaurantName: string;
  customerName: string;
  fulfillmentType: FulfillmentType;
  items: CustomerWhatsAppOrderItem[];
  subtotalProductsCop: number;
  deliveryFeeCop?: number;
  grandTotalCop: number;
  deliveryAddress?: {
    addressLine: string;
    neighborhood: string;
    referenceNotes?: string | null;
  } | null;
  notes?: string | null;
}

/**
 * Construye el enlace profundo wa.me que el comensal abre al pulsar "Terminar pedido por WhatsApp".
 * Incluye el código de pedido #A101, desglose de ítems, totales en COP y dirección de entrega.
 */
export function buildCustomerToBranchWhatsappUrl(params: CustomerWhatsAppOrderParams): string {
  const {
    branchWhatsAppPhone,
    orderCode,
    restaurantName,
    customerName,
    fulfillmentType,
    items,
    subtotalProductsCop,
    deliveryFeeCop = 0,
    grandTotalCop,
    deliveryAddress,
    notes,
  } = params;

  const modalityMap: Record<FulfillmentType, string> = {
    PICKUP: 'Para llevar (Takeout / Pickup)',
    DELIVERY: 'Domicilio (Delivery)',
    DINE_IN: 'En el restaurante (Mesa)',
  };

  const lines: string[] = [];
  lines.push(`🍽️ *${restaurantName}*`);
  lines.push(`¡Hola! Quiero confirmar mi pedido *${orderCode}*.`);
  lines.push('');
  lines.push(`🛵 *Modalidad:* ${modalityMap[fulfillmentType] || fulfillmentType}`);
  lines.push(`👤 *Cliente:* ${customerName}`);
  lines.push('');
  lines.push('📋 *Detalle del pedido:*');

  for (const item of items) {
    const variantStr = item.variantName ? ` (${item.variantName})` : '';
    lines.push(`• ${item.quantity}x ${item.productName}${variantStr} — ${formatMoneyCop(item.lineTotalCop)}`);
    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        lines.push(`   └ ${mod}`);
      }
    }
  }

  lines.push('');
  lines.push(`💵 *Subtotal productos:* ${formatMoneyCop(subtotalProductsCop)}`);
  if (fulfillmentType === 'DELIVERY' && deliveryFeeCop > 0) {
    lines.push(`🛵 *Costo de domicilio:* ${formatMoneyCop(deliveryFeeCop)}`);
  }
  lines.push(`💰 *Total a pagar:* ${formatMoneyCop(grandTotalCop)}`);

  if (fulfillmentType === 'DELIVERY' && deliveryAddress) {
    lines.push('');
    lines.push('📍 *Dirección de entrega:*');
    lines.push(`${deliveryAddress.addressLine}, Barrio ${deliveryAddress.neighborhood}`);
    if (deliveryAddress.referenceNotes) {
      lines.push(`Notas de entrega: ${deliveryAddress.referenceNotes}`);
    }
  }

  if (notes) {
    lines.push('');
    lines.push(`📝 *Observaciones:* ${notes}`);
  }

  lines.push('');
  lines.push('Quedo atento(a) a la confirmación de mi pedido. ¡Gracias!');

  const fullMessage = lines.join('\n');
  return buildWhatsAppLink(branchWhatsAppPhone, fullMessage);
}

// Re-exportar utilidades de enmascaramiento PII (Ley 1581)
export {
  maskCustomerName,
  maskCustomerPhone,
  maskCustomerAddress,
  maskCustomerSnapshot,
  type MaskedCustomerResult,
  type MaskCustomerInput,
} from './pii-masker';

import type { OrderStatus } from '../constants/order-status.machine';

/**
 * Plantilla de mensaje de confirmación que la sucursal envía al cliente al pulsar "Procesar pedido" (1 toque).
 * Alineado con FASE_03B Sección 3.2.
 * NO incluye dirección ni teléfono completo del cliente en el texto.
 */
export function buildBranchToCustomerProcessedWhatsapp(params: {
  readonly customerName: string;
  readonly customerPhoneE164: string;
  readonly restaurantName: string;
  readonly orderCode: string;
  readonly grandTotalCop: number;
  readonly publicToken: string;
  readonly trackingBaseUrl?: string;
}): { whatsapp_client_url: string; copyable_message: string } {
  const {
    customerName,
    customerPhoneE164,
    restaurantName,
    orderCode,
    grandTotalCop,
    publicToken,
    trackingBaseUrl = 'http://localhost:5173',
  } = params;

  // Extraer primer nombre para un tono más amigable
  const firstName = customerName.trim().split(/\s+/)[0] || 'Cliente';
  const cleanBase = trackingBaseUrl.replace(/\/+$/, '');
  const trackingUrl = `${cleanBase}/t/${publicToken}`;
  const formattedTotal = formatMoneyCop(grandTotalCop);

  const copyable_message = `Hola ${firstName}, tu pedido *${orderCode}* en *${restaurantName}* ha sido confirmado por un total de *${formattedTotal}*. Puedes ver el resumen final y el estado en vivo aquí: ${trackingUrl}`;
  const whatsapp_client_url = buildWhatsAppLink(customerPhoneE164, copyable_message);

  return {
    whatsapp_client_url,
    copyable_message,
  };
}

/**
 * Plantilla opcional de actualización de estado enviada desde la sucursal hacia el comensal.
 */
export function buildBranchToCustomerStatusWhatsapp(params: {
  readonly customerName: string;
  readonly customerPhoneE164: string;
  readonly restaurantName: string;
  readonly orderCode: string;
  readonly status: OrderStatus;
  readonly publicToken: string;
  readonly trackingBaseUrl?: string;
}): { whatsapp_client_url: string; copyable_message: string } {
  const {
    customerName,
    customerPhoneE164,
    restaurantName,
    orderCode,
    status,
    publicToken,
    trackingBaseUrl = 'http://localhost:5173',
  } = params;

  const firstName = customerName.trim().split(/\s+/)[0] || 'Cliente';
  const cleanBase = trackingBaseUrl.replace(/\/+$/, '');
  const trackingUrl = `${cleanBase}/t/${publicToken}`;

  let statusMsg = '';
  switch (status) {
    case 'PREPARING':
      statusMsg = `¡Hola ${firstName}! En *${restaurantName}* estamos preparando tu pedido *${orderCode}* con los mejores ingredientes.`;
      break;
    case 'READY':
      statusMsg = `¡Hola ${firstName}! Tu pedido *${orderCode}* en *${restaurantName}* está listo para recoger.`;
      break;
    case 'OUT_FOR_DELIVERY':
      statusMsg = `¡Hola ${firstName}! Tu pedido *${orderCode}* en *${restaurantName}* va en camino a tu dirección.`;
      break;
    case 'DELIVERED':
    case 'PICKED_UP':
    case 'SERVED':
      statusMsg = `¡Hola ${firstName}! Tu pedido *${orderCode}* ha sido entregado. ¡Esperamos que lo disfrutes!`;
      break;
    case 'REJECTED':
      statusMsg = `Hola ${firstName}, lamentamos informarte que en *${restaurantName}* no podemos atender tu pedido *${orderCode}* en este momento. Te pedimos disculpas por los inconvenientes.`;
      break;
    default:
      statusMsg = `¡Hola ${firstName}! Tu pedido *${orderCode}* en *${restaurantName}* ha cambiado a estado *${status}*.`;
      break;
  }

  const copyable_message = `${statusMsg} Puedes ver el seguimiento aquí: ${trackingUrl}`;
  const whatsapp_client_url = buildWhatsAppLink(customerPhoneE164, copyable_message);

  return {
    whatsapp_client_url,
    copyable_message,
  };
}

