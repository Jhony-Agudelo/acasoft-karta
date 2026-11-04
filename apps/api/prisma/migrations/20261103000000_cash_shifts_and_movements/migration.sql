-- Migración Fase 07: Gestión de Turnos, Movimientos Menores y Arqueo Ciego de Caja
-- Alineado con DEFINICION_TECNICA.md (v2.5.0 — Secciones 4.8.1 y 9.1.6) y FASE_07_TURNOS_Y_ARQUEO_CIEGO_DE_CAJA.md

-- 1. Tabla cash_shifts
CREATE TABLE IF NOT EXISTS "cash_shifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "shift_code" VARCHAR(32) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "opened_by" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_cash_cop" INTEGER NOT NULL DEFAULT 0,
    "cash_sales_cop" INTEGER NOT NULL DEFAULT 0,
    "cash_in_total_cop" INTEGER NOT NULL DEFAULT 0,
    "cash_out_total_cop" INTEGER NOT NULL DEFAULT 0,
    "expected_cash_cop" INTEGER,
    "declared_cash_cop" INTEGER,
    "difference_cop" INTEGER,
    "denominations_snapshot_json" JSONB,
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "closing_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_shifts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cash_shifts_opening_cash_check" CHECK ("opening_cash_cop" >= 0),
    CONSTRAINT "cash_shifts_declared_cash_check" CHECK ("declared_cash_cop" IS NULL OR "declared_cash_cop" >= 0)
);

ALTER TABLE "cash_shifts" DROP CONSTRAINT IF EXISTS "cash_shifts_tenant_id_fkey";
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cash_shifts" DROP CONSTRAINT IF EXISTS "cash_shifts_branch_id_fkey";
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cash_shifts" DROP CONSTRAINT IF EXISTS "cash_shifts_opened_by_fkey";
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_opened_by_fkey"
    FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_shifts" DROP CONSTRAINT IF EXISTS "cash_shifts_closed_by_fkey";
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_closed_by_fkey"
    FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índices para cash_shifts
CREATE INDEX IF NOT EXISTS "idx_cash_shifts_branch_status" ON "cash_shifts" ("tenant_id", "branch_id", "status");

-- Restricción Parcial Única: Solo puede existir UN turno en estado OPEN por sucursal
CREATE UNIQUE INDEX IF NOT EXISTS "idx_unique_open_shift_per_branch"
ON "cash_shifts" ("tenant_id", "branch_id")
WHERE "status" = 'OPEN';

-- RLS para cash_shifts
ALTER TABLE "cash_shifts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_cash_shifts" ON "cash_shifts";
CREATE POLICY "tenant_isolation_cash_shifts" ON "cash_shifts"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 2. Tabla cash_shift_movements
CREATE TABLE IF NOT EXISTS "cash_shift_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "amount_cop" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference_doc" VARCHAR(120),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_shift_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cash_shift_movements_amount_check" CHECK ("amount_cop" > 0)
);

ALTER TABLE "cash_shift_movements" DROP CONSTRAINT IF EXISTS "cash_shift_movements_tenant_id_fkey";
ALTER TABLE "cash_shift_movements" ADD CONSTRAINT "cash_shift_movements_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cash_shift_movements" DROP CONSTRAINT IF EXISTS "cash_shift_movements_branch_id_fkey";
ALTER TABLE "cash_shift_movements" ADD CONSTRAINT "cash_shift_movements_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cash_shift_movements" DROP CONSTRAINT IF EXISTS "cash_shift_movements_shift_id_fkey";
ALTER TABLE "cash_shift_movements" ADD CONSTRAINT "cash_shift_movements_shift_id_fkey"
    FOREIGN KEY ("shift_id") REFERENCES "cash_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cash_shift_movements" DROP CONSTRAINT IF EXISTS "cash_shift_movements_created_by_fkey";
ALTER TABLE "cash_shift_movements" ADD CONSTRAINT "cash_shift_movements_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índices para cash_shift_movements
CREATE INDEX IF NOT EXISTS "idx_cash_shift_movements_shift" ON "cash_shift_movements" ("tenant_id", "shift_id");

-- RLS para cash_shift_movements
ALTER TABLE "cash_shift_movements" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_cash_shift_movements" ON "cash_shift_movements";
CREATE POLICY "tenant_isolation_cash_shift_movements" ON "cash_shift_movements"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 3. Modificación en payments para asociar cobros CASH al turno de caja
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "cash_shift_id" UUID;

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_cash_shift_id_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_shift_id_fkey"
    FOREIGN KEY ("cash_shift_id") REFERENCES "cash_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_payments_tenant_cash_shift" ON "payments" ("tenant_id", "cash_shift_id");

