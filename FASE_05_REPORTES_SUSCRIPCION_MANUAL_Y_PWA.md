# Fase 05: Reportes Conciliados, Suscripción SaaS Manual, Impresión Térmica y PWA

**Documento:** `FASE_05_REPORTES_SUSCRIPCION_MANUAL_Y_PWA.md`  
**Versión:** 2.4.0 — Alineado con `DEFINICION_TECNICA.md` (v2.4.0) y `STACK_VERSIONS.md` (v2.4.0)  
**Fecha:** 2026-10-27  
**Prerrequisitos:** `FASE_01`, `FASE_02`, `FASE_03A`, `FASE_03B` y `FASE_04` (v2.4.0) completadas y con todas sus puertas de pruebas en verde.  
**Objetivo de la Fase:** Completar al 100 % el **Nivel 2 de la Escalera de Adopción (`FULL_PANEL`)** implementando el módulo de **Reportes y Conciliación Financiera (`reporting`)** sobre órdenes independientes (preparado para extenderse con cuentas de salón en la Fase 06), la regla de prelación de imputación en pagos parciales, el exportador CSV auditado y libre de PII (Ley 1581 de 2012), el módulo de **Suscripción SaaS Manual (`billing-subscription`)**, el motor de **Impresión Térmica CSS (58mm / 80mm)** con la leyenda fiscal obligatoria de la DIAN y el empaquetado como **Progressive Web App (PWA)** instalable con indicador de resiliencia de red.

---

## 1. Reglas de Ingeniería, Arquitectura Limpia y Conciliación Contable (Directivas para Gemini)

Al procesar este documento junto con `DEFINICION_TECNICA.md` (v2.4.0) y `STACK_VERSIONS.md` (v2.4.0) para generar código, debes cumplir sin excepción las siguientes directivas:

1. **Política de Cero Código Incompleto (`Zero-Placeholder Policy`):**
   - Está estrictamente prohibido entregar archivos con comentarios como `// TODO`, `// implementar luego`, `// ... resto del código` o funciones vacías. Cada archivo generado debe ser **100 % funcional, compilable y estrictamente tipado**.
2. **Apego Estricto a `STACK_VERSIONS.md` y Entrega con Puertas Manuales:**
   - Usa únicamente las versiones y librerías fijadas en `STACK_VERSIONS.md` (`vite-plugin-pwa@0.21.0`, NestJS 10, Prisma 5, React 18, TanStack Query 5, Zod 3.23).
   - Entrega únicamente los archivos correspondientes al sub-paso solicitado en la Sección 5 y espera la confirmación de la **Puerta de Validación Manual** (`pnpm install`, `pnpm turbo run typecheck`, `pnpm turbo run test`) antes de avanzar al siguiente paso.
3. **Ecuación Maestra de Conciliación y Separación de Propinas / Domicilios (`reporting`):**
   - El módulo de reportes jamás mezcla propinas voluntarias (`tip_cop`) ni recargos de domicilio (`delivery_fee_cop`) dentro de la venta neta de productos (`net_products_sales_cop`).
   - Toda consulta financiera sobre operaciones confirmadas bajo política `OFFLINE_ONLY` debe cumplir al peso exacto (`1 COP`) la identidad contable definida en la Sección 4.9 de `DEFINICION_TECNICA.md` (v2.4.0):
     $$\text{gross\_billed\_total\_cop} = \text{net\_products\_sales\_cop} + \text{delivery\_fees\_total\_cop} + \text{tips\_total\_cop}$$
     $$\text{gross\_billed\_total\_cop} \equiv \text{collected\_total\_cop} + \text{pending\_receivable\_cop} + \text{courtesy\_total\_cop} + \text{written\_off\_total\_cop}$$
4. **Regla de Prelación en Cobros Parciales (`PARTIALLY_PAID`):**
   - Cuando una orden tiene un cobro parcial ($0 < \text{paid\_total\_cop} < \text{grand\_total\_cop}$), el desglose del monto recaudado se imputa de manera determinista en cascada: **1.º Venta de productos e impuestos**, **2.º Recargo de domicilio** y **3.º Propina voluntaria**.
5. **Unidad Contable Disjunta y Preparación para Salón (Fase 06):**
   - En esta Fase 05 los totalizadores monetarios suman las órdenes independientes (`Order.dining_account_id IS NULL`). El diseño de `ReportingService` debe encapsular la agregación en métodos componibles para que en la Fase 06 se unan los agregados de `DiningAccount` sin sumar jamás por separado las órdenes hijas de mesa (`Order.dining_account_id IS NOT NULL`).
6. **Prohibición Estricta de PII en Exportaciones CSV y Logs (Ley 1581 de 2012):**
   - El endpoint `GET /api/v1/reports/sales/export-csv` exporta exclusivamente columnas contables, fiscales y operativas. Queda **terminantemente prohibido** incluir nombre del cliente, teléfono (`phone_e164`), dirección o notas personales en el archivo CSV. Toda descarga CSV queda registrada en `AuditEvent`.
7. **Aviso Fiscal DIAN Obligatorio en Impresión Térmica:**
   - Todo pre-recibo o comprobante informativo de caja generado por `print-receipt.ts` (formatos de tirilla térmica de `58mm` y `80mm`) debe incluir de forma visible la leyenda legal: *"Documento informativo de control interno / pre-cuenta — No sustituye la factura electrónica de venta ni el documento equivalente POS exigido por la DIAN"*.

---

## 2. Alcance Exacto de la Fase 05

### 2.1 Extensión del Paquete Compartido (`packages/shared`)
1. **Calculadora Pura de Imputación y Conciliación (`packages/shared/src/utils/reporting-reconciliation.calculator.ts`):**
   - Función pura `allocateCollectedBreakdown(params: { netProductsCop: number; deliveryFeeCop: number; tipCop: number; paidTotalCop: number })`:
     - $\text{collected\_products\_cop} = \min(\text{paid\_total\_cop}, \text{net\_products\_sales\_cop})$
     - $\text{collected\_delivery\_cop} = \min(\max(0, \text{paid\_total\_cop} - \text{net\_products\_sales\_cop}), \text{delivery\_fees\_total\_cop})$
     - $\text{collected\_tips\_cop} = \max(0, \text{paid\_total\_cop} - \text{net\_products\_sales\_cop} - \text{delivery\_fees\_total\_cop})$
     - Garantiza el invariante $\text{collected\_products\_cop} + \text{collected\_delivery\_cop} + \text{collected\_tips\_cop} \equiv \text{paid\_total\_cop}$.
   - Función pura `computeReceivableAndUncollected(params: { grandTotalCop: number; paidTotalCop: number; paymentStatus: OrderPaymentStatus; uncollectedAmountCop: number })`:
     - Si `paymentStatus` es `'UNPAID'` o `'PARTIALLY_PAID'`, retorna `pendingReceivableCop = grandTotalCop - paidTotalCop`, `courtesyCop = 0`, `writtenOffCop = 0`.
     - Si `paymentStatus` es `'COURTESY'`, retorna `pendingReceivableCop = 0`, `courtesyCop = uncollectedAmountCop`, `writtenOffCop = 0`.
     - Si `paymentStatus` es `'WRITTEN_OFF'`, retorna `pendingReceivableCop = 0`, `courtesyCop = 0`, `writtenOffCop = uncollectedAmountCop`.
     - Si `paymentStatus` es `'PAID'`, retorna `0` en los tres rubros.
2. **Esquemas `Zod` y Contratos DTO (`packages/shared/src/schemas/reporting-subscription.schema.ts`):**
   - `SalesReportQuerySchema`: `branch_id` (UUID opcional; si se omite consolida las sucursales autorizadas del usuario), `date_from` (`YYYY-MM-DD`), `date_to` (`YYYY-MM-DD`), `origin` (opcional), `fulfillment_type` (opcional).
   - `SalesReportResponseDto`:
     - `period`: `{ date_from, date_to, timezone }`.
     - `billing_summary`: `{ confirmed_orders_count, net_products_sales_cop, taxable_base_cop, tax_inc_cop, tax_iva_cop, discount_total_cop, delivery_fees_total_cop, tips_total_cop, gross_billed_total_cop }`.
     - `reconciliation_summary`: `{ collected_total_cop, collected_products_cop, collected_delivery_cop, collected_tips_cop, pending_receivable_cop, courtesy_total_cop, written_off_total_cop, is_balanced: boolean }`.
     - `collections_by_method`: `{ CASH: number, POS_TERMINAL: number, MANUAL_TRANSFER: number }`.
     - `not_tracked_orders_summary`: `{ count: number, nominal_total_cop: number }` (exclusivo para pedidos históricos o de Nivel 1 con `payment_policy = 'NONE'` y `payment_status = 'NOT_TRACKED'`).
     - `uncollected_resolutions_detail`: lista de órdenes cerradas como `COURTESY` o `WRITTEN_OFF` con `{ code, occurred_at, resolution_type, uncollected_amount_cop, resolution_reason, resolved_by_name }`.
     - `excluded_orders_summary`: `{ requested_unprocessed_count, rejected_count, cancelled_count, expired_count }`.
     - `operational_metrics`: `{ top_products: Array<{ product_name, quantity_sold, total_cop }>, avg_prep_minutes: number | null, avg_delivery_minutes: number | null }`.
   - `UpdateTenantSubscriptionSchema` (para `PLATFORM_ADMIN`): `plan_id` (`'PLAN_STARTER_WHATSAPP'` | `'PLAN_OPERATIONS_PRO'` | `'PLAN_ENTERPRISE_DINING'`), `status` (`'TRIALING'` | `'ACTIVE'` | `'PAST_DUE'` | `'SUSPENDED'`), `current_period_start`, `current_period_end`, `invoice_amount_cop` (entero opcional), `payment_reference_note` (texto opcional), `reason` (texto obligatorio para auditoría).

### 2.2 Base de Datos (`PostgreSQL 16` + `Prisma`) — Tablas de Suscripción SaaS e Índices Analíticos
Migración SQL y actualización de `apps/api/prisma/schema.prisma`:
1. **`Subscription` (`subscriptions`):**
   - `id (UUID PK)`, `tenant_id (UUID UNIQUE FK)`, `plan_id (VARCHAR NOT NULL)`, `status (VARCHAR NOT NULL — TRIALING | ACTIVE | PAST_DUE | SUSPENDED)`, `current_period_start (TIMESTAMPTZ NOT NULL)`, `current_period_end (TIMESTAMPTZ NOT NULL)`, `updated_by (UUID FK NULL)`, `updated_at (TIMESTAMPTZ NOT NULL)`, `created_at (TIMESTAMPTZ NOT NULL)`.
   - Restricción `CHECK (status IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'))`.
2. **`SubscriptionInvoice` (`subscription_invoices`):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`, `subscription_id (UUID FK)`, `invoice_code (VARCHAR NOT NULL)`, `plan_id (VARCHAR NOT NULL)`, `amount_cop (INT NOT NULL CHECK (amount_cop >= 0))`, `status (VARCHAR NOT NULL — PAID | VOIDED)`, `payment_reference_note (TEXT NULL)`, `issued_at (TIMESTAMPTZ NOT NULL)`, `recorded_by (UUID FK NOT NULL)`, `UNIQUE(tenant_id, invoice_code)`.
3. **Políticas RLS e Índices para Reportes:**
   - Políticas RLS en `subscriptions` y `subscription_invoices` sobre `current_setting('app.current_tenant_id', true)::uuid`.
   - Índice analítico compuesto en `orders`: `CREATE INDEX idx_orders_reporting ON orders(tenant_id, branch_id, created_at DESC, status, payment_policy, payment_status) WHERE dining_account_id IS NULL`.

### 2.3 Backend en NestJS (`apps/api`)
1. **Módulo `reporting` (`apps/api/src/modules/reporting/`):**
   - Protegido por `@RequireModule('reporting')` y `@RequirePermissions('reports.view')` (y `'reports.export'` para CSV).
   - `GET /api/v1/reports/sales`:
     - Filtra por el rango de fechas convertido a la zona horaria de la sucursal (`America/Bogota`) y por el `branch_scope` autorizado del usuario.
     - Excluye de los cálculos financieros todas las órdenes en estado `'REQUESTED'`, `'REJECTED'`, `'CANCELLED'` y `'EXPIRED_UNPROCESSED'` (contabilizándolas únicamente en `excluded_orders_summary`).
     - Separa las órdenes confirmadas con `payment_policy = 'NONE'` (`NOT_TRACKED`) dentro de `not_tracked_orders_summary`.
     - Para las órdenes confirmadas con `payment_policy = 'OFFLINE_ONLY'` (`dining_account_id IS NULL`), calcula la facturación bruta, el desglose de impuestos desde `tax_summary_snapshot_json`, el recaudo por método (`Payment` con `status = 'APPROVED'`), la imputación por prelación (`allocateCollectedBreakdown`), el cubo **Por Cobrar** (`pending_receivable_cop`), las **Cortesías** (`courtesy_total_cop`) y los **Saldos Castigados** (`written_off_total_cop`), verificando que `is_balanced === true`.
     - Calcula tiempos promedio entre eventos reales registrados en `OrderStatusEvent` (`RECEIVED`/`ACCEPTED` $\rightarrow$ `READY` y `READY` $\rightarrow$ `DELIVERED`/`PICKED_UP`).
   - `GET /api/v1/reports/sales/export-csv`:
     - Genera un stream o buffer CSV UTF-8 con BOM (`\uFEFF` para apertura directa en Excel en español) cuyas columnas son exclusivamente: `codigo`, `tipo_registro`, `fecha_hora_bogota`, `sucursal`, `origen`, `modalidad`, `estado_operativo`, `politica_cobro`, `estado_pago`, `venta_neta_productos_cop`, `base_gravable_cop`, `impuesto_inc_cop`, `impuesto_iva_cop`, `descuento_cop`, `domicilio_cop`, `propina_cop`, `total_facturado_cop`, `recaudado_efectivo_cop`, `recaudado_datafono_cop`, `recaudado_transferencia_cop`, `total_recaudado_cop`, `saldo_por_cobrar_cop`, `monto_no_recaudado_cop`, `tipo_resolucion`, `motivo_resolucion`.
     - **Cero PII:** No incluye bajo ninguna circunstancia nombre, teléfono ni dirección del comensal.
     - Registra en `AuditEvent` la acción `'SALES_REPORT_CSV_EXPORTED'` con el rango de fechas y sucursal consultados.
2. **Módulo `billing-subscription` (`apps/api/src/modules/billing-subscription/`):**
   - `GET /api/v1/admin/subscription`: Permite al `TENANT_ADMIN` consultar su plan actual (`Subscription`), fechas de vigencia, módulos incluidos en su `PlanEntitlement` e historial de `SubscriptionInvoice`.
   - `PATCH /api/v1/platform/tenants/:tenantId/subscription` (exclusivo para rol `PLATFORM_ADMIN`):
     - Actualiza en una sola transacción `Subscription.plan_id`, `Subscription.status`, fechas de vigencia y sincroniza `Tenant.plan_id`.
     - Si se envía `invoice_amount_cop`, crea el registro en `SubscriptionInvoice`.
     - Registra el cambio en `AuditEvent` (`'TENANT_SUBSCRIPTION_UPDATED'`).
   - **Guard / Verificación de Estado de Suscripción (`SubscriptionStatusGuard`):**
     - Si `Subscription.status === 'SUSPENDED'`, bloquea la creación de nuevos pedidos públicos (`POST /api/v1/public/orders` responde `403 TENANT_SUBSCRIPTION_SUSPENDED`) y las mutaciones operativas, permitiendo al `TENANT_ADMIN` iniciar sesión, consultar su histórico/reportes en solo lectura y ver `/admin/subscription`.

### 2.4 Frontend en React (`apps/web`) — Reportes, Impresión Térmica 58/80mm y PWA
1. **Dashboard de Reportes y Conciliación (`apps/web/src/features/reports/`):**
   - Filtros por rango de fechas (Hoy, Ayer, Últimos 7 días, Mes actual, Personalizado), sucursal, origen y modalidad.
   - **Bloque de Ecuación de Conciliación Visual:** Muestra en tarjetas conectadas:
     `Total Facturado ($)` $=$ `Recaudado ($)` $+$ `Por Cobrar ($)` $+$ `Cortesías ($)` $+$ `Castigos ($)`.
   - Desglose de ingresos entre Venta Neta de Productos (con base e INC/IVA), Domicilios y Propinas Voluntarias, más desglose de recaudo por medio de pago (`Efectivo`, `Datáfono`, `Transferencia`).
   - Tarjeta separada informativa para volumen Nivel 1 sin seguimiento de caja (`NOT_TRACKED`).
   - Tabla de auditoría de **Cortesías y Saldos Castigados** (mostrando código, fecha, monto, quién autorizó y motivo) y botón **"Exportar CSV Contable (Sin PII)"**.
2. **Servicio de Impresión Térmica 58mm / 80mm (`apps/web/src/services/print-receipt.ts`):**
   - Generador de vista de impresión limpia con estilos `@media print` seleccionables entre ancho `58mm` y `80mm` para dos documentos:
     - **Comanda de Cocina:** Código `#Orden`, modalidad, mesa/dirección, hora, lista de productos con variantes, modificadores y notas resaltadas.
     - **Pre-cuenta / Recibo Informativo de Caja:** Datos del restaurante y sucursal, código `#Orden`, fecha/hora, detalle de ítems, subtotal productos, desglose de impuesto (si el modo del tenant es `TAX_INCLUDED_DISCRIMINATED` o `BASE_PLUS_TAX`), domicilio, propina voluntaria, gran total, pagos registrados (con cambio si fue en efectivo) y **leyenda fiscal DIAN obligatoria al pie**.
3. **Vista de Suscripción (`apps/web/src/features/admin-settings/subscription-tab.tsx`) y Consola `PLATFORM_ADMIN`:**
   - Vista para el propietario con el estado de su plan comercial, fecha de corte e historial de facturas SaaS; y vista administrativa para `PLATFORM_ADMIN` para activar planes y registrar pagos manuales de suscripción.
4. **Configuración PWA Instalable y Banner de Estado de Red:**
   - Configuración de `vite-plugin-pwa` en `apps/web/vite.config.ts` y `public/manifest.webmanifest` con estrategia de caché *NetworkOnly* para `/api/v1/**` (garantizando que el Service Worker jamás cachee datos privados de un tenant en el navegador) y caché de activos estáticos JS/CSS/fuentes.
   - Banner global persistente cuando `navigator.onLine === false` o cuando el canal SSE entra en reconexión, advirtiendo al operador que no confirme acciones hasta recuperar línea.

---

## 3. Matriz de Casos de Prueba Obligatorios (Fase 05)

### 3.1 Pruebas Unitarias (`packages/shared`)
- **`TC-05-U01` (Prelación de Imputación en Cobros Parciales):**
  - Dada una orden con `netProductsCop = 40000`, `deliveryFeeCop = 5000` y `tipCop = 4000` (`grandTotalCop = 49000`):
    - Si `paidTotalCop = 25000`, `allocateCollectedBreakdown` debe retornar `collected_products_cop = 25000`, `collected_delivery_cop = 0`, `collected_tips_cop = 0`.
    - Si `paidTotalCop = 43000`, debe retornar `collected_products_cop = 40000`, `collected_delivery_cop = 3000`, `collected_tips_cop = 0`.
    - Si `paidTotalCop = 49000`, debe retornar `collected_products_cop = 40000`, `collected_delivery_cop = 5000`, `collected_tips_cop = 4000`.
- **`TC-05-U02` (Ecuación Maestra de Conciliación con Resoluciones Mixtas):**
  - Dado un conjunto de órdenes confirmadas con estados `PAID`, `PARTIALLY_PAID` (con saldo pendiente), `UNPAID`, `COURTESY` (con pago parcial previo) y `WRITTEN_OFF`, la calculadora debe cumplir exactamente $\text{gross\_billed\_total\_cop} \equiv \text{collected\_total\_cop} + \text{pending\_receivable\_cop} + \text{courtesy\_total\_cop} + \text{written\_off\_total\_cop}$ y `is_balanced = true`.
- **`TC-05-U03` (Formateador de Pre-Recibo Térmico con Leyenda DIAN):**
  - El generador de recibo de `58mm`/`80mm` debe incluir siempre la leyenda exacta de no equivalencia con factura electrónica DIAN y discriminar la base e impuesto solo cuando `tax_profile_mode !== 'FINAL_PRICE_NO_BREAKDOWN'`.

### 3.2 Pruebas de Integración (`apps/api/test/`)
- **`TC-05-I01` (Conciliación Financiera Exacta en `GET /api/v1/reports/sales`):**
  - Se crean en una sucursal 5 órdenes confirmadas `OFFLINE_ONLY`:
    1. Orden 1 (`$50.000` productos + `$5.000` domicilio = `$55.000`): cobrada al 100 % en `CASH` (`PAID`).
    2. Orden 2 (`$40.000` productos + `$4.000` propina = `$44.000`): abono parcial de `$30.000` por `MANUAL_TRANSFER` (`PARTIALLY_PAID`, por cobrar `$14.000`).
    3. Orden 3 (`$30.000` productos): sin cobros aún (`UNPAID`, por cobrar `$30.000`).
    4. Orden 4 (`$25.000` productos): resuelta como `COURTESY` (`uncollected_amount_cop = 25000`).
    5. Orden 5 (`$35.000` productos): abono parcial de `$10.000` en `POS_TERMINAL` y saldo restante resuelto como `WRITTEN_OFF` (`uncollected_amount_cop = 25000`).
  - Al consultar `GET /api/v1/reports/sales`:
    - `gross_billed_total_cop` debe ser `$189.000` (`$180.000` productos + `$5.000` domicilio + `$4.000` propina).
    - `collected_total_cop` debe ser `$95.000` (`CASH: 55000`, `MANUAL_TRANSFER: 30000`, `POS_TERMINAL: 10000`).
    - `pending_receivable_cop` debe ser `$44.000` (`$14.000` + `$30.000`).
    - `courtesy_total_cop` debe ser `$25.000` y `written_off_total_cop` debe ser `$25.000`.
    - Suma de control: $\$95.000 + \$44.000 + \$25.000 + \$25.000 = \$189.000$ (`is_balanced: true`).
- **`TC-05-I02` (Exclusión de Solicitudes No Confirmadas y Separación de `NOT_TRACKED`):**
  - Órdenes en `REQUESTED`, `REJECTED`, `CANCELLED` y `EXPIRED_UNPROCESSED` no alteran en un solo peso `gross_billed_total_cop`.
  - Órdenes históricas nacidas en Nivel 1 con `payment_policy = 'NONE'` (`NOT_TRACKED`) aparecen exclusivamente en `not_tracked_orders_summary` y no distorsionan `pending_receivable_cop`.
- **`TC-05-I03` (Exportación CSV Auditada y Libre de PII — Ley 1581):**
  - Al invocar `GET /api/v1/reports/sales/export-csv`, la respuesta contiene las cabeceras contables esperadas, **no contiene** el nombre, teléfono ni dirección de ningún cliente en ninguna fila, y genera un registro en `audit_events` con `action: 'SALES_REPORT_CSV_EXPORTED'`.
- **`TC-05-I04` (Gestión de Suscripción SaaS, Sincronización de Plan y Bloqueo por `SUSPENDED`):**
  - Cuando `PLATFORM_ADMIN` ejecuta `PATCH /api/v1/platform/tenants/:tenantId/subscription` cambiando el plan a `PLAN_OPERATIONS_PRO` y registrando una factura de `$89.000`, `Tenant.plan_id` se sincroniza automáticamente habilitando los *entitlements* de Nivel 2.
  - Si cambia el estado a `SUSPENDED`, cualquier intento de crear un pedido público en ese restaurante recibe `403 TENANT_SUBSCRIPTION_SUSPENDED`, pero el `TENANT_ADMIN` puede consultar sus reportes históricos.
- **`TC-05-I05` (Aislamiento Multi-Tenant en Reportes y Exportación CSV):**
  - El *Restaurante A* jamás visualiza ni exporta en CSV un solo peso ni métrica de las ventas del *Restaurante B*.

---

## 4. Secuencia de Prompts Acotados para Ejecutar la Fase 05 con Gemini

Adjunta siempre `DEFINICION_TECNICA.md` (v2.4.0), `STACK_VERSIONS.md` (v2.4.0) y este documento `FASE_05_REPORTES_SUSCRIPCION_MANUAL_Y_PWA.md`, ejecutando la puerta manual tras cada paso:

### Paso 5.1: Calculadora de Conciliación y Esquemas en `packages/shared` + Tests Unitarios
> **Prompt 5.1:** *"Con base en `DEFINICION_TECNICA.md` (v2.4.0), `STACK_VERSIONS.md` (v2.4.0) y `FASE_05_REPORTES_SUSCRIPCION_MANUAL_Y_PWA.md`, genera en `packages/shared` la calculadora pura `reporting-reconciliation.calculator.ts` (con prelación de abonos parciales y ecuación maestra de conciliación), los esquemas y DTOs en `reporting-subscription.schema.ts`, el formateador de datos de recibo térmico con leyenda DIAN y las pruebas unitarias `TC-05-U01` a `TC-05-U03`. Sin TODOs ni código incompleto."*
- **Puerta Manual 5.1:** Ejecutar `pnpm --filter @restaurante-saas/shared typecheck && pnpm --filter @restaurante-saas/shared test`.

### Paso 5.2: Migración Prisma (`Subscription`, `SubscriptionInvoice` e Índices Analíticos) y Módulo `billing-subscription`
> **Prompt 5.2:** *"Actualiza `apps/api/prisma/schema.prisma` y genera la migración SQL para las tablas `subscriptions` y `subscription_invoices` con sus políticas RLS e índices analíticos de reportes. Implementa completo en `apps/api/src/modules/billing-subscription/` el servicio, controladores (`GET /api/v1/admin/subscription` y `PATCH /api/v1/platform/tenants/:tenantId/subscription`) y el `SubscriptionStatusGuard` que bloquea operaciones nuevas cuando la suscripción está en `SUSPENDED`."*
- **Puerta Manual 5.2:** Ejecutar `pnpm --filter @restaurante-saas/api prisma migrate deploy && pnpm --filter @restaurante-saas/api typecheck`.

### Paso 5.3: Módulo Backend `reporting` (Conciliación de Ventas, Métricas y Exportación CSV sin PII) + Pruebas de Integración
> **Prompt 5.3:** *"Implementa completo en `apps/api/src/modules/reporting/` el `ReportingService` y `ReportingController` (`GET /api/v1/reports/sales` y `GET /api/v1/reports/sales/export-csv` auditado y libre de PII de clientes), junto con la suite de pruebas de integración `TC-05-I01` a `TC-05-I05` en `apps/api/test/`."*
- **Puerta Manual 5.3:** Ejecutar `pnpm --filter @restaurante-saas/api typecheck && pnpm --filter @restaurante-saas/api test`.

### Paso 5.4: Frontend de Reportes, Impresión Térmica 58/80mm, Vista de Suscripción y Configuración PWA (`apps/web`)
> **Prompt 5.4:** *"Implementa en `apps/web` el dashboard completo de Reportes y Conciliación (`src/features/reports/`), el servicio y componentes de impresión térmica 58mm/80mm con leyenda fiscal DIAN (`src/services/print-receipt.ts` integrado en el Panel de Pedidos y KDS), la pestaña de Suscripción SaaS en `/admin/settings`, el banner de estado de conexión y la configuración de `vite-plugin-pwa` con `manifest.webmanifest` (asegurando `NetworkOnly` para `/api/v1/**`)."*
- **Puerta Manual 5.4 (Cierre de Fase 05 y del Nivel 2 `FULL_PANEL`):** Ejecutar `pnpm turbo run typecheck && pnpm turbo run test && pnpm --filter @restaurante-saas/web build`.