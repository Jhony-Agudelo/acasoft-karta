# Fase 01: Fundación del Monorepo, Seguridad Multi-Tenant y Motor de Capacidades
**Documento:** `FASE_01_FUNDACION_Y_NUCLEO_SAAS.md`  
**Versión:** 2.4.0 — Alineado con `DEFINICION_TECNICA.md` (v2.4.0) y `STACK_VERSIONS.md` (v2.4.0)  
**Fecha:** 2026-10-26  
**Objetivo de la Fase:** Construir los cimientos productivos del SaaS: estructura del Monorepo (`Turborepo`), utilidades y contratos compartidos (`packages/shared`), base de datos PostgreSQL 16 con aislamiento *Row-Level Security (RLS)* transaccional y restricciones `CHECK`, autenticación y gestión de personal resiliente sin depender de correo comercial (`identity-access`), gestión de organizaciones, sucursales y políticas de canal (`tenancy`), motor de capacidades modulares con evaluación atómica en lote (`capabilities`), auditoría sin PII (`audit`), observabilidad (`Pino` + `/api/v1/health`) y las vistas en React para autenticación, onboarding guiado y administración de módulos.

---

## 1. Reglas de Ingeniería Obligatorias para la IA (Directivas para Gemini)

Cuando proceses este documento junto con `DEFINICION_TECNICA.md` (v2.4.0) y `STACK_VERSIONS.md` (v2.4.0) para generar código, debes cumplir sin excepción las siguientes reglas:

1. **Política de Cero Código Incompleto (`Zero-Placeholder Policy`):**
   - Está estrictamente prohibido entregar bloques con comentarios como `// TODO: implementar lógica`, `// ... resto del código`, `/* agregar campos aquí */` o funciones vacías.
   - Cada archivo generado debe ser **100 % funcional, compilable y completo**, con todas sus importaciones, tipos, validaciones y manejo de errores.
2. **Apego Estricto a `STACK_VERSIONS.md` y Entrega Modular con Puertas Manuales:**
   - Usa únicamente las versiones y librerías fijadas en `STACK_VERSIONS.md` (sintaxis `"tasks"` en `turbo.json` v2, Node 22 LTS, NestJS 10, Prisma 5, React 18, Vite 5, TanStack Query 5, Zod 3.23).
   - Genera únicamente los archivos correspondientes al sub-paso solicitado (Sección 5) para no truncar código, y espera el resultado de la **Puerta de Validación Manual** ejecutada por el desarrollador (`pnpm install`, `pnpm turbo run typecheck`, `pnpm turbo run test`) antes de pasar al siguiente paso.
3. **Arquitectura Limpia y Modular en NestJS (`apps/api`):**
   - Cada módulo de dominio (`identity-access`, `tenancy`, `capabilities`, `audit`) encapsula sus propios Controladores, Servicios de Dominio, consultas Prisma y DTOs.
   - Ningún módulo externo modifica directamente tablas de otro módulo sin pasar por el servicio público exportado de dicho módulo.
   - La lógica de negocio (evaluación atómica en lote del grafo de módulos, reglas de bloqueo, aplicación de perfiles sobre `BranchChannelPolicy` y resolución jerárquica `Sucursal → Organización → Plan`) vive en servicios de dominio puros y testeables, nunca dentro de los controladores HTTP.
4. **Tipado Estricto y Fuente Única de Verdad (`packages/shared`):**
   - Todo contrato DTO, constante de módulo, enumeración y esquema `Zod` se define en `packages/shared` y es importado tanto por `apps/api` como por `apps/web`.
   - Prohibido el uso de `any` (`noImplicitAny: true`, `strictNullChecks: true`).
5. **Seguridad Multi-Tenant por Diseño (Defensa en Profundidad con RLS Real):**
   - **Regla de Oro:** El backend jamás confía en un `tenant_id` enviado en el `body` o *query string*. El `TenantContextGuard` lo resuelve exclusivamente a partir de la membresía verificada del usuario en el JWT (o del `slug` público en rutas de comensal).
   - Toda operación de base de datos de un tenant se ejecuta mediante `PrismaService.withTenant(tenantId, async (tx) => ...)`, que abre una transacción interactiva e invoca `SELECT set_config('app.current_tenant_id', ${tenantId}, true)`.
   - El contenedor PostgreSQL de desarrollo y pruebas configura un rol de aplicación `app_runtime` con `NOBYPASSRLS` para que las políticas RLS se evalúen de forma efectiva en todos los tests.
6. **Aritmética Monetaria Entera y Exclusión de PII en Auditoría:**
   - Todos los montos en pesos colombianos (`COP`) se procesan y almacenan como enteros (`INTEGER`). Prohibido usar punto flotante para dinero.
   - Ni los logs de `Pino` ni `AuditEvent.metadata_json` almacenan contraseñas, tokens ni datos personales crudos de comensales.

---

## 2. Alcance Exacto de la Fase 01

Al finalizar esta fase, el sistema debe ejecutar de extremo a extremo los siguientes componentes:

### 2.1 Infraestructura del Monorepo y Paquete Compartido (`packages/shared`)
- Configuración raíz de `package.json`, `pnpm-workspace.yaml`, `turbo.json` (con clave `"tasks"`), `tsconfig.base.json`, `.env.example` y `docker-compose.yml` (PostgreSQL 16 con script de inicialización que crea el usuario `app_runtime` con `NOBYPASSRLS`).
- **`packages/shared/src/constants/modules.catalog.ts`:**
  - Definición tipada de los **16 módulos del catálogo** (los **13 módulos del MVP** con `is_post_mvp: false` y los **3 módulos reservados Post-MVP** `payments.online`, `payments.links`, `notifications.whatsapp_api` con `is_post_mvp: true`), los módulos de núcleo obligatorio (`is_core: true`) y el grafo dual de dependencias con `depends_on_all: ModuleKey[]` y `depends_on_any: ModuleKey[]` (incluyendo `dining` $\rightarrow$ `depends_on_all: ['payments.manual']` y `payments.manual` $\rightarrow$ `depends_on_any: ['order_panel', 'dining']`).
  - Definición de los **5 perfiles de operación del MVP** (`MENU_ONLY`, `WHATSAPP_SIMPLE`, `FULL_PANEL`, `DINING_ROOM`, `ENTERPRISE_MULTI`) con su propiedad `default_pickup_delivery_policy` (`NONE` | `OFFLINE_ONLY`).
  - Función pura `validateModuleSetAtomically(targetEnabledKeys: ReadonlySet<string>)` que evalúa el conjunto resultante $S_{\text{final}}$ en una sola operación en lote.
- **`packages/shared/src/utils/money-cop.ts`:** Funciones puras de cálculo en pesos enteros (`COP`), extracción de impuesto incluido ($\text{Base} = \text{Math.round}(\text{Total} / (1 + r))$, $\text{Impuesto} = \text{Total} - \text{Base}$), cálculo de impuesto adicionado y formateador de moneda colombiana (`$ 20.000`).
- **`packages/shared/src/utils/whatsapp-templates.ts`:** Normalizador y validador de números telefónicos a formato internacional `E.164` (por defecto `+57` para móviles de 10 dígitos en Colombia) y constructor de enlaces seguros `https://wa.me/` (incluyendo plantilla de invitación/recuperación de acceso para miembros del equipo).
- **`packages/shared/src/schemas/foundation.schema.ts`:** Esquemas `Zod` para registro de organización, login, cambio de contraseña, creación/invitación de usuarios del personal, sucursales, horarios (`operating_hours_json`), políticas de canal (`BranchChannelPolicy`, validando la acotación de `require_payment_before_preparation` y `payment_instructions_json`) y actualización en lote de módulos.

### 2.2 Base de Datos (`PostgreSQL 16` + `Prisma`) y Políticas RLS + `CHECK`
Implementación en `apps/api/prisma/schema.prisma` y migración SQL inicial de las tablas fundacionales (Sección 9.1.1 de `DEFINICION_TECNICA.md` v2.4.0):
1. `Tenant`: `id (UUID PK)`, `name`, `slug (UNIQUE)`, `status`, `plan_id`, `tax_profile_mode` (por defecto `'FINAL_PRICE_NO_BREAKDOWN'`), `default_tax_type` (`'NONE'`), `default_tax_rate_bp` (`0`), `created_at`.
2. `Branch`: `id (UUID PK)`, `tenant_id (FK)`, `name`, `slug`, `address`, `timezone` (por defecto `'America/Bogota'`), `phone_whatsapp_e164`, `operating_hours_json (JSONB)`, `status`, `created_at`, `UNIQUE(tenant_id, slug)`.
3. `BrandSettings`: `tenant_id (UUID PK/FK)`, `logo_url`, `primary_color`, `secondary_color`, `cover_url`, `description`, `public_domain (UNIQUE NULL)`.
4. `User`: `id (UUID PK)`, `email (UNIQUE)`, `password_hash`, `phone`, `name`, `status` (`ACTIVE` | `INVITED` | `SUSPENDED`), `mfa_enabled (BOOLEAN DEFAULT FALSE)`, `must_change_password (BOOLEAN DEFAULT FALSE)`, `invite_or_reset_token_hash (VARCHAR NULL)`, `invite_or_reset_expires_at (TIMESTAMPTZ NULL)`, `created_at`.
5. `Role` (`key VARCHAR PK`, `name`), `Permission` (`key VARCHAR PK`, `description`), `RolePermission` (`role_key`, `permission_key`) y `Membership` (`id`, `tenant_id`, `user_id`, `role_key`, `branch_scope UUID[] NULL`, `is_active`).
6. `Module` (`key VARCHAR PK`, `name`, `depends_on_all TEXT[]`, `depends_on_any TEXT[]`, `is_core BOOLEAN`, `is_post_mvp BOOLEAN DEFAULT FALSE`), `PlanEntitlement` (`plan_id`, `module_key`, `limits_json`), `TenantModuleSetting` (`id`, `tenant_id`, `branch_id NULL`, `module_key`, `enabled`, `config_json`, `updated_by`, `updated_at`) y `OperatingProfile` (`key VARCHAR PK`, `name`, `module_keys TEXT[]`, `default_pickup_delivery_policy VARCHAR`, `default_config_json`).
7. `BranchChannelPolicy`:
   - `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `fulfillment_type` (`PICKUP` | `DELIVERY` | `DINE_IN`), `enabled (BOOLEAN)`, `payment_policy` (`NONE` | `OFFLINE_ONLY`), `require_payment_before_preparation (BOOLEAN DEFAULT FALSE)`, `payment_instructions_json (JSONB NULL)`, `active_status_flow (TEXT[])`, `tracking_enabled (BOOLEAN)`, `whatsapp_number_e164`, `require_table_pin (BOOLEAN DEFAULT FALSE)`, `unprocessed_expiry_minutes (INT DEFAULT 240)`, `UNIQUE(tenant_id, branch_id, fulfillment_type)`.
   - **Restricciones `CHECK` obligatorias en la migración SQL:**
     - `CHECK (fulfillment_type != 'DINE_IN' OR payment_policy = 'OFFLINE_ONLY')`
     - `CHECK (require_payment_before_preparation = FALSE OR (payment_policy = 'OFFLINE_ONLY' AND fulfillment_type IN ('PICKUP', 'DELIVERY')))`
8. `AuditEvent`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK NULL)`, `actor_id (FK NULL)`, `action`, `entity_type`, `entity_id`, `occurred_at`, `metadata_json (JSONB)`.
9. **Script de Seed (`prisma/seed.ts`):** Poblado idempotente de los 9 roles (Sección 3), catálogo de permisos, los 16 módulos (13 MVP + 3 Post-MVP), los 5 perfiles operativos del MVP y los 3 planes comerciales (`PLAN_STARTER_WHATSAPP`, `PLAN_OPERATIONS_PRO`, `PLAN_ENTERPRISE_DINING`).

### 2.3 Backend en NestJS (`apps/api`)
1. **Capa Transversal, Observabilidad y Salud (`src/common/` y `src/database/`):**
   - `PinoLogger` configurado con redacción automática de `req.headers.authorization`, `req.headers.cookie`, `password`, `temp_password` y `token`, inyectando `requestId`, `tenantId`, `branchId` y `actorId`.
   - `GET /api/v1/health`: Verifica conectividad activa a PostgreSQL (`SELECT 1`).
   - `PrismaService.withTenant(tenantId, fn)`: Ejecuta las consultas dentro de una transacción interactiva fijando `SELECT set_config('app.current_tenant_id', ${tenantId}, true)`.
   - `JwtAuthGuard`, `TenantContextGuard`, `ModuleCapabilityGuard` (`@RequireModule(...)` que aborta con HTTP `403` y `{ errorCode: 'MODULE_DISABLED', moduleKey }`), `PermissionsGuard` (`@RequirePermissions(...)` que valida rol y `branch_scope`) y `UnifiedExceptionFilter`.
2. **Módulo `identity-access` (Independiente de `notifications.email`):**
   - `POST /api/v1/auth/register`: Alta transaccional de `Tenant` (en plan `PLAN_STARTER_WHATSAPP` o el seleccionado), `BrandSettings`, `Branch` principal, aplicación del perfil inicial (`WHATSAPP_SIMPLE` por defecto) y usuario `TENANT_ADMIN`.
   - `POST /api/v1/auth/session`, `POST /api/v1/auth/refresh` (cookie `HttpOnly`) y `DELETE /api/v1/auth/session`.
   - `POST /api/v1/auth/change-password`: Permite cambiar la contraseña actual y desbloquea usuarios con `must_change_password = true` (mientras `must_change_password` sea `true`, cualquier otro endpoint operativo rechaza con `403 PASSWORD_CHANGE_REQUIRED`).
   - `GET / POST / PATCH /api/v1/admin/users` y `POST /api/v1/admin/users/:userId/reset-password`: Permite al administrador o gerente dar de alta o restablecer el acceso de un miembro del equipo mediante **contraseña temporal de un solo uso** (`must_change_password = true`) o mediante un **token de invitación/reset de 24 horas** devolviendo el enlace listo para copiar o abrir en WhatsApp (`whatsapp_invite_url`).
   - `POST /api/v1/auth/accept-invite`, `POST /api/v1/auth/forgot-password` (transporte de correo de sistema del núcleo para propietarios `TENANT_ADMIN`) y `POST /api/v1/auth/reset-password`.
3. **Módulo `tenancy`:**
   - `GET / PATCH /api/v1/admin/brand` (configuración de logo, colores y descripción).
   - `GET / POST / PATCH /api/v1/admin/branches` (sucursales, horarios y WhatsApp `E.164`).
   - `GET / PATCH /api/v1/admin/branches/:branchId/channel-policies`: Configura `payment_policy`, `payment_instructions_json` (datos de Nequi, DaviPlata, Bre-B) y `require_payment_before_preparation`. Valida que `DINE_IN` sea siempre `OFFLINE_ONLY`, que `require_payment_before_preparation` solo sea `true` con `OFFLINE_ONLY` en `PICKUP`/`DELIVERY`, y que al bajar un canal de `OFFLINE_ONLY` a `NONE` la bandera `require_payment_before_preparation` pase automáticamente a `false`.
4. **Módulo `capabilities`:**
   - Resolución jerárquica: `isEnabled = PlanEntitlement(plan_id, moduleKey) && !Module.is_post_mvp && (BranchSetting ?? TenantSetting ?? CoreModule)`.
   - Validación atómica en lote del conjunto resultante $S_{\text{final}}$ para `depends_on_all` y `depends_on_any` (permitiendo activar o desactivar `dining` y `payments.manual` en una misma petición).
   - Servicio extensible `OpenOperationsChecker`: prepara y ejecuta la validación que bloquea con `409 MODULE_HAS_OPEN_OPERATIONS` la desactivación de módulos con operaciones en curso.
   - Aplicación de perfiles operativos (`POST /api/v1/admin/operating-profiles/:key/apply`): activa los módulos del perfil, asigna `default_pickup_delivery_policy` únicamente a las filas `PICKUP` y `DELIVERY` de `BranchChannelPolicy` (apagando `require_payment_before_preparation` si pasa a `NONE`), y mantiene la fila `DINE_IN` siempre en `payment_policy = 'OFFLINE_ONLY'` con `enabled = (dining in profile)`.
   - Endpoints: `GET /api/v1/branches/:branchId/capabilities`, `GET / PATCH /api/v1/admin/modules`, `GET / PATCH /api/v1/admin/branches/:branchId/modules` y `GET /api/v1/admin/operating-profiles`.
5. **Módulo `audit`:**
   - `AuditService.record(...)` y `GET /api/v1/admin/audit-events` paginado, auditando cambios de módulos, aplicación de perfiles, cambios de políticas de canal y gestión de usuarios sin almacenar secretos ni PII de comensales.

### 2.4 Frontend en React (`apps/web`)
1. **Arquitectura Base del Cliente:**
   - `services/api-client.ts` con refresco automático de JWT y redirección a `/auth/change-password` cuando el backend responde `PASSWORD_CHANGE_REQUIRED`.
   - Hook `useBranchCapabilities(branchId)` y componentes `<CapabilityRoute requiredModule="..." />` y `<CapabilityGate module="..." />`.
2. **Pantallas Funcionales de Fase 01:**
   - **Autenticación Completa (`/auth/login`, `/auth/register`, `/auth/change-password`, `/auth/accept-invite`, `/auth/forgot-password`):** Incluye flujo de primer ingreso con clave temporal o enlace de invitación recibido por WhatsApp.
   - **Asistente de Onboarding Guiado (`/onboarding`):** 3 pasos simples: (1) Nombre del restaurante, WhatsApp y horario; (2) Selector de Perfil Operativo en escalera de adopción; (3) Confirmación de sucursal lista.
   - **Layout Dinámico del Restaurante:** Navegación lateral que renderiza únicamente los módulos activos de la sucursal seleccionada.
   - **Gestor de Capacidades y Perfiles (`/admin/capabilities`):** Permite aplicar perfiles en un toque o activar/desactivar múltiples módulos en lote con pre-validación del grafo en el cliente.
   - **Configuración de Marca, Sucursales, Instrucciones de Pago y Equipo (`/admin/settings`):** Editor de marca con vista previa de variables CSS, sucursales, políticas de canal e instrucciones de transferencia (`Nequi / DaviPlata / Bre-B`), y gestión de usuarios con generación de clave temporal o botón de enviar invitación por WhatsApp (`wa.me`).

---

## 3. Reglas de Lógica de Dominio y Seguridad Específicas de Fase 01

### 3.1 Algoritmo de Evaluación Atómica del Grafo (`validateModuleSetAtomically`)
Dado el conjunto propuesto de claves de módulos activos $S_{\text{final}}$ para una organización o sucursal con plan comercial $P$:
1. Verificar que ningún $M \in S_{\text{final}}$ tenga `is_post_mvp === true` (si lo tiene, lanzar `400 MODULE_RESERVED_POST_MVP`).
2. Verificar que todo $M \in S_{\text{final}}$ esté incluido en `PlanEntitlement(P)` (si no lo está, lanzar `403 PLAN_UPGRADE_REQUIRED`).
3. Para cada módulo $M \in S_{\text{final}}$:
   - **Dependencias conjuntivas (`ALL`):** Para todo $D \in M.\text{depends\_on\_all}$, debe cumplirse $D \in S_{\text{final}}$. Si falta alguno, lanzar `400 MISSING_MODULE_DEPENDENCY` indicando $\{M, D\}$.
   - **Dependencias disyuntivas (`ANY`):** Si $M.\text{depends\_on\_any}$ no es vacío, debe existir al menos un $D \in M.\text{depends\_on\_any}$ tal que $D \in S_{\text{final}}$. Si la intersección es vacía, lanzar `400 MISSING_ANY_MODULE_DEPENDENCY` indicando $\{M, M.\text{depends\_on\_any}\}$.
4. Para cada módulo $M_{\text{off}}$ que estaba activo en $S_{\text{actual}}$ y pasa a inactivo ($M_{\text{off}} \notin S_{\text{final}}$), ejecutar `OpenOperationsChecker.assertNoOpenOperations(tenantId, branchId, M_off)`.

---

## 4. Matriz de Casos de Prueba Obligatorios (Fase 01)

El desarrollo de la Fase 01 solo se considera terminado cuando todas las siguientes pruebas automatizadas pasan en verde (`Vitest` + `Supertest`):

### 4.1 Pruebas Unitarias (`packages/shared`)
- **`TC-01-U01` (Aritmética COP e Impuestos Incluidos):** Dado un producto con precio final `$10.000 COP`, cantidad `2` e INC del `8 %` (`800 bp`) en modo `TAX_INCLUDED_DISCRIMINATED`, `money-cop` debe retornar `lineTotal = 20000`, `taxableBase = 18519` y `taxAmount = 1481` ($18519 + 1481 = 20000$), sin sumar el impuesto dos veces.
- **`TC-01-U02` (Normalización E.164 Colombia):** Dado `"300 123 4567"` o `"3001234567"`, el normalizador debe producir `"+573001234567"`. Dado `"12345"`, debe rechazarlo con error `Zod`.
- **`TC-01-U03` (Evaluación Atómica del Grafo `depends_on_all` y `depends_on_any`):**
  - Activar `dining` y `payments.manual` juntos en la misma operación en lote debe ser **válido** ($S_{\text{final}} = \{\text{'dining'}, \text{'payments.manual'}\}$ satisface `dining` $\rightarrow$ `payments.manual` y `payments.manual` $\rightarrow$ `['order_panel', 'dining']`).
  - Activar `dining` solo (con `payments.manual` apagado) debe fallar con `MISSING_MODULE_DEPENDENCY`.
  - Activar `payments.manual` cuando tanto `order_panel` como `dining` están apagados debe fallar con `MISSING_ANY_MODULE_DEPENDENCY`.
  - Intentar activar `payments.online` (`is_post_mvp: true`) debe fallar con `MODULE_RESERVED_POST_MVP`.
- **`TC-01-U04` (Validación de `require_payment_before_preparation` en Esquema de Canal):**
  - Configurar `require_payment_before_preparation: true` con `payment_policy: 'NONE'` o con `fulfillment_type: 'DINE_IN'` debe ser rechazado por el esquema `Zod`.
  - Configurar `require_payment_before_preparation: true` con `payment_policy: 'OFFLINE_ONLY'` y `fulfillment_type: 'DELIVERY'` debe ser aceptado.
- **`TC-01-U05` (Verificación de los 5 Perfiles Operativos del MVP):** Todos los 5 perfiles (`MENU_ONLY`, `WHATSAPP_SIMPLE`, `FULL_PANEL`, `DINING_ROOM`, `ENTERPRISE_MULTI`) deben pasar `validateModuleSetAtomically` sin errores.

### 4.2 Pruebas de Integración, Concurrencia RLS y Seguridad Multi-Tenant (`apps/api/test/`)
- **`TC-01-I01` (Onboarding de Perfil `WHATSAPP_SIMPLE` y Compatibilidad con `CHECK` de `DINE_IN`):**
  - Al registrar un restaurante y aplicar el perfil `WHATSAPP_SIMPLE` (o `MENU_ONLY`), el endpoint `GET /api/v1/branches/:branchId/capabilities` devuelve activos `ordering`, `channel.pickup`, `channel.delivery`, `notifications.whatsapp_click`, `order_panel` y `tracking`, mientras que `dining` y `payments.manual` están en `false`.
  - En `branch_channel_policies`, las filas `PICKUP` y `DELIVERY` quedan con `payment_policy = 'NONE'`, mientras que la fila `DINE_IN` queda con `payment_policy = 'OFFLINE_ONLY'` y `enabled = false`, cumpliendo el `CHECK` de PostgreSQL sin errores.
- **`TC-01-I02` (Reinicio Automático de `require_payment_before_preparation` al Bajar a `NONE`):**
  - En una sucursal en perfil `FULL_PANEL` (`OFFLINE_ONLY`) con `require_payment_before_preparation = true` en `DELIVERY`, al cambiar la política de `DELIVERY` a `NONE` (o al aplicar el perfil `WHATSAPP_SIMPLE`), el backend debe fijar automáticamente `require_payment_before_preparation = false` en `DELIVERY`.
- **`TC-01-I03` (Sobrescritura por Sucursal y Activación Atómica en Lote):**
  - En un restaurante con plan `PLAN_ENTERPRISE_DINING`, enviar `PATCH /api/v1/admin/branches/:branchId/modules` activando en un solo lote `dining` y `payments.manual` tiene éxito, y permite que la *Sucursal 1* opere con salón mientras la *Sucursal 2* (cocina oculta) mantiene `dining = false`.
- **`TC-01-I04` (Bloqueo Real en Backend por `ModuleCapabilityGuard` y `PlanEntitlement`):**
  - Cuando una sucursal tiene `dining: false`, cualquier llamada a un endpoint decorado con `@RequireModule('dining')` responde HTTP `403 Forbidden` con `{ errorCode: 'MODULE_DISABLED', moduleKey: 'dining' }`.
  - Si el restaurante está en `PLAN_STARTER_WHATSAPP`, intentar activar `dining` por API responde `403 PLAN_UPGRADE_REQUIRED`.
- **`TC-01-I05` (Ciclo de Usuario con Clave Temporal e Invitación por WhatsApp sin Email):**
  - Con `notifications.email = false`, el `TENANT_ADMIN` crea un usuario `WAITER` con contraseña temporal (`must_change_password = true`) y otro usuario `CASHIER` mediante enlace de invitación (`whatsapp_invite_url`).
  - El `WAITER` inicia sesión, recibe bloqueo `403 PASSWORD_CHANGE_REQUIRED` si intenta operar sin cambiar su clave, ejecuta `POST /api/v1/auth/change-password` y a partir de ese momento opera normalmente.
  - El `CASHIER` activa su cuenta mediante `POST /api/v1/auth/accept-invite` usando el token del enlace sin que haya intervenido ningún servidor de correo.
- **`TC-01-I06` (Aislamiento Estricto entre Tenants e Inyección de `tenant_id`):**
  - Se crean el *Restaurante A* y el *Restaurante B*. Un usuario autenticado con el JWT del *Restaurante A* intenta leer o modificar sucursales, políticas de canal, usuarios o módulos del *Restaurante B* (incluso enviando `tenant_id: <id_B>` en el body).
  - El backend ignora el `tenant_id` del body, aplica `withTenant(tenantA)` y responde `404 Not Found` o `403 Forbidden` sin filtrar información.
- **`TC-01-I07` (Prueba de Estrés y Concurrencia RLS en el Pool de Conexiones — `rls-concurrency.e2e-spec.ts`):**
  - Se disparan en paralelo (`Promise.all`) 30 peticiones concurrentes mezclando consultas autenticadas del *Restaurante A* y del *Restaurante B* sobre `PrismaService.withTenant`.
  - Se verifica que el 100 % de las respuestas del *Restaurante A* contienen exclusivamente filas de `A` y el 100 % de las respuestas del *Restaurante B* contienen exclusivamente filas de `B`, demostrando que `SELECT set_config('app.current_tenant_id', ..., true)` dentro de la transacción interactiva jamás contamina conexiones vecinas del pool.
- **`TC-01-I08` (Alcance de Sucursal por Rol — `branch_scope`):**
  - Un `BRANCH_MANAGER` cuyo `branch_scope` solo incluye la *Sucursal 1* recibe `403 Forbidden` al intentar modificar horarios o políticas de canal de la *Sucursal 2* del mismo restaurante.
- **`TC-01-I09` (Trazabilidad en `AuditEvent` y Sonda `/api/v1/health`):**
  - Cambiar módulos o políticas de canal inserta el evento en `audit_events` con `actor_id`, `tenant_id`, `branch_id` y el antes/después en `metadata_json`, y `GET /api/v1/health` responde `200 OK`.

---

## 5. Secuencia de Prompts Acotados para Ejecutar la Fase 01 con Gemini

Para garantizar que Gemini genere el 100 % del código completo sin truncar archivos, adjunta siempre `DEFINICION_TECNICA.md` (v2.4.0), `STACK_VERSIONS.md` (v2.4.0) y este archivo `FASE_01_FUNDACION_Y_NUCLEO_SAAS.md`, y solicita los siguientes **6 pasos uno por uno**, ejecutando la puerta de validación manual al terminar cada paso:

### Paso 1.1: Configuración Raíz del Monorepo y Paquete Compartido (`packages/shared`)
> **Prompt 1.1:** *"Con base en `DEFINICION_TECNICA.md` (v2.4.0), `STACK_VERSIONS.md` (v2.4.0) y `FASE_01_FUNDACION_Y_NUCLEO_SAAS.md`, genera los archivos de configuración raíz del Monorepo (`package.json`, `pnpm-workspace.yaml`, `turbo.json` usando `'tasks'`, `tsconfig.base.json`, `.env.example`, `docker-compose.yml` con inicialización del rol `app_runtime` `NOBYPASSRLS`) y el paquete completo `packages/shared` (`package.json`, `tsconfig.json`, `modules.catalog.ts` con los 16 módulos, `depends_on_all`/`depends_on_any`, los 5 perfiles con `default_pickup_delivery_policy` y `validateModuleSetAtomically`, `money-cop.ts`, `whatsapp-templates.ts`, `foundation.schema.ts` y los tests unitarios `TC-01-U01` a `TC-01-U05`). Entrega todos los archivos 100 % completos y sin TODOs."*
- **Puerta Manual 1.1:** Ejecutar `pnpm install && pnpm --filter @restaurante-saas/shared typecheck && pnpm --filter @restaurante-saas/shared test`.

### Paso 1.2: Esquema Prisma, Migración SQL con RLS + `CHECK`, Seed y Capa Común de NestJS
> **Prompt 1.2:** *"Genera para `apps/api` el `package.json`, `tsconfig.json`, `nest-cli.json`, `prisma/schema.prisma` completo de la Fase 01, la migración SQL inicial que crea las tablas, las restricciones `CHECK` de `branch_channel_policies` y las políticas Row-Level Security (RLS) para el rol `app_runtime`, el `prisma/seed.ts` idempotente, el `PrismaService` con `withTenant()` usando `set_config(..., true)`, el endpoint `/api/v1/health`, la configuración de `PinoLogger` con redacción de secretos y toda la carpeta `src/common/` (Decorators, `JwtAuthGuard`, `TenantContextGuard`, `ModuleCapabilityGuard`, `PermissionsGuard` y `UnifiedExceptionFilter`)."*
- **Puerta Manual 1.2:** Levantar `docker compose up -d`, ejecutar `pnpm --filter @restaurante-saas/api prisma migrate deploy && pnpm --filter @restaurante-saas/api prisma db seed && pnpm --filter @restaurante-saas/api typecheck`.

### Paso 1.3: Módulos Backend `audit` e `identity-access` (Auth, Claves Temporales e Invitaciones WhatsApp)
> **Prompt 1.3:** *"Implementa completos en `apps/api/src/modules/` el módulo `audit` (`AuditService`, `AuditController`) y el módulo `identity-access` (registro de organización, login JWT + cookie refresh, `change-password`, CRUD de usuarios del personal con clave temporal `must_change_password` o enlace de invitación/reset para WhatsApp, `accept-invite`, `forgot-password` y `reset-password`). Sin TODOs ni código incompleto."*
- **Puerta Manual 1.3:** Ejecutar `pnpm --filter @restaurante-saas/api typecheck`.

### Paso 1.4: Módulos Backend `tenancy` y `capabilities`
> **Prompt 1.4:** *"Implementa completos en `apps/api/src/modules/` el módulo `tenancy` (gestión de marca, sucursales y `BranchChannelPolicy` con validación y reinicio automático de `require_payment_before_preparation`) y el módulo `capabilities` (resolución jerárquica, evaluación atómica en lote `validateModuleSetAtomically`, `OpenOperationsChecker` y aplicación de perfiles respetando `default_pickup_delivery_policy` y `DINE_IN` fijo en `OFFLINE_ONLY`), y ensambla `AppModule` y `main.ts`."*
- **Puerta Manual 1.4:** Ejecutar `pnpm --filter @restaurante-saas/api typecheck`.

### Paso 1.5: Suite de Pruebas de Integración y Concurrencia RLS (`TC-01-I01` a `TC-01-I09`)
> **Prompt 1.5:** *"Genera en `apps/api/test/` la configuración de pruebas de integración con Supertest y Vitest, e implementa completas las pruebas `TC-01-I01` a `TC-01-I09` (incluyendo `rls-concurrency.e2e-spec.ts` con 30 transacciones simultáneas cruzadas entre Restaurante A y Restaurante B)."*
- **Puerta Manual 1.5:** Ejecutar `pnpm --filter @restaurante-saas/api test` y verificar que los 9 escenarios de integración pasen en verde.

### Paso 1.6: Aplicación Frontend React (`apps/web`) de Fase 01
> **Prompt 1.6:** *"Implementa en `apps/web` la configuración de Vite + Tailwind CSS + TanStack Query, el cliente HTTP con manejo de refresh JWT y redirección por `PASSWORD_CHANGE_REQUIRED`, el hook `useBranchCapabilities`, `<CapabilityRoute />`, el Layout dinámico por módulos activos y las vistas completas de Login, Registro, Cambio de Contraseña/Aceptación de Invitación, Onboarding guiado de 3 pasos, Gestor de Capacidades/Perfiles en lote y Configuración de Marca, Sucursales, Instrucciones de Pago (Nequi/DaviPlata/Bre-B) y Equipo (con botón de compartir invitación por WhatsApp)."*
- **Puerta Manual 1.6 (Cierre de Fase 01):** Ejecutar `pnpm turbo run typecheck && pnpm turbo run test && pnpm --filter @restaurante-saas/web build`.