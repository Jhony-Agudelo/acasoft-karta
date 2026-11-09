/**
 * @restaurante-saas/shared
 * Paquete común: contratos DTO, catálogo de módulos, utilidades matemáticas y esquemas Zod
 */

export * from './constants/modules.catalog';
export * from './constants/order-status.machine';
export * from './utils/money-cop';
export * from './utils/whatsapp-templates';
export * from './utils/tax-calculator';
export * from './schemas/foundation.schema';
export * from './schemas/catalog.schema';
export * from './schemas/order-snapshots.schema';
export * from './schemas/ordering.schema';
export * from './schemas/order-panel.schema';
export * from './utils/pii-masker';
export * from './constants/payment-status.machine';
export * from './utils/kitchen-aggregation';
export * from './schemas/panel-kitchen.schema';
export * from './utils/reporting-reconciliation.calculator';
export * from './utils/thermal-receipt.formatter';
export * from './schemas/reporting-subscription.schema';
export * from './constants/dining.machine';
export * from './utils/consumption-split.calculator';
export * from './schemas/dining.schema';
export * from './schemas/cash-shift.schema';
export * from './constants/factus-v2.catalog';
export * from './utils/factus-v2-mapper.calculator';
export * from './utils/payroll.calculator';
export * from './utils/financial-pnl.calculator';
export * from './schemas/factus-finance-payroll.schema';
