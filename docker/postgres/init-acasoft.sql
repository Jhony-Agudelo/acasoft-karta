DO
$do$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'restaurante_owner') THEN
      CREATE ROLE restaurante_owner WITH LOGIN PASSWORD 'restaurante_owner_pass' CREATEDB;
   END IF;
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'restaurante_app') THEN
      CREATE ROLE restaurante_app WITH LOGIN PASSWORD 'restaurante_pass' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
   END IF;
END
$do$;

GRANT CONNECT ON DATABASE "acasoft-restaurant-saas" TO restaurante_app;
GRANT USAGE ON SCHEMA public TO restaurante_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO restaurante_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO restaurante_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO restaurante_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO restaurante_app;
