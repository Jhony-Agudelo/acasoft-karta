# Fase 09: Módulo Financiero (Ingresos, Gastos y P&L), Nómina Electrónica y Facturación DIAN con Factus API v2

**Documento:** `FASE_08_MODULO_FINANCIERO_NOMINA_Y_FACTUS_V2.md`  
**Versión:** 2.5.1 — Especificación Técnica Definitiva con Flujo de Caja POS (Consumidor Final vs. Cliente con Datos DIAN) sobre **Factus API v2**  
**Fecha:** 2026-11-05  
**Prerrequisitos:** `DEFINICION_TECNICA.md` (v2.5.0) y Fases `01` a `08` completadas.  
**Objetivo de la Fase:** Convertir a **Karta** en una plataforma integral capaz de reemplazar por completo a softwares administrativos como Alegra en el sector gastronómico, implementando el **Adaptador Unificado para Factus API v2** (`OAuth2`, Rangos de Numeración y Consulta de Adquirentes DIAN) y tres nuevos módulos de dominio:

1. **`invoicing.electronic_dian`:** Flujo de caja POS con selección en 1 toque (**Consumidor Final `222222222222`**, **Cliente Nominativo con autocompletado DIAN** o **Solo Recibo Interno**), emisión de Factura Electrónica de Venta (`/v2/bills/validate` con soporte de establecimiento por sucursal, propina en `allowance_charges` y ajuste de redondeo `cash_rounding_amount`), Notas Crédito (`/v2/credit-notes/validate`) y Notas Débito (`/v2/debit-notes/validate`).
2. **`finance.expenses_dse`:** Gestión Financiera de Proveedores, Compras/Gastos, Cuentas por Pagar, emisión de **Documento Soporte Electrónico (`/v2/support-documents/validate`)** y **Notas de Ajuste (`/v2/adjustment-notes/validate`)** para compras a informales, **Recepción de Facturas y Eventos RADIAN (`/v2/receptions/**`)** para compras a crédito, y **Estado de Resultados Operativo (P&L: Ingresos Reales vs. Costo de Recetas, Gastos y Nómina)**.
3. **`payroll.electronic_dian`:** Gestión de Empleados, Liquidación de Nómina para Restaurantes (sueldo, auxilio de transporte, recargos nocturnos/dominicales/horas extras en `accruals.hora`, comisiones y deducciones de salud/pensión) y transmisión de **Nómina Electrónica (`/v2/payrolls`)** y **Notas de Ajuste de Nómina (`/v2/adjustment-payrolls`)**.

---

## 1. Reglas de Ingeniería y Hallazgos Técnicos de Factus API v2 (Directivas para Gemini)

El análisis directo de la colección oficial `api-factus-v2.json` impone las siguientes reglas técnicas obligatorias:

1. **Autenticación OAuth2 con `multipart/form-data` o `application/x-www-form-urlencoded` y Caché por Tenant:**
   - El endpoint `POST {{url_api}}/oauth/token` exige `grant_type = 'password'`, `client_id`, `client_secret`, `username` y `password` en el login inicial, y `grant_type = 'refresh_token'` para renovar sesión.
   - `FactusAuthService` almacena las credenciales cifradas con **AES-256-GCM** en PostgreSQL por `Tenant` y mantiene en memoria/caché el `access_token` y `refresh_token`, renovándolo preventivamente antes de su expiración sin autenticar en cada venta de caja.
2. **Conversión Exacta de Precios con Impuesto Incluido y Uso de `cash_rounding_amount`:**
   - En Karta todos los importes internos son enteros en pesos (`COP`). Sin embargo, **Factus API v2 exige en `items[].price` el precio unitario BASE (antes de impuestos) con 2 decimales** (ej. `"14814.81"`) y aplica encima el arreglo `taxes` (`code: "04"` para INC 8 %, `code: "01"` para IVA 19 %, o `is_excluded: true` cuando no aplica impuesto).
   - Cuando el restaurante opera en modo `TAX_INCLUDED_DISCRIMINATED` (ej. un producto con precio final `$20.000` e INC del 8 %), el precio base unitario es $20000 / 1.08 = 18518.52$. Al multiplicar y redondear en la DIAN pueden surgir diferencias de centavos frente al pago entero recibido en caja.
   - **Solución Determinista en Karta:** La calculadora pura `factus-v2-mapper.calculator.ts` calcula el total exacto que validará Factus con 2 decimales ($\text{Total}_{\text{Factus}}$) y compara contra el total cobrado en Karta ($\text{paid\_total\_cop}$). Cualquier diferencia de centavos se envía en el campo nativo de Factus v2 **`"cash_rounding_amount"`** (ej. `"-0.48"` o `"0.00"`), garantizando que el XML UBL 2.1 cuadre al centavo con `payment_details` y jamás sea rechazado por la DIAN.
3. **Mapeo Nativo de Propina (`allowance_charges`) y Sucursal (`establishment`):**
   - La propina voluntaria (`tip_cop > 0`) **jamás se envía como un ítem gravado**. Se envía en el arreglo raíz `"allowance_charges"` de `POST /v2/bills/validate` exactamente como lo exige Factus v2:
     ```json
     "allowance_charges": [
       {
         "concept_type": "03",
         "is_surcharge": true,
         "reason": "Propina voluntaria",
         "base_amount": "100000.00",
         "amount": 10000
       }
     ]
     ```
   - Los datos de la sucursal (`Branch`) se envían siempre en el objeto `"establishment"` (`name`, `email`, `address`, `phone_number`, `municipality_code`) de `POST /v2/bills/validate`.
4. **Idempotencia y Limpieza Automática de Borradores No Validados (`reference_code`):**
   - Todo documento enviado a Factus v2 lleva un `reference_code` único generado por Karta (ej. `"KARTA-ORD-A104"`).
   - Si un corte de red o rechazo temporal deja un documento creado pero **no validado** (`status = 0` en Factus) bloqueando el `reference_code`, el servicio de reintento invoca primero `DELETE /v2/bills/destroy/reference/:reference_code` (o su equivalente en notas, documento soporte o nómina) antes de reenviar el payload corregido.
5. **Tipos de ID de Rangos de Numeración (`numbering_range_id`):**
   - Según `api-factus-v2.json`, en Facturas (`21`), Notas Crédito (`22`), Notas Débito (`23`), Documento Soporte (`24`) y Notas de Ajuste (`25`), el `numbering_range_id` es un **entero numérico** (`INT`, ej. `389`).
   - En Nómina Electrónica (`26`) y Notas de Ajuste de Nómina (`27`), el endpoint `/v2/numbering-ranges/payrolls` utiliza un identificador **alfanumérico ULID** (`VARCHAR`, ej. `"01kpdv25zepw0vzn39th90h1a7"`). El esquema de base de datos de Karta soporta ambos formatos sin fricción.
6. **Flujo Operativo en Caja POS: ¿Qué servicios se consumen según la respuesta del cliente al cobrar?**
   Al momento de registrar el pago final de una `Order` o `DiningAccount`, el modal de caja presenta un selector de **Comprobante Fiscal** gobernado por `FactusTenantConfig.invoicing_trigger_mode` (`'AUTO_ALWAYS'` | `'CASHIER_CHOICE'`):
   - **Caso A — Factura Electrónica a "Consumidor Final" (Opción por defecto en 1 clic):**
     - El cliente no pide factura a su nombre, pero el restaurante emite factura electrónica de la venta.
     - **Servicio consumido:** Únicamente `POST {{url_api}}/v2/bills/validate` enviando en `customer` el objeto mínimo oficial de consumidor final (`identification_document_code: "13"`, `identification: "222222222222"`, `names: "Consumidor Final"`). No requiere llamadas previas ni digitar datos.
   - **Caso B — Factura Electrónica a nombre del Cliente / Empresa (Cédula o NIT):**
     - El cliente responde que desea la factura a su nombre o el de su empresa y da su número de documento.
     - **Servicios consumidos (en 2 pasos):**
       1. **Paso 1 (Autocompletado instantáneo):** Al digitar el tipo (`13` Cédula o `31` NIT) y número de documento en el modal de caja y pulsar buscar (o `Enter`), Karta busca primero en la caché local `TaxCustomerProfile`; si no existe, consume **`GET {{url_api}}/v2/dian/acquirer?identification_document_code=:code&identification_number=:num`** en Factus v2. Este servicio devuelve el nombre/razón social y el correo electrónico registrados en la DIAN para autocompletar el formulario en menos de 1 segundo.
       2. **Paso 2 (Emisión y validación):** Al confirmar el cobro, Karta guarda/actualiza el perfil en `TaxCustomerProfile` y consume **`POST {{url_api}}/v2/bills/validate`** enviando el objeto `customer` completo (incluyendo `email` y `send_email: true` para que Factus envíe el XML/PDF al correo del cliente).
   - **Caso C — Solo Pre-cuenta / Recibo Interno (Disponible cuando `invoicing_trigger_mode === 'CASHIER_CHOICE'`):**
     - El cajero registra el pago en Karta sin transmitir a Factus v2 en ese instante (o deja disponible el botón **"Emitir Factura DIAN"** en el historial del pedido por si el cliente la solicita minutos después).

---

## 2. Catálogo de Nuevos Módulos y Capacidades (`packages/shared`)

Se actualiza `packages/shared/src/constants/modules.catalog.ts` activando `invoicing.electronic_dian` e incorporando los dos nuevos módulos financieros y de nómina:

| Módulo (`key`) | Estado | Qué habilita | Requiere todos (`depends_on_all`) | Requiere al menos uno (`depends_on_any`) | Comportamiento si está desactivado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `invoicing.electronic_dian` | **Hito 4** | Factura Electrónica de Venta (Consumidor Final y Nominativa), Notas Crédito/Débito y autocompletado DIAN con Factus v2 | `['payments.manual']` | — | Los cierres de venta emiten únicamente pre-cuenta informativa sin transmisión a Factus. |
| `finance.expenses_dse` | **Hito 4** | Gastos/Compras, Cuentas por Pagar, Documento Soporte Electrónico, Eventos RADIAN y Estado de Resultados (P&L) | `['payments.manual', 'reporting']` | — | No se gestionan facturas de compra, gastos operativos ni Documento Soporte DIAN. |
| `payroll.electronic_dian` | **Hito 4** | Contratos de empleados, liquidación de turnos/horas extras gastronómicas y Nómina Electrónica DIAN con Factus v2 | — | `['order_panel', 'dining']` | No se liquidan periodos de nómina ni se transmite Nómina Electrónica a la DIAN. |

---

## 3. Tablas de Equivalencia Oficiales Karta $\leftrightarrow$ Factus API v2 (DIAN)

En `packages/shared/src/constants/factus-v2.catalog.ts` se definen las constantes inmutables de mapeo:

### 3.1 Códigos de Métodos y Formas de Pago (`payment_details`)
- **`payment_form`:** `'1'` = Contado (cuando `payment_status === 'PAID'`), `'2'` = Crédito (cuando requiere `due_date: 'YYYY-MM-DD'`).
- **`payment_method_code`:**
  - `Payment.method === 'CASH'` $\rightarrow$ `'10'` (Efectivo).
  - `Payment.method === 'MANUAL_TRANSFER'` $\rightarrow$ `'42'` (Consignación / Transferencia bancaria: Nequi, DaviPlata, Bre-B, Bancolombia).
  - `Payment.method === 'POS_TERMINAL'` $\rightarrow$ `'48'` (Tarjeta Crédito / Datáfono) o `'49'` (Tarjeta Débito).

### 3.2 Códigos de Tributos por Línea (`items[].taxes`)
- `TaxType === 'IVA'` $\rightarrow$ `{ code: '01', rate: '19.00' }` (o `'5.00'` según `tax_rate_bp`).
- `TaxType === 'INC'` $\rightarrow$ `{ code: '04', rate: '8.00' }`.
- `TaxType === 'NONE'` o `'EXEMPT'` $\rightarrow$ `{ is_excluded: true }`.

### 3.3 Estructura Exacta del Objeto `customer` en `POST /v2/bills/validate` (Consumidor Final vs. Cliente Nominativo)

Según los ejemplos oficiales `"Con consumidor final"` y `"Crear y validar"` de `api-factus-v2.json`, el mismo endpoint `POST /v2/bills/validate` recibe dos estructuras distintas para el nodo `customer` dependiendo de la elección del cajero:

1. **Modalidad 1: `CUSTOMER_TYPE = 'FINAL_CONSUMER'` (Sin pedir datos al comensal):**
   ```json
   "send_email": false,
   "customer": {
     "identification_document_code": "13",
     "identification": "222222222222",
     "names": "Consumidor Final"
   }
   ```
2. **Modalidad 2: `CUSTOMER_TYPE = 'NAMED_CUSTOMER'` (Con Cédula `'13'`, NIT `'31'`, CE `'22'` o Pasaporte `'41'`, autocompletado vía `GET /v2/dian/acquirer`):**
   - *Si es Persona Natural (`legal_organization_code: "2"`, ej. Cédula `'13'`):*
     ```json
     "send_email": true,
     "customer": {
       "identification_document_code": "13",
       "identification": "123456789",
       "names": "Alan Turing",
       "address": "Calle 1 # 1-1",
       "email": "alan@email.com",
       "phone": "3001234567",
       "legal_organization_code": "2",
       "tribute_code": "ZZ",
       "country_code": "CO",
       "responsibilities": ["R-99-PN"],
       "municipality_code": "66400"
     }
     ```
   - *Si es Persona Jurídica / Empresa (`legal_organization_code: "1"`, NIT `'31'`):*
     ```json
     "send_email": true,
     "customer": {
       "identification_document_code": "31",
       "identification": "900123456",
       "company": "Restaurantes Unidos S.A.S.",
       "trade_name": "Restaurantes Unidos",
       "address": "Calle 1 # 1-1",
       "email": "facturacion@empresa.com",
       "phone": "3001234567",
       "legal_organization_code": "1",
       "tribute_code": "01",
       "country_code": "CO",
       "responsibilities": ["R-99-PN"],
       "municipality_code": "66400"
     }
     ```

### 3.4 Códigos de Horas Extras y Recargos en Nómina (`accruals.hora[].accrual_type_code`)
- `'1'` = Hora Extra Diurna (`25.00 %`).
- `'2'` = Hora Extra Nocturna (`75.00 %`).
- `'3'` = Hora Recargo Nocturno (`35.00 %` — muy frecuente en turnos de restaurante después de las 9:00 PM).
- `'4'` = Hora Extra Diurna Dominical y Festiva (`100.00 %`).
- `'5'` = Hora Recargo Diurno Dominical y Festivo (`75.00 %` — habitual en operación de fin de semana).
- `'6'` = Hora Extra Nocturna Dominical y Festiva (`150.00 %`).
- `'7'` = Hora Recargo Nocturno Dominical y Festivo (`110.00 %`).

---

## 4. Modelo de Datos Relacional en PostgreSQL (`schema.prisma` + RLS)

Se agregan a `apps/api/prisma/schema.prisma` las siguientes tablas con aislamiento multi-tenant (`tenant_id`) y políticas *Row-Level Security (RLS)* para el rol `app_runtime`:

### 4.1 Configuración e Integración Factus API v2 (`invoicing.electronic_dian`)

1. **`FactusTenantConfig` (`factus_tenant_configs`):**
   - `tenant_id (UUID PK/FK)`, `environment (SANDBOX | PRODUCTION DEFAULT 'SANDBOX')`
   - `api_base_url (VARCHAR — ej. 'https://api-sandbox.factus.com.co')`
   - `encrypted_client_id (TEXT)`, `encrypted_client_secret (TEXT)`, `encrypted_username (TEXT)`, `encrypted_password (TEXT)` — Cifrados con `AES-256-GCM`.
   - `encrypted_access_token (TEXT NULL)`, `encrypted_refresh_token (TEXT NULL)`, `token_expires_at (TIMESTAMPTZ NULL)`
   - `invoicing_trigger_mode (VARCHAR(24) DEFAULT 'CASHIER_CHOICE' — 'AUTO_ALWAYS' | 'CASHIER_CHOICE')` — Define si toda venta pagada emite obligatoriamente factura electrónica (por defecto a Consumidor Final salvo que se indiquen datos) o si el cajero puede elegir en caja entre Factura Electrónica y Recibo Interno.
   - `default_municipality_code (VARCHAR(10) DEFAULT '66400')` — Código DANE del municipio por defecto.
   - `default_tribute_code (VARCHAR(10) DEFAULT '01')`, `is_active (BOOLEAN DEFAULT TRUE)`, `updated_at (TIMESTAMPTZ)`.

2. **`BranchNumberingRange` (`branch_numbering_ranges`):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`
   - `document_type_code (VARCHAR(4) — '21' Factura | '22' Nota Crédito | '23' Nota Débito | '24' Doc Soporte | '25' Nota Ajuste DS | '26' Nómina | '27' Nota Ajuste Nómina)`
   - `factus_range_id (VARCHAR(64) NOT NULL)` — Guarda tanto el ID entero (`"389"`) de facturación/soporte como el ULID (`"01kpdv25zepw0vzn39th90h1a7"`) de nómina.
   - `prefix (VARCHAR(10))`, `resolution_number (VARCHAR(64) NULL)`, `current_consecutive (BIGINT DEFAULT 1)`
   - `is_active (BOOLEAN DEFAULT TRUE)`, `UNIQUE(tenant_id, branch_id, document_type_code)`.

3. **`TaxCustomerProfile` (`tax_customer_profiles` — Directorio y Caché Local de Adquirentes DIAN):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`
   - `identification_document_code (VARCHAR(4) — '13' | '31' | '22' | '41')`
   - `identification (VARCHAR(32))`, `dv (VARCHAR(2) NULL)`
   - `legal_organization_code (VARCHAR(2) DEFAULT '2' — '1' Jurídica | '2' Natural)`
   - `names (VARCHAR NULL)`, `company (VARCHAR NULL)`, `trade_name (VARCHAR NULL)`
   - `email (VARCHAR NULL)`, `phone (VARCHAR NULL)`, `address (VARCHAR NULL)`
   - `municipality_code (VARCHAR(10) DEFAULT '66400')`, `tribute_code (VARCHAR(4) DEFAULT 'ZZ')`, `responsibilities (TEXT[] DEFAULT ARRAY['R-99-PN'])`
   - `UNIQUE(tenant_id, identification_document_code, identification)`.

4. **`ElectronicFiscalDocument` (`electronic_fiscal_documents`):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`
   - `doc_category (BILL | CREDIT_NOTE | DEBIT_NOTE | SUPPORT_DOCUMENT | SUPPORT_ADJUSTMENT_NOTE)`
   - `customer_mode (FINAL_CONSUMER | NAMED_CUSTOMER | SUPPLIER_DSE)`
   - `reference_code (VARCHAR(64) NOT NULL)` — Código único enviado a Factus.
   - `order_id (UUID FK NULL)`, `account_id (UUID FK NULL)`, `expense_id (UUID FK NULL)`, `parent_fiscal_doc_id (UUID FK NULL)`
   - `factus_number (VARCHAR(64) NULL — ej. 'SETP990001103' o 'SEDS984000129')`
   - `prefix (VARCHAR(10) NULL)`, `cufe_or_cude (VARCHAR(128) NULL)`, `qr_url (TEXT NULL)`, `qr_image_base64 (TEXT NULL)`
   - `status (PENDING_VALIDATION | VALIDATED | REJECTED | ANNULLED_BY_NOTE)`
   - `total_cop (INT NOT NULL)`, `cash_rounding_cop_cents (VARCHAR(16) DEFAULT '0.00')`
   - `customer_or_provider_snapshot_json (JSONB NOT NULL)`
   - `request_payload_json (JSONB NOT NULL)`, `response_payload_json (JSONB NULL)`, `last_error_message (TEXT NULL)`
   - `validated_at (TIMESTAMPTZ NULL)`, `created_by (UUID FK)`, `created_at (TIMESTAMPTZ)`
   - `UNIQUE(tenant_id, reference_code)`.

### 4.2 Módulo Financiero: Proveedores, Gastos, Cuentas por Pagar y Recepción RADIAN (`finance.expenses_dse`)

5. **`Supplier` (`suppliers`):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`
   - `identification_document_code (VARCHAR(4) — '31' NIT | '13' CC)`
   - `identification (VARCHAR(32))`, `dv (VARCHAR(2) NULL)`, `legal_organization_code (VARCHAR(2) DEFAULT '2')`
   - `name (VARCHAR NOT NULL)`, `email (VARCHAR NULL)`, `phone (VARCHAR NULL)`, `address (VARCHAR NOT NULL)`
   - `municipality_code (VARCHAR(10) NOT NULL)`, `is_obligated_to_invoice (BOOLEAN DEFAULT FALSE)` — Si es `FALSE`, las compras a este proveedor permiten emitir **Documento Soporte Electrónico** (`/v2/support-documents/validate`).
   - `is_active (BOOLEAN DEFAULT TRUE)`, `UNIQUE(tenant_id, identification)`.

6. **`ExpenseDocument` (`expense_documents` — Gastos, Compras de Insumos y Cuentas por Pagar):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`, `supplier_id (UUID FK)`
   - `expense_code (VARCHAR — ej. '#G-0042')`
   - `category (INGREDIENTS_PURCHASE | UTILITIES | RENT | MAINTENANCE | PACKAGING | MARKETING | SERVICES | OTHER)`
   - `payment_form ('1' Contado | '2' Crédito)`, `due_date (DATE NULL)`
   - `status (DRAFT | CONFIRMED | CANCELLED)`
   - `payment_status (UNPAID | PARTIALLY_PAID | PAID)`
   - `requires_support_document (BOOLEAN DEFAULT FALSE)` — Indica si debe transmitirse a Factus v2 como Documento Soporte.
   - `subtotal_cop (INT NOT NULL)`, `discount_total_cop (INT DEFAULT 0)`, `tax_total_cop (INT DEFAULT 0)`, `withholding_tax_total_cop (INT DEFAULT 0)`, `grand_total_cop (INT NOT NULL)`, `paid_total_cop (INT DEFAULT 0)`
   - `items_json (JSONB NOT NULL)` — Líneas con `code_reference`, `name`, `quantity`, `price_cop`, `tax_code`, `tax_rate`, `withholding_taxes` y `ingredient_id` opcional (para alimentar automáticamente `PURCHASE_ENTRY` en el Kardex de `inventory.recipes` si aplica).
   - `notes (TEXT NULL)`, `occurred_at (TIMESTAMPTZ)`, `created_by (UUID FK)`, `created_at (TIMESTAMPTZ)`
   - `CHECK (grand_total_cop >= paid_total_cop)`.

7. **`ExpensePayment` (`expense_payments` — Pagos a Proveedores / Cuentas por Pagar):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`, `expense_id (UUID FK)`
   - `method (CASH | POS_TERMINAL | MANUAL_TRANSFER)`, `amount_cop (INT > 0)`
   - `cash_shift_movement_id (UUID FK NULL)` — Si se paga en efectivo desde la caja del turno activo, crea y vincula automáticamente el `CashShiftMovement` (`CASH_OUT`, `SUPPLIER_PAYMENT`) para que cuadre el arqueo ciego de la Fase 07.
   - `reference_note (VARCHAR NULL)`, `status (APPROVED | VOIDED)`, `created_by (UUID FK)`, `created_at (TIMESTAMPTZ)`.

8. **`ReceivedSupplierInvoice` (`received_supplier_invoices` — Recepción RADIAN `/v2/receptions`):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`
   - `factus_reception_id (VARCHAR(64) NOT NULL)`, `track_id_or_cufe (VARCHAR(128) NOT NULL)`
   - `invoice_number (VARCHAR(64))`, `supplier_nit (VARCHAR(32))`, `supplier_name (VARCHAR)`
   - `issue_date (DATE)`, `total_cop (INT)`
   - `event_030_emitted_at (TIMESTAMPTZ NULL)` — Acuse de recibo de la factura.
   - `event_032_emitted_at (TIMESTAMPTZ NULL)` — Recibo del bien o prestación del servicio.
   - `event_033_or_034_emitted_at (TIMESTAMPTZ NULL)` — Aceptación expresa (`033`) o tácita (`034`).
   - `completed_events (BOOLEAN DEFAULT FALSE)`, `UNIQUE(tenant_id, track_id_or_cufe)`.

### 4.3 Módulo de Nómina Gastronómica y Nómina Electrónica (`payroll.electronic_dian`)

9. **`EmployeeProfile` (`employee_profiles`):**
   - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`, `user_id (UUID FK NULL)`
   - `employee_code (VARCHAR(32))`, `identification_document_code (VARCHAR(4) DEFAULT '13')`, `identification_number (VARCHAR(32))`
   - `first_name (VARCHAR)`, `first_surname (VARCHAR)`, `second_surname (VARCHAR NULL)`
   - `address (VARCHAR)`, `municipality_code (VARCHAR(10))`, `email (VARCHAR NULL)`, `phone (VARCHAR NULL)`
   - `worker_type_code (VARCHAR(4) DEFAULT '01')`, `worker_subtype (VARCHAR(4) DEFAULT '00')`, `contract_type (VARCHAR(4) DEFAULT '1')`
   - `has_integral_salary (BOOLEAN DEFAULT FALSE)`, `has_high_risk (BOOLEAN DEFAULT FALSE)`
   - `base_salary_cop (INT NOT NULL CHECK (base_salary_cop > 0))`, `receives_transport_allowance (BOOLEAN DEFAULT TRUE)`
   - `entry_date (DATE NOT NULL)`, `retirement_date (DATE NULL)`
   - `payment_method_code (VARCHAR(4) DEFAULT '42')`, `bank_name (VARCHAR NULL)`, `account_type (VARCHAR(4) NULL)`, `account_number (VARCHAR NULL)`
   - `is_active (BOOLEAN DEFAULT TRUE)`, `UNIQUE(tenant_id, identification_number)`.

10. **`PayrollSettlement` (`payroll_settlements` — Liquidación y Transmisión a `/v2/payrolls`):**
    - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`, `employee_id (UUID FK)`
    - `reference_code (VARCHAR(64) NOT NULL)`
    - `year (INT NOT NULL)`, `month (INT NOT NULL CHECK (month BETWEEN 1 AND 12))`, `payroll_period_code (VARCHAR(4) DEFAULT '5' — '5' Mensual | '4' Quincenal)`
    - `days_worked (INT NOT NULL CHECK (days_worked BETWEEN 1 AND 30))`
    - `worked_salary_cop (INT NOT NULL)`, `transport_allowance_cop (INT DEFAULT 0)`, `commissions_cop (INT DEFAULT 0)`
    - `overtime_and_surcharges_json (JSONB DEFAULT '[]')` — Arreglo de horas extras y recargos (`accrual_type_code`, `quantity`, `percentage`, `amount_cop`, `start_date`, `end_date`).
    - `overtime_total_cop (INT DEFAULT 0)`
    - `health_deduction_cop (INT NOT NULL)`, `pension_deduction_cop (INT NOT NULL)`, `other_deductions_cop (INT DEFAULT 0)`
    - `gross_accrued_cop (INT NOT NULL)`, `total_deductions_cop (INT NOT NULL)`, `net_payable_cop (INT NOT NULL)`
    - `payment_date (DATE NOT NULL)`, `status (DRAFT | VALIDATED_DIAN | REJECTED_DIAN | ANNULLED_BY_ADJUSTMENT)`
    - `factus_payroll_number (VARCHAR(64) NULL — ej. 'NEF110')`, `cune (VARCHAR(128) NULL)`, `pdf_url (TEXT NULL)`, `xml_url (TEXT NULL)`
    - `response_payload_json (JSONB NULL)`, `last_error_message (TEXT NULL)`
    - `created_by (UUID FK)`, `created_at (TIMESTAMPTZ)`
    - `UNIQUE(tenant_id, reference_code)`.

---

## 5. Algoritmos Matemáticos de Transformación para Factus API v2 (`packages/shared`)

### 5.1 Algoritmo de Mapeo de Factura y Cálculo de `cash_rounding_amount` (`factus-v2-mapper.calculator.ts`)

Dada una `Order` o `DiningAccount` cerrada en Karta con sus `OrderItem` (y recargo de domicilio opcional `delivery_fee_cop`) y sus pagos aprobados (`Payment[]`):

1. **Transformación de cada `OrderItem` ($i$) al formato `FactusV2BillItem`:**
   - Sea $Q_i = \text{quantity}$, $L_i = \text{line\_total\_cop}$ (después de descuento de línea) y $r_i = \text{tax\_rate\_bp} / 10000$ (ej. $0.08$ para INC 8 % o $0.19$ para IVA 19 %).
   - Si el modo del restaurante es `FINAL_PRICE_NO_BREAKDOWN` o el ítem es exento/sin impuesto ($r_i == 0$):
     - $\text{unitBasePrice}_i = \text{roundTo2Decimals}(L_i / Q_i)$
     - `taxes`: `[{ is_excluded: true }]`
     - $\text{factusLineTotal}_i = \text{roundTo2Decimals}(\text{unitBasePrice}_i \times Q_i)$
   - Si el modo es `TAX_INCLUDED_DISCRIMINATED` o `BASE_PLUS_TAX` con $r_i > 0$:
     - El precio base unitario antes de impuesto con 2 decimales es:
       $$\text{unitBasePrice}_i = \text{roundTo2Decimals}\left(\frac{L_i}{Q_i \times (1 + r_i)}\right)$$
     - El subtotal base de la línea en Factus es $B_i = \text{roundTo2Decimals}(\text{unitBasePrice}_i \times Q_i)$ y el impuesto calculado por Factus es $T_i = \text{roundTo2Decimals}(B_i \times r_i)$.
     - $\text{factusLineTotal}_i = \text{roundTo2Decimals}(B_i + T_i)$.
2. **Adición de Domicilio (`delivery_fee_cop`) y Propina (`tip_cop`):**
   - Si `delivery_fee_cop > 0`, se añade una línea en `items` con `code_reference: "DOMICILIO"`, `name: "Servicio de domicilio"`, `quantity: "1.00"`, `price: delivery_fee_cop.toFixed(2)` y `taxes: [{ is_excluded: true }]`.
   - Si `tip_cop > 0`, se añade en `allowance_charges` el objeto `{ concept_type: "03", is_surcharge: true, reason: "Propina voluntaria", base_amount: subtotal_products_cop.toFixed(2), amount: tip_cop }`.
3. **Conciliación con `cash_rounding_amount`:**
   - Sea $\text{Total}_{\text{Factus}} = \sum \text{factusLineTotal}_i + \text{delivery\_fee\_cop} + \text{tip\_cop}$.
   - Sea $\text{Total}_{\text{Pagos}} = \sum \text{Payment.amount\_cop} = \text{grand\_total\_cop}$.
   - Se define:
     $$\text{cash\_rounding\_amount} = (\text{Total}_{\text{Pagos}} - \text{Total}_{\text{Factus}}).\text{toFixed}(2)$$
     *(Nota: Siguiendo el ejemplo oficial `"Redondeo en medios de pago"` de `api-factus-v2.json`, cuando los ítems suman `260564.81` y los medios de pago suman `260550`, `cash_rounding_amount` es `"-14.81"`).*

### 5.2 Algoritmo de Liquidación de Nómina Gastronómica (`payroll.calculator.ts`)

Para un empleado con salario mensual base $S_{\text{base}}$ y días trabajados $D \in [1, 30]$:
1. **Sueldo proporcional (`accruals.suel.amount`):**
   $$S_{\text{trabajado}} = \text{Math.round}\left(\frac{S_{\text{base}} \times D}{30}\right)$$
2. **Valor de la hora ordinaria ($V_{\text{hora}}$):**
   Conforme a la jornada laboral colombiana vigente (divisor mensual configurable en el tenant, por defecto `220` horas mensuales):
   $$V_{\text{hora}} = \frac{S_{\text{base}}}{220}$$
3. **Cálculo de Horas Extras y Recargos (`accruals.hora`):**
   - Para los códigos `'1'` (Extra Diurna 25 %), `'2'` (Extra Nocturna 75 %), `'4'` (Extra Dom/Fest Diurna 100 %) y `'6'` (Extra Dom/Fest Nocturna 150 %), son horas adicionales a la jornada ordinaria:
     $$\text{Monto} = \text{Math.round}\left(V_{\text{hora}} \times \left(1 + \frac{\text{porcentaje}}{100}\right) \times \text{cantidad}\right)$$
   - Para los códigos de recargo puro sobre la jornada ordinaria `'3'` (Recargo Nocturno 35 %), `'5'` (Recargo Dom/Fest 75 %) y `'7'` (Recargo Dom/Fest Nocturno 110 %):
     $$\text{Monto} = \text{Math.round}\left(V_{\text{hora}} \times \left(\frac{\text{porcentaje}}{100}\right) \times \text{cantidad}\right)$$
4. **Base de Seguridad Social (IBC) y Deducciones (`deductions.salu` y `deductions.pens`):**
   - $\text{IBC} = S_{\text{trabajado}} + \text{Comisiones} + \sum \text{Monto}_{\text{horas\_extras\_y\_recargos}}$ *(excluyendo el auxilio de transporte `tra`)*.
   - $\text{Salud (4 \%)} = \text{Math.round}(\text{IBC} \times 0.04)$
   - $\text{Pensión (4 \%)} = \text{Math.round}(\text{IBC} \times 0.04)$.

### 5.3 Ecuación del Estado de Resultados Operativo (P&L en `reporting`)

El endpoint `GET /api/v1/reports/profit-and-loss` consolida en tiempo real la rentabilidad del restaurante en el periodo:
1. **Ingresos Operativos Netos de Ventas ($\text{Ingresos}_{\text{netos}}$):** Venta neta de productos + recargos de domicilio (sin incluir impuestos INC/IVA recaudados para la DIAN ni propinas destinadas al personal).
2. **Costo de Ventas Teórico por Recetas ($\text{COGS}_{\text{recetas}}$):** Suma de `ABS(quantity_delta_milli) * unit_cost_cop / 1000` de todos los movimientos `SALE_CONSUMPTION` (menos `SALE_REVERSAL` más `WASTE_OUT`) en `InventoryMovement`.
3. **Utilidad Bruta Gastronómica:** $\text{Utilidad}_{\text{bruta}} = \text{Ingresos}_{\text{netos}} - \text{COGS}_{\text{recetas}}$.
4. **Gastos Operativos ($\text{OPEX}$):** Suma de `ExpenseDocument` confirmados en categorías distintas a compra de insumos inventariables (`RENT`, `UTILITIES`, `MAINTENANCE`, `PACKAGING`, `MARKETING`, `SERVICES`, `OTHER`).
5. **Costo de Personal ($\text{Nómina}$):** Suma de `gross_accrued_cop` de las liquidaciones `PayrollSettlement` del periodo.
6. **Utilidad Operativa Neta (EBITDA Operativo):**
   $$\text{Utilidad}_{\text{operativa}} = \text{Utilidad}_{\text{bruta}} - \text{OPEX} - \text{Nómina}$$

---

## 6. Especificación de Endpoints REST en NestJS (`/api/v1`)

### 6.1 Configuración Factus v2, Rangos y Consulta de Adquirentes DIAN (`@RequireModule('invoicing.electronic_dian')`)
- `GET / PUT /api/v1/admin/factus/config` — Configura credenciales OAuth2 de Factus v2 (cifradas con AES-256-GCM), define `invoicing_trigger_mode` (`'AUTO_ALWAYS'` | `'CASHIER_CHOICE'`) y prueba la conexión contra `POST /oauth/token`.
- `POST /api/v1/admin/factus/numbering-ranges/sync` — Consulta `GET /v2/numbering-ranges` y `GET /v2/numbering-ranges/payrolls` en Factus v2 y sincroniza los rangos activos de la sucursal.
- `GET /api/v1/invoicing/acquirer-lookup?doc_code=13&doc_number=123456789` — **Servicio de autocompletado en Caja POS:** Busca primero en la tabla local `tax_customer_profiles`; si no existe, consume en vivo `GET {{url_api}}/v2/dian/acquirer?identification_document_code=:doc_code&identification_number=:doc_number` en Factus v2 y devuelve nombre/razón social y correo del cliente para autocompletar en 1 segundo cuando el cliente pide factura a su nombre.

### 6.2 Emisión de Facturas Electrónicas, Notas Crédito y Notas Débito (`@RequireModule('invoicing.electronic_dian')`)
- `POST /api/v1/orders/:orderId/electronic-invoice` y `POST /api/v1/accounts/:accountId/electronic-invoice`:
  - **Contrato de entrada (`EmitElectronicInvoiceDto`):**
    - `customer_mode`: `'FINAL_CONSUMER'` | `'NAMED_CUSTOMER'`.
    - `customer` *(obligatorio solo si `customer_mode === 'NAMED_CUSTOMER'`)*: `{ identification_document_code, identification, dv?, legal_organization_code, names?, company?, email, phone?, address?, municipality_code?, tribute_code? }`.
  - **Lógica de selección de payload hacia Factus v2:**
    - Ambos modos (`'FINAL_CONSUMER'` y `'NAMED_CUSTOMER'`) consumen el endpoint **`POST {{url_api}}/v2/bills/validate`** de Factus v2.
    - Si `customer_mode === 'FINAL_CONSUMER'`, construye el nodo `customer` con `identification_document_code: "13"`, `identification: "222222222222"`, `names: "Consumidor Final"` y `send_email: false`.
    - Si `customer_mode === 'NAMED_CUSTOMER'`, guarda/actualiza al cliente en `TaxCustomerProfile` y construye el nodo `customer` completo con `send_email: true`.
  - Retorna el documento fiscal validado (`factus_number`, `cufe_or_cude`, `qr_url`, `qr_image_base64`) listo para imprimir en tirilla térmica de 58mm/80mm.
- `POST /api/v1/electronic-invoices/:fiscalDocId/credit-note` — Emite y valida una Nota Crédito (`POST /v2/credit-notes/validate`) referenciando el `bill_number` validado, con código de concepto de corrección (`1` devolución parcial, `2` anulación total, `3` rebaja/descuento, `4` ajuste de precio).
- `GET /api/v1/electronic-invoices/:fiscalDocId/pdf` y `/xml` — Descarga el PDF o XML oficial desde `/v2/bills/:number/download-pdf` o `/v2/credit-notes/:number/download-pdf`.
- `POST /api/v1/electronic-invoices/:fiscalDocId/send-email` — Envía la factura electrónica al correo del cliente mediante `/v2/bills/:number/send-email`.

### 6.3 Módulo Financiero: Proveedores, Gastos, Documento Soporte y Recepción RADIAN (`@RequireModule('finance.expenses_dse')`)
- `GET / POST / PATCH /api/v1/admin/suppliers` — CRUD de proveedores (formales con factura electrónica e informales sujetos a Documento Soporte).
- `GET / POST /api/v1/branches/:branchId/expenses` — Registra una compra o gasto operativo (`ExpenseDocument`). Si incluye insumos vinculados a `Ingredient`, crea automáticamente la entrada de compra (`PURCHASE_ENTRY`) en el Kardex.
- `POST /api/v1/expenses/:expenseId/payments` — Registra el pago total o abono a una cuenta por pagar (`ExpensePayment`). Si `method === 'CASH'` y hay turno abierto, registra automáticamente la salida en `CashShiftMovement`.
- `POST /api/v1/expenses/:expenseId/support-document` — Si el proveedor no está obligado a facturar, transmite y valida el **Documento Soporte Electrónico** ante Factus v2 (`POST /v2/support-documents/validate`) y permite emitir Notas de Ajuste (`POST /v2/adjustment-notes/validate`).
- `GET / POST /api/v1/branches/:branchId/receptions` y `PATCH /api/v1/receptions/:id/radian-events/:eventType` — Sincroniza facturas recibidas (`GET /v2/receptions/bills`, `POST /v2/receptions/upload`) y emite los eventos RADIAN (`030`, `032`, `033`, `034`) mediante `PATCH /v2/receptions/bills/:bill_id/radian/events/:event_type`.
- `GET /api/v1/reports/profit-and-loss` — Devuelve el Estado de Resultados Operativo (P&L) del periodo.

### 6.4 Módulo de Nómina Electrónica (`@RequireModule('payroll.electronic_dian')`)
- `GET / POST / PATCH /api/v1/admin/branches/:branchId/employees` — CRUD de perfiles contractuales de empleados (`EmployeeProfile`).
- `POST /api/v1/branches/:branchId/payrolls/calculate-preview` — Calcula el desglose exacto de devengados (`suel`, `tra`, `comi`, `hora`) y deducciones (`salu`, `pens`) del empleado en el periodo.
- `POST /api/v1/branches/:branchId/payrolls` — Guarda la liquidación (`PayrollSettlement`) y la transmite a Factus v2 (`POST /v2/payrolls`), almacenando el número oficial (`NEF...`) y el código `CUNE`.
- `POST /api/v1/payrolls/:settlementId/adjustment-note` — Emite Nota de Ajuste o Eliminación de Nómina (`POST /v2/adjustment-payrolls`).

---

## 7. Matriz de Casos de Prueba Obligatorios (Fase 09)

### 7.1 Pruebas Unitarias (`packages/shared`)
- **`TC-09-U01` (Mapeo de Ítems con INC 8 % Incluido, Propina, `cash_rounding_amount` y Modos de Cliente):**
  - Dada una cuenta de salón con 2 productos de `$16.000` c/u (INC 8 % incluido $\rightarrow$ subtotal `$32.000`), más una botella de agua de `$190.000` (INC 8 % incluido) y una propina voluntaria de `$10.000` (`grand_total_cop = 232000`):
  - `factus-v2-mapper.calculator.ts` debe generar precios unitarios base con 2 decimales (`"14814.81"` y `"175925.93"`), enviar la propina de `10000` dentro de `allowance_charges` (`concept_type: "03"`, `is_surcharge: true`), y calcular `cash_rounding_amount` exacto para que el total validado coincida al centavo con los `$232.000` de `payment_details`.
  - Cuando `customer_mode === 'FINAL_CONSUMER'`, el objeto `customer` generado debe ser exactamente `{ identification_document_code: "13", identification: "222222222222", names: "Consumidor Final" }` con `send_email: false`; cuando `customer_mode === 'NAMED_CUSTOMER'`, debe incluir todos los campos fiscales del adquirente con `send_email: true`.
- **`TC-09-U02` (Liquidación de Nómina con Recargo Nocturno y Dominical):**
  - Dado un empleado con salario base `$2.800.000`, `30` días trabajados, auxilio de transporte `$249.095`, comisiones `$300.000`, `5` horas extra diurnas (`code: "1"`, `25 %`), `2` horas extra nocturnas (`code: "2"`, `75 %`) y `3` horas de recargo nocturno (`code: "3"`, `35 %`):
  - `payroll.calculator.ts` debe calcular el IBC sumando sueldo + comisiones + horas extras/recargos (sin auxilio de transporte) y deducir exactamente el `4 %` de salud (`salu`) y `4 %` de pensión (`pens`), armando el JSON idéntico al esquema de `POST /v2/payrolls` de `api-factus-v2.json`.
- **`TC-09-U03` (Cálculo del Estado de Resultados Operativo P&L):**
  - Dados ingresos netos sin impuestos de `$10.000.000`, costo de insumos por recetas (`COGS`) de `$3.500.000`, gastos operativos (`OPEX`) de `$2.000.000` y nómina devengada de `$2.500.000`, la calculadora debe retornar `grossProfitCop = 6500000` y `operatingProfitCop = 2000000`.

### 7.2 Pruebas de Integración con Mock Server de Factus API v2 (`apps/api/test/`)
- **`TC-09-I01` (Flujo Dual en Caja POS: Factura a Consumidor Final vs. Factura Nominativa con `GET /v2/dian/acquirer`):**
  - **Escenario A (`FINAL_CONSUMER`):** Al cerrar una orden y elegir `"Consumidor Final"`, `POST /api/v1/orders/:id/electronic-invoice` NO llama a `/v2/dian/acquirer`, envía directamente `POST /v2/bills/validate` con `identification: "222222222222"` y guarda el `CUFE`.
  - **Escenario B (`NAMED_CUSTOMER`):** Al cerrar una `DiningAccount` donde el cliente pide factura a su nombre, el cajero consulta `GET /api/v1/invoicing/acquirer-lookup?doc_code=13&doc_number=1399991` (que consume `GET /v2/dian/acquirer`), autocompleta nombre y correo, y `POST /api/v1/accounts/:id/electronic-invoice` envía `POST /v2/bills/validate` con los datos del cliente, persistiendo su perfil en `tax_customer_profiles` y el `CUFE` en `electronic_fiscal_documents`.
- **`TC-09-I02` (Recuperación ante Colisión de Borrador No Validado en Factus v2):**
  - Si un primer intento a `/v2/bills/validate` falla dejando un borrador no validado en Factus con el mismo `reference_code`, al reintentar la emisión el servicio invoca automáticamente `DELETE /v2/bills/destroy/reference/:reference_code` y completa la validación en `/v2/bills/validate` con estado `VALIDATED`.
- **`TC-09-I03` (Emisión de Nota Crédito Electrónica Vinculada):**
  - Sobre una factura en estado `VALIDATED`, ejecutar `POST /api/v1/electronic-invoices/:id/credit-note` transmite a `/v2/credit-notes/validate` enviando `bill_number`, guarda el `CUDE` de la nota crédito y actualiza la factura original a `ANNULLED_BY_NOTE`.
- **`TC-09-I04` (Registro de Gasto en Efectivo, Vinculación con Turno de Caja y Documento Soporte):**
  - Se registra una compra de insumos a un proveedor no obligado a facturar pagada en efectivo (`CASH`) desde un turno abierto (`CashShift`):
  - El sistema crea automáticamente el movimiento `CASH_OUT` (`SUPPLIER_PAYMENT`) en el turno de caja, incrementa el stock en `InventoryMovement` (`PURCHASE_ENTRY`) y emite el Documento Soporte Electrónico en `POST /v2/support-documents/validate` guardando el número `SEDS...`.
- **`TC-09-I05` (Recepción de Factura de Compra a Crédito y Emisión de Eventos RADIAN `030`, `032`, `033`):**
  - Al cargar una factura recibida en `/v2/receptions/upload` y emitir sucesivamente los eventos `030` (Acuse), `032` (Recibo del bien) y `033` (Aceptación expresa) mediante `PATCH /api/v1/receptions/:id/radian-events/:eventType`, el registro actualiza sus marcas de tiempo y queda con `completed_events = true`.
- **`TC-09-I06` (Liquidación y Transmisión de Nómina Electrónica a `/v2/payrolls`):**
  - Al liquidar el mes de un mesero con recargos nocturnos y enviar `POST /api/v1/branches/:branchId/payrolls`, el backend transmite el JSON a `/v2/payrolls` usando el `numbering_range_id` tipo ULID, almacena el número `NEF...` y el `CUNE`, e incorpora ese gasto de personal en el reporte `GET /api/v1/reports/profit-and-loss`.
- **`TC-09-I07` (Aislamiento Multi-Tenant de Credenciales Factus y Datos Financieros):**
  - El *Restaurante A* jamás puede usar las credenciales Factus, ver proveedores, emitir notas crédito ni consultar nóminas o el P&L del *Restaurante B*.

---

## 8. Secuencia de Prompts Acotados para Ejecutar la Fase 09 con Gemini

Adjunta `DEFINICION_TECNICA.md` (v2.5.0), `STACK_VERSIONS.md` y este archivo `FASE_08_MODULO_FINANCIERO_NOMINA_Y_FACTUS_V2.md`, solicitando los siguientes **5 pasos en orden**:

### Paso 9.1: Catálogo Factus v2, Calculadoras Puras (Mapeador con Redondeo, Nómina y P&L) y Esquemas Zod en `packages/shared`
> **Prompt 9.1:** *"Con base en `FASE_08_MODULO_FINANCIERO_NOMINA_Y_FACTUS_V2.md`, actualiza `modules.catalog.ts` con los módulos `invoicing.electronic_dian`, `finance.expenses_dse` y `payroll.electronic_dian`, y genera en `packages/shared` el catálogo `factus-v2.catalog.ts`, las calculadoras puras `factus-v2-mapper.calculator.ts` (conversión de precios con impuesto incluido a base de 2 decimales, soporte de `FINAL_CONSUMER` vs. `NAMED_CUSTOMER`, propinas en `allowance_charges` y `cash_rounding_amount`), `payroll.calculator.ts` (liquidación laboral y horas extras/recargos), los esquemas Zod en `factus-finance-payroll.schema.ts` y las pruebas unitarias `TC-09-U01` a `TC-09-U03`. Sin TODOs ni código incompleto."*
- **Puerta Manual 9.1:** `pnpm --filter @restaurante-saas/shared typecheck && pnpm --filter @restaurante-saas/shared test`.

### Paso 9.2: Migración Prisma de Fase 09 (Tablas Factus v2, Gastos/Proveedores, RADIAN y Nómina) y Cliente HTTP `FactusV2ClientService`
> **Prompt 9.2:** *"Actualiza `apps/api/prisma/schema.prisma` y genera la migración SQL con políticas RLS para las 10 tablas de la Fase 09 (`factus_tenant_configs`, `branch_numbering_ranges`, `tax_customer_profiles`, `electronic_fiscal_documents`, `suppliers`, `expense_documents`, `expense_payments`, `received_supplier_invoices`, `employee_profiles` y `payroll_settlements`). Implementa en `apps/api/src/modules/factus-integration/` el cifrado AES-256-GCM de credenciales, `FactusAuthService` con caché y refresh de `/oauth/token`, y `FactusV2ClientService` cubriendo todos los endpoints de `api-factus-v2.json`."*
- **Puerta Manual 9.2:** `pnpm --filter @restaurante-saas/api prisma migrate deploy && pnpm --filter @restaurante-saas/api typecheck`.

### Paso 9.3: Módulo Backend `invoicing` (Facturas Consumidor Final y Nominativas, Notas Crédito/Débito, Acquirer Lookup y Tirilla Térmica DIAN)
> **Prompt 9.3:** *"Implementa completo en `apps/api/src/modules/invoicing/` el servicio y controladores de Facturación Electrónica DIAN con Factus v2: configuración de credenciales y `invoicing_trigger_mode`, sincronización de rangos, autocompletado de adquirentes (`GET /api/v1/invoicing/acquirer-lookup` con caché en `TaxCustomerProfile` y fallback a `/v2/dian/acquirer`), emisión de facturas sobre órdenes y cuentas de salón soportando `FINAL_CONSUMER` (`222222222222`) y `NAMED_CUSTOMER` con limpieza automática de borradores no validados, emisión de Notas Crédito y Notas Débito, y descarga de PDF/XML."*
- **Puerta Manual 9.3:** `pnpm --filter @restaurante-saas/api typecheck`.

### Paso 9.4: Módulos Backend `finance` (Gastos, Cuentas por Pagar, Documento Soporte, RADIAN y P&L) y `payroll` (Nómina Electrónica) + Pruebas de Integración
> **Prompt 9.4:** *"Implementa completos en `apps/api/src/modules/` el módulo `finance` (CRUD de proveedores, registro de compras/gastos conectado con Kardex y con `CashShiftMovement`, emisión de Documento Soporte y Notas de Ajuste en Factus v2, recepción de facturas con eventos RADIAN y reporte `GET /api/v1/reports/profit-and-loss`) y el módulo `payroll` (empleados, liquidación de nómina con recargos y transmisión a `/v2/payrolls` y `/v2/adjustment-payrolls`), junto con las pruebas de integración `TC-09-I01` a `TC-09-I07` en `apps/api/test/`."*
- **Puerta Manual 9.4:** `pnpm --filter @restaurante-saas/api typecheck && pnpm --filter @restaurante-saas/api test`.

### Paso 9.5: Vistas Frontend en React (`apps/web`) — Selector en Caja POS (Consumidor Final vs. Cliente DIAN), Consola Financiera y Consola de Nómina
> **Prompt 9.5:** *"Implementa en `apps/web` las interfaces completas de la Fase 09: (1) En el modal de cobro de Pedidos y Salón, agrega el selector rápido de 3 botones ('Consumidor Final 222222222222', 'A nombre de Cliente CC/NIT' con búsqueda instantánea en `/api/v1/invoicing/acquirer-lookup`, y 'Solo Recibo Interno' si `invoicing_trigger_mode === 'CASHIER_CHOICE'`) junto con la impresión de tirilla térmica 58mm/80mm con QR fiscal y CUFE; (2) Consola Financiera (`src/features/finance/`) con Proveedores, Compras/Cuentas por Pagar, emisión de Documento Soporte en 1 clic, buzón RADIAN y dashboard de Estado de Resultados (P&L); y (3) Consola de Nómina (`src/features/payroll/`) con contratos de empleados, calculadora de recargos nocturnos/dominicales y emisión de Nómina Electrónica DIAN."*
- **Puerta Manual 9.5 (Cierre de Fase 09):** `pnpm turbo run typecheck && pnpm turbo run test && pnpm --filter @restaurante-saas/web build`.