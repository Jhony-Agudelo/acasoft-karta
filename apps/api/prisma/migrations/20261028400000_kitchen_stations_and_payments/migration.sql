-- Migración Fase 04: Kitchen Stations, Payments y KDS con RLS y Restricciones CHECK
-- Alineado con DEFINICION_TECNICA.md (v2.4.0 — Sección 9.1.5) y FASE_04_PANEL_COMPLETO_COCINA_KDS_Y_COBROS_MANUALES.md

-- 1. Tabla kitchen_stations
CREATE TABLE IF NOT EXISTS "kitchen_stations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kitchen_stations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "kitchen_stations" DROP CONSTRAINT IF EXISTS "kitchen_stations_tenant_id_fkey";
ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kitchen_stations" DROP CONSTRAINT IF EXISTS "kitchen_stations_branch_id_fkey";
ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "kitchen_stations_tenant_id_branch_id_key_key"
    ON "kitchen_stations"("tenant_id", "branch_id", "key");

-- RLS para kitchen_stations
ALTER TABLE "kitchen_stations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_kitchen_stations" ON "kitchen_stations";
CREATE POLICY "tenant_isolation_kitchen_stations" ON "kitchen_stations"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 2. Tabla payments
CREATE TABLE IF NOT EXISTS "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "order_id" UUID,
    "account_id" UUID,
    "method" VARCHAR(24) NOT NULL,
    "amount_cop" INTEGER NOT NULL,
    "cash_received_cop" INTEGER,
    "change_given_cop" INTEGER,
    "reference_note" VARCHAR(120),
    "status" VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
    "idempotency_key" VARCHAR(64) NOT NULL,
    "created_by" UUID NOT NULL,
    "voided_by" UUID,
    "voided_at" TIMESTAMPTZ(6),
    "voided_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_tenant_id_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_branch_id_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_order_id_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_created_by_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_voided_by_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_fkey"
    FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Restricciones CHECK obligatorias
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "chk_payments_xor_target";
ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_xor_target"
    CHECK (("order_id" IS NOT NULL AND "account_id" IS NULL) OR ("order_id" IS NULL AND "account_id" IS NOT NULL));

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "chk_payments_positive_amount";
ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_positive_amount"
    CHECK ("amount_cop" > 0);

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "chk_payments_cash_change";
ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_cash_change"
    CHECK ("cash_received_cop" IS NULL OR ("cash_received_cop" >= "amount_cop" AND "change_given_cop" = "cash_received_cop" - "amount_cop"));

-- Índices obligatorios
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payments_tenant_idempotency"
    ON "payments"("tenant_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "idx_payments_tenant_order"
    ON "payments"("tenant_id", "order_id", "status");

-- Índice KDS para order_items
CREATE INDEX IF NOT EXISTS "idx_order_items_kds"
    ON "order_items"("tenant_id", "station_key", "status");

-- RLS para payments
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_payments" ON "payments";
CREATE POLICY "tenant_isolation_payments" ON "payments"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
