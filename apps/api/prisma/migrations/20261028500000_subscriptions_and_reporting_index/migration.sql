-- Migración Fase 05: Subscriptions, Subscription Invoices y Reporting Index con RLS y Restricciones CHECK
-- Alineado con DEFINICION_TECNICA.md (v2.4.0) y FASE_05_REPORTES_SUSCRIPCION_MANUAL_Y_PWA.md

-- 1. Tabla subscriptions
CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "plan_id" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'TRIALING',
    "current_period_start" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_period_end" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_tenant_id_fkey";
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_updated_by_fkey";
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_tenant_id_key"
    ON "subscriptions"("tenant_id");

-- Restricción CHECK de estado de suscripción
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "chk_subscription_status";
ALTER TABLE "subscriptions" ADD CONSTRAINT "chk_subscription_status"
    CHECK (status IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'));

-- RLS para subscriptions
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_subscriptions" ON "subscriptions";
CREATE POLICY "tenant_isolation_subscriptions" ON "subscriptions"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 2. Tabla subscription_invoices
CREATE TABLE IF NOT EXISTS "subscription_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "invoice_code" VARCHAR(64) NOT NULL,
    "plan_id" VARCHAR(64) NOT NULL,
    "amount_cop" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PAID',
    "payment_reference_note" TEXT,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "subscription_invoices" DROP CONSTRAINT IF EXISTS "subscription_invoices_tenant_id_fkey";
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscription_invoices" DROP CONSTRAINT IF EXISTS "subscription_invoices_subscription_id_fkey";
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscription_invoices" DROP CONSTRAINT IF EXISTS "subscription_invoices_recorded_by_fkey";
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_recorded_by_fkey"
    FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_invoices_tenant_code"
    ON "subscription_invoices"("tenant_id", "invoice_code");

CREATE INDEX IF NOT EXISTS "subscription_invoices_tenant_id_subscription_id_idx"
    ON "subscription_invoices"("tenant_id", "subscription_id");

-- Restricciones CHECK para facturas
ALTER TABLE "subscription_invoices" DROP CONSTRAINT IF EXISTS "chk_invoice_amount_positive";
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "chk_invoice_amount_positive"
    CHECK (amount_cop >= 0);

ALTER TABLE "subscription_invoices" DROP CONSTRAINT IF EXISTS "chk_invoice_status";
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "chk_invoice_status"
    CHECK (status IN ('PAID', 'VOIDED'));

-- RLS para subscription_invoices
ALTER TABLE "subscription_invoices" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_subscription_invoices" ON "subscription_invoices";
CREATE POLICY "tenant_isolation_subscription_invoices" ON "subscription_invoices"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 3. Índice Analítico Compuesto para Reportes
CREATE INDEX IF NOT EXISTS "idx_orders_reporting"
    ON "orders"("tenant_id", "branch_id", "status", "payment_policy", "payment_status", "created_at" DESC);
