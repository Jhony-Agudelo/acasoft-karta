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
