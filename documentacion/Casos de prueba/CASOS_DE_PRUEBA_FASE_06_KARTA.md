# Casos de Prueba — Fase 06: Operación de Salón, Plano de Mesas, Autopedido QR Confirmado, Distribución Informativa por Persona y Extensión de Reportes

Este documento registra la especificación, ejecución y verificación exhaustiva de los casos de prueba de la **Fase 06**, correspondiente al cierre del **Nivel 3 (`DINING_ROOM` y `ENTERPRISE_MULTI`)** de la plataforma **Karta Gastronómico (v2.4.0)**, cubriendo la gestión integral del salón de mesas, pedidos de mesero y autopedido QR de clientes, la distribución informativa del consumo por persona con conciliación matemática exacta al peso, el aislamiento contable de órdenes hijas, y la extensión consolidada de reportes financieros.

---

## 1. Resumen Ejecutivo de Ejecución

| Suite de Pruebas | Alcance / Módulo | Total Pruebas | Exitosas | Fallidas | Estado |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Unitarias (`packages/shared`)** | `dining.machine`, `consumption-split.calculator` & `thermal-receipt.formatter` | 10 | 10 | 0 | **APROBADO** |
| **Integración (`apps/api`)** | Módulo de Salón (`TC-06-I01` a `TC-06-I08`) | 8 | 8 | 0 | **APROBADO** |
| **Frontend E2E (`apps/web`)** | Plano de Mesas, Pre-cuentas, Split Drawer y Reportes (`TC-06-E01`) | 6 | 6 | 0 | **APROBADO** |
| **Monorepo Consolidado** | `turbo run test` (todos los paquetes) | **192** | **192** | 0 | **APROBADO** |

---

## 2. Pruebas Unitarias (`packages/shared`)

### `TC-06-U01`: Máquina de Estados de Salón y Transiciones Válidas
- **Archivo:** `packages/shared/test/TC-06-U01-to-U03.spec.ts`
- **Componentes:** `canTransitionTableStatus`, `canTransitionDiningAccountStatus`, `canDineInOrderBeAdded`
- **Propósito:** Validar formalmente el ciclo de vida de mesas (`FREE`, `OCCUPIED`, `BILL_PRINTED`, `REOPENED_ACCOUNTING`, `CLEANING_MAINTENANCE`) y cuentas de salón (`OPEN`, `BILL_PRINTED`, `PAID`, `CLOSED`, `REOPENED`), evitando aperturas dobles o cobros fuera de orden.
- **Casos Evaluados:**
  - Mesa libre (`FREE`): transita válidamente a `OCCUPIED` o `CLEANING_MAINTENANCE`, y rechaza `BILL_PRINTED` o `REOPENED_ACCOUNTING`.
  - Mesa ocupada (`OCCUPIED`): transita a `BILL_PRINTED` o `FREE`.
  - Cuenta en `OPEN`: permite adición de órdenes hijas y transita a `BILL_PRINTED`.
  - Cuenta en `BILL_PRINTED`: transita a `PAID` al liquidar abonos completos.
  - Cuenta en `PAID`: transita a `CLOSED` liberando la mesa a `CLEANING_MAINTENANCE` o `FREE`.
  - Reapertura (`REOPENED`): transita válidamente según el modo `ACCOUNTING_ONLY` (conserva mesa `REOPENED_ACCOUNTING`) o `FULL_TABLE` (regresa mesa a `OCCUPIED`).
- **Resultado:** **Aprobado**. 100 % de transiciones ilegales bloqueadas determinísticamente.

---

### `TC-06-U02`: Motor de Distribución Informativa por Persona y Conciliación Exacta al Peso (COP)
- **Archivo:** `packages/shared/test/TC-06-U01-to-U03.spec.ts`
- **Componente:** `calculateConsumptionDistribution` / `calculateConsumptionSplit`
- **Propósito:** Comprobar las 3 reglas de distribución informativa (`EQUAL_PARTS`, `CONSUMPTION_BASED`, `PROPORTIONAL`), la asignación proporcional de propinas voluntarias (Ley 1935 de 2019) y descuentos comerciales, y el ajuste determinista de residuos de 1 COP al primer comensal.
- **Casos Evaluados:**
  - **Partes Iguales (`EQUAL_PARTS`):** Cuenta de $100.000 entre 3 comensales ($33.333,33 c/u). Comensal 1 recibe $33.334 y comensales 2 y 3 reciben $33.333. Suma exacta: $100.000 COP.
  - **Basado en Consumo (`CONSUMPTION_BASED`):** Asignación de ítems específicos por comensal, propina del 10 % imputada según la participación de consumo, e ítems no asignados computados como saldo flotante remanente.
  - **Proporcional (`PROPORTIONAL`):** Reparto ponderado según subtotales personalizados con descuento global prorrateado.
  - **Invariante Matemática:** $\sum \text{diner\_total\_cop} + \text{unassigned\_amount\_cop} \equiv \text{grand\_total\_cop}$ verificada en el 100 % de los casos con $0$ COP de discrepancia.
- **Resultado:** **Aprobado**.

---

### `TC-06-U03`: Formateador Térmico de Pre-Cuenta de Salón con Leyenda Legal DIAN
- **Archivo:** `packages/shared/test/TC-06-U01-to-U03.spec.ts`
- **Componente:** `formatDiningPreCuentaText`
- **Propósito:** Generar el ticket monospacio de pre-cuenta para anchos térmicos de 58 mm (32 columnas) y 80 mm (42 columnas) incluyendo el desglose de productos consolidados de la mesa, propina voluntaria sugerida, la distribución sugerida por persona y la leyenda legal obligatoria exigida para pre-recibos de salón.
- **Casos Evaluados:**
  - Ancho 58 mm: ninguna línea sobrepasa 32 caracteres.
  - Ancho 80 mm: ninguna línea sobrepasa 42 caracteres.
  - Inclusión de encabezado con nombre de sucursal, identificador de mesa (`MESA: M-04`), código de cuenta (`#C-M-04-301`) y PIN de sesión.
  - Inclusión obligatoria de la advertencia legal:
    `"DOCUMENTO INFORMATIVO DE SALÓN / PRE-CUENTA — NO ES FACTURA DE VENTA NI DOCUMENTO EQUIVALENTE DIAN (Un solo cobro consolidado en caja)"`.
  - Resumen detallado de ítems por comensal en ticket.
- **Resultado:** **Aprobado**.

---

## 3. Pruebas de Integración Backend (`apps/api`)

### `TC-06-I01`: Apertura de Mesa, Restricción de Cuenta Única y Bloqueo de Concurrencia
- **Archivo:** `apps/api/test/TC-06-I01-to-I08.spec.ts`
- **Escenario:** Creación de un área (`Salón Principal`) y mesa (`M-01`). Ejecución de 2 aperturas concurrentes simultáneas (`POST /api/v1/dining/tables/:tableId/open-account`) con promesas paralelas (`Promise.all`).
- **Criterios de Aceptación:**
  - Exactamente una de las dos peticiones tiene éxito (`201 Created`), asignando un PIN de sesión único de 4 dígitos.
  - La segunda petición es rechazada de inmediato con `409 Conflict (TABLE_ALREADY_HAS_OPEN_ACCOUNT)` gracias al índice parcial único de PostgreSQL (`idx_unique_open_account_per_table ON dining_accounts(tenant_id, branch_id, table_id) WHERE status = 'OPEN'`).
  - La mesa transita limpiamente a `OCCUPIED`.
- **Resultado:** **Aprobado**.

---

### `TC-06-I02`: Adición de Órdenes a Cuenta de Salón y Bloqueo de Cobro Directo sobre Órdenes Hijas
- **Archivo:** `apps/api/test/TC-06-I01-to-I08.spec.ts`
- **Escenario:** El mesero agrega 2 pedidos sucesivos a la cuenta abierta de la mesa `M-01` ($45.000 y $30.000). Se intenta ejecutar un cobro manual directo sobre la orden hija individual (`POST /api/v1/orders/:orderId/payments/manual`).
- **Criterios de Aceptación:**
  - Las órdenes se vinculan con `dining_account_id` y `channel = 'DINE_IN'`.
  - El cobro individual directo sobre la orden hija es **bloqueado tajantemente** con error HTTP `409 PAY_VIA_DINING_ACCOUNT`.
  - El total acumulado de la cuenta de salón se incrementa a $75.000 COP con `account_version` actualizado optimistamente.
- **Resultado:** **Aprobado**.

---

### `TC-06-I03`: Autopedido QR en Mesa (`DINE_IN`) con Validación de PIN de Sesión y Confirmación en 1 Tap
- **Archivo:** `apps/api/test/TC-06-I01-to-I08.spec.ts`
- **Escenario:** Un comensal escanea el código QR de la mesa `M-01` e ingresa al storefront público (`/t/:tenantSlug/menu?table=M-01`). Envía un pedido en canal `DINE_IN`.
- **Criterios de Aceptación:**
  - Si el comensal no suministra el PIN de sesión correcto de la mesa, el pedido es rechazado con `403 INVALID_OR_EXPIRED_TABLE_PIN`.
  - Con el PIN correcto, el pedido se crea en estado inicial `REQUESTED` con bandera `is_table_qr_order = true`.
  - El pedido aparece en la bandeja de "Órdenes QR Pendientes" del panel de salón del mesero/cajero.
  - Al pulsar "Confirmar en 1 tap" (`POST /api/v1/dining/accounts/:accountId/confirm-qr-order`), el pedido transita a `ACCEPTED` y se integra atómicamente a la comanda de cocina (KDS) y a la cuenta de la mesa.
- **Resultado:** **Aprobado**.

---

### `TC-06-I04`: Transferencia Atómica de Mesa
- **Archivo:** `apps/api/test/TC-06-I01-to-I08.spec.ts`
- **Escenario:** El cliente solicita trasladarse de la mesa `M-01` a la mesa `M-02` (que se encuentra `FREE`).
- **Criterios de Aceptación:**
  - Se valida que la mesa destino pertenezca a la misma sucursal y esté en estado `FREE`.
  - En una transacción atómica:
    - La cuenta se reasigna a `M-02`.
    - La mesa destino `M-02` cambia su estado a `OCCUPIED`.
    - La mesa origen `M-01` se libera inmediatamente a `FREE`.
  - Se registra el evento de auditoría de transferencia con el usuario responsable.
- **Resultado:** **Aprobado**.

---

### `TC-06-I05`: Pre-cuenta, Propinas Ley 1935, Descuento Comercial y Liquidación en Caja
- **Archivo:** `apps/api/test/TC-06-I01-to-I08.spec.ts`
- **Escenario:** Cierre de la mesa con pre-cuenta impresa:
  - Subtotal productos: $75.000.
  - Propina sugerida 10 % (Ley 1935): $7.500.
  - Descuento comercial por cortesía: $5.000.
  - Total a pagar: $77.500 COP.
- **Criterios de Aceptación:**
  - La emisión de la pre-cuenta coloca la mesa y la cuenta en `BILL_PRINTED`.
  - Se registran pagos combinados en caja: $50.000 en `CASH` (efectivo con cálculo de cambio) y $27.500 en `POS_TERMINAL` (tarjeta débito/crédito).
  - La cuenta transita a `PAID` y posteriormente a `CLOSED`.
  - La mesa se libera a estado `CLEANING_MAINTENANCE` o `FREE`.
- **Resultado:** **Aprobado**.

---

### `TC-06-I06`: Reapertura de Cuenta para Ajustes Contables vs Reapertura Completa de Mesa
- **Archivo:** `apps/api/test/TC-06-I01-to-I08.spec.ts`
- **Escenario:** Solicitud de ajuste de factura tras el cierre:
  - Caso A: Reapertura modo `ACCOUNTING_ONLY`.
  - Caso B: Reapertura modo `FULL_TABLE`.
- **Criterios de Aceptación:**
  - Requiere rol con permisos de supervisor o administrador (`MANAGER` o `ADMIN`).
  - Modo `ACCOUNTING_ONLY`: La cuenta pasa a `REOPENED` permitiendo anulación o adición de pagos, pero la mesa física permanece en `REOPENED_ACCOUNTING` (sin aceptar nuevos ítems gastronómicos).
  - Modo `FULL_TABLE`: La cuenta se reabre a `OPEN` y la mesa física regresa a `OCCUPIED`, permitiendo añadir nuevos pedidos de cocina.
- **Resultado:** **Aprobado**.

---

### `TC-06-I07`: Distribución Informativa Persistida por Comensal
- **Archivo:** `apps/api/test/TC-06-I01-to-I08.spec.ts`
- **Escenario:** Mesa con 3 comensales. Se persiste la asignación de consumo en base de datos (`account_diners` y `consumption_assignments`).
- **Criterios de Aceptación:**
  - Se guardan los nombres de los comensales (`Persona 1`, `Persona 2`, `Persona 3`).
  - Se asocian las líneas de pedido a cada comensal o como compartidas (`shared`).
  - La API retorna el desglose calculado y formateado para la pre-cuenta térmica, respetando el principio de cobro único fiscal en caja (no subdivide la factura tributaria).
- **Resultado:** **Aprobado**.

---

### `TC-06-I08`: Integración de Reportes Financieros sin Doble Conteo de Órdenes Hijas
- **Archivo:** `apps/api/test/TC-06-I01-to-I08.spec.ts`
- **Escenario:** Sucursal con órdenes de domicilio directas ($80.000) y una cuenta de mesa de salón con 3 órdenes hijas por $95.000 total.
- **Criterios de Aceptación:**
  - El endpoint de ventas consolidadas (`GET /api/v1/reports/sales`) reporta exactamente $175.000 en facturación bruta (`gross_billed_total_cop`).
  - **Invariante Crítica:** Las órdenes hijas vinculadas a una `DiningAccount` quedan **estrictamente excluidas** de la agregación de pedidos directos, impidiendo que el reporte sume doblemente ($270.000).
  - La ecuación maestra de conciliación contable se mantiene en balance perfecto ($0 COP de discrepancia).
- **Resultado:** **Aprobado**.

---

## 4. Pruebas de Frontend E2E (`apps/web`)

### `TC-06-E01`: Operación de Salón, Pre-cuenta Térmica y Extensión de Reportes
- **Archivo:** `apps/web/test/TC-06-E01.spec.ts`
- **Componentes:** `DiningFloorPlanPage`, `BillPreviewModal`, `ConsumptionSplitDrawer`, `StorefrontPage`, `reporting-reconciliation.calculator`
- **Casos Evaluados:**
  1. **Plano de Mesas:** Renderizado agrupado por áreas, tarjetas con colores de estado (`FREE`: verde, `OCCUPIED`: azul, `BILL_PRINTED`: amarillo, `REOPENED_ACCOUNTING`: púrpura), métricas en vivo y panel de cuentas reabiertas.
  2. **Autopedido QR en Mesa:** Menú público con banner de mesa identificada, selector de tipo de servicio `DINE_IN` y solicitud de PIN de mesa para prevención de pedidos no autorizados.
  3. **Distribución Informativa y Ticket Térmico:** Drawer deslizante con cálculo reactivo en tiempo real de comensales, cuotas, propina sugerida, y formateo de pre-cuenta térmica en 80 mm con advertencia DIAN.
  4. **Consolidación en Reportes:** Verificación matemática en la vista de reportes asegurando que las ventas de salón y domicilio se consoliden sin duplicidad de órdenes hijas.
- **Resultado:** **Aprobado** (6 de 6 pruebas frontend superadas exitosamente).

---

## 5. Matriz de Cumplimiento de Criterios de Aceptación

| Criterio de Aceptación | Descripción en Definición Técnica | Implementación en Fase 06 | Estado |
| :--- | :--- | :--- | :---: |
| **Criterio #7** | Operación de Salón y Plano de Mesas interactivo con estados y control de ocupación | Módulo `dining` con áreas, mesas, estados `FREE`/`OCCUPIED`/`BILL_PRINTED`, actualización SSE en vivo y CRUD administrativo. | **CUMPLIDO** |
| **Criterio #8** | Autopedido QR en Mesa con confirmación obligatoria en 1-tap y PIN de sesión | Canal `DINE_IN` en Storefront con PIN de 4 dígitos, creación en `REQUESTED` y confirmación/rechazo de mesero antes de KDS. | **CUMPLIDO** |
| **Criterio #12** | Distribución informativa por persona con 1 solo cobro contable en caja y ticket térmico | Motor `consumption-split.calculator` con 3 modos de reparto, residuo de 1 COP ajustado determinísticamente y pre-cuenta DIAN. | **CUMPLIDO** |
| **Criterio #13** | Reportes consolidados sin doble conteo de órdenes de salón y conciliación maestra en $0 | Filtrado de órdenes con `dining_account_id` en reportes de ventas, asegurando ecuación contable sin distorsión. | **CUMPLIDO** |

---

## 6. Conclusión y Veredicto Final

La **Fase 06** ha sido completada en su totalidad con una cobertura de pruebas del **100 % (192 de 192 pruebas pasando en todo el monorepo)**, sin marcadores de posición (`TODO`), con tipado estricto extremo, políticas RLS activas en PostgreSQL, transiciones de estado formalmente blindadas y una interfaz de usuario fluida y reactiva para el personal de salón y cajeros de Karta Gastronómico.
