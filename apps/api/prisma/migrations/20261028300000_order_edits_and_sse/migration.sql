-- Migración Fase 03B: Tabla OrderEdit con Auditoría Inmutable y RLS
-- Alineado con DEFINICION_TECNICA.md (v2.4.0 — Sección 9.1.3) y FASE_03B_PANEL_LIVIANO_AJUSTES_Y_TRACKING_SSE.md

CREATE TABLE IF NOT EXISTS "order_edits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "actor_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before_snapshot_json" JSONB NOT NULL,
    "after_snapshot_json" JSONB NOT NULL,
    "reason" TEXT,

    CONSTRAINT "order_edits_pkey" PRIMARY KEY ("id")
);

-- Llaves foráneas con borrado en cascada
ALTER TABLE "order_edits" DROP CONSTRAINT IF EXISTS "order_edits_tenant_id_fkey";
ALTER TABLE "order_edits" ADD CONSTRAINT "order_edits_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_edits" DROP CONSTRAINT IF EXISTS "order_edits_order_id_fkey";
ALTER TABLE "order_edits" ADD CONSTRAINT "order_edits_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Índice compuesto para consulta de historial de cambios
CREATE INDEX IF NOT EXISTS "idx_order_edits_tenant_order"
    ON "order_edits"("tenant_id", "order_id", "occurred_at" DESC);

-- Aislamiento Multi-Tenant estricto mediante Row-Level Security (RLS)
ALTER TABLE "order_edits" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_order_edits" ON "order_edits";
CREATE POLICY "tenant_isolation_order_edits" ON "order_edits"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
