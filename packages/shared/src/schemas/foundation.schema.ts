import { z } from 'zod';
import { normalizeColombianPhoneToE164, isValidColombianMobileE164 } from '../utils/whatsapp-templates';
import { OPERATING_PROFILES, MODULES_CATALOG } from '../constants/modules.catalog';

/**
 * Esquema de validación y normalización para teléfonos móviles colombianos E.164 (+573XXXXXXXXX)
 */
export const ColombianPhoneSchema = z
  .string()
  .min(1, 'El número telefónico es obligatorio.')
  .refine(isValidColombianMobileE164, {
    message: 'Número móvil no válido. Debe tener 10 dígitos iniciando por 3 (ej. 300 123 4567).',
  })
  .transform((val) => normalizeColombianPhoneToE164(val));

export const RoleKeySchema = z.enum([
  'TENANT_ADMIN',
  'BRANCH_MANAGER',
  'CASHIER',
  'WAITER',
  'KITCHEN',
  'DISPATCH_DRIVER',
  'PLATFORM_SUPPORT',
  'PLATFORM_ADMIN',
]);
export type RoleKey = z.infer<typeof RoleKeySchema>;

export const OperatingProfileKeySchema = z.enum([
  'MENU_ONLY',
  'WHATSAPP_SIMPLE',
  'FULL_PANEL',
  'DINING_ROOM',
  'ENTERPRISE_MULTI',
]);

export const FulfillmentTypeSchema = z.enum(['PICKUP', 'DELIVERY', 'DINE_IN']);
export const PaymentPolicySchema = z.enum(['NONE', 'OFFLINE_ONLY']);

/**
 * Horario de operación semanal
 */
export const TimeSlotSchema = z.object({
  open_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM inválido'),
  close_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM inválido'),
});

export const DayOperatingHoursSchema = z.object({
  day: z.number().int().min(0).max(6), // 0: Domingo, 1: Lunes, ..., 6: Sábado
  is_closed: z.boolean().default(false),
  slots: z.array(TimeSlotSchema).default([]),
});

export const CreateBranchSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.').max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'El slug solo puede contener letras minúsculas, números y guiones.'),
  address: z.string().min(3, 'La dirección es obligatoria.'),
  phone_whatsapp_e164: ColombianPhoneSchema,
  timezone: z.string().default('America/Bogota'),
  operating_hours_json: z.array(DayOperatingHoursSchema).default([]),
});
export type CreateBranchDto = z.infer<typeof CreateBranchSchema>;

export const UpdateBranchSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  address: z.string().min(3).optional(),
  phone_whatsapp_e164: ColombianPhoneSchema.optional(),
  timezone: z.string().optional(),
  operating_hours_json: z.array(DayOperatingHoursSchema).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});
export type UpdateBranchDto = z.infer<typeof UpdateBranchSchema>;

/**
 * Registro de nueva organización / restaurante (Onboarding)
 */
export const RegisterTenantSchema = z.object({
  organization_name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.').max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'El slug solo puede contener letras minúsculas, números y guiones.'),
  admin_name: z.string().min(2, 'El nombre del administrador es obligatorio.').max(100),
  admin_email: z.string().email('Correo electrónico no válido.'),
  admin_password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
  admin_phone: ColombianPhoneSchema,
  plan_id: z.string().default('PLAN_STARTER_WHATSAPP'),
  initial_profile: OperatingProfileKeySchema.default('WHATSAPP_SIMPLE'),
  branch_name: z.string().min(2).default('Sede Principal'),
  branch_address: z.string().min(3).default('Calle Principal # 1-01'),
});

export type RegisterTenantDto = z.infer<typeof RegisterTenantSchema>;

/**
 * Autenticación y recuperación de credenciales
 */
export const LoginSchema = z.object({
  email: z.string().email('Correo electrónico no válido.'),
  password: z.string().min(1, 'La contraseña es obligatoria.'),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const ChangePasswordSchema = z.object({
  current_password: z.string().min(1, 'La contraseña actual es obligatoria.'),
  new_password: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres.'),
});
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;

export const AcceptInviteSchema = z.object({
  token: z.string().min(1, 'El token de invitación es obligatorio.'),
  new_password: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres.'),
});
export type AcceptInviteDto = z.infer<typeof AcceptInviteSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Correo electrónico no válido.'),
});
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'El token de restablecimiento es obligatorio.'),
  new_password: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres.'),
});
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;

/**
 * Gestión de usuarios del personal (independiente de email comensal)
 */
export const CreateStaffUserSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.'),
  email: z.string().email('Correo electrónico no válido.'),
  phone: ColombianPhoneSchema,
  role_key: RoleKeySchema,
  branch_scope: z.array(z.string().uuid()).nullable().default(null),
  delivery_mode: z.enum(['TEMPORARY_PASSWORD', 'WHATSAPP_INVITE_LINK']).default('WHATSAPP_INVITE_LINK'),
  temp_password: z.string().min(6).optional(),
});
export type CreateStaffUserDto = z.infer<typeof CreateStaffUserSchema>;

export const UpdateStaffUserSchema = z.object({
  name: z.string().min(2).optional(),
  phone: ColombianPhoneSchema.optional(),
  role_key: RoleKeySchema.optional(),
  branch_scope: z.array(z.string().uuid()).nullable().optional(),
  status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED']).optional(),
});
export type UpdateStaffUserDto = z.infer<typeof UpdateStaffUserSchema>;

/**
 * Instrucciones de pago directo (Nequi, DaviPlata, Bre-B, etc.)
 */
export const TransferInstructionSchema = z.object({
  provider: z.enum(['NEQUI', 'DAVIPLATA', 'BRE_B', 'BANCOLOMBIA', 'OTHER']),
  account_number_or_key: z.string().min(1, 'Número o llave obligatoria.'),
  account_holder_name: z.string().min(2, 'Titular obligatorio.'),
  notes: z.string().optional(),
});

export const PaymentInstructionsSchema = z.object({
  accepts_cash: z.boolean().default(true),
  accepts_pos: z.boolean().default(false),
  transfer_instructions: z.array(TransferInstructionSchema).default([]),
});

/**
 * Políticas de Canal de Sucursal (BranchChannelPolicy)
 * Restricciones obligatorias alineadas con TC-01-U04 y CHECKs de PostgreSQL.
 */
export const BranchChannelPolicySchema = z
  .object({
    fulfillment_type: FulfillmentTypeSchema,
    enabled: z.boolean().default(true),
    payment_policy: PaymentPolicySchema.default('NONE'),
    require_payment_before_preparation: z.boolean().default(false),
    payment_instructions_json: PaymentInstructionsSchema.nullable().optional(),
    active_status_flow: z.array(z.string()).default([]),
    tracking_enabled: z.boolean().default(true),
    whatsapp_number_e164: ColombianPhoneSchema.optional(),
    require_table_pin: z.boolean().default(false),
    unprocessed_expiry_minutes: z.number().int().min(5).max(1440).default(240),
  })
  .superRefine((data, ctx) => {
    // 1. DINE_IN exige payment_policy = 'OFFLINE_ONLY'
    if (data.fulfillment_type === 'DINE_IN' && data.payment_policy !== 'OFFLINE_ONLY') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payment_policy'],
        message: "Para 'DINE_IN', la política de pago debe ser obligatoriamente 'OFFLINE_ONLY'.",
      });
    }

    // 2. require_payment_before_preparation solo puede ser true con OFFLINE_ONLY en PICKUP o DELIVERY
    if (data.require_payment_before_preparation) {
      if (data.payment_policy === 'NONE') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['require_payment_before_preparation'],
          message: "No se puede exigir pago previo a la preparación si la política de cobro es 'NONE'.",
        });
      }

      if (data.fulfillment_type === 'DINE_IN') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['require_payment_before_preparation'],
          message: "La modalidad 'DINE_IN' no admite 'require_payment_before_preparation = true'.",
        });
      }
    }
  });

export type BranchChannelPolicyDto = z.infer<typeof BranchChannelPolicySchema>;

/**
 * Actualización de Políticas de Canal
 */
export const UpdateBranchChannelPolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    payment_policy: PaymentPolicySchema.optional(),
    require_payment_before_preparation: z.boolean().optional(),
    payment_instructions_json: PaymentInstructionsSchema.nullable().optional(),
    active_status_flow: z.array(z.string()).optional(),
    tracking_enabled: z.boolean().optional(),
    whatsapp_number_e164: ColombianPhoneSchema.optional(),
    require_table_pin: z.boolean().optional(),
    unprocessed_expiry_minutes: z.number().int().min(5).max(1440).optional(),
    // Para contexto de validación
    fulfillment_type: FulfillmentTypeSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.fulfillment_type === 'DINE_IN' && data.payment_policy && data.payment_policy !== 'OFFLINE_ONLY') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payment_policy'],
        message: "Para 'DINE_IN', la política de pago debe ser obligatoriamente 'OFFLINE_ONLY'.",
      });
    }

    if (data.require_payment_before_preparation === true) {
      if (data.payment_policy === 'NONE') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['require_payment_before_preparation'],
          message: "No se puede exigir pago antes de preparación con política 'NONE'.",
        });
      }
      if (data.fulfillment_type === 'DINE_IN') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['require_payment_before_preparation'],
          message: "'DINE_IN' no admite cobro previo obligatorio antes de cocina.",
        });
      }
    }
  });

/**
 * Actualización en lote de módulos de organización o sucursal
 */
export const ModuleToggleItemSchema = z.object({
  module_key: z.string(),
  enabled: z.boolean(),
  config_json: z.record(z.unknown()).optional(),
});

export const BatchUpdateModulesSchema = z.object({
  modules: z.array(ModuleToggleItemSchema),
});
export type BatchUpdateModulesDto = z.infer<typeof BatchUpdateModulesSchema>;

/**
 * Configuración de marca
 */
export const UpdateBrandSettingsSchema = z.object({
  logo_url: z.string().url().nullable().optional(),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color primario hexadecimal inválido').optional(),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color secundario hexadecimal inválido').optional(),
  cover_url: z.string().url().nullable().optional(),
  description: z.string().max(500).optional(),
  public_domain: z.string().nullable().optional(),
});
export type UpdateBrandSettingsDto = z.infer<typeof UpdateBrandSettingsSchema>;
