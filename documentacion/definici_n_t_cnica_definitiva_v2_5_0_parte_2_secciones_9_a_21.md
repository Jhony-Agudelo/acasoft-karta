# Definición Técnica Definitiva — Karta (Plataforma SaaS Modular para Restaurantes)

**Documento:** `DEFINICION_TECNICA.md` (Parte 2: Secciones 9 a 21)  
**Versión:** 2.5.0 — Incorporación de Turnos y Arqueo Ciego de Caja (`payments.cash_shifts`), Inventario por Recetas/Escandallos (`inventory.recipes`), Reserva de Facturación Electrónica DIAN (`invoicing.electronic_dian`) y Conector Contable de Cierre Z (P-015)  
**Fecha:** 2026-11-03  
**Estado:** Versión Definitiva Aprobada para Implementación (Hitos 1, 2 y 3). Los puntos sujetos a validación comercial, contable o jurídica externa se marcan como `POR VALIDAR`.

---

## 9. Modelo de datos relacional consolidado (PostgreSQL)

### 9.1 Entidades y estructura exacta de tablas

**1. Tenancy, Identidad y Capacidades Modulares:**
- `Tenant`: `id (UUID PK)`, `name`, `slug (UNIQUE)`, `status`, `plan_id`, `tax_profile_mode (FINAL_PRICE_NO_BREAKDOWN | TAX_INCLUDED_DISCRIMINATED | BASE_PLUS_TAX)`, `default_tax_type (NONE | INC | IVA | EXEMPT)`, `default_tax_rate_bp (INT)`, `created_at`.
- `Branch`: `id (UUID PK)`, `tenant_id (FK)`, `name`, `slug`, `address`, `timezone (DEFAULT 'America/Bogota')`, `phone_whatsapp_e164`, `operating_hours_json (JSONB)`, `status`, `created_at`, `UNIQUE(tenant_id, slug)`.
- `BrandSettings`: `tenant_id (UUID PK/FK)`, `logo_url`, `primary_color`, `secondary_color`, `cover_url`, `description`, `public_domain (UNIQUE NULL)`.
- `User`:
  - `id (UUID PK)`, `email (UNIQUE)`, `password_hash`, `phone`, `name`, `status (ACTIVE | INVITED | SUSPENDED)`, `mfa_enabled (BOOLEAN DEFAULT FALSE)`
  - `must_change_password (BOOLEAN DEFAULT FALSE)` — Fuerza el cambio de contraseña en el primer inicio de sesión cuando fue creado o restablecido con clave temporal por un administrador.
  - `invite_or_reset_token_hash (VARCHAR NULL)`, `invite_or_reset_expires_at (TIMESTAMPTZ NULL)` — Permite activar cuenta o restablecer clave mediante enlace compartible por WhatsApp o correo transaccional de sistema en `identity-access` (sin depender del módulo opcional `notifications.email`).
  - `created_at (TIMESTAMPTZ)`.
- `Membership`: `id (UUID PK)`, `tenant_id (FK)`, `user_id (FK)`, `role_key (FK)`, `branch_scope (UUID[] NULL — NULL autoriza todas las sucursales del tenant)`, `is_active (BOOLEAN DEFAULT TRUE)`.
- `Role` (`key VARCHAR PK`, `name`), `Permission` (`key VARCHAR PK`, `description`), `RolePermission` (`role_key`, `permission_key`).
- `Module`: `key (VARCHAR PK)`, `name`, `depends_on_all (TEXT[])`, `depends_on_any (TEXT[])`, `is_core (BOOLEAN)`, `is_post_mvp (BOOLEAN DEFAULT FALSE)`.
- `PlanEntitlement`: `plan_id (VARCHAR)`, `module_key (FK)`, `limits_json (JSONB)`, `PK(plan_id, module_key)`.
- `TenantModuleSetting`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK NULL)`, `module_key (FK)`, `enabled (BOOLEAN)`, `config_json (JSONB)`, `updated_by (FK)`, `updated_at`.
- `OperatingProfile`: `key (VARCHAR PK)`, `name`, `module_keys (TEXT[])`, `default_pickup_delivery_policy (NONE | OFFLINE_ONLY)`, `default_config_json (JSONB)`. *(Al aplicar un perfil, `default_pickup_delivery_policy` se asigna solo a `PICKUP` y `DELIVERY`; la fila `DINE_IN` conserva siempre `payment_policy = 'OFFLINE_ONLY'`).*
- `BranchChannelPolicy`:
  - `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `fulfillment_type (PICKUP | DELIVERY | DINE_IN)`
  - `enabled (BOOLEAN)`, `payment_policy (NONE | OFFLINE_ONLY)`
  - `require_payment_before_preparation (BOOLEAN DEFAULT FALSE)` — Solo puede ser `true` cuando `payment_policy = 'OFFLINE_ONLY'` y `fulfillment_type IN ('PICKUP', 'DELIVERY')`.
  - `payment_instructions_json (JSONB NULL)` — Métodos aceptados e instrucciones de transferencia directa visibles para el cliente (Nequi, DaviPlata, Bre-B, titular y nota).
  - `active_status_flow (TEXT[])`, `tracking_enabled (BOOLEAN)`, `whatsapp_number_e164`
  - `require_table_pin (BOOLEAN DEFAULT FALSE)`, `unprocessed_expiry_minutes (INT DEFAULT 240)`
  - `UNIQUE(tenant_id, branch_id, fulfillment_type)`
  - `CHECK (fulfillment_type != 'DINE_IN' OR payment_policy = 'OFFLINE_ONLY')`
  - `CHECK (require_payment_before_preparation = FALSE OR (payment_policy = 'OFFLINE_ONLY' AND fulfillment_type IN ('PICKUP', 'DELIVERY')))`.

**2. Catálogo, Menú Digital y Códigos QR:**
- `Menu`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK NULL)`, `name`, `status (ACTIVE | ARCHIVED)`.
- `Category`: `id (UUID PK)`, `tenant_id (FK)`, `menu_id (FK)`, `name`, `description`, `sort_order (INT)`, `default_station_key (VARCHAR NULL)`, `availability_schedule_json (JSONB NULL)`, `is_active (BOOLEAN DEFAULT TRUE)`.
- `Product`: `id (UUID PK)`, `tenant_id (FK)`, `category_id (FK)`, `name`, `description`, `image_url`, `price_cop (INT)`, `tax_type (NONE | INC | IVA | EXEMPT)`, `tax_rate_bp (INT)`, `override_station_key (VARCHAR NULL)`, `allergen_tags (TEXT[])`, `status (ACTIVE | OUT_OF_STOCK | ARCHIVED)`, `sort_order (INT)`. *(El modo de cálculo de impuesto lo define `Tenant.tax_profile_mode`, sin booleano redundante en el producto).*
- `ProductVariant`: `id (UUID PK)`, `tenant_id (FK)`, `product_id (FK)`, `name`, `price_cop (INT)`, `status (ACTIVE | OUT_OF_STOCK)`, `sort_order (INT)`.
- `ModifierGroup`: `id (UUID PK)`, `tenant_id (FK)`, `name`, `min_selections (INT)`, `max_selections (INT)`, `is_required (BOOLEAN)`.
- `ModifierOption`: `id (UUID PK)`, `tenant_id (FK)`, `group_id (FK)`, `name`, `extra_price_cop (INT)`, `status (ACTIVE | OUT_OF_STOCK)`, `sort_order (INT)`.
- `ProductModifierGroup`: `product_id (FK)`, `group_id (FK)`, `sort_order (INT)`, `PK(product_id, group_id)`.
- `QrCodeLink`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `qr_token (VARCHAR(64) UNIQUE)`, `target_type (GENERAL_MENU | BRANCH_MENU | DINING_TABLE)`, `table_id (UUID FK NULL)`, `label`, `is_active (BOOLEAN DEFAULT TRUE)`, `revoked_at (TIMESTAMPTZ NULL)`, `created_at`.

**3. Clientes, Órdenes, Ajustes en Panel y Seguimiento:**
- `Customer`:
  - `id (UUID PK)`, `tenant_id (FK)`, `name`, `phone_e164` (`VARCHAR — al anonimizar se reemplaza por "ANON_" + UUID v4 aleatorio irreversible`), `privacy_consent_at (TIMESTAMPTZ)`
  - `is_blocked (BOOLEAN DEFAULT FALSE)`, `blocked_reason (TEXT NULL)`, `blocked_at (TIMESTAMPTZ NULL)`
  - `blocked_phone_hmac (VARCHAR(64) NULL)` — Guarda `HMAC_SHA256(FRAUD_PEPPER_SECRET, tenant_id + ":" + phone_e164)` únicamente cuando `is_blocked = true` para impedir que un número fraudulento se desbloquee solicitando anonimización, sin permitir revertir el teléfono por fuerza bruta sin el secreto del servidor.
  - `anonymized_at (TIMESTAMPTZ NULL)`, `last_order_at (TIMESTAMPTZ NULL)`, `created_at (TIMESTAMPTZ)`
  - `UNIQUE(tenant_id, phone_e164)`, `INDEX idx_customer_blocked_hmac ON customers(tenant_id, blocked_phone_hmac) WHERE blocked_phone_hmac IS NOT NULL`.
- `Order`:
  - `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `order_code (VARCHAR — ej. #A104)`
  - `origin (WHATSAPP | WEB_DIRECT | TABLE_QR | STAFF)`
  - `fulfillment_type (PICKUP | DELIVERY | DINE_IN)`
  - `status (REQUESTED | RECEIVED | ACCEPTED | PREPARING | READY | OUT_FOR_DELIVERY | DELIVERED | PICKED_UP | SERVED | REJECTED | CANCELLED | EXPIRED_UNPROCESSED)`
  - `payment_policy (NONE | OFFLINE_ONLY)` — Copia inmutable de la política vigente al momento de crearse el pedido (`DINE_IN` es siempre `OFFLINE_ONLY`).
  - `require_payment_before_preparation (BOOLEAN DEFAULT FALSE)` — Copia inmutable al crearse el pedido (`false` siempre en `NONE` y en `DINE_IN`).
  - `payment_status (NOT_TRACKED | UNPAID | PARTIALLY_PAID | PAID | COURTESY | WRITTEN_OFF)` — `NOT_TRACKED` cuando `payment_policy == 'NONE'`; en órdenes hijas de salón (`dining_account_id IS NOT NULL`) permanece en `UNPAID` mientras la cuenta está en `OPEN` o `REOPENED_ACCOUNTING` y hereda el estado final (`PAID`, `COURTESY` o `WRITTEN_OFF`) de su `DiningAccount` al cerrarse.
  - `customer_id (FK NULL)`, `customer_snapshot_json (JSONB — nombre, phone_e164, dirección y notas; redactado a "REDACTED" al anonimizar al cliente)`
  - `table_id (FK NULL)`, `dining_account_id (FK NULL)`
  - `public_token (VARCHAR(64) UNIQUE)`, `public_token_expires_at (TIMESTAMPTZ NULL)`
  - `idempotency_key (VARCHAR NULL)` con restricción `UNIQUE(tenant_id, idempotency_key)`
  - `subtotal_products_cop (INT)`, `discount_total_cop (INT DEFAULT 0)`, `delivery_fee_cop (INT DEFAULT 0)`, `tax_total_cop (INT DEFAULT 0)`, `tip_cop (INT DEFAULT 0)`, `grand_total_cop (INT)`, `paid_total_cop (INT DEFAULT 0)`, `uncollected_amount_cop (INT DEFAULT 0)`
  - `resolution_type (COURTESY | WRITTEN_OFF NULL)`, `resolution_reason (TEXT NULL)`, `resolved_by (UUID FK NULL)`, `resolved_at (TIMESTAMPTZ NULL)`
  - `tax_summary_snapshot_json (JSONB)`
  - `is_locked (BOOLEAN DEFAULT FALSE)`, `processed_at (TIMESTAMPTZ NULL)`, `processed_by (FK NULL)`, `created_at (TIMESTAMPTZ)`
  - `CHECK (fulfillment_type != 'DINE_IN' OR payment_policy = 'OFFLINE_ONLY')`
  - `CHECK (require_payment_before_preparation = FALSE OR (payment_policy = 'OFFLINE_ONLY' AND fulfillment_type IN ('PICKUP', 'DELIVERY')))`
  - `CHECK ((payment_policy = 'NONE' AND payment_status = 'NOT_TRACKED') OR (payment_policy = 'OFFLINE_ONLY' AND payment_status != 'NOT_TRACKED'))`
  - `CHECK (status != 'REQUESTED' OR paid_total_cop = 0)` — Restricción local en la tabla `orders` que impide que una fila en `REQUESTED` tenga `paid_total_cop > 0`.
- `OrderItem`:
  - `id (UUID PK)`, `tenant_id (FK)`, `order_id (FK)`, `product_id (FK NULL)`
  - `product_snapshot_json (JSONB — nombre, variante y descripción al momento de venta)`
  - `quantity (INT)`, `unit_price_cop (INT)`, `discount_cop (INT DEFAULT 0)`
  - `modifiers_snapshot_json (JSONB — opciones elegidas y sus precios unitarios)`
  - `tax_snapshot_json (JSONB — tipo de impuesto, tarifa bp, base gravable y monto de impuesto de la línea)`
  - `line_total_cop (INT)`
  - `station_key (VARCHAR NULL)`, `status (PENDING | PREPARING | READY | SERVED | CANCELLED)`, `notes (TEXT NULL)`
  - `inventory_deducted (BOOLEAN DEFAULT FALSE)` — Indica si el consumo de insumos por receta (`inventory.recipes`) ya fue descontado del Kardex para esta línea.
- `OrderStatusEvent`: `id (UUID PK)`, `tenant_id (FK)`, `order_id (FK)`, `from_status (VARCHAR NULL)`, `to_status (VARCHAR)`, `actor_id (FK NULL)`, `occurred_at (TIMESTAMPTZ)`, `reason (TEXT NULL)`, `visible_to_customer (BOOLEAN)`.
- `OrderEdit`: `id (UUID PK)`, `tenant_id (FK)`, `order_id (FK)`, `actor_id (FK)`, `occurred_at (TIMESTAMPTZ)`, `before_snapshot_json (JSONB)`, `after_snapshot_json (JSONB)`, `reason (TEXT NULL)`.

**4. Cocina, Salón, Mesas y Distribución Informativa por Persona:**
- `KitchenStation`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `key (VARCHAR)`, `name (VARCHAR)`, `sort_order (INT)`, `is_active (BOOLEAN DEFAULT TRUE)`, `UNIQUE(tenant_id, branch_id, key)`.
- `DiningArea`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `name`, `sort_order (INT)`, `is_active (BOOLEAN DEFAULT TRUE)`.
- `Table` (`dining_tables`): `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `area_id (FK)`, `code (VARCHAR)`, `capacity (INT)`, `status (FREE | OCCUPIED | PENDING_PAYMENT | RESERVED)`, `is_active (BOOLEAN DEFAULT TRUE)`, `UNIQUE(tenant_id, branch_id, code)`. *(El código QR de la mesa se gestiona en `QrCodeLink` con `target_type = 'DINING_TABLE'`).*
- `DiningAccount`:
  - `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `table_id (FK)`, `account_code (VARCHAR)`
  - `status (OPEN | REOPENED_ACCOUNTING | CLOSED | CANCELLED)` — `REOPENED_ACCOUNTING` permite ajustes contables de caja sin ocupar la mesa física ni colisionar con otra cuenta `OPEN` en la misma mesa.
  - `payment_status (UNPAID | PARTIALLY_PAID | PAID | COURTESY | WRITTEN_OFF)` — Toda cuenta de salón opera siempre bajo política `OFFLINE_ONLY`.
  - `guest_count (INT DEFAULT 1)`, `table_session_pin (VARCHAR(4) NULL)`
  - `subtotal_products_cop (INT DEFAULT 0)`, `discount_total_cop (INT DEFAULT 0)`, `tax_total_cop (INT DEFAULT 0)`, `tip_cop (INT DEFAULT 0)`, `grand_total_cop (INT DEFAULT 0)`, `paid_total_cop (INT DEFAULT 0)`, `uncollected_amount_cop (INT DEFAULT 0)`
  - `resolution_type (COURTESY | WRITTEN_OFF NULL)`
  - `split_rule (PROPORTIONAL | EQUAL | UNASSIGNED DEFAULT 'PROPORTIONAL')`
  - `opened_by (FK)`, `opened_at (TIMESTAMPTZ)`, `closed_by (FK NULL)`, `closed_at (TIMESTAMPTZ NULL)`, `close_reason (TEXT NULL)`
  - `reopened_by (UUID FK NULL)`, `reopened_at (TIMESTAMPTZ NULL)`, `reopen_reason (TEXT NULL)`
  - `version (INT DEFAULT 1)`.
  - Restricción parcial única: `CREATE UNIQUE INDEX idx_unique_open_account_per_table ON dining_accounts(tenant_id, branch_id, table_id) WHERE status = 'OPEN'`.
- `AccountDiner`: `id (UUID PK)`, `tenant_id (FK)`, `account_id (FK)`, `label (VARCHAR — ej. Persona 1, Persona 2)`, `sort_order (INT)`.
- `ConsumptionAssignment`:
  - `id (UUID PK)`, `tenant_id (FK)`, `account_id (FK)`, `diner_id (FK)`, `order_item_id (FK)`
  - `share_units (INT NOT NULL)` — partes enteras asignadas a este comensal.
  - `total_item_shares (INT NOT NULL)` — total de partes enteras en que se divide el ítem.
  - `assigned_amount_cop (INT NOT NULL)` — monto exacto en pesos ya conciliado (fuente de verdad persistida).

**5. Domicilios, Cobros Manuales, Auditoría y Suscripción SaaS:**
- `DeliveryZone`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `name`, `polygon_or_neighborhoods_json (JSONB)`, `delivery_fee_cop (INT)`, `min_order_cop (INT)`, `estimated_minutes_min (INT)`, `estimated_minutes_max (INT)`, `is_active (BOOLEAN DEFAULT TRUE)`.
- `DeliveryAddress`: `id (UUID PK)`, `tenant_id (FK)`, `customer_id (FK NULL)`, `address_line`, `neighborhood`, `reference_notes`, `city`.
- `Payment`:
  - `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`
  - `order_id (UUID FK NULL)`, `account_id (UUID FK NULL)`
  - `cash_shift_id (UUID FK NULL)` — Referencia al turno de caja abierto (`CashShift`) cuando `method = 'CASH'` y el módulo `payments.cash_shifts` está activo en la sucursal.
  - `method (CASH | POS_TERMINAL | MANUAL_TRANSFER)`, `amount_cop (INT > 0)`, `cash_received_cop (INT NULL)`, `change_given_cop (INT NULL)`, `reference_note (VARCHAR NULL)`
  - `status (APPROVED | VOIDED)`
  - `idempotency_key (VARCHAR NOT NULL)` con restricción `UNIQUE(tenant_id, idempotency_key)`
  - `created_by (FK)`, `voided_by (FK NULL)`, `voided_at (TIMESTAMPTZ NULL)`, `voided_reason (TEXT NULL)`, `created_at (TIMESTAMPTZ)`
  - `CHECK ((order_id IS NOT NULL AND account_id IS NULL) OR (order_id IS NULL AND account_id IS NOT NULL))`.
- `AuditEvent`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK NULL)`, `actor_id (FK NULL)`, `action`, `entity_type`, `entity_id`, `occurred_at (TIMESTAMPTZ)`, `metadata_json (JSONB — prohibido almacenar PII crudo de comensales)`.
- `Subscription` y `SubscriptionInvoice`: Control administrativo del plan comercial del restaurante en el SaaS.

**6. Turnos de Caja y Arqueo Ciego (`payments.cash_shifts` — Hito 3):**
- `CashShift` (`cash_shifts`):
  - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`, `shift_code (VARCHAR — ej. #T-015)`
  - `status (OPEN | CLOSED)`
  - `opened_by (UUID FK)`, `opened_at (TIMESTAMPTZ)`, `opening_cash_cop (INT NOT NULL CHECK (opening_cash_cop >= 0))`
  - `cash_sales_cop (INT DEFAULT 0)`, `cash_in_total_cop (INT DEFAULT 0)`, `cash_out_total_cop (INT DEFAULT 0)`
  - `expected_cash_cop (INT NULL)` — Calculado y congelado al cerrar el turno.
  - `declared_cash_cop (INT NULL CHECK (declared_cash_cop IS NULL OR declared_cash_cop >= 0))` — Efectivo físico contado y digitado a ciegas por el cajero al cierre.
  - `difference_cop (INT NULL)` — Diferencia exacta $\text{declared\_cash\_cop} - \text{expected\_cash\_cop}$ (`0` = cuadrado, `< 0` = faltante, `> 0` = sobrante).
  - `denominations_snapshot_json (JSONB NULL)` — Desglose opcional de billetes y monedas contados en el arqueo.
  - `closed_by (UUID FK NULL)`, `closed_at (TIMESTAMPTZ NULL)`, `closing_notes (TEXT NULL)`
  - Restricción parcial única: `CREATE UNIQUE INDEX idx_unique_open_shift_per_branch ON cash_shifts(tenant_id, branch_id) WHERE status = 'OPEN'`.
- `CashShiftMovement` (`cash_shift_movements`):
  - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`, `shift_id (UUID FK)`
  - `type (CASH_IN | CASH_OUT)`
  - `category (SUPPLIER_PAYMENT | PETTY_EXPENSE | CHANGE_FUND | OTHER)`
  - `amount_cop (INT NOT NULL CHECK (amount_cop > 0))`
  - `reason (TEXT NOT NULL)`, `reference_doc (VARCHAR NULL)`
  - `created_by (UUID FK)`, `created_at (TIMESTAMPTZ)`.

**7. Inventario de Insumos, Recetas y Kardex (`inventory.recipes` — Hito 3):**
- `Ingredient` (`ingredients`):
  - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`, `sku (VARCHAR NULL)`, `name (VARCHAR)`
  - `unit (GRAM | MILLILITER | UNIT)`
  - `current_stock_milli (BIGINT DEFAULT 0)` — Stock actual en milésimas enteras ($1000 = 1\text{ g}$, $1\text{ ml}$ o $1\text{ unidad}$).
  - `min_stock_milli (BIGINT DEFAULT 0)` — Umbral de alerta de agotamiento en milésimas enteras.
  - `cost_per_unit_cop (INT DEFAULT 0 CHECK (cost_per_unit_cop >= 0))` — Costo promedio en `COP` por cada unidad entera ($1000\text{ milésimas}$).
  - `is_active (BOOLEAN DEFAULT TRUE)`, `created_at (TIMESTAMPTZ)`
  - `UNIQUE(tenant_id, branch_id, name)`.
- `RecipeItem` (`recipe_items` — Escandallo en dos niveles):
  - `id (UUID PK)`, `tenant_id (UUID FK)`, `ingredient_id (UUID FK)`
  - `product_id (UUID FK NULL)`, `variant_id (UUID FK NULL)`, `modifier_option_id (UUID FK NULL)`
  - `quantity_milli (INT NOT NULL CHECK (quantity_milli > 0))` — Cantidad en milésimas consumida por cada unidad vendida del plato/variante o modificador.
  - `CHECK ((product_id IS NOT NULL AND modifier_option_id IS NULL) OR (product_id IS NULL AND variant_id IS NULL AND modifier_option_id IS NOT NULL))`.
- `InventoryMovement` (`inventory_movements` — Kardex inmutable):
  - `id (UUID PK)`, `tenant_id (UUID FK)`, `branch_id (UUID FK)`, `ingredient_id (UUID FK)`
  - `type (PURCHASE_ENTRY | SALE_CONSUMPTION | SALE_REVERSAL | WASTE_OUT | MANUAL_ADJUSTMENT)`
  - `quantity_delta_milli (BIGINT NOT NULL CHECK (quantity_delta_milli != 0))` — Positivo para entradas/reintegros, negativo para salidas/mermas.
  - `stock_after_milli (BIGINT NOT NULL)` — Saldo resultante del insumo inmediatamente después del movimiento.
  - `unit_cost_cop (INT NULL)`, `order_id (UUID FK NULL)`, `order_item_id (UUID FK NULL)`, `reason (TEXT NULL)`, `created_by (UUID FK NULL)`, `created_at (TIMESTAMPTZ)`.

### 9.2 Reglas de modelado e integridad de datos

- **Unidades monetarias y de inventario enteras:** Todos los importes monetarios en PostgreSQL se almacenan como enteros en pesos colombianos (`INT`, `COP`), y todas las cantidades de inventario se almacenan como enteros en milésimas de unidad (`BIGINT` / `INT`, donde $1000\text{ milésimas} = 1\text{ unidad base}$), erradicando errores de coma flotante.
- **Inmutabilidad histórica de política y precios:** Cada `Order` congela el `payment_policy` y el `require_payment_before_preparation` con los que fue creada, y cada `OrderItem` congela sus snapshots de producto, modificadores e impuestos.
- **Prohibición de borrado físico financiero y de kardex:** Las órdenes (`Order`), cuentas (`DiningAccount`), pagos (`Payment`), turnos de caja (`CashShift`), movimientos de kardex (`InventoryMovement`) y eventos de auditoría jamás ejecutan `DELETE` físico; utilizan estados de anulación/reversión con trazabilidad completa.
- **Índices y claves únicas encabezadas por `tenant_id`:** Toda clave única de negocio, índice de búsqueda y clave de idempotencia incluye `tenant_id` como primera columna (`UNIQUE(tenant_id, idempotency_key)` en `orders` y `payments`; `UNIQUE(tenant_id, branch_id, code)` en `dining_tables`; `INDEX(tenant_id, branch_id, status, created_at DESC)` en `orders`).

---

## 10. Flujos críticos paso a paso

### 10.1 Pedido por "WhatsApp simple" (Nivel 1: `origin = WHATSAPP`, `payment_policy = NONE`, `payment_status = NOT_TRACKED`)
1. El cliente arma el carrito en la web y registra nombre, **número de WhatsApp** (normalizado a `E.164`), modalidad (`PICKUP` o `DELIVERY`), dirección y notas, aceptando el tratamiento de datos.
2. El backend verifica los controles antifraude (que no exista un `Customer` bloqueado con ese `phone_e164` ni con su `blocked_phone_hmac` y que no supere el límite de 3 solicitudes abiertas), recalcula los precios finales y crea la solicitud en estado `REQUESTED` con `origin = 'WHATSAPP'`, `payment_policy = 'NONE'`, `require_payment_before_preparation = false` y `payment_status = 'NOT_TRACKED'`, generando el `order_code` (`#A104`) y el `public_token`.
3. El navegador redirige a `https://wa.me/<telefono_sucursal>` con el mensaje prellenado que incluye `#A104` y el detalle del pedido.
4. Cliente y comercio acuerdan por chat detalles finales (valor del domicilio, medio de pago y eventuales adiciones o cambios).
5. El comercio abre el **Panel Liviano (1 pantalla)**, ubica la tarjeta pendiente `#A104`, compara el número registrado con el del chat y, si hubo cambios, ajusta productos/cantidades o digita el `delivery_fee_cop` (quedando auditado en `OrderEdit`).
6. El comercio pulsa **"Procesar pedido"**: el estado pasa a `ACCEPTED`, la orden se bloquea (`is_locked = true`) y se abre WhatsApp hacia el número del cliente (`wa.me/<telefono_cliente>`) con el enlace público de resumen y seguimiento (`/t/<public_token>`), además del botón **"Copiar mensaje"**.
7. El comercio avanza los estados con un toque (`READY`, `OUT_FOR_DELIVERY`, `DELIVERED` / `PICKED_UP`), actualizando en tiempo real vía SSE la pantalla del cliente. Las solicitudes ignoradas que permanecen en `REQUESTED` (con `paid_total_cop = 0`) caducan a `EXPIRED_UNPROCESSED` sin dejar pagos huérfanos y nunca suman en ventas.

### 10.2 Pedido en `PICKUP` o `DELIVERY` con control de cobro, resolución y reversión (Nivel 2: política `OFFLINE_ONLY`)
1. El cliente arma su carrito en la web y elige `PICKUP` o `DELIVERY` (ya sea por `origin = 'WEB_DIRECT'` o por `origin = 'WHATSAPP'`). En el checkout visualiza las instrucciones de pago configuradas por la sede (`payment_instructions_json`: ej. números de Nequi, DaviPlata o llave Bre-B, o pago contra entrega).
2. El backend valida antifraude, horario, cobertura y pedido mínimo, y crea la orden con `payment_policy = 'OFFLINE_ONLY'` y `payment_status = 'UNPAID'`.
3. Si el pedido nació en `REQUESTED` (`origin = 'WHATSAPP'`), el operador primero lo confirma pulsando **"Procesar pedido"** (`ACCEPTED`) antes de poder registrarle cualquier pago manual.
4. Si la sucursal activó `require_payment_before_preparation = true` en ese canal (`PICKUP` o `DELIVERY`), una vez confirmada la orden (`ACCEPTED`), el backend impide su transición a `PREPARING` y su aparición en el KDS de cocina hasta que el cajero verifique el pago y registre el cobro en `payments.manual` (`payment_status = 'PAID'`). Si `require_payment_before_preparation = false`, la orden avanza normalmente a cocina y el cobro se registra al entregar o recoger (`CASH`, `POS_TERMINAL` o `MANUAL_TRANSFER`).
5. Si una orden aceptada o entregada no se cobra en su totalidad por cortesía o por resultar incobrable, un gerente/administrador ejecuta `POST /api/v1/orders/:orderId/resolve-uncollected` indicando `COURTESY` o `WRITTEN_OFF` y el motivo obligatorio, fijando `uncollected_amount_cop = grand_total_cop - paid_total_cop` y congelando financieramente la orden.
6. Si posteriormente el cliente regresa y paga el saldo que estaba en `WRITTEN_OFF` (o se corrige una `COURTESY`), el gerente/administrador ejecuta `POST /api/v1/orders/:orderId/revert-resolution` con motivo obligatorio (lo que limpia `uncollected_amount_cop = 0` y recalcula el estado a `UNPAID` o `PARTIALLY_PAID` mediante `recalculatePaymentState()`) y registra el cobro en `payments.manual`.

### 10.3 Pedido desde QR en mesa con confirmación de mesero (Nivel 3: `origin = TABLE_QR`, `fulfillment_type = DINE_IN`)
1. El comensal escanea el QR de su mesa y abre el menú resolviendo el `qr_token` desde `QrCodeLink` (`target_type = 'DINING_TABLE'`).
2. Si la sucursal exige `require_table_pin = true`, ingresa el PIN de 4 dígitos de la mesa; selecciona sus productos y confirma.
3. El backend recalcula precios y crea la orden en estado **`REQUESTED`** asociada a la mesa con `payment_policy = 'OFFLINE_ONLY'`, `require_payment_before_preparation = false` y `payment_status = 'UNPAID'`.
4. El mesero recibe alerta instantánea por SSE en su dispositivo móvil/panel (*"Nueva solicitud QR en Mesa M-04"*), verifica visualmente o con la mesa y pulsa **"Confirmar comanda"** (`ACCEPTED`).
5. La orden se suma a la `DiningAccount` activa de la mesa (incrementando `version`) y sus ítems se enrutan de inmediato a las estaciones correspondientes del KDS (`kitchen`).

### 10.4 Mesero en salón, distribución informativa por persona, cierre y reapertura contable/operativa (`dining` + `dining.consumption_split`)
1. El mesero abre una `DiningAccount` en una mesa libre (pasa a `OCCUPIED`) y agrega una o varias órdenes sucesivas durante la estancia.
2. Cuando los amigos piden saber cuánto le toca a cada uno, el mesero abre **"Asignar consumo por persona"**, crea `Persona 1`, `Persona 2`, `Persona 3` y asigna las cantidades o partes enteras de los platos compartidos.
3. El backend calcula y persiste en `ConsumptionAssignment` las partes (`share_units` / `total_item_shares`) y los montos exactos conciliados al peso (`assigned_amount_cop`), mostrando el subtotal informativo de cada persona sin alterar el `grand_total_cop` de la cuenta.
4. En caja se ejecuta el cierre de la `DiningAccount` por una de las dos vías autorizadas:
   - *Vía estándar por cobro total:* Caja registra el cobro sobre la `DiningAccount` en `payments.manual` (en un pago único o combinando medios hasta que `paid_total_cop == grand_total_cop`). En ese instante, `DiningAccount.payment_status` y el `payment_status` de todas sus órdenes hijas activas pasan a `PAID`, la cuenta pasa a `CLOSED` y, si estaba en `OPEN`, libera la mesa (`FREE`).
   - *Vía de cierre administrativo o saldo `$0` (`POST /api/v1/accounts/:accountId/close`):* Si `grand_total_cop == 0` (sin consumo válido), se cierra con motivo (`payment_status = 'PAID'`). Si existe saldo sin cobrar (`grand_total_cop > paid_total_cop`), un `BRANCH_MANAGER` o `TENANT_ADMIN` debe indicar la resolución `COURTESY` o `WRITTEN_OFF` y el motivo obligatorio; el sistema calcula `uncollected_amount_cop = grand_total_cop - paid_total_cop`, marca la cuenta y sus órdenes hijas con ese estado (`COURTESY` o `WRITTEN_OFF`), cierra la cuenta (`CLOSED`), libera la mesa si estaba en `OPEN` y registra en `AuditEvent`.
5. Si es necesario anular un cobro registrado por error en una cuenta ya cerrada o cobrar un saldo que se había cerrado como `WRITTEN_OFF` (incluso cuando la mesa física ya está ocupada por nuevos clientes), un `BRANCH_MANAGER` o `TENANT_ADMIN` ejecuta `POST /api/v1/accounts/:accountId/reopen` con `mode = 'ACCOUNTING_ONLY'` y motivo obligatorio: la cuenta pasa a `status = 'REOPENED_ACCOUNTING'` sin alterar `Table.status`, limpia `uncollected_amount_cop = 0`, recalcula el saldo con `recalculatePaymentState()`, permite las correcciones en caja y vuelve a cerrarse (`CLOSED`). Si en cambio el grupo sigue en la mesa libre y desea pedir más comida, ejecuta `reopen` con `mode = 'FULL_TABLE'`, pasando la cuenta a `OPEN` y la mesa a `OCCUPIED`.

### 10.5 Apertura de turno, pagos a proveedores por caja menor y arqueo ciego (`payments.cash_shifts`)
1. Al iniciar la jornada en una sucursal con `payments.cash_shifts` activo, el cajero cuenta el sencillo inicial en la gaveta (ej. `$100.000 COP`) y ejecuta `POST /api/v1/branches/:branchId/cash-shifts/open` creando el turno `#T-015` en estado `OPEN`.
2. Durante el turno, cada vez que registra un cobro manual con `method = 'CASH'` (por ejemplo, una cuenta de `$45.000` donde el cliente entrega un billete de `$50.000` y recibe `$5.000` de cambio), el pago se vincula a `#T-015` y suma `$45.000` netos a `cash_sales_cop`.
3. Si llega un proveedor de paso (ej. compra urgente de bolsas o cilantro por `$18.000` en efectivo), el cajero registra una salida menor mediante `POST /api/v1/cash-shifts/:shiftId/movements` con `type = 'CASH_OUT'`, `category = 'SUPPLIER_PAYMENT'`, `amount_cop = 18000` y el motivo/recibo.
4. Al terminar su turno, el cajero abre el modal **"Cerrar Turno (Arqueo Ciego)"**: el sistema no le muestra cuánto efectivo debería haber, sino que le pide contar los billetes y monedas de la gaveta y digitar el total físico (`declared_cash_cop`).
5. El backend calcula $\text{expected\_cash\_cop} = 100000 + \text{cash\_sales\_cop} + \text{cash\_in\_total\_cop} - 18000$, guarda `difference_cop = declared_cash_cop - expected_cash_cop`, cierra el turno (`CLOSED`), audita en `AuditEvent` y notifica al gerente cualquier descuadre.

### 10.6 Escandallo de recetas, descuento automático en cocina y Kardex (`inventory.recipes`)
1. El administrador o gerente crea en la sucursal los insumos base (`Carne de res` en `GRAM`, `Pan artesanal` en `UNIT`, `Queso cheddar` en `GRAM`), registra su compra inicial (`PURCHASE_ENTRY`) y define la receta de la *Hamburguesa Clásica* (`150.000 milésimas` = $150\text{ g}$ de carne + `1.000 milésimas` = $1\text{ und}$ de pan) y del modificador *Adición de Queso* (`30.000 milésimas` = $30\text{ g}$ de queso).
2. Cuando un pedido con `2 Hamburguesas Clásicas con Adición de Queso` avanza a estado `PREPARING` en cocina (o directamente a estado de entrega si se omite `PREPARING`), el backend verifica `OrderItem.inventory_deducted == false`, descuenta en la misma transacción $300\text{ g}$ de carne, $2\text{ panes}$ y $60\text{ g}$ de queso en `Ingredient.current_stock_milli`, inserta los 3 registros `SALE_CONSUMPTION` en `InventoryMovement` y marca `inventory_deducted = true`.
3. Si posteriormente la orden se cancela, el gerente elige si el plato no se cocinó (`RETURN_TO_STOCK`, lo que genera movimientos `SALE_REVERSAL` reintegrando los ingredientes al stock) o si ya se había preparado y se desecha (`WASTE`, conservando la salida como merma).

---

## 11. Reglas de integridad financiera para cobros manuales, turnos de caja, recálculo y resoluciones

- **Separación de máquinas de estado:** `Order.status` / `DiningAccount.status` evolucionan de forma independiente a `payment_status`.
- **Distinción estricta entre `NOT_TRACKED` y `UNPAID`:**
  - `NOT_TRACKED` aplica exclusivamente a órdenes de `PICKUP`/`DELIVERY` nacidas bajo `payment_policy = 'NONE'`. El backend rechaza con HTTP `409 Conflict` (`PAYMENT_NOT_ALLOWED_FOR_POLICY`) cualquier intento de registrar pagos manuales sobre una orden `NOT_TRACKED`.
  - `UNPAID` aplica a órdenes y cuentas nacidas bajo `payment_policy = 'OFFLINE_ONLY'` cuyo `paid_total_cop` es `$0 COP` y no tienen resolución activa.
- **Validación transaccional contra cobros en estado `REQUESTED` + `CHECK` local en `orders`:**
  - Como PostgreSQL no permite que un `CHECK` de `payments` consulte la tabla `orders`, la garantía se implementa en dos capas complementarias dentro de la misma transacción: (1) `ManualPaymentsService` bloquea la fila de `Order` con `SELECT ... FOR UPDATE` y verifica que `order.status != 'REQUESTED'` (lanzando HTTP `409 ORDER_MUST_BE_ACCEPTED_BEFORE_PAYMENT` si aún está en `REQUESTED`), y (2) al actualizar `orders.paid_total_cop`, la propia tabla `orders` evalúa su restricción local `CHECK (status != 'REQUESTED' OR paid_total_cop = 0)`, haciendo imposible que exista en base de datos un pedido en `REQUESTED` con pagos aplicados. Además, el scheduler de caducidad automática filtra `WHERE status = 'REQUESTED' AND paid_total_cop = 0`.
- **Prohibición de cobro directo sobre órdenes hijas de salón:** Toda orden con `dining_account_id IS NOT NULL` se cobra exclusivamente a través de su `DiningAccount` (`POST /api/v1/accounts/:accountId/payments/manual`). Intentar llamar a `POST /api/v1/orders/:orderId/payments/manual` sobre una orden de mesa responde HTTP `409 Conflict` (`PAY_VIA_DINING_ACCOUNT`), y la tabla `Payment` impone por base de datos `CHECK ((order_id IS NOT NULL AND account_id IS NULL) OR (order_id IS NULL AND account_id IS NOT NULL))`.
- **Vínculo con Turno de Caja (`payments.cash_shifts`):** Cuando el módulo `payments.cash_shifts` está activo en la sucursal, todo cobro con `method = 'CASH'` requiere un `CashShift` en estado `OPEN` (`409 OPEN_CASH_SHIFT_REQUIRED`), vinculando `Payment.cash_shift_id = shift.id`. Anular (`void`) un pago en efectivo exige que dicho pago pertenezca al turno `OPEN` actual (`409 CASH_SHIFT_ALREADY_CLOSED`).
- **Función única determinista de recálculo (`recalculatePaymentState`):**
  - Tanto al registrar un pago como al anular uno existente (`POST /api/v1/payments/:paymentId/void`), jamás se asigna `UNPAID` de forma fija: la función suma todos los pagos con `status = 'APPROVED'` de la orden o cuenta ($\text{paid\_total\_cop} = \sum \text{amount\_cop}$).
  - Si en una orden de `$45.000` había dos pagos de `$20.000` y `$25.000` (`PAID`) y se anula el de `$25.000`, `recalculatePaymentState()` actualiza `paid_total_cop = 20000` y deja la orden en **`PARTIALLY_PAID`** (saldo pendiente `$25.000`). Solo si se anulan todos los pagos ($\text{paid\_total\_cop} == 0$) pasa a **`UNPAID`**.
- **Congelamiento en estados cerrados o resueltos y reversión auditada:**
  - Mientras una orden tenga `payment_status IN ('COURTESY', 'WRITTEN_OFF')` o una `DiningAccount` tenga `status = 'CLOSED'`, el backend rechaza registrar nuevos pagos o anular pagos existentes (`409 ORDER_RESOLUTION_ACTIVE` / `409 ACCOUNT_IS_CLOSED`).
  - Para modificar pagos en esos casos, un gerente/administrador debe ejecutar primero `POST /api/v1/orders/:orderId/revert-resolution` o `POST /api/v1/accounts/:accountId/reopen` (`mode: 'ACCOUNTING_ONLY' | 'FULL_TABLE'`), lo que limpia `uncollected_amount_cop = 0`, recalcula el estado mediante `recalculatePaymentState()` y registra la reversión en `AuditEvent`.
- **Bloqueo pesimista, no reducción bajo lo pagado y no cancelación con pagos activos:**
  - Todo registro de pago exige `Idempotency-Key` validada mediante `UNIQUE(tenant_id, idempotency_key)` y bloquea con `SELECT ... FOR UPDATE` la orden o cuenta en PostgreSQL, rechazando con `409 PAYMENT_EXCEEDS_BALANCE` si `paid_total_cop + nuevo_monto > grand_total_cop`.
  - Ninguna edición ni descuento puede dejar `grand_total_cop < paid_total_cop` (`409 TOTAL_BELOW_PAID_AMOUNT`), y ninguna orden o cuenta con `paid_total_cop > 0` puede pasarse a `CANCELLED` o `REJECTED` sin anular antes sus pagos activos (`409 ORDER_HAS_ACTIVE_PAYMENTS`).

---

## 12. Especificación de API REST y Tiempo Real (`/api/v1`)

### 12.1 Autenticación, Recuperación de Acceso y Salud del Servicio
- `GET /api/v1/health` — Sonda de salud (liveness/readiness) verificando conectividad a PostgreSQL.
- `POST /api/v1/auth/register` — Registro inicial de organización + propietario.
- `POST /api/v1/auth/session`, `POST /api/v1/auth/refresh`, `DELETE /api/v1/auth/session`.
- `POST /api/v1/auth/change-password` — Cambio de contraseña (obligatorio al iniciar sesión con `must_change_password = true`).
- `POST /api/v1/auth/forgot-password` — Solicitud de recuperación de contraseña para propietarios (`TENANT_ADMIN`), enviando el token por el transporte de correo transaccional del núcleo `identity-access`.
- `POST /api/v1/auth/accept-invite` y `POST /api/v1/auth/reset-password` — Activación de cuenta o restablecimiento de clave mediante token de invitación/recuperación.

### 12.2 Rutas Públicas para el Comensal y OpenGraph (Con Rate Limiting)
- `GET /r/:restaurantSlug` y `GET /t/:publicOrderToken` — Sirven el HTML con meta-etiquetas OpenGraph dinámicas para vista previa en WhatsApp.
- `GET /api/v1/public/:restaurantSlug/branches` — Lista sedes activas, horarios, cobertura, canales habilitados e instrucciones de pago (`payment_instructions_json`).
- `GET /api/v1/public/:restaurantSlug/menu` — Devuelve marca y catálogo activo evaluando disponibilidad horaria.
- `GET /api/v1/public/qr/:qrToken` — Resuelve un código QR desde `QrCodeLink` sin exponer UUIDs internos.
- `POST /api/v1/public/orders` — Valida controles antifraude (rate limit por IP/teléfono, `Customer.is_blocked` y `blocked_phone_hmac`), recalcula precios en servidor con `Idempotency-Key` (`UNIQUE(tenant_id, idempotency_key)`) y crea la orden (`origin` + `fulfillment_type`).
- `GET /api/v1/public/orders/:publicOrderToken` — Resumen de orden con PII enmascarado, instrucciones de pago si está pendiente, leyenda fiscal DIAN y línea de tiempo de estados marcados.
- `GET /api/v1/public/orders/:publicOrderToken/events` — Stream **SSE** público para seguimiento en vivo del cliente.

### 12.3 Operación de Pedidos, Panel Liviano, Panel Completo y Cocina (KDS)
- `GET /api/v1/branches/:branchId/orders` — Lista filtrable por `status`, `payment_status` (`NOT_TRACKED`, `UNPAID`, `PARTIALLY_PAID`, `PAID`, `COURTESY`, `WRITTEN_OFF`), `origin`, `fulfillment_type`, fecha y búsqueda `q`.
- `GET /api/v1/branches/:branchId/orders/events` — Stream **SSE** autenticado con JWT (consumido vía `@microsoft/fetch-event-source`).
- `PATCH /api/v1/orders/:orderId/items` — Ajusta productos, cantidades y `delivery_fee_cop` antes de procesar (`OrderEdit`), validando `grand_total_cop >= paid_total_cop`.
- `POST /api/v1/orders/:orderId/process` — Pasa a `ACCEPTED`, fija `is_locked = true` y devuelve `whatsapp_client_url` + `copyable_message`.
- `PATCH /api/v1/orders/:orderId/status` — Ejecuta transiciones válidas de `OrderStatus` (validando `require_payment_before_preparation` antes de `PREPARING`, disparando el descuento de receta si `inventory.recipes` está activo y validando ausencia de pagos activos antes de `CANCELLED`/`REJECTED`).
- `GET /api/v1/orders/:orderId/status-history` — Historial unificado de `OrderStatusEvent`, `OrderEdit` y `Payment`.
- `GET /api/v1/kitchen/orders` y `PATCH /api/v1/kitchen/orders/:orderId/status` — Cola y actualización KDS (`@RequireModule('kitchen')`).

### 12.4 Operación de Salón, Distribución Informativa, Cobros Manuales y Resoluciones de Saldo
- `GET /api/v1/branches/:branchId/tables` — Plano de áreas, mesas y resumen de cuentas en `OPEN` o `REOPENED_ACCOUNTING` (`@RequireModule('dining')`).
- `POST /api/v1/branches/:branchId/accounts` — Abre `DiningAccount` en una mesa libre (`@RequireModule('dining')`).
- `POST /api/v1/accounts/:accountId/orders` — Agrega comanda a una cuenta en estado `OPEN` validando `expected_account_version`.
- `POST /api/v1/accounts/:accountId/transfer-table` — Traslada cuenta `OPEN` a otra mesa libre con auditoría.
- `PATCH /api/v1/accounts/:accountId/bill-preview` — Actualiza propina voluntaria/descuentos (validando `grand_total_cop >= paid_total_cop`) y marca la mesa en `PENDING_PAYMENT`.
- `GET / PUT /api/v1/accounts/:accountId/consumption-distribution` — Calcula y guarda la distribución informativa por persona en partes enteras (`@RequireModule('dining', 'dining.consumption_split')`).
- `POST /api/v1/orders/:orderId/payments/manual` — Registra cobro manual sobre un pedido independiente confirmado (`status != 'REQUESTED'` bajo `SELECT ... FOR UPDATE`), calcula cambio, vincula `cash_shift_id` cuando aplica y ejecuta `recalculatePaymentState()` (`@RequireModule('payments.manual')`).
- `POST /api/v1/accounts/:accountId/payments/manual` — Registra cobro manual sobre una `DiningAccount` en estado `OPEN` o `REOPENED_ACCOUNTING`; cuando `paid_total_cop == grand_total_cop`, marca la cuenta y sus órdenes hijas como `PAID`, cierra la cuenta (`CLOSED`) y, si estaba en `OPEN`, libera la mesa (`FREE`) (`@RequireModule('dining', 'payments.manual')`).
- `POST /api/v1/orders/:orderId/resolve-uncollected` — *(Exclusivo `BRANCH_MANAGER` / `TENANT_ADMIN`)* Resuelve una orden independiente `OFFLINE_ONLY` con saldo pendiente como `COURTESY` (en estados `ACCEPTED` a `DELIVERED`/`PICKED_UP`) o `WRITTEN_OFF` (en estados `READY` a `DELIVERED`/`PICKED_UP`), fijando `uncollected_amount_cop`, motivo obligatorio y registro en `AuditEvent`.
- `POST /api/v1/orders/:orderId/revert-resolution` — *(Exclusivo `BRANCH_MANAGER` / `TENANT_ADMIN`)* Revierte una resolución `COURTESY` o `WRITTEN_OFF` con motivo obligatorio, limpia `uncollected_amount_cop = 0`, ejecuta `recalculatePaymentState()` y habilita el registro de cobros tardíos.
- `POST /api/v1/accounts/:accountId/close` — Cierra una `DiningAccount` (`OPEN` o `REOPENED_ACCOUNTING`) con `grand_total_cop == paid_total_cop` (`PAID`) o, si tiene saldo pendiente (`grand_total_cop > paid_total_cop`), exige rol `BRANCH_MANAGER` / `TENANT_ADMIN`, resolución explícita (`COURTESY` | `WRITTEN_OFF`) y motivo obligatorio, sincronizando sus órdenes hijas, liberando la mesa si estaba en `OPEN` y registrando en `AuditEvent`.
- `POST /api/v1/accounts/:accountId/reopen` — *(Exclusivo `BRANCH_MANAGER` / `TENANT_ADMIN`)* Recibe `mode: 'ACCOUNTING_ONLY' | 'FULL_TABLE'` y motivo obligatorio: en `'ACCOUNTING_ONLY'` pasa la cuenta a `REOPENED_ACCOUNTING` sin tocar `Table.status` (permitiendo corregir cobros aunque la mesa esté ocupada); en `'FULL_TABLE'` verifica que la mesa esté `FREE` y pasa la cuenta a `OPEN` y la mesa a `OCCUPIED`. En ambos modos limpia `uncollected_amount_cop = 0`, ejecuta `recalculatePaymentState()` y registra en `AuditEvent`.
- `POST /api/v1/payments/:paymentId/void` — Anula un cobro manual (`Payment.status = 'VOIDED'`) sobre una orden sin resolución activa o cuenta en `OPEN` / `REOPENED_ACCOUNTING` con motivo obligatorio, ejecuta `recalculatePaymentState()` y registra en `AuditEvent`.

### 12.5 Administración, Personal, Catálogo, Antifraude, Privacidad Ley 1581, Reportes y Suscripción
- `GET / PATCH /api/v1/admin/brand`, `GET / POST / PATCH /api/v1/admin/branches`.
- `GET / POST / PATCH /api/v1/admin/users` y `POST /api/v1/admin/users/:userId/reset-password` — Alta de personal (con contraseña temporal o enlace de invitación compartible por WhatsApp) y restablecimiento administrativo de clave.
- `GET / PATCH /api/v1/admin/branches/:branchId/channel-policies` — Configura políticas de cobro (`NONE` en `PICKUP`/`DELIVERY`, `OFFLINE_ONLY` fijo en `DINE_IN`), instrucciones de transferencia (`payment_instructions_json`) y `require_payment_before_preparation`.
- `GET /api/v1/admin/customers`, `PATCH /api/v1/admin/customers/:customerId/block` (bloqueo antifraude guardando `blocked_phone_hmac`) y `POST /api/v1/admin/customers/:customerId/anonymize` (supresión irreversible con UUID aleatorio en `Customer`, borrado de `DeliveryAddress` y redacción de `Order.customer_snapshot_json` conforme a la Ley 1581 de 2012).
- `GET / PATCH /api/v1/admin/tax-profile` — Configuración de los 3 modos tributarios.
- `GET / POST / PATCH /api/v1/admin/categories`, `/products`, `/modifier-groups`, `POST /api/v1/admin/products/import`.
- `GET / POST /api/v1/admin/branches/:branchId/qr-codes` y `POST /api/v1/admin/qr-codes/:qrId/revoke`.
- `GET / POST / PATCH /api/v1/admin/branches/:branchId/delivery-zones` y `/kitchen-stations`.
- `GET /api/v1/branches/:branchId/capabilities`, `GET / PATCH /api/v1/admin/modules`, `GET / PATCH /api/v1/admin/branches/:branchId/modules` (evaluando en lote el conjunto resultante $S_{\text{final}}$).
- `GET /api/v1/admin/operating-profiles` y `POST /api/v1/admin/operating-profiles/:key/apply`.
- `GET /api/v1/reports/sales` y `GET /api/v1/reports/sales/export-csv` (sin PII de comensales, `@RequireModule('reporting')`).
- `GET /api/v1/admin/subscription` y `PATCH /api/v1/platform/tenants/:tenantId/subscription`.

### 12.6 Turnos de Caja y Arqueo Ciego (`@RequireModule('payments.cash_shifts')` — Hito 3)
- `GET /api/v1/branches/:branchId/cash-shifts/current` — Devuelve el turno `OPEN` actual de la sucursal (ocultando `expected_cash_cop` y `cash_sales_cop` si el rol del usuario es `CASHIER` para garantizar el arqueo ciego).
- `POST /api/v1/branches/:branchId/cash-shifts/open` — Abre un nuevo turno de caja en la sucursal con `opening_cash_cop >= 0`.
- `POST /api/v1/cash-shifts/:shiftId/movements` — Registra una entrada (`CASH_IN`) o salida menor de efectivo / pago a proveedor de paso (`CASH_OUT`) con monto, categoría, motivo obligatorio y soporte opcional.
- `POST /api/v1/cash-shifts/:shiftId/close` — Ejecuta el cierre y arqueo ciego recibiendo `declared_cash_cop` (y desglose opcional de denominaciones), calcula y congela `expected_cash_cop` y `difference_cop`, pasa el turno a `CLOSED` y registra en `AuditEvent`.
- `GET /api/v1/branches/:branchId/cash-shifts` — Historial paginado de turnos cerrados con sus diferencias de arqueo y detalle de movimientos menores (exclusivo `BRANCH_MANAGER` / `TENANT_ADMIN`).

### 12.7 Inventario de Insumos, Escandallos y Kardex (`@RequireModule('inventory.recipes')` — Hito 3)
- `GET / POST / PATCH /api/v1/admin/branches/:branchId/ingredients` — CRUD de insumos de la sucursal (`GRAM`, `MILLILITER`, `UNIT`), costo unitario y filtro de alertas de stock bajo (`current_stock_milli <= min_stock_milli`).
- `GET / PUT /api/v1/admin/products/:productId/recipe` y `GET / PUT /api/v1/admin/modifier-options/:optionId/recipe` — Consulta y define la ficha técnica (escandallo en milésimas enteras) de un producto/variante o de una opción de modificador, calculando el costo teórico de materia prima.
- `POST /api/v1/branches/:branchId/inventory/movements` — Registra entradas por compra de insumos (`PURCHASE_ENTRY`), salidas por merma/daño (`WASTE_OUT`) o ajustes de conteo físico (`MANUAL_ADJUSTMENT`) con motivo obligatorio y auditoría.
- `GET /api/v1/branches/:branchId/inventory/kardex` — Consulta paginada y filtrable del historial inmutable de movimientos (`InventoryMovement`) por insumo, tipo de movimiento y rango de fechas.

---

## 13. Requisitos no funcionales (RNF), Continuidad y Observabilidad

- **Disponibilidad:** Meta inicial de `99,5 %` mensual.
- **Rendimiento web móvil:** Carga inicial del menú público (`First Contentful Paint`) menor a `1,8 s` en red móvil 4G.
- **Latencia en tiempo real:** Reflejo de cambios de estado en el panel, KDS y página de seguimiento del cliente en `< 3 segundos` vía SSE.
- **Aislamiento transaccional RLS:** Cero contaminación de contexto `app.current_tenant_id` entre peticiones concurrentes bajo carga.
- **Continuidad de negocio y recuperación ante desastres (RPO / RTO):**
  - **RPO (*Recovery Point Objective*) `< 15 minutos`:** Instancia PostgreSQL gestionada con archivado continuo de logs transaccionales (WAL / *Point-in-Time Recovery - PITR*) además de snapshots completos diarios con retención mínima de 14 días.
  - **RTO (*Recovery Time Objective*) `< 60 minutos`:** Procedimiento documentado de restauración y redespliegue automatizado de contenedores `apps/api` y `apps/web` vía CI/CD, ensayado antes de salir a producción.
- **Observabilidad, logs estructurados y alertas:**
  - *Logging estructurado (Pino JSON):* Cada log incluye `timestamp`, `level`, `requestId`, `tenantId`, `branchId`, `actorId` y `orderId` (cuando aplique), redactando automáticamente contraseñas, tokens y PII sensible.
  - *Monitoreo y alertas automáticas:* Sonda `/api/v1/health` cada 60 segundos; alertas inmediatas al equipo técnico ante caída del servicio, tasa de errores HTTP `5xx > 1 %` en ventana de 5 minutos, latencia `p95 > 2 s` o fallos en el scheduler de caducidad.

---

## 14. Matriz completa de riesgos y mitigaciones

| # | Riesgo identificado | Mitigación técnica y operativa implementada |
| :--- | :--- | :--- |
| 1 | Filtración de datos entre restaurantes | `TenantContextGuard` + `set_config('app.current_tenant_id', ..., true)` en transacción Prisma + RLS en PostgreSQL + pruebas E2E negativas. |
| 2 | Pedidos falsos o bromas al no existir pasarela de pago en línea | Cinco barreras activas (4.6.2): confirmación obligatoria antes de cocina (`REQUESTED` $\rightarrow$ `ACCEPTED`), opción de exigir cobro antes de preparar en `PICKUP`/`DELIVERY` (`require_payment_before_preparation`), *rate limiting* por teléfono/IP (máx. 3 activos por teléfono), pedido mínimo por zona y bloqueo de números (`Customer.is_blocked` + `blocked_phone_hmac`). |
| 3 | Pagos huérfanos si expira una solicitud `REQUESTED` | Validación transaccional en `ManualPaymentsService` tras bloquear la fila de `Order` con `SELECT ... FOR UPDATE` (`409 ORDER_MUST_BE_ACCEPTED_BEFORE_PAYMENT`), respaldada por la restricción local `CHECK (status != 'REQUESTED' OR paid_total_cop = 0)` en la tabla `orders` y el filtro `paid_total_cop = 0` en el job de caducidad. |
| 4 | Histórico del Nivel 1 mostrado por error como deuda pendiente al subir al Nivel 2 | Estado explícito `NOT_TRACKED` para pedidos nacidos bajo política `NONE` e inmutabilidad de `Order.payment_policy`. |
| 5 | Choque del `CHECK` de `DINE_IN` al aplicar perfiles con política `NONE` | `OperatingProfile.default_pickup_delivery_policy` aplica `NONE` exclusivamente a las filas `PICKUP` y `DELIVERY` de `BranchChannelPolicy`, manteniendo la fila `DINE_IN` siempre en `OFFLINE_ONLY`. |
| 6 | Pedido o comanda de mesa atascada antes de cocina por mala configuración de pre-cobro | Restricción `CHECK` en BD y validación en API: `require_payment_before_preparation` solo puede ser `true` con `payment_policy = 'OFFLINE_ONLY'` y `fulfillment_type IN ('PICKUP', 'DELIVERY')`; en `DINE_IN` es siempre `false` y al bajar a `NONE` se apaga automáticamente. |
| 7 | Imposibilidad de corregir cobros de una cuenta cerrada porque la mesa física ya fue reocupada | Reapertura contable (`mode = 'ACCOUNTING_ONLY'` $\rightarrow$ `status = 'REOPENED_ACCOUNTING'`) que no ocupa la mesa física ni choca con el índice único parcial `WHERE status = 'OPEN'`, permitiendo anular/registrar cobros y volver a cerrar en caja. |
| 8 | Reportes con doble conteo en salón o sin criterio de reparto en abonos parciales | Agregación disjunta (`Order` con `dining_account_id IS NULL` + `DiningAccount`), prelación determinista en cobros parciales (1.º Productos, 2.º Domicilio, 3.º Propina) y ecuación maestra $\text{Facturado} \equiv \text{Recaudado} + \text{Por Cobrar} + \text{Cortesías} + \text{Castigos}$. |
| 9 | Pérdida de pesos al recargar división de platos compartidos | Persistencia en `ConsumptionAssignment` de enteros `share_units`, `total_item_shares` y `assigned_amount_cop` conciliado al peso. |
| 10 | Pedidos falsos desde fotos de un QR de mesa | Todo pedido `origin = 'TABLE_QR'` nace en `REQUESTED`, soporta `table_session_pin` rotativo y exige confirmación del mesero (`ACCEPTED`) antes de ir a cocina. |
| 11 | Bloqueo de acceso del personal o del propietario cuando `notifications.email` está desactivado | El núcleo `identity-access` gestiona empleados con claves temporales/enlaces por WhatsApp y propietarios mediante correo transaccional de sistema propio (`forgot-password`) más respaldo asistido por `PLATFORM_SUPPORT`. |
| 12 | Reversión por fuerza bruta de teléfonos anonimizados o desbloqueo de clientes fraudulentos al pedir supresión (Ley 1581) | Reemplazo de `phone_e164` por `"ANON_" + UUID` aleatorio puro; preservación de bloqueo antifraude en `blocked_phone_hmac` firmado con secreto del servidor (`FRAUD_PEPPER_SECRET`), redacción de snapshots y exclusión de PII en `AuditEvent` y `export-csv`. |
| 13 | Falsas expectativas sobre Facturación Electrónica DIAN | Separar el desglose informativo de impuestos de la emisión fiscal DIAN, imprimir en todo pre-recibo (58mm/80mm) la leyenda de no equivalencia con factura electrónica ni documento equivalente POS, y reservar el módulo `invoicing.electronic_dian` mediante Proveedor Tecnológico autorizado. |
| 14 | Cajero que acomoda el conteo de efectivo al cerrar turno o saca dinero para proveedores sin soporte | El módulo `payments.cash_shifts` oculta `expected_cash_cop` al rol `CASHIER` durante el arqueo ciego (`BLIND_CLOSE`), exige motivo y categoría en cada `CashShiftMovement` (`CASH_OUT`) y audita cualquier diferencia (`difference_cop`). |
| 15 | Descuento duplicado de insumos o bloqueo de ventas por stock teórico desactualizado | Flag transaccional `OrderItem.inventory_deducted`, cantidades en milésimas enteras (`BIGINT`) y política de descuento no bloqueante (alerta de stock bajo sin frenar la toma de comandas). |
| 16 | Sobrescritura entre dos meseros editando la misma mesa | Control de concurrencia optimista (`expected_account_version`) + bloqueo pesimista (`FOR UPDATE`) en `DiningAccount`. |
| 17 | Desactivación de un módulo con operaciones abiertas o bloqueo por dependencia mutua | `OpenOperationsChecker` verifica operaciones en curso (incluyendo turnos de caja `OPEN`) y el validador del grafo evalúa de forma atómica el conjunto final $S_{\text{final}}$ en lote. |
| 18 | Truncamiento o sobrecarga al generar código con IA | División balanceada en fases verticales con puertas de pruebas intermedias, versiones fijas en `STACK_VERSIONS.md` y prompts acotados por módulo. |

---

## 15. Alcance definitivo por Hitos (Hitos 1, 2 y 3) y criterios de aceptación

### 15.1 Estructura de Hitos y Fases de Construcción

**Hito 1: MVP Piloto para Restaurantes Pequeños (Fases 01, 02, 03A y 03B — Cierra Niveles 0 y 1)**
- **Fase 01 (`FASE_01_FUNDACION_Y_NUCLEO_SAAS.md`):** Monorepo, `STACK_VERSIONS.md`, PostgreSQL + RLS transaccional con `set_config`, Auth JWT/RBAC (con claves temporales, enlaces por WhatsApp y `forgot-password` de sistema), Multi-tenancy, Motor de Capacidades (evaluación atómica en lote de $S_{\text{final}}$ y `default_pickup_delivery_policy`), Auditoría sin PII, `/api/v1/health`, Pino Logger y Onboarding guiado.
- **Fase 02 (`FASE_02_CATALOGO_IMPUESTOS_Y_VITRINA.md`):** Catálogo digital, Motor Tributario DIAN (3 modos + aviso fiscal), Importador CSV/Pegado, `QrCodeLink`, Vitrina Pública Mobile-First y etiquetas OpenGraph para WhatsApp (**Completa Nivel 0: `MENU_ONLY`**).
- **Fase 03A (`FASE_03A_MOTOR_PEDIDOS_ANTIFRAUDE_Y_WHATSAPP.md`):** Modelo de pedidos (`origin` + `fulfillment_type`), estado `NOT_TRACKED` para política `NONE`, zonas de cobertura (`delivery`), creación idempotente de pedidos públicos, los 5 controles antifraude (incluyendo `blocked_phone_hmac`), anonimización irreversible Ley 1581 (`UUID` + redacción de snapshots), generador de enlaces `wa.me`, scheduler de caducidad (`EXPIRED_UNPROCESSED`) y carrito/checkout público en React (**Puerta de pruebas intermedia obligatoria antes de pasar a 03B**).
- **Fase 03B (`FASE_03B_PANEL_LIVIANO_AJUSTES_Y_TRACKING_SSE.md`):** Servicio de tiempo real SSE (`SseStreamService` + `@microsoft/fetch-event-source`), **Panel Liviano de 1 pantalla** (`lite-order-panel`), ajuste pre-procesamiento auditado (`OrderEdit`), acción de un toque **"Procesar pedido"** (`ACCEPTED` + enlace de retorno a WhatsApp y botón copiar) y página pública de seguimiento en vivo (`/t/:publicToken`) (**Completa Nivel 1: `WHATSAPP_SIMPLE` — Listo para Piloto Comercial**).

**Hito 2: Operación Completa de Local, Cocina, Reportes y Salón (Fases 04, 05 y 06 — Cierra Niveles 2 y 3 del MVP)**
- **Fase 04 (`FASE_04_PANEL_COMPLETO_COCINA_KDS_Y_COBROS_MANUALES.md`):** Panel Operativo Completo con filtros e historial, instrucciones de transferencia (`payment_instructions_json`), opción acotada `require_payment_before_preparation`, Cobros Manuales (`payments.manual` con función única `recalculatePaymentState()`, bloqueo transaccional + `CHECK` local contra cobro en `REQUESTED`, resolución `COURTESY` / `WRITTEN_OFF`, reversión `revert-resolution`, anulación `VOIDED` y restricciones `CHECK`) y Pantalla de Cocina KDS por estaciones (`KitchenStation`).
- **Fase 05 (`FASE_05_REPORTES_SUSCRIPCION_MANUAL_Y_PWA.md`):** Módulo de Reportes (`reporting` sobre órdenes independientes: ecuación maestra de conciliación, prelación de cobros parciales, volumen `NOT_TRACKED`, tiempos entre estados y exportación CSV auditada sin PII), módulo de Suscripción SaaS manual (`billing-subscription`), impresión térmica CSS 58/80mm con leyenda DIAN y configuración PWA instalable (**Completa al 100 % el Nivel 2: `FULL_PANEL`**).
- **Fase 06 (`FASE_06_SALON_MESAS_Y_DIVISION_INFORMATIVA.md`):** Módulo de Salón (`dining` con política fija `OFFLINE_ONLY`, cobro centralizado en `DiningAccount`, cierre por pago total o resolución auditada, y reapertura en dos modos: `ACCOUNTING_ONLY` sin ocupar mesa física y `FULL_TABLE`), plano interactivo de mesas, QR de mesa confirmado por mesero (`channel.dine_in_qr`), cuentas abiertas con concurrencia (`version`), **Distribución Informativa por Persona** (`dining.consumption_split` en partes enteras) y extensión de `reporting` para consolidar `DiningAccount` sin doble conteo de órdenes hijas (**Completa Nivel 3: `DINING_ROOM` y `ENTERPRISE_MULTI`**).

**Hito 3: Profundización Gastronómica — Turnos de Caja e Inventario por Recetas (Fases 07 y 08)**
- **Fase 07 (`FASE_07_TURNOS_Y_ARQUEO_CIEGO_DE_CAJA.md`):** Módulo `payments.cash_shifts`, apertura de turno con base de efectivo (`opening_cash_cop`), registro de entradas y salidas menores (`CashShiftMovement`: pago a proveedores de paso, gastos menores, ingreso de sencillo), vinculación obligatoria de cobros `CASH` al turno activo y cierre/arqueo ciego (`BLIND_CLOSE`) con cálculo determinista de `expected_cash_cop` y `difference_cop`.
- **Fase 08 (`FASE_08_INVENTARIO_INSUMOS_Y_RECETAS.md`):** Módulo `inventory.recipes`, catálogo de insumos en milésimas enteras (`GRAM`, `MILLILITER`, `UNIT`), fichas técnicas (escandallos) en dos niveles (producto/variante y opción de modificador), descuento automático idempotente al pasar a `PREPARING` (`OrderItem.inventory_deducted`), resolución de inventario en cancelaciones (`RETURN_TO_STOCK` vs. `WASTE`) y Kardex inmutable (`InventoryMovement`).
- *(Nota Post-Hito 3: La **Fase 09 — Facturación Electrónica POS DIAN (`invoicing.electronic_dian`) y Conector Contable Cierre Z (Alegra/Siigo)** se activará una vez se seleccione comercialmente el Proveedor Tecnológico autorizado por la DIAN).*

### 15.2 Criterios de aceptación verificables (Definition of Done)

1. Un restaurante nuevo en perfil `WHATSAPP_SIMPLE` publica su menú (solo con nombre, precio y categoría) y recibe su primer pedido por WhatsApp con `payment_policy = 'NONE'` y `payment_status = 'NOT_TRACKED'`, mientras que la fila `DINE_IN` en `BranchChannelPolicy` permanece en `OFFLINE_ONLY` (`enabled = false`) sin violar ningún `CHECK` de base de datos.
2. Si ese restaurante sube después al perfil `FULL_PANEL` (`OFFLINE_ONLY`), los pedidos nuevos nacen en `UNPAID`, mientras que los pedidos históricos nacidos en Nivel 1 permanecen en `NOT_TRACKED` (y rechazan con `409 Conflict` cualquier intento de registrarles cobros manuales).
3. Todo pedido almacena por separado `origin` (`WHATSAPP`, `WEB_DIRECT`, `TABLE_QR`, `STAFF`) y `fulfillment_type` (`PICKUP`, `DELIVERY`, `DINE_IN`), permitiendo que un pedido de WhatsApp a domicilio transicione a `OUT_FOR_DELIVERY` y uno de recogida a `READY` $\rightarrow$ `PICKED_UP`.
4. El sistema bloquea con `403 Forbidden` o `429 Too Many Requests` pedidos provenientes de un teléfono marcado con `is_blocked = true` (incluso si el cliente solicitó anonimización, verificando `blocked_phone_hmac`) o que supere el límite de 3 solicitudes abiertas en la sucursal.
5. `ManualPaymentsService` bloquea con `SELECT ... FOR UPDATE` la fila de `Order` y rechaza con `409 ORDER_MUST_BE_ACCEPTED_BEFORE_PAYMENT` cualquier intento de registrar un pago sobre una solicitud en `status = 'REQUESTED'` (respaldado por el `CHECK (status != 'REQUESTED' OR paid_total_cop = 0)` local en `orders`), garantizando cero pagos huérfanos al caducar solicitudes.
6. En `payments.manual`, `recalculatePaymentState()` calcula siempre el estado real: si una orden de `$45.000` recibe `$20.000` en efectivo queda en `PARTIALLY_PAID` (por cobrar `$25.000`); al recibir `$25.000` por transferencia pasa a `PAID`; si luego se anula (`VOIDED`) el pago de `$25.000`, regresa exactamente a `PARTIALLY_PAID` (`paid_total_cop = 20000`) y no a `UNPAID`.
7. Una orden resuelta como `COURTESY` o `WRITTEN_OFF` (o una `DiningAccount` en `CLOSED`) rechaza nuevos pagos o anulaciones con `409 Conflict`; al ejecutar `revert-resolution` en la orden o `reopen` con `mode = 'ACCOUNTING_ONLY'` en la cuenta de salón, permite corregir pagos en caja aunque la mesa física esté ocupada por otro grupo, dejando trazabilidad completa en `AuditEvent`.
8. En `reporting`, los totales monetarios suman órdenes independientes (`dining_account_id IS NULL`) más cuentas de salón (`DiningAccount`) sin duplicar órdenes hijas de mesa; los abonos parciales se imputan en orden (1.º Productos, 2.º Domicilio, 3.º Propina); las cifras concilian al peso ($\text{Facturado} \equiv \text{Recaudado} + \text{Por Cobrar} + \text{Cortesías} + \text{Castigos}$); y el CSV descargado no contiene PII de clientes.
9. `require_payment_before_preparation` solo puede activarse en `PICKUP` o `DELIVERY` con política `OFFLINE_ONLY` (nunca en `NONE` ni en `DINE_IN`), impidiendo pasar el pedido a `PREPARING` hasta que `payment_status` sea `PAID` y apagándose automáticamente si el canal baja a `NONE`.
10. Un administrador puede crear usuarios del personal y restablecer sus contraseñas mediante clave temporal (`must_change_password = true`) o enlace compartible por WhatsApp aunque `notifications.email` esté desactivado, y el propietario dispone de `POST /api/v1/auth/forgot-password`.
11. Al ejecutar la anonimización de un cliente (`POST /api/v1/admin/customers/:id/anonymize`), su `phone_e164` se reemplaza por `"ANON_" + UUID` aleatorio irreversible y su PII se redacta en `Customer`, `DeliveryAddress` y `Order.customer_snapshot_json` sin alterar un solo peso de las ventas históricas.
12. En la distribución informativa por persona (`dining.consumption_split`), una picada compartida de `$50.000` entre 3 personas persiste `share_units = 1`, `total_item_shares = 3` y montos `$16.667`, `$16.667` y `$16.666`; al recargar la cuenta desde la base de datos los montos se mantienen idénticos con `$0` sin asignar.
13. El validador del grafo de capacidades evalúa el conjunto resultante $S_{\text{final}}$ de forma atómica en lote (permitiendo activar o desactivar `dining` y `payments.manual` en una misma petición) y bloquea con `409 Conflict` si existen operaciones abiertas (`OpenOperationsChecker`).
14. Pruebas automatizadas E2E comprueban que el Restaurante A jamás puede leer, modificar ni recibir eventos SSE del Restaurante B, incluso bajo peticiones concurrentes sobre el pool de conexiones de PostgreSQL, y que las claves `idempotency_key` están aisladas por `tenant_id` (`UNIQUE(tenant_id, idempotency_key)`).
15. Con `payments.cash_shifts` activo, un turno abierto con base de `$100.000`, ventas cobradas en efectivo por `$250.000` y una salida menor (`CASH_OUT`) a un proveedor por `$30.000` calcula exactamente `expected_cash_cop = 320000` (oculto al rol `CASHIER`); si el cajero declara a ciegas `$315.000`, el cierre registra `difference_cop = -5000` (faltante de `$5.000`).
16. Con `inventory.recipes` activo, cuando una orden con `2 Hamburguesas` (cada una con receta de $150\text{ g}$ de carne y adición de $30\text{ g}$ de queso) pasa a `PREPARING`, el sistema descuenta una sola vez $300.000\text{ milésimas}$ ($300\text{ g}$) de carne y $60.000\text{ milésimas}$ ($60\text{ g}$) de queso en el Kardex; si la orden se cancela con `RETURN_TO_STOCK`, el Kardex registra `SALE_REVERSAL` y reintegra exactamente las cantidades descontadas.

---

## 16. Estructura de costes a presupuestar

1. **Infraestructura Etapa 1 (Piloto 1–50 locales):** Servidor/contenedor para NestJS (`apps/api`), base de datos PostgreSQL 16 gestionada con PITR (WAL archiving para RPO `< 15 min`) y backups diarios, hosting/CDN para `apps/web`, bucket compatible con S3 (Cloudflare R2 / AWS S3) para fotos del menú y servicio de correo transaccional del núcleo (ej. AWS SES / Resend en capa gratuita o de bajo volumen) para recuperación de contraseñas de propietarios (`identity-access`).
2. **Infraestructura Etapa 2 (50–500 locales):** Instancia Redis para caché de menús públicos y sincronización Pub/Sub de streams SSE.
3. **Asesoría legal, contable y alianzas Post-MVP:** Validación de textos de privacidad, retención de `blocked_phone_hmac` por interés legítimo antifraude (Ley 1581 de 2012), leyenda fiscal DIAN, parametrización de perfiles tributarios de referencia (INC/IVA) y negociación comercial de tarifas por paquete de folios con el Proveedor Tecnológico de Facturación Electrónica DIAN para el módulo Post-MVP `invoicing.electronic_dian`.

---

## 17. Registro de Decisiones Arquitectónicas (ADRs Cerrados)

| ID | Decisión Arquitectónica | Estado | Resumen de la decisión adoptada |
| :--- | :--- | :--- | :--- |
| `ADR-001` | Monolito modular en NestJS + React en Monorepo | **Aprobada** | Monorepo `Turborepo` con `apps/api` (NestJS), `apps/web` (React + Vite) y `packages/shared` (Zod + tipos + calculadoras). |
| `ADR-002` | Multi-tenancy con PostgreSQL RLS transaccional | **Aprobada** | Esquema compartido con `tenant_id` obligatorio, `UNIQUE(tenant_id, idempotency_key)` y ejecución de `SELECT set_config('app.current_tenant_id', $1, true)` dentro de transacciones interactivas de Prisma. |
| `ADR-003` | Ciclo financiero completo, reapertura contable y ecuación de conciliación | **Aprobada** | Recálculo único mediante `recalculatePaymentState()`, bloqueo transaccional + `CHECK` local contra cobros en `REQUESTED`, reapertura contable (`REOPENED_ACCOUNTING`) sin ocupar mesa física, prelación de abonos parciales y conciliación sin doble conteo en `reporting`. |
| `ADR-004` | Separación de `origin` y `fulfillment_type` y acotación de pre-cobro | **Aprobada** | Se reemplaza `channel` por `origin` y `fulfillment_type`; `DINE_IN` es siempre `OFFLINE_ONLY` con cobro en `DiningAccount`, y `require_payment_before_preparation` solo aplica a `PICKUP`/`DELIVERY` bajo `OFFLINE_ONLY`. |
| `ADR-005` | Estrategia Web Mobile-First + PWA en el MVP | **Aprobada** | Web sin descarga con etiquetas OpenGraph para el comensal y PWA instalable para el personal del restaurante en el MVP. |
| `ADR-006` | Motor tributario de 3 modos sin doble cobro y aviso fiscal DIAN | **Aprobada** | El modo se define en `Tenant.tax_profile_mode` (`FINAL_PRICE_NO_BREAKDOWN` por defecto en Nivel 1) guardando snapshots por línea en `OrderItem` e incluyendo aviso de no equivalencia con factura electrónica DIAN. |
| `ADR-007` | Evaluación atómica del grafo `depends_on_all` y `depends_on_any` | **Aprobada** | Validación en lote sobre el conjunto resultante $S_{\text{final}}$, con 19 módulos en catálogo (15 operativos + 4 Post-MVP) y 5 perfiles operativos. |
| `ADR-008` | Tiempo real con SSE y `@microsoft/fetch-event-source` | **Aprobada** | Canales SSE autenticados con Bearer JWT en el panel/KDS mediante `@microsoft/fetch-event-source` y canal público por token opaco para el cliente. |
| `ADR-009` | Persistencia entera en distribución por persona y QR de mesa confirmado | **Aprobada** | `ConsumptionAssignment` persiste partes enteras y `assigned_amount_cop`; los pedidos `TABLE_QR` nacen en `REQUESTED` hasta confirmación del mesero. |
| `ADR-010` | Identidad resiliente y anonimización irreversible con UUID + HMAC antifraude (Ley 1581) | **Aprobada** | Alta/reseteo de empleados por clave temporal o WhatsApp y `forgot-password` de sistema para propietarios; anonimización de clientes con `"ANON_" + UUID`, `blocked_phone_hmac` con secreto de servidor y exclusión de PII en `AuditEvent` y CSV. |
| `ADR-011` | Especialización gastronómica (`payments.cash_shifts` e `inventory.recipes`) y Coexistencia Contable / FE DIAN vía Tercero | **Aprobada** | Karta implementa arqueo ciego de turnos de caja e inventario por recetas en milésimas enteras (`BIGINT`) como módulos propios del vertical gastronómico, descartando construir un ERP contable general. La Facturación Electrónica POS DIAN se delega vía adaptador (`ElectronicInvoicingPort`) a un Proveedor Tecnológico autorizado (`POR VALIDAR`), y la contabilidad se alimenta sincronizando el Cierre Z diario hacia sistemas como Alegra o Siigo. |

---

## 18. Validaciones externas, precios comerciales SaaS y parámetros configurables

1. **Definición comercial de planes de suscripción SaaS (`POR VALIDAR` por dirección de negocio):**
   - Definir las tarifas mensuales en COP, límites de sucursales y eventual periodo de prueba (`TRIALING`) para los planes `PLAN_STARTER_WHATSAPP` (Niveles 0 y 1), `PLAN_OPERATIONS_PRO` (Nivel 2 + Turnos de Caja) y `PLAN_ENTERPRISE_DINING` (Nivel 3 + Salón + Inventario por Recetas).
2. **Selección comercial de Proveedor Tecnológico de Facturación Electrónica DIAN (`POR VALIDAR` para Post-MVP):**
   - Evaluar y seleccionar el Proveedor Tecnológico autorizado por la DIAN (ej. Facturatech, HGI, Cadena, Siigo/Alegra API) con el que se implementará el primer adaptador del módulo reservado `invoicing.electronic_dian`.
3. **Parámetros operativos por defecto en base de datos:**
   - *Flujo de estados por defecto en Nivel 1 (`WHATSAPP_SIMPLE`):* `REQUESTED` $\rightarrow$ `ACCEPTED` $\rightarrow$ `READY` (si es `PICKUP`) / `OUT_FOR_DELIVERY` (si es `DELIVERY`) $\rightarrow$ `DELIVERED` / `PICKED_UP`.
   - *Límite antifraude de solicitudes abiertas simultáneas por `phone_e164`:* `3 solicitudes` por sucursal.
   - *Caducidad de solicitudes `REQUESTED` sin procesar:* `240 minutos (4 horas)`.
   - *Vigencia del enlace público de seguimiento tras estado final:* `24 horas`.
   - *Plazo de inactividad para anonimización automática de PII de clientes:* `24 meses`.
4. **Validaciones jurídicas y contables (`POR VALIDAR` en paralelo al desarrollo):**
   - Revisión del texto de autorización de tratamiento de datos personales, política de retención/anonimización y conservación de `blocked_phone_hmac` por prevención de fraude (Ley 1581 de 2012).
   - Revisión contable del tratamiento informativo del recargo de domicilio (`delivery_fee_cop`) y validación del texto de no equivalencia fiscal en pre-recibos.

---

## 19. Fuentes oficiales y referencias normativas

- **DIAN — Oficio 904106 de 2022 (INC y servicio de restaurante):** https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_904106_2022.htm
- **DIAN — Oficio 902460 de 2022 (Base, tarifa, inclusión en lista de precios al público y discriminación del INC en restaurantes):** https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_902460_2022.htm
- **DIAN — Concepto 012029 int. 1398 de 2025 (Consulta normativa sobre Impuesto Nacional al Consumo):** https://www.dian.gov.co/Contribuyentes-Plus/Documents/13-CONCEPTO-012029-int-1398-04092025.pdf
- **Wompi & ePayco (Referencias conservadas para el Anexo Post-MVP):** https://wompi.co/es/co/planes-tarifas/ , https://docs.wompi.co/docs/colombia/eventos/ y https://epayco.com/tarifas/

---

## 20. Historial de cambios

| Versión | Fecha | Descripción del cambio |
| :--- | :--- | :--- |
| `0.1.0` – `0.8.0` | 2026-10-19 | Iteraciones P-001 a P-008: levantamiento funcional, división informativa por persona, precios finales sin doble cobro, capacidades modulares, escalera de adopción y flujo WhatsApp sin API con panel liviano y ajuste previo. |
| `1.0.0` | 2026-10-19 | Iteración P-009: consolidación en stack React + NestJS + PostgreSQL dentro de un Monorepo Turborepo. |
| `2.0.0` | 2026-10-21 | Iteración P-010: retiro de pasarelas en línea del MVP; separación de `origin` + `fulfillment_type`; persistencia entera en `ConsumptionAssignment`; grafo `depends_on_all` / `depends_on_any`; confirmación de mesero en QR de mesa y estado `PARTIALLY_PAID`. |
| `2.1.0` | 2026-10-23 | Iteración P-011: restitución de controles antifraude (4.6.2); `dining` exige `payments.manual` y cierre de cuenta; estado `NOT_TRACKED` para política `NONE`; bloqueo de cancelación/reducción por debajo de lo pagado; `payment_instructions_json`, aviso fiscal DIAN y Anexo Post-MVP. |
| `2.2.0` | 2026-10-23 | Iteración P-012: `require_payment_before_preparation` acotado por `CHECK` a `OFFLINE_ONLY` y `PICKUP`/`DELIVERY`; `DINE_IN` forzado a `OFFLINE_ONLY` con cobro en `DiningAccount`; estados `COURTESY` y `WRITTEN_OFF`; `CHECK` XOR en `Payment` y `UNIQUE(tenant_id, idempotency_key)`; delta en Anexo Post-MVP. |
| `2.3.0` | 2026-10-24 | Iteración P-013: función única `recalculatePaymentState()`, congelamiento/reversión de resoluciones, ecuación de conciliación en `reporting`, bloqueo de cobros en `REQUESTED`, `default_pickup_delivery_policy`, invitaciones sin email, anonimización Ley 1581, RPO/RTO e inversión de Fases 05 y 06. |
| `2.4.0` | 2026-10-26 | Iteración P-014: anonimización irreversible con `"ANON_" + UUID` y `blocked_phone_hmac`; validación transaccional `SELECT ... FOR UPDATE` + `CHECK` local en `orders` contra cobros en `REQUESTED`; reapertura contable (`REOPENED_ACCOUNTING`) sin ocupar mesa física; tres reglas de reportes; `forgot-password`; división `FASE_03A`/`FASE_03B` y evaluación atómica de $S_{\text{final}}$. |
| `2.5.0` | 2026-11-03 | **Profundización Gastronómica y Estrategia Contable / FE DIAN (P-015):** (1) Adopción del nombre comercial **Karta**; (2) incorporación del módulo `payments.cash_shifts` (Hito 3 / Fase 07: turnos de caja con base inicial, entradas/salidas menores a proveedores de paso y arqueo ciego `BLIND_CLOSE`); (3) incorporación del módulo `inventory.recipes` (Hito 3 / Fase 08: insumos en milésimas enteras `BIGINT`, escandallos en productos/variantes y modificadores, descuento idempotente al pasar a `PREPARING` y Kardex inmutable); y (4) reserva arquitectónica del módulo Post-MVP `invoicing.electronic_dian` (`POR VALIDAR` Proveedor Tecnológico DIAN) junto con los lineamientos del conector de Cierre Z hacia Alegra/Siigo en el Anexo Sección 21. |

---

## 21. Anexo Técnico Post-MVP: Especificación de Reserva para Pasarelas en Línea, Facturación Electrónica DIAN y Conector Contable

Este anexo documenta las reglas de ingeniería y el delta de modelo de datos para las integraciones externas reservadas para etapas posteriores al lanzamiento inicial:

### 21.1 Reserva y Delta para Pasarelas de Pago en Línea (`payments.online` y `payments.links`)
1. **Delta Controlado de Esquema y Enumeraciones:**
   - **Ampliación de `payment_policy`:** Se agregan los valores `ONLINE_OPTIONAL` y `ONLINE_REQUIRED` en `BranchChannelPolicy` y `Order` (aplicables a `PICKUP` y `DELIVERY`).
   - **Nuevo estado inicial `AWAITING_PAYMENT` en `OrderStatus`:** Cuando un pedido se crea bajo `payment_policy = 'ONLINE_REQUIRED'`, nace en estado **`AWAITING_PAYMENT`** (oculto por defecto en el KDS de cocina para evitar preparar pedidos sin pago confirmado). Solo cuando el webhook firmado aprueba el pago, transiciona automáticamente a `RECEIVED` / `ACCEPTED` y emite la alerta SSE.
   - **Ampliación en `Payment` y nuevas tablas:** Se agregan en `Payment` los métodos `ONLINE_PSE`, `ONLINE_CARD`, `PAYMENT_LINK`, los estados `CREATED`, `PENDING`, `DECLINED`, `EXPIRED`, `REFUNDED`, `PARTIALLY_REFUNDED`, `REVIEW_REQUIRED` y las columnas `provider` y `provider_reference`; y se crean las tablas `MerchantPaymentConfig` (credenciales por restaurante cifradas con **AES-256-GCM**), `PaymentLink` (con invalidación automática `SUPERSEDED` si cambia el saldo) y `PaymentEvent` (`UNIQUE(provider, event_id)`).
2. **Resolución de Comercio en Webhooks e Integridad:**
   - El endpoint receptor de webhooks incluye el `tenantId` en la ruta (`POST /api/v1/integrations/payments/:provider/:tenantId/webhook`) para localizar el `MerchantPaymentConfig` del restaurante y verificar la firma SHA256 (`crypto.timingSafeEqual`) bajo bloqueo `SELECT ... FOR UPDATE`. Jamás se aprueba un pago por redirección del navegador.

### 21.2 Reserva Arquitectónica para Facturación Electrónica POS DIAN (`invoicing.electronic_dian` — `POR VALIDAR` Proveedor Tecnológico)
1. **Estrategia de Delegación en Proveedor Tecnológico Autorizado:**
   - Karta no construye ni firma directamente archivos XML UBL 2.1 ni gestiona certificados criptográficos propios ante la DIAN. Cuando se seleccione comercialmente el Proveedor Tecnológico aliado, se implementará mediante el patrón Puerto/Adaptador (`ElectronicInvoicingPort` $\rightarrow$ `ProviderElectronicInvoicingAdapter`).
2. **Delta de Esquema Reservado para `invoicing.electronic_dian`:**
   - `ElectronicInvoicingConfig(id, tenant_id, branch_id, provider, encrypted_api_token, resolution_number, prefix, range_from, range_to, resolution_valid_until, environment, is_active)`.
   - `ElectronicFiscalDocument(id, tenant_id, branch_id, order_id?, account_id?, doc_type ['POS_ELECTRONIC' | 'STANDARD_INVOICE' | 'CREDIT_NOTE'], customer_tax_id, customer_name, customer_email, prefix_and_number, cude_or_cufe, qr_url, xml_url?, pdf_url?, status ['PENDING_DIAN' | 'ACCEPTED_DIAN' | 'CONTINGENCY' | 'REJECTED_DIAN'], issued_at)`.
   - Al imprimir un documento con `status = 'ACCEPTED_DIAN'`, el formateador térmico (`print-receipt.ts`) reemplaza la leyenda de pre-cuenta informativa por los datos oficiales de la resolución DIAN, el `CUDE`/`CUFE` y el código QR fiscal devueltos por el Proveedor Tecnológico.

### 21.3 Lineamientos para el Conector Contable de Cierre Diario (Alegra / Siigo)
- Para los restaurantes cuyo contador utiliza Alegra o Siigo, se evita enviar micro-transacciones por cada pedido individual (lo cual agota los *rate limits* de la API contable y dificulta la conciliación bancaria).
- Al cerrar el turno de caja (`CashShift` $\rightarrow$ `CLOSED`) o al ejecutar el cierre diario de la sucursal, el conector toma la **Ecuación Maestra de Conciliación** del módulo `reporting` y envía a la API de Alegra/Siigo **un único comprobante consolidado de Cierre Z diario** con los totales por método de pago (`CASH`, `POS_TERMINAL`, `MANUAL_TRANSFER`), base gravable, impuestos (`INC`/`IVA`) y propinas.