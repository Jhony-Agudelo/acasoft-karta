-- Script de inicialización de roles y base de datos para PostgreSQL 16/17
-- Asegura que el usuario de ejecución de la aplicación (restaurante_app / app_runtime)
-- tenga NOBYPASSRLS para que las políticas Row-Level Security (RLS) se apliquen estrictamente.

-- Crear usuario de migraciones (owner) con permisos para DDL si no existe
DO
$do$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'restaurante_owner') THEN
      CREATE ROLE restaurante_owner WITH LOGIN PASSWORD 'restaurante_owner_pass' CREATEDB;
   END IF;
END
$do$;

-- Crear usuario de runtime de la aplicación con NOBYPASSRLS
DO
$do$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'restaurante_app') THEN
      CREATE ROLE restaurante_app WITH LOGIN PASSWORD 'restaurante_pass' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
   END IF;
END
$do$;

-- Otorgar permisos al usuario de aplicación sobre la base de datos y esquema
GRANT CONNECT ON DATABASE restaurante_saas TO restaurante_app;
GRANT USAGE ON SCHEMA public TO restaurante_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO restaurante_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO restaurante_app;

-- Permisos por defecto para futuras tablas creadas por restaurante_owner
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO restaurante_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO restaurante_app;
