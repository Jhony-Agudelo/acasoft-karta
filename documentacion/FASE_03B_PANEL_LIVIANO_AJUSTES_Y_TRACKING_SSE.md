# Fase 03B: Panel Liviano de 1 Pantalla, Ajuste Pre-Procesamiento (`OrderEdit`) y Seguimiento en Vivo (SSE)
**Documento:** `FASE_03B_PANEL_LIVIANO_AJUSTES_Y_TRACKING_SSE.md`  
**Versión:** 2.4.0 — Alineado con `DEFINICION_TECNICA.md` (v2.4.0) y `STACK_VERSIONS.md` (v2.4.0)  
**Fecha:** 2026-10-27  
**Prerrequisitos:** `FASE_01_FUNDACION_Y_NUCLEO_SAAS.md`, `FASE_02_CATALOGO_IMPUESTOS_Y_VITRINA.md` y `FASE_03A_MOTOR_PEDIDOS_ANTIFRAUDE_Y_WHATSAPP.md` (v2.4.0) completadas y con todas sus puertas de pruebas en verde.  
**Objetivo de la Fase:** Implementar la segunda mitad del Nivel 1 de la Escalera de Adopción (`WHATSAPP_SIMPLE`): el bus de eventos en tiempo casi real mediante **Server-Sent Events (`@Sse()`)** tanto para sucursales (autenticado con JWT vía `@microsoft/fetch-event-source`) como para comensales (por token opaco con respaldo de *polling*), el ajuste de productos y tarifa de domicilio antes de procesar con auditoría inmutable (`OrderEdit`), la acción de un solo toque **"Procesar pedido"** (`ACCEPTED` + bloqueo `is_locked = true` + enlace `wa.me` hacia el número registrado del cliente y botón de copia), la máquina de transiciones de estado (`OrderStatus`), el **Panel Liviano de 1 pantalla** (`lite-order-panel`) y la página pública de seguimiento (`public-tracking` en `/t/:publicOrderToken`), cerrando el **Hito 1 (MVP Piloto para Restaurantes Pequeños)**.

---

## 1. Reglas de Ingeniería, Arquitectura Limpia y Seguridad (Directivas para Gemini)

Al procesar este documento junto con `DEFINICION_TECNICA.md` (v2.4.0) y `STACK_VERSIONS.md` (v2.4.0) para generar código, debes cumplir sin excepción las siguientes reglas:

1. **Política de Cero Código Incompleto (`Zero-Placeholder Policy`):**
   - Está estrictamente prohibido entregar archivos con comentarios como `// TODO`, `// implementar luego`, `// ... resto del código` o funciones simuladas. Cada archivo generado debe ser 100 % funcional, compilable y estrictamente tipado.
2. **Apego Estricto a `STACK_VERSIONS.md` y Puertas Manuales por Sub-Paso:**
   - Usa únicamente las versiones y librerías fijadas en `STACK_VERSIONS.md` (Node 22 LTS, NestJS 10, Prisma 5, React 18, Vite 5, TanStack Query 5, `@microsoft/fetch-event-source@2.0.1`, Zod 3.23).
   - Entrega únicamente los archivos correspondientes al sub-paso solicitado en la Sección 5 y espera la confirmación de la **Puerta de Validación Manual** (`pnpm install`, `pnpm turbo run typecheck`, `pnpm turbo run test`) antes de pasar al siguiente paso.
3. **Transaccionalidad, Recálculo en Servidor y Bloqueo en Ajustes (`OrderEdit` y `is_locked`):**
   - Mientras una orden esté en estado `REQUESTED` o `RECEIVED` y tenga `is_locked === false`, el operador autorizado puede agregar o quitar productos, modificar cantidades y fijar el valor del domicilio (`delivery_fee_cop`).
   - Todo ajuste en `PATCH /api/v1/orders/:orderId/items` debe ejecutarse dentro de `PrismaService.withTenant(tenantId, fn)` bloqueando la fila de `Order` con `SELECT ... FOR UPDATE`, recalculando precios e impuestos desde el catálogo en PostgreSQL (jamás confiando en precios enviados por el cliente), verificando que $\text{grand\_total\_cop} \ge \text{paid\_total\_cop}$ (`409 TOTAL_BELOW_PAID_AMOUNT`) y guardando en la tabla `OrderEdit` las instantáneas completas antes y después del cambio (`before_snapshot_json` y `after_snapshot_json`).
   - Al ejecutar **"Procesar pedido"** (`POST /api/v1/orders/:orderId/process`), la orden transiciona a `ACCEPTED`, fija `is_locked = true`, `processed_at = NOW()` y `processed_by = user.id`. Cualquier intento posterior de editar libremente sus ítems mediante `PATCH /api/v1/orders/:orderId/items` debe ser rechazado con HTTP `409 Conflict` (`ORDER_ALREADY_LOCKED`).
4. **Autenticación en Server-Sent Events (SSE) y Resiliencia Móvil:**
   - Dado que el objeto nativo `EventSource` del navegador no soporta la cabecera `Authorization: Bearer <jwt>`, el frontend React debe utilizar obligatoriamente `@microsoft/fetch-event-source` para conectarse al stream privado del panel (`/api/v1/branches/:branchId/orders/events`).
   - El stream público del cliente (`/api/v1/public/orders/:publicOrderToken/events`) se autentica mediante el `publicOrderToken` opaco de 256 bits e implementa reconexión automática más respaldo a *polling* HTTP cada 12 segundos si la red móvil corta la conexión persistente.
5. **Enmascaramiento de Datos Personales (Ley 1581 de 2012) y Honestidad en el Seguimiento:**
   - El endpoint público `GET /api/v1/public/orders/:publicOrderToken` y los mensajes salientes hacia WhatsApp **jamás exponen la dirección completa ni el teléfono sin enmascarar** (`+57 *** *** 4567`).
   - La página pública de seguimiento muestra únicamente los estados que una persona del restaurante haya marcado efectivamente en el panel con su hora real (`occurred_at`), sin temporizadores falsos, e incluye siempre la leyenda de no equivalencia con factura electrónica DIAN.

---

## 2. Alcance Exacto de la Fase 03B

### 2.1 Extensión del Paquete Compartido (`packages/shared`)
1. **Máquina de Estados del Pedido (`packages/shared/src/constants/order-status.machine.ts`):**
   - Definición completa de `OrderStatus`: `'REQUESTED'`, `'RECEIVED'`, `'ACCEPTED'`, `'PREPARING'`, `'READY'`, `'OUT_FOR_DELIVERY'`, `'DELIVERED'`, `'PICKED_UP'`, `'SERVED'`, `'REJECTED'`, `'CANCELLED'`, `'EXPIRED_UNPROCESSED'`.
   - Función pura `canTransitionOrderStatus(params)` que evalúa:
     - Estado actual (`fromStatus`), estado destino (`toStatus`), `origin` (`'WHATSAPP'` | `'WEB_DIRECT'` | `'TABLE_QR'` | `'STAFF'`), `fulfillmentType` (`'PICKUP'` | `'DELIVERY'` | `'DINE_IN'`), flujo activo de la sucursal (`activeStatusFlow: OrderStatus[]`), bandera `requirePaymentBeforePreparation` y `paymentStatus`.
     - Garantiza que una solicitud en `REQUESTED` solo pueda pasar a `ACCEPTED`, `REJECTED` o `EXPIRED_UNPROCESSED` (nunca saltar a cocina ni a entregada sin procesarse primero en `ACCEPTED`).
     - Garantiza que `OUT_FOR_DELIVERY` y `DELIVERED` solo sean válidos cuando `fulfillmentType === 'DELIVERY'`; `PICKED_UP` cuando `fulfillmentType === 'PICKUP'`; y `SERVED` cuando `fulfillmentType === 'DINE_IN'`.
     - Permite omitir estados intermedios (`PREPARING`, `READY`, `OUT_FOR_DELIVERY`) si no están en `activeStatusFlow`, manteniendo obligatorios el estado inicial, `ACCEPTED` (para `WHATSAPP` y `TABLE_QR`) y un estado terminal.
2. **Enmascaramiento de PII y Plantillas de Retorno WhatsApp (`packages/shared/src/utils/`):**
   - **`pii-masker.ts` (`maskCustomerSnapshot`):**
     - Nombre: conserva primer nombre e inicial del segundo término (ej. `"Carlos Rodríguez"` $\rightarrow$ `"Carlos R."`).
     - Teléfono (`phone_e164`): conserva código de país y últimos 4 dígitos (ej. `"+573001234567"` $\rightarrow$ `"+57 *** *** 4567"`).
     - Dirección: oculta numeración domiciliaria específica dejando vía principal y barrio (ej. `"Calle 45 # 12-34 Apto 201, Barrio Chapinero"` $\rightarrow$ `"Calle 45 # ***, Barrio Chapinero"`).
   - **Ampliación de `whatsapp-templates.ts`:**
     - `buildBranchToCustomerProcessedWhatsapp(params)`: Genera `{ whatsapp_client_url, copyable_message }` dirigido al `phone_e164` registrado en el pedido con el saludo del restaurante, confirmación del código `#A104`, monto total actualizado y enlace público `/t/<public_token>`, **sin incluir dirección ni teléfono en el texto del mensaje**.
     - `buildBranchToCustomerStatusWhatsapp(params)`: Genera `{ whatsapp_client_url, copyable_message }` opcional cuando el pedido pasa a `READY` (*"Tu pedido #A104 está listo para recoger"*) o `OUT_FOR_DELIVERY` (*"Tu pedido #A104 va en camino"*).
3. **Esquemas Zod de Ajuste, Transición y Seguimiento (`packages/shared/src/schemas/order-panel.schema.ts`):**
   - `AdjustOrderItemsSchema`: Valida `items` (arreglo no vacío con `product_id`, `variant_id?`, `quantity` entero $\ge 1$, `modifiers` y `notes?`), `delivery_fee_cop` (entero $\ge 0$) y `reason?` (texto opcional explicando el ajuste acordado en el chat).
   - `TransitionOrderStatusSchema`: Valida `to_status` y exige `reason` obligatorio (mínimo 3 caracteres) cuando `to_status` es `'REJECTED'` o `'CANCELLED'`.
   - `BranchOrdersQuerySchema`: Filtros para `GET /api/v1/branches/:branchId/orders` (`status?`, `origin?`, `fulfillment_type?`, `q?`, `page`, `limit`).

### 2.2 Base de Datos (`PostgreSQL 16` + `Prisma`) y Políticas RLS
Verificación o incorporación en `apps/api/prisma/schema.prisma` y migración SQL con políticas *Row-Level Security (RLS)* activas para el rol `app_runtime`:
1. Tabla `OrderEdit` (`order_edits` — Sección 9.1.3):
   - `id (UUID PK)`, `tenant_id (UUID FK)`, `order_id (UUID FK)`, `actor_id (UUID FK)`, `occurred_at (TIMESTAMPTZ DEFAULT NOW())`, `before_snapshot_json (JSONB NOT NULL)`, `after_snapshot_json (JSONB NOT NULL)`, `reason (TEXT NULL)`.
   - Índice compuesto: `INDEX idx_order_edits_tenant_order ON order_edits(tenant_id, order_id, occurred_at DESC)`.
   - Política RLS: `USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)`.

### 2.3 Backend en NestJS (`apps/api/src/modules/`)
1. **Servicio de Tiempo Real SSE (`notifications/sse-stream.service.ts`):**
   - Administra flujos reactivos (`RxJS Subject`) en memoria aislados estrictamente por clave:
     - Canal privado de sucursal (`branch:{tenantId}:{branchId}:orders`): emite eventos `order.created`, `order.adjusted`, `order.status_changed` con el resumen completo para el operador autenticado.
     - Canal público de seguimiento (`tracking:{publicOrderToken}`): emite eventos `tracking.updated` con el payload público ya enmascarado (`maskCustomerSnapshot`) para el comensal.
   - Incluye emisión automática de evento `ping` (`heartbeat`) cada `25 segundos` para mantener viva la conexión HTTP en redes móviles y proxies inversos, y limpieza automática de observadores al cerrarse el socket.
2. **Servicios Operativos del Pedido (`ordering/services/`):**
   - **`AdjustOrderService` (`PATCH /api/v1/orders/:orderId/items`):**
     - Protegido con `@RequireModule('order_panel')` y `@RequirePermissions('orders.adjust')` (roles `CASHIER`, `BRANCH_MANAGER`, `TENANT_ADMIN`).
     - Abre transacción `withTenant(tenantId)` y ejecuta `SELECT ... FOR UPDATE` sobre la fila de `Order`.
     - Verifica que `order.status IN ('REQUESTED', 'RECEIVED')` y `order.is_locked === false`; de lo contrario lanza `409 Conflict` (`ORDER_ALREADY_LOCKED`).
     - Si `order.fulfillment_type === 'PICKUP'`, fuerza `delivery_fee_cop = 0`.
     - Construye el `before_snapshot_json` (ítems previos, `subtotal_products_cop`, `delivery_fee_cop`, `tax_total_cop`, `grand_total_cop`), recalcula las nuevas líneas desde el catálogo de PostgreSQL con `calculateLinePricing`, verifica $\text{nuevo\_grand\_total\_cop} \ge \text{order.paid\_total\_cop}$ (`409 TOTAL_BELOW_PAID_AMOUNT`), reemplaza las filas en `order_items`, actualiza los totales en `orders`, inserta la fila en `order_edits` y registra en `AuditEvent` (`action: 'ORDER_ADJUSTED_BEFORE_PROCESS'`).
     - Emite evento SSE tanto al canal de la sucursal como al canal de seguimiento del cliente.
   - **`ProcessOrderService` (`POST /api/v1/orders/:orderId/process`):**
     - Protegido con `@RequireModule('order_panel')` y `@RequirePermissions('orders.process')`.
     - En transacción con `SELECT ... FOR UPDATE`, verifica que la orden esté en `REQUESTED` o `RECEIVED`.
     - Cambia `status = 'ACCEPTED'`, fija `is_locked = true`, `processed_at = NOW()` y `processed_by = user.id`.
     - Inserta `OrderStatusEvent` (`from_status: 'REQUESTED'`, `to_status: 'ACCEPTED'`, `visible_to_customer: true`) y `AuditEvent` (`action: 'ORDER_PROCESSED'`).
     - Construye con `buildBranchToCustomerProcessedWhatsapp` el enlace `whatsapp_client_url` dirigido al `phone_e164` del snapshot del cliente y el `copyable_message` con el link `/t/<public_token>`.
     - Emite evento SSE en vivo y retorna `{ order, whatsapp_client_url, copyable_message }`.
   - **`TransitionOrderStatusService` (`PATCH /api/v1/orders/:orderId/status`):**
     - Protegido con `@RequireModule('order_panel')`.
     - En transacción con `SELECT ... FOR UPDATE`, valida la transición con `canTransitionOrderStatus`.
     - Si `to_status === 'PREPARING'` y la orden tiene `require_payment_before_preparation === true` con `payment_status !== 'PAID'`, rechaza con `409 Conflict` (`PAYMENT_REQUIRED_BEFORE_PREPARATION`).
     - Si `to_status IN ('REJECTED', 'CANCELLED')` y `order.paid_total_cop > 0`, rechaza con `409 Conflict` (`ORDER_HAS_ACTIVE_PAYMENTS`).
     - Si `to_status` es un estado final (`DELIVERED`, `PICKED_UP`, `SERVED`, `REJECTED`, `CANCELLED`), fija `public_token_expires_at = NOW() + INTERVAL '24 hours'`.
     - Inserta `OrderStatusEvent`, emite actualización por SSE y devuelve `{ order, whatsapp_status_url?, copyable_status_message? }`.
3. **Controladores de Panel, Seguimiento Público y OpenGraph (`ordering/controllers/`):**
   - `GET /api/v1/branches/:branchId/orders`: Lista pedidos del día agrupados o filtrables para el panel (`REQUESTED` pendientes, activos en curso e historial reciente), incluyendo el conteo de ediciones (`edits_count`).
   - `GET /api/v1/branches/:branchId/orders/events`: Endpoint `@Sse()` protegido con `JwtAuthGuard`, `TenantContextGuard`, `@RequireModule('order_panel')` y verificación de `branch_scope`.
   - `GET /api/v1/orders/:orderId/status-history`: Devuelve los eventos `OrderStatusEvent` y la lista de `OrderEdit` de la orden.
   - `GET /api/v1/public/orders/:publicOrderToken`: Protegido con Rate Limiting público. Verifica que el token exista y que `public_token_expires_at` no haya vencido (`410 Gone` si venció). Aplica `maskCustomerSnapshot`, calcula `was_adjusted_by_restaurant = (edits_count > 0)`, adjunta la leyenda fiscal DIAN, incluye `payment_instructions_json` si aplica y filtra la línea de tiempo solo si el módulo `tracking` está activo en la sucursal (si `tracking` está desactivado, devuelve el resumen estático sin línea de tiempo).
   - `GET /api/v1/public/orders/:publicOrderToken/events`: Endpoint `@Sse()` público que valida vigencia del token y suscribe al canal `tracking:{publicOrderToken}`.
   - Ampliación del inyector OpenGraph (`GET /t/:publicOrderToken`): Sirve el `index.html` con `<meta property="og:title" content="Pedido #A104 - Mi Restaurante" />` y `<meta property="og:description" content="Consulta el resumen y estado en vivo de tu pedido." />` sin exponer PII en las meta-etiquetas.

### 2.4 Frontend en React (`apps/web`)
1. **Hook Resiliente de Tiempo Real (`src/hooks/use-sse-stream.ts`):**
   - Modo autenticado (`authMode: 'jwt'`): Usa `fetchEventSource` de `@microsoft/fetch-event-source` enviando `Authorization: Bearer <accessToken>`, refrescando el token si recibe `401` y reconectando con *backoff* exponencial.
   - Modo público (`authMode: 'public_token'`): Conecta al endpoint SSE público y activa un *timer* de respaldo que ejecuta `refetch()` cada `12 segundos` si la conexión SSE se interrumpe, exponiendo `{ isConnected, lastUpdatedAt }`.
2. **Panel Liviano de Una Sola Pantalla (`src/features/lite-order-panel/` — Ruta `/panel/lite`):**
   - Protegido con `<CapabilityRoute requiredModule="order_panel" />`.
   - Cabecera compacta con indicador de conexión en vivo (`Conectado en tiempo real` en verde / `Reconectando...` en rojo), selector de sonido de campana (Web Audio API) y contadores rápidos (`Solicitudes por procesar`, `En curso`, `Completados hoy`).
   - **Sección Principal "Solicitudes Pendientes por Procesar (`REQUESTED`)":**
     - Tarjetas destacadas con borde ámbar que muestran: código `#A104`, tiempo transcurrido, modalidad (`Domicilio` / `Recoger`), nombre del cliente, **teléfono `phone_e164` formateado de forma prominente** (para contrastarlo visualmente con el número del chat de WhatsApp), dirección de entrega, notas y lista de productos.
     - **Botón `[ Ajustar pedido ]` (`OrderAdjustModal`):** Permite en la misma pantalla incrementar/disminuir cantidades, eliminar un ítem, buscar y añadir un producto del catálogo con sus modificadores, y digitar el **Valor del domicilio (`$ COP`)** acordado por WhatsApp (bloqueado en `$0` si es `PICKUP`), mostrando el nuevo total calculado por el servidor.
     - **Botón Principal de 1 toque `[ Procesar pedido ]`:** Invoca `POST /api/v1/orders/:id/process`, mueve la tarjeta a la columna de pedidos activos, abre automáticamente la ventana/app de WhatsApp hacia el número del cliente con el mensaje y enlace de seguimiento prellenados, y muestra en la tarjeta una barra con el botón **`[ Copiar mensaje con link ]`** (con confirmación visual *"¡Copiado!"*) por si el cliente escribió desde un número distinto al registrado.
     - **Botón Secundario `[ No puedo atender ]`:** Solicita motivo breve, pasa la solicitud a `REJECTED` y ofrece abrir WhatsApp con mensaje de disculpa.
   - **Sección "Pedidos en Curso (`ACCEPTED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`)":**
     - Tarjetas claras con el botón de un toque correspondiente al siguiente estado activo en la sucursal (ej. **`[ Marcar Listo ]`**, **`[ Marcar En Camino ]`**, **`[ Marcar Entregado ]`**) y botón secundario para enviar por WhatsApp el aviso de ese estado.
3. **Página Pública de Seguimiento para el Cliente (`src/features/public-tracking/` — Ruta `/t/:publicOrderToken`):**
   - Vista *mobile-first* sin login ni creación de cuenta.
   - Cabecera con logo y colores del restaurante, código `#A104`, insignia del estado actual, rango de tiempo estimado y hora exacta de la última sincronización.
   - **Línea de Tiempo Honesta:** Renderiza únicamente los pasos del flujo activo de la sucursal, marcando en verde con su hora exacta (`7:15 PM`) los estados que el personal ya ejecutó en el panel, sin barras de progreso falsas.
   - **Resumen de Compra y Aviso de Ajuste:** Lista los productos finales, cantidades, valor de domicilio y gran total. Si `was_adjusted_by_restaurant === true`, muestra un aviso destacado: *"El resumen de tu pedido fue actualizado según lo acordado con el restaurante"*.
   - **Instrucciones de Pago (cuando `payment_policy === 'OFFLINE_ONLY'` y `payment_status !== 'PAID'`):** Muestra el recuadro con los datos de Nequi, DaviPlata o llave Bre-B configurados por la sucursal.
   - **Pie de Página Legal:** Muestra los datos del cliente enmascarados (`+57 *** *** 4567`) y la leyenda obligatoria de no equivalencia con factura electrónica DIAN.

---

## 3. Contratos Exactos de Datos y Reglas de Negocio (Fase 03B)

### 3.1 Estructura de Instantáneas en `OrderEdit` (`before_snapshot_json` y `after_snapshot_json`)
Cada vez que `AdjustOrderService` modifica una orden en `REQUESTED` o `RECEIVED`, tanto `before_snapshot_json` como `after_snapshot_json` persisten exactamente la siguiente estructura JSON:

~~~json
{
  "subtotal_products_cop": 40000,
  "discount_total_cop": 0,
  "delivery_fee_cop": 4000,
  "tax_total_cop": 2963,
  "grand_total_cop": 44000,
  "items": [
    {
      "product_id": "uuid-prod-1",
      "product_name": "Hamburguesa Artesanal",
      "variant_name": "Doble Carne",
      "quantity": 2,
      "unit_price_cop": 20000,
      "modifiers": [
        { "option_name": "Tocineta Ahumada", "extra_price_cop": 0 }
      ],
      "line_total_cop": 40000,
      "notes": "Sin cebolla"
    }
  ]
}
~~~

### 3.2 Contrato de Respuesta de `POST /api/v1/orders/:orderId/process`

~~~json
{
  "order_id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "order_code": "#A104",
  "status": "ACCEPTED",
  "is_locked": true,
  "processed_at": "2026-10-27T20:15:30.000Z",
  "grand_total_cop": 44000,
  "tracking_url": "https://app.restaurantesaas.co/t/xK9mP2vL8nQ4rT6wY1zB3cV5fH7jM0pS9dG2kL4qW8e",
  "whatsapp_client_url": "https://wa.me/573001234567?text=Hola%20Carlos%2C%20tu%20pedido%20*23A104*%20en%20*El%20Sabor*%20ha%20sido%20confirmado%20por%20un%20total%20de%20*%24%2044.000*.%20Puedes%20ver%20el%20resumen%20final%20y%20el%20estado%20en%20vivo%20aqu%C3%AD%3A%20https%3A%2F%2Fapp.restaurantesaas.co%2Ft%2FxK9mP2vL8nQ4rT6wY1zB3cV5fH7jM0pS9dG2kL4qW8e",
  "copyable_message": "Hola Carlos, tu pedido *#A104* en *El Sabor* ha sido confirmado por un total de *$ 44.000*. Puedes ver el resumen final y el estado en vivo aquí: https://app.restaurantesaas.co/t/xK9mP2vL8nQ4rT6wY1zB3cV5fH7jM0pS9dG2kL4qW8e"
}
~~~

---

## 4. Matriz de Casos de Prueba Obligatorios (Fase 03B)

El desarrollo de la Fase 03B —y con ello el **Hito 1 (Piloto Comercial Nivel 1)**— solo se considera completo cuando todas las siguientes pruebas automatizadas pasan en verde:

### 4.1 Pruebas Unitarias (`packages/shared`)
- **`TC-03B-U01` (Máquina de Estados evaluando `origin` y `fulfillment_type`):**
  - Una orden en `REQUESTED` puede transicionar a `ACCEPTED`, `REJECTED` o `EXPIRED_UNPROCESSED`, pero rechaza saltar directamente a `PREPARING`, `READY`, `OUT_FOR_DELIVERY` o `DELIVERED`.
  - Una orden con `origin = 'WHATSAPP'` y `fulfillment_type = 'DELIVERY'` en estado `ACCEPTED` puede pasar a `OUT_FOR_DELIVERY` y luego a `DELIVERED`, pero rechaza pasar a `PICKED_UP` o `SERVED`.
  - Una orden con `origin = 'WHATSAPP'` y `fulfillment_type = 'PICKUP'` en estado `ACCEPTED` puede pasar a `READY` y luego a `PICKED_UP`, pero rechaza pasar a `OUT_FOR_DELIVERY`.
- **`TC-03B-U02` (Enmascaramiento de PII en `maskCustomerSnapshot`):**
  - Dado `{ name: "María Fernanda Gómez", phone_e164: "+573159876543", address_line: "Carrera 15 # 85-20 Apto 502", neighborhood: "Virrey" }`, `maskCustomerSnapshot` debe retornar `name: "María F."`, `phone_masked: "+57 *** *** 6543"` y `address_masked: "Carrera 15 # ***, Virrey"`, sin contener la cadena `"3159876543"` ni `"85-20 Apto 502"`.
- **`TC-03B-U03` (Mensaje de Retorno a WhatsApp sin Datos Sensibles):**
  - `buildBranchToCustomerProcessedWhatsapp` debe apuntar a `https://wa.me/573159876543`, incluir el código `#A104`, el total formateado y la URL con el `public_token`, y **no contener la dirección del cliente en ningún lugar del texto**.

### 4.2 Pruebas de Integración y Seguridad Multi-Tenant (`apps/api/test/`)
- **`TC-03B-I01` (Ajuste Pre-Procesamiento con Recálculo en Servidor y Auditoría en `OrderEdit`):**
  - Se crea una solicitud `REQUESTED` (`fulfillment_type = 'DELIVERY'`) con 2 hamburguesas de `$20.000` (`subtotal = 40000`, `delivery_fee_cop = 0`, `grand_total_cop = 40000`).
  - El operador ejecuta `PATCH /api/v1/orders/:id/items` cambiando la cantidad a 3 hamburguesas, agregando 1 bebida de `$5.000` y fijando `delivery_fee_cop = 4000` con `reason: "Cliente pidió 1 hamburguesa extra y acordó domicilio por WhatsApp"`.
  - El backend actualiza la orden a `subtotal_products_cop = 65000`, `delivery_fee_cop = 4000`, `grand_total_cop = 69000`, e inserta una fila en `order_edits` con `before_snapshot_json.grand_total_cop === 40000` y `after_snapshot_json.grand_total_cop === 69000`.
- **`TC-03B-I02` (Procesamiento en 1 Toque, Bloqueo `is_locked` y Rechazo de Ediciones Posteriores):**
  - El operador ejecuta `POST /api/v1/orders/:id/process` sobre la solicitud ajustada.
  - La orden pasa a `status = 'ACCEPTED'`, `is_locked = true`, `processed_at != null`, inserta `OrderStatusEvent` (`REQUESTED` $\rightarrow$ `ACCEPTED`) y devuelve `whatsapp_client_url` y `copyable_message`.
  - Un intento posterior de llamar a `PATCH /api/v1/orders/:id/items` sobre esa misma orden es rechazado con HTTP `409 Conflict` (`ORDER_ALREADY_LOCKED`).
- **`TC-03B-I03` (Inmutabilidad Histórica ante Cambios Posteriores en el Catálogo):**
  - Tras procesar la orden con hamburguesas a `$20.000`, el administrador edita el catálogo y sube el precio de la hamburguesa a `$26.000`.
  - Al consultar la orden en el panel o en `GET /api/v1/public/orders/:publicOrderToken`, la línea de hamburguesa conserva `unit_price_cop = 20000` y el `grand_total_cop` de la orden permanece inalterado.
- **`TC-03B-I04` (Seguimiento Público con PII Enmascarado y Adaptación cuando `tracking` está Desactivado):**
  - Con `tracking: true`, `GET /api/v1/public/orders/:publicOrderToken` devuelve `was_adjusted_by_restaurant: true`, la línea de tiempo con los estados marcados y sus timestamps reales, la leyenda fiscal DIAN y el snapshot del cliente enmascarado.
  - Si se desactiva el módulo `tracking` en la sucursal, el mismo endpoint devuelve el recibo estático de confirmación con `timeline: []` y `tracking_enabled: false`.
- **`TC-03B-I05` (Expiración del Token Público de Seguimiento tras 24 Horas de Estado Final):**
  - Cuando el operador marca la orden como `DELIVERED` (`PATCH /api/v1/orders/:id/status`), el backend fija `public_token_expires_at = NOW() + 24 hours`.
  - Si se simula que `public_token_expires_at` está en el pasado, `GET /api/v1/public/orders/:publicOrderToken` y su stream SSE responden HTTP `410 Gone` (`TRACKING_LINK_EXPIRED`).
- **`TC-03B-I06` (Notificación en Tiempo Real por Server-Sent Events — Sucursal y Cliente):**
  - Un cliente suscrito al stream SSE `/api/v1/public/orders/:publicOrderToken/events` recibe en menos de 1 segundo el evento `tracking.updated` cuando el operador ejecuta `POST /api/v1/orders/:id/process` y cuando avanza el estado a `OUT_FOR_DELIVERY`.
- **`TC-03B-I07` (Aislamiento Multi-Tenant en Ajustes, Procesamiento y Canales SSE):**
  - Un usuario autenticado en el *Restaurante A* intenta ajustar ítems, procesar, cambiar el estado o conectarse al stream SSE `/api/v1/branches/:branchId/orders/events` de una sucursal del *Restaurante B*.
  - Todas las peticiones son bloqueadas con `403 Forbidden` o `404 Not Found`.

### 4.3 Prueba End-to-End de Cierre del Hito 1 (`apps/web` — Playwright)
- **`TC-03B-E01` (Recorrido Completo Piloto Nivel 1: Cliente $\rightarrow$ WhatsApp $\rightarrow$ Ajuste en Panel Liviano $\rightarrow$ Procesar $\rightarrow$ Tracking en Vivo):**
  1. En un restaurante configurado en perfil `WHATSAPP_SIMPLE`, el cliente abre `/r/:slug`, agrega 2 productos al carrito, elige `Domicilio`, completa nombre, teléfono `3001234567` y dirección, acepta privacidad y pulsa **"Terminar pedido por WhatsApp"**.
  2. El operador tiene abierto `/panel/lite` y ve aparecer en vivo vía SSE la solicitud `#A101` en estado `REQUESTED` con el teléfono `+57 300 123 4567` visible.
  3. El operador pulsa **`[ Ajustar pedido ]`**, agrega `$4.000` de domicilio, guarda el ajuste y pulsa **`[ Procesar pedido ]`**; verifica que la tarjeta pasa a `Confirmado (ACCEPTED)` y muestra el botón **`[ Copiar mensaje con link ]`**.
  4. El cliente abre el enlace `/t/:publicOrderToken`, visualiza el nuevo total con el domicilio incluido, la etiqueta *"Actualizado según lo acordado con el restaurante"* y el estado `Confirmado`.
  5. El operador en `/panel/lite` pulsa **`[ Marcar En Camino ]`** y luego **`[ Marcar Entregado ]`**; la página `/t/:publicOrderToken` del cliente refleja cada nuevo estado con su hora exacta en menos de 3 segundos sin recargar el navegador.

---

## 5. Secuencia de Prompts Acotados para Ejecutar la Fase 03B con Gemini

Adjunta `DEFINICION_TECNICA.md` (v2.4.0), `STACK_VERSIONS.md` (v2.4.0) y este archivo `FASE_03B_PANEL_LIVIANO_AJUSTES_Y_TRACKING_SSE.md`, y solicita los siguientes **5 pasos en orden**, ejecutando la puerta de validación manual al terminar cada uno:

### Paso 3B.1: Máquina de Estados, Enmascarador de PII, Plantillas de Retorno WhatsApp y Tests Unitarios (`packages/shared`)
> **Prompt 3B.1:** *"Con base en `DEFINICION_TECNICA.md` (v2.4.0), `STACK_VERSIONS.md` (v2.4.0) y `FASE_03B_PANEL_LIVIANO_AJUSTES_Y_TRACKING_SSE.md`, genera en `packages/shared` la máquina completa de estados del pedido (`src/constants/order-status.machine.ts`), la utilidad de enmascaramiento `src/utils/pii-masker.ts`, las funciones `buildBranchToCustomerProcessedWhatsapp` y `buildBranchToCustomerStatusWhatsapp` en `src/utils/whatsapp-templates.ts`, los esquemas Zod `src/schemas/order-panel.schema.ts` y las pruebas unitarias `TC-03B-U01` a `TC-03B-U03`. Entrega código 100 % completo y sin TODOs."*
- **Puerta Manual 3B.1:** Ejecutar `pnpm --filter @restaurante-saas/shared typecheck && pnpm --filter @restaurante-saas/shared test`.

### Paso 3B.2: Modelo Prisma `OrderEdit`, Migración RLS y Servicio de Tiempo Real `SseStreamService` (`apps/api`)
> **Prompt 3B.2:** *"Verifica o agrega en `apps/api/prisma/schema.prisma` el modelo `OrderEdit` con su índice compuesto y migración SQL con política Row-Level Security (RLS) para `app_runtime`, e implementa completo en `apps/api/src/modules/notifications/` el servicio `SseStreamService` con canales aislados para sucursal (`branch:{tenantId}:{branchId}:orders`) y para seguimiento público (`tracking:{publicOrderToken}`), incluyendo heartbeat cada 25 segundos y limpieza de conexiones."*
- **Puerta Manual 3B.2:** Ejecutar `pnpm --filter @restaurante-saas/api prisma migrate deploy && pnpm --filter @restaurante-saas/api typecheck`.

### Paso 3B.3: Servicios y Controladores Backend de Ajuste, Procesamiento, Transición y Seguimiento Público (`apps/api`)
> **Prompt 3B.3:** *"Implementa completos en `apps/api/src/modules/ordering/` los servicios `AdjustOrderService` (`PATCH /api/v1/orders/:orderId/items` con `SELECT ... FOR UPDATE`, recálculo desde catálogo y registro en `OrderEdit`), `ProcessOrderService` (`POST /api/v1/orders/:orderId/process` con bloqueo `is_locked = true` y generación de enlaces WhatsApp), `TransitionOrderStatusService` (`PATCH /api/v1/orders/:orderId/status`), el controlador operativo de sucursal (`GET /api/v1/branches/:branchId/orders`, stream SSE `/events` y `/status-history`) y el controlador público de seguimiento (`GET /api/v1/public/orders/:publicOrderToken`, stream SSE `/events` y meta-etiquetas OpenGraph en `GET /t/:publicOrderToken`)."*
- **Puerta Manual 3B.3:** Ejecutar `pnpm --filter @restaurante-saas/api typecheck`.

### Paso 3B.4: Suite de Pruebas de Integración de Fase 03B (`TC-03B-I01` a `TC-03B-I07`)
> **Prompt 3B.4:** *"Genera en `apps/api/test/` la suite completa de pruebas de integración `TC-03B-I01` a `TC-03B-I07` verificando el ajuste pre-procesamiento con `OrderEdit`, el bloqueo al procesar, la inmutabilidad histórica ante cambios de precios, el seguimiento público con PII enmascarado, la expiración del token a las 24h, la emisión SSE y el aislamiento multi-tenant."*
- **Puerta Manual 3B.4:** Ejecutar `pnpm --filter @restaurante-saas/api test` y verificar que todas las pruebas pasen en verde.

### Paso 3B.5: Frontend React — Hook `useSseStream`, Panel Liviano de 1 Pantalla y Página de Seguimiento (`/t/:token`)
> **Prompt 3B.5:** *"Implementa en `apps/web` el hook `src/hooks/use-sse-stream.ts` (usando `@microsoft/fetch-event-source` con Bearer JWT para rutas privadas y fallback de polling cada 12s para seguimiento público), el módulo completo `src/features/lite-order-panel/` (vista de 1 pantalla con alertas sonoras Web Audio, tarjetas `REQUESTED` con teléfono visible, modal de ajuste de ítems/domicilio, botón Procesar pedido de 1 toque, botón Copiar mensaje y avance de estados) y la página pública `src/features/public-tracking/` (`/t/:publicOrderToken` con línea de tiempo honesta, insignia de pedido ajustado, instrucciones de transferencia y leyenda fiscal DIAN), incluyendo la prueba E2E `TC-03B-E01`."*
- **Puerta Manual 3B.5 (Cierre del Hito 1 — Piloto Comercial Nivel 1):** Ejecutar `pnpm turbo run typecheck && pnpm turbo run test && pnpm --filter @restaurante-saas/web build`.