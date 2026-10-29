-- Migración Fase 06: Salón, Mesas, Cuentas Abiertas, División de Consumo e Índice Parcial
-- Alineado con DEFINICION_TECNICA.md (v2.4.0 — Sección 9.1.4) y FASE_06_SALON_MESAS_Y_DIVISION_INFORMATIVA.md

-- 1. Tabla dining_areas
CREATE TABLE IF NOT EXISTS "dining_areas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dining_areas_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "dining_areas" DROP CONSTRAINT IF EXISTS "dining_areas_tenant_id_fkey";
ALTER TABLE "dining_areas" ADD CONSTRAINT "dining_areas_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dining_areas" DROP CONSTRAINT IF EXISTS "dining_areas_branch_id_fkey";
ALTER TABLE "dining_areas" ADD CONSTRAINT "dining_areas_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS para dining_areas
ALTER TABLE "dining_areas" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_dining_areas" ON "dining_areas";
CREATE POLICY "tenant_isolation_dining_areas" ON "dining_areas"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 2. Tabla dining_tables
CREATE TABLE IF NOT EXISTS "dining_tables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "status" VARCHAR(24) NOT NULL DEFAULT 'FREE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dining_tables_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "dining_tables" DROP CONSTRAINT IF EXISTS "dining_tables_tenant_id_fkey";
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dining_tables" DROP CONSTRAINT IF EXISTS "dining_tables_branch_id_fkey";
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dining_tables" DROP CONSTRAINT IF EXISTS "dining_tables_area_id_fkey";
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_area_id_fkey"
    FOREIGN KEY ("area_id") REFERENCES "dining_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricción UNIQUE por sucursal y código de mesa
ALTER TABLE "dining_tables" DROP CONSTRAINT IF EXISTS "uq_tables_tenant_branch_code";
ALTER TABLE "dining_tables" ADD CONSTRAINT "uq_tables_tenant_branch_code"
    UNIQUE ("tenant_id", "branch_id", "code");

-- Restricción CHECK de estado de mesa
ALTER TABLE "dining_tables" DROP CONSTRAINT IF EXISTS "chk_dining_tables_status";
ALTER TABLE "dining_tables" ADD CONSTRAINT "chk_dining_tables_status"
    CHECK ("status" IN ('FREE', 'OCCUPIED', 'PENDING_PAYMENT', 'RESERVED'));

-- RLS para dining_tables
ALTER TABLE "dining_tables" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_dining_tables" ON "dining_tables";
CREATE POLICY "tenant_isolation_dining_tables" ON "dining_tables"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 3. Tabla dining_accounts
CREATE TABLE IF NOT EXISTS "dining_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "account_code" VARCHAR(24) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
    "payment_status" VARCHAR(24) NOT NULL DEFAULT 'UNPAID',
    "guest_count" INTEGER NOT NULL DEFAULT 1,
    "table_session_pin" VARCHAR(4),
    "subtotal_products_cop" INTEGER NOT NULL DEFAULT 0,
    "discount_total_cop" INTEGER NOT NULL DEFAULT 0,
    "tax_total_cop" INTEGER NOT NULL DEFAULT 0,
    "tip_cop" INTEGER NOT NULL DEFAULT 0,
    "grand_total_cop" INTEGER NOT NULL DEFAULT 0,
    "paid_total_cop" INTEGER NOT NULL DEFAULT 0,
    "uncollected_amount_cop" INTEGER NOT NULL DEFAULT 0,
    "tax_summary_snapshot_json" JSONB,
    "resolution_type" VARCHAR(24),
    "split_rule" VARCHAR(24) NOT NULL DEFAULT 'PROPORTIONAL',
    "opened_by" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "close_reason" TEXT,
    "reopened_by" UUID,
    "reopened_at" TIMESTAMPTZ(6),
    "reopen_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "dining_accounts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "dining_accounts" DROP CONSTRAINT IF EXISTS "dining_accounts_tenant_id_fkey";
ALTER TABLE "dining_accounts" ADD CONSTRAINT "dining_accounts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dining_accounts" DROP CONSTRAINT IF EXISTS "dining_accounts_branch_id_fkey";
ALTER TABLE "dining_accounts" ADD CONSTRAINT "dining_accounts_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dining_accounts" DROP CONSTRAINT IF EXISTS "dining_accounts_table_id_fkey";
ALTER TABLE "dining_accounts" ADD CONSTRAINT "dining_accounts_table_id_fkey"
    FOREIGN KEY ("table_id") REFERENCES "dining_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dining_accounts" DROP CONSTRAINT IF EXISTS "dining_accounts_opened_by_fkey";
ALTER TABLE "dining_accounts" ADD CONSTRAINT "dining_accounts_opened_by_fkey"
    FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dining_accounts" DROP CONSTRAINT IF EXISTS "dining_accounts_closed_by_fkey";
ALTER TABLE "dining_accounts" ADD CONSTRAINT "dining_accounts_closed_by_fkey"
    FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "dining_accounts" DROP CONSTRAINT IF EXISTS "dining_accounts_reopened_by_fkey";
ALTER TABLE "dining_accounts" ADD CONSTRAINT "dining_accounts_reopened_by_fkey"
    FOREIGN KEY ("reopened_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Restricciones CHECK obligatorias
ALTER TABLE "dining_accounts" DROP CONSTRAINT IF EXISTS "chk_dining_accounts_status";
ALTER TABLE "dining_accounts" ADD CONSTRAINT "chk_dining_accounts_status"
    CHECK ("status" IN ('OPEN', 'REOPENED_ACCOUNTING', 'CLOSED', 'CANCELLED'));

ALTER TABLE "dining_accounts" DROP CONSTRAINT IF EXISTS "chk_dining_accounts_payment_status";
ALTER TABLE "dining_accounts" ADD CONSTRAINT "chk_dining_accounts_payment_status"
    CHECK ("payment_status" IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'COURTESY', 'WRITTEN_OFF'));

ALTER TABLE "dining_accounts" DROP CONSTRAINT IF EXISTS "chk_dining_accounts_balance";
ALTER TABLE "dining_accounts" ADD CONSTRAINT "chk_dining_accounts_balance"
    CHECK ("grand_total_cop" >= "paid_total_cop");

-- Índice único parcial obligatorio: solo 1 cuenta OPEN por mesa
CREATE UNIQUE INDEX IF NOT EXISTS "idx_unique_open_account_per_table"
    ON "dining_accounts"("tenant_id", "branch_id", "table_id")
    WHERE "status" = 'OPEN';

-- Índice de búsqueda para salón
CREATE INDEX IF NOT EXISTS "idx_dining_accounts_status"
    ON "dining_accounts"("tenant_id", "branch_id", "status");

-- RLS para dining_accounts
ALTER TABLE "dining_accounts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_dining_accounts" ON "dining_accounts";
CREATE POLICY "tenant_isolation_dining_accounts" ON "dining_accounts"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 4. Tabla account_diners
CREATE TABLE IF NOT EXISTS "account_diners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "account_diners_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "account_diners" DROP CONSTRAINT IF EXISTS "account_diners_tenant_id_fkey";
ALTER TABLE "account_diners" ADD CONSTRAINT "account_diners_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_diners" DROP CONSTRAINT IF EXISTS "account_diners_account_id_fkey";
ALTER TABLE "account_diners" ADD CONSTRAINT "account_diners_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "dining_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_diners" DROP CONSTRAINT IF EXISTS "uq_account_diners_account_label";
ALTER TABLE "account_diners" ADD CONSTRAINT "uq_account_diners_account_label"
    UNIQUE ("account_id", "label");

-- RLS para account_diners
ALTER TABLE "account_diners" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_account_diners" ON "account_diners";
CREATE POLICY "tenant_isolation_account_diners" ON "account_diners"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 5. Tabla consumption_assignments
CREATE TABLE IF NOT EXISTS "consumption_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "diner_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "share_units" INTEGER NOT NULL,
    "total_item_shares" INTEGER NOT NULL,
    "assigned_amount_cop" INTEGER NOT NULL,

    CONSTRAINT "consumption_assignments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "consumption_assignments" DROP CONSTRAINT IF EXISTS "consumption_assignments_tenant_id_fkey";
ALTER TABLE "consumption_assignments" ADD CONSTRAINT "consumption_assignments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consumption_assignments" DROP CONSTRAINT IF EXISTS "consumption_assignments_account_id_fkey";
ALTER TABLE "consumption_assignments" ADD CONSTRAINT "consumption_assignments_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "dining_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consumption_assignments" DROP CONSTRAINT IF EXISTS "consumption_assignments_diner_id_fkey";
ALTER TABLE "consumption_assignments" ADD CONSTRAINT "consumption_assignments_diner_id_fkey"
    FOREIGN KEY ("diner_id") REFERENCES "account_diners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consumption_assignments" DROP CONSTRAINT IF EXISTS "consumption_assignments_order_item_id_fkey";
ALTER TABLE "consumption_assignments" ADD CONSTRAINT "consumption_assignments_order_item_id_fkey"
    FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consumption_assignments" DROP CONSTRAINT IF EXISTS "uq_consumption_assignments_diner_item";
ALTER TABLE "consumption_assignments" ADD CONSTRAINT "uq_consumption_assignments_diner_item"
    UNIQUE ("diner_id", "order_item_id");

-- Restricciones CHECK para asignaciones de consumo
ALTER TABLE "consumption_assignments" DROP CONSTRAINT IF EXISTS "chk_consumption_assignments_share_units";
ALTER TABLE "consumption_assignments" ADD CONSTRAINT "chk_consumption_assignments_share_units"
    CHECK ("share_units" > 0);

ALTER TABLE "consumption_assignments" DROP CONSTRAINT IF EXISTS "chk_consumption_assignments_total_shares";
ALTER TABLE "consumption_assignments" ADD CONSTRAINT "chk_consumption_assignments_total_shares"
    CHECK ("total_item_shares" >= "share_units");

ALTER TABLE "consumption_assignments" DROP CONSTRAINT IF EXISTS "chk_consumption_assignments_amount";
ALTER TABLE "consumption_assignments" ADD CONSTRAINT "chk_consumption_assignments_amount"
    CHECK ("assigned_amount_cop" >= 0);

-- RLS para consumption_assignments
ALTER TABLE "consumption_assignments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_consumption_assignments" ON "consumption_assignments";
CREATE POLICY "tenant_isolation_consumption_assignments" ON "consumption_assignments"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 6. Llaves foráneas con tablas existentes
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_table_id_fkey";
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_fkey"
    FOREIGN KEY ("table_id") REFERENCES "dining_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_dining_account_id_fkey";
ALTER TABLE "orders" ADD CONSTRAINT "orders_dining_account_id_fkey"
    FOREIGN KEY ("dining_account_id") REFERENCES "dining_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_account_id_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "dining_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_payments_tenant_account"
    ON "payments"("tenant_id", "account_id", "status");

ALTER TABLE "qr_code_links" DROP CONSTRAINT IF EXISTS "qr_code_links_table_id_fkey";
ALTER TABLE "qr_code_links" ADD CONSTRAINT "qr_code_links_table_id_fkey"
    FOREIGN KEY ("table_id") REFERENCES "dining_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
