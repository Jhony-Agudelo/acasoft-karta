# Fase 04: Panel Operativo Completo, Cobros Manuales, Resoluciones de Saldo y Pantalla de Cocina (KDS)
**Documento:** `FASE_04_PANEL_COMPLETO_COCINA_KDS_Y_COBROS_MANUALES.md`  
**Versión:** 2.4.0 — Alineado con `DEFINICION_TECNICA.md` (v2.4.0) y `STACK_VERSIONS.md` (v2.4.0)  
**Fecha:** 2026-10-27  
**Prerrequisitos:** `FASE_01`, `FASE_02`, `FASE_03A` y `FASE_03B` (v2.4.0) completadas y con todas sus puertas de pruebas en verde.  
**Objetivo de la Fase:** Construir el núcleo operativo del **Nivel 2 de la Escalera de Adopción (`FULL_PANEL`)**: la consola avanzada de pedidos con filtros multicriterio e historial unificado, el flujo de pedidos bajo política `OFFLINE_ONLY` con visualización de instrucciones de transferencia (`payment_instructions_json`) y opción de exigir pago antes de preparar (`require_payment_before_preparation`), el módulo completo de **Registro Manual de Cobros (`payments.manual`)** gobernado por la función determinista `recalculatePaymentState()`, la resolución y reversión auditada de saldos no cobrados (`COURTESY` y `WRITTEN_OFF`), la anulación de cobros (`VOIDED`) y el módulo de **Pantalla de Cocina (`kitchen` - KDS)** por estaciones de preparación en tiempo real.

---

## 1. Reglas de Ingeniería, Arquitectura Limpia y Seguridad Financiera (Directivas para Gemini)

Al procesar este documento junto con `DEFINICION_TECNICA.md` (v2.4.0) y `STACK_VERSIONS.md` (v2.4.0) para generar código, debes cumplir sin excepción las siguientes directivas:

1. **Política de Cero Código Incompleto (`Zero-Placeholder Policy`):**
   - Está estrictamente prohibido entregar archivos con comentarios como `// TODO`, `// implementar aquí`, `...` o funciones vacías. Cada archivo generado debe ser 100 % funcional, compilable y estrictamente tipado.
2. **Apego Estricto a `STACK_VERSIONS.md` y Entrega con Puertas Manuales:**
   - Usa únicamente las versiones y librerías fijadas en `STACK_VERSIONS.md`.
   - Entrega únicamente los archivos correspondientes al sub-paso solicitado en la Sección 5 y espera la confirmación de la **Puerta de Validación Manual** (`pnpm install`, `pnpm turbo run typecheck`, `pnpm turbo run test`) antes de pasar al siguiente paso.
3. **Función Única de Recálculo (`recalculatePaymentState`) y Desacoplamiento Pedido vs. Pago:**
   - El estado operativo del pedido (`Order.status`) y su estado financiero (`Order.payment_status`) son máquinas independientes. Marcar una orden como `DELIVERED` o `PICKED_UP` jamás cambia automáticamente su `payment_status` a `PAID`.
   - Queda prohibido asignar `payment_status = 'UNPAID'` o `'PAID'` de manera estática al registrar o anular pagos. Toda mutación financiera invoca la función única `recalculatePaymentState()`, que suma todos los pagos con `status = 'APPROVED'` y determina de forma exacta si el saldo queda en `UNPAID`, `PARTIALLY_PAID` o `PAID`.
4. **Blindaje Transaccional (`SELECT ... FOR UPDATE`) y Restricciones `CHECK` en Pagos:**
   - Todo registro de pago (`POST /api/v1/orders/:orderId/payments/manual`), anulación (`POST /api/v1/payments/:paymentId/void`), resolución (`resolve-uncollected`) o reversión (`revert-resolution`) se ejecuta dentro de `PrismaService.withTenant(tenantId, fn)` bloqueando primero la fila de `Order` con `SELECT ... FOR UPDATE`.
   - **Prohibición de cobros en `REQUESTED`:** Antes de insertar un pago, el servicio verifica sobre la fila bloqueada que `order.status !== 'REQUESTED'` (lanzando HTTP `409 ORDER_MUST_BE_ACCEPTED_BEFORE_PAYMENT`), respaldado por la restricción `CHECK (status != 'REQUESTED' OR paid_total_cop = 0)` local en la tabla `orders`.
   - **Prohibición de cobros en política `NONE` o en órdenes hijas de salón:** Si `order.payment_policy === 'NONE'` (`NOT_TRACKED`), rechaza con `409 PAYMENT_NOT_ALLOWED_FOR_POLICY`. Si `order.dining_account_id !== null`, rechaza con `409 PAY_VIA_DINING_ACCOUNT`.
   - **Idempotencia por Tenant y Destino Exclusivo:** La tabla `payments` exige `UNIQUE(tenant_id, idempotency_key)` y `CHECK ((order_id IS NOT NULL AND account_id IS NULL) OR (order_id IS NULL AND account_id IS NOT NULL))`.
5. **Congelamiento en Estados Resueltos y Protección de Montos ya Cobrados:**
   - Una orden en `payment_status IN ('COURTESY', 'WRITTEN_OFF')` está congelada financieramente: rechaza nuevos cobros y rechaza la anulación de cobros previos (`409 ORDER_RESOLUTION_ACTIVE`) hasta que un gerente o administrador ejecute explícitamente `POST /api/v1/orders/:orderId/revert-resolution`.
   - Ningún ajuste de ítems ni descuento puede dejar `grand_total_cop < paid_total_cop` (`409 TOTAL_BELOW_PAID_AMOUNT`), y ninguna orden con `paid_total_cop > 0` puede pasarse a `CANCELLED` o `REJECTED` sin antes anular (`VOIDED`) todos sus cobros activos (`409 ORDER_HAS_ACTIVE_PAYMENTS`).

---

## 2. Alcance Exacto de la Fase 04

### 2.1 Extensión del Paquete Compartido (`packages/shared`)
1. **Máquina de Estados Financieros y Motor de Recálculo (`packages/shared/src/constants/payment-status.machine.ts`):**
   - Definición de `PaymentPolicy`: `'NONE'` | `'OFFLINE_ONLY'`.
   - Definición de `PaymentMethod`: `'CASH'` | `'POS_TERMINAL'` | `'MANUAL_TRANSFER'`.
   - Definición de `PaymentRecordStatus` (tabla `Payment`): `'APPROVED'` | `'VOIDED'`.
   - Definición de `OrderPaymentStatus` (resumen en `Order` y `DiningAccount`): `'NOT_TRACKED'` | `'UNPAID'` | `'PARTIALLY_PAID'` | `'PAID'` | `'COURTESY'` | `'WRITTEN_OFF'`.
   - Definición de `UncollectedResolutionType`: `'COURTESY'` | `'WRITTEN_OFF'`.
   - **Función pura determinista `recalculatePaymentState(input)`:**
     - Recibe `{ paymentPolicy, grandTotalCop, approvedPaymentsAmountsCop: number[], activeResolutionType: UncollectedResolutionType | null }`.
     - Calcula $\text{paidTotalCop} = \sum \text{approvedPaymentsAmountsCop}$.
     - Valida que $\text{paidTotalCop} \le \text{grandTotalCop}$ (si lo supera, lanza error de dominio `PAYMENT_EXCEEDS_BALANCE`).
     - Si `paymentPolicy === 'NONE'`, retorna `{ paidTotalCop: 0, uncollectedAmountCop: 0, paymentStatus: 'NOT_TRACKED' }`.
     - Si `activeResolutionType !== null`, retorna `{ paidTotalCop, uncollectedAmountCop: grandTotalCop - paidTotalCop, paymentStatus: activeResolutionType }`.
     - Si `activeResolutionType === null`:
       - Si $\text{paidTotalCop} === 0 \rightarrow$ `{ paidTotalCop: 0, uncollectedAmountCop: 0, paymentStatus: 'UNPAID' }`.
       - Si $0 < \text{paidTotalCop} < \text{grandTotalCop} \rightarrow$ `{ paidTotalCop, uncollectedAmountCop: 0, paymentStatus: 'PARTIALLY_PAID' }`.
       - Si $\text{paidTotalCop} === \text{grandTotalCop} \rightarrow$ `{ paidTotalCop, uncollectedAmountCop: 0, paymentStatus: 'PAID' }`.
2. **Agregador de Estados de Cocina KDS (`packages/shared/src/utils/kitchen-aggregation.ts`):**
   - Función pura `computeAggregatedOrderKitchenStatus(currentOrderStatus, itemsStatuses)` que determina cuándo una orden en `ACCEPTED` (o `RECEIVED`) debe transicionar automáticamente a `PREPARING` (al menos un ítem activo en `PREPARING` o `READY`) y cuándo debe transicionar automáticamente a `READY` (todos los ítems no cancelados en estado `READY`).
3. **Esquemas Zod de Pagos Manuales, Resoluciones, Filtros y KDS (`packages/shared/src/schemas/panel-kitchen.schema.ts`):**
   - `RecordManualPaymentSchema`: Valida `method` (`'CASH'` | `'POS_TERMINAL'` | `'MANUAL_TRANSFER'`), `amount_cop` (entero $> 0$), `cash_received_cop?` (entero $\ge \text{amount\_cop}$ cuando `method === 'CASH'`) y `reference_note?` (máx. 120 caracteres).
   - `VoidPaymentSchema`: Valida `reason` obligatorio (mínimo 5 caracteres).
   - `ResolveUncollectedOrderSchema`: Valida `resolution_type` (`'COURTESY'` | `'WRITTEN_OFF'`) y `reason` obligatorio (mínimo 5 caracteres).
   - `RevertResolutionSchema`: Valida `reason` obligatorio (mínimo 5 caracteres).
   - `BranchOrdersFilterSchema`: Paginación (`page`, `limit`), filtros múltiples por `status`, `payment_status`, `origin`, `fulfillment_type`, rango de fechas (`date_from`, `date_to`) y búsqueda `q` (`order_code`, nombre o teléfono).
   - `KitchenStationSchema` y `UpdateKitchenItemStatusSchema` (`item_ids?`, `to_status`: `'PREPARING'` | `'READY'`).

### 2.2 Base de Datos (`PostgreSQL 16` + `Prisma`), Políticas RLS y Restricciones `CHECK`
Actualización de `apps/api/prisma/schema.prisma` y nueva migración SQL con RLS activo para el rol `app_runtime`:
1. **Tabla `KitchenStation` (`kitchen_stations`):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`, `key (VARCHAR(40))`, `name (VARCHAR(80))`, `sort_order (INT DEFAULT 0)`, `is_active (BOOLEAN DEFAULT TRUE)`, `created_at (TIMESTAMPTZ)`.
   - Restricción `UNIQUE(tenant_id, branch_id, key)`.
2. **Tabla `Payment` (`payments` — Sección 9.1.5 de `DEFINICION_TECNICA.md` v2.4.0):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`, `order_id (UUID FK NULL)`, `account_id (UUID FK NULL)`.
   - `method (VARCHAR(24))` (`'CASH'` | `'POS_TERMINAL'` | `'MANUAL_TRANSFER'`).
   - `amount_cop (INT NOT NULL)`, `cash_received_cop (INT NULL)`, `change_given_cop (INT NULL)`, `reference_note (VARCHAR(120) NULL)`.
   - `status (VARCHAR(20) NOT NULL DEFAULT 'APPROVED')` (`'APPROVED'` | `'VOIDED'`).
   - `idempotency_key (VARCHAR(64) NOT NULL)`.
   - `created_by (UUID FK NOT NULL)`, `voided_by (UUID FK NULL)`, `voided_at (TIMESTAMPTZ NULL)`, `voided_reason (TEXT NULL)`, `created_at (TIMESTAMPTZ DEFAULT NOW())`.
3. **Restricciones `CHECK` e Índices Obligatorios en la Migración SQL:**
   - `ALTER TABLE payments ADD CONSTRAINT chk_payments_xor_target CHECK ((order_id IS NOT NULL AND account_id IS NULL) OR (order_id IS NULL AND account_id IS NOT NULL));`
   - `ALTER TABLE payments ADD CONSTRAINT chk_payments_positive_amount CHECK (amount_cop > 0);`
   - `ALTER TABLE payments ADD CONSTRAINT chk_payments_cash_change CHECK (cash_received_cop IS NULL OR (cash_received_cop >= amount_cop AND change_given_cop = cash_received_cop - amount_cop));`
   - `CREATE UNIQUE INDEX idx_payments_tenant_idempotency ON payments(tenant_id, idempotency_key);`
   - `CREATE INDEX idx_payments_tenant_order ON payments(tenant_id, order_id, status);`
   - `CREATE INDEX idx_order_items_kds ON order_items(tenant_id, station_key, status);`

### 2.3 Backend en NestJS (`apps/api/src/modules/`)
1. **Ampliación del Módulo `ordering` (Consultas Avanzadas, Pre-Cobro y Reglas de Bloqueo Financiero):**
   - **Consultas Filtrables (`GET /api/v1/branches/:branchId/orders`):**
     - Protegido con `@RequireModule('order_panel')`.
     - Soporta todos los filtros de `BranchOrdersFilterSchema` y devuelve contadores agregados por pestaña operativa: `pending_requests_count` (`REQUESTED`), `awaiting_prepayment_count` (`require_payment_before_preparation = true AND payment_status != 'PAID'`), `in_preparation_count` (`ACCEPTED`, `PREPARING`), `ready_or_in_transit_count` (`READY`, `OUT_FOR_DELIVERY`) y `uncollected_delivered_count` (entregados aún en `UNPAID` o `PARTIALLY_PAID`).
   - **Validación en `AdjustOrderService` (`PATCH /api/v1/orders/:orderId/items`) y Descuentos:**
     - Verifica bajo `SELECT ... FOR UPDATE` que el nuevo `grand_total_cop` recalculado cumpla $\text{grand\_total\_cop} \ge \text{paid\_total\_cop}$; si es menor, aborta con HTTP `409 Conflict` (`TOTAL_BELOW_PAID_AMOUNT`).
     - Si el total cambia y `paid_total_cop > 0`, ejecuta `recalculatePaymentState()` para actualizar `payment_status` (ej. si una orden estaba `PAID` con `$40.000` y antes de bloquearse se le agrega un ítem subiendo a `$50.000`, pasa automáticamente a `PARTIALLY_PAID` con saldo pendiente de `$10.000`).
   - **Validación en `TransitionOrderStatusService` (`PATCH /api/v1/orders/:orderId/status`):**
     - **Puerta de Pre-Cobro (`require_payment_before_preparation`):** Si `to_status === 'PREPARING'` (o un paso posterior de preparación/despacho) y la orden tiene `require_payment_before_preparation === true` y `payment_status !== 'PAID'`, aborta con HTTP `409 Conflict` (`PAYMENT_REQUIRED_BEFORE_PREPARATION`).
     - **Bloqueo de Cancelación con Pagos Activos:** Si `to_status IN ('CANCELLED', 'REJECTED')` y `order.paid_total_cop > 0`, aborta con HTTP `409 Conflict` (`ORDER_HAS_ACTIVE_PAYMENTS`).
   - **Historial Unificado (`GET /api/v1/orders/:orderId/status-history`):**
     - Retorna la línea de tiempo combinada de `OrderStatusEvent`, `OrderEdit`, `Payment` (incluyendo anulaciones `VOIDED`) y resoluciones/reversiones de saldo.
2. **Módulo `payments` (`ManualPaymentsService`, `OrderResolutionService` y Controladores):**
   - **`POST /api/v1/orders/:orderId/payments/manual`:**
     - Protegido con `@RequireModule('payments.manual')` y roles `CASHIER`, `BRANCH_MANAGER` o `TENANT_ADMIN`. Exige cabecera `Idempotency-Key`.
     - Verifica idempotencia por `(tenant_id, idempotency_key)`: si ya existe, retorna el resultado previo sin duplicar.
     - Bloquea la fila de `Order` con `SELECT ... FOR UPDATE` y verifica:
       1. `order.dining_account_id === null` (si no, lanza `409 PAY_VIA_DINING_ACCOUNT`).
       2. `order.payment_policy === 'OFFLINE_ONLY'` (si es `'NONE'`, lanza `409 PAYMENT_NOT_ALLOWED_FOR_POLICY`).
       3. `order.status !== 'REQUESTED'` (si es `'REQUESTED'`, lanza `409 ORDER_MUST_BE_ACCEPTED_BEFORE_PAYMENT`) y no está en `'REJECTED'`, `'CANCELLED'` ni `'EXPIRED_UNPROCESSED'`.
       4. `order.payment_status` no es `'COURTESY'` ni `'WRITTEN_OFF'` (si lo es, lanza `409 ORDER_RESOLUTION_ACTIVE`).
       5. `order.paid_total_cop + dto.amount_cop <= order.grand_total_cop` (si lo excede, lanza `409 PAYMENT_EXCEEDS_BALANCE`).
     - Inserta la fila en `payments` con `status = 'APPROVED'`, ejecuta `recalculatePaymentState()`, actualiza `Order.paid_total_cop` y `Order.payment_status`, registra en `AuditEvent` y emite evento SSE al canal de la sucursal y al canal público de seguimiento (`/t/:publicToken`).
   - **`POST /api/v1/payments/:paymentId/void`:**
     - Protegido con `@RequireModule('payments.manual')` y exclusivo de `BRANCH_MANAGER` o `TENANT_ADMIN`.
     - Bloquea el registro de `Payment` y su `Order` asociada con `SELECT ... FOR UPDATE`.
     - Verifica que la orden no tenga resolución activa (`COURTESY` / `WRITTEN_OFF` $\rightarrow$ `409 ORDER_RESOLUTION_ACTIVE`).
     - Marca `Payment.status = 'VOIDED'`, `voided_by`, `voided_at = NOW()`, `voided_reason = dto.reason`.
     - Ejecuta `recalculatePaymentState()` con los pagos `APPROVED` restantes (dejando la orden en `PARTIALLY_PAID` si quedan otros pagos vigentes o en `UNPAID` si `paid_total_cop` baja a `0`), registra en `AuditEvent` y emite SSE.
   - **`POST /api/v1/orders/:orderId/resolve-uncollected`:**
     - Protegido con `@RequireModule('payments.manual')` y exclusivo de `BRANCH_MANAGER` o `TENANT_ADMIN`.
     - Bloquea la `Order` con `SELECT ... FOR UPDATE`. Verifica que `dining_account_id === null`, `payment_policy === 'OFFLINE_ONLY'` y `payment_status IN ('UNPAID', 'PARTIALLY_PAID')` ($\text{grand\_total\_cop} > \text{paid\_total\_cop}$).
     - Valida estado operativo permitido según el tipo de resolución:
       - Si `resolution_type === 'COURTESY'`: `order.status` debe estar en `['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP']`.
       - Si `resolution_type === 'WRITTEN_OFF'`: `order.status` debe estar en `['READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP']` (no se puede castigar como incobrable algo que ni siquiera se preparó).
     - Ejecuta `recalculatePaymentState()` con `activeResolutionType = dto.resolution_type`, fijando `uncollected_amount_cop = grand_total_cop - paid_total_cop`, `payment_status = dto.resolution_type`, `resolution_type`, `resolution_reason`, `resolved_by` y `resolved_at`, registra en `AuditEvent` y emite SSE.
   - **`POST /api/v1/orders/:orderId/revert-resolution`:**
     - Protegido con `@RequireModule('payments.manual')` y exclusivo de `BRANCH_MANAGER` o `TENANT_ADMIN`.
     - Bloquea la `Order` con `SELECT ... FOR UPDATE`, verifica que `payment_status IN ('COURTESY', 'WRITTEN_OFF')`, limpia `resolution_type = null`, `resolution_reason = null`, `resolved_by = null`, `resolved_at = null`, `uncollected_amount_cop = 0`, ejecuta `recalculatePaymentState()` (restaurando `UNPAID` o `PARTIALLY_PAID` según sus pagos `APPROVED`), registra en `AuditEvent` (`action: 'ORDER_RESOLUTION_REVERTED'`) y emite SSE.
3. **Módulo `kitchen` (`KitchenStationsController`, `KitchenKdsController` y `KitchenService`):**
   - `GET / POST / PATCH /api/v1/admin/branches/:branchId/kitchen-stations` protegidos con `@RequireModule('kitchen')`. Provee automáticamente la estación `'GENERAL'` si la sucursal no ha creado estaciones personalizadas.
   - **`GET /api/v1/kitchen/orders`:**
     - Protegido con `@RequireModule('kitchen')` y roles `KITCHEN`, `BRANCH_MANAGER` o `TENANT_ADMIN`.
     - Retorna las órdenes de la sucursal en estados `ACCEPTED` o `PREPARING` (y `RECEIVED` cuando `origin === 'WEB_DIRECT'` y no requiere confirmación previa), **filtrando y excluyendo obligatoriamente** cualquier orden donde `require_payment_before_preparation = true AND payment_status != 'PAID'`.
     - Permite filtrar los `OrderItem` por `stationKey`.
   - **`PATCH /api/v1/kitchen/orders/:orderId/status`:**
     - Actualiza el estado de preparación (`PREPARING` | `READY`) de los `OrderItem` indicados (o de todos los ítems de la estación en esa orden).
     - Ejecuta `computeAggregatedOrderKitchenStatus`: si la orden pasa a `PREPARING` o a `READY`, inserta el `OrderStatusEvent` correspondiente y emite la actualización en tiempo real por SSE al panel de pedidos y a la página de seguimiento del cliente.
4. **Actualización de `OpenOperationsChecker` en `capabilities`:**
   - Impide desactivar `kitchen` si existen órdenes en la sucursal con `status = 'PREPARING'` (`409 MODULE_HAS_OPEN_OPERATIONS`).
   - Impide desactivar `payments.manual` (o cambiar un canal de `OFFLINE_ONLY` a `NONE`) mientras existan órdenes activas en la sucursal con `payment_status IN ('UNPAID', 'PARTIALLY_PAID')` (`409 MODULE_HAS_OPEN_OPERATIONS`), devolviendo los códigos de orden pendientes de cobrar o resolver.

### 2.4 Frontend en React (`apps/web`)
1. **Consola Operativa en Modo Completo (`features/full-order-panel/`):**
   - Barra de búsqueda y filtros combinados (`status`, `payment_status`, `origin`, `fulfillment_type`, rango de fechas) y pestañas rápidas con contadores en vivo actualizados por SSE.
   - Insignias financieras diferenciadas: `SIN SEGUIMIENTO` (gris, para `NOT_TRACKED`), `POR COBRAR: $XX.XXX` (ámbar, para `UNPAID`), `PAGO PARCIAL — FALTAN $XX.XXX` (naranja, para `PARTIALLY_PAID`), `PAGADO` (esmeralda, para `PAID`), `CORTESÍA` (azul, para `COURTESY`) y `SALDO CASTIGADO` (rojo, para `WRITTEN_OFF`).
   - Si una orden tiene `require_payment_before_preparation = true` y aún no está `PAID`, muestra alerta destacada *"Requiere registrar pago completo antes de enviar a cocina"* y deshabilita el botón de pasar a preparación hasta saldarla.
   - **Modal de Cobros Manuales Combinados y Anulaciones (`ManualPaymentModal`):**
     - Muestra el total de la orden, la lista de pagos ya registrados (`APPROVED` o `VOIDED`), el saldo pendiente exacto y permite registrar un pago por el total o un abono parcial (ej. `$20.000` en Efectivo y luego `$25.000` por Transferencia Nequi).
     - En **Efectivo**, incluye botones rápidos de billetes colombianos (`$10.000`, `$20.000`, `$50.000`, `$100.000`, `Exacto`) y calculadora de cambio en vivo.
     - Para `BRANCH_MANAGER` / `TENANT_ADMIN`, incluye botón **"Anular cobro"** (`void` con motivo obligatorio), botón **"Resolver saldo sin cobrar"** (`COURTESY` / `WRITTEN_OFF` con motivo) y, si la orden ya estaba resuelta, el botón **"Revertir resolución para modificar cobros"**.
2. **Pantalla de Cocina KDS (`features/kitchen-kds/` — Ruta `/kds`):**
   - Protegida con `<CapabilityRoute requiredModule="kitchen" />`.
   - Selector de estación en cabecera, cronómetro en vivo con semáforo visual por tarjeta (**Verde** $< 10\text{ min}$, **Amarillo** $10\text{–}20\text{ min}$, **Rojo** $> 20\text{ min}$), alerta sonora mediante Web Audio API al entrar una comanda nueva (o al desbloquearse una orden cuyo pre-cobro acaba de pagarse en caja), marcación táctil por ítem o por comanda completa y banner fijo de advertencia ante desconexión de red.
3. **Visualización de Instrucciones de Transferencia en Checkout y Tracking (`public-storefront` y `public-tracking`):**
   - Cuando la sucursal tiene configurado `payment_instructions_json` en un canal `OFFLINE_ONLY`, tanto la pantalla de confirmación del pedido como la página de seguimiento `/t/:publicOrderToken` muestran un recuadro destacado con los números de Nequi, DaviPlata o llave Bre-B del restaurante (con botón de copiar número en un toque) mientras `payment_status` sea `UNPAID` o `PARTIALLY_PAID`, cambiando a *"¡Pago registrado por el restaurante!"* en cuanto caja asienta el cobro (`PAID`).

---

## 3. Reglas de Dominio e Invariantes Financieros (Fase 04)

### 3.1 Matriz de Estados Financieros de una Orden Independiente (`Order.payment_status`)
| Estado Actual | Evento / Acción Ejecutada | Condición Requerida | Nuevo Estado Resultante |
| :--- | :--- | :--- | :--- |
| *(Creación)* | `CreatePublicOrderService` | `payment_policy === 'NONE'` | `NOT_TRACKED` (inmutable; no admite cobros) |
| *(Creación)* | `CreatePublicOrderService` | `payment_policy === 'OFFLINE_ONLY'` | `UNPAID` (`paid_total_cop = 0`) |
| `UNPAID` / `PARTIALLY_PAID` | Registrar cobro (`payments/manual`) | `status !== 'REQUESTED'` y $\text{paid\_total\_cop} + \text{monto} < \text{grand\_total\_cop}$ | `PARTIALLY_PAID` |
| `UNPAID` / `PARTIALLY_PAID` | Registrar cobro (`payments/manual`) | `status !== 'REQUESTED'` y $\text{paid\_total\_cop} + \text{monto} === \text{grand\_total\_cop}$ | `PAID` |
| `PAID` / `PARTIALLY_PAID` | Anular cobro (`payments/:id/void`) | Quedan otros pagos `APPROVED` ($\text{paid\_total\_cop} > 0$) | `PARTIALLY_PAID` |
| `PAID` / `PARTIALLY_PAID` | Anular cobro (`payments/:id/void`) | No quedan pagos `APPROVED` ($\text{paid\_total\_cop} === 0$) | `UNPAID` |
| `UNPAID` / `PARTIALLY_PAID` | Resolver saldo (`resolve-uncollected`) | Rol gerente/admin + motivo + estado operativo válido | `COURTESY` o `WRITTEN_OFF` (congela pagos y fija `uncollected_amount_cop`) |
| `COURTESY` / `WRITTEN_OFF` | Revertir resolución (`revert-resolution`) | Rol gerente/admin + motivo obligatorio | `UNPAID` (si `paid_total_cop === 0`) o `PARTIALLY_PAID` (si `paid_total_cop > 0`) |

---

## 4. Matriz de Casos de Prueba Obligatorios (Fase 04)

El desarrollo de la Fase 04 solo se considera terminado cuando todas las siguientes pruebas automatizadas pasan en verde (`Vitest` + `Supertest`):

### 4.1 Pruebas Unitarias (`packages/shared`)
- **`TC-04-U01` (Recálculo Exacto en Pagos Combinados y Anulación Parcial — `recalculatePaymentState`):**
  - Dada una orden con `grandTotalCop = 45000` bajo política `OFFLINE_ONLY`:
    1. Con pagos `[]` $\rightarrow$ retorna `UNPAID`, `paidTotalCop = 0`.
    2. Con un primer pago `[10000]` $\rightarrow$ retorna `PARTIALLY_PAID`, `paidTotalCop = 10000` (jamás `PAID`).
    3. Con un segundo pago `[10000, 35000]` $\rightarrow$ retorna `PAID`, `paidTotalCop = 45000`.
    4. Si se anula el pago de `35000` quedando `[10000]` $\rightarrow$ retorna exactamente `PARTIALLY_PAID` con `paidTotalCop = 10000` (y no `UNPAID`).
- **`TC-04-U02` (Cálculo de Cambio en Efectivo):**
  - Para `amount_cop = 34500` y `cash_received_cop = 50000`, retorna `change_given_cop = 15500`. Si `cash_received_cop = 30000` ($< 34500$), el esquema `Zod` rechaza la petición.
- **`TC-04-U03` (Agregación de Estados de Estaciones KDS a Orden):**
  - Dada una orden con 2 ítems de `PARRILLA` y 1 ítem de `BEBIDAS`: cuando `PARRILLA` marca sus 2 ítems como `READY` pero el ítem de `BEBIDAS` sigue en `PENDING`, `computeAggregatedOrderKitchenStatus` retorna `PREPARING`. Cuando `BEBIDAS` marca su ítem como `READY`, retorna `READY`.
- **`TC-04-U04` (Resolución `COURTESY` / `WRITTEN_OFF` con Pago Parcial Previo):**
  - Si una orden de `$50.000` tenía un abono parcial de `$20.000` y se resuelve como `WRITTEN_OFF`, `recalculatePaymentState` debe retornar `paidTotalCop = 20000`, `uncollectedAmountCop = 30000` y `paymentStatus = 'WRITTEN_OFF'`.

### 4.2 Pruebas de Integración y Seguridad Financiera (`apps/api/test/`)
- **`TC-04-I01` (Bloqueo de Cobros sobre Solicitudes en `REQUESTED` y sobre Órdenes `NOT_TRACKED`):**
  - Intentar registrar un pago manual sobre una solicitud en `status = 'REQUESTED'` responde HTTP `409 Conflict` (`ORDER_MUST_BE_ACCEPTED_BEFORE_PAYMENT`).
  - Intentar registrar un pago manual sobre una orden creada en Nivel 1 con `payment_policy = 'NONE'` (`NOT_TRACKED`) responde HTTP `409 Conflict` (`PAYMENT_NOT_ALLOWED_FOR_POLICY`).
- **`TC-04-I02` (Pagos Combinados, Idempotencia por Tenant y Prevención de Sobrecobro):**
  - Sobre una orden `ACCEPTED` de `$45.000`, registrar `$20.000` en `CASH` deja `payment_status = 'PARTIALLY_PAID'` y `paid_total_cop = 20000`.
  - Repetir la misma petición con igual `Idempotency-Key` devuelve `200 OK` con el mismo pago sin volver a sumar.
  - Usar la misma cadena `Idempotency-Key` en otro restaurante distinto (*Restaurante B*) es permitido gracias a `UNIQUE(tenant_id, idempotency_key)`.
  - Intentar registrar un segundo pago de `$30.000` ($20000 + 30000 > 45000$) responde `409 PAYMENT_EXCEEDS_BALANCE`.
  - Registrar el segundo pago por `$25.000` en `MANUAL_TRANSFER` lleva `paid_total_cop = 45000` y `payment_status = 'PAID'`.
- **`TC-04-I03` (Anulación Parcial con `void` y Recálculo a `PARTIALLY_PAID`):**
  - Sobre la orden pagada de `$45.000` (con pagos de `$20.000` y `$25.000`), un `BRANCH_MANAGER` ejecuta `POST /api/v1/payments/:id/void` sobre el pago de `$25.000` indicando motivo.
  - El pago pasa a `VOIDED`, la orden regresa automáticamente a `payment_status = 'PARTIALLY_PAID'` con `paid_total_cop = 20000` y queda registrado el evento en `audit_events`.
- **`TC-04-I04` (Bloqueo de Cancelación con Pagos Activos y Bloqueo de Reducción de Total bajo lo Pagado):**
  - Mientras la orden tenga `paid_total_cop = 20000`, intentar cancelarla (`PATCH /api/v1/orders/:id/status` con `to_status: 'CANCELLED'`) responde `409 ORDER_HAS_ACTIVE_PAYMENTS`.
  - Intentar editar o descontar la orden para que su `grand_total_cop` baje a `$15.000` ($< 20000$) responde `409 TOTAL_BELOW_PAID_AMOUNT`.
  - Al anular el pago restante de `$20.000` (`paid_total_cop = 0`, `UNPAID`), el backend permite cancelar la orden.
- **`TC-04-I05` (Ciclo Completo de Resolución `COURTESY` / `WRITTEN_OFF`, Congelamiento y Reversión `revert-resolution`):**
  - Intentar resolver una orden en estado `ACCEPTED` como `WRITTEN_OFF` falla con `400 Bad Request` (porque `WRITTEN_OFF` exige estado `READY` o superior), mientras que `COURTESY` sí se permite en `ACCEPTED`.
  - En una orden `DELIVERED` de `$40.000` con abono previo de `$10.000`, el gerente ejecuta `resolve-uncollected` con `WRITTEN_OFF`; la orden queda con `paid_total_cop = 10000`, `uncollected_amount_cop = 30000` y `payment_status = 'WRITTEN_OFF'`.
  - Estando en `WRITTEN_OFF`, cualquier intento de registrar un nuevo cobro o de anular el cobro de `$10.000` es rechazado con `409 ORDER_RESOLUTION_ACTIVE`.
  - El cliente regresa a pagar: el gerente ejecuta `POST /api/v1/orders/:id/revert-resolution` con motivo; la orden limpia `uncollected_amount_cop = 0`, vuelve a `PARTIALLY_PAID` (`paid_total_cop = 10000`) y permite registrar los `$30.000` restantes pasando a `PAID`.
- **`TC-04-I06` (Puerta de Pre-Cobro `require_payment_before_preparation` antes de Cocina y KDS):**
  - En una sucursal con `require_payment_before_preparation = true` en `DELIVERY` (`OFFLINE_ONLY`), se crea y procesa (`ACCEPTED`) un pedido de domicilio (`payment_status = 'UNPAID'`).
  - `GET /api/v1/kitchen/orders` **no** incluye ese pedido en la cola KDS, e intentar pasarlo manualmente a `PREPARING` responde `409 PAYMENT_REQUIRED_BEFORE_PREPARATION`.
  - En cuanto caja registra el pago total (`payment_status = 'PAID'`), el pedido aparece inmediatamente en `GET /api/v1/kitchen/orders` y permite avanzar a `PREPARING`.
- **`TC-04-I07` (Enrutamiento por Estación en KDS y Sincronización Automática a Orden):**
  - Con estaciones `PARRILLA` y `BEBIDAS`, al marcar el primer ítem en `PREPARING`, `Order.status` cambia a `PREPARING`; al marcar todos los ítems de ambas estaciones en `READY`, `Order.status` cambia automáticamente a `READY` y emite SSE al cliente.
- **`TC-04-I08` (Bloqueo en `OpenOperationsChecker` por Órdenes `PREPARING` o Saldos sin Resolver):**
  - Mientras exista una orden en `PREPARING`, intentar desactivar `kitchen` responde `409 MODULE_HAS_OPEN_OPERATIONS`.
  - Mientras exista una orden activa en `UNPAID` o `PARTIALLY_PAID`, intentar desactivar `payments.manual` responde `409 MODULE_HAS_OPEN_OPERATIONS`; al saldarla (`PAID`) o resolverla (`COURTESY` / `WRITTEN_OFF`), el backend permite desactivar el módulo.
- **`TC-04-I09` (Inmutabilidad Histórica de `NOT_TRACKED` al Subir de Nivel 1 a Nivel 2):**
  - Un restaurante crea 3 pedidos en Nivel 1 (`WHATSAPP_SIMPLE` $\rightarrow$ `payment_policy = 'NONE'`, `payment_status = 'NOT_TRACKED'`) y luego aplica el perfil `FULL_PANEL` (`OFFLINE_ONLY`).
  - Al consultar `GET /api/v1/branches/:branchId/orders?payment_status=UNPAID`, los 3 pedidos anteriores no aparecen como deuda pendiente y conservan `payment_status = 'NOT_TRACKED'`.
- **`TC-04-I10` (Aislamiento Multi-Tenant en KDS, Pagos y Resoluciones):**
  - Un usuario del *Restaurante A* intenta cobrar, anular un pago, resolver un saldo o cambiar el estado KDS de una orden del *Restaurante B* y recibe `403 / 404` sin alterar ningún dato.

### 4.3 Pruebas End-to-End de Panel Completo, Pre-Cobro y KDS (`apps/web`)
- **`TC-04-E01` (Flujo E2E: Instrucciones de Transferencia → Pre-Cobro en Panel → KDS → Entrega):**
  1. El cliente realiza un pedido de domicilio y visualiza en `/t/:token` los datos de Nequi/Bre-B del restaurante con botón de copiar.
  2. El cajero en `/panel` registra un abono parcial de `$20.000` en efectivo y el resto por transferencia, pasando la tarjeta a `PAGADO`.
  3. La comanda se desbloquea y aparece en vivo en `/kds`; el cocinero marca los ítems como `Listo` y la página `/t/:token` del cliente se actualiza a *"Tu pedido está listo"* en menos de 3 segundos.

---

## 5. Secuencia de Prompts Acotados para Ejecutar la Fase 04 con Gemini

Adjunta siempre `DEFINICION_TECNICA.md` (v2.4.0), `STACK_VERSIONS.md` (v2.4.0) y este archivo `FASE_04_PANEL_COMPLETO_COCINA_KDS_Y_COBROS_MANUALES.md`, y solicita los siguientes **6 pasos uno por uno**, ejecutando la puerta de validación manual al terminar cada paso:

### Paso 4.1: Máquina de Estados Financieros, `recalculatePaymentState`, Agregador KDS y Tests Unitarios (`packages/shared`)
> **Prompt 4.1:** *"Con base en `DEFINICION_TECNICA.md` (v2.4.0), `STACK_VERSIONS.md` (v2.4.0) y `FASE_04_PANEL_COMPLETO_COCINA_KDS_Y_COBROS_MANUALES.md`, genera en `packages/shared` el archivo `payment-status.machine.ts` (incluyendo la función pura `recalculatePaymentState`), el agregador `kitchen-aggregation.ts`, los esquemas Zod en `panel-kitchen.schema.ts` y las pruebas unitarias `TC-04-U01` a `TC-04-U04`. Entrega todos los archivos 100 % completos y sin TODOs."*
- **Puerta Manual 4.1:** Ejecutar `pnpm --filter @restaurante-saas/shared typecheck && pnpm --filter @restaurante-saas/shared test`.

### Paso 4.2: Modelos Prisma `KitchenStation` y `Payment` + Migración SQL con RLS y Restricciones `CHECK`
> **Prompt 4.2:** *"Actualiza `apps/api/prisma/schema.prisma` agregando los modelos `KitchenStation` y `Payment` con todos sus campos e índices compuestos, y genera la migración SQL correspondiente que crea las tablas, añade las restricciones `CHECK` (`chk_payments_xor_target`, `chk_payments_positive_amount`, `chk_payments_cash_change`), el índice `UNIQUE(tenant_id, idempotency_key)` y activa las políticas Row-Level Security (RLS) para el rol `app_runtime`."*
- **Puerta Manual 4.2:** Ejecutar `pnpm --filter @restaurante-saas/api prisma migrate deploy && pnpm --filter @restaurante-saas/api typecheck`.

### Paso 4.3: Módulo Backend `payments` (`ManualPaymentsService`, `void`, `resolve-uncollected` y `revert-resolution`) + Reglas en `ordering`
> **Prompt 4.3:** *"Implementa completo el módulo `apps/api/src/modules/payments/` (`ManualPaymentsService` con bloqueo `SELECT ... FOR UPDATE`, validación contra `REQUESTED`/`NOT_TRACKED`/`dining_account_id`, anulación `void`, `OrderResolutionService` para `COURTESY`/`WRITTEN_OFF` y `revert-resolution`) y actualiza `ordering` (filtros avanzados del panel, historial unificado, puerta `require_payment_before_preparation`, bloqueo `TOTAL_BELOW_PAID_AMOUNT` y bloqueo `ORDER_HAS_ACTIVE_PAYMENTS`). Sin TODOs."*
- **Puerta Manual 4.3:** Ejecutar `pnpm --filter @restaurante-saas/api typecheck`.

### Paso 4.4: Módulo Backend `kitchen` (Estaciones y KDS) + `OpenOperationsChecker` en `capabilities`
> **Prompt 4.4:** *"Implementa completo el módulo `apps/api/src/modules/kitchen/` (CRUD de `KitchenStation`, estación por defecto `'GENERAL'`, cola `GET /api/v1/kitchen/orders` respetando `require_payment_before_preparation`, actualización `PATCH /api/v1/kitchen/orders/:orderId/status` con sincronización automática de ítems a orden y emisión SSE) y conecta las validaciones de órdenes `PREPARING` y saldos `UNPAID`/`PARTIALLY_PAID` en `OpenOperationsChecker` dentro del módulo `capabilities`."*
- **Puerta Manual 4.4:** Ejecutar `pnpm --filter @restaurante-saas/api typecheck`.

### Paso 4.5: Suite de Pruebas de Integración de Fase 04 (`TC-04-I01` a `TC-04-I10`)
> **Prompt 4.5:** *"Implementa en `apps/api/test/` la suite completa de pruebas de integración `TC-04-I01` a `TC-04-I10` verificando pagos combinados, anulación parcial, resoluciones `COURTESY`/`WRITTEN_OFF`, reversión, puerta de pre-cobro, KDS por estaciones y aislamiento multi-tenant."*
- **Puerta Manual 4.5:** Ejecutar `pnpm --filter @restaurante-saas/api test` y confirmar que todos los tests pasen en verde.

### Paso 4.6: Frontend React (`apps/web`): Consola Completa de Pedidos, Modal de Cobros/Resoluciones, Pantalla KDS e Instrucciones de Pago
> **Prompt 4.6:** *"Implementa en `apps/web` la consola avanzada en `features/full-order-panel/` (filtros multicriterio, pestañas con contadores SSE, `OrderHistoryDrawer` y `ManualPaymentModal` con pagos combinados, calculadora de efectivo, anulación `void`, resolución `COURTESY`/`WRITTEN_OFF` y reversión), la Pantalla de Cocina en `features/kitchen-kds/` (filtro por estación, semáforo de tiempos, check táctil de ítems, alerta sonora Web Audio API y banner de desconexión) y la visualización de `payment_instructions_json` en `public-storefront` y `public-tracking`, incluyendo la prueba E2E `TC-04-E01`."*
- **Puerta Manual 4.6 (Cierre de Fase 04):** Ejecutar `pnpm turbo run typecheck && pnpm turbo run test && pnpm --filter @restaurante-saas/web build`.