-- Migración Fase 03A: Motor de Pedidos, Cobertura, Antifraude y Ley 1581
-- Alineado con DEFINICION_TECNICA.md (v2.4.0 — Sección 9.1.3) y FASE_03A_MOTOR_PEDIDOS_ANTIFRAUDE_Y_WHATSAPP.md

-- 1. Tabla de Clientes (Customer)
CREATE TABLE IF NOT EXISTS "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone_e164" VARCHAR(48) NOT NULL,
    "privacy_consent_at" TIMESTAMPTZ(6) NOT NULL,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "blocked_reason" TEXT,
    "blocked_at" TIMESTAMPTZ(6),
    "blocked_phone_hmac" VARCHAR(64),
    "anonymized_at" TIMESTAMPTZ(6),
    "last_order_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_customers_tenant_phone" ON "customers"("tenant_id", "phone_e164");
CREATE INDEX IF NOT EXISTS "idx_customers_tenant_blocked" ON "customers"("tenant_id", "is_blocked");

-- Índice parcial para búsqueda instantánea de HMAC antifraude
CREATE INDEX IF NOT EXISTS "idx_customer_blocked_hmac"
  ON "customers"("tenant_id", "blocked_phone_hmac")
  WHERE "blocked_phone_hmac" IS NOT NULL;

-- 2. Tabla de Zonas de Cobertura de Domicilio (DeliveryZone)
CREATE TABLE IF NOT EXISTS "delivery_zones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "polygon_or_neighborhoods_json" JSONB NOT NULL,
    "delivery_fee_cop" INTEGER NOT NULL DEFAULT 0,
    "min_order_cop" INTEGER NOT NULL DEFAULT 0,
    "estimated_minutes_min" INTEGER NOT NULL DEFAULT 30,
    "estimated_minutes_max" INTEGER NOT NULL DEFAULT 50,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_delivery_zones_branch_active" ON "delivery_zones"("tenant_id", "branch_id", "is_active");

-- 3. Tabla de Direcciones de Domicilio (DeliveryAddress)
CREATE TABLE IF NOT EXISTS "delivery_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID,
    "address_line" VARCHAR(255) NOT NULL,
    "neighborhood" VARCHAR(120) NOT NULL,
    "reference_notes" TEXT,
    "city" VARCHAR(100) NOT NULL DEFAULT 'Colombia',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_addresses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_delivery_addresses_customer" ON "delivery_addresses"("tenant_id", "customer_id");

-- 4. Tabla de Secuencia Diaria de Pedidos por Sucursal (BranchOrderSequence)
CREATE TABLE IF NOT EXISTS "branch_order_sequences" (
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "sequence_date" VARCHAR(10) NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "branch_order_sequences_pkey" PRIMARY KEY ("tenant_id", "branch_id", "sequence_date")
);

-- 5. Tabla de Pedidos (Order)
CREATE TABLE IF NOT EXISTS "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "order_code" VARCHAR(16) NOT NULL,
    "origin" VARCHAR(24) NOT NULL,
    "fulfillment_type" VARCHAR(24) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "payment_policy" VARCHAR(24) NOT NULL,
    "require_payment_before_preparation" BOOLEAN NOT NULL DEFAULT false,
    "payment_status" VARCHAR(24) NOT NULL,
    "customer_id" UUID,
    "customer_snapshot_json" JSONB NOT NULL,
    "table_id" UUID,
    "dining_account_id" UUID,
    "public_token" VARCHAR(64) NOT NULL,
    "public_token_expires_at" TIMESTAMPTZ(6),
    "idempotency_key" VARCHAR(64),
    "subtotal_products_cop" INTEGER NOT NULL,
    "discount_total_cop" INTEGER NOT NULL DEFAULT 0,
    "delivery_fee_cop" INTEGER NOT NULL DEFAULT 0,
    "tax_total_cop" INTEGER NOT NULL DEFAULT 0,
    "tip_cop" INTEGER NOT NULL DEFAULT 0,
    "grand_total_cop" INTEGER NOT NULL,
    "paid_total_cop" INTEGER NOT NULL DEFAULT 0,
    "uncollected_amount_cop" INTEGER NOT NULL DEFAULT 0,
    "resolution_type" VARCHAR(24),
    "resolution_reason" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "tax_summary_snapshot_json" JSONB NOT NULL,
    "notes" TEXT,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMPTZ(6),
    "processed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "orders_public_token_key" ON "orders"("public_token");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_orders_tenant_idempotency" ON "orders"("tenant_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "idx_orders_panel" ON "orders"("tenant_id", "branch_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_orders_customer_active" ON "orders"("tenant_id", "customer_id", "status");

-- Índice parcial para el job de caducidad automática de solicitudes REQUESTED sin pagos
CREATE INDEX IF NOT EXISTS "idx_orders_expiration"
  ON "orders"("status", "created_at")
  WHERE "status" = 'REQUESTED' AND "paid_total_cop" = 0;

-- 6. Tabla de Ítems de Pedido (OrderItem)
CREATE TABLE IF NOT EXISTS "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID,
    "product_snapshot_json" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_cop" INTEGER NOT NULL,
    "discount_cop" INTEGER NOT NULL DEFAULT 0,
    "modifiers_snapshot_json" JSONB NOT NULL,
    "tax_snapshot_json" JSONB NOT NULL,
    "line_total_cop" INTEGER NOT NULL,
    "station_key" VARCHAR(48),
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_order_items_order" ON "order_items"("tenant_id", "order_id");

-- 7. Tabla de Eventos de Estado (OrderStatusEvent)
CREATE TABLE IF NOT EXISTS "order_status_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" VARCHAR(32),
    "to_status" VARCHAR(32) NOT NULL,
    "actor_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "visible_to_customer" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "order_status_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_order_status_events_order" ON "order_status_events"("tenant_id", "order_id", "occurred_at");

-- -----------------------------------------------------------------------------
-- Foreign Keys
-- -----------------------------------------------------------------------------
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_zones"
  ADD CONSTRAINT "delivery_zones_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "delivery_zones_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_addresses"
  ADD CONSTRAINT "delivery_addresses_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "delivery_addresses_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_order_sequences"
  ADD CONSTRAINT "branch_order_sequences_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "branch_order_sequences_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "orders_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "orders_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_items_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_status_events"
  ADD CONSTRAINT "order_status_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_status_events_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Las 4 restricciones CHECK de integridad en la tabla orders (DEFINICION_TECNICA v2.4.0 §9.1.3)
-- -----------------------------------------------------------------------------
ALTER TABLE "orders"
  ADD CONSTRAINT "chk_orders_dine_in_policy"
  CHECK ("fulfillment_type" != 'DINE_IN' OR "payment_policy" = 'OFFLINE_ONLY');

ALTER TABLE "orders"
  ADD CONSTRAINT "chk_orders_prepayment_scope"
  CHECK (
    "require_payment_before_preparation" = FALSE
    OR ("payment_policy" = 'OFFLINE_ONLY' AND "fulfillment_type" IN ('PICKUP', 'DELIVERY'))
  );

ALTER TABLE "orders"
  ADD CONSTRAINT "chk_orders_payment_status_policy"
  CHECK (
    ("payment_policy" = 'NONE' AND "payment_status" = 'NOT_TRACKED')
    OR ("payment_policy" = 'OFFLINE_ONLY' AND "payment_status" != 'NOT_TRACKED')
  );

ALTER TABLE "orders"
  ADD CONSTRAINT "chk_orders_no_payment_in_requested"
  CHECK ("status" != 'REQUESTED' OR "paid_total_cop" = 0);

-- -----------------------------------------------------------------------------
-- Activación de Row-Level Security (RLS) para las 7 tablas de pedidos
-- -----------------------------------------------------------------------------
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_customers" ON "customers";
CREATE POLICY "tenant_isolation_customers" ON "customers"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE "delivery_zones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_zones" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_delivery_zones" ON "delivery_zones";
CREATE POLICY "tenant_isolation_delivery_zones" ON "delivery_zones"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE "delivery_addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_addresses" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_delivery_addresses" ON "delivery_addresses";
CREATE POLICY "tenant_isolation_delivery_addresses" ON "delivery_addresses"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE "branch_order_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branch_order_sequences" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_branch_order_sequences" ON "branch_order_sequences";
CREATE POLICY "tenant_isolation_branch_order_sequences" ON "branch_order_sequences"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_orders" ON "orders";
CREATE POLICY "tenant_isolation_orders" ON "orders"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_order_items" ON "order_items";
CREATE POLICY "tenant_isolation_order_items" ON "order_items"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE "order_status_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_status_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_order_status_events" ON "order_status_events";
CREATE POLICY "tenant_isolation_order_status_events" ON "order_status_events"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);
