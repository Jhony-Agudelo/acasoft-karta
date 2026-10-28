# Fase 03A: Motor de Pedidos, Cobertura de Domicilio, Antifraude, Anonimización Ley 1581 y Checkout WhatsApp
**Documento:** `FASE_03A_MOTOR_PEDIDOS_ANTIFRAUDE_Y_WHATSAPP.md`  
**Versión:** 2.4.0 — Alineado con `DEFINICION_TECNICA.md` (v2.4.0) y `STACK_VERSIONS.md` (v2.4.0)  
**Fecha:** 2026-10-27  
**Prerrequisitos:** `FASE_01_FUNDACION_Y_NUCLEO_SAAS.md` (v2.4.0) y `FASE_02_CATALOGO_IMPUESTOS_Y_VITRINA.md` (v2.4.0) completadas y con todas sus puertas de pruebas en verde.  
**Objetivo de la Fase:** Construir la primera mitad del Nivel 1 de la Escalera de Adopción (`WHATSAPP_SIMPLE`) y la base transaccional de pedidos para toda la plataforma: el modelo de datos de órdenes con separación ortogonal entre `origin` y `fulfillment_type`, el estado financiero `NOT_TRACKED` para política `NONE`, el módulo de zonas de cobertura de domicilio (`delivery`), la creación idempotente de pedidos públicos (`POST /api/v1/public/orders`), los 5 controles antifraude (incluyendo `blocked_phone_hmac` con secreto de servidor), la anonimización verdaderamente irreversible de datos personales en `Customer` y en *snapshots* de órdenes (Ley 1581 de 2012), el generador de enlaces profundos `wa.me`, el *scheduler* de caducidad automática (`EXPIRED_UNPROCESSED`) y el carrito persistente + checkout público en React.

---

## 1. Reglas de Ingeniería, Arquitectura Limpia y Seguridad (Directivas para Gemini)

Al procesar este documento junto con `DEFINICION_TECNICA.md` (v2.4.0) y `STACK_VERSIONS.md` (v2.4.0) para generar código, debes cumplir sin excepción las siguientes reglas:

1. **Política de Cero Código Incompleto (`Zero-Placeholder Policy`):**
   - Está estrictamente prohibido entregar archivos con comentarios como `// TODO`, `// implementar luego`, `// ... resto del código` o funciones vacías. Todo archivo generado debe ser 100 % funcional, compilable y estrictamente tipado.
2. **Apego Estricto a `STACK_VERSIONS.md` y Puertas Manuales por Sub-Paso:**
   - Usa únicamente las versiones y librerías definidas en `STACK_VERSIONS.md` (Node 22 LTS, NestJS 10, Prisma 5, React 18, Vite 5, TanStack Query 5, Zustand 5, Zod 3.23).
   - Genera únicamente los archivos del paso solicitado en la Sección 6 y espera el resultado de la **Puerta de Validación Manual** (`pnpm install`, `pnpm turbo run typecheck`, `pnpm turbo run test`) antes de pasar al siguiente paso.
3. **Autoridad Absoluta del Servidor sobre Precios e Instantáneas (*Snapshots*):**
   - El backend en NestJS **jamás confía en precios unitarios, precios de variantes, precios de modificadores, tarifas de domicilio, subtotales ni impuestos enviados por el navegador**.
   - Al crear un pedido, el servidor consulta los registros vigentes en PostgreSQL dentro de la transacción del tenant, verifica disponibilidad (`status === 'ACTIVE'` y horario de categoría), ejecuta `calculateLinePricing` de `packages/shared` según `Tenant.tax_profile_mode` y persiste instantáneas inmutables (`customer_snapshot_json`, `tax_summary_snapshot_json` en `Order`; `product_snapshot_json`, `modifiers_snapshot_json`, `tax_snapshot_json` en cada `OrderItem`).
4. **Separación Ortogonal entre `origin` y `fulfillment_type` + Inmutabilidad de `payment_policy`:**
   - Queda prohibido usar un campo mixto `channel`. Toda orden almacena por separado `origin` (`'WHATSAPP'` | `'WEB_DIRECT'` | `'TABLE_QR'` | `'STAFF'`) y `fulfillment_type` (`'PICKUP'` | `'DELIVERY'` | `'DINE_IN'`).
   - Al crearse la orden, congela de forma inmutable el `payment_policy` (`'NONE'` | `'OFFLINE_ONLY'`) y el `require_payment_before_preparation` vigentes en el `BranchChannelPolicy` de esa sucursal y modalidad.
   - Si `payment_policy === 'NONE'`, la orden nace obligatoriamente con `payment_status = 'NOT_TRACKED'` y `require_payment_before_preparation = false`. Si `payment_policy === 'OFFLINE_ONLY'`, nace con `payment_status = 'UNPAID'`.
5. **Controles Antifraude y Anonimización Irreversible (Ley 1581 de 2012):**
   - **Idempotencia Aislada por Tenant:** La creación de pedidos públicos exige la cabecera HTTP `Idempotency-Key` (UUID o string de 16 a 64 caracteres) respaldada en PostgreSQL por la restricción `UNIQUE(tenant_id, idempotency_key)`.
   - **Límite de Solicitudes Abiertas y Bloqueo HMAC:** Un mismo teléfono `phone_e164` no puede tener más de `3` pedidos abiertos sin finalizar en una misma sucursal (`429 Too Many Requests`). Además, al validar un teléfono entrante, el backend comprueba tanto `Customer.phone_e164` (`is_blocked = true`) como su firma `HMAC_SHA256(FRAUD_PEPPER_SECRET, tenant_id + ":" + phone_e164)` contra `Customer.blocked_phone_hmac` (`403 Forbidden`).
   - **Anonimización con UUID Aleatorio Puro:** Al anonimizar un cliente (`POST /api/v1/admin/customers/:customerId/anonymize`), está prohibido usar un hash sin clave del teléfono (reversible por fuerza bruta sobre las $\sim 10^9$ combinaciones de móviles en Colombia). Se reemplaza `phone_e164` por `"ANON_" + crypto.randomUUID()`, se eliminan sus filas en `DeliveryAddress`, se redacta `Order.customer_snapshot_json` sin alterar un solo peso de las cifras contables y, únicamente si `is_blocked === true`, se conserva `blocked_phone_hmac` firmado con `FRAUD_PEPPER_SECRET`. Ni `AuditEvent` ni los logs de `Pino` almacenan PII crudo del cliente.
6. **Puerta de Validación Intermedia Obligatoria:**
   - No se debe iniciar la `FASE_03B` (Panel Liviano de 1 pantalla, ajustes `OrderEdit`, acción *"Procesar pedido"* y seguimiento SSE) hasta que todos los pasos y pruebas `TC-03A-*` de este documento pasen en verde.

---

## 2. Estructuras Exactas de Datos e Instantáneas (`JSONB` y Contratos Compartidos)

### 2.1 Interfaces de *Snapshots* Inmutables (`packages/shared/src/schemas/order-snapshots.schema.ts`)

Todo `Order` y `OrderItem` debe validar y almacenar sus columnas `JSONB` con la siguiente estructura tipada:

```typescript
// 1. Snapshot de datos del cliente en Order.customer_snapshot_json
export interface CustomerSnapshot {
  name: string;                    // Al anonimizar cambia a "Anonimizado"
  phone_e164: string;              // Ej. "+573001234567"; al anonimizar cambia a "REDACTED"
  delivery_zone_id: string | null;
  delivery_zone_name: string | null;
  address_line: string | null;     // Al anonimizar cambia a "REDACTED"
  neighborhood: string | null;     // Al anonimizar cambia a "REDACTED"
  reference_notes: string | null;  // Al anonimizar cambia a "REDACTED"
  privacy_consent_at: string;      // ISO-8601 timestamp
  anonymized_at?: string | null;   // ISO-8601 timestamp cuando se aplica Ley 1581
}

// 2. Snapshot de resumen tributario en Order.tax_summary_snapshot_json
export interface OrderTaxSummarySnapshot {
  tax_profile_mode: 'FINAL_PRICE_NO_BREAKDOWN' | 'TAX_INCLUDED_DISCRIMINATED' | 'BASE_PLUS_TAX';
  breakdown_by_tax: Array<{
    tax_type: 'NONE' | 'INC' | 'IVA' | 'EXEMPT';
    tax_rate_bp: number;           // Ej. 800 (8%), 1900 (19%), 0
    taxable_base_cop: number;      // Entero en COP
    tax_amount_cop: number;        // Entero en COP
    total_with_tax_cop: number;    // Entero en COP
  }>;
  fiscal_disclaimer: string;       // Leyenda obligatoria de no equivalencia con factura electrónica DIAN
}

// 3. Snapshot del producto en OrderItem.product_snapshot_json
export interface OrderItemProductSnapshot {
  product_id: string;
  category_id: string;
  category_name: string;
  product_name: string;
  product_description: string | null;
  base_product_price_cop: number;
  variant_id: string | null;
  variant_name: string | null;
  effective_base_price_cop: number; // Precio de variante si existe, o precio base del producto
}

// 4. Snapshot de modificadores elegidos en OrderItem.modifiers_snapshot_json
export interface OrderItemModifierSnapshot {
  group_id: string;
  group_name: string;
  option_id: string;
  option_name: string;
  extra_price_cop: number;          // Entero en COP vigente al segundo de la compra
}

// 5. Snapshot tributario de línea en OrderItem.tax_snapshot_json
export interface OrderItemTaxSnapshot {
  tax_profile_mode: 'FINAL_PRICE_NO_BREAKDOWN' | 'TAX_INCLUDED_DISCRIMINATED' | 'BASE_PLUS_TAX';
  tax_type: 'NONE' | 'INC' | 'IVA' | 'EXEMPT';
  tax_rate_bp: number;
  unit_base_plus_modifiers_cop: number;
  gross_line_subtotal_cop: number;
  discount_cop: number;
  taxable_base_cop: number;
  tax_amount_cop: number;
  line_total_cop: number;           // taxable_base_cop + tax_amount_cop (en modos con desglose)
}
```

### 2.2 Máquina de Estados del Pedido (`packages/shared/src/constants/order-status.machine.ts`)

1. **Enumeraciones base:**
   - `OrderOrigin`: `'WHATSAPP'` | `'WEB_DIRECT'` | `'TABLE_QR'` | `'STAFF'`
   - `FulfillmentType`: `'PICKUP'` | `'DELIVERY'` | `'DINE_IN'`
   - `OrderStatus`: `'REQUESTED'` | `'RECEIVED'` | `'ACCEPTED'` | `'PREPARING'` | `'READY'` | `'OUT_FOR_DELIVERY'` | `'DELIVERED'` | `'PICKED_UP'` | `'SERVED'` | `'REJECTED'` | `'CANCELLED'` | `'EXPIRED_UNPROCESSED'`
   - `OrderPaymentStatus`: `'NOT_TRACKED'` | `'UNPAID'` | `'PARTIALLY_PAID'` | `'PAID'` | `'COURTESY'` | `'WRITTEN_OFF'`

2. **Reglas deterministas en `canTransitionOrder(input)`:**
   - Recibe:
     ```typescript
     export interface OrderTransitionInput {
       fromStatus: OrderStatus;
       toStatus: OrderStatus;
       origin: OrderOrigin;
       fulfillmentType: FulfillmentType;
       activeStatusFlow: OrderStatus[];
       requirePaymentBeforePreparation: boolean;
       paymentStatus: OrderPaymentStatus;
       paidTotalCop: number;
     }
     ```
   - **Validaciones obligatorias que retornan `{ allowed: false, errorCode, message }`:**
     1. Si `fromStatus` es un estado terminal (`'DELIVERED'`, `'PICKED_UP'`, `'SERVED'`, `'REJECTED'`, `'CANCELLED'`, `'EXPIRED_UNPROCESSED'`), ninguna transición está permitida (`errorCode: 'ORDER_ALREADY_IN_TERMINAL_STATE'`).
     2. Si `fromStatus === 'REQUESTED'`, los únicos destinos válidos son `'ACCEPTED'`, `'REJECTED'` o `'EXPIRED_UNPROCESSED'`. Jamás puede saltar de `'REQUESTED'` a `'PREPARING'`, `'READY'` o `'DELIVERED'` sin pasar primero por `'ACCEPTED'` (`errorCode: 'ORDER_MUST_BE_ACCEPTED_FIRST'`).
     3. Si `toStatus === 'OUT_FOR_DELIVERY'` o `toStatus === 'DELIVERED'` y `fulfillmentType !== 'DELIVERY'`, rechazar con `errorCode: 'INVALID_STATUS_FOR_FULFILLMENT_TYPE'`.
     4. Si `toStatus === 'PICKED_UP'` y `fulfillmentType !== 'PICKUP'`, rechazar con `errorCode: 'INVALID_STATUS_FOR_FULFILLMENT_TYPE'`.
     5. Si `toStatus === 'SERVED'` y `fulfillmentType !== 'DINE_IN'`, rechazar con `errorCode: 'INVALID_STATUS_FOR_FULFILLMENT_TYPE'`.
     6. Si `toStatus === 'PREPARING'` (o cualquier estado posterior de preparación/entrega) y `requirePaymentBeforePreparation === true` y `paymentStatus !== 'PAID'`, rechazar con `errorCode: 'PAYMENT_REQUIRED_BEFORE_PREPARATION'`.
     7. Si `toStatus === 'REJECTED'` o `toStatus === 'CANCELLED'` y `paidTotalCop > 0`, rechazar con `errorCode: 'ORDER_HAS_ACTIVE_PAYMENTS'`.
     8. Para transiciones de avance operativo (`ACCEPTED` $\rightarrow$ `PREPARING` $\rightarrow$ `READY` $\rightarrow$ `OUT_FOR_DELIVERY` $\rightarrow$ estado final), verificar que `toStatus` esté después de `fromStatus` en la secuencia canónica del `fulfillmentType` y que no se salte ningún estado intermedio que esté incluido como obligatorio/activo en `activeStatusFlow`.

---

## 3. Especificación de Base de Datos, Migración SQL, RLS y Restricciones `CHECK`

### 3.1 Modelos en `apps/api/prisma/schema.prisma`

Agregar los modelos `Customer`, `DeliveryZone`, `DeliveryAddress`, `Order`, `OrderItem`, `OrderStatusEvent` y la tabla auxiliar `BranchOrderSequence` (para numeración diaria `#A101` sin condiciones de carrera):

```prisma
model Customer {
  id                  String    @id @default(uuid()) @db.Uuid
  tenant_id           String    @db.Uuid
  name                String    @db.VarChar(150)
  phone_e164          String    @db.VarChar(48)
  privacy_consent_at  DateTime  @db.Timestamptz(6)
  is_blocked          Boolean   @default(false)
  blocked_reason      String?   @db.Text
  blocked_at          DateTime? @db.Timestamptz(6)
  blocked_phone_hmac  String?   @db.VarChar(64)
  anonymized_at       DateTime? @db.Timestamptz(6)
  last_order_at       DateTime? @db.Timestamptz(6)
  created_at          DateTime  @default(now()) @db.Timestamptz(6)

  addresses           DeliveryAddress[]
  orders              Order[]

  @@unique([tenant_id, phone_e164], name: "uq_customers_tenant_phone")
  @@index([tenant_id, is_blocked], name: "idx_customers_tenant_blocked")
  @@map("customers")
}

model DeliveryZone {
  id                            String   @id @default(uuid()) @db.Uuid
  tenant_id                     String   @db.Uuid
  branch_id                     String   @db.Uuid
  name                          String   @db.VarChar(120)
  polygon_or_neighborhoods_json Json     @db.JsonB
  delivery_fee_cop              Int      @default(0)
  min_order_cop                 Int      @default(0)
  estimated_minutes_min         Int      @default(30)
  estimated_minutes_max         Int      @default(50)
  is_active                     Boolean  @default(true)
  created_at                    DateTime @default(now()) @db.Timestamptz(6)

  @@index([tenant_id, branch_id, is_active], name: "idx_delivery_zones_branch_active")
  @@map("delivery_zones")
}

model DeliveryAddress {
  id              String   @id @default(uuid()) @db.Uuid
  tenant_id       String   @db.Uuid
  customer_id     String?  @db.Uuid
  address_line    String   @db.VarChar(255)
  neighborhood    String   @db.VarChar(120)
  reference_notes String?  @db.Text
  city            String   @default("Colombia") @db.VarChar(100)
  created_at      DateTime @default(now()) @db.Timestamptz(6)

  customer        Customer? @relation(fields: [customer_id], references: [id], onDelete: Cascade)

  @@index([tenant_id, customer_id], name: "idx_delivery_addresses_customer")
  @@map("delivery_addresses")
}

model BranchOrderSequence {
  tenant_id     String   @db.Uuid
  branch_id     String   @db.Uuid
  sequence_date String   @db.VarChar(10) // Formato YYYY-MM-DD en la zona horaria de la sucursal
  last_value    Int      @default(100)   // Inicia en 100 para que el primer pedido del día sea #A101

  @@id([tenant_id, branch_id, sequence_date])
  @@map("branch_order_sequences")
}

model Order {
  id                                 String    @id @default(uuid()) @db.Uuid
  tenant_id                          String    @db.Uuid
  branch_id                          String    @db.Uuid
  order_code                         String    @db.VarChar(16)
  origin                             String    @db.VarChar(24)
  fulfillment_type                   String    @db.VarChar(24)
  status                             String    @db.VarChar(32)
  payment_policy                     String    @db.VarChar(24)
  require_payment_before_preparation Boolean   @default(false)
  payment_status                     String    @db.VarChar(24)
  customer_id                        String?   @db.Uuid
  customer_snapshot_json             Json      @db.JsonB
  table_id                           String?   @db.Uuid
  dining_account_id                  String?   @db.Uuid
  public_token                       String    @unique @db.VarChar(64)
  public_token_expires_at            DateTime? @db.Timestamptz(6)
  idempotency_key                    String?   @db.VarChar(64)
  subtotal_products_cop              Int
  discount_total_cop                 Int       @default(0)
  delivery_fee_cop                   Int       @default(0)
  tax_total_cop                      Int       @default(0)
  tip_cop                            Int       @default(0)
  grand_total_cop                    Int
  paid_total_cop                     Int       @default(0)
  uncollected_amount_cop             Int       @default(0)
  resolution_type                    String?   @db.VarChar(24)
  resolution_reason                  String?   @db.Text
  resolved_by                        String?   @db.Uuid
  resolved_at                        DateTime? @db.Timestamptz(6)
  tax_summary_snapshot_json          Json      @db.JsonB
  notes                              String?   @db.Text
  is_locked                          Boolean   @default(false)
  processed_at                       DateTime? @db.Timestamptz(6)
  processed_by                       String?   @db.Uuid
  created_at                         DateTime  @default(now()) @db.Timestamptz(6)

  customer                           Customer?          @relation(fields: [customer_id], references: [id])
  items                              OrderItem[]
  status_events                      OrderStatusEvent[]

  @@unique([tenant_id, idempotency_key], name: "uq_orders_tenant_idempotency")
  @@index([tenant_id, branch_id, status, created_at(sort: Desc)], name: "idx_orders_panel")
  @@index([tenant_id, customer_id, status], name: "idx_orders_customer_active")
  @@map("orders")
}

model OrderItem {
  id                      String   @id @default(uuid()) @db.Uuid
  tenant_id               String   @db.Uuid
  order_id                String   @db.Uuid
  product_id              String?  @db.Uuid
  product_snapshot_json   Json     @db.JsonB
  quantity                Int
  unit_price_cop          Int
  discount_cop            Int      @default(0)
  modifiers_snapshot_json Json     @db.JsonB
  tax_snapshot_json       Json     @db.JsonB
  line_total_cop          Int
  station_key             String?  @db.VarChar(48)
  status                  String   @default("PENDING") @db.VarChar(24)
  notes                   String?  @db.Text

  order                   Order    @relation(fields: [order_id], references: [id], onDelete: Cascade)

  @@index([tenant_id, order_id], name: "idx_order_items_order")
  @@map("order_items")
}

model OrderStatusEvent {
  id                  String   @id @default(uuid()) @db.Uuid
  tenant_id           String   @db.Uuid
  order_id            String   @db.Uuid
  from_status         String?  @db.VarChar(32)
  to_status           String   @db.VarChar(32)
  actor_id            String?  @db.Uuid
  occurred_at         DateTime @default(now()) @db.Timestamptz(6)
  reason              String?  @db.Text
  visible_to_customer Boolean  @default(true)

  order               Order    @relation(fields: [order_id], references: [id], onDelete: Cascade)

  @@index([tenant_id, order_id, occurred_at], name: "idx_order_status_events_order")
  @@map("order_status_events")
}
```

### 3.2 Reglas SQL Obligatorias en la Migración (`CHECK`, Índices Parciales y Políticas RLS)

La migración SQL de la Fase 03A debe incluir explícitamente las siguientes sentencias:

```sql
-- 1. Índice parcial para búsqueda instantánea de HMAC antifraude
CREATE INDEX idx_customer_blocked_hmac
  ON customers(tenant_id, blocked_phone_hmac)
  WHERE blocked_phone_hmac IS NOT NULL;

-- 2. Índice parcial para el job de caducidad automática de solicitudes REQUESTED sin pagos
CREATE INDEX idx_orders_expiration
  ON orders(status, created_at)
  WHERE status = 'REQUESTED' AND paid_total_cop = 0;

-- 3. Las 4 restricciones CHECK de integridad en la tabla orders (DEFINICION_TECNICA v2.4.0 §9.1.3)
ALTER TABLE orders
  ADD CONSTRAINT chk_orders_dine_in_policy
  CHECK (fulfillment_type != 'DINE_IN' OR payment_policy = 'OFFLINE_ONLY');

ALTER TABLE orders
  ADD CONSTRAINT chk_orders_prepayment_scope
  CHECK (
    require_payment_before_preparation = FALSE
    OR (payment_policy = 'OFFLINE_ONLY' AND fulfillment_type IN ('PICKUP', 'DELIVERY'))
  );

ALTER TABLE orders
  ADD CONSTRAINT chk_orders_payment_status_policy
  CHECK (
    (payment_policy = 'NONE' AND payment_status = 'NOT_TRACKED')
    OR (payment_policy = 'OFFLINE_ONLY' AND payment_status != 'NOT_TRACKED')
  );

ALTER TABLE orders
  ADD CONSTRAINT chk_orders_no_payment_in_requested
  CHECK (status != 'REQUESTED' OR paid_total_cop = 0);

-- 4. Activación de Row-Level Security (RLS) para las 6 tablas nuevas
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_customers ON customers
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_delivery_zones ON delivery_zones
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE delivery_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_addresses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_delivery_addresses ON delivery_addresses
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE branch_order_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_order_sequences FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_branch_order_sequences ON branch_order_sequences
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_orders ON orders
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_order_items ON order_items
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE order_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_order_status_events ON order_status_events
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

---

## 4. Especificación Detallada de Servicios Backend y Contratos de API (`/api/v1`)

### 4.1 Algoritmo de Numeración Secuencial Diaria sin Colisiones (`OrderCodeGeneratorService`)
Para evitar que dos clientes que piden en el mismo milisegundo reciban el mismo `order_code` (`#A101`), la generación del código se ejecuta dentro de la transacción `PrismaService.withTenant` mediante un `INSERT ... ON CONFLICT DO UPDATE` atómico en PostgreSQL:
1. Calcular `sequenceDate` en formato `YYYY-MM-DD` usando `Intl.DateTimeFormat('en-CA', { timeZone: branch.timezone })`.
2. Ejecutar en la transacción:
   ```sql
   INSERT INTO branch_order_sequences (tenant_id, branch_id, sequence_date, last_value)
   VALUES ($1::uuid, $2::uuid, $3, 101)
   ON CONFLICT (tenant_id, branch_id, sequence_date)
   DO UPDATE SET last_value = branch_order_sequences.last_value + 1
   RETURNING last_value;
   ```
3. Formatear el número retornado con el prefijo `#A` (ej. `101` $\rightarrow$ `'#A101'`).

### 4.2 Contrato de Creación de Pedido Público (`POST /api/v1/public/orders`)
- **Cabeceras requeridas:** `Idempotency-Key: <string 16..64 chars>`
- **Cuerpo de entrada (`CreatePublicOrderDto`):**
  ```json
  {
    "branch_id": "uuid-sucursal",
    "origin": "WHATSAPP",
    "fulfillment_type": "DELIVERY",
    "customer": {
      "name": "Carlos Ramírez",
      "phone": "300 123 4567",
      "privacy_consent_accepted": true
    },
    "delivery": {
      "delivery_zone_id": "uuid-zona-centro",
      "address_line": "Calle 19 # 8-45 Apto 302",
      "neighborhood": "Centro",
      "reference_notes": "Edificio esquinero ladrillo"
    },
    "notes": "Sin salsas en la hamburguesa",
    "items": [
      {
        "product_id": "uuid-hamburguesa",
        "variant_id": null,
        "quantity": 2,
        "modifiers": [
          { "group_id": "uuid-grupo-adiciones", "option_id": "uuid-opcion-tocineta" }
        ],
        "notes": "Bien asada"
      }
    ]
  }
  ```
- **Validaciones en `CreatePublicOrderService`:**
  1. Verificar que el módulo `ordering` esté activo en la sucursal; si `fulfillment_type === 'PICKUP'`, verificar que `channel.pickup` esté activo; si `fulfillment_type === 'DELIVERY'`, verificar que `channel.delivery` esté activo; si `origin === 'WHATSAPP'`, verificar que `notifications.whatsapp_click` esté activo. Si alguno está apagado, lanzar `403 MODULE_DISABLED`.
  2. Verificar en `BranchChannelPolicy` que el canal tenga `enabled === true` y que la sucursal esté dentro de su horario de atención (`400 BRANCH_CLOSED` o `400 CHANNEL_DISABLED`).
  3. **Idempotencia:** Buscar en `orders` por `(tenant_id, idempotency_key)`. Si existe, reconstruir y devolver la respuesta original con HTTP `200 OK` / `201 Created`.
  4. **Antifraude (Bloqueo y Frecuencia):**
     - Normalizar `customer.phone` a `phoneE164` (`+573001234567`).
     - Calcular `phoneHmac = createHmac('sha256', process.env.FRAUD_PEPPER_SECRET).update(`${tenantId}:${phoneE164}`).digest('hex')`.
     - Buscar en `customers` si existe fila con `(tenant_id = tenantId AND phone_e164 = phoneE164 AND is_blocked = true)` **o** `(tenant_id = tenantId AND blocked_phone_hmac = phoneHmac AND is_blocked = true)`. Si existe, lanzar HTTP `403 Forbidden` con `{ errorCode: 'CUSTOMER_PHONE_BLOCKED', message: 'No es posible procesar solicitudes desde este número.' }`.
     - Contar en `orders` cuántas filas tienen `customer.phone_e164 == phoneE164`, `branch_id == branchId` y `status IN ('REQUESTED', 'RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY')`. Si el conteo es $\ge 3$, lanzar HTTP `429 Too Many Requests` con `{ errorCode: 'MAX_OPEN_ORDERS_PER_PHONE_EXCEEDED', message: 'Ya tienes 3 pedidos en curso en esta sucursal.' }`.
  5. **Cálculo de Líneas, Impuestos y Cobertura:**
     - Cargar productos, variantes y grupos de modificadores desde PostgreSQL. Si algún producto o modificador no existe, pertenece a otro tenant o está en `OUT_OF_STOCK` / `ARCHIVED`, lanzar `400 PRODUCT_OR_MODIFIER_UNAVAILABLE`.
     - Validar para cada producto que los modificadores enviados cumplan `is_required`, `min_selections` y `max_selections` de cada `ModifierGroup` vinculado al producto.
     - Calcular cada línea con `calculateLinePricing` de `packages/shared`, sumar `subtotal_products_cop` y `tax_total_cop`, y construir `tax_summary_snapshot_json`.
     - Si `fulfillment_type === 'DELIVERY'`, validar con `DeliveryCoverageService.validateDeliveryRequest` que `subtotal_products_cop >= zone.min_order_cop` (`400 MIN_ORDER_AMOUNT_NOT_MET`) y obtener `delivery_fee_cop = zone.delivery_fee_cop`.
     - Calcular `grand_total_cop = subtotal_products_cop - discount_total_cop + delivery_fee_cop + (tax_profile_mode === 'BASE_PLUS_TAX' ? tax_total_cop : 0)`.
  6. **Estado Inicial e Inserción:**
     - Si `origin === 'WHATSAPP'`, `status = 'REQUESTED'`; si `origin === 'WEB_DIRECT'`, `status = 'RECEIVED'`.
     - Copiar `payment_policy` de `BranchChannelPolicy`: si es `'NONE'`, fijar `payment_status = 'NOT_TRACKED'` y `require_payment_before_preparation = false`; si es `'OFFLINE_ONLY'`, fijar `payment_status = 'UNPAID'` y copiar `require_payment_before_preparation`.
     - Generar `order_code` con `OrderCodeGeneratorService` y `public_token = randomBytes(32).toString('base64url')`.
     - Guardar `Customer`, `DeliveryAddress` (si es domicilio), `Order`, `OrderItem[]` y `OrderStatusEvent` inicial.
- **Respuesta (`201 Created`):**
  ```json
  {
    "order_id": "uuid-orden",
    "order_code": "#A101",
    "origin": "WHATSAPP",
    "fulfillment_type": "DELIVERY",
    "status": "REQUESTED",
    "payment_policy": "NONE",
    "payment_status": "NOT_TRACKED",
    "subtotal_products_cop": 40000,
    "delivery_fee_cop": 4000,
    "tax_total_cop": 0,
    "grand_total_cop": 44000,
    "public_token": "token_opaco_32_bytes_base64url",
    "tracking_url": "http://localhost:5173/t/token_opaco_32_bytes_base64url",
    "whatsapp_redirect_url": "https://wa.me/573009998877?text=...",
    "payment_instructions": null
  }
  ```

### 4.3 Moderación Antifraude y Anonimización Ley 1581 (`CustomerModerationController`)
1. **`GET /api/v1/admin/customers?q=...&is_blocked=...&page=1&limit=20`:**
   - Protegido con `JwtAuthGuard`, `TenantContextGuard` y roles `TENANT_ADMIN` / `BRANCH_MANAGER`.
   - Devuelve listado paginado de clientes del restaurante con conteo de pedidos totales, fecha de último pedido (`last_order_at`), estado `is_blocked` y estado `anonymized_at`.
2. **`PATCH /api/v1/admin/customers/:customerId/block`:**
   - Recibe `{ is_blocked: boolean, reason: string }`.
   - Si `is_blocked === true`:
     - Si el cliente aún no ha sido anonimizado (`!phone_e164.startsWith('ANON_')`), calcula `blocked_phone_hmac = createHmac('sha256', FRAUD_PEPPER_SECRET).update(`${tenantId}:${customer.phone_e164}`).digest('hex')`.
     - Fija `is_blocked = true`, `blocked_reason = reason`, `blocked_at = NOW()`.
   - Si `is_blocked === false`:
     - Fija `is_blocked = false`, `blocked_reason = null`, `blocked_at = null`, `blocked_phone_hmac = null`.
   - Registra en `AuditEvent` (`action: is_blocked ? 'CUSTOMER_BLOCKED' : 'CUSTOMER_UNBLOCKED'`, guardando únicamente `{ customer_id, is_blocked, reason }` sin teléfono ni nombre).
3. **`POST /api/v1/admin/customers/:customerId/anonymize`:**
   - Verifica que el cliente no tenga órdenes en estados activos (`REQUESTED`, `RECEIVED`, `ACCEPTED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`); si tiene alguna, aborta con HTTP `409 Conflict` (`CUSTOMER_HAS_ACTIVE_ORDERS`).
   - En transacción dentro de `PrismaService.withTenant`:
     - Si `customer.is_blocked === true` y `!customer.blocked_phone_hmac`, calcula y guarda `blocked_phone_hmac`.
     - Actualiza `Customer`: `name = 'Cliente Anonimizado'`, `phone_e164 = 'ANON_' + randomUUID()`, `anonymized_at = NOW()`.
     - Ejecuta `DELETE FROM delivery_addresses WHERE tenant_id = $1 AND customer_id = $2`.
     - Actualiza todas las órdenes de ese cliente en `orders` reemplazando `customer_snapshot_json` por:
       ```json
       {
         "name": "Anonimizado",
         "phone_e164": "REDACTED",
         "delivery_zone_id": null,
         "delivery_zone_name": null,
         "address_line": "REDACTED",
         "neighborhood": "REDACTED",
         "reference_notes": "REDACTED",
         "privacy_consent_at": "<fecha_original>",
         "anonymized_at": "<fecha_actual_iso>"
       }
       ```
     - Registra en `AuditEvent` (`action: 'CUSTOMER_PII_ANONYMIZED'`, `entity_id: customerId`, sin ningún dato personal en `metadata_json`).

---

## 5. Matriz de Casos de Prueba Obligatorios (Fase 03A)

El desarrollo de la Fase 03A solo se considera completo cuando todas las siguientes pruebas automatizadas pasan en verde (`Vitest` + `Supertest`):

### 5.1 Pruebas Unitarias (`packages/shared`)
- **`TC-03A-U01` (Máquina de Estados Evaluando `fulfillment_type`, `origin` y Pre-Cobro):**
  - Una orden con `fulfillment_type = 'PICKUP'` puede transicionar de `'ACCEPTED'` $\rightarrow$ `'READY'` $\rightarrow$ `'PICKED_UP'`, pero rechaza `'OUT_FOR_DELIVERY'` y `'DELIVERED'` con `INVALID_STATUS_FOR_FULFILLMENT_TYPE`.
  - Una orden con `fulfillment_type = 'DELIVERY'` puede transicionar de `'ACCEPTED'` $\rightarrow$ `'OUT_FOR_DELIVERY'` $\rightarrow$ `'DELIVERED'`, pero rechaza `'PICKED_UP'`.
  - Una orden en `'REQUESTED'` rechaza saltar directamente a `'PREPARING'`, `'READY'` o `'DELIVERED'` con `ORDER_MUST_BE_ACCEPTED_FIRST`.
  - Cuando `requirePaymentBeforePreparation === true` y `paymentStatus !== 'PAID'`, rechaza pasar de `'ACCEPTED'` a `'PREPARING'` con `PAYMENT_REQUIRED_BEFORE_PREPARATION`.
- **`TC-03A-U02` (Generación de Enlace `wa.me` Cliente $\rightarrow$ Sucursal y Enmascaramiento de PII):**
  - `buildCustomerToBranchWhatsappUrl` debe retornar una URL `https://wa.me/57...` cuyo parámetro `text` decodificado contenga el código `#A101`, la modalidad, los productos con sus modificadores y el total formateado en COP.
  - `maskCustomerSnapshot` debe transformar `"Carlos Ramírez"` en `"Carlos R."`, `"+573001234567"` en `"+57 *** *** 4567"` y ocultar los números de la dirección.
- **`TC-03A-U03` (Validación Zod de `CreatePublicOrderSchema` y `DeliveryZoneSchema`):**
  - Rechaza un pedido con `fulfillment_type: 'DELIVERY'` si falta `address_line`, `neighborhood` o `delivery_zone_id`.
  - Rechaza cualquier pedido donde `privacy_consent_accepted` no sea `true`.

### 5.2 Pruebas de Integración, Antifraude y Privacidad (`apps/api/test/`)
- **`TC-03A-I01` (Creación de Solicitud Nivel 1 `WHATSAPP`, Autoridad de Precios y Numeración Secuencial `#A101`):**
  - En una sucursal en perfil `WHATSAPP_SIMPLE` (`payment_policy = 'NONE'`), el cliente envía `POST /api/v1/public/orders` con `origin: 'WHATSAPP'` y `fulfillment_type: 'DELIVERY'`.
  - El backend calcula los totales reales desde PostgreSQL, guarda los snapshots JSONB en `order` y `order_items`, asigna `order_code = '#A101'` (y `#A102` al siguiente pedido del mismo día), fija `status = 'REQUESTED'`, `payment_policy = 'NONE'`, `payment_status = 'NOT_TRACKED'` y `paid_total_cop = 0`, e inserta el `OrderStatusEvent` inicial.
- **`TC-03A-I02` (Concurrencia en Numeración Diaria `#A10X`):**
  - Disparar 10 peticiones simultáneas (`Promise.all`) con distintas `Idempotency-Key` a `POST /api/v1/public/orders` sobre la misma sucursal debe generar exactamente 10 códigos únicos consecutivos (`#A101` a `#A110`) sin errores de duplicidad ni condiciones de carrera.
- **`TC-03A-I03` (Idempotencia Aislada por Tenant — `UNIQUE(tenant_id, idempotency_key)`):**
  - Enviar dos veces `POST /api/v1/public/orders` al *Restaurante A* con la misma `Idempotency-Key: "idem-key-001"` crea **una única fila** en `orders` y devuelve el mismo `order_id`, `order_code` y `public_token`.
  - Enviar `POST /api/v1/public/orders` al *Restaurante B* con la misma cadena `Idempotency-Key: "idem-key-001"` crea la orden en el *Restaurante B* sin conflicto.
- **`TC-03A-I04` (Validación de Cobertura, Pedido Mínimo y Bloqueo por Modificador Agotado):**
  - Si la `DeliveryZone` exige `min_order_cop = 30000` y los productos suman `$22.000`, `POST /api/v1/public/orders` responde HTTP `400 Bad Request` (`MIN_ORDER_AMOUNT_NOT_MET`).
  - Si el carrito incluye un `ModifierOption` en estado `OUT_OF_STOCK`, responde HTTP `400 Bad Request` (`PRODUCT_OR_MODIFIER_UNAVAILABLE`).
- **`TC-03A-I05` (Control Antifraude: Límite de 3 Solicitudes Abiertas por Teléfono):**
  - Un mismo teléfono `+573001112233` crea 3 solicitudes en estado `REQUESTED` en la misma sucursal; al enviar la 4.ª solicitud, el backend responde HTTP `429 Too Many Requests` (`MAX_OPEN_ORDERS_PER_PHONE_EXCEEDED`).
- **`TC-03A-I06` (Anonimización Irreversible con UUID y Persistencia del Bloqueo Antifraude con HMAC — Ley 1581):**
  - **Subcaso 1 (Cliente normal):** Un cliente con teléfono `+573009998877` tiene una orden finalizada (`DELIVERED` o `CANCELLED`) por `$50.000`. Al invocar `POST /api/v1/admin/customers/:id/anonymize`, `Customer.phone_e164` pasa a `"ANON_<uuid>"` (formato UUID v4 aleatorio), sus filas en `delivery_addresses` se borran y `Order.customer_snapshot_json` queda con `"REDACTED"`, mientras que `Order.grand_total_cop` permanece en `$50.000` y `audit_events` no contiene el teléfono ni el nombre en `metadata_json`.
  - **Subcaso 2 (Bloqueo si hay orden activa):** Si el cliente tiene una orden en `REQUESTED` o `ACCEPTED`, `POST /api/v1/admin/customers/:id/anonymize` rechaza con HTTP `409 Conflict` (`CUSTOMER_HAS_ACTIVE_ORDERS`).
  - **Subcaso 3 (Cliente bloqueado por fraude que pide supresión):** El gerente bloquea al cliente `+573112223344` (`PATCH /api/v1/admin/customers/:id/block`), guardándose su `blocked_phone_hmac`. Luego se anonimiza al cliente (`POST /api/v1/admin/customers/:id/anonymize`): su teléfono en texto plano se reemplaza por `"ANON_<uuid>"`, pero cuando ese mismo número `+573112223344` intenta hacer un nuevo pedido en `POST /api/v1/public/orders`, el backend detecta la coincidencia de `blocked_phone_hmac` y lo rechaza con HTTP `403 Forbidden` (`CUSTOMER_PHONE_BLOCKED`).
- **`TC-03A-I07` (Caducidad Automática Segura a `EXPIRED_UNPROCESSED`):**
  - Una solicitud en `status = 'REQUESTED'` y `paid_total_cop = 0` cuya fecha `created_at` sea anterior a `NOW() - unprocessed_expiry_minutes` cambia automáticamente a `status = 'EXPIRED_UNPROCESSED'` al ejecutarse `OrderExpirationScheduler.handleExpiredRequests()`, creando su `OrderStatusEvent`.
- **`TC-03A-I08` (Verificación de las 4 Restricciones `CHECK` en PostgreSQL y Aislamiento Multi-Tenant):**
  - Intentar insertar por SQL en `orders` una fila con `payment_policy = 'NONE'` y `payment_status = 'UNPAID'`, o una fila con `status = 'REQUESTED'` y `paid_total_cop = 5000`, o `fulfillment_type = 'DINE_IN'` y `payment_policy = 'NONE'`, falla directamente en PostgreSQL por violación de `CHECK`.
  - Un gerente del *Restaurante A* no puede listar, bloquear ni anonimizar clientes ni zonas de domicilio del *Restaurante B* (`403 / 404`).

### 5.3 Prueba End-to-End de Carrito y Checkout WhatsApp (`apps/web`)
- **`TC-03A-E01` (Flujo Completo en Vitrina Pública: Carrito Zustand, Validación de Zona y Confirmación WhatsApp):**
  - El comensal abre `/r/:restaurantSlug`, selecciona un producto con variante y modificadores obligatorios, lo agrega al carrito (verificando que persiste al recargar la página), abre el checkout, selecciona `Domicilio`, elige su zona, completa nombre, WhatsApp `3001234567`, dirección, marca la casilla de aceptación de privacidad (Ley 1581) y pulsa **"Terminar pedido por WhatsApp"**, verificando que se muestra en pantalla el código `#A101`, la advertencia de pulsar enviar en WhatsApp y el botón con la URL `https://wa.me/` prellenada.

---

## 6. Secuencia de Prompts Acotados para Ejecutar la Fase 03A con Gemini

Adjunta `DEFINICION_TECNICA.md` (v2.4.0), `STACK_VERSIONS.md` (v2.4.0) y este archivo `FASE_03A_MOTOR_PEDIDOS_ANTIFRAUDE_Y_WHATSAPP.md`, y solicita los siguientes **4 pasos en orden**, ejecutando la puerta de validación manual al terminar cada paso:

### Paso 3A.1: Interfaces de Snapshots, Máquina de Estados, Esquemas Zod, Plantillas WhatsApp y Pruebas Unitarias (`packages/shared`)
> **Prompt 3A.1:** *"Con base en `DEFINICION_TECNICA.md` (v2.4.0), `STACK_VERSIONS.md` (v2.4.0) y `FASE_03A_MOTOR_PEDIDOS_ANTIFRAUDE_Y_WHATSAPP.md`, genera en `packages/shared` las interfaces y esquemas de snapshots (`order-snapshots.schema.ts`), la máquina de estados del pedido (`order-status.machine.ts` evaluando `origin`, `fulfillment_type`, `requirePaymentBeforePreparation` y `paidTotalCop`), los esquemas Zod de creación de pedido público, zonas de domicilio y bloqueo de clientes (`ordering.schema.ts`), las funciones `buildCustomerToBranchWhatsappUrl` y `maskCustomerSnapshot` (`whatsapp-templates.ts`) y las pruebas unitarias `TC-03A-U01` a `TC-03A-U03`. Entrega el código 100 % completo y sin TODOs."*
- **Puerta Manual 3A.1:** Ejecutar `pnpm --filter @restaurante-saas/shared typecheck && pnpm --filter @restaurante-saas/shared test`.

### Paso 3A.2: Modelos Prisma (`Customer`, `DeliveryZone`, `DeliveryAddress`, `BranchOrderSequence`, `Order`, `OrderItem`, `OrderStatusEvent`) y Migración SQL con RLS + `CHECK`
> **Prompt 3A.2:** *"Actualiza `apps/api/prisma/schema.prisma` agregando los modelos `Customer` (con `blocked_phone_hmac` y `anonymized_at`), `DeliveryZone`, `DeliveryAddress`, `BranchOrderSequence`, `Order`, `OrderItem` y `OrderStatusEvent` tal como están especificados en la Sección 3.1 de `FASE_03A_MOTOR_PEDIDOS_ANTIFRAUDE_Y_WHATSAPP.md`, y genera la migración SQL correspondiente incluyendo los índices parciales, las 4 restricciones `CHECK` sobre `orders` y las políticas Row-Level Security (RLS) para las 7 tablas."*
- **Puerta Manual 3A.2:** Ejecutar `pnpm --filter @restaurante-saas/api prisma migrate deploy && pnpm --filter @restaurante-saas/api typecheck`.

### Paso 3A.3: Módulos Backend `delivery` y `ordering` (Parte A: Creación Idempotente, Secuencia `#A101`, Antifraude HMAC, Anonimización Ley 1581 y Caducidad) + Tests de Integración
> **Prompt 3A.3:** *"Implementa completos en `apps/api/src/modules/` el módulo `delivery` (`DeliveryAdminController`, endpoint público de zonas y `DeliveryCoverageService`) y la Parte A del módulo `ordering` (`OrderCodeGeneratorService` con `ON CONFLICT DO UPDATE`, `CreatePublicOrderService` con idempotencia por tenant y los 5 controles antifraude, `CustomerModerationController` y `CustomerModerationService` con bloqueo HMAC y anonimización irreversible Ley 1581 en `Customer` y snapshots, `CustomerRetentionScheduler` y `OrderExpirationScheduler`), junto con las pruebas de integración `TC-03A-I01` a `TC-03A-I08`."*
- **Puerta Manual 3A.3:** Ejecutar `pnpm --filter @restaurante-saas/api typecheck && pnpm --filter @restaurante-saas/api test`.

### Paso 3A.4: Frontend React: Carrito Zustand, Checkout Público hacia WhatsApp y Gestión Administrativa de Zonas y Clientes
> **Prompt 3A.4:** *"Implementa en `apps/web` el store de carrito persistente en Zustand (`useCartStore`) y el Checkout público en `features/public-storefront/` (con selección de modalidad `PICKUP`/`DELIVERY`, selector de zona con validación de pedido mínimo, recuadro de `payment_instructions_json`, casilla de consentimiento Ley 1581 y pantalla de confirmación con redirección `wa.me`), además de las vistas administrativas de Zonas de Domicilio (`/admin/delivery-zones`) y Directorio de Clientes con bloqueo antifraude y anonimización Ley 1581 (`/admin/customers`) en `features/admin-settings/`, incluyendo la prueba E2E `TC-03A-E01`."*
- **Puerta Manual 3A.4 (Puerta Intermedia antes de Fase 03B):** Ejecutar `pnpm turbo run typecheck && pnpm turbo run test && pnpm --filter @restaurante-saas/web build`.