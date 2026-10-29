# Definición Técnica de Ajustes Operativos — Roles, Navegación y Aislamiento de Sucursales (v2.5.0)

Este documento complementa la *Definición Técnica Definitiva (v2.4.0)* y registra formalmente la arquitectura, restricciones de seguridad y especificación técnica de los **Ajustes Operativos Post-Fase 06**, enfocados en la **separación estricta de roles** en la interfaz de usuario y el **aislamiento de alcance por sucursal (`branch_scope`)** para prevenir errores operativos en comercios gastronómicos multi-sucursal.

---

## 1. Contexto y Justificación del Cambio

En la versión base (v2.4.0), todos los usuarios autenticados compartían un menú de navegación global en el panel operativo y tenían a su disposición un selector libre de sucursales (`branch switcher`). 

En entornos de restaurantes reales, esta permisividad genera altos riesgos operativos:
1. **Riesgo de error humano cruzado entre sucursales:** Un mesero o cajero asignado a una sede física (ej. *Zona G*) podría cambiar accidentalmente la sucursal activa en la barra superior y comandar mesas, abrir cuentas o registrar cobros en otra sede (ej. *Usaquén*).
2. **Exposición innecesaria de opciones administrativas a personal operativo:** Roles como meseros (`WAITER`), cocina (`KITCHEN`) o cajeros (`CASHIER`) no deben visualizar módulos de configuración de marca, capacidades modulares SaaS, zonas de reparto o directorio completo de clientes.
3. **Sobrecarga cognitiva en pantallas táctiles de salón y cocina:** En dispositivos táctiles (tablets de meseros, pantallas de cocina KDS), la interfaz debe ser minimalista, limpia y enfocada al 100 % en su tarea respectiva.

Por ello, se establece un **control de visibilidad y acceso en dos capas:**
- **Capa 1: Filtrado de Navegación y Guardas de Rutas por Rol (RBAC de Frontend):** Oculta enlaces no autorizados y bloquea el acceso por URL directa.
- **Capa 2: Aislamiento Estricto de Sucursal (`branch_scope`):** 
  - Si el usuario tiene **1 sola sucursal asignada**, el selector de sucursal se convierte en una **etiqueta fija bloqueada** (sin desplegable ni opción de cambio).
  - Si el usuario tiene **múltiples sucursales asignadas**, solo puede alternar entre las sucursales explícitamente autorizadas en su membresía.
  - El backend filtra las sucursales devueltas en `GET /admin/branches` según el `branch_scope` del token JWT.

---

## 2. Matriz de Permisos, Navegación y Destinos por Rol

| Rol (`role_key`) | Actor / Descripción | Menú y Vistas Permitidas | Opciones Ocultas / Bloqueadas | Destino por Defecto |
| :--- | :--- | :--- | :--- | :--- |
| **`TENANT_ADMIN`** | Propietario / Administrador | • Dashboard General (`/dashboard`)<br>• Panel de Pedidos (`/panel`, `/panel/lite`)<br>• Menú & Carta (`/menu`, `/admin/menu`)<br>• Códigos QR (`/admin/qr-codes`)<br>• Salón y Mesas (`/dining`)<br>• Mesas & Portamesas (`/admin/dining-tables`)<br>• Domicilios (`/delivery`)<br>• Zonas de Domicilio (`/admin/delivery-zones`)<br>• Para Llevar (`/pickup`)<br>• Cocina KDS (`/kds`)<br>• Reportes & Conciliación (`/reports`)<br>• Directorio de Clientes (`/admin/customers`)<br>• Capacidades & Perfiles (`/admin/capabilities`)<br>• Ajustes del Restaurante (`/admin/settings`) | Ninguna (Acceso Maestro) | `/dashboard` |
| **`BRANCH_MANAGER`** | Gerente de Sucursal | • Dashboard de Sede (`/dashboard`)<br>• Panel de Pedidos (`/panel`, `/panel/lite`)<br>• Menú & Carta (`/menu`)<br>• Códigos QR (`/admin/qr-codes`)<br>• Salón y Mesas (`/dining`)<br>• Mesas & Portamesas (`/admin/dining-tables`)<br>• Domicilios (`/delivery`)<br>• Zonas de Domicilio (`/admin/delivery-zones`)<br>• Para Llevar (`/pickup`)<br>• Cocina KDS (`/kds`)<br>• Reportes de Sede (`/reports`)<br>• Directorio de Clientes (`/admin/customers`) | • Capacidades & Perfiles (`/admin/capabilities`)<br>• Ajustes de Organización / Facturación SaaS (`/admin/settings`) | `/dining` o `/dashboard` |
| **`CASHIER`** | Cajero / Caja | • Salón y Mesas (`/dining` - pre-cuentas y cobro de mesas)<br>• Panel de Pedidos (`/panel` - cobros manuales y comanda)<br>• Menú & Carta (`/menu` - consulta de precios)<br>• Reportes & Conciliación (`/reports` - arqueo y corte de caja) | • Dashboard General (`/dashboard`)<br>• Cocina KDS (`/kds`)<br>• Códigos QR (`/admin/qr-codes`)<br>• Zonas de Domicilio (`/admin/delivery-zones`)<br>• Mesas & Portamesas (`/admin/dining-tables`)<br>• Directorio de Clientes (`/admin/customers`)<br>• Capacidades y Ajustes (`/admin/*`) | `/dining` |
| **`WAITER`** | Mesero / Salón | • Salón y Mesas (`/dining` - plano de mesas en vivo, apertura de cuentas, toma de comandas móviles en mesa, confirmación de autopedidos QR y división por comensal) | • Menú & Carta (`/menu` - la carta y platos son definidos exclusivamente por la administración)<br>• Dashboard (`/dashboard`)<br>• Panel de Pedidos (`/panel`)<br>• Cocina KDS (`/kds`)<br>• Reportes (`/reports`)<br>• Todos los módulos administrativos (`/admin/*`) | `/dining` |
| **`KITCHEN`** | Cocina / Barra | • Cocina KDS (`/kds` - pantalla táctil de preparación en tiempo real vía SSE) | • Dashboard (`/dashboard`)<br>• Salón y Mesas (`/dining`)<br>• Panel de Pedidos (`/panel`)<br>• Menú & Carta (`/menu`)<br>• Reportes (`/reports`)<br>• Todos los módulos administrativos (`/admin/*`) | `/kds` |
| **`DISPATCH_DRIVER`** | Repartidor | • Domicilios / Despacho (`/delivery`, `/panel`) | • Salón (`/dining`), Cocina (`/kds`), Reportes (`/reports`), Ajustes (`/admin/*`) | `/panel` |
| **`PLATFORM_ADMIN`** | Superadministrador SaaS | • Capacidades & Perfiles (`/admin/capabilities`)<br>• Ajustes Globales SaaS (`/admin/settings`)<br>• Dashboard SaaS | Operación diaria de cocina o salón salvo soporte técnico | `/admin/capabilities` |

---

## 3. Especificación Técnica de Aislamiento de Sucursales (`branch_scope`)

### 3.1 Modelo de Datos en Base de Datos
En la tabla `memberships`, el campo `branch_scope` almacena un array de UUIDs (`UUID[]`):
```prisma
model Membership {
  id           String   @id @default(uuid()) @db.Uuid
  tenant_id    String   @db.Uuid
  user_id      String   @db.Uuid
  role_key     String   @db.VarChar(64)
  branch_scope String[] @default([]) // Array de UUID de sucursales autorizadas (vacío o null autoriza todas)
  is_active    Boolean  @default(true)
  created_at   DateTime @default(now()) @db.Timestamptz
  ...
}
```

### 3.2 Reglas de Resolución de Sucursal
1. **Roles Globales (`TENANT_ADMIN`, `PLATFORM_ADMIN`):**
   - Tienen acceso irrestricto a todas las sucursales de la organización.
   - El selector de sucursales en la barra lateral se renderiza como un **menú desplegable interactivo (`<select>`)**.
2. **Roles Operativos con 1 Sola Sucursal Asignada (`branch_scope.length === 1`):**
   - El selector se renderiza como un **indicador fijo bloqueado** con ícono de tienda y candado de seguridad (`Lock`).
   - No se despliegan opciones de cambio.
   - El estado de la sucursal activa (`currentBranchId` en Zustand) se fuerza automáticamente a la única sucursal autorizada, sobreescribiendo cualquier valor residual que pudiera existir en `localStorage`.
3. **Roles Operativos con Múltiples Sucursales Asignadas (`branch_scope.length > 1`):**
   - El menú desplegable únicamente incluye las sucursales listadas en `branch_scope`.
   - Se bloquea la selección de cualquier sucursal ajena.
4. **Backend Enforcement (`tenancy.service.ts` y `PermissionsGuard`):**
   - El endpoint `GET /api/v1/admin/branches` filtra automáticamente la lista según el `branchScope` del usuario cuando no es administrador.
   - Si un usuario no autorizado intenta enviar una petición HTTP dirigida a otra sucursal (`:branchId` en URL o `branch_id` en el body), el `PermissionsGuard` rechaza la petición con código HTTP `403 Forbidden` (`BRANCH_SCOPE_FORBIDDEN`).

---

## 4. Arquitectura de Navegación y Guardas en el Frontend (`apps/web`)

### 4.1 Mapeo Centralizado de Permisos por Rol
Se crea un módulo declarativo en el paquete compartido o frontend (`role-permissions.config.ts`) que define:
- `ROLE_ALLOWED_PATHS`: Rutas exactas o prefijos permitidos para cada rol.
- `ROLE_DEFAULT_ROUTES`: Ruta de aterrizaje primaria ante login o redirección forzada.

### 4.2 Componente Guardián `<RoleRoute>`
Envuelve las rutas protegidas en `App.tsx`:
```tsx
<Route
  path="admin/settings"
  element={
    <RoleRoute allowedRoles={['TENANT_ADMIN', 'PLATFORM_ADMIN']}>
      <SettingsPage />
    </RoleRoute>
  }
/>
```
Si el usuario intenta ingresar manualmente por barra de direcciones a una ruta no autorizada:
- Se le redirige automáticamente a su ruta permitida predeterminada (`ROLE_DEFAULT_ROUTES[user.roleKey]`).
- Opcionalmente, se muestra un banner informativo notificando que el rol carece de privilegios para esa sección.

### 4.3 Sidebar Limpio y Adaptativo (`AppLayout.tsx`)
- La sección **Operación Diaria** solo renderiza los ítems autorizados para el rol autenticado.
- La sección **Administración** solo se muestra si el usuario tiene al menos una ruta administrativa autorizada (`TENANT_ADMIN` o `BRANCH_MANAGER`).
- El selector de sucursal muestra el nombre de la sede con estado `fijo y protegido` para personal de salón, caja y cocina.

---

## 5. Matriz de Pruebas y Criterios de Aceptación

1. **`TC-POST06-01` (Aislamiento de Sucursal en Salón / Mesero):**
   - Usuario `mesero@karta.co` asignado a `Sede Gourmet Zona G`.
   - Inicia sesión: aterrizaje directo en `/dining`.
   - Selector de sucursal: fijo en "Sede Gourmet Zona G" sin dropdown de cambio.
   - Sidebar: únicamente muestra "Salón y Mesas" (`/dining`). La opción "Menú & Carta" (`/menu`) queda completamente bloqueada y oculta para el mesero.
   - Catálogo de comanda: el mesero cuenta con el permiso `catalog:read` para listar platos y bebidas en el modal de toma de comandas móviles (`+ Comanda`).
2. **`TC-POST06-02` (Aislamiento de Pantalla de Cocina / KDS):**
   - Usuario `cocina@karta.co` asignado a `Sede Gourmet Zona G`.
   - Inicia sesión: aterrizaje directo en `/kds`.
   - Sidebar: únicamente muestra "Cocina KDS".
   - No tiene acceso a reportes, facturación ni gestión de mesas.
3. **`TC-POST06-03` (Caja y Cobros / Cajero):**
   - Usuario `cajero@karta.co` asignado a `Sede Gourmet Zona G`.
   - Inicia sesión: acceso a `/dining` (para pre-cuentas y cobro de cuentas), `/panel` y `/reports` (arqueo de caja).
   - Bloqueo de acceso a configuración de capacidades y ajustes de marca.
4. **`TC-POST06-04` (Control Maestro Multisucursal / Propietario):**
   - Usuario `admin@karta.co` (`TENANT_ADMIN`).
   - Acceso total a todas las opciones del sistema.
   - Selector de sucursales habilitado para alternar entre "Sede Gourmet Zona G" y "Sede Usaquén".
5. **`TC-POST06-05` (Protección contra Navegación Directa por URL):**
   - Un mesero autenticado escribe `http://localhost:5173/admin/settings` o `http://localhost:5173/menu` en el navegador.
   - Es interceptado por `<RoleRoute>` y redirigido limpiamente a `/dining`.

---

## 6. Arquitectura del Flujo de Pedidos en Mesa y PIN de Sesión Dinámico

### 6.1 ¿Por qué existe el PIN de 4 dígitos en la mesa (`table_session_pin`)?
En establecimientos gastronómicos, los códigos QR ubicados en las mesas físicas (portamenús de acrílico o autoadhesivos) son **estáticos** (impresos de forma fija con la URL de la mesa, ej. `https://karta.co/r/karta-demo?table=M-01`).

Sin un mecanismo de control de sesión dinámico ocurrirían los siguientes problemas críticos de seguridad y operación:
1. **Pedidos fantasma externos:** Cualquier cliente que haya fotografiado el QR o guardado la URL en el navegador de su teléfono podría, desde su casa o la calle, enviar pedidos a esa mesa física.
2. **Contaminación entre clientes consecutivos:** Si una pareja abandona la mesa 4 a las 2:00 PM y un nuevo grupo se sienta a las 2:15 PM, los comensales anteriores aún tendrían la sesión abierta en su teléfono y podrían accidentalmente agregar productos a la cuenta del nuevo grupo.
3. **Bloqueo preventivo:** Mientras una mesa esté libre (`status: FREE`), el backend bloquea cualquier intento de pedido público con el error `TABLE_ACCOUNT_NOT_OPEN`.

### 6.2 Ciclo de Vida del PIN de Sesión
1. **Apertura de Mesa por el Personal:**
   - Cuando los clientes llegan a la mesa, el mesero o capitán hace clic en **"Abrir Mesa"** en el plano de salón (`/dining`), ingresa el número de comensales y el backend genera un PIN criptográficamente seguro de 4 dígitos (ej. `4821`), almacenado en `dining_accounts.table_session_pin`.
2. **Uso por parte de los Comensales (Autopedido QR):**
   - Los comensales escanean el QR físico de la mesa.
   - Al momento de enviar su pedido (`DINE_IN`), la aplicación web del cliente solicita el **PIN de Mesa de 4 dígitos**.
   - El mesero proporciona verbalmente el PIN o los comensales lo consultan en la pre-cuenta impresa o pantalla de asistencia.
   - Sin el PIN correcto, el backend rechaza la comanda pública con `403 Forbidden` (`INVALID_TABLE_PIN`).
3. **Cierre de la Cuenta y Expiración:**
   - Una vez que la mesa paga la cuenta y se ejecuta el cierre en caja (`status: CLOSED`), el PIN expira de inmediato.
   - El siguiente cliente que ocupe la mesa recibirá un PIN completamente nuevo y diferente.

### 6.3 Flujo del Mesero: Toma Directa de Comandas en la Mesa (`+ Comanda`)
El mesero no requiere ingresar ningún PIN porque ya se encuentra autenticado con su rol operativo institucional (`WAITER`):
1. **Apertura y Comanda Inmediata en 1 Paso:**
   - Al presionar **"Abrir Mesa"**, la ventana de éxito presenta dos opciones:
     - `Tomar Comanda Inmediatamente`: Abre directamente la interfaz de selección de platos.
     - `Volver al Salón`: Mantiene la mesa abierta para autopedido de los comensales.
2. **Acceso Rápido desde el Plano de Salón:**
   - Para cualquier mesa ocupada (`OCCUPIED`), el mesero puede:
     - Hacer clic en el botón naranja **`+ Comanda`**, o
     - Tocar directamente sobre la tarjeta de la mesa en su tablet o pantalla móvil.
3. **Selección de Menú y Envío:**
   - El modal `WaiterOrderModal` consulta las categorías y productos activos mediante el permiso `catalog:read`.
   - Permite agregar productos base o variantes, incrementar/disminuir cantidades y añadir notas de cocina (ej. *"Término 3/4, salsa aparte"*).
   - Al pulsar **"Enviar Comanda a Cocina"**, se despacha la orden vía `POST /api/v1/accounts/:id/orders`.
   - Se imprimen/emiten los tickets al KDS de cocina en tiempo real vía eventos SSE (`kitchen.order_created`) y se actualiza el saldo consolidado de la mesa.
4. **Validación de Concurrencia Optimista:**
   - La cuenta de salón maneja un contador de versión atómica (`version: Int`).
   - Si dos meseros o un mesero y la caja interactúan simultáneamente, el sistema detecta conflictos mediante `expected_account_version` y refresca el estado sin sobrescribir información.

---

### 6.4 Gestión de Portamesas QR Físicos, Previsualización e Impresión Limpia

Para evitar que la opción de impresión capture toda la interfaz administrativa del sistema (problema identificado donde se imprimía la cuadrícula del panel sin el código QR):

1. **Auto-generación Defensiva de Códigos QR de Mesa (`dining.service.ts`):**
   - En `listTablesAdmin`, el backend verifica que cada mesa física cuente con un registro en `qr_code_links` con `target_type: 'DINING_TABLE'`.
   - Si una mesa carece de enlace QR activo, el sistema genera automáticamente un token opaco criptográfico de 256 bits (`randomBytes(32).toString('hex')`) y lo vincula a la mesa.
2. **Modal Interactivo de Portamesas (`DiningAdminSettings.tsx`):**
   - Al hacer clic en **"Portamesa"** desde la pestaña de mesas o en **"Ver & Imprimir Portamesa"** desde la pestaña de portamesas:
     - Se abre un modal emergente que previsualiza el diseño exacto del acrílico físico (10x15 cm).
     - Incluye el logo de la marca, nombre del ambiente, número grande de mesa (ej. *Mesa M-01*), código QR en alta definición, instrucciones para el comensal y la URL pública de respaldo.
3. **Motor de Impresión Aislado mediante Ventana / Iframe Dedicado:**
   - Para erradicar cualquier artefacto de la interfaz SPA en el cuadro de diálogo de impresión del navegador, se implementó la función `handlePrintStand(table)`:
     - Genera un documento HTML puro en una ventana emergente de impresión con hoja estándar A6 retrato (`@page { size: A6 portrait; margin: 0; }`).
     - Inserta directamente el vector SVG de alta resolución del código QR, encabezado institucional, número de mesa y líneas de corte para guillotina o taller de acrílico.
     - Dispara de forma automática `print()` sin incluir ningún elemento DOM del panel administrativo.
4. **Descarga de Alta Resolución en PNG (1200 x 1600 px):**
   - Opción de descarga directa en formato PNG con canvas de alta definición a 300 DPI equivalentes, idóneo para imprentas digitales.

---

### 6.5 Aislamiento Estricto de Carrito: Mesa Física vs Menú Público (Takeout / Domicilio)

#### Causa Raíz Identificada
El store de carrito (`useCartStore`) persistía los ítems en `localStorage` utilizando una clave genérica `${restaurantSlug}/${branchSlug}`. Como consecuencia:
- Un usuario que probaba o realizaba un pedido de domicilio a las 11:00 AM guardaba sus ítems en esa clave.
- Cuando ese mismo usuario o navegador escaneaba el código QR de la **Mesa M-01** en el restaurante físico a la 1:00 PM, el sistema leía la misma clave y **cargaba los productos del domicilio anterior dentro de la mesa física**.
- Asimismo, un comensal que salía de la mesa y luego abría la tienda pública para pedir a domicilio se encontraba con los productos de su almuerzo en el salón.

#### Arquitectura de Claves Segregadas por Contexto Operativo
En `StorefrontPage.tsx`, la clave de almacenamiento (`storeKey`) se calcula dinámicamente según la modalidad:
```typescript
const isTableQr = Boolean(qrToken && (qrData ? qrData.target_type === 'DINING_TABLE' : true));

const storeKey = useMemo(() => {
  const branchPart = currentBranch?.slug || 'branch';
  if (isTableQr && qrToken) {
    // Clave aislada para la mesa física
    const tablePart = qrData?.table_id ? `table-${qrData.table_id}` : `qr-${qrToken.slice(0, 16)}`;
    return `${restaurantSlug}/${branchPart}/${tablePart}`;
  }
  // Clave aislada para la tienda pública de domicilio / recogida
  return `${restaurantSlug}/${branchPart}/takeout`;
}, [restaurantSlug, currentBranch?.slug, isTableQr, qrToken, qrData?.table_id]);
```

**Garantías Operativas Logradas:**
1. **Inmunidad Total:** El carrito de la mesa física nace 100 % limpio y aislado, sin importar qué pedidos previos existan en el dispositivo.
2. **Aislamiento Inter-Mesa:** La Mesa M-01 y la Mesa M-02 manejan claves completamente independientes; nunca comparten productos ni estados.
3. **Acción de Vaciado Rápido:** Se añadió un botón accesible de `"Vaciar carrito"` con confirmación en el cajón lateral para permitir reiniciar la comanda en cualquier momento.

---

### 6.6 Bloqueo Inquebrantable de Sucursal y Modalidad en QR de Salón

#### Problema Detectado
En la vista pública compartida del menú, los clientes con QR de mesa visualizaban el enlace `"Otras Sedes:"`. Al hacer clic en otra sucursal, el navegador navegaba a `/r/:slug/b/:otraSede`, eliminando el parámetro `?qr=...`, con lo cual **el comensal perdía irreversiblemente la vinculación de su mesa física**. Además, en el modal de checkout se presentaban pestañas para pedir domicilio o para llevar a comensales sentados en la sala.

#### Solución e Implementación

| Aspecto | Modo Salón (Mesa Física con QR) | Modo Menú Público (Sin Mesa / Domicilio) |
|---|---|---|
| **Detección** | Parámetro `?qr=...` con `target_type: 'DINING_TABLE'`. | Navegación a `/r/:slug` sin parámetro QR de mesa. |
| **Sucursal Activa** | **BLOQUEADA** rígidamente a `qrData.branch_slug`. No se permite cambiar de sede. | Navegación libre entre todas las sucursales del restaurante. |
| **Selector de Sedes** | **OCULTO**. Se sustituye por un badge fijo de salón: `🍽️ Mesa M-01 • Sede Gourmet [Atención en Mesa]`. | **VISIBLE** si el restaurante tiene más de una sucursal activa. |
| **Modalidad en Checkout** | **BLOQUEADA a `DINE_IN`**. Sin pestañas ni opciones de Domicilio o Para Llevar. | Solo ofrece **`DELIVERY`** (Domicilio) y **`PICKUP`** (Para Llevar). `DINE_IN` no se ofrece. |
| **Datos Solicitados** | Nombre, WhatsApp y PIN de mesa (4 dígitos). Sin dirección ni tarifa de envío. | Dirección completa, barrio, zona de cobertura y costo de domicilio. |
| **Botón en Cajón de Carrito** | `"Enviar comanda a la mesa"` con icono de cubiertos. | `"Continuar con el pedido"` con icono de envío. |
| **Destino de la Orden** | Comanda enviada al mesero y al KDS de cocina; seguimiento en vivo de la mesa. | Pedido registrado para despacho y enlace directo a WhatsApp de la sucursal. |

---

### 6.7 Verificación Automatizada (Tests Unitarios y E2E Playwright)

Se agregaron pruebas unitarias en `apps/web/test/TC-POST06-ROLES-BRANCHES.spec.ts` que validan formalmente:
1. Generación de claves de carrito independientes para Salón (`table-...`) vs Domicilio (`takeout`).
2. Aislamiento estricto de almacenamiento entre diferentes mesas y sedes.
3. Forzado y bloqueo inquebrantable de sucursal bajo QR de salón.
4. Ocultamiento del selector de sedes cuando el comensal está en salón físico.
5. Exclusividad de la modalidad `DINE_IN` en checkout cuando existe `tableQrInfo`.

Total de pruebas del monorepo: **204 pruebas unitarias e integrales en verde (100 % de éxito)**.

---

## 7. Manuales Operativos y Guías de Flujo por Rol

Para facilitar la adopción, inducción de personal y entendimiento del producto, se han creado los siguientes documentos dedicados con diagramas de secuencia Mermaid, pasos operativos e imágenes de referencia:

1. [**Manual Operativo: Salón, Mesas y Toma de Comandas (Rol de Mesero)**](./MANUAL_OPERATIVO_MESERO_SALON_Y_COMANDAS.md):
   - Aislamiento de sucursal e interfaz protegida para el mesero (sin acceso a cartas administrativas).
   - Ciclo de vida de mesas (`FREE` $\rightarrow$ `OCCUPIED` $\rightarrow$ `PENDING_PAYMENT` $\rightarrow$ `CLOSED`).
   - Apertura de mesa física y generación del PIN dinámico de 4 dígitos.
   - Toma directa de comandas en mesa con el modal táctil (`+ Comanda` / `WaiterOrderModal`).
   - Acompañamiento en el autopedido de comensales y entrega del PIN.
   - Consulta de pre-cuenta y distribución informativa del consumo por persona (`dining.consumption_split`).

2. [**Guía del Comensal: Autopedido QR en Mesa Física vs Menú Digital para Domicilios**](./MANUAL_CLIENTE_AUTOPEDIDO_QR_Y_EXPERIENCIA_MESA.md):
   - Escaneo y resolución transparente del portamesas acrílico (`/q/:qrToken`).
   - Detección y bloqueo inquebrantable de sede y mesa (ocultamiento de *"Otras Sedes"*).
   - Aislamiento total de carrito (inicio limpio e inmune a pedidos anteriores o a domicilio).
   - Personalización del plato, selección de variantes y notas para cocina.
   - Checkout de mesa con PIN de 4 dígitos y sin campos innecesarios (sin fletes ni direcciones).
   - Comparativa detallada con el flujo de Domicilio / Para Llevar desde el hogar.




