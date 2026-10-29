# Casos de Prueba — Fase 05: Reportes Conciliados, Suscripción SaaS Manual, Impresión Térmica 58mm/80mm y PWA

Este documento registra la especificación, ejecución y verificación exhaustiva de los casos de prueba de la **Fase 05**, correspondiente al cierre del **Nivel 2 (`FULL_PANEL`)** de la plataforma **Karta Gastronómico (v2.4.0)**, cubriendo el motor de conciliación contable, pre-recibos térmicos con leyenda fiscal DIAN, gestión de suscripción SaaS manual, exportación de reportes sin PII y configuración PWA con aislamiento de caché de red.

---

## 1. Resumen Ejecutivo de Ejecución

| Suite de Pruebas | Alcance / Módulo | Total Pruebas | Exitosas | Fallidas | Estado |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Unitarias (`packages/shared`)** | `reporting-reconciliation.calculator.ts` & `thermal-receipt.formatter.ts` | 9 | 9 | 0 | **APROBADO** |
| **Integración (`apps/api`)** | `reporting` & `billing-subscription` (`TC-05-I01` a `TC-05-I05`) | 5 | 5 | 0 | **APROBADO** |
| **Frontend E2E (`apps/web`)** | Dashboard de Reportes, Impresión Térmica y PWA (`TC-05-E01`) | 6 | 6 | 0 | **APROBADO** |
| **Monorepo Consolidado** | `turbo run test` (todos los paquetes) | **168** | **168** | 0 | **APROBADO** |

---

## 2. Pruebas Unitarias (`packages/shared`)

### `TC-05-U01`: Prelación de Imputación en Cobros Parciales
- **Archivo:** `packages/shared/test/TC-05-U01-to-U03.spec.ts`
- **Componente:** `allocateCollectedBreakdown`
- **Propósito:** Garantizar que ante cobros parciales sobre pedidos con productos, domicilio y propina voluntaria, el dinero recaudado se impute estrictamente en el orden legal y contable:
  1.º Productos netos (`netProductsCop`).
  2.º Domicilio (`deliveryFeeCop`).
  3.º Propina voluntaria (`tipCop`).
- **Casos Evaluados:**
  - Orden base: `$40.000` productos + `$5.000` domicilio + `$4.000` propina = `$49.000` total.
  - Abono de `$25.000`: imputa `$25.000` a productos, `$0` a domicilio, `$0` a propinas.
  - Abono de `$43.000`: imputa `$40.000` a productos, `$3.000` a domicilio, `$0` a propinas.
  - Abono total de `$49.000`: imputa `$40.000` a productos, `$5.000` a domicilio, `$4.000` a propinas.
  - Abonos en cero o negativos: normalizados a `$0` sin NaN ni valores negativos.
- **Resultado:** **Aprobado**. Cumple estrictamente la invariante `collected_products + collected_delivery + collected_tips === paid_total`.

---

### `TC-05-U02`: Ecuación Maestra de Conciliación con Resoluciones Mixtas
- **Archivo:** `packages/shared/test/TC-05-U01-to-U03.spec.ts`
- **Componente:** `computeReceivableAndUncollected` y `verifyMasterReconciliationEquation`
- **Propósito:** Validar que la ecuación contable de Karta siempre cumpla la identidad:
  $$\text{gross\_billed\_total} \equiv \text{collected\_total} + \text{pending\_receivable} + \text{courtesy\_total} + \text{written\_off\_total}$$
- **Casos Evaluados:**
  - Orden `PAID`: `pendingReceivable = 0`, `courtesy = 0`, `writtenOff = 0`.
  - Orden `PARTIALLY_PAID`: saldo restante asignado a `pendingReceivableCop`.
  - Orden `UNPAID`: totalidad de la orden asignada a `pendingReceivableCop`.
  - Orden `COURTESY` con abono previo: saldo restante asignado a `courtesyCop`.
  - Orden `WRITTEN_OFF` con abono parcial: saldo restante asignado a `writtenOffCop`.
  - Conjunto mixto: evalúa `isBalanced === true` y `discrepancyCop === 0`.
- **Resultado:** **Aprobado**. Ecuación balanceada en el 100 % de las combinaciones.

---

### `TC-05-U03`: Formateador de Recibo Térmico con Leyenda Fiscal DIAN
- **Archivo:** `packages/shared/test/TC-05-U01-to-U03.spec.ts`
- **Componente:** `formatThermalReceiptText`
- **Propósito:** Formatear el comprobante monospacio para anchos estándar de 58 mm (32 columnas) y 80 mm (42 columnas) incluyendo la leyenda obligatoria de control interno DIAN y discriminando impuestos según el modo tributario.
- **Casos Evaluados:**
  - Recibo 58 mm: ninguna línea excede 32 caracteres.
  - Recibo 80 mm: ninguna línea excede 42 caracteres.
  - Modo `TAX_INCLUDED_DISCRIMINATED`: incluye desglose explícito de `Base Gravable` e `Impoconsumo (8%)` o `IVA (19%)`.
  - Modo `FINAL_PRICE_NO_BREAKDOWN`: oculta el desglose tributario mostrando precios finales.
  - Leyenda legal obligatoria:
    `"Documento informativo de control interno / pre-cuenta — No sustituye la factura electrónica de venta ni el documento equivalente POS exigido por la DIAN"` presente en ambos anchos con ajuste de palabras multilínea.
- **Resultado:** **Aprobado**.

---

## 3. Pruebas de Integración (`apps/api`)

### `TC-05-I01`: Conciliación Financiera Exacta en `GET /api/v1/reports/sales`
- **Archivo:** `apps/api/test/TC-05-I01-to-I05.spec.ts`
- **Escenario:** Creación de 5 órdenes confirmadas en una sucursal con política `OFFLINE_ONLY`:
  1. Orden 1 ($50.000 productos + $5.000 domicilio = $55.000): cobrada al 100 % en `CASH` (`PAID`).
  2. Orden 2 ($40.000 productos + $4.000 propina = $44.000): abono parcial de $30.000 en `MANUAL_TRANSFER` (`PARTIALLY_PAID`, por cobrar $14.000).
  3. Orden 3 ($30.000 productos): sin cobros (`UNPAID`, por cobrar $30.000).
  4. Orden 4 ($25.000 productos): resuelta como `COURTESY` ($25.000 no recaudado).
  5. Orden 5 ($35.000 productos): abono de $10.000 en `POS_TERMINAL` y saldo de $25.000 resuelto como `WRITTEN_OFF`.
- **Criterios de Aceptación:**
  - `billing_summary.gross_billed_total_cop` === `$189.000`
  - `billing_summary.net_products_sales_cop` === `$180.000`
  - `billing_summary.delivery_fees_total_cop` === `$5.000`
  - `billing_summary.tips_total_cop` === `$4.000`
  - `reconciliation_summary.collected_total_cop` === `$95.000` (`CASH: 55000, MANUAL_TRANSFER: 30000, POS_TERMINAL: 10000`)
  - `reconciliation_summary.pending_receivable_cop` === `$44.000`
  - `reconciliation_summary.courtesy_total_cop` === `$25.000`
  - `reconciliation_summary.written_off_total_cop` === `$25.000`
  - `reconciliation_summary.is_balanced` === `true`
  - Detalle de resoluciones: 2 registros detallando motivo, fecha, monto y usuario autorizador.
- **Resultado:** **Aprobado**.

---

### `TC-05-I02`: Exclusión de Solicitudes No Confirmadas y Separación de `NOT_TRACKED`
- **Archivo:** `apps/api/test/TC-05-I01-to-I05.spec.ts`
- **Escenario:** Inyección de órdenes en estados `REQUESTED`, `REJECTED`, `CANCELLED` y `EXPIRED_UNPROCESSED`, más órdenes históricas con política `NONE` (`NOT_TRACKED`).
- **Criterios de Aceptación:**
  - Las órdenes no confirmadas no alteran en un solo peso la facturación bruta ni los saldos contables.
  - Aparecen reflejadas en `excluded_orders_summary` con sus conteos respectivos.
  - Las órdenes `NOT_TRACKED` se reportan exclusivamente en `not_tracked_orders_summary` sin distorsionar `pending_receivable_cop`.
- **Resultado:** **Aprobado**.

---

### `TC-05-I03`: Exportación CSV Auditada y Libre de PII (Ley 1581 de 2012)
- **Archivo:** `apps/api/test/TC-05-I01-to-I05.spec.ts`
- **Escenario:** Invocación de `GET /api/v1/reports/sales/export-csv` sobre pedidos con datos personales completos de comensales en base de datos.
- **Criterios de Aceptación:**
  - Retorna `Content-Type: text/csv; charset=utf-8`.
  - Inicia con Byte Order Mark UTF-8 (`\uFEFF`) para apertura directa en Microsoft Excel.
  - Contiene exactamente las 25 columnas contables y operativas.
  - Cero PII: no contiene nombres, teléfonos ni direcciones en ninguna fila.
  - Se genera un registro inmutable en `audit_events` con `action: 'SALES_REPORT_CSV_EXPORTED'`.
- **Resultado:** **Aprobado**.

---

### `TC-05-I04`: Gestión de Suscripción SaaS, Sincronización y Bloqueo por `SUSPENDED`
- **Archivo:** `apps/api/test/TC-05-I01-to-I05.spec.ts`
- **Escenario:** Actualización de plan y registro de factura manual mediante `PATCH /api/v1/platform/tenants/:tenantId/subscription` con rol `PLATFORM_ADMIN`, seguido de suspensión del restaurante.
- **Criterios de Aceptación:**
  - Sincroniza atómicamente `Subscription.plan_id` y `Tenant.plan_id` con `PLAN_OPERATIONS_PRO`.
  - Emite factura SaaS en `subscription_invoices` por `$89.000` vinculada al tenant.
  - Al pasar a `SUSPENDED`, `POST /api/v1/public/orders` responde HTTP 403 `TENANT_SUBSCRIPTION_SUSPENDED`.
  - El administrador del restaurante puede consultar sus reportes históricos y la vista de suscripción en modo solo lectura (HTTP 200).
- **Resultado:** **Aprobado**.

---

### `TC-05-I05`: Aislamiento Multi-Tenant en Reportes y Exportación CSV
- **Archivo:** `apps/api/test/TC-05-I01-to-I05.spec.ts`
- **Escenario:** Dos restaurantes independientes con órdenes simultáneas consultando sus reportes y exportando sus archivos contables.
- **Criterios de Aceptación:**
  - Restaurante A no visualiza métricas ni exporta pedidos del Restaurante B.
  - Cada CSV contiene exclusivamente los códigos y montos del tenant autenticado.
- **Resultado:** **Aprobado**.

---

## 4. Pruebas Frontend E2E (`apps/web`)

### `TC-05-E01`: Flujo E2E Completo — Dashboard de Reportes, Impresión y PWA
- **Archivo:** `apps/web/test/TC-05-E01.spec.ts`
- **Criterios de Aceptación:**
  1. Validación del balanceo de la fórmula visual en el dashboard de reportes.
  2. Validación de esquemas Zod de filtros y suscripción.
  3. Formateo y wrapping de comandas de cocina térmicas de 58 mm y 80 mm.
  4. Formateo de pre-recibo de caja con leyenda fiscal DIAN obligatoria y desglose de impuestos.
  5. Estrategia NetworkOnly en el Service Worker: la regex `/^\/api\/v1\/.*/i` intercepta toda la API garantizando cero almacenamiento local de datos privados.
- **Resultado:** **Aprobado** (6 de 6 pruebas pasando).

---

## 5. Puerta Manual 5.4 — Validación Consolidada del Monorepo

```bash
# 1. Typecheck Consolidado
pnpm turbo run typecheck
✓ @restaurante-saas/shared:typecheck
✓ @restaurante-saas/api:typecheck
✓ @restaurante-saas/web:typecheck

# 2. Test Suites Consolidadas
pnpm turbo run test
✓ @restaurante-saas/shared: 86 tests pasados
✓ @restaurante-saas/api: 54 tests pasados
✓ @restaurante-saas/web: 28 tests pasados
Total: 168 tests pasados en el monorepo (0 fallidos)

# 3. Build de Producción Web
pnpm --filter @restaurante-saas/web build
✓ built in 4.18s
✓ Service Worker generado por vite-plugin-pwa (PWA v0.21.0)
```

---

## 6. Conclusión de la Fase 05 y del Nivel 2 (`FULL_PANEL`)

Con la ejecución satisfactoria de todas las suites y la verificación en navegadores:
1. El **Nivel 2 (`FULL_PANEL`)** queda 100 % completado, robusto y probado.
2. La plataforma Karta dispone de:
   - Catálogo digital y vitrina móvil (Fase 02).
   - Motor de pedidos WhatsApp con geocodificación y antifraude (Fase 03A).
   - Panel liviano con tracking en tiempo real por SSE (Fase 03B).
   - Panel operativo completo, KDS con despacho y cobros manuales combinados (Fase 04).
   - Reportes contables con conciliación matemática, exportación CSV Cero PII, impresión térmica de 58 mm y 80 mm con leyenda fiscal DIAN, gestión de suscripción SaaS y soporte PWA instalable con protección de red (Fase 05).
