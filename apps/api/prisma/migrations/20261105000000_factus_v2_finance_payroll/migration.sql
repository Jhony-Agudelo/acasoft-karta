-- Migración Fase 09: Facturación Electrónica DIAN (Factus API v2), Proveedores, Gastos/Cuentas por Pagar, Recepciones RADIAN y Nómina Electrónica
-- Alineado con FASE_08_MODULO_FINANCIERO_NOMINA_Y_FACTUS_V2.md y DEFINICION_TECNICA.md (v2.5.0)

-- 1. Tabla factus_tenant_configs
CREATE TABLE IF NOT EXISTS "factus_tenant_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "environment" VARCHAR(20) NOT NULL DEFAULT 'SANDBOX',
    "api_base_url" VARCHAR(255) NOT NULL DEFAULT 'https://api-sandbox.factus.com.co',
    "encrypted_client_id" TEXT NOT NULL,
    "encrypted_client_secret" TEXT NOT NULL,
    "encrypted_username" TEXT NOT NULL,
    "encrypted_password" TEXT NOT NULL,
    "encrypted_access_token" TEXT,
    "encrypted_refresh_token" TEXT,
    "token_expires_at" TIMESTAMPTZ(6),
    "invoicing_trigger_mode" VARCHAR(24) NOT NULL DEFAULT 'CASHIER_CHOICE',
    "default_municipality_code" VARCHAR(10) NOT NULL DEFAULT '66400',
    "default_tribute_code" VARCHAR(10) NOT NULL DEFAULT '01',
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "factus_tenant_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_factus_tenant_configs_tenant" UNIQUE ("tenant_id")
);

ALTER TABLE "factus_tenant_configs" DROP CONSTRAINT IF EXISTS "factus_tenant_configs_tenant_id_fkey";
ALTER TABLE "factus_tenant_configs" ADD CONSTRAINT "factus_tenant_configs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "factus_tenant_configs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_factus_tenant_configs" ON "factus_tenant_configs";
CREATE POLICY "tenant_isolation_factus_tenant_configs" ON "factus_tenant_configs"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 2. Tabla branch_numbering_ranges
CREATE TABLE IF NOT EXISTS "branch_numbering_ranges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "document_type_code" VARCHAR(4) NOT NULL,
    "factus_range_id" VARCHAR(64) NOT NULL,
    "prefix" VARCHAR(10) NOT NULL,
    "resolution_number" VARCHAR(64),
    "current_consecutive" BIGINT NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_numbering_ranges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_branch_numbering_ranges_doc_type" UNIQUE ("tenant_id", "branch_id", "document_type_code")
);

ALTER TABLE "branch_numbering_ranges" DROP CONSTRAINT IF EXISTS "branch_numbering_ranges_tenant_id_fkey";
ALTER TABLE "branch_numbering_ranges" ADD CONSTRAINT "branch_numbering_ranges_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_numbering_ranges" DROP CONSTRAINT IF EXISTS "branch_numbering_ranges_branch_id_fkey";
ALTER TABLE "branch_numbering_ranges" ADD CONSTRAINT "branch_numbering_ranges_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_numbering_ranges" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_branch_numbering_ranges" ON "branch_numbering_ranges";
CREATE POLICY "tenant_isolation_branch_numbering_ranges" ON "branch_numbering_ranges"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 3. Tabla tax_customer_profiles
CREATE TABLE IF NOT EXISTS "tax_customer_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "identification_document_code" VARCHAR(4) NOT NULL,
    "identification" VARCHAR(32) NOT NULL,
    "dv" VARCHAR(2),
    "legal_organization_code" VARCHAR(2) NOT NULL DEFAULT '2',
    "names" VARCHAR(255),
    "company" VARCHAR(255),
    "trade_name" VARCHAR(255),
    "email" VARCHAR(255),
    "phone" VARCHAR(32),
    "address" VARCHAR(255),
    "municipality_code" VARCHAR(10) NOT NULL DEFAULT '66400',
    "tribute_code" VARCHAR(4) NOT NULL DEFAULT 'ZZ',
    "responsibilities" TEXT[] NOT NULL DEFAULT ARRAY['R-99-PN']::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_customer_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_tax_customer_profiles_id" UNIQUE ("tenant_id", "identification_document_code", "identification")
);

ALTER TABLE "tax_customer_profiles" DROP CONSTRAINT IF EXISTS "tax_customer_profiles_tenant_id_fkey";
ALTER TABLE "tax_customer_profiles" ADD CONSTRAINT "tax_customer_profiles_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tax_customer_profiles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_tax_customer_profiles" ON "tax_customer_profiles";
CREATE POLICY "tenant_isolation_tax_customer_profiles" ON "tax_customer_profiles"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 4. Tabla electronic_fiscal_documents
CREATE TABLE IF NOT EXISTS "electronic_fiscal_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "doc_category" VARCHAR(32) NOT NULL,
    "customer_mode" VARCHAR(32) NOT NULL,
    "reference_code" VARCHAR(64) NOT NULL,
    "order_id" UUID,
    "account_id" UUID,
    "expense_id" UUID,
    "parent_fiscal_doc_id" UUID,
    "factus_number" VARCHAR(64),
    "prefix" VARCHAR(10),
    "cufe_or_cude" VARCHAR(128),
    "qr_url" TEXT,
    "qr_image_base64" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING_VALIDATION',
    "total_cop" INTEGER NOT NULL,
    "cash_rounding_cop_cents" VARCHAR(16) NOT NULL DEFAULT '0.00',
    "customer_or_provider_snapshot_json" JSONB NOT NULL,
    "request_payload_json" JSONB NOT NULL,
    "response_payload_json" JSONB,
    "last_error_message" TEXT,
    "validated_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "electronic_fiscal_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_electronic_fiscal_docs_reference" UNIQUE ("tenant_id", "reference_code")
);

ALTER TABLE "electronic_fiscal_documents" DROP CONSTRAINT IF EXISTS "electronic_fiscal_docs_tenant_id_fkey";
ALTER TABLE "electronic_fiscal_documents" ADD CONSTRAINT "electronic_fiscal_docs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "electronic_fiscal_documents" DROP CONSTRAINT IF EXISTS "electronic_fiscal_docs_branch_id_fkey";
ALTER TABLE "electronic_fiscal_documents" ADD CONSTRAINT "electronic_fiscal_docs_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "electronic_fiscal_documents" DROP CONSTRAINT IF EXISTS "electronic_fiscal_docs_order_id_fkey";
ALTER TABLE "electronic_fiscal_documents" ADD CONSTRAINT "electronic_fiscal_docs_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "electronic_fiscal_documents" DROP CONSTRAINT IF EXISTS "electronic_fiscal_docs_account_id_fkey";
ALTER TABLE "electronic_fiscal_documents" ADD CONSTRAINT "electronic_fiscal_docs_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "dining_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "electronic_fiscal_documents" DROP CONSTRAINT IF EXISTS "electronic_fiscal_docs_parent_fkey";
ALTER TABLE "electronic_fiscal_documents" ADD CONSTRAINT "electronic_fiscal_docs_parent_fkey"
    FOREIGN KEY ("parent_fiscal_doc_id") REFERENCES "electronic_fiscal_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "electronic_fiscal_documents" DROP CONSTRAINT IF EXISTS "electronic_fiscal_docs_created_by_fkey";
ALTER TABLE "electronic_fiscal_documents" ADD CONSTRAINT "electronic_fiscal_docs_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_electronic_fiscal_docs_status" ON "electronic_fiscal_documents" ("tenant_id", "branch_id", "status");

ALTER TABLE "electronic_fiscal_documents" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_electronic_fiscal_documents" ON "electronic_fiscal_documents";
CREATE POLICY "tenant_isolation_electronic_fiscal_documents" ON "electronic_fiscal_documents"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 5. Tabla suppliers
CREATE TABLE IF NOT EXISTS "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "identification_document_code" VARCHAR(4) NOT NULL DEFAULT '31',
    "identification" VARCHAR(32) NOT NULL,
    "dv" VARCHAR(2),
    "legal_organization_code" VARCHAR(2) NOT NULL DEFAULT '1',
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(32),
    "address" VARCHAR(255) NOT NULL,
    "municipality_code" VARCHAR(10) NOT NULL DEFAULT '66400',
    "is_obligated_to_invoice" BOOLEAN NOT NULL DEFAULT FALSE,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_suppliers_tenant_id" UNIQUE ("tenant_id", "identification")
);

ALTER TABLE "suppliers" DROP CONSTRAINT IF EXISTS "suppliers_tenant_id_fkey";
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_suppliers" ON "suppliers";
CREATE POLICY "tenant_isolation_suppliers" ON "suppliers"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 6. Tabla expense_documents
CREATE TABLE IF NOT EXISTS "expense_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "expense_code" VARCHAR(32) NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "payment_form" VARCHAR(4) NOT NULL DEFAULT '1',
    "due_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
    "payment_status" VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
    "requires_support_document" BOOLEAN NOT NULL DEFAULT FALSE,
    "subtotal_cop" INTEGER NOT NULL,
    "discount_total_cop" INTEGER NOT NULL DEFAULT 0,
    "tax_total_cop" INTEGER NOT NULL DEFAULT 0,
    "withholding_tax_total_cop" INTEGER NOT NULL DEFAULT 0,
    "grand_total_cop" INTEGER NOT NULL,
    "paid_total_cop" INTEGER NOT NULL DEFAULT 0,
    "items_json" JSONB NOT NULL,
    "notes" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_documents_paid_check" CHECK ("grand_total_cop" >= "paid_total_cop")
);

ALTER TABLE "expense_documents" DROP CONSTRAINT IF EXISTS "expense_documents_tenant_id_fkey";
ALTER TABLE "expense_documents" ADD CONSTRAINT "expense_documents_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expense_documents" DROP CONSTRAINT IF EXISTS "expense_documents_branch_id_fkey";
ALTER TABLE "expense_documents" ADD CONSTRAINT "expense_documents_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expense_documents" DROP CONSTRAINT IF EXISTS "expense_documents_supplier_id_fkey";
ALTER TABLE "expense_documents" ADD CONSTRAINT "expense_documents_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expense_documents" DROP CONSTRAINT IF EXISTS "expense_documents_created_by_fkey";
ALTER TABLE "expense_documents" ADD CONSTRAINT "expense_documents_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Vincular expense_id en electronic_fiscal_documents ahora que existe expense_documents
ALTER TABLE "electronic_fiscal_documents" DROP CONSTRAINT IF EXISTS "electronic_fiscal_docs_expense_id_fkey";
ALTER TABLE "electronic_fiscal_documents" ADD CONSTRAINT "electronic_fiscal_docs_expense_id_fkey"
    FOREIGN KEY ("expense_id") REFERENCES "expense_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_expense_docs_status" ON "expense_documents" ("tenant_id", "branch_id", "status");

ALTER TABLE "expense_documents" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_expense_documents" ON "expense_documents";
CREATE POLICY "tenant_isolation_expense_documents" ON "expense_documents"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 7. Tabla expense_payments
CREATE TABLE IF NOT EXISTS "expense_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "amount_cop" INTEGER NOT NULL,
    "cash_shift_movement_id" UUID,
    "reference_note" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_payments_amount_check" CHECK ("amount_cop" > 0)
);

ALTER TABLE "expense_payments" DROP CONSTRAINT IF EXISTS "expense_payments_tenant_id_fkey";
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expense_payments" DROP CONSTRAINT IF EXISTS "expense_payments_branch_id_fkey";
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expense_payments" DROP CONSTRAINT IF EXISTS "expense_payments_expense_id_fkey";
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_id_fkey"
    FOREIGN KEY ("expense_id") REFERENCES "expense_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expense_payments" DROP CONSTRAINT IF EXISTS "expense_payments_cash_shift_movement_fkey";
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_cash_shift_movement_fkey"
    FOREIGN KEY ("cash_shift_movement_id") REFERENCES "cash_shift_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expense_payments" DROP CONSTRAINT IF EXISTS "expense_payments_created_by_fkey";
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expense_payments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_expense_payments" ON "expense_payments";
CREATE POLICY "tenant_isolation_expense_payments" ON "expense_payments"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 8. Tabla received_supplier_invoices
CREATE TABLE IF NOT EXISTS "received_supplier_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "factus_reception_id" VARCHAR(64) NOT NULL,
    "track_id_or_cufe" VARCHAR(128) NOT NULL,
    "invoice_number" VARCHAR(64) NOT NULL,
    "supplier_nit" VARCHAR(32) NOT NULL,
    "supplier_name" VARCHAR(255) NOT NULL,
    "issue_date" DATE NOT NULL,
    "total_cop" INTEGER NOT NULL,
    "event_030_emitted_at" TIMESTAMPTZ(6),
    "event_032_emitted_at" TIMESTAMPTZ(6),
    "event_033_or_034_emitted_at" TIMESTAMPTZ(6),
    "completed_events" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "received_supplier_invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_received_supplier_invoices_cufe" UNIQUE ("tenant_id", "track_id_or_cufe")
);

ALTER TABLE "received_supplier_invoices" DROP CONSTRAINT IF EXISTS "received_supplier_invoices_tenant_id_fkey";
ALTER TABLE "received_supplier_invoices" ADD CONSTRAINT "received_supplier_invoices_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "received_supplier_invoices" DROP CONSTRAINT IF EXISTS "received_supplier_invoices_branch_id_fkey";
ALTER TABLE "received_supplier_invoices" ADD CONSTRAINT "received_supplier_invoices_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "received_supplier_invoices" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_received_supplier_invoices" ON "received_supplier_invoices";
CREATE POLICY "tenant_isolation_received_supplier_invoices" ON "received_supplier_invoices"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 9. Tabla employee_profiles (con user_id NULLABLE para personal de aseo/limpieza, logística, etc.)
CREATE TABLE IF NOT EXISTS "employee_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "user_id" UUID,
    "employee_code" VARCHAR(32) NOT NULL,
    "job_title" VARCHAR(100) NOT NULL,
    "department" VARCHAR(100),
    "has_system_access" BOOLEAN NOT NULL DEFAULT FALSE,
    "identification_document_code" VARCHAR(4) NOT NULL DEFAULT '13',
    "identification_number" VARCHAR(32) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "first_surname" VARCHAR(100) NOT NULL,
    "second_surname" VARCHAR(100),
    "address" VARCHAR(255) NOT NULL,
    "municipality_code" VARCHAR(10) NOT NULL DEFAULT '66400',
    "email" VARCHAR(255),
    "phone" VARCHAR(32),
    "worker_type_code" VARCHAR(4) NOT NULL DEFAULT '01',
    "worker_subtype" VARCHAR(4) NOT NULL DEFAULT '00',
    "contract_type" VARCHAR(4) NOT NULL DEFAULT '1',
    "has_integral_salary" BOOLEAN NOT NULL DEFAULT FALSE,
    "has_high_risk" BOOLEAN NOT NULL DEFAULT FALSE,
    "base_salary_cop" INTEGER NOT NULL,
    "receives_transport_allowance" BOOLEAN NOT NULL DEFAULT TRUE,
    "entry_date" DATE NOT NULL,
    "retirement_date" DATE,
    "payment_method_code" VARCHAR(4) NOT NULL DEFAULT '42',
    "bank_name" VARCHAR(100),
    "account_type" VARCHAR(4),
    "account_number" VARCHAR(64),
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_employee_profiles_user" UNIQUE ("user_id"),
    CONSTRAINT "uq_employee_profiles_tenant_ident" UNIQUE ("tenant_id", "identification_number"),
    CONSTRAINT "employee_profiles_salary_check" CHECK ("base_salary_cop" > 0)
);

ALTER TABLE "employee_profiles" DROP CONSTRAINT IF EXISTS "employee_profiles_tenant_id_fkey";
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_profiles" DROP CONSTRAINT IF EXISTS "employee_profiles_branch_id_fkey";
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_profiles" DROP CONSTRAINT IF EXISTS "employee_profiles_user_id_fkey";
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_profiles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_employee_profiles" ON "employee_profiles";
CREATE POLICY "tenant_isolation_employee_profiles" ON "employee_profiles"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


-- 10. Tabla payroll_settlements
CREATE TABLE IF NOT EXISTS "payroll_settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "reference_code" VARCHAR(64) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "payroll_period_code" VARCHAR(4) NOT NULL DEFAULT '5',
    "days_worked" INTEGER NOT NULL,
    "worked_salary_cop" INTEGER NOT NULL,
    "transport_allowance_cop" INTEGER NOT NULL DEFAULT 0,
    "commissions_cop" INTEGER NOT NULL DEFAULT 0,
    "overtime_and_surcharges_json" JSONB NOT NULL DEFAULT '[]'::JSONB,
    "overtime_total_cop" INTEGER NOT NULL DEFAULT 0,
    "health_deduction_cop" INTEGER NOT NULL,
    "pension_deduction_cop" INTEGER NOT NULL,
    "other_deductions_cop" INTEGER NOT NULL DEFAULT 0,
    "gross_accrued_cop" INTEGER NOT NULL,
    "total_deductions_cop" INTEGER NOT NULL,
    "net_payable_cop" INTEGER NOT NULL,
    "payment_date" DATE NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "factus_payroll_number" VARCHAR(64),
    "cune" VARCHAR(128),
    "pdf_url" TEXT,
    "xml_url" TEXT,
    "response_payload_json" JSONB,
    "last_error_message" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_settlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_payroll_settlements_reference" UNIQUE ("tenant_id", "reference_code"),
    CONSTRAINT "payroll_settlements_month_check" CHECK ("month" BETWEEN 1 AND 12),
    CONSTRAINT "payroll_settlements_days_check" CHECK ("days_worked" BETWEEN 1 AND 30)
);

ALTER TABLE "payroll_settlements" DROP CONSTRAINT IF EXISTS "payroll_settlements_tenant_id_fkey";
ALTER TABLE "payroll_settlements" ADD CONSTRAINT "payroll_settlements_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_settlements" DROP CONSTRAINT IF EXISTS "payroll_settlements_branch_id_fkey";
ALTER TABLE "payroll_settlements" ADD CONSTRAINT "payroll_settlements_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_settlements" DROP CONSTRAINT IF EXISTS "payroll_settlements_employee_id_fkey";
ALTER TABLE "payroll_settlements" ADD CONSTRAINT "payroll_settlements_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_settlements" DROP CONSTRAINT IF EXISTS "payroll_settlements_created_by_fkey";
ALTER TABLE "payroll_settlements" ADD CONSTRAINT "payroll_settlements_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_payroll_settlements_status" ON "payroll_settlements" ("tenant_id", "branch_id", "status");

ALTER TABLE "payroll_settlements" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_payroll_settlements" ON "payroll_settlements";
CREATE POLICY "tenant_isolation_payroll_settlements" ON "payroll_settlements"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

