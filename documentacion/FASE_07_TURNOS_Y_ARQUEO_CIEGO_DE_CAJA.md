# Fase 07: Gestión de Turnos, Movimientos Menores y Arqueo Ciego de Caja (`payments.cash_shifts`)

**Documento:** `FASE_07_TURNOS_Y_ARQUEO_CIEGO_DE_CAJA.md`  
**Versión:** 2.5.0 — Alineado con `DEFINICION_TECNICA.md` (v2.5.0) y `STACK_VERSIONS.md` (v2.4.0)  
**Fecha:** 2026-11-03  
**Prerrequisitos:** `FASE_01`, `FASE_02`, `FASE_03A`, `FASE_03B`, `FASE_04`, `FASE_05` y `FASE_06` completadas y con todas sus pruebas unitarias y de integración en verde.  
**Objetivo de la Fase:** Implementar el módulo especializado de **Gestión de Turnos y Arqueo Ciego de Caja (`payments.cash_shifts`)**, permitiendo a los restaurantes llevar el control auditado de gaveta de efectivo: apertura de turnos con base inicial, registro de entradas y salidas menores de efectivo (pago a proveedores de paso, recarga de sencillo, gastos menores de caja), vinculación obligatoria de cobros `CASH` al turno activo, arqueo y cierre ciego (`BLIND_CLOSE`) para evitar que el cajero acomode el conteo físico, y cálculo determinista de saldos esperados y diferencias para auditoría gerencial.

---

## 1. Reglas de Ingeniería, Integridad Financiera y Seguridad en Turnos de Caja

1. **Política de Cero Código Incompleto (`Zero-Placeholder Policy`):**
   - Todo archivo entregado debe ser 100 % funcional, tipado y compilable. Prohibidos `// TODO` o implementaciones vacías.
2. **Unicidad de Turno Abierto por Sucursal:**
   - Solo puede existir **un único turno en estado `OPEN` por sucursal** a la vez, garantizado mediante un índice único parcial en PostgreSQL:
     ```sql
     CREATE UNIQUE INDEX idx_unique_open_shift_per_branch ON cash_shifts(tenant_id, branch_id) WHERE status = 'OPEN';
     ```
3. **Condición de Cobro en Efectivo:**
   - Mientras `payments.cash_shifts` esté activo en la sucursal, el backend exige que exista un `CashShift` en estado `OPEN` para registrar cualquier cobro con `method = 'CASH'` (`409 OPEN_CASH_SHIFT_REQUIRED`) y vincula `Payment.cash_shift_id = shift.id`.
   - Si el módulo está desactivado, `Payment.cash_shift_id` permanece en `NULL`.
4. **Anulaciones Justificadas (`void`) en Efectivo:**
   - Solo se permite anular un cobro con `method = 'CASH'` si el pago pertenece al turno que actualmente está `OPEN` en la sucursal. Si el turno ya fue cerrado, la anulación se rechaza con `409 CASH_SHIFT_ALREADY_CLOSED`.
5. **Ecuación Determinista de Efectivo Esperado:**
   - Dado que `Payment.amount_cop` en los pagos `CASH` aprobados representa el efectivo neto retenido tras entregar cambio, el saldo físico esperado en gaveta al cierre es:
     $$\text{expected\_cash\_cop} = \text{opening\_cash\_cop} + \sum \text{Payment.amount\_cop}_{\text{CASH, APPROVED}} + \sum \text{CashShiftMovement}_{\text{CASH\_IN}} - \sum \text{CashShiftMovement}_{\text{CASH\_OUT}}$$
6. **Arqueo Ciego Estricto (`BLIND_CLOSE`):**
   - Durante la operación del turno y en el modal de cierre, el rol `CASHIER` **nunca ve** `expected_cash_cop` ni las ventas acumuladas en efectivo.
   - Al cerrar (`POST /api/v1/cash-shifts/:shiftId/close`), el cajero cuenta físicamente el dinero en caja y digita `declared_cash_cop`. El servidor calcula y congela `expected_cash_cop` y `difference_cop = declared_cash_cop - expected_cash_cop`.

---

## 2. Modelado de Datos Relacional (`PostgreSQL 16` + `Prisma`)

### 2.1 Modelo `CashShift` (`cash_shifts`)
- `id (UUID PK)`
- `tenant_id (UUID FK)`
- `branch_id (UUID FK)`
- `shift_code (VARCHAR — ej. #T-001)`
- `status (VARCHAR — OPEN | CLOSED)`
- `opened_by (UUID FK)`
- `opened_at (TIMESTAMPTZ)`
- `opening_cash_cop (INT NOT NULL CHECK (opening_cash_cop >= 0))`
- `cash_sales_cop (INT DEFAULT 0)`
- `cash_in_total_cop (INT DEFAULT 0)`
- `cash_out_total_cop (INT DEFAULT 0)`
- `expected_cash_cop (INT NULL)`
- `declared_cash_cop (INT NULL CHECK (declared_cash_cop IS NULL OR declared_cash_cop >= 0))`
- `difference_cop (INT NULL)`
- `denominations_snapshot_json (JSONB NULL)`
- `closed_by (UUID FK NULL)`
- `closed_at (TIMESTAMPTZ NULL)`
- `closing_notes (TEXT NULL)`

### 2.2 Modelo `CashShiftMovement` (`cash_shift_movements`)
- `id (UUID PK)`
- `tenant_id (UUID FK)`
- `branch_id (UUID FK)`
- `shift_id (UUID FK)`
- `type (VARCHAR — CASH_IN | CASH_OUT)`
- `category (VARCHAR — SUPPLIER_PAYMENT | PETTY_EXPENSE | CHANGE_FUND | OTHER)`
- `amount_cop (INT NOT NULL CHECK (amount_cop > 0))`
- `reason (TEXT NOT NULL)`
- `reference_doc (VARCHAR NULL)`
- `created_by (UUID FK)`
- `created_at (TIMESTAMPTZ)`

### 2.3 Relación en `Payment`
- Agregar columna `cash_shift_id (UUID FK NULL)` apuntando a `cash_shifts(id)` con eliminación restringida (`onDelete: Restrict`).

---

## 3. Endpoints de la API REST (`/api/v1`)

1. `GET /api/v1/branches/:branchId/cash-shifts/current` — Consulta el turno activo de la sucursal (con máscara de datos para rol `CASHIER`).
2. `POST /api/v1/branches/:branchId/cash-shifts/open` — Abre un nuevo turno registrando `opening_cash_cop >= 0`.
3. `POST /api/v1/cash-shifts/:shiftId/movements` — Registra una entrada (`CASH_IN`) o salida menor / pago a proveedor (`CASH_OUT`).
4. `POST /api/v1/cash-shifts/:shiftId/close` — Ejecuta el cierre ciego recibiendo `declared_cash_cop`, calculando `difference_cop` y cerrando el turno.
5. `GET /api/v1/branches/:branchId/cash-shifts` — Historial paginado de turnos y arqueos (exclusivo para `BRANCH_MANAGER`, `TENANT_ADMIN`, `PLATFORM_ADMIN`).

---

## 4. Componentes de Interfaz de Usuario (`apps/web`)

1. **`CashShiftStatusBadge`**: Widget en barra superior y cabecera de caja que muestra el estado del turno (`#T-001 Abierto` o `Sin Turno Abierto`).
2. **`OpenShiftModal`**: Diálogo para registrar la base de efectivo inicial e iniciar la jornada de caja.
3. **`ShiftMovementModal`**: Diálogo para registrar entradas de sencillo o salidas a proveedores de paso con selección de categoría y soporte.
4. **`CloseShiftModal` (Arqueo Ciego)**: Diálogo con calculadora de billetes y monedas colombianas ($100k, $50k, $20k, $10k, $5k, $2k, $1k, $500, $200, $100, $50) para ingresar el conteo físico sin exponer las ventas ni el saldo esperado.
5. **`CashShiftsHistoryPage`**: Vista de auditoría gerencial con comparativa de declared vs. expected, diferencias resaltadas y detalle de movimientos.

