# Fase 02: Catálogo Digital, Motor Tributario, Códigos QR y Vitrina Pública
**Documento:** `FASE_02_CATALOGO_IMPUESTOS_Y_VITRINA.md`  
**Versión:** 2.4.0 — Alineado con `DEFINICION_TECNICA.md` (v2.4.0) y `STACK_VERSIONS.md` (v2.4.0)  
**Fecha:** 2026-10-26  
**Prerrequisito:** `FASE_01_FUNDACION_Y_NUCLEO_SAAS.md` (v2.4.0) completada y con todas sus puertas de pruebas en verde.  
**Objetivo de la Fase:** Implementar de extremo a extremo el módulo de catálogo (`catalog`), el motor de cálculo de precios e impuestos para Colombia gobernado por `Tenant.tax_profile_mode` (con aviso fiscal DIAN), el importador rápido de productos por CSV o pegado de tabla, la gestión unificada de códigos QR opacos y revocables (`QrCodeLink`), la inyección en servidor de etiquetas OpenGraph para vista previa en WhatsApp, el panel administrativo de menú y la vitrina pública *mobile-first* (`public-storefront`), dejando **100 % completado el Nivel 0 de la Escalera de Adopción (`MENU_ONLY`)** y lista la base del carrito para la Fase 03A.

---

## 1. Reglas de Ingeniería, Arquitectura Limpia y Seguridad (Directivas para Gemini)

Al procesar este documento junto con `DEFINICION_TECNICA.md` (v2.4.0) y `STACK_VERSIONS.md` (v2.4.0), debes cumplir sin excepción las siguientes reglas:

1. **Política de Cero Código Incompleto (`Zero-Placeholder Policy`):**
   - Está estrictamente prohibido entregar código con comentarios como `// TODO`, `// implementar aquí`, `...` o funciones simuladas. Cada archivo (esquemas `Zod`, calculadoras puras, migraciones SQL con RLS, servicios NestJS, componentes React y pruebas) debe ser 100 % funcional, compilable y tipado.
2. **Apego a `STACK_VERSIONS.md` y Puertas Manuales por Sub-Paso:**
   - Respeta estrictamente las versiones fijadas en `STACK_VERSIONS.md`.
   - Entrega únicamente los archivos del paso solicitado en la Sección 5 y espera la confirmación de la **Puerta de Validación Manual** (`pnpm install`, `pnpm turbo run typecheck`, `pnpm turbo run test`) antes de avanzar al siguiente paso.
3. **Separación entre Rutas Administrativas (Privadas) y Rutas de Vitrina (Públicas):**
   - **Rutas Administrativas (`/api/v1/admin/...`):** Protegidas por `JwtAuthGuard`, `TenantContextGuard` y `PermissionsGuard`. El `tenant_id` proviene exclusivamente del JWT del usuario autenticado.
   - **Rutas Públicas de Comensal (`/api/v1/public/...` y `/r/:restaurantSlug`):** No requieren cuenta ni JWT del comensal. El contexto del restaurante se resuelve de forma segura mediante el `restaurantSlug` o el `qrToken` opaco desde `QrCodeLink`, ejecutando todas las lecturas dentro de `PrismaService.withTenant(tenantId, fn)` (`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`) para mantener activo el *Row-Level Security (RLS)* en PostgreSQL y aplicando *Rate Limiting* por IP con `@nestjs/throttler`.
4. **Precedencia Tributaria Única y Aritmética Entera en `COP`:**
   - Todos los precios (`price_cop`, `extra_price_cop`) se almacenan y operan como enteros en pesos colombianos (`INTEGER`).
   - Cumpliendo la depuración de `DEFINICION_TECNICA.md` (v2.4.0 — Sección 9.1.2), el modelo `Product` **no tiene** columna booleana `is_price_tax_included`. El modo de cálculo tributario lo define única y exclusivamente `Tenant.tax_profile_mode` (`FINAL_PRICE_NO_BREAKDOWN` | `TAX_INCLUDED_DISCRIMINATED` | `BASE_PLUS_TAX`).
   - En los modos `FINAL_PRICE_NO_BREAKDOWN` y `TAX_INCLUDED_DISCRIMINATED`, un producto publicado a `$10.000` con cantidad `2` genera siempre un total de línea de `$20.000`, sin cobrar ni sumar el impuesto por segunda vez.
5. **Tabla Unificada de Códigos QR (`QrCodeLink`) y Aviso Fiscal DIAN:**
   - Todos los tokens de códigos QR (`GENERAL_MENU`, `BRANCH_MENU`, `DINING_TABLE`) viven exclusivamente en la tabla `QrCodeLink` (`qr_token` único de 256 bits en `base64url`).
   - Tanto la configuración tributaria como el pie de la vitrina pública y los pre-recibos muestran la leyenda obligatoria de no equivalencia con Factura Electrónica DIAN.
6. **Rendimiento Mobile-First ($< 1,8\text{ s}$ FCP) y Vista Previa OpenGraph en WhatsApp:**
   - La vitrina pública (`features/public-storefront`) se carga mediante *Lazy Loading* en un *chunk* independiente del bundle administrativo.
   - El backend sirve en `GET /r/:restaurantSlug` (y `/r/:restaurantSlug/b/:branchSlug`) las meta-etiquetas OpenGraph dinámicas (`og:title`, `og:description`, `og:image`, `og:url`) para que al compartir el enlace del menú por WhatsApp se despliegue la tarjeta con el nombre, descripción y logo del restaurante.

---

## 2. Alcance Exacto de la Fase 02

### 2.1 Extensión del Paquete Compartido (`packages/shared`)
1. **Esquemas Zod de Catálogo, Impuestos y QR (`packages/shared/src/schemas/catalog.schema.ts`):**
   - `TaxProfileConfigSchema`: Valida `tax_profile_mode` (`'FINAL_PRICE_NO_BREAKDOWN'` | `'TAX_INCLUDED_DISCRIMINATED'` | `'BASE_PLUS_TAX'`), `default_tax_type` (`'NONE'` | `'INC'` | `'IVA'` | `'EXEMPT'`) y `default_tax_rate_bp` (entero en puntos básicos: ej. `800` para INC $8\text{ \%}$, `1900` para IVA $19\text{ \%}$, `0` para no gravado/exento). Incluye refinamiento `.superRefine()` que rechaza configuraciones contradictorias (como elegir `TAX_INCLUDED_DISCRIMINATED` o `BASE_PLUS_TAX` con `INC`/`IVA` pero dejando `default_tax_rate_bp = 0`, o elegir `NONE`/`EXEMPT` con tasa $> 0$).
   - `CategorySchema`: Valida `menu_id`, `name`, `description?`, `sort_order`, `default_station_key?`, `availability_schedule_json?` (días de la semana `0-6` y ventana `start_time` / `end_time` en formato `HH:mm`) e `is_active`.
   - `ProductSchema`: Valida `category_id`, `name` y `price_cop` (entero $\ge 0$) como únicos campos obligatorios para el modo rápido (Sección 4.0.1), siendo opcionales `description`, `image_url`, `tax_type`, `tax_rate_bp`, `override_station_key`, `allergen_tags`, `status` (`'ACTIVE'` | `'OUT_OF_STOCK'` | `'ARCHIVED'`), `variants` y `modifier_group_ids`.
   - `ModifierGroupSchema` y `ModifierOptionSchema`: Valida `name`, `min_selections` ($\ge 0$), `max_selections` ($\ge 1$), `is_required` y verifica que `min_selections <= max_selections` y que, si `is_required === true`, `min_selections >= 1`.
   - `BulkProductImportSchema`: Valida un arreglo de filas provenientes de CSV o pegado de tabla (`category_name`, `product_name`, `price_cop`, `description?`, `allergen_tags?`).
   - `CreateQrCodeLinkSchema`: Valida `target_type` (`'GENERAL_MENU'` | `'BRANCH_MENU'` | `'DINING_TABLE'`), `table_id?` (obligatorio solo si `target_type === 'DINING_TABLE'`) y `label`.
2. **Motor Tributario y Calculador de Líneas (`packages/shared/src/utils/tax-calculator.ts`):**
   - Constante exportada `DIAN_FISCAL_DISCLAIMER_TEXT = "Documento informativo de control interno / pre-cuenta — No sustituye la factura electrónica de venta ni el documento equivalente POS exigido por la DIAN"`.
   - Función pura determinista `calculateLinePricing(params)` que recibe:
     - `basePriceCop`: entero $\ge 0$ (precio del producto o de la variante elegida).
     - `modifiers`: arreglo de opciones elegidas con su `extra_price_cop`.
     - `quantity`: entero $\ge 1$.
     - `discountCop`: entero $\ge 0$ (por defecto `0`).
     - `taxProfileMode`: `'FINAL_PRICE_NO_BREAKDOWN'` | `'TAX_INCLUDED_DISCRIMINATED'` | `'BASE_PLUS_TAX'`.
     - `taxType`: `'NONE'` | `'INC'` | `'IVA'` | `'EXEMPT'`.
     - `taxRateBp`: entero $\ge 0$ (ej. `800` o `1900`).
   - Retorna el objeto exacto para visualización en vitrina y para el futuro *snapshot* de `OrderItem`:
     `{ unit_price_cop, modifiers_unit_total_cop, effective_unit_price_cop, gross_subtotal_cop, discount_cop, net_subtotal_cop, taxable_base_cop, tax_type, tax_rate_bp, tax_amount_cop, line_total_cop }`.
   - Función pura `validateModifierSelections(groups, selectedOptionsByGroup)` que verifica el cumplimiento de `is_required`, `min_selections`, `max_selections` y que todas las opciones seleccionadas estén en estado `'ACTIVE'`.

### 2.2 Base de Datos (`PostgreSQL 16` + `Prisma`) y Políticas RLS
Actualización de `apps/api/prisma/schema.prisma` y segunda migración SQL que crea las tablas de la Sección 9.1.2 de `DEFINICION_TECNICA.md` (v2.4.0) y activa sus políticas *Row-Level Security (RLS)* para el rol `app_runtime`:
1. `Menu`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (UUID FK NULL)`, `name`, `status ('ACTIVE' | 'ARCHIVED')`, `created_at`.
2. `Category`: `id (UUID PK)`, `tenant_id (FK)`, `menu_id (FK)`, `name`, `description (TEXT NULL)`, `sort_order (INT DEFAULT 0)`, `default_station_key (VARCHAR NULL)`, `availability_schedule_json (JSONB NULL)`, `is_active (BOOLEAN DEFAULT TRUE)`.
3. `Product`: `id (UUID PK)`, `tenant_id (FK)`, `category_id (FK)`, `name`, `description (TEXT NULL)`, `image_url (TEXT NULL)`, `price_cop (INT NOT NULL)`, `tax_type ('NONE' | 'INC' | 'IVA' | 'EXEMPT')`, `tax_rate_bp (INT DEFAULT 0)`, `override_station_key (VARCHAR NULL)`, `allergen_tags (TEXT[])`, `status ('ACTIVE' | 'OUT_OF_STOCK' | 'ARCHIVED')`, `sort_order (INT DEFAULT 0)`, `created_at`, `updated_at`.
4. `ProductVariant`: `id (UUID PK)`, `tenant_id (FK)`, `product_id (FK)`, `name`, `price_cop (INT NOT NULL)`, `status ('ACTIVE' | 'OUT_OF_STOCK')`, `sort_order (INT DEFAULT 0)`.
5. `ModifierGroup`: `id (UUID PK)`, `tenant_id (FK)`, `name`, `min_selections (INT DEFAULT 0)`, `max_selections (INT DEFAULT 1)`, `is_required (BOOLEAN DEFAULT FALSE)`.
6. `ModifierOption`: `id (UUID PK)`, `tenant_id (FK)`, `group_id (FK)`, `name`, `extra_price_cop (INT DEFAULT 0)`, `status ('ACTIVE' | 'OUT_OF_STOCK')`, `sort_order (INT DEFAULT 0)`.
7. `ProductModifierGroup`: `product_id (FK)`, `group_id (FK)`, `sort_order (INT DEFAULT 0)`, `PK(product_id, group_id)`.
8. `QrCodeLink`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `qr_token (VARCHAR(64) UNIQUE)`, `target_type ('GENERAL_MENU' | 'BRANCH_MENU' | 'DINING_TABLE')`, `table_id (UUID NULL)`, `label (VARCHAR)`, `is_active (BOOLEAN DEFAULT TRUE)`, `revoked_at (TIMESTAMPTZ NULL)`, `created_at (TIMESTAMPTZ)`.
9. **Índices compuestos obligatorios:**
   - `INDEX idx_menus_tenant_branch ON menus(tenant_id, branch_id, status)`
   - `INDEX idx_categories_tenant_menu ON categories(tenant_id, menu_id, sort_order)`
   - `INDEX idx_products_tenant_cat_status ON products(tenant_id, category_id, status, sort_order)`
   - `UNIQUE INDEX idx_qr_code_links_token ON qr_code_links(qr_token)`
   - `INDEX idx_qr_code_links_tenant_branch ON qr_code_links(tenant_id, branch_id, is_active)`

### 2.3 Backend en NestJS (`apps/api/src/modules/catalog/` y OpenGraph en `tenancy`)
1. **Administración de Perfil Tributario (`TaxProfileService`):**
   - `GET / PATCH /api/v1/admin/tax-profile`: Permite al `TENANT_ADMIN` actualizar `tax_profile_mode`, `default_tax_type` y `default_tax_rate_bp` en `Tenant`, validando coherencia con `TaxProfileConfigSchema` y registrando el antes y el después en `AuditEvent` (`action: 'TAX_PROFILE_UPDATED'`).
2. **Administración de Menús, Categorías, Productos y Modificadores (`CatalogAdminService`):**
   - Al crearse un restaurante (o si aún no tiene menú), asegura la existencia de un `Menu` principal activo.
   - `GET / POST / PATCH /api/v1/admin/categories`: Creación, edición, activación/desactivación y reordenamiento de categorías.
   - `GET / POST / PATCH /api/v1/admin/products`: Creación y edición de productos (asignando por defecto el `default_tax_type` y `default_tax_rate_bp` del `Tenant` si no se envían), gestión de sus `ProductVariant` y asociación de `ProductModifierGroup`. Audita en `AuditEvent` todo cambio de precio o estado a `ARCHIVED`.
   - `PATCH /api/v1/admin/products/:productId/availability`: Cambio rápido en un toque entre `'ACTIVE'` y `'OUT_OF_STOCK'`.
   - `GET / POST / PATCH /api/v1/admin/modifier-groups`: Gestión completa de grupos de modificadores y sus opciones (`ModifierOption`), incluyendo cambio rápido de disponibilidad por opción.
3. **Importador Masivo para Restaurantes Pequeños (`CatalogImportService`):**
   - `POST /api/v1/admin/products/import`: Recibe un lote validado con `BulkProductImportSchema` (hasta 300 productos por lote). Dentro de una única transacción `PrismaService.withTenant`: localiza o crea las categorías por nombre (insensible a mayúsculas/minúsculas), inserta los productos con sus precios enteros en `COP` heredando el impuesto por defecto del `Tenant`, registra la operación en `AuditEvent` (`action: 'CATALOG_BULK_IMPORTED'`) y retorna `{ created_categories_count, created_products_count }`.
4. **Servicio de Códigos QR Opacos y Revocables (`QrCodeService`):**
   - `GET / POST /api/v1/admin/branches/:branchId/qr-codes`: Genera un token criptográfico de 32 bytes (`crypto.randomBytes(32).toString('base64url')`) en `QrCodeLink` para `GENERAL_MENU` o `BRANCH_MENU` (y prepara `DINING_TABLE` validando que si `target_type === 'DINING_TABLE'` se exija `@RequireModule('dining', 'channel.dine_in_qr')`).
   - `POST /api/v1/admin/qr-codes/:qrId/revoke`: Marca `is_active = false` y `revoked_at = NOW()`, registrando en `AuditEvent`, y opcionalmente genera un nuevo `QrCodeLink` de reemplazo en la misma llamada.
5. **Controlador Público de Catálogo, QR y OpenGraph (`PublicCatalogController` y `OpenGraphController`):**
   - `GET /api/v1/public/:restaurantSlug/branches`: Retorna la marca (`BrandSettings`), aviso fiscal DIAN y las sucursales activas con horarios (`operating_hours_json`), indicador calculado en vivo `is_open_now` (evaluado en la zona horaria de la sucursal `America/Bogota`), capacidades públicas activas (`ordering`, `channel.pickup`, `channel.delivery`, `channel.dine_in_qr`, `tracking`, `notifications.whatsapp_click`) e instrucciones de pago (`payment_instructions_json`).
   - `GET /api/v1/public/:restaurantSlug/menu?branchSlug=...`: Retorna las categorías activas y los productos cuyo `status` sea `'ACTIVE'` u `'OUT_OF_STOCK'` (excluyendo siempre `'ARCHIVED'`), evaluando para cada categoría si está dentro de su ventana horaria `availability_schedule_json` (`is_currently_available`), e incluyendo variantes y grupos de modificadores ordenados.
   - `GET /api/v1/public/qr/:qrToken`: Busca el token en `QrCodeLink`. Si no existe, responde `404 Not Found`; si `is_active === false` (revocado), responde `410 Gone` (`QR_CODE_REVOKED`). Si está activo, ejecuta la lectura bajo el `tenant_id` correspondiente y retorna `{ restaurant_slug, branch_slug, branch_id, target_type, table_id, label }`.
   - `GET /r/:restaurantSlug` y `GET /r/:restaurantSlug/b/:branchSlug` (en `OpenGraphController`): Inyecta dinámicamente en la plantilla HTML las etiquetas `<meta property="og:title">`, `<meta property="og:description">`, `<meta property="og:image">` y `<meta property="og:type" content="website">` con los datos reales del restaurante y sucursal para que WhatsApp previsualice la tarjeta del comercio.

### 2.4 Frontend en React (`apps/web`)
1. **Gestor Administrativo de Catálogo (`features/admin-catalog/`):**
   - **Creación Rápida en 15 Segundos:** Formulario donde el dueño solo digita `Nombre del plato`, `Precio ($ COP)` y selecciona/crea la `Categoría`, con acordeón opcional *"Variantes, adiciones, foto y alérgenos"*.
   - **Switch Instantáneo de Disponibilidad:** Interruptor directo en cada tarjeta/fila de producto y opción de modificador para alternar entre `Disponible` y `Agotado hoy (OUT_OF_STOCK)` con actualización optimista en TanStack Query.
   - **Asistente de Importación Masiva (CSV o Pegar desde Excel/WhatsApp):** Permite pegar líneas de texto (`Categoría | Nombre | Precio | Descripción`) o subir un archivo `.csv`, valida cada fila en tiempo real con `BulkProductImportSchema` mostrando vista previa de errores y ejecuta la carga masiva en un clic.
   - **Centro de Códigos QR (`/admin/qr-codes`):** Genera, previsualiza con `qrcode.react` (incorporando colores y nombre de la sede), descarga en PNG/SVG listo para impresión, copia el enlace público y permite revocar/regenerar códigos QR con confirmación.
2. **Formulario de Perfil Tributario (`features/admin-settings/tax-profile-form.tsx`):**
   - Selector interactivo de los 3 modos (`FINAL_PRICE_NO_BREAKDOWN`, `TAX_INCLUDED_DISCRIMINATED`, `BASE_PLUS_TAX`) con simulador en vivo: muestra cómo se calcula un pedido de `2` productos de `$10.000` (`Total = $20.000` sin doble cobro) y despliega el aviso de validación con asesor contable y la leyenda fiscal DIAN.
3. **Vitrina Pública Mobile-First (`features/public-storefront/`):**
   - **Rutas públicas:** `/r/:restaurantSlug`, `/r/:restaurantSlug/b/:branchSlug` y `/q/:qrToken` (que consulta `/api/v1/public/qr/:qrToken` y redirige a la sede o muestra pantalla amigable si el QR fue revocado).
   - **Tematización Dinámica y Cabecera de Sede:** Inyecta `--brand-primary` y `--brand-secondary` en el contenedor raíz, muestra logo, portada, insignia en vivo `"Abierto ahora"` / `"Cerrado en este momento"`, horarios y selector de sucursal.
   - **Exploración Ágil del Menú:** Barra horizontal fija (*sticky*) de categorías, buscador instantáneo por nombre/descripción, insignias de alérgenos y marcado claro de productos `"Agotado"` o fuera de horario.
   - **Modal de Producto y Selección de Modificadores:** Permite elegir variante, seleccionar opciones de cada `ModifierGroup` validando mínimos/máximos en vivo con `validateModifierSelections` y calcular el subtotal exacto de la línea con `calculateLinePricing`.
   - **Adaptación Modular según `ordering` y Pie de Página Legal:**
     - Si el módulo `ordering` está **desactivado** (Nivel 0: perfil `MENU_ONLY`), la vitrina opera como carta digital de consulta pura y **no muestra botones de agregar al carrito ni barra inferior de pedido**.
     - Si `ordering` está **activo** (Nivel 1+), habilita el botón *"Agregar al pedido ($ XX.XXX)"* guardando los ítems en un store de carrito en `Zustand` persistido en `localStorage` por `restaurantSlug + branchSlug` (listo para conectarse al checkout en la Fase 03A).
     - En el pie de página incluye el descargo médico de alérgenos y la leyenda fiscal `DIAN_FISCAL_DISCLAIMER_TEXT`.

---

## 3. Reglas de Dominio y Fórmulas Exactas de la Fase 02

### 3.1 Fórmulas Exactas del Motor Tributario por Línea (`tax-calculator.ts`)
Dado un producto (o su variante seleccionada) con precio entero $P_{\text{base}} \ge 0$, un conjunto de opciones de modificadores elegidas con suma unitaria $M_{\text{extra}} = \sum \text{extra\_price\_cop} \ge 0$, una cantidad entera $Q \ge 1$, un descuento de línea entero $D$ ($0 \le D \le (P_{\text{base}} + M_{\text{extra}}) \times Q$) y una tasa de impuesto en puntos básicos $\text{tax\_rate\_bp} \ge 0$ donde $r = \frac{\text{tax\_rate\_bp}}{10000}$:

1. **Cálculo de precios unitarios y subtotal neto antes de regla tributaria:**
   - $\text{effective\_unit\_price\_cop} = P_{\text{base}} + M_{\text{extra}}$
   - $\text{gross\_subtotal\_cop} = \text{effective\_unit\_price\_cop} \times Q$
   - $\text{net\_subtotal\_cop} = \text{gross\_subtotal\_cop} - D$

2. **Evaluación según `Tenant.tax_profile_mode`:**
   - **Caso A: `tax_profile_mode === 'FINAL_PRICE_NO_BREAKDOWN'` (Valor por defecto en Niveles 0 y 1):**
     - $\text{line\_total\_cop} = \text{net\_subtotal\_cop}$
     - $\text{taxable\_base\_cop} = \text{net\_subtotal\_cop}$
     - $\text{tax\_amount\_cop} = 0$
     - $\text{tax\_type} = \text{'NONE'}$, $\text{tax\_rate\_bp} = 0$
   - **Caso B: `tax_profile_mode === 'TAX_INCLUDED_DISCRIMINATED'` (Precio de carta ya incluye INC o IVA):**
     - $\text{line\_total\_cop} = \text{net\_subtotal\_cop}$ *(Jamás se vuelve a sumar el impuesto al precio publicado; si $\text{effective\_unit\_price\_cop} = 10000$, $Q = 2$, $D = 0 \implies \text{line\_total\_cop} = 20000$).*
     - Si $\text{taxType} \in \{\text{'NONE'}, \text{'EXEMPT'}\}$ o $r = 0$:
       - $\text{taxable\_base\_cop} = \text{net\_subtotal\_cop}$
       - $\text{tax\_amount\_cop} = 0$
     - Si $r > 0$:
       $$\text{taxable\_base\_cop} = \text{Math.round}\left(\frac{\text{net\_subtotal\_cop}}{1 + r}\right)$$
       $$\text{tax\_amount\_cop} = \text{net\_subtotal\_cop} - \text{taxable\_base\_cop}$$
       *(Cumpliendo siempre $\text{taxable\_base\_cop} + \text{tax\_amount\_cop} \equiv \text{line\_total\_cop}$ al peso exacto).*
   - **Caso C: `tax_profile_mode === 'BASE_PLUS_TAX'` (Precio almacenado es base antes de impuestos):**
     - $\text{taxable\_base\_cop} = \text{net\_subtotal\_cop}$
     - Si $\text{taxType} \in \{\text{'NONE'}, \text{'EXEMPT'}\}$ o $r = 0$, entonces $\text{tax\_amount\_cop} = 0$; de lo contrario:
       $$\text{tax\_amount\_cop} = \text{Math.round}(\text{taxable\_base\_cop} \times r)$$
     - $\text{line\_total\_cop} = \text{taxable\_base\_cop} + \text{tax\_amount\_cop}$

---

## 4. Matriz de Casos de Prueba Obligatorios (Fase 02)

El desarrollo de la Fase 02 solo se considera terminado cuando todas las siguientes pruebas automatizadas pasan en verde:

### 4.1 Pruebas Unitarias (`packages/shared`)
- **`TC-02-U01` (Invariante de No Doble Cobro — Criterio de Aceptación 8 de `DEFINICION_TECNICA.md`):**
  - Un producto con `basePriceCop = 10000`, `quantity = 2`, sin modificadores ni descuentos, debe producir `line_total_cop = 20000` tanto en `FINAL_PRICE_NO_BREAKDOWN` como en `TAX_INCLUDED_DISCRIMINATED` (con INC `800 bp` $\rightarrow$ `taxable_base_cop = 18519`, `tax_amount_cop = 1481`; y con IVA `1900 bp` $\rightarrow$ `taxable_base_cop = 16807`, `tax_amount_cop = 3193`).
- **`TC-02-U02` (Conciliación al Peso con Modificadores y Descuento en `TAX_INCLUDED_DISCRIMINATED`):**
  - Producto de `$18.500` + adición de `$4.000` ($\text{effective\_unit\_price\_cop} = 22500$), cantidad `3` (`gross = 67500`), descuento `$2.500` (`net = 65000`), con INC `800 bp` ($8\text{ \%}$): debe retornar `taxable_base_cop = 60185`, `tax_amount_cop = 4815` y `line_total_cop = 65000` ($60185 + 4815 = 65000$).
- **`TC-02-U03` (Cálculo en Modo `BASE_PLUS_TAX`):**
  - Producto base de `$10.000`, cantidad `2` (`net = 20000`) con IVA `1900 bp` ($19\text{ \%}$) en modo `BASE_PLUS_TAX` debe retornar `taxable_base_cop = 20000`, `tax_amount_cop = 3800` y `line_total_cop = 23800`.
- **`TC-02-U04` (Validador de Selección de Modificadores y Esquema Tributario):**
  - Si un `ModifierGroup` tiene `is_required = true`, `min_selections = 1`, `max_selections = 2`, seleccionar `0` opciones o `3` opciones o una opción en estado `OUT_OF_STOCK` debe fallar en `validateModifierSelections`.
  - Enviar a `TaxProfileConfigSchema` el modo `TAX_INCLUDED_DISCRIMINATED` con `default_tax_type: 'INC'` y `default_tax_rate_bp: 0` debe ser rechazado por validación `Zod`.

### 4.2 Pruebas de Integración Backend (`apps/api/test/`)
- **`TC-02-I01` (Carga Rápida e Importación Masiva de Menú — Criterio 1 de `DEFINICION_TECNICA.md`):**
  - Un restaurante en perfil `WHATSAPP_SIMPLE` envía `POST /api/v1/admin/products/import` con 12 productos distribuidos en 3 categorías nuevas indicando únicamente `category_name`, `product_name` y `price_cop`.
  - El backend crea las 3 categorías y los 12 productos en una sola transacción, registra el `AuditEvent` y `GET /api/v1/public/:restaurantSlug/menu` los devuelve ordenados y disponibles.
- **`TC-02-I02` (Generación, Resolución y Revocación en Tabla Unificada `QrCodeLink`):**
  - Se genera un QR de menú de sucursal (`POST /api/v1/admin/branches/:branchId/qr-codes` con `target_type: 'BRANCH_MENU'`).
  - `GET /api/v1/public/qr/:qrToken` devuelve `200 OK` con `restaurant_slug` y `branch_slug`, comprobando que el `qr_token` es opaco y no contiene UUIDs.
  - Al revocar el QR (`POST /api/v1/admin/qr-codes/:qrId/revoke`), volver a consultar `GET /api/v1/public/qr/:qrToken` responde HTTP `410 Gone` (`QR_CODE_REVOKED`).
- **`TC-02-I03` (Disponibilidad en 1 Toque, Filtro de `ARCHIVED` y Horarios de Categoría):**
  - Al marcar un producto como `OUT_OF_STOCK` (`PATCH /api/v1/admin/products/:id/availability`), el menú público lo incluye con `status: 'OUT_OF_STOCK'` (no comprable).
  - Al cambiar un producto a `ARCHIVED`, desaparece por completo de `GET /api/v1/public/:restaurantSlug/menu` pero permanece en PostgreSQL.
- **`TC-02-I04` (Inyección de Etiquetas OpenGraph para Vista Previa en WhatsApp):**
  - Una petición `GET /r/:restaurantSlug` devuelve HTML con código `200 OK` que contiene las etiquetas `<meta property="og:title" content="..."/>`, `<meta property="og:description" content="..."/>` y `<meta property="og:image" content="..."/>` correspondientes a la marca del restaurante.
- **`TC-02-I05` (Prevención de Configuración Tributaria Contradictoria y Auditoría):**
  - Intentar guardar mediante `PATCH /api/v1/admin/tax-profile` el modo `BASE_PLUS_TAX` con `default_tax_type: 'IVA'` y `default_tax_rate_bp: 0` responde `400 Bad Request`. Guardar una configuración válida (`default_tax_rate_bp: 1900`) actualiza el `Tenant` y crea un registro en `audit_events`.
- **`TC-02-I06` (Aislamiento Multi-Tenant con RLS en Catálogo y Códigos QR):**
  - Un administrador autenticado en el *Restaurante A* intenta editar el precio de un producto, cambiar su disponibilidad o revocar un `QrCodeLink` perteneciente al *Restaurante B*.
  - Gracias a `PrismaService.withTenant` y las políticas RLS de PostgreSQL, la operación responde `404 Not Found` y los datos del *Restaurante B* permanecen intactos.

### 4.3 Pruebas End-to-End de Vitrina Pública (`apps/web`)
- **`TC-02-E01` (Adaptación de Vitrina entre Perfil `MENU_ONLY` y Perfil `WHATSAPP_SIMPLE`):**
  - Cuando la sucursal tiene el perfil `MENU_ONLY` (`ordering: false`), al abrir `/r/:restaurantSlug` el comensal visualiza colores de marca, categorías, productos, precios, modal de detalle y la leyenda fiscal DIAN, pero **no existe botón de "Agregar al pedido" ni barra de carrito**.
  - Al cambiar la sucursal al perfil `WHATSAPP_SIMPLE` (`ordering: true`), la misma vitrina habilita la selección de variantes/modificadores y el botón *"Agregar al pedido"*, actualizando el contador y subtotal del carrito en `Zustand`.

---

## 5. Secuencia de Prompts Acotados para Ejecutar la Fase 02 con Gemini

Adjunta `DEFINICION_TECNICA.md` (v2.4.0), `STACK_VERSIONS.md` (v2.4.0) y este archivo `FASE_02_CATALOGO_IMPUESTOS_Y_VITRINA.md`, y solicita los siguientes **5 pasos uno por uno**, ejecutando la puerta de validación manual al terminar cada paso:

### Paso 2.1: Esquemas Zod de Catálogo, Motor Tributario y Pruebas Unitarias (`packages/shared`)
> **Prompt 2.1:** *"Con base en `DEFINICION_TECNICA.md` (v2.4.0), `STACK_VERSIONS.md` (v2.4.0) y `FASE_02_CATALOGO_IMPUESTOS_Y_VITRINA.md`, genera en `packages/shared` los esquemas Zod completos (`src/schemas/catalog.schema.ts`), el motor de cálculo de precios e impuestos por línea gobernado por `Tenant.tax_profile_mode` más el validador de modificadores y la constante `DIAN_FISCAL_DISCLAIMER_TEXT` (`src/utils/tax-calculator.ts`), exporta todo en `src/index.ts` y genera la suite de pruebas unitarias `TC-02-U01` a `TC-02-U04`. Entrega todos los archivos 100 % completos y sin TODOs."*
- **Puerta Manual 2.1:** Ejecutar `pnpm --filter @restaurante-saas/shared typecheck && pnpm --filter @restaurante-saas/shared test`.

### Paso 2.2: Modelos Prisma de Catálogo y `QrCodeLink` + Migración SQL con RLS
> **Prompt 2.2:** *"Actualiza `apps/api/prisma/schema.prisma` agregando los modelos `Menu`, `Category`, `Product` (sin booleano redundante `is_price_tax_included`), `ProductVariant`, `ModifierGroup`, `ModifierOption`, `ProductModifierGroup` y `QrCodeLink` con todos sus índices compuestos, y genera la migración SQL correspondiente que crea las tablas y activa las políticas Row-Level Security (RLS) en PostgreSQL para el rol `app_runtime`."*
- **Puerta Manual 2.2:** Ejecutar `pnpm --filter @restaurante-saas/api prisma migrate deploy && pnpm --filter @restaurante-saas/api prisma generate && pnpm --filter @restaurante-saas/api typecheck`.

### Paso 2.3: Servicios Backend de Catálogo, Importador Masivo, Perfil Tributario y QR (`apps/api`)
> **Prompt 2.3:** *"Implementa completos en `apps/api/src/modules/catalog/` los servicios y controladores administrativos: `TaxProfileService`, `CatalogAdminService` (menús, categorías, productos, variantes, grupos de modificadores y disponibilidad en 1 toque), `CatalogImportService` (importación masiva transaccional) y `QrCodeService` (generación y revocación en `QrCodeLink`). Sin código incompleto ni TODOs."*
- **Puerta Manual 2.3:** Ejecutar `pnpm --filter @restaurante-saas/api typecheck`.

### Paso 2.4: Controladores Públicos de Vitrina, Resolución de QR, OpenGraph y Pruebas de Integración (`TC-02-I01` a `TC-02-I06`)
> **Prompt 2.4:** *"Implementa completos en `apps/api` el `PublicCatalogController` (`/api/v1/public/:restaurantSlug/branches`, `/menu` y `/api/v1/public/qr/:qrToken` con Rate Limiting y contexto RLS), el `OpenGraphController` (`/r/:restaurantSlug` y `/r/:restaurantSlug/b/:branchSlug` con inyección de meta-etiquetas OpenGraph para WhatsApp), registra el módulo en `AppModule` y genera la suite de pruebas de integración `TC-02-I01` a `TC-02-I06`."*
- **Puerta Manual 2.4:** Ejecutar `pnpm --filter @restaurante-saas/api typecheck && pnpm --filter @restaurante-saas/api test`.

### Paso 2.5: Frontend React (`apps/web`): Admin de Catálogo, QR, Perfil Tributario y Vitrina Pública Mobile-First
> **Prompt 2.5:** *"Implementa en `apps/web` las vistas completas de `features/admin-catalog/` (creación rápida de productos, switch de agotado en 1 toque, asistente de importación masiva CSV/pegado y centro de códigos QR descargables con `qrcode.react`), el formulario `tax-profile-form.tsx` con simulador en vivo y leyenda DIAN en `features/admin-settings/`, y la vitrina pública completa en `features/public-storefront/` (`/r/:restaurantSlug`, `/r/:restaurantSlug/b/:branchSlug` y `/q/:qrToken`) con tematización CSS dinámica, horarios, buscador, modal de modificadores, store de carrito en `Zustand`, adaptación según el módulo `ordering` y la prueba `TC-02-E01`."*
- **Puerta Manual 2.5 (Cierre de Fase 02 — Nivel 0 Completo):** Ejecutar `pnpm turbo run typecheck && pnpm turbo run test && pnpm --filter @restaurante-saas/web build`.