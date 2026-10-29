# Casos de Prueba Exhaustivos y Criterios de Aceptación — Karta (Fase 01)

**Documento:** `CASOS_DE_PRUEBA_FASE_01_KARTA.md`  
**Versión del Sistema:** 2.4.0 — Ecosistema Karta SaaS  
**Base de Datos Objetivo:** `acasoft-karta-saas` (PostgreSQL 17.5 localhost)  
**Fecha de Emisión:** 2026-10-28  
**Cobertura:** Núcleo Multi-tenant, Aislamiento RLS, Autenticación Argon2id + Dual JWT, Capacidades Atómicas, Políticas de Canal, Configuración de Marca, Onboarding Colombiano, Resiliencia Visual y Frontend React.

---

## 1. Entorno de Pruebas y Precondiciones

Antes de iniciar la ejecución de los casos de prueba, verificar el estado operativo del entorno:

| Componente | Especificación / Valor | Verificación |
| :--- | :--- | :--- |
| **Motor de Base de Datos** | PostgreSQL 17.5 en `localhost:5432` | Base de datos `acasoft-karta-saas` creada |
| **API Backend (NestJS)** | `http://localhost:4000/api/v1` | Sonda `GET /api/v1/health` responde `200 OK` |
| **Frontend Web (Vite + React)** | `http://localhost:5173` | Carga sin errores de consola |
| **Organización de Demostración** | *Karta Gastronomía & Bistro* | Creada vía seed en `acasoft-karta-saas` |
| **Sede Principal Activa** | *Sede Gourmet Zona G* (slug: `zona-g`) | Vinculada al tenant principal |
| **Usuario Administrador Principal** | `admin@karta.co` / `Password123!` | Rol: `TENANT_ADMIN`, Plan: `PLAN_OPERATIONS_PRO` |

---

## 2. Matriz General de Casos de Prueba

| Módulo / Categoría | ID Caso | Nombre del Escenario | Tipo de Prueba | Severidad |
| :--- | :--- | :--- | :--- | :--- |
| **1. Autenticación & UI Split-Screen** | `CP-KARTA-AUTH-01` | Renderizado de Interfaz Split-Screen con Hero Gastronómico | UI / Visual | Crítica |
| | `CP-KARTA-AUTH-02` | Relleno Rápido de Credenciales Demo (⚡ Botón de 1 Clic) | Funcional UI | Alta |
| | `CP-KARTA-AUTH-03` | Autenticación Exitosa y Generación de Tokens (JWT + Cookie HttpOnly) | Seguridad / API | Crítica |
| | `CP-KARTA-AUTH-04` | Bloqueo por Credenciales Inválidas y Manejo de Errores | Seguridad / API | Alta |
| | `CP-KARTA-AUTH-05` | Forzar Cambio de Contraseña Inicial (`PASSWORD_CHANGE_REQUIRED`) | Flujo de Seguridad | Crítica |
| | `CP-KARTA-AUTH-06` | Aceptación de Invitación de Personal por Enlace WhatsApp | Funcional / API | Crítica |
| | `CP-KARTA-AUTH-07` | Rotación de Refresh Token y Cierre de Sesión Seguro | Seguridad / API | Alta |
| **2. Resiliencia & Panel Dashboard** | `CP-KARTA-DASH-01` | Estabilidad del Dashboard sin Pantalla en Blanco (Mapeo Paginado) | Resiliencia UI | Crítica |
| | `CP-KARTA-DASH-02` | Contención de Fallos en Renderizado con `ErrorBoundary` | Resiliencia UI | Alta |
| | `CP-KARTA-DASH-03` | Sincronización de Capacidades y Conteo de Módulos Activos | Lógica / UI | Media |
| **3. Asistente de Onboarding** | `CP-KARTA-ONB-01` | Paso 1: Configuración de Marca y Sede con Previsualización en Vivo | Funcional UI | Alta |
| | `CP-KARTA-ONB-02` | Paso 2: Aplicación Atómica de Perfil Operativo Gastronómico | Lógica / API | Crítica |
| | `CP-KARTA-ONB-03` | Paso 3: Configuración de Medios de Pago Locales (Nequi, DaviPlata, Bre-B) | Negocio / API | Crítica |
| | `CP-KARTA-ONB-04` | Finalización del Onboarding y Persistencia en Base de Datos | E2E / Integración | Alta |
| **4. Multitenancy & Aislamiento RLS** | `CP-KARTA-RLS-01` | Inyección Maliciosa de `tenant_id` en Cuerpo o Query | Seguridad / RLS | Crítica |
| | `CP-KARTA-RLS-02` | Concurrencia Cruzada en Pool de Conexiones (Aislamiento Total) | Estrés / RLS | Crítica |
| | `CP-KARTA-RLS-03` | Restricción de Alcance de Sucursal por Rol (`branch_scope`) | Autorización RBAC | Alta |
| **5. Motor de Capacidades y Flags** | `CP-KARTA-CAP-01` | Bloqueo de Endpoint Backend con `@RequireModule` | Seguridad / API | Crítica |
| | `CP-KARTA-CAP-02` | Protección de Ruta en Frontend con `<CapabilityRoute />` | UI / Navegación | Alta |
| | `CP-KARTA-CAP-03` | Validación Atómica de Dependencias (`validateModuleSetAtomically`) | Integridad / Lógica | Alta |
| | `CP-KARTA-CAP-04` | Bloqueo de Módulos no Permitidos por el Plan (`PLAN_UPGRADE_REQUIRED`) | Modelo de Negocio | Alta |
| **6. Auditoría y Trazabilidad** | `CP-KARTA-AUD-01` | Registro Inmutable de Eventos de Auditoría ante Modificaciones | Trazabilidad / DB | Alta |
| | `CP-KARTA-AUD-02` | Consulta Paginada de Auditoría con Límite y Cursor | API / Paginación | Media |

---

## 3. Especificación Detallada de los Casos de Prueba

```
================================================================================
CATEGORÍA 1: AUTENTICACIÓN, BRANDING Y UI SPLIT-SCREEN
================================================================================
```

### `CP-KARTA-AUTH-01`: Renderizado de Interfaz Split-Screen con Hero Gastronómico
* **Objetivo:** Verificar que la pantalla de inicio de sesión respete la distribución de diseño solicitada (Split-Screen 50/50) con la fotografía gastronómica de alta definición en la izquierda y la tarjeta de autenticación estilizada en la derecha.
* **Prerrequisitos:** Navegador web estándar (Chrome, Edge o Firefox). Servidor web corriendo en `http://localhost:5173`.
* **Pasos de Ejecución:**
  1. Abrir el navegador e ingresar a la URL `http://localhost:5173/login`.
  2. Verificar la columna izquierda:
     - Debe ocupar aproximadamente el 50 % del ancho en pantallas medianas y grandes (`md:flex md:w-1/2`).
     - Debe contener la imagen `/images/karta-hero.jpg` visible, con overlay degradado cálido.
     - Debe exhibir los distintivos de marca: *"Karta — Sistema Operativo Gastronómico"* y pills de capacidades (`Salón y Mesas`, `Comandas KDS`, `Domicilios`).
  3. Verificar la columna derecha:
     - Tarjeta con fondo blanco marfil (`bg-white/95`) y sombra suave sobre fondo cálido (`bg-stone-50`).
     - Selector de pestañas: `Iniciar Sesión` y `Registrarse`.
     - Campos de formulario: `Correo Electrónico` y `Contraseña`.
     - Botón principal de acceso y botón secundario `⚡ Cargar Datos Demo`.
* **Resultado Esperado:** 
  - La página se renderiza completamente sin pantallas en blanco ni destellos oscuros.
  - La paleta es cálida (terracota `#ea580c`, ámbar `#f59e0b` y piedra `#fafaf9`).

---

### `CP-KARTA-AUTH-02`: Relleno Rápido de Credenciales Demo (⚡ Botón de 1 Clic)
* **Objetivo:** Confirmar que el botón de carga demo asigne de forma inmediata las credenciales válidas creadas durante el seed inicial.
* **Prerrequisitos:** Estar en `http://localhost:5173/login`.
* **Pasos de Ejecución:**
  1. Verificar que los inputs de correo y contraseña se encuentren vacíos inicialmente.
  2. Hacer clic en el botón `⚡ Cargar Datos Demo`.
* **Resultado Esperado:**
  - El campo de correo electrónico se llena automáticamente con: `admin@karta.co`.
  - El campo de contraseña se llena automáticamente con: `Password123!`.
  - El botón de inicio de sesión queda listo para ser enviado sin requerir entrada manual.

---

### `CP-KARTA-AUTH-03`: Autenticación Exitosa y Generación de Tokens (JWT + Cookie HttpOnly)
* **Objetivo:** Validar que al enviar credenciales válidas, el backend verifique el hash Argon2id, genere el Access Token JWT de corta duración y establezca la cookie de refresco HttpOnly.
* **Prerrequisitos:** Base de datos `acasoft-karta-saas` con el usuario seed activo.
* **Pasos de Ejecución (Automatizado vía Terminal):**
  ```powershell
  $body = @{
    email = "admin@karta.co"
    password = "Password123!"
  } | ConvertTo-Json

  $response = Invoke-WebRequest -Uri "http://localhost:4000/api/v1/auth/session" `
    -Method Post `
    -Body $body `
    -ContentType "application/json"
  ```
* **Resultado Esperado:**
  - Código HTTP: `200 OK`.
  - Cuerpo de respuesta JSON contiene:
    - `accessToken`: String JWT decodificable con payload `{ sub, email, tenantId, roles, branchScope }`.
    - `user`: Objeto con `id`, `email: "admin@karta.co"`, `name: "Administrador Karta"`, `mustChangePassword: false`.
  - Encabezados de respuesta (`Set-Cookie`):
    - Cookie `refreshToken` presente con directivas `HttpOnly; SameSite=Lax; Path=/api/v1/auth`.

---

### `CP-KARTA-AUTH-04`: Bloqueo por Credenciales Inválidas y Manejo de Errores
* **Objetivo:** Verificar que el sistema rechace combinaciones de credenciales erróneas sin revelar si el correo existe o no, evitando fugas de enumeración.
* **Pasos de Ejecución:**
  ```powershell
  $badBody = @{
    email = "admin@karta.co"
    password = "ClaveIncorrecta999!"
  } | ConvertTo-Json

  try {
    Invoke-RestMethod -Uri "http://localhost:4000/api/v1/auth/session" -Method Post -Body $badBody -ContentType "application/json"
  } catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errorJson = $_.ErrorDetails.Message | ConvertFrom-Json
  }
  ```
* **Resultado Esperado:**
  - Código HTTP: `401 Unauthorized`.
  - Código de error JSON: `{ errorCode: "INVALID_CREDENTIALS", message: "Credenciales de acceso inválidas." }`.
  - En la interfaz web, se despliega una alerta con fondo rojizo suave (`bg-rose-50 text-rose-700`) indicando el error de autenticación.

---

### `CP-KARTA-AUTH-05`: Forzar Cambio de Contraseña Inicial (`PASSWORD_CHANGE_REQUIRED`)
* **Objetivo:** Comprobar que un usuario creado con clave temporal (`must_change_password = true`) tenga bloqueada la operación regular hasta que complete el flujo de actualización de clave.
* **Pasos de Ejecución:**
  1. Crear un usuario temporal con el rol `WAITER` y `must_change_password = true` mediante la API de administración.
  2. Iniciar sesión con las credenciales de dicho usuario temporal.
  3. Intentar realizar una petición a un endpoint operativo protegido (ej. `GET /api/v1/admin/modules`).
  4. Ejecutar el cambio de clave en `POST /api/v1/auth/change-password` enviando la clave actual y la nueva contraseña (mínimo 8 caracteres).
* **Resultado Esperado:**
  - El paso 3 responde HTTP `403 Forbidden` con `{ errorCode: "PASSWORD_CHANGE_REQUIRED" }`.
  - En el frontend web, el usuario es redirigido automáticamente a la ruta `/change-password`.
  - Tras completar el paso 4, la respuesta es HTTP `200 OK`, el flag `must_change_password` en base de datos pasa a `false`, y el usuario puede navegar a `/dashboard`.

---

### `CP-KARTA-AUTH-06`: Aceptación de Invitación de Personal por Enlace WhatsApp
* **Objetivo:** Validar el enrolamiento de personal operativo sin depender de servidores SMTP de correo, mediante token único de invitación.
* **Pasos de Ejecución:**
  1. Como Administrador, generar un enlace de invitación para un cajero:
     - `POST /api/v1/admin/users` con `{ name: "Cajero Principal", role: "CASHIER", email: "cajero@karta.co" }`.
     - La respuesta debe incluir `whatsapp_invite_url: "https://wa.me/...?text=...token=TOKEN_UUID"`.
  2. En el navegador, abrir `http://localhost:5173/auth/accept-invite?token=TOKEN_UUID`.
  3. Ingresar y confirmar una nueva contraseña de al menos 8 caracteres.
  4. Enviar el formulario.
* **Resultado Esperado:**
  - La interfaz de aceptación de invitación muestra el mensaje de bienvenida y el formulario de contraseña en estilo Karta.
  - El endpoint `POST /api/v1/auth/accept-invite` responde HTTP `200 OK`.
  - La pantalla confirma: *"Cuenta Activada con Éxito"* y ofrece el botón directo a *Iniciar Sesión*.

---

```
================================================================================
CATEGORÍA 2: RESILIENCIA Y PANEL DASHBOARD
================================================================================
```

### `CP-KARTA-DASH-01`: Estabilidad del Dashboard sin Pantalla en Blanco (Mapeo Paginado)
* **Objetivo:** Verificar de forma estricta que la página `/dashboard` permanezca visible y estable tras recibir la respuesta de eventos de auditoría (`{ items: [...], nextCursor: ... }`).
* **Prerrequisitos:** Sesión iniciada como `admin@karta.co`.
* **Pasos de Ejecución:**
  1. Ingresar a `http://localhost:5173/dashboard`.
  2. Mantener la página abierta durante al menos 15 segundos continuos.
  3. Abrir la consola de herramientas de desarrollo (F12) y verificar que no existan errores del tipo `TypeError: auditEvents.map is not a function`.
  4. Recargar forzadamente con `Ctrl + F5` 3 veces seguidas.
* **Resultado Esperado:**
  - El dashboard NO experimenta pantalla en blanco en ningún momento.
  - Se visualiza el banner superior con el hero gastronómico, el saludo al usuario y el perfil activo (`FULL_PANEL`).
  - Las 4 tarjetas KPI muestran los valores correctos (Módulos Activos, Perfil, Canales y Estado RLS).
  - La tabla inferior de trazabilidad muestra los eventos o el estado vacío: *"No se han registrado eventos recientes en esta sucursal."* sin fallar.

---

### `CP-KARTA-DASH-02`: Contención de Fallos en Renderizado con `ErrorBoundary`
* **Objetivo:** Demostrar que ante una excepción no capturada de React en cualquier componente hijo, el componente `ErrorBoundary` previene que toda la aplicación colapse a blanco.
* **Pasos de Ejecución:**
  1. Inspeccionar la presencia de `<ErrorBoundary>` envolviendo las rutas en [apps/web/src/App.tsx](file:///c:/AcaSoft/aca-restaurant-saas/apps/web/src/App.tsx).
  2. En caso de simular un error de renderizado en un componente hijo:
* **Resultado Esperado:**
  - Se despliega una interfaz de recuperación limpia con el ícono de alerta cálido, el mensaje *"Algo no salió como esperábamos"* y un botón para *"Recargar Karta"*.
  - La pantalla en blanco queda completamente neutralizada.

---

```
================================================================================
CATEGORÍA 3: ASISTENTE DE ONBOARDING (CONFIGURACIÓN INICIAL)
================================================================================
```

### `CP-KARTA-ONB-01`: Paso 1: Configuración de Marca y Sede con Previsualización en Vivo
* **Objetivo:** Verificar la personalización visual de la marca y la actualización interactiva en tiempo real del componente de previsualización.
* **Pasos de Ejecución:**
  1. Navegar a `http://localhost:5173/onboarding`.
  2. En el Paso 1 (*Marca & Sede*):
     - Modificar el nombre comercial a: `"Karta Bistro Zona Rosa"`.
     - Cambiar el color primario a través del selector de color a `#d97706` (ámbar intenso).
     - Cambiar el color secundario a `#059669` (esmeralda).
     - Ingresar dirección: `"Calle 85 # 11-53"` y WhatsApp: `"3109876543"`.
  3. Observar la tarjeta de *Previsualización de marca en vivo*.
* **Resultado Esperado:**
  - El avatar circular de la marca actualiza su color de fondo a `#d97706` y muestra la letra inicial `"K"`.
  - El botón de prueba *"Pedir por WhatsApp"* adopta el color `#059669`.
  - El nombre de la marca se actualiza reactivamente a *"Karta Bistro Zona Rosa"*.

---

### `CP-KARTA-ONB-02`: Paso 2: Aplicación Atómica de Perfil Operativo Gastronómico
* **Objetivo:** Validar la selección y configuración de perfiles operativos (`LIGHT_OPERATOR`, `FAST_FOOD_COUNTER`, `FULL_PANEL`, `KITCHEN_HEAVY`, `BAR_ONLY`).
* **Pasos de Ejecución:**
  1. En el Asistente de Onboarding, hacer clic en `Siguiente Paso` para pasar al Paso 2 (*Perfil Operativo*).
  2. Hacer clic sobre la tarjeta de `LIGHT_OPERATOR` (Operación Liviana Domicilios y Pickup).
  3. Verificar el resumen informativo inferior.
  4. Seleccionar `FULL_PANEL` (Restaurante Completo).
* **Resultado Esperado:**
  - La tarjeta seleccionada se resalta con borde terracota, fondo cálido y check verde de selección.
  - El cuadro de resumen muestra la cantidad de módulos habilitados por el perfil y la política de cobro por defecto.

---

### `CP-KARTA-ONB-03`: Paso 3: Configuración de Medios de Pago Locales (Nequi, DaviPlata, Bre-B)
* **Objetivo:** Comprobar la captura de los medios de transferencia digital colombianos interoperables de bajo monto para pedidos por WhatsApp y carta digital.
* **Pasos de Ejecución:**
  1. Avanzar al Paso 3 (*Métodos de Pago*).
  2. Ingresar:
     - Cuenta Nequi: `"3001234567"`
     - Cuenta DaviPlata: `"3157654321"`
     - Llave Bre-B del Banco de la República: `"NIT-901234567-1"`
     - Instrucciones para el comensal: `"Por favor enviar comprobante de pago por WhatsApp con el número de pedido para iniciar preparación."`
  3. Hacer clic en `Finalizar y Comenzar a Operar`.
* **Resultado Esperado:**
  - El botón muestra el spinner de carga mientras se ejecutan las llamadas `PATCH /admin/brand` y `PATCH /admin/branches/:branchId/channel-policies/:channel`.
  - El sistema redirige automáticamente al usuario al `/dashboard`.

---

### `CP-KARTA-ONB-04`: Persistencia del Onboarding en Base de Datos PostgreSQL
* **Objetivo:** Verificar a nivel de base de datos que los datos configurados en el Onboarding se hayan persistido en las tablas correspondientes de `acasoft-karta-saas`.
* **Pasos de Ejecución (SQL):**
  ```sql
  -- Verificar BrandSettings
  SELECT display_name, primary_color, secondary_color, receipt_footer_text 
  FROM brand_settings 
  WHERE tenant_id = 'b76c36d6-063d-4f8d-afb0-ca7c135c4f08';

  -- Verificar políticas de pago en los canales DELIVERY y PICKUP
  SELECT channel, payment_policy, require_payment_before_preparation, payment_instructions_json 
  FROM branch_channel_policies 
  WHERE branch_id = (SELECT id FROM branches WHERE slug = 'zona-g');
  ```
* **Resultado Esperado:**
  - `brand_settings` contiene los colores y el nombre guardados.
  - `branch_channel_policies` para `DELIVERY` y `PICKUP` contiene `payment_policy = 'OFFLINE_ONLY'` y en `payment_instructions_json` están almacenados los teléfonos de Nequi, DaviPlata y la llave Bre-B.

---

```
================================================================================
CATEGORÍA 4: MULTITENANCY Y AISLAMIENTO ROW-LEVEL SECURITY (RLS)
================================================================================
```

### `CP-KARTA-RLS-01`: Inyección Maliciosa de `tenant_id` en Cuerpo o Query
* **Objetivo:** Demostrar que un atacante autenticado en el *Restaurante A* no puede consultar ni modificar datos del *Restaurante B*, aun inyectando deliberadamente el `tenant_id` del Restaurante B en el JSON o query params.
* **Prerrequisitos:** Existencia de dos tenants en la base de datos (`tenant_A` y `tenant_B`).
* **Pasos de Ejecución:**
  1. Obtener JWT para usuario del `tenant_A`.
  2. Enviar petición `GET /api/v1/admin/branches` con header `Authorization: Bearer <token_A>` y parámetro query `?tenantId=<id_tenant_B>`.
  3. Enviar petición `PATCH /api/v1/admin/brand` con header de `tenant_A` pero enviando en el body `{ tenant_id: "<id_tenant_B>", display_name: "Hackeado" }`.
* **Resultado Esperado:**
  - La petición 2 devuelve única y exclusivamente las sucursales pertenecientes a `tenant_A`.
  - La petición 3 modifica el registro de `tenant_A`; el registro de `tenant_B` en `brand_settings` permanece intacto e inmutable.
  - El backend toma el `tenantId` exclusivamente de la firma criptográfica verificada del JWT (`req.user.tenantId`).

---

### `CP-KARTA-RLS-02`: Concurrencia Cruzada en Pool de Conexiones (Aislamiento Total)
* **Objetivo:** Ejecutar la suite de pruebas de estrés `rls-concurrency.e2e-spec.ts` enviando 30 peticiones concurrentes simultáneas al pool de conexiones compartido entre dos restaurantes independientes.
* **Pasos de Ejecución:**
  ```powershell
  pnpm --filter @restaurante-saas/api test test/rls-concurrency.e2e-spec.ts
  ```
* **Resultado Esperado:**
  - Las 30 transacciones concurrentes se completan en menos de 3000 ms.
  - 0 % de fuga de datos entre conexiones.
  - Cada conexión interactiva ejecuta `SELECT set_config('app.current_tenant_id', $1, true)` dentro de la transacción, garantizando que al reciclarse la conexión al pool, la variable local quede descartada.

---

### `CP-KARTA-RLS-03`: Restricción de Alcance de Sucursal por Rol (`branch_scope`)
* **Objetivo:** Validar que un administrador de sede (`BRANCH_MANAGER`) asignado exclusivamente a la *Sede 1* reciba rechazo `403 Forbidden` si intenta operar sobre la *Sede 2* del mismo restaurante.
* **Pasos de Ejecución:**
  1. Crear un usuario con rol `BRANCH_MANAGER` con `branch_scope = ["ID_SEDE_1"]`.
  2. Autenticarse como dicho usuario.
  3. Enviar `PATCH /api/v1/admin/branches/ID_SEDE_2/modules` intentando alterar sus módulos activos.
* **Resultado Esperado:**
  - Código HTTP: `403 Forbidden`.
  - Mensaje de error: `{ errorCode: "BRANCH_ACCESS_DENIED", message: "No tiene permisos para administrar la sucursal especificada." }`.

---

```
================================================================================
CATEGORÍA 5: MOTOR DE CAPACIDADES Y FEATURE FLAGS ATÓMICOS
================================================================================
```

### `CP-KARTA-CAP-01`: Bloqueo de Endpoint Backend con `@RequireModule`
* **Objetivo:** Verificar que el guard `ModuleCapabilityGuard` bloquee el acceso a cualquier endpoint perteneciente a un módulo desactivado en la sucursal activa.
* **Pasos de Ejecución:**
  1. Asegurar que el módulo `dining` (Salón y Mesas) se encuentre desactivado (`false`) para la sucursal activa.
  2. Enviar una petición a un endpoint decorado con `@RequireModule('dining')`.
* **Resultado Esperado:**
  - Código HTTP: `403 Forbidden`.
  - JSON de respuesta:
    ```json
    {
      "statusCode": 403,
      "errorCode": "MODULE_DISABLED",
      "moduleKey": "dining",
      "message": "El módulo 'dining' se encuentra desactivado para esta sucursal."
    }
    ```

---

### `CP-KARTA-CAP-02`: Protección de Ruta en Frontend con `<CapabilityRoute />`
* **Objetivo:** Confirmar que la aplicación frontend bloquee la vista o redirija al comensal/operador cuando intente acceder por URL a un módulo inactivo.
* **Pasos de Ejecución:**
  1. Con el módulo `dining` inactivo, ingresar en el navegador a `http://localhost:5173/dining`.
* **Resultado Esperado:**
  - El componente `<CapabilityRoute moduleKey="dining">` intercepta la carga.
  - En lugar de la vista operativa de mesas, muestra la pantalla de aviso de módulo inactivo con botón para regresar al Dashboard o solicitar activación al administrador.

---

### `CP-KARTA-CAP-03`: Validación Atómica de Dependencias (`validateModuleSetAtomically`)
* **Objetivo:** Comprobar que el motor de capacidades impida configuraciones rotas validando dependencias cruzadas (ej. no se puede activar `dining.consumption_split` sin tener activo `dining`).
* **Pasos de Ejecución:**
  1. Enviar una petición `PATCH /api/v1/admin/modules`:
     ```json
     {
       "modules": [
         { "key": "dining", "enabled": false },
         { "key": "dining.consumption_split", "enabled": true }
       ]
     }
     ```
* **Resultado Esperado:**
  - Código HTTP: `400 Bad Request`.
  - Mensaje de validación: `{ errorCode: "MODULE_DEPENDENCY_ERROR", message: "El módulo 'dining.consumption_split' requiere que 'dining' esté habilitado." }`.
  - Ningún módulo cambia de estado en base de datos (atomicidad total).

---

### `CP-KARTA-CAP-04`: Bloqueo de Módulos no Permitidos por el Plan (`PLAN_UPGRADE_REQUIRED`)
* **Objetivo:** Verificar que un restaurante con un plan básico no pueda encender módulos reservados para planes avanzados.
* **Pasos de Ejecución:**
  1. Modificar temporalmente el plan del tenant a `PLAN_STARTER_DELIVERY` (que no incluye salón ni KDS pesado).
  2. Intentar activar el módulo `kitchen` o `dining` vía API.
* **Resultado Esperado:**
  - Código HTTP: `403 Forbidden`.
  - Mensaje: `{ errorCode: "PLAN_UPGRADE_REQUIRED", moduleKey: "dining", message: "El plan actual no incluye este módulo. Se requiere actualizar a un plan superior." }`.

---

```
================================================================================
CATEGORÍA 6: AUDITORÍA INMUTABLE Y TRAZABILIDAD
================================================================================
```

### `CP-KARTA-AUD-01`: Registro Inmutable de Eventos de Auditoría ante Modificaciones
* **Objetivo:** Comprobar que cualquier mutación crítica (cambio de marca, cambio de contraseña, activación de módulos o creación de usuarios) inserte una fila en `audit_events`.
* **Pasos de Ejecución:**
  1. Realizar una actualización de marca mediante `PATCH /api/v1/admin/brand`.
  2. Consultar directamente la tabla `audit_events` en PostgreSQL:
     ```sql
     SELECT id, action, entity_type, actor_id, occurred_at, metadata_json 
     FROM audit_events 
     ORDER BY occurred_at DESC 
     LIMIT 1;
     ```
* **Resultado Esperado:**
  - Fila generada con `action = 'UPDATE'`, `entity_type = 'BrandSettings'`.
  - `actor_id` coincide con el ID del usuario autenticado.
  - `metadata_json` contiene el detalle de las propiedades modificadas.
  - La fila es estrictamente de solo inserción (no se permiten sentencias `UPDATE` ni `DELETE` sobre esta tabla por política de auditoría).

---

### `CP-KARTA-AUD-02`: Consulta Paginada de Auditoría con Límite y Cursor
* **Objetivo:** Validar que el endpoint `GET /api/v1/admin/audit-events` soporte paginación estable basada en cursor y devuelva la estructura de respuesta `{ items: [...], nextCursor: string | null }`.
* **Pasos de Ejecución:**
  ```powershell
  $token = (Invoke-RestMethod -Uri "http://localhost:4000/api/v1/auth/session" -Method Post -Body '{"email":"admin@karta.co","password":"Password123!"}' -ContentType "application/json").accessToken

  $auditRes = Invoke-RestMethod -Uri "http://localhost:4000/api/v1/admin/audit-events?limit=2" `
    -Headers @{ Authorization = "Bearer $token" }
  ```
* **Resultado Esperado:**
  - Código HTTP: `200 OK`.
  - `$auditRes.items` es una colección con máximo 2 elementos.
  - Si existen más registros, `$auditRes.nextCursor` contiene un ID válido que permite realizar la siguiente consulta `?limit=2&cursor=...`.

---

## 4. Script de Ejecución Automatizada de la Suite de Pruebas

Para ejecutar el 100 % de las pruebas unitarias, de integración, tipo estricto y compilación en un solo comando, abrir PowerShell en la raíz del repositorio y ejecutar:

```powershell
# 1. Verificación Estricta de Tipos TypeScript (0 errores)
pnpm turbo run typecheck

# 2. Ejecución de Pruebas Unitarias y de Integración (Backend y Shared)
pnpm turbo run test

# 3. Compilación de Paquetes y Producción Web (Vite + Nest)
pnpm turbo run build
```

### Criterio de Éxito de la Puerta de Calidad:
- **`@restaurante-saas/shared`:** 5 tests unitarios aprobados.
- **`@restaurante-saas/api`:** 12 tests de integración y concurrencia RLS aprobados.
- **`@restaurante-saas/web`:** Bundle compilado en `dist/` en menos de 5 segundos sin advertencias de tipos.
- **Total de pruebas automatizadas:** 17/17 tests en verde (`exit code: 0`).
