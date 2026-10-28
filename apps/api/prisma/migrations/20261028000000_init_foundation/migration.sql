-- Migración Inicial de Fundación, RLS y Restricciones CHECK
-- Alineado con DEFINICION_TECNICA.md (v2.4.0) y FASE_01_FUNDACION_Y_NUCLEO_SAAS.md

-- 1. Tablas Nucleares
CREATE TABLE IF NOT EXISTS "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "plan_id" TEXT NOT NULL DEFAULT 'PLAN_STARTER_WHATSAPP',
    "tax_profile_mode" TEXT NOT NULL DEFAULT 'FINAL_PRICE_NO_BREAKDOWN',
    "default_tax_type" TEXT NOT NULL DEFAULT 'NONE',
    "default_tax_rate_bp" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_key" ON "tenants"("slug");

CREATE TABLE IF NOT EXISTS "brand_settings" (
    "tenant_id" UUID NOT NULL,
    "logo_url" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#E11D48',
    "secondary_color" TEXT NOT NULL DEFAULT '#1E293B',
    "cover_url" TEXT,
    "description" TEXT,
    "public_domain" TEXT,

    CONSTRAINT "brand_settings_pkey" PRIMARY KEY ("tenant_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "brand_settings_public_domain_key" ON "brand_settings"("public_domain");

CREATE TABLE IF NOT EXISTS "branches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "phone_whatsapp_e164" TEXT NOT NULL,
    "operating_hours_json" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "branches_tenant_id_slug_key" ON "branches"("tenant_id", "slug");

CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "invite_or_reset_token_hash" VARCHAR(128),
    "invite_or_reset_expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

CREATE TABLE IF NOT EXISTS "roles" (
    "key" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "permissions" (
    "key" VARCHAR(64) NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "role_permissions" (
    "role_key" VARCHAR(64) NOT NULL,
    "permission_key" VARCHAR(64) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_key","permission_key")
);

CREATE TABLE IF NOT EXISTS "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_key" VARCHAR(64) NOT NULL,
    "branch_scope" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_tenant_id_user_id_role_key_key" ON "memberships"("tenant_id", "user_id", "role_key");

CREATE TABLE IF NOT EXISTS "modules" (
    "key" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "depends_on_all" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "depends_on_any" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "is_core" BOOLEAN NOT NULL DEFAULT false,
    "is_post_mvp" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "plan_entitlements" (
    "plan_id" VARCHAR(64) NOT NULL,
    "module_key" VARCHAR(64) NOT NULL,
    "limits_json" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("plan_id","module_key")
);

CREATE TABLE IF NOT EXISTS "tenant_module_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "module_key" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config_json" JSONB NOT NULL DEFAULT '{}',
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_module_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_module_settings_tenant_id_branch_id_module_key_key" ON "tenant_module_settings"("tenant_id", "branch_id", "module_key");

CREATE TABLE IF NOT EXISTS "operating_profiles" (
    "key" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "module_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "default_pickup_delivery_policy" TEXT NOT NULL DEFAULT 'NONE',
    "default_config_json" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "operating_profiles_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "branch_channel_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "fulfillment_type" VARCHAR(32) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "payment_policy" VARCHAR(32) NOT NULL DEFAULT 'NONE',
    "require_payment_before_preparation" BOOLEAN NOT NULL DEFAULT false,
    "payment_instructions_json" JSONB,
    "active_status_flow" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "tracking_enabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp_number_e164" VARCHAR(32),
    "require_table_pin" BOOLEAN NOT NULL DEFAULT false,
    "unprocessed_expiry_minutes" INTEGER NOT NULL DEFAULT 240,

    CONSTRAINT "branch_channel_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "branch_channel_policies_tenant_id_branch_id_fulfillment_typ_key" ON "branch_channel_policies"("tenant_id", "branch_id", "fulfillment_type");

CREATE TABLE IF NOT EXISTS "audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "actor_id" UUID,
    "action" VARCHAR(128) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" VARCHAR(128) NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_events_tenant_id_occurred_at_idx" ON "audit_events"("tenant_id", "occurred_at" DESC);

-- 2. Claves Foráneas
ALTER TABLE "brand_settings" ADD CONSTRAINT "brand_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_key_fkey" FOREIGN KEY ("role_key") REFERENCES "roles"("key") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_key_fkey" FOREIGN KEY ("role_key") REFERENCES "roles"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_module_key_fkey" FOREIGN KEY ("module_key") REFERENCES "modules"("key") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_module_settings" ADD CONSTRAINT "tenant_module_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_module_settings" ADD CONSTRAINT "tenant_module_settings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_module_settings" ADD CONSTRAINT "tenant_module_settings_module_key_fkey" FOREIGN KEY ("module_key") REFERENCES "modules"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branch_channel_policies" ADD CONSTRAINT "branch_channel_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_channel_policies" ADD CONSTRAINT "branch_channel_policies_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Restricciones CHECK obligatorias (Sección 9.1.1 y 4.8)
ALTER TABLE "branch_channel_policies" ADD CONSTRAINT "chk_channel_dine_in_offline"
    CHECK (fulfillment_type != 'DINE_IN' OR payment_policy = 'OFFLINE_ONLY');

ALTER TABLE "branch_channel_policies" ADD CONSTRAINT "chk_channel_prep_payment"
    CHECK (require_payment_before_preparation = FALSE OR (payment_policy = 'OFFLINE_ONLY' AND fulfillment_type IN ('PICKUP', 'DELIVERY')));

-- 4. Políticas Row-Level Security (RLS) para aislamiento multi-tenant
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "brand_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_module_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branch_channel_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;

-- Política para tenants:
DO $$
BEGIN
    DROP POLICY IF EXISTS "tenant_isolation_policy" ON "tenants";
    CREATE POLICY "tenant_isolation_policy" ON "tenants"
        FOR ALL
        USING (
            current_setting('app.current_tenant_id', true) IS NULL OR
            current_setting('app.current_tenant_id', true) = '' OR
            id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        )
        WITH CHECK (
            current_setting('app.current_tenant_id', true) IS NULL OR
            current_setting('app.current_tenant_id', true) = '' OR
            id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        );
END $$;

-- Macro política para tablas con columna tenant_id:
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY['brand_settings', 'branches', 'memberships', 'tenant_module_settings', 'branch_channel_policies', 'audit_events'];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I', tbl);
        EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I
            FOR ALL
            USING (
                current_setting(''app.current_tenant_id'', true) IS NULL OR
                current_setting(''app.current_tenant_id'', true) = '''' OR
                tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid
            )
            WITH CHECK (
                current_setting(''app.current_tenant_id'', true) IS NULL OR
                current_setting(''app.current_tenant_id'', true) = '''' OR
                tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid
            )', tbl);
    END LOOP;
END $$;
