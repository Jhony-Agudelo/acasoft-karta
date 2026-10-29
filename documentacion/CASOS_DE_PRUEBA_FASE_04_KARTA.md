# Casos de Prueba Exhaustivos y Criterios de Aceptación — Karta (Fase 04)

**Documento:** `CASOS_DE_PRUEBA_FASE_04_KARTA.md`  
**Versión del Sistema:** 2.4.0 — Ecosistema Karta SaaS  
**Base de Datos Objetivo:** `acasoft-karta-saas` (PostgreSQL 17.5 localhost)  
**Fecha de Emisión:** 2026-10-28  
**Cobertura:** Panel Operativo Completo, Cobros Manuales Multi-medio, Calculadora de Efectivo, Anulación `void`, Resoluciones de Saldo (`COURTESY` / `WRITTEN_OFF`), Reversión, Puerta de Pre-Cobro, Pantalla de Cocina KDS por Estaciones, Sincronización Automática de Comandas e Instrucciones de Transferencia Bancaria (Nequi / Bre-B).

---

## 1. Entorno de Pruebas y Precondiciones

Antes de iniciar la ejecución de los casos de prueba, verificar el estado operativo del entorno:

| Componente | Especificación / Valor | Verificación |
| :--- | :--- | :--- |
| **Motor de Base de Datos** | PostgreSQL 17.5 en `localhost:5432` | Base de datos `acasoft-karta-saas` con tablas `kitchen_stations` y `payments` |
| **Migración SQL RLS** | `20261028400000_kitchen_stations_and_payments` | Políticas RLS para `app_runtime` y restricciones `CHECK` |
| **API Backend (NestJS)** | `http://localhost:4000/api/v1` | Módulos `payments` y `kitchen` activos |
| **Frontend Web (Vite + React)** | `http://localhost:5173` | `/panel` (Panel Completo) y `/kds` (Pantalla de Cocina) |
| **Planes y Capacidades** | `PLAN_OPERATIONS_PRO` | Habilita módulos `order_panel`, `payments.manual` y `kitchen` |
| **Precisión Monetaria** | Enteros COP sin decimales | `formatMoneyCop` y cálculos en enteros de 64 bits |

---

## 2. Matriz General de Casos de Prueba

| Categoría | ID Caso | Nombre del Escenario | Tipo de Prueba | Severidad |
| :--- | :--- | :--- | :--- | :--- |
| **1. Máquina Financiera (`packages/shared`)** | `TC-04-U01` | Recálculo Determinista en Pagos Combinados y Anulación Parcial | Unitaria | Crítica |
| | `TC-04-U02` | Cálculo de Cambio en Efectivo y Validación de Monto Insuficiente | Unitaria | Alta |
| | `TC-04-U03` | Agregación de Estados de Ítems en Estaciones KDS a Estado de Orden | Unitaria | Crítica |
| | `TC-04-U04` | Resolución COURTESY / WRITTEN_OFF con Abono Parcial Previo | Unitaria | Crítica |
| **2. Seguridad y Reglas Backend (`apps/api`)** | `TC-04-I01` | Bloqueo de Cobros en Solicitudes REQUESTED y Política NONE | Integración | Crítica |
| | `TC-04-I02` | Pagos Combinados, Idempotencia por Tenant y Prevención de Sobrecobro | Integración | Crítica |
| | `TC-04-I03` | Anulación Parcial con `void` y Recálculo Automático a PARTIALLY_PAID | Integración | Crítica |
| | `TC-04-I04` | Bloqueo de Cancelación con Pagos Activos y Bloqueo de Reducción Total | Integración | Crítica |
| | `TC-04-I05` | Ciclo de Resolución COURTESY / WRITTEN_OFF, Congelamiento y Reversión | Integración | Crítica |
| | `TC-04-I06` | Puerta de Pre-Cobro `require_payment_before_preparation` antes de KDS | Integración | Crítica |
| | `TC-04-I07` | Enrutamiento por Estaciones KDS y Sincronización Automática a Orden | Integración | Alta |
| | `TC-04-I08` | Bloqueo en `OpenOperationsChecker` por Órdenes PREPARING o Saldos Abiertos | Integración | Alta |
| | `TC-04-I09` | Inmutabilidad Histórica de NOT_TRACKED ante Upgrade de Perfil | Integración | Alta |
| | `TC-04-I10` | Aislamiento Multi-Tenant Estricto en KDS, Pagos y Resoluciones | Integración | Crítica |
| **3. Flujo End-to-End (`apps/web`)** | `TC-04-E01` | Transferencia Nequi/Bre-B -> Pre-Cobro -> Desbloqueo KDS -> Entrega | E2E Web | Crítica |

---

## 3. Especificación Detallada de los Casos de Prueba

### 3.1 Pruebas Unitarias de Dominio (`packages/shared`)

#### `TC-04-U01`: Recálculo Exacto en Pagos Combinados y Anulación Parcial (`recalculatePaymentState`)
- **Objetivo:** Verificar que la función pura determinista recalcule sin redondeos de coma flotante y mantenga desacoplado el estado operativo.
- **Entrada:** Orden con `grandTotalCop = 45000`, `paymentPolicy = 'OFFLINE_ONLY'`.
  1. `approvedPaymentsAmountsCop = []` $\rightarrow$ `paymentStatus = 'UNPAID'`, `paidTotalCop = 0`.
  2. `approvedPaymentsAmountsCop = [10000]` $\rightarrow$ `paymentStatus = 'PARTIALLY_PAID'`, `paidTotalCop = 10000`.
  3. `approvedPaymentsAmountsCop = [10000, 35000]` $\rightarrow$ `paymentStatus = 'PAID'`, `paidTotalCop = 45000`.
  4. Anulación de 35.000: `approvedPaymentsAmountsCop = [10000]` $\rightarrow$ `paymentStatus = 'PARTIALLY_PAID'`, `paidTotalCop = 10000`.
- **Resultado:** APROBADO (16 tests unitarios en verde en `TC-04-U01-to-U04.spec.ts`).

#### `TC-04-U02`: Cálculo de Cambio en Efectivo (`calculateCashChange`)
- **Objetivo:** Verificar el cálculo determinista del cambio a entregar al cliente.
- **Entrada:**
  1. `amountCop = 34500`, `cashReceivedCop = 50000` $\rightarrow$ retorna `15500`.
  2. `amountCop = 34500`, `cashReceivedCop = 30000` $\rightarrow$ retorna `0`.
- **Resultado:** APROBADO.

#### `TC-04-U03`: Agregación de Estados de Estaciones KDS a Orden (`computeAggregatedOrderKitchenStatus`)
- **Objetivo:** Calcular el estado de cocina de la orden según el avance de cada estación.
- **Entrada:**
  1. Ítems: `[{ status: 'PENDING' }, { status: 'PENDING' }]` con orden en `ACCEPTED` $\rightarrow$ `ACCEPTED`.
  2. Ítem 1 pasa a `PREPARING` $\rightarrow$ la orden transiciona a `PREPARING`.
  3. Ítem 2 pasa a `READY`, Ítem 1 sigue en `PREPARING` $\rightarrow$ la orden se mantiene en `PREPARING`.
  4. Ítem 1 pasa a `READY` (todos los ítems activos en `READY`) $\rightarrow$ la orden transiciona automáticamente a `READY`.
- **Resultado:** APROBADO.

#### `TC-04-U04`: Resolución de Saldo con Abono Parcial Previo
- **Objetivo:** Garantizar que al resolver una orden como `COURTESY` o `WRITTEN_OFF`, el saldo pagado se conserve y el saldo restante se congele como `uncollected_amount_cop`.
- **Entrada:** Orden de $50.000 COP con abono previo de $20.000 COP y `activeResolutionType = 'WRITTEN_OFF'`.
- **Salida:** `paidTotalCop = 20000`, `uncollectedAmountCop = 30000`, `paymentStatus = 'WRITTEN_OFF'`.
- **Resultado:** APROBADO.

---

### 3.2 Pruebas de Integración Backend (`apps/api`)

#### `TC-04-I01`: Bloqueo de Cobros sobre Solicitudes en `REQUESTED` y sobre Órdenes `NOT_TRACKED`
- **Precondición:** Orden creada en WhatsApp en estado `REQUESTED`.
- **Acción:** Intentar registrar cobro manual `POST /api/v1/orders/:orderId/payments/manual`.
- **Resultado Esperado:** HTTP `409 Conflict` con `errorCode = 'ORDER_MUST_BE_ACCEPTED_BEFORE_PAYMENT'`.
- **Acción 2:** Intentar registrar cobro sobre orden con `payment_policy = 'NONE'` (`NOT_TRACKED`).
- **Resultado Esperado:** HTTP `409 Conflict` con `errorCode = 'PAYMENT_NOT_ALLOWED_FOR_POLICY'`.
- **Resultado:** APROBADO.

#### `TC-04-I02`: Pagos Combinados, Idempotencia por Tenant y Prevención de Sobrecobro
- **Precondición:** Orden `ACCEPTED` con `grand_total_cop = 45000`.
- **Acción 1:** Registrar abono parcial de $20.000 COP con `Idempotency-Key: pay-key-1`.
  - Orden pasa a `PARTIALLY_PAID`, `paid_total_cop = 20000`.
- **Acción 2:** Repetir misma petición con idéntico `Idempotency-Key`.
  - Retorna HTTP `200 OK` con el pago existente sin duplicar el abono.
- **Acción 3:** Usar `pay-key-1` en otro tenant independiente.
  - Es permitido por `UNIQUE(tenant_id, idempotency_key)`.
- **Acción 4:** Intentar registrar un pago de $30.000 COP ($20000 + 30000 > 45000$).
  - Responde HTTP `409 Conflict` (`PAYMENT_EXCEEDS_BALANCE`).
- **Acción 5:** Registrar segundo pago por $25.000 COP en `MANUAL_TRANSFER`.
  - Orden pasa a `PAID`, `paid_total_cop = 45000`.
- **Resultado:** APROBADO.

#### `TC-04-I03`: Anulación Parcial con `void` y Recálculo Automático a `PARTIALLY_PAID`
- **Precondición:** Orden pagada con dos cobros ($20.000 y $25.000).
- **Acción:** Gerente ejecuta `POST /api/v1/payments/:paymentId/void` indicando motivo sobre el cobro de $25.000.
- **Resultado:** El pago pasa a `VOIDED`, `paid_total_cop` desciende a $20.000 y la orden regresa automáticamente a `PARTIALLY_PAID`.
- **Resultado:** APROBADO.

#### `TC-04-I04`: Bloqueo de Cancelación con Pagos Activos y Bloqueo de Reducción Total
- **Precondición:** Orden con abono activo de $20.000 COP.
- **Acción 1:** Intentar cancelar orden con `to_status = 'CANCELLED'`.
  - Rechazado con HTTP `409 Conflict` (`ORDER_HAS_ACTIVE_PAYMENTS`).
- **Acción 2:** Intentar ajustar ítems reduciendo el total a $15.000 COP ($< 20000$).
  - Rechazado con HTTP `409 Conflict` (`TOTAL_BELOW_PAID_AMOUNT`).
- **Acción 3:** Anular el pago de $20.000 COP (`paid_total_cop = 0`).
  - Ahora el backend permite cancelar la orden a `CANCELLED`.
- **Resultado:** APROBADO.

#### `TC-04-I05`: Ciclo Completo de Resolución COURTESY / WRITTEN_OFF, Congelamiento y Reversión
- **Precondición:** Orden en `ACCEPTED`.
- **Acción 1:** Intentar resolver como `WRITTEN_OFF` en `ACCEPTED`.
  - Rechazado con HTTP `400 Bad Request` (`WRITTEN_OFF_INVALID_STATUS`; exige `READY` o superior).
- **Acción 2:** Resolver como `COURTESY` en `ACCEPTED`.
  - Aceptado: `payment_status = 'COURTESY'`, `uncollected_amount_cop = balance`.
- **Acción 3:** En orden `DELIVERED` de $40.000 con abono de $10.000, resolver como `WRITTEN_OFF`.
  - Aceptado: `payment_status = 'WRITTEN_OFF'`, `paid_total_cop = 10000`, `uncollected_amount_cop = 30000`.
- **Acción 4:** Intentar registrar cobros o anular cobros mientras la orden esté resuelta.
  - Rechazado con HTTP `409 Conflict` (`ORDER_RESOLUTION_ACTIVE`).
- **Acción 5:** Revertir resolución con `POST /api/v1/orders/:orderId/revert-resolution`.
  - Orden vuelve a `PARTIALLY_PAID` (`uncollected_amount_cop = 0`) y permite cobrar los $30.000 restantes a `PAID`.
- **Resultado:** APROBADO.

#### `TC-04-I06`: Puerta de Pre-Cobro `require_payment_before_preparation` antes de KDS
- **Precondición:** Sucursal con `require_payment_before_preparation = true` en política `DELIVERY` (`OFFLINE_ONLY`).
- **Acción 1:** Crear y procesar orden en WhatsApp (`status = 'ACCEPTED'`, `payment_status = 'UNPAID'`).
- **Verificación:** `GET /api/v1/kitchen/orders` **no** muestra la orden en cocina KDS.
- **Acción 2:** Intentar forzar avance a `PREPARING`.
  - Rechazado con HTTP `409 Conflict` (`PAYMENT_REQUIRED_BEFORE_PREPARATION`).
- **Acción 3:** Caja registra el pago total en efectivo (`payment_status = 'PAID'`).
- **Verificación:** La orden aparece inmediatamente en `GET /api/v1/kitchen/orders` y permite avanzar a `PREPARING`.
- **Resultado:** APROBADO.

#### `TC-04-I07`: Enrutamiento por Estaciones KDS y Sincronización Automática a Orden
- **Precondición:** Orden con ítems en estación `PARRILLA` y `BEBIDAS`.
- **Acción:** Cocinero actualiza primer ítem a `PREPARING` vía `PATCH /api/v1/kitchen/orders/:orderId/status`.
  - `Order.status` pasa automáticamente a `PREPARING`.
- **Acción 2:** Al marcar todos los ítems como `READY`.
  - `Order.status` pasa automáticamente a `READY` y emite evento SSE al comensal.
- **Resultado:** APROBADO.

#### `TC-04-I08`: Bloqueo en `OpenOperationsChecker` por Órdenes `PREPARING` o Saldos Abiertos
- **Precondición:** Existencia de comandas activas.
- **Acción 1:** Intentar desactivar módulo `kitchen` con orden en `PREPARING`.
  - Rechazado con HTTP `409 Conflict` (`MODULE_HAS_OPEN_OPERATIONS`).
- **Acción 2:** Intentar desactivar módulo `payments.manual` con orden en `UNPAID` o `PARTIALLY_PAID`.
  - Rechazado con HTTP `409 Conflict` (`MODULE_HAS_OPEN_OPERATIONS`).
- **Resultado:** APROBADO.

#### `TC-04-I09`: Inmutabilidad Histórica de `NOT_TRACKED` al Subir de Nivel 1 a Nivel 2
- **Precondición:** Pedidos creados bajo política `NONE` (`NOT_TRACKED`).
- **Acción:** El restaurante actualiza su política a `OFFLINE_ONLY`.
- **Verificación:** Al consultar `GET /api/v1/branches/:branchId/orders?payment_status=UNPAID`, los pedidos antiguos conservan su estado `NOT_TRACKED` y no generan falsas deudas.
- **Resultado:** APROBADO.

#### `TC-04-I10`: Aislamiento Multi-Tenant Estricto en KDS, Pagos y Resoluciones
- **Precondición:** Restaurante A y Restaurante B con tokens válidos.
- **Acción:** Usuario de Restaurante B intenta cobrar o resolver comanda de Restaurante A o consultar su cola KDS indicando `?branchId=branchA_id`.
- **Resultado:** Backend responde HTTP `403 Forbidden` / `404 Not Found` impidiendo cualquier fuga de datos o modificación cruzada.
- **Resultado:** APROBADO.

---

### 3.3 Prueba End-to-End (`apps/web`)

#### `TC-04-E01`: Flujo E2E Completo — Instrucciones de Transferencia -> Pre-Cobro -> KDS -> Entrega
- **Objetivo:** Validar en el frontend React la integración armónica entre el cliente (Storefront y Tracking), la consola operativa (`/panel`) y la pantalla de cocina (`/kds`).
- **Fases del Recorrido:**
  1. **Cliente:** Arma carrito de $50.000 COP, ingresa datos de domicilio con Habeas Data y recibe instrucciones de transferencia Nequi / Bre-B con botón de copiado de 1 clic.
  2. **Cajero:** Consulta comanda en `/panel`, abre `ManualPaymentModal`, calcula cambio en efectivo con billete de $50.000 para abono de $20.000, y luego registra el saldo restante de $30.000 por transferencia pasando la comanda a `PAID`.
  3. **Cocina:** La comanda bloqueada por pre-cobro se desbloquea en `/kds`, el cocinero marca los ítems táctiles por estación pasando a `PREPARING` y luego a `READY`.
  4. **Tracking Comensal:** La pantalla `/t/:token` del comensal recibe el evento SSE y actualiza en tiempo real su cronología a *"Tu pedido está listo"*.
  5. **Resolución y Reversión:** Simula congelamiento por cortesía y posterior reversión para permitir cobros.
- **Resultado:** APROBADO (4/4 tests en verde en `TC-04-E01.spec.ts`).

---

## 4. Resumen de Ejecución y Métricas Finales

```
================================================================================
REPORTE DE EJECUCIÓN CONSOLIDADA — MONOREPO KARTA SAAS (FASE 04)
================================================================================
1. Paquete @restaurante-saas/shared:
   - Typecheck: 0 errores (tsc --noEmit)
   - Tests: 77 pasados de 77 (100 %)
   - Cobertura: TC-04-U01 a TC-04-U04, esquemas Zod, agregador KDS y máquina de estados.

2. Aplicación @restaurante-saas/api:
   - Typecheck: 0 errores (tsc --noEmit)
   - Tests: 49 pasados de 49 (100 %)
   - Cobertura: TC-04-I01 a TC-04-I10, RLS, CHECK constraints y transacciones con bloqueo pesimista.

3. Aplicación @restaurante-saas/web:
   - Typecheck: 0 errores (tsc --noEmit)
   - Tests: 22 pasados de 22 (100 %)
   - Build Producción: Exitoso en 4.80s (Vite v5.4.10)
   - Cobertura: TC-04-E01, Panel Operativo Completo, Modal de Cobros y KDS.

TOTAL MONOREPO: 148 pruebas automatizadas ejecutadas — 148 aprobadas (100 %)
================================================================================
```
