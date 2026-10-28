# Fase 06: Operación de Salón, Plano de Mesas, Autopedido QR Confirmado, Distribución Informativa por Persona y Extensión de Reportes

**Documento:** `FASE_06_SALON_MESAS_Y_DIVISION_INFORMATIVA.md`  
**Versión:** 2.4.0 — Alineado con `DEFINICION_TECNICA.md` (v2.4.0) y `STACK_VERSIONS.md` (v2.4.0)  
**Fecha:** 2026-10-27  
**Prerrequisitos:** `FASE_01`, `FASE_02`, `FASE_03A`, `FASE_03B`, `FASE_04` y `FASE_05` (v2.4.0) completadas y con todas sus puertas de pruebas en verde.  
**Objetivo de la Fase:** Completar al 100 % el **Nivel 3 de la Escalera de Adopción (`DINING_ROOM` y `ENTERPRISE_MULTI`)** y cerrar la construcción del MVP implementando el módulo de **Salón (`dining`)** con áreas, plano interactivo de mesas, cuentas abiertas (`DiningAccount`) con control de concurrencia optimista y pesimista, traslado de mesas, cobro centralizado en la cuenta de salón, cierre dual (por pago total o por resolución auditada `COURTESY` / `WRITTEN_OFF`), reapertura en dos modos (`ACCOUNTING_ONLY` sin ocupar la mesa física y `FULL_TABLE`), el módulo de **Autopedido desde QR de Mesa (`channel.dine_in_qr`)** con PIN opcional y confirmación obligatoria del mesero antes de cocina, la calculadora y vista de **Distribución Informativa del Consumo por Persona (`dining.consumption_split`)** en partes enteras conciliada al peso exacto (`1 COP`), y la extensión del módulo de **Reportes (`reporting`)** para consolidar cuentas de salón sin doble conteo de órdenes hijas.

---

## 1. Reglas de Ingeniería, Concurrencia e Integridad Financiera de Salón (Directivas para Gemini)

Al procesar este documento junto con `DEFINICION_TECNICA.md` (v2.4.0) y `STACK_VERSIONS.md` (v2.4.0) para generar código, debes cumplir sin excepción las siguientes directivas:

1. **Política de Cero Código Incompleto (`Zero-Placeholder Policy`):**
   - Está estrictamente prohibido entregar archivos con comentarios como `// TODO`, `// implementar luego`, `// ... resto del código` o funciones vacías. Cada archivo generado debe ser **100 % funcional, compilable y estrictamente tipado**.
2. **Apego Estricto a `STACK_VERSIONS.md` y Entrega con Puertas Manuales:**
   - Usa únicamente las versiones y librerías fijadas en `STACK_VERSIONS.md` (Node 22 LTS, NestJS 10, Prisma 5, React 18, Vite 5, TanStack Query 5, Zustand 5, Zod 3.23).
   - Entrega únicamente los archivos correspondientes al sub-paso solicitado en la Sección 5 y espera la confirmación de la **Puerta de Validación Manual** (`pnpm install`, `pnpm turbo run typecheck`, `pnpm turbo run test`) antes de avanzar al siguiente paso.
3. **Política Fija `OFFLINE_ONLY` en `DINE_IN` y Cobro Centralizado en `DiningAccount`:**
   - Toda operación de salón (`fulfillment_type = 'DINE_IN'`) nace siempre bajo `payment_policy = 'OFFLINE_ONLY'` y `require_payment_before_preparation = false`.
   - En salón, los pagos manuales se registran **exclusivamente sobre la `DiningAccount`** (`POST /api/v1/accounts/:accountId/payments/manual` insertando en `Payment` con `account_id IS NOT NULL AND order_id IS NULL`).
   - Intentar registrar un pago directo sobre una orden hija de salón (`Order.dining_account_id IS NOT NULL`) debe seguir siendo rechazado con HTTP `409 Conflict` (`PAY_VIA_DINING_ACCOUNT`).
   - Mientras la `DiningAccount` está en estado `'OPEN'` o `'REOPENED_ACCOUNTING'`, todas sus órdenes hijas no canceladas mantienen `payment_status = 'UNPAID'`. En el instante en que la `DiningAccount` pasa a `'CLOSED'`, todas sus órdenes hijas activas sincronizan automáticamente su `payment_status` con el estado final de la cuenta (`'PAID'`, `'COURTESY'` o `'WRITTEN_OFF'`).
4. **Unicidad de Cuenta Abierta por Mesa y Reapertura Contable (`REOPENED_ACCOUNTING`):**
   - En PostgreSQL existe el índice único parcial `CREATE UNIQUE INDEX idx_unique_open_account_per_table ON dining_accounts(tenant_id, branch_id, table_id) WHERE status = 'OPEN'`.
   - Una cuenta en `status = 'CLOSED'` está congelada financieramente: rechaza nuevos cobros y anulaciones (`409 ACCOUNT_IS_CLOSED`).
   - Para corregir cobros en una cuenta cerrada, `POST /api/v1/accounts/:accountId/reopen` ofrece dos modos explícitos:
     - **`mode = 'ACCOUNTING_ONLY'` (Reapertura Contable en Caja):** Pasa la cuenta a `status = 'REOPENED_ACCOUNTING'`. **No modifica `Table.status` ni requiere que la mesa física esté libre**, y no colisiona con el índice parcial `WHERE status = 'OPEN'` si la mesa ya está ocupada por nuevos clientes. Permite anular cobros mal digitados (`void`), registrar cobros correctos o cobrar un saldo que estaba en `WRITTEN_OFF`, y volver a cerrar la cuenta (`CLOSED`).
     - **`mode = 'FULL_TABLE'` (Reapertura Operativa de Mesa):** Exige que la mesa física esté actualmente en `status = 'FREE'` (de lo contrario lanza `409 TABLE_ALREADY_OCCUPIED`). Pasa la cuenta a `status = 'OPEN'` y la mesa a `status = 'OCCUPIED'`, permitiendo tanto agregar nuevas comandas de comida como ajustar cobros.
5. **Seguridad en Autopedido desde QR de Mesa (`origin = 'TABLE_QR'`):**
   - Todo pedido creado por un comensal escaneando el QR de su mesa (`origin = 'TABLE_QR'`, `fulfillment_type = 'DINE_IN'`) nace obligatoriamente en estado **`REQUESTED`** y **no entra al KDS de cocina ni suma al total confirmado de la cuenta** hasta que un mesero u operador lo confirma con un toque (`ACCEPTED`), momento en el que se vincula/recalcula en la `DiningAccount` (incrementando `version`) y sus ítems se enrutan a las estaciones del KDS (`kitchen`).
6. **Distribución del Consumo por Persona 100 % Informativa y Conciliada al Peso (`1 COP`):**
   - El módulo `dining.consumption_split` persiste partes enteras (`share_units` sobre `total_item_shares`) y el importe exacto conciliado en pesos (`assigned_amount_cop`) en `ConsumptionAssignment`.
   - Jamás divide la `DiningAccount` en múltiples cuentas de cobro ni altera `DiningAccount.grand_total_cop`. Cumple siempre el invariante:
     $$\sum_{d \in \text{Diners}} \text{diner\_total\_cop}(d) + \text{unassigned\_amount\_cop} \equiv \text{DiningAccount.grand\_total\_cop}$$
7. **Cero Doble Conteo en Reportes (`reporting`):**
   - Al extender `ReportingService` para incluir salón, los totalizadores monetarios (`gross_billed_total_cop`, `collected_total_cop`, `pending_receivable_cop`, `courtesy_total_cop`, `written_off_total_cop`) suman dos conjuntos disjuntos: (a) órdenes independientes (`Order.dining_account_id IS NULL`) y (b) cuentas de salón (`DiningAccount`). Las órdenes hijas (`Order.dining_account_id IS NOT NULL`) **jamás se suman por separado en los totales monetarios**.

---

## 2. Alcance Exacto de la Fase 06

### 2.1 Extensión del Paquete Compartido (`packages/shared`)
1. **Máquina de Estados de Salón (`packages/shared/src/constants/dining.machine.ts`):**
   - `TableStatus`: `'FREE'` | `'OCCUPIED'` | `'PENDING_PAYMENT'` | `'RESERVED'`.
   - `DiningAccountStatus`: `'OPEN'` | `'REOPENED_ACCOUNTING'` | `'CLOSED'` | `'CANCELLED'`.
   - `AccountReopenMode`: `'ACCOUNTING_ONLY'` | `'FULL_TABLE'`.
   - `ConsumptionSplitRule`: `'PROPORTIONAL'` | `'EQUAL'` | `'UNASSIGNED'`.
   - Funciones de validación de transiciones de mesa y cuenta.
2. **Calculadora Pura de Distribución Informativa por Persona (`packages/shared/src/utils/consumption-split.calculator.ts`):**
   - Recibe los ítems activos de la cuenta (`OrderItem` no cancelados de órdenes en estados `ACCEPTED` a `SERVED`), los comensales (`AccountDiner`), las asignaciones en partes enteras (`share_units`, `total_item_shares`), el descuento global (`discount_total_cop`), la propina voluntaria (`tip_cop`), el total de la cuenta (`grand_total_cop`) y la regla `split_rule` (`'PROPORTIONAL'` | `'EQUAL'` | `'UNASSIGNED'`).
   - Calcula de forma determinista el `assigned_amount_cop` de cada asignación y el resumen por comensal (`diner_subtotal_items_cop`, `diner_discount_share_cop`, `diner_tip_share_cop`, `diner_total_cop`) más `unassigned_amount_cop`, asignando cualquier residuo de redondeo de $1\text{ COP}$ de manera determinista al primer comensal participante de la línea compartida para que la suma cuadre exactamente al peso al guardar y al recargar desde PostgreSQL.
3. **Esquemas `Zod` y Contratos DTO (`packages/shared/src/schemas/dining.schema.ts`):**
   - `CreateDiningAreaSchema`, `UpdateDiningAreaSchema`, `CreateTableSchema`, `UpdateTableSchema`.
   - `OpenDiningAccountSchema`: `table_id (UUID)`, `guest_count (INT 1..50)`.
   - `AddOrderToAccountSchema`: `expected_account_version (INT >= 1)`, `items` (array de productos, variantes, modificadores y notas).
   - `TransferTableSchema`: `target_table_id (UUID)`, `expected_account_version (INT >= 1)`, `reason (TEXT min 3)`.
   - `UpdateBillPreviewSchema`: `expected_account_version (INT >= 1)`, `discount_total_cop (INT >= 0)`, `tip_cop (INT >= 0)`.
   - `PutConsumptionDistributionSchema`: `expected_account_version (INT >= 1)`, `split_rule ('PROPORTIONAL' | 'EQUAL' | 'UNASSIGNED')`, `diners: Array<{ id?: string, label: string, sort_order: number }>`, `assignments: Array<{ diner_label_or_id: string, order_item_id: string, share_units: number, total_item_shares: number }>`.
   - `CloseDiningAccountSchema`: `expected_account_version (INT >= 1)`, `resolution_type ('COURTESY' | 'WRITTEN_OFF' optional)`, `reason (TEXT min 5 optional)`.
   - `ReopenDiningAccountSchema`: `mode ('ACCOUNTING_ONLY' | 'FULL_TABLE')`, `reason (TEXT min 5)`.

### 2.2 Base de Datos (`PostgreSQL 16` + `Prisma`) — Tablas de Salón, Índices Parciales y RLS
Migración SQL y actualización de `apps/api/prisma/schema.prisma` (Sección 9.1.4 de `DEFINICION_TECNICA.md` v2.4.0):
1. **`DiningArea` (`dining_areas`):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`, `name (VARCHAR)`, `sort_order (INT DEFAULT 0)`, `is_active (BOOLEAN DEFAULT TRUE)`, `created_at (TIMESTAMPTZ)`.
2. **`Table` (`dining_tables`):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`, `area_id (UUID FK)`, `code (VARCHAR — ej. M-01)`, `capacity (INT DEFAULT 4)`, `status (VARCHAR — FREE | OCCUPIED | PENDING_PAYMENT | RESERVED)`, `is_active (BOOLEAN DEFAULT TRUE)`, `created_at (TIMESTAMPTZ)`.
   - `UNIQUE(tenant_id, branch_id, code)`.
   - `CHECK (status IN ('FREE', 'OCCUPIED', 'PENDING_PAYMENT', 'RESERVED'))`.
3. **`DiningAccount` (`dining_accounts`):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`, `table_id (UUID FK)`, `account_code (VARCHAR — ej. #C-101)`
   - `status (VARCHAR — OPEN | REOPENED_ACCOUNTING | CLOSED | CANCELLED)`
   - `payment_status (VARCHAR — UNPAID | PARTIALLY_PAID | PAID | COURTESY | WRITTEN_OFF)`
   - `guest_count (INT DEFAULT 1)`, `table_session_pin (VARCHAR(4) NULL)`
   - `subtotal_products_cop (INT DEFAULT 0)`, `discount_total_cop (INT DEFAULT 0)`, `tax_total_cop (INT DEFAULT 0)`, `tip_cop (INT DEFAULT 0)`, `grand_total_cop (INT DEFAULT 0)`, `paid_total_cop (INT DEFAULT 0)`, `uncollected_amount_cop (INT DEFAULT 0)`
   - `tax_summary_snapshot_json (JSONB)`
   - `resolution_type (VARCHAR NULL — COURTESY | WRITTEN_OFF)`
   - `split_rule (VARCHAR DEFAULT 'PROPORTIONAL' — PROPORTIONAL | EQUAL | UNASSIGNED)`
   - `opened_by (UUID FK)`, `opened_at (TIMESTAMPTZ)`, `closed_by (UUID FK NULL)`, `closed_at (TIMESTAMPTZ NULL)`, `close_reason (TEXT NULL)`
   - `reopened_by (UUID FK NULL)`, `reopened_at (TIMESTAMPTZ NULL)`, `reopen_reason (TEXT NULL)`
   - `version (INT DEFAULT 1)`
   - **Índice único parcial obligatorio en la migración SQL:**
     `CREATE UNIQUE INDEX idx_unique_open_account_per_table ON dining_accounts(tenant_id, branch_id, table_id) WHERE status = 'OPEN';`
   - **Restricciones `CHECK` en `dining_accounts`:**
     - `CHECK (status IN ('OPEN', 'REOPENED_ACCOUNTING', 'CLOSED', 'CANCELLED'))`
     - `CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'COURTESY', 'WRITTEN_OFF'))`
     - `CHECK (grand_total_cop >= paid_total_cop)`
4. **`AccountDiner` (`account_diners`):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`, `account_id (UUID FK ON DELETE CASCADE)`, `label (VARCHAR — ej. Persona 1)`, `sort_order (INT DEFAULT 0)`, `UNIQUE(account_id, label)`.
5. **`ConsumptionAssignment` (`consumption_assignments`):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`, `account_id (UUID FK ON DELETE CASCADE)`, `diner_id (UUID FK ON DELETE CASCADE)`, `order_item_id (UUID FK ON DELETE CASCADE)`
   - `share_units (INT NOT NULL CHECK (share_units > 0))`
   - `total_item_shares (INT NOT NULL CHECK (total_item_shares >= share_units))`
   - `assigned_amount_cop (INT NOT NULL CHECK (assigned_amount_cop >= 0))`
   - `UNIQUE(diner_id, order_item_id)`.
6. **Políticas RLS:**
   - Habilitar `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` para el rol `app_runtime` en `dining_areas`, `dining_tables`, `dining_accounts`, `account_diners` y `consumption_assignments` validando `tenant_id = current_setting('app.current_tenant_id', true)::uuid`.

### 2.3 Backend en NestJS (`apps/api`)
1. **Módulo `dining` (`apps/api/src/modules/dining/`):**
   - CRUD Administrativo de Áreas y Mesas (`GET / POST / PATCH /api/v1/admin/branches/:branchId/dining-areas` y `/tables`), con generación automática o bajo demanda de su `QrCodeLink` (`target_type = 'DINING_TABLE'`).
   - `GET /api/v1/branches/:branchId/tables` (`@RequireModule('dining')`): Devuelve el plano de áreas y mesas con el estado en tiempo real, resumen de la cuenta `OPEN` en cada mesa ocupada, conteo de solicitudes QR `REQUESTED` pendientes de confirmar en esa mesa y lista separada de cuentas en estado `REOPENED_ACCOUNTING` pendientes de ajuste contable en caja.
   - `POST /api/v1/branches/:branchId/accounts` (`@RequireModule('dining')`): Abre una `DiningAccount` en una mesa `FREE`, genera un `table_session_pin` aleatorio de 4 dígitos (`0000`–`9999`), cambia la mesa a `OCCUPIED` y emite evento SSE a la sucursal.
   - `POST /api/v1/accounts/:accountId/orders` (`@RequireModule('dining')`): Toma una comanda de mesero (`origin = 'STAFF'`, `fulfillment_type = 'DINE_IN'`, `status = 'ACCEPTED'`), bloquea la `DiningAccount` con `SELECT ... FOR UPDATE`, verifica que `account.version === dto.expected_account_version` (si no coincide, aborta con `409 ACCOUNT_VERSION_CONFLICT`), recalcula precios e impuestos de la cuenta, incrementa `account.version`, enruta los ítems a las estaciones del KDS (`kitchen`) y emite alerta SSE.
   - `POST /api/v1/accounts/:accountId/transfer-table` (`@RequireModule('dining')`): Traslada una cuenta `OPEN` (y todas sus órdenes asociadas) de la mesa origen a una mesa destino que esté `FREE`, liberando la mesa origen (`FREE`), ocupando la mesa destino (`OCCUPIED`), incrementando `version` y registrando en `AuditEvent`.
   - `PATCH /api/v1/accounts/:accountId/bill-preview` (`@RequireModule('dining')`): Actualiza descuento global y propina voluntaria (`tip_cop`), valida que el nuevo `grand_total_cop >= paid_total_cop` (`409 TOTAL_BELOW_PAID_AMOUNT`), recalcula `recalculatePaymentState()`, cambia la mesa a `PENDING_PAYMENT` e incrementa `version`.
   - `GET / PUT /api/v1/accounts/:accountId/consumption-distribution` (`@RequireModule('dining', 'dining.consumption_split')`): Calcula mediante `consumption-split.calculator.ts` y persiste transaccionalmente en `AccountDiner` y `ConsumptionAssignment` las partes enteras (`share_units` / `total_item_shares`) y los montos exactos conciliados (`assigned_amount_cop`), devolviendo el desglose por persona y cualquier saldo sin asignar.
   - `POST /api/v1/accounts/:accountId/close` (`@RequireModule('dining')`):
     - Bloquea la cuenta (`OPEN` o `REOPENED_ACCOUNTING`) con `SELECT ... FOR UPDATE`.
     - Verifica que no existan órdenes de esa cuenta en estados activos de cocina (`REQUESTED` o `PREPARING`) sin resolver.
     - Si `grand_total_cop === paid_total_cop` (incluyendo cuando `grand_total_cop === 0`), cierra la cuenta (`status = 'CLOSED'`, `payment_status = 'PAID'`), sincroniza las órdenes hijas a `'PAID'` y, si estaba en `'OPEN'`, libera la mesa (`FREE`).
     - Si `grand_total_cop > paid_total_cop`, exige rol `BRANCH_MANAGER` o `TENANT_ADMIN`, `resolution_type` (`'COURTESY'` | `'WRITTEN_OFF'`) y `reason` obligatorio (de lo contrario lanza `409 ACCOUNT_HAS_UNPAID_BALANCE` o `403 Forbidden`). Calcula `uncollected_amount_cop = grand_total_cop - paid_total_cop`, fija `payment_status = resolution_type`, `status = 'CLOSED'`, sincroniza el `payment_status` de todas las órdenes hijas activas a `resolution_type`, libera la mesa si estaba en `'OPEN'` y registra en `AuditEvent`.
   - `POST /api/v1/accounts/:accountId/reopen` (`@RequireModule('dining')`, exclusivo `BRANCH_MANAGER` / `TENANT_ADMIN`):
     - Bloquea la cuenta en `status = 'CLOSED'` con `SELECT ... FOR UPDATE`.
     - Si `mode === 'ACCOUNTING_ONLY'`: cambia `DiningAccount.status` a `'REOPENED_ACCOUNTING'` **sin modificar `Table.status`**, limpia `uncollected_amount_cop = 0` y `resolution_type = NULL`, ejecuta `recalculatePaymentState()`, restablece las órdenes hijas activas a `'UNPAID'` y registra en `AuditEvent`.
     - Si `mode === 'FULL_TABLE'`: bloquea también la fila de `Table` con `SELECT ... FOR UPDATE`; si `table.status !== 'FREE'` lanza `409 TABLE_ALREADY_OCCUPIED`. Si está libre, cambia la mesa a `'OCCUPIED'`, la cuenta a `'OPEN'`, limpia `uncollected_amount_cop = 0` y `resolution_type = NULL`, ejecuta `recalculatePaymentState()`, restablece las órdenes hijas activas a `'UNPAID'` y registra en `AuditEvent`.
2. **Flujo de Autopedido QR en Mesa (`channel.dine_in_qr`) en `ordering` y `dining`:**
   - En `POST /api/v1/public/orders` cuando `origin === 'TABLE_QR'` y `fulfillment_type === 'DINE_IN'`:
     - Verifica que los módulos `ordering`, `dining` y `channel.dine_in_qr` estén activos en la sucursal.
     - Resuelve la mesa desde el `qr_token` (`QrCodeLink` con `target_type = 'DINING_TABLE'` activo y no revocado).
     - Verifica que exista una `DiningAccount` en estado `'OPEN'` en esa mesa (si la mesa está `FREE` y no tiene cuenta abierta, responde `409 TABLE_ACCOUNT_NOT_OPEN` pidiendo al comensal solicitar apertura al mesero, o valida el `table_session_pin` si `BranchChannelPolicy.require_table_pin === true`, respondiendo `403 INVALID_TABLE_PIN` si no coincide).
     - Crea la `Order` vinculada a `table_id` y `dining_account_id` en estado obligatorio **`REQUESTED`**, con `payment_policy = 'OFFLINE_ONLY'`, `require_payment_before_preparation = false` y `payment_status = 'UNPAID'`, y emite alerta SSE inmediata a los meseros/panel (*"Nueva solicitud QR en Mesa M-XX"*).
   - Cuando el mesero confirma la solicitud (`POST /api/v1/orders/:orderId/process` o confirmación de comanda en salón):
     - La orden pasa de `REQUESTED` a `ACCEPTED`, se bloquea (`is_locked = true`), recalcula y suma sus importes a los totales de la `DiningAccount` incrementando `DiningAccount.version`, y enruta sus `OrderItem` a las estaciones del KDS (`kitchen`).
3. **Extensión de `ManualPaymentsService` (`payments.manual`) para Cuentas de Salón:**
   - `POST /api/v1/accounts/:accountId/payments/manual` (`@RequireModule('dining', 'payments.manual')`):
     - Bloquea la `DiningAccount` con `SELECT ... FOR UPDATE`, verifica que `account.status` sea `'OPEN'` o `'REOPENED_ACCOUNTING'` (`409 ACCOUNT_IS_CLOSED` si está cerrada) y valida `UNIQUE(tenant_id, idempotency_key)`.
     - Verifica que `paid_total_cop + amount_cop <= grand_total_cop` (`409 PAYMENT_EXCEEDS_BALANCE`).
     - Inserta el registro en `Payment` (`account_id = account.id`, `order_id = NULL`, `status = 'APPROVED'`) y ejecuta `recalculatePaymentState()`.
     - Si tras el pago `payment_status === 'PAID'` (`paid_total_cop === grand_total_cop`), cierra automáticamente la `DiningAccount` (`status = 'CLOSED'`), sincroniza todas sus órdenes hijas activas a `payment_status = 'PAID'`, libera la mesa (`Table.status = 'FREE'`) si la cuenta estaba en `'OPEN'`, incrementa `version` y emite evento SSE.
   - En `POST /api/v1/payments/:paymentId/void`: si el pago pertenece a una `DiningAccount`, verifica que la cuenta esté en `'OPEN'` o `'REOPENED_ACCOUNTING'` (si está en `'CLOSED'`, rechaza con `409 ACCOUNT_IS_CLOSED` indicando que debe reabrirse antes con `reopen`), anula el pago (`VOIDED`) y ejecuta `recalculatePaymentState()` sobre la cuenta.
4. **Extensión de `OpenOperationsChecker` (`capabilities`) y `ReportingService` (`reporting`):**
   - `OpenOperationsChecker`: bloquea con `409 MODULE_HAS_OPEN_OPERATIONS` la desactivación de `dining` si existen filas en `DiningAccount` con `status IN ('OPEN', 'REOPENED_ACCOUNTING')`, y bloquea la desactivación de `payments.manual` si existen cuentas de salón con `payment_status IN ('UNPAID', 'PARTIALLY_PAID')`.
   - `ReportingService`: extiende `GET /api/v1/reports/sales` y `GET /api/v1/reports/sales/export-csv` para unir al conjunto de órdenes independientes (`Order.dining_account_id IS NULL`) el conjunto de cuentas de salón (`DiningAccount` con `status != 'CANCELLED'`), aplicando la misma prelación de abonos parciales (`allocateCollectedBreakdown`) y la ecuación maestra de conciliación sin sumar jamás por separado las órdenes hijas (`Order.dining_account_id IS NOT NULL`).

### 2.4 Frontend en React (`apps/web`) — Consola POS de Salón, Vista de Comensal QR y Pre-Cuenta con División
1. **Consola Operativa de Salón y Mesas (`apps/web/src/features/dining-pos/`):**
   - **Plano Interactivo de Mesas por Áreas:** Tarjetas visuales por mesa con código (`M-01`), capacidad, estado en vivo por color (`FREE`, `OCCUPIED`, `PENDING_PAYMENT`, `RESERVED`), PIN de sesión activo (`table_session_pin`), total acumulado y badge parpadeante si tiene solicitudes de QR de mesa en estado `REQUESTED`.
   - **Bandeja de Solicitudes QR de Mesa:** Permite al mesero revisar y confirmar en un toque (`ACCEPTED`) o rechazar con motivo las solicitudes enviadas por los comensales desde el QR de la mesa.
   - **Toma de Comanda Móvil para Meseros:** Selector ágil de categorías, productos, variantes, modificadores y notas de cocina conectado a `POST /api/v1/accounts/:accountId/orders` enviando `expected_account_version`.
   - **Calculadora Visual de Distribución Informativa por Persona (`consumption-split-drawer.tsx`):**
     - Permite crear/renombrar comensales (`Persona 1`, `Persona 2`, `Persona 3`...), asignar unidades enteras con un toque o dividir un plato compartido en partes iguales o proporcionales (`share_units` / `total_item_shares`).
     - Muestra en tiempo real el subtotal de cada persona, su parte de propina/descuento (`PROPORTIONAL`, `EQUAL` o `UNASSIGNED`), el indicador `"Por asignar: $0 COP"` y el botón para imprimir la **Pre-cuenta con Desglose Informativo por Persona**.
   - **Modal de Caja de Salón, Resolución y Reapertura Contable (`REOPENED_ACCOUNTING`):**
     - Registro de pago único o pagos combinados (`Efectivo` con cálculo de cambio, `Datáfono`, `Transferencia`) sobre el total de la cuenta.
     - Opciones de traslado de mesa, cierre con resolución (`COURTESY` / `WRITTEN_OFF`) para gerentes y pestaña de **"Cuentas Cerradas / Reapertura Contable (`ACCOUNTING_ONLY` o `FULL_TABLE`)"**.
2. **Extensión de Vitrina Pública para QR de Mesa (`apps/web/src/features/public-storefront/`):**
   - Cuando el comensal accede mediante `/r/:slug?qr=:qrToken` correspondiente a `DINING_TABLE`, la cabecera muestra *"Estás pidiendo en la Mesa M-04"*, solicita el PIN de 4 dígitos si `require_table_pin === true` y al enviar el pedido muestra el estado en vivo (`REQUESTED`: *"Esperando confirmación del mesero"* $\rightarrow$ `ACCEPTED` $\rightarrow$ `PREPARING` $\rightarrow$ `READY` $\rightarrow$ `SERVED`).
3. **Extensión de Impresión Térmica 58mm / 80mm (`print-receipt.ts`):**
   - Agrega a la pre-cuenta de salón la tabla opcional **"Distribución Informativa por Persona (Un solo cobro en caja)"** con los importes conciliados de cada comensal y la leyenda fiscal DIAN al pie.

---

## 3. Algoritmos y Reglas de Dominio Críticas de la Fase 06

### 3.1 Algoritmo Exacto de Distribución Informativa por Persona (`consumption-split.calculator.ts`)
Para garantizar que jamás se pierda ni sobre un peso colombiano (`1 COP`) al dividir ítems compartidos ni al recargar desde la base de datos:
1. **Reparto de cada `OrderItem` ($I$) con `line_total_cop` $= L_I$:**
   - Si el ítem tiene $k$ asignaciones a distintos comensales $(d_1, u_1), (d_2, u_2), \dots, (d_k, u_k)$ sobre un denominador entero común $T_I = \text{total\_item\_shares}$ (donde $\sum_{j=1}^{k} u_j \le T_I$):
   - Sea $S_{\text{units}} = \sum_{j=1}^{k} u_j$ el total de partes asignadas hasta el momento. El monto total asignado del ítem es:
     $$A_{\text{item}} = \text{Math.floor}\left(\frac{L_I \times S_{\text{units}}}{T_I}\right)$$
     *(Si $S_{\text{units}} == T_I$, entonces $A_{\text{item}} = L_I$ exactamente).*
   - Para cada asignación $j \in \{1, \dots, k\}$ (ordenadas por `diner.sort_order` ascendente):
     $$\text{base}_j = \text{Math.floor}\left(\frac{L_I \times u_j}{T_I}\right)$$
   - Sea el residuo entero $R = A_{\text{item}} - \sum_{j=1}^{k} \text{base}_j$ (donde $0 \le R < k$). Se suma $+1\text{ COP}$ a los primeros $R$ comensales de la lista ordenada, obteniendo el `assigned_amount_cop` exacto que se persiste en `ConsumptionAssignment`.
   - El monto no asignado de ese ítem es $U_I = L_I - A_{\text{item}}$.
2. **Reparto Informativo de Descuentos Globales y Propina Voluntaria (`split_rule`):**
   - Sea $C_d = \sum \text{assigned\_amount\_cop}(d)$ el consumo de productos asignado al comensal $d$.
   - Si `split_rule === 'PROPORTIONAL'` y $\sum C_d > 0$: la propina `tip_cop` y el descuento global `discount_total_cop` se reparten proporcionalmente al peso de $C_d$, conciliando el residuo de redondeo de $1\text{ COP}$ en el primer comensal con consumo $> 0$.
   - Si `split_rule === 'EQUAL'`: se reparten en partes iguales entre todos los comensales registrados en `AccountDiner` conciliando el residuo de $1\text{ COP}$ en el primero.
   - Si `split_rule === 'UNASSIGNED'`: permanecen en el rubro general sin asignar.
   - En todos los casos se verifica por aserción matemática:
     $$\sum_{d \in \text{Diners}} \text{diner\_total\_cop}(d) + \text{unassigned\_amount\_cop} \equiv \text{DiningAccount.grand\_total\_cop}$$

---

## 4. Matriz de Casos de Prueba Obligatorios (Fase 06)

El desarrollo de la Fase 06 y del MVP completo solo se considera terminado cuando todas las siguientes pruebas automatizadas pasan en verde (`Vitest` + `Supertest`):

### 4.1 Pruebas Unitarias (`packages/shared`)
- **`TC-06-U01` (División Exacta de Plato Compartido entre 3 Personas al Peso — Criterio de Aceptación #12):**
  - Dada una picada de `$50.000 COP` compartida en partes iguales entre `Persona 1`, `Persona 2` y `Persona 3` (`share_units = 1`, `total_item_shares = 3` para cada uno):
  - `consumption-split.calculator.ts` debe calcular `assigned_amount_cop` de `$16.667`, `$16.667` y `$16.666` (suma `$50.000`, `unassigned_amount_cop = 0`).
- **`TC-06-U02` (Asignación Parcial e Invariante con Propina y Descuento):**
  - Dada una cuenta con productos por `$120.000`, descuento de `$10.000` y propina de `$11.000` (`grand_total_cop = 121000`), donde solo se han asignado `$80.000` entre 2 comensales y `$40.000` siguen sin asignar, la suma de los totales por comensal más `unassigned_amount_cop` debe ser exactamente `$121.000` en los 3 modos (`PROPORTIONAL`, `EQUAL`, `UNASSIGNED`).
- **`TC-06-U03` (Validación de Transiciones de `DiningAccount` y `Table`):**
  - Verificar que una cuenta en `'CLOSED'` solo puede pasar a `'REOPENED_ACCOUNTING'` o `'OPEN'`, y que una cuenta en `'REOPENED_ACCOUNTING'` no permite agregar nuevas órdenes de comida (`POST /accounts/:id/orders`), solo operaciones contables de pago/anulación/cierre.

### 4.2 Pruebas de Integración y Concurrencia (`apps/api/test/`)
- **`TC-06-I01` (Índice Único Parcial de Cuenta Abierta y Control de Concurrencia `version`):**
  - Abrir una `DiningAccount` en la mesa `M-01` cambia la mesa a `OCCUPIED`. Intentar abrir una segunda cuenta `OPEN` en `M-01` falla con `409 Conflict`.
  - Si dos meseros leen `version = 1` y envían `POST /api/v1/accounts/:id/orders` con `expected_account_version: 1`, el primero tiene éxito (`version` sube a `2`) y el segundo recibe `409 ACCOUNT_VERSION_CONFLICT` sin duplicar ni sobrescribir totales.
- **`TC-06-I02` (Seguridad en Autopedido QR de Mesa `TABLE_QR` y Confirmación de Mesero — Criterio #12/13):**
  - Con `require_table_pin = true`, enviar un pedido público desde el QR de `M-01` con PIN incorrecto responde `403 INVALID_TABLE_PIN`.
  - Con el PIN correcto, el pedido nace en `status = 'REQUESTED'` y **no** aparece en la cola `GET /api/v1/kitchen/orders`.
  - Cuando el mesero lo confirma (`POST /api/v1/orders/:id/process`), pasa a `'ACCEPTED'`, actualiza el total y `version` de la `DiningAccount` y sus ítems aparecen en el KDS filtrados por estación.
- **`TC-06-I03` (Persistencia e Idempotencia de Distribución Informativa por Persona):**
  - Al guardar mediante `PUT /api/v1/accounts/:id/consumption-distribution` el reparto de la picada de `$50.000` entre 3 personas y luego consultar `GET /api/v1/accounts/:id/consumption-distribution`, los valores leídos desde PostgreSQL mantienen exactamente `$16.667`, `$16.667` y `$16.666` con `$0` sin asignar, sin alterar el `grand_total_cop` de la cuenta.
- **`TC-06-I04` (Prohibición de Cobro en Orden Hija y Cierre Automático por Pago Combinado en Cuenta):**
  - Intentar pagar directamente una orden hija de salón (`POST /api/v1/orders/:orderId/payments/manual`) responde `409 PAY_VIA_DINING_ACCOUNT`.
  - Sobre una `DiningAccount` de `$90.000`, registrar un abono de `$40.000` en `CASH` deja la cuenta en `PARTIALLY_PAID` (`OPEN`) y las órdenes hijas en `UNPAID`. Al registrar los `$50.000` restantes en `POS_TERMINAL`, la cuenta pasa a `PAID` y `CLOSED`, todas sus órdenes hijas activas pasan a `PAID` y la mesa `M-01` pasa a `FREE`.
- **`TC-06-I05` (Cierre Administrativo con Resolución `COURTESY` / `WRITTEN_OFF`):**
  - Intentar cerrar con `POST /api/v1/accounts/:id/close` una cuenta con saldo pendiente sin indicar `resolution_type` responde `409 ACCOUNT_HAS_UNPAID_BALANCE`.
  - Cuando el `BRANCH_MANAGER` la cierra con `resolution_type = 'COURTESY'` y motivo, la cuenta pasa a `CLOSED`, `payment_status = 'COURTESY'`, `uncollected_amount_cop` guarda el saldo no cobrado, sus órdenes hijas pasan a `COURTESY`, la mesa queda `FREE` y se registra en `AuditEvent`.
- **`TC-06-I06` (Reapertura Contable `ACCOUNTING_ONLY` con Mesa Física Reocupada — Criterio #7):**
  - La Cuenta #1 de la mesa `M-01` se cierra (`CLOSED`) con un pago en efectivo mal digitado.
  - Dos minutos después, llega otro grupo a la mesa `M-01` y se abre la Cuenta #2 (`status = 'OPEN'`, mesa `M-01` en `OCCUPIED`).
  - El gerente necesita corregir el pago de la Cuenta #1: si intenta `reopen` con `mode = 'FULL_TABLE'`, recibe `409 TABLE_ALREADY_OCCUPIED`; al ejecutar `reopen` con `mode = 'ACCOUNTING_ONLY'`, la Cuenta #1 pasa a `status = 'REOPENED_ACCOUNTING'` **sin chocar con la Cuenta #2 ni tocar la mesa `M-01`**, anula el pago erróneo (`void`), registra el pago en datáfono correcto y la Cuenta #1 vuelve a cerrarse (`CLOSED`) con éxito.
- **`TC-06-I07` (Extensión de Reportes sin Doble Conteo de Órdenes Hijas — Criterio #8):**
  - En una sucursal con órdenes de domicilio independientes por `$100.000` y una `DiningAccount` de salón por `$80.000` (compuesta por 2 órdenes hijas de `$50.000` y `$30.000`), `GET /api/v1/reports/sales` reporta `gross_billed_total_cop = 180000` (y **nunca** `$260.000`), cumpliendo `is_balanced: true`.
- **`TC-06-I08` (Bloqueo de Desactivación de `dining` por `OpenOperationsChecker` y Aislamiento Multi-Tenant):**
  - Intentar desactivar el módulo `dining` mientras exista una cuenta en `OPEN` o `REOPENED_ACCOUNTING` responde `409 MODULE_HAS_OPEN_OPERATIONS`.
  - Un mesero o gerente del *Restaurante A* jamás puede ver mesas, abrir cuentas, confirmar pedidos QR ni consultar divisiones de cuenta del *Restaurante B*.

---

## 5. Secuencia de Prompts Acotados para Ejecutar la Fase 06 con Gemini

Adjunta siempre `DEFINICION_TECNICA.md` (v2.4.0), `STACK_VERSIONS.md` (v2.4.0) y este documento `FASE_06_SALON_MESAS_Y_DIVISION_INFORMATIVA.md`, ejecutando la puerta manual tras cada paso:

### Paso 6.1: Máquina de Estados de Salón, Calculadora de División por Persona y Esquemas en `packages/shared`
> **Prompt 6.1:** *"Con base en `DEFINICION_TECNICA.md` (v2.4.0), `STACK_VERSIONS.md` (v2.4.0) y `FASE_06_SALON_MESAS_Y_DIVISION_INFORMATIVA.md`, genera en `packages/shared` el archivo `dining.machine.ts`, la calculadora pura `consumption-split.calculator.ts` (con reparto en partes enteras y conciliación exacta a 1 COP), los esquemas y DTOs en `dining.schema.ts` y las pruebas unitarias `TC-06-U01` a `TC-06-U03`. Sin TODOs ni código incompleto."*
- **Puerta Manual 6.1:** Ejecutar `pnpm --filter @restaurante-saas/shared typecheck && pnpm --filter @restaurante-saas/shared test`.

### Paso 6.2: Migración Prisma de Salón (`DiningArea`, `Table`, `DiningAccount`, `AccountDiner`, `ConsumptionAssignment`), Índice Parcial y RLS
> **Prompt 6.2:** *"Actualiza `apps/api/prisma/schema.prisma` y genera la migración SQL para las tablas `dining_areas`, `dining_tables`, `dining_accounts`, `account_diners` y `consumption_assignments`, incluyendo el índice único parcial `idx_unique_open_account_per_table` (`WHERE status = 'OPEN'`), las restricciones `CHECK` y las políticas Row-Level Security (RLS) para el rol `app_runtime`."*
- **Puerta Manual 6.2:** Ejecutar `pnpm --filter @restaurante-saas/api prisma migrate deploy && pnpm --filter @restaurante-saas/api typecheck`.

### Paso 6.3: Módulo Backend `dining` (Áreas, Mesas, Cuentas, Concurrencia `version`, División por Persona, Cierre y `reopen` Dual)
> **Prompt 6.3:** *"Implementa completo en `apps/api/src/modules/dining/` el módulo `dining` con sus controladores y servicios: CRUD de áreas y mesas con generación de `QrCodeLink` (`DINING_TABLE`), plano de mesas en vivo, apertura de `DiningAccount` con `table_session_pin`, adición de comandas validando `expected_account_version`, traslado de mesa, `bill-preview`, persistencia de distribución informativa por persona (`consumption-distribution`), cierre de cuenta (`close` con soporte de `COURTESY`/`WRITTEN_OFF` y sincronización de órdenes hijas) y reapertura (`reopen` soportando los modos `ACCOUNTING_ONLY` y `FULL_TABLE`)."*
- **Puerta Manual 6.3:** Ejecutar `pnpm --filter @restaurante-saas/api typecheck`.

### Paso 6.4: Integración de Autopedido QR en Mesa (`channel.dine_in_qr`), Cobros de Cuenta (`payments.manual`), `OpenOperationsChecker` y Extensión de `reporting` + Tests de Integración
> **Prompt 6.4:** *"Actualiza `OrderingService` para soportar pedidos públicos desde QR de mesa (`origin = 'TABLE_QR'`, validación de PIN y confirmación de mesero `REQUESTED` → `ACCEPTED` sumando a la `DiningAccount` y enviando al KDS), extiende `ManualPaymentsService` para cobros y anulaciones sobre `DiningAccount` (`POST /api/v1/accounts/:accountId/payments/manual`), conecta `OpenOperationsChecker` para bloquear la desactivación de `dining` si hay cuentas en `OPEN` o `REOPENED_ACCOUNTING`, extiende `ReportingService` para consolidar `DiningAccount` sin doble conteo de órdenes hijas, e implementa las pruebas de integración `TC-06-I01` a `TC-06-I08` en `apps/api/test/`."*
- **Puerta Manual 6.4:** Ejecutar `pnpm --filter @restaurante-saas/api typecheck && pnpm --filter @restaurante-saas/api test`.

### Paso 6.5: Consola Frontend POS de Salón (`dining-pos`), Calculadora Visual por Persona, Pre-Cuenta Térmica y Vista QR de Mesa (`apps/web`)
> **Prompt 6.5:** *"Implementa en `apps/web` la consola completa de Salón (`src/features/dining-pos/`): configuración de áreas/mesas y descarga de QR por mesa, plano interactivo de mesas con alertas SSE de solicitudes QR, toma de comandas de mesero, cajón interactivo de Distribución Informativa del Consumo por Persona (`consumption-split-drawer.tsx`), modal de cobro/resolución/reapertura contable (`ACCOUNTING_ONLY` y `FULL_TABLE`), extensión de `public-storefront` para autopedido con PIN en mesa y extensión de `print-receipt.ts` para imprimir la pre-cuenta térmica de 58mm/80mm con el desglose informativo por persona y la leyenda fiscal DIAN."*
- **Puerta Manual 6.5 (Cierre Definitivo de la Fase 06 y del MVP Completo):** Ejecutar en la raíz del monorepo:
  ```bash
  pnpm install
  pnpm turbo run typecheck
  pnpm turbo run test
  pnpm turbo run build
  ```