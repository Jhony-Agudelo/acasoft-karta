# Definición Técnica Definitiva — Plataforma SaaS Modular para Restaurantes
**Documento:** `DEFINICION_TECNICA.md`  
**Versión:** 2.4.0 — Anonimización con UUID/HMAC antifraude, reapertura contable sin ocupar mesa (`REOPENED_ACCOUNTING`), prelación de cobros parciales, evaluación atómica del grafo y división Fase 03A/03B (P-014)  
**Fecha:** 2026-10-26  
**Estado:** Versión Definitiva Aprobada para Implementación (Hitos 1 y 2). Los puntos sujetos a validación comercial, contable o jurídica externa se marcan como `POR VALIDAR`.

---

## 1. Propósito y visión

Construir una plataforma SaaS multiempresa (multi-tenant) para que restaurantes pequeños, medianos y grandes administren su presencia digital, recepción de pedidos por WhatsApp o web, cocina y operación de salón desde un solo lugar, conservando su identidad de marca y la relación directa con sus clientes.

La plataforma debe reducir la fricción operativa: no debe obligar a un restaurante pequeño a configurar ni pagar por funciones que no utiliza, ni limitar a una cadena con múltiples sucursales.

**Principio rector:** La complejidad debe residir en el software, nunca en el trabajo cotidiano del restaurante.

### 1.1 Propuesta de valor

- Sitio público propio por restaurante y sucursal, con logo, colores, portada, horarios, cobertura y menú digital optimizado para móvil.
- Códigos QR opacos y revocables por menú general, sucursal o mesa, sin exigir descarga de aplicaciones al comensal.
- Pedidos digitales para recoger en tienda (`PICKUP`), servicio a domicilio (`DELIVERY`) y consumo en mesa (`DINE_IN`).
- Escalera de adopción sin fricción: permite iniciar con pedidos estructurados hacia WhatsApp sin API paga (`wa.me`) acompañados de un **Panel Liviano de 1 pantalla** para ajustar, procesar el pedido con un toque y enviar al cliente un enlace de seguimiento en vivo.
- Seguimiento del pedido en tiempo real (`tracking`): página pública accesible mediante token opaco (sin cuenta obligatoria) que muestra el resumen final de la compra, las instrucciones de pago del comercio (cuando aplique) y los estados reales marcados por el restaurante.
- Herramientas completas de salón (`dining`), pantalla de cocina por estaciones (`kitchen` / KDS), consola avanzada de pedidos (`order_panel`) y **distribución informativa del consumo por persona** (`dining.consumption_split`).
- Control de caja presencial y de transferencias directas (`payments.manual`), permitiendo mostrar al cliente las cuentas/billeteras del comercio (Nequi, DaviPlata, Bre-B) y registrar en caja cobros únicos o combinados en efectivo (con cálculo de cambio), datáfono POS y transferencia verificada manualmente, con conciliación exacta entre ventas recaudadas, cuentas por cobrar, cortesías y saldos castigados.
- Gestión multi-sucursal con aislamiento estricto de datos entre restaurantes en PostgreSQL.

### 1.2 Decisiones de producto y arquitectura consolidadas (P-001 a P-014)

1. **Multi-segmento con configuración progresiva:** Un único producto SaaS sirve a negocios desde pequeños locales por WhatsApp hasta restaurantes con salón y múltiples sedes mediante habilitación por plan (*entitlements*) y configuración por organización/sucursal.
2. **Alcance del MVP enfocado en operación y sin pasarela de pagos en línea:** El MVP prioriza el dominio gastronómico (menú digital, flujo WhatsApp, panel de pedidos, cocina KDS, salón/mesas, distribución informativa por persona, instrucciones de pago directo, registro manual de cobros y reportes conciliados). Las pasarelas de pago en línea (`payments.online` y `payments.links`) quedan fuera del MVP para eliminar fricción bancaria y comisiones por transacción en el arranque, documentando sus reglas y el delta de esquema en el Anexo Post-MVP (Sección 21).
3. **Separación ortogonal entre Origen (`origin`) y Modalidad de Entrega (`fulfillment_type`):** Todo pedido distingue cómo ingresó (`WHATSAPP`, `WEB_DIRECT`, `TABLE_QR`, `STAFF`) de cómo se entrega (`PICKUP`, `DELIVERY`, `DINE_IN`). La máquina de estados evalúa siempre `fulfillment_type`.
4. **Distribución del consumo por persona estrictamente informativa y exacta al peso:** La asignación por comensal (`Persona 1`, `Persona 2`, `Persona 3`) es manual e informativa; persiste partes enteras (`share_units` / `total_item_shares`) e importes en pesos enteros (`assigned_amount_cop`) como fuente de verdad para no perder un solo peso al recargar, manteniendo una sola cuenta y un único cierre de cobro por el total de la mesa.
5. **Precios e impuestos sin doble cobro y claridad fiscal DIAN:** El menú público expresa precios finales al consumidor por defecto. El sistema soporta tres modos tributarios por restaurante (`FINAL_PRICE_NO_BREAKDOWN`, `TAX_INCLUDED_DISCRIMINATED`, `BASE_PLUS_TAX`) sin aplicar tarifas universales ni sumar dos veces un impuesto ya incluido, aclarando siempre que los pre-recibos informativos no sustituyen la factura electrónica DIAN.
6. **Integración con WhatsApp sin API paga en el MVP:** Todo el flujo de WhatsApp utiliza enlaces profundos (`https://wa.me/`) con mensajes prellenados (click-to-chat) del cliente al restaurante y del restaurante al número registrado por el cliente.
7. **Flujo "WhatsApp simple" con Panel Liviano y seguimiento:** El cliente arma su carrito en la web, registra su teléfono/dirección y abre el chat de WhatsApp del local. El comercio acuerda detalles por chat, entra al **Panel Liviano de 1 pantalla**, ajusta productos o valor de domicilio si cambiaron (`OrderEdit`) y pulsa **"Procesar pedido"**, lo que bloquea la edición libre y abre WhatsApp hacia el número del cliente con el enlace de resumen y seguimiento.
8. **Protección de pedidos desde QR de mesa:** Todo pedido originado en un QR de mesa (`origin = 'TABLE_QR'`) nace como solicitud (`REQUESTED`) con soporte de PIN de sesión opcional (`table_session_pin`) y requiere confirmación de un toque del mesero (`ACCEPTED`) antes de sumarse a la cuenta y enviarse a cocina (`kitchen`).
9. **Integridad financiera de ciclo completo (`NOT_TRACKED`, `UNPAID`, `PARTIALLY_PAID`, `PAID`, `COURTESY`, `WRITTEN_OFF`):**
   - Los pedidos en `REQUESTED` no admiten registro de pagos hasta ser confirmados (`ACCEPTED`), evitando pagos huérfanos ante caducidad automática.
   - Una función única determinista (`recalculatePaymentState`) recalcula siempre `paid_total_cop` y `payment_status` tras cada cobro o anulación (`VOIDED`).
   - Las órdenes o cuentas resueltas como `COURTESY` o `WRITTEN_OFF` (o cerradas en salón) quedan congeladas financieramente; para modificar sus pagos o registrar un cobro tardío deben revertirse (`revert-resolution`) o reabrirse (`reopen` en modo contable `REOPENED_ACCOUNTING` sin exigir que la mesa física esté libre, o en modo `FULL_TABLE` si está libre) con auditoría.
10. **Stack tecnológico y estrategia Web + PWA:** Monorepo TypeScript (`Turborepo`) con **React + Vite + Tailwind CSS** en el frontend y **NestJS** en el backend sobre **PostgreSQL 16+**. En el MVP el canal oficial para comensales y personal es Web responsive + **PWA instalable**.

### 1.3 Lo que NO forma parte del MVP (Exclusiones explícitas)

- Pasarelas de pago en línea (`payments.online`) y generación de links bancarios (`payments.links`), reservadas para el Horizonte Post-MVP (Secciones 4.10 y 21).
- Operar como un marketplace que agrupe restaurantes o cobre comisión por descubrimiento.
- Recaudar, custodiar o dispersar dinero de ventas de comida en cuentas de la plataforma.
- Emitir facturación electrónica o documento equivalente POS ante la DIAN.
- Reemplazar un software contable, nómina, inventario de recetas o ERP.
- Integrar la API paga de WhatsApp Business (envíos automáticos desde servidor).
- Publicación obligatoria en tiendas móviles nativas (App Store / Play Store) durante el MVP.

---

## 2. Principios de producto y experiencia (UX)

1. **Inicio sencillo:** Un restaurante publica su menú y recibe pedidos configurando solo nombre, número de WhatsApp, horario y productos básicos.
2. **Funciones progresivas:** Mostrar únicamente las funciones habilitadas para cada plan, sucursal y rol.
3. **Mobile-first:** Los flujos de comensal, mesero y panel liviano están optimizados para pantallas pequeñas.
4. **Pocas acciones por tarea:** Procesar solicitudes, avanzar estados, enviar a cocina, asignar consumo informativo por persona y registrar cobros deben tomar los mínimos toques posibles.
5. **Operación tolerante a fallos:** Mostrar advertencias claras cuando falle la red; nunca afirmar que un pedido llegó a cocina o quedó cobrado sin confirmación del servidor.
6. **Datos portables y sin PII innecesario:** Permitir exportar la información contable y de ventas en CSV con auditoría, sin incluir datos personales sensibles de los comensales en las descargas.
7. **Marca propia y vista previa en redes:** Cada restaurante conserva su identidad visual y sus enlaces públicos generan tarjetas de vista previa (OpenGraph) al compartirse por WhatsApp.
8. **Configuración segura:** Ningún rol operativo puede alterar precios de catálogo, perfiles tributarios ni módulos activos sin permiso administrativo.
9. **Trazabilidad completa:** Auditar quién realizó cambios sensibles, quién ajustó un pedido antes de procesarlo, quién anuló un cobro y quién cerró, reabrió o resolvió cuentas con saldo.
10. **No confundir pedido con pago:** Una orden puede estar aceptada, preparada o entregada sin que su cobro esté saldado (`UNPAID` o `PARTIALLY_PAID`), o sin que la plataforma gestione su cobro (`NOT_TRACKED`); ambas máquinas de estado son independientes.
11. **Adaptación al restaurante:** Cada capacidad se activa o se omite por restaurante y sucursal; lo desactivado se oculta en React y devuelve `MODULE_DISABLED` en NestJS.
12. **Cliente informado con datos reales:** La página de seguimiento muestra únicamente estados marcados por una persona del restaurante con su hora exacta, sin temporizadores falsos.
13. **Sin carga extra para el restaurante pequeño:** No se exige configurar mesas, impuestos discriminados ni estaciones de cocina a quien opera en el nivel inicial de WhatsApp.

---

## 3. Actores, roles y matriz de alcance

Los roles agrupan permisos asignables con alcance de organización o de sucursales específicas (`branch_scope`). En un restaurante pequeño el propietario reúne todos los roles:

| Rol (`role_key`) | Actor | Responsabilidades y permisos principales |
| :--- | :--- | :--- |
| `TENANT_ADMIN` | Propietario / Administrador del restaurante | Configura organización, marca, sucursales, módulos activos, usuarios (alta con clave temporal o enlace de invitación), perfil tributario, instrucciones de pago, anonimización de datos de clientes, menú, horarios y reportes globales. |
| `BRANCH_MANAGER` | Gerente de sucursal | Gestiona la operación diaria, disponibilidad de catálogo, órdenes, mesas, bloqueo de teléfonos fraudulentos, anulaciones justificadas de cobros (`void`), resolución y reversión de saldos no cobrados (`COURTESY` / `WRITTEN_OFF`), reapertura contable u operativa de cuentas y reportes de sus sucursales asignadas. |
| `CASHIER` | Caja / Operador de panel | Revisa el panel de pedidos y cuentas, ajusta solicitudes antes de procesarlas, procesa pedidos, envía enlaces de seguimiento por WhatsApp, registra cobros manuales y cierra cuentas saldadas. |
| `WAITER` | Mesero | Abre mesas, confirma solicitudes entrantes de QR de mesa, toma comandas, envía a cocina y realiza la distribución informativa del consumo por persona. |
| `KITCHEN` | Cocina / Barra | Visualiza comandas por estación en pantalla KDS y actualiza estados de preparación (`PREPARING`, `READY`). |
| `DISPATCH_DRIVER` | Despacho / Reparto propio (opcional) | Marca pedidos de domicilio propio como despachados (`OUT_FOR_DELIVERY`) y entregados (`DELIVERED`). |
| `CUSTOMER` | Cliente / Comensal | Consulta el menú digital, arma el carrito, envía el pedido por WhatsApp o web/QR de mesa y consulta el seguimiento público sin necesidad de cuenta. |
| `PLATFORM_SUPPORT` | Soporte de la plataforma | Diagnostica incidencias y asiste en recuperación verificada de acceso con alcance temporal, autorizado y 100 % auditado. |
| `PLATFORM_ADMIN` | Administrador SaaS | Gestiona planes comerciales, *entitlements* de módulos y estado de suscripciones (`TRIALING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`) sin acceso rutinario a datos privados del comercio. |

---

## 4. Alcance funcional por módulos

### 4.0 Capacidades modulares, grafo de dependencias y perfiles de operación

**Dos capas de control independientes:**
1. **Habilitación por plan (`PlanEntitlement`):** Qué módulos permite el plan comercial contratado, administrada por el `PLATFORM_ADMIN`.
2. **Configuración del restaurante (`TenantModuleSetting`):** Qué módulos activa el restaurante a nivel de organización, con posibilidad de sobrescribir por sucursal (`branch_id`).

La evaluación sigue el orden jerárquico: `PlanEntitlement && !Module.is_post_mvp && (BranchSetting ?? TenantSetting ?? CoreModule)`.

**Núcleo obligatorio (`is_core = true`):** `identity-access`, `tenancy`, `capabilities`, `catalog` (menú digital y vitrina pública), motor base de precios (4.5) y `audit`.

**Catálogo completo de módulos en base de datos (16 módulos en `seed.ts`: 13 habilitables en el MVP + 3 reservados Post-MVP):**

| Módulo (`key`) | Estado MVP | Qué habilita | Requiere todos (`depends_on_all`) | Requiere al menos uno (`depends_on_any`) | Comportamiento si está desactivado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ordering` | **MVP** | Carrito de compras y recepción de pedidos digitales | — | — | El sitio público opera únicamente en modo consulta (solo lectura de menú). |
| `channel.pickup` | **MVP** | Pedidos para recoger en tienda (`fulfillment_type = PICKUP`) | `['ordering']` | — | No se ofrece la modalidad de recogida en el checkout. |
| `channel.delivery` | **MVP** | Domicilio (`fulfillment_type = DELIVERY`), zonas, cobertura y tarifas | `['ordering']` | — | No se solicitan direcciones ni se calcula envío. |
| `dining` | **MVP** | Salón: áreas, plano de mesas y cuentas abiertas (`DiningAccount`) | `['payments.manual']` | — | No existen mesas, cuentas ni QR por mesa; el sistema opera solo con pedidos. |
| `channel.dine_in_qr` | **MVP** | Autopedido del comensal escaneando el QR de su mesa (`origin = TABLE_QR`) | `['ordering', 'dining']` | — | Los QR de mesa no habilitan carrito; solo se permite consulta de carta general. |
| `dining.consumption_split` | **MVP** | Distribución informativa del consumo por persona en salón (4.4) | `['dining']` | — | La calculadora de asignación por comensal no aparece en la cuenta de mesa. |
| `order_panel` | **MVP** | Panel operativo de pedidos (modo liviano de 1 pantalla en Nivel 1 y modo completo con filtros/historial en Nivel 2+) | — | `['ordering', 'dining']` | No hay panel de pedidos activo. |
| `kitchen` | **MVP** | Pantalla de cocina (KDS) separada por estaciones de preparación | `['order_panel']` | `['ordering', 'dining']` | Los estados de preparación se avanzan directamente desde el panel de pedidos. |
| `tracking` | **MVP** | Página pública en vivo de seguimiento del pedido (`/t/:publicToken`) | `['ordering', 'order_panel']` | — | El enlace público muestra únicamente un recibo estático sin línea de tiempo. |
| `payments.manual` | **MVP** | Registro manual de cobros (efectivo, datáfono, transferencia) e instrucciones de pago | — | `['order_panel', 'dining']` | La plataforma no registra cobros presenciales en pedidos (política `NONE` y estado `NOT_TRACKED`). |
| `notifications.whatsapp_click` | **MVP** | Enlaces profundos click-to-chat (`wa.me`) cliente ↔ restaurante | `['ordering']` | — | El checkout confirma directamente en web sin redirigir a WhatsApp. |
| `notifications.email` | **MVP** | Avisos comerciales/operativos por correo electrónico hacia el comensal | `['ordering']` | — | No se envían correos al comensal. *(La seguridad e identidad de usuarios en `identity-access` nunca depende de este módulo).* |
| `reporting` | **MVP** | Reportes operativos, conciliación de ventas, tiempos y exportación CSV | — | `['order_panel', 'dining']` | Se oculta el módulo de reportes. |
| `payments.online` | *Post-MVP* | Pasarela de pagos en línea (PSE y tarjetas con webhooks) | — | `['ordering', 'dining']` | Reservado con `is_post_mvp = true` (Anexo Sección 21). |
| `payments.links` | *Post-MVP* | Links de pago bancarios compartibles por WhatsApp | `['payments.online']` | — | Reservado con `is_post_mvp = true` (Anexo Sección 21). |
| `notifications.whatsapp_api` | *Post-MVP* | Mensajería automática con WhatsApp Business API | `['ordering']` | — | Reservado con `is_post_mvp = true`. |

**Reglas de modularidad obligatorias:**
1. **Aplicación estricta en Backend (`ModuleCapabilityGuard`):** Todo endpoint de un módulo desactivado responde HTTP `403 Forbidden` con `{ errorCode: 'MODULE_DISABLED', moduleKey }`. Intentar activar un módulo con `is_post_mvp = true` responde HTTP `400 Bad Request` (`MODULE_RESERVED_POST_MVP`).
2. **Evaluación atómica del conjunto resultante en el grafo (`depends_on_all` y `depends_on_any`):** Cuando se guarda una configuración de módulos (`PATCH /admin/modules` o `/admin/branches/:id/modules`) o se aplica un perfil operativo, el validador construye primero el **conjunto completo resultante de módulos activos $S_{\text{final}}$ en una sola operación en lote**, y luego verifica que para todo $M \in S_{\text{final}}$ se cumpla $M.\text{depends\_on\_all} \subseteq S_{\text{final}}$ y (si $M.\text{depends\_on\_any} \neq \emptyset$) $M.\text{depends\_on\_any} \cap S_{\text{final}} \neq \emptyset$. Evaluar el conjunto resultante de forma atómica permite activar o desactivar simultáneamente módulos con dependencia mutua (como `dining` y `payments.manual`) sin bloqueos de orden secuencial.
3. **Desactivar nunca borra datos:** El histórico de órdenes, cuentas y pagos se conserva intacto en PostgreSQL para consulta en solo lectura.
4. **Bloqueo por operaciones abiertas (`OpenOperationsChecker`):** No se permite desactivar `dining` si existen `DiningAccount` en estado `OPEN` o `REOPENED_ACCOUNTING`, ni desactivar `kitchen` si existen órdenes en `PREPARING`, ni desactivar `payments.manual` mientras existan órdenes o cuentas activas en estado `UNPAID` o `PARTIALLY_PAID` (una vez que dichas órdenes se saldan como `PAID` o se resuelven explícitamente como `COURTESY` / `WRITTEN_OFF`, dejan de bloquear el cambio de módulo o perfil).
5. **Aplicación de perfiles sobre `BranchChannelPolicy` e inmutabilidad por pedido:**
   - Al aplicar un perfil operativo (`OperatingProfile`), su `default_pickup_delivery_policy` (`NONE` u `OFFLINE_ONLY`) se asigna únicamente a las filas `fulfillment_type IN ('PICKUP', 'DELIVERY')` de `BranchChannelPolicy`, mientras que la fila `fulfillment_type = 'DINE_IN'` se mantiene **siempre** con `payment_policy = 'OFFLINE_ONLY'`, `require_payment_before_preparation = false` y `enabled = (dining está activo)`.
   - Cada `Order` congela en su registro el `payment_policy` y el `require_payment_before_preparation` vigentes cuando fue creada. Al cambiar de perfil entre Nivel 1 (`NONE`) y Nivel 2+ (`OFFLINE_ONLY`), los pedidos históricos creados bajo `NONE` conservan su estado `NOT_TRACKED` y jamás se muestran como deuda pendiente (`UNPAID`). Si una sucursal baja la política de `PICKUP` o `DELIVERY` a `NONE`, el backend fuerza automáticamente `require_payment_before_preparation = false` en ese canal.

**Perfiles de operación preconfigurados del MVP:**

| Clave (`profile_key`) | Nombre del perfil | Módulos activos por defecto | Política para `PICKUP` / `DELIVERY` (`DINE_IN` es siempre `OFFLINE_ONLY`) | Caso de uso objetivo |
| :--- | :--- | :--- | :--- | :--- |
| `MENU_ONLY` | Solo menú | Núcleo (`catalog`) | `NONE` | Restaurante que solo busca presencia web y QR de consulta de carta. |
| `WHATSAPP_SIMPLE` | WhatsApp simple | `ordering`, `channel.pickup`, `channel.delivery` (opcional), `notifications.whatsapp_click`, `order_panel` (modo liviano), `tracking` | `NONE` (`NOT_TRACKED`) | Sin mesas ni control de caja en plataforma. El cliente pide en web y abre WhatsApp; el local ajusta/procesa en el panel de 1 pantalla y envía el link de seguimiento por el chat. |
| `FULL_PANEL` | Panel completo | `WHATSAPP_SIMPLE` + `order_panel` (modo completo), `payments.manual`, `reporting` (+ `kitchen` opcional) | `OFFLINE_ONLY` | Restaurante que desea mostrar instrucciones de transferencia (Nequi/DaviPlata/Bre-B), llevar control de cobros (`UNPAID`/`PARTIALLY_PAID`/`PAID`), tiempos de preparación, historial y reportes. |
| `DINING_ROOM` | Salón | `dining`, `ordering`, `channel.dine_in_qr`, `order_panel`, `kitchen`, `tracking`, `dining.consumption_split`, `payments.manual`, `reporting` | `OFFLINE_ONLY` | Servicio a la mesa con meseros, autopedido QR en mesa confirmado por mesero, KDS de cocina, división informativa y cierre de caja. |
| `ENTERPRISE_MULTI` | Completo / Multi-sucursal | Los 13 módulos del MVP activos, con sobrescritura independiente por sucursal | `OFFLINE_ONLY` | Cadenas o restaurantes que combinan salón, recogida, domicilio y cocina en una o varias sedes. |

### 4.0.1 Escalera de adopción para restaurantes pequeños

| Nivel | Perfil asociado | Qué hace el restaurante | Qué hace la plataforma | Qué NO necesita configurar |
| :--- | :--- | :--- | :--- | :--- |
| **Nivel 0: Menú Digital** | `MENU_ONLY` | Carga su menú básico | Genera sitio público responsive y código QR | Pedidos, pagos, panel, mesas |
| **Nivel 1: WhatsApp Simple** | `WHATSAPP_SIMPLE` | Pacta pago, domicilio y tiempo por chat; ajusta el pedido en el panel de 1 pantalla, pulsa **"Procesar pedido"** y envía por WhatsApp el link de seguimiento | Permite armar el carrito, registra la solicitud (`REQUESTED`, `payment_status = NOT_TRACKED`), redirige al chat del local, muestra la solicitud en el panel liviano y genera el link de seguimiento | Registro de caja, mesas, KDS de cocina |
| **Nivel 2: Panel Completo y Cocina** | `FULL_PANEL` | Publica sus instrucciones de Nequi/DaviPlata/Bre-B, usa filtros, pantalla de cocina KDS y registra cobros manuales (efectivo, datáfono, transferencia) | Habilita control de cobros (`UNPAID`/`PARTIALLY_PAID`/`PAID`), opción de exigir cobro antes de preparar en `PICKUP`/`DELIVERY`, estaciones de cocina y reportes conciliados | Mesas de salón |
| **Nivel 3: Salón y Multi-Sede** | `DINING_ROOM` / `ENTERPRISE_MULTI` | Activa zonas, mesas, meseros, QR de mesa, distribución informativa por persona y múltiples sucursales | Habilita el conjunto completo de los 13 módulos del MVP | — |

**Detalle operativo del Nivel 1 ("WhatsApp simple"):**
- **Lado del cliente:** Arma el carrito en la web; el backend recalcula los precios finales del catálogo. Ingresa nombre, **número de WhatsApp** (normalizado a `E.164`), modalidad (`PICKUP` o `DELIVERY`), dirección y notas, aceptando el aviso de datos personales. Al pulsar **"Terminar pedido por WhatsApp"**, se crea la solicitud en estado `REQUESTED` (`origin = 'WHATSAPP'`, `payment_policy = 'NONE'`, `payment_status = 'NOT_TRACKED'`) y se redirige a `https://wa.me/<telefono_sucursal>?text=...` con el código del pedido (ej. `#A104`) y el detalle de productos.
- **Lado del restaurante (Panel Liviano de 1 pantalla):** Tras pactar detalles en el chat de WhatsApp, el operador ve en el panel la tarjeta pendiente `#A104`, compara el teléfono registrado con el del chat, edita ítems o agrega el valor del domicilio (`delivery_fee_cop`) si cambiaron (quedando auditado en `OrderEdit`) y pulsa **"Procesar pedido"**. El pedido pasa a `ACCEPTED`, se bloquea (`is_locked = true`) y se abre WhatsApp hacia el número del cliente con el enlace público de resumen y seguimiento (más un botón **"Copiar mensaje"** por si escribió desde otra línea).
- **Onboarding mínimo:** Solo exige nombre del restaurante, número de WhatsApp, horario y productos con `nombre`, `precio_cop` y `categoría` (soportando importación masiva por CSV o pegado de tabla).

### 4.1 Organización, sucursales y cuentas de usuario del personal

- Creación de la organización (`Tenant`) y de una o múltiples sucursales (`Branch`).
- Personalización de marca (`BrandSettings`): logo, colores primario/secundario, imagen de portada y descripción.
- Configuración por sucursal de dirección, horarios de atención, zonas de cobertura, tarifas de domicilio, pedido mínimo, tiempos estimados e instrucciones de pago directo (`payment_instructions_json`).
- **Ciclo completo de cuentas de usuario sin depender del módulo comercial `notifications.email`:**
  - *Alta e invitación de personal (`POST /api/v1/admin/users`):* El `TENANT_ADMIN` o `BRANCH_MANAGER` registra a un miembro del equipo asignándole rol y `branch_scope`. El sistema permite asignarle una **contraseña temporal de un solo uso** (`must_change_password = true`) o generar un **enlace único de activación/invitación con vigencia de 24 horas** que el administrador copia o envía con un toque por WhatsApp (`wa.me`).
  - *Cambio obligatorio y restablecimiento de empleados:* Al iniciar sesión con `must_change_password = true`, el sistema exige definir una contraseña personal antes de operar. Si un empleado olvida su clave, el administrador/gerente la restablece desde `/admin/users` (`POST /api/v1/admin/users/:userId/reset-password`) generando una nueva clave temporal o enlace para WhatsApp.
  - *Recuperación de contraseña de propietarios (`TENANT_ADMIN`):* El módulo nuclear `identity-access` provee `POST /api/v1/auth/forgot-password` y `POST /api/v1/auth/reset-password`. El token de recuperación se envía mediante un transporte de correo transaccional de sistema propio de `identity-access` (independiente del módulo opcional `notifications.email` que es solo para comensales) y, como respaldo asistido, `PLATFORM_SUPPORT` / `PLATFORM_ADMIN` puede generar un enlace temporal de recuperación verificando la identidad del propietario y entregándolo al WhatsApp registrado de la organización, dejando registro obligatorio en `AuditEvent`.

### 4.2 Presencia web, menú digital y códigos QR (`catalog`)

- URL pública estable por restaurante (`/r/:restaurantSlug`) y por sucursal (`/r/:restaurantSlug/b/:branchSlug`), con inyección en servidor de etiquetas **OpenGraph (`og:title`, `og:description`, `og:image`)** para que al compartir el link en WhatsApp se visualice la tarjeta con la marca del restaurante.
- Catálogo estructurado en menús, categorías ordenables, productos con precio entero en `COP`, variantes opcionales, grupos de modificadores con reglas `min_selections` / `max_selections` y botón de agotado instantáneo (`OUT_OF_STOCK`).
- Tabla unificada `QrCodeLink` con token criptográfico opaco (`qr_token`) y revocable para menú general, sucursal o mesa específica (`DINING_TABLE`).

### 4.3 Salón, mesas, cuentas abiertas y QR de mesa (`dining`)

- Configuración de áreas/zonas (`DiningArea`) y plano de mesas (`Table`) con estados en tiempo real: `FREE`, `OCCUPIED`, `PENDING_PAYMENT`, `RESERVED`.
- Apertura de una única cuenta abierta (`DiningAccount` en estado `OPEN`) por mesa ocupada, agrupando múltiples órdenes sucesivas (`fulfillment_type = 'DINE_IN'`).
- **Gestión centralizada del pago en la `DiningAccount`:** En la modalidad `DINE_IN`, los pagos se registran exclusivamente sobre la `DiningAccount` (`Payment.account_id`), nunca sobre órdenes individuales (`Order.dining_account_id IS NOT NULL`). Mientras la cuenta está en `OPEN` o `REOPENED_ACCOUNTING`, sus órdenes hijas reflejan `payment_status = 'UNPAID'`; al cerrarse la cuenta (`CLOSED`), todas sus órdenes hijas no canceladas sincronizan su `payment_status` con el estado final de la `DiningAccount` (`PAID`, `COURTESY` o `WRITTEN_OFF`).
- Control de concurrencia mediante columna `version` (optimista) y bloqueo `SELECT ... FOR UPDATE` (pesimista) para evitar sobrescrituras entre varios meseros.
- Traslado auditado de cuenta entre mesas (`POST /api/v1/accounts/:accountId/transfer-table`).
- **Dos vías de cierre de cuenta (`DiningAccount`) y dos modos de reapertura (`reopen`):**
  1. *Cierre estándar por cobro total:* Al registrar en caja el pago (único o combinado en `payments.manual`) que lleva `paid_total_cop == grand_total_cop`, la cuenta cambia a `payment_status = 'PAID'`, `status = 'CLOSED'` y, si estaba en `OPEN`, libera la mesa (`FREE`).
  2. *Cierre con resolución explícita de saldo (`POST /api/v1/accounts/:accountId/close`):*
     - Si `grand_total_cop == 0` (sin consumo tras anulación de ítems), puede cerrarse directamente con motivo (`payment_status = 'PAID'`).
     - Si existe saldo por cobrar (`uncollected_amount_cop = grand_total_cop - paid_total_cop > 0`), solo un `BRANCH_MANAGER` o `TENANT_ADMIN` puede cerrar la cuenta eligiendo obligatoriamente una resolución financiera: **`COURTESY`** (cortesía/invitación de la casa) o **`WRITTEN_OFF`** (castigo por saldo incobrable/fuga), junto con motivo obligatorio. La cuenta queda en `status = 'CLOSED'`, `payment_status = 'COURTESY' | 'WRITTEN_OFF'`, registra el `uncollected_amount_cop` y audita en `AuditEvent`.
  3. *Congelamiento en estado `CLOSED` y dos modos en `POST /api/v1/accounts/:accountId/reopen`:*
     - Una cuenta en `status = 'CLOSED'` no permite registrar ni anular pagos directamente (`409 ACCOUNT_IS_CLOSED`).
     - Si un `BRANCH_MANAGER` o `TENANT_ADMIN` necesita corregir una cuenta cerrada con motivo obligatorio, elige uno de dos modos:
       - **`mode = 'ACCOUNTING_ONLY'` (Reapertura contable en caja sin ocupar la mesa física):** Pasa la cuenta a `status = 'REOPENED_ACCOUNTING'`. **No modifica `Table.status` ni requiere que la mesa esté libre**, y tampoco entra en conflicto con el índice único parcial `WHERE status = 'OPEN'` por si la mesa ya fue ocupada por nuevos comensales. Limpia cualquier resolución previa (`uncollected_amount_cop = 0`, `resolution_type = NULL`), ejecuta `recalculatePaymentState()` sobre la cuenta y permite anular cobros mal digitados (`void`), registrar el cobro correcto o cobrar un saldo que estaba en `WRITTEN_OFF`, para luego volver a cerrarla (`CLOSED`).
       - **`mode = 'FULL_TABLE'` (Reapertura operativa de mesa):** Exige que la mesa física esté actualmente `FREE` (`409 TABLE_ALREADY_OCCUPIED` si está ocupada). Pasa la cuenta a `status = 'OPEN'` y la mesa a `OCCUPIED`, permitiendo tanto agregar nuevas comandas de comida como ajustar cobros.
- **Seguridad en Autopedido por QR de Mesa (`channel.dine_in_qr`):**
  - Cuando un comensal escanea el QR de una mesa y envía un pedido (`origin = 'TABLE_QR'`, `fulfillment_type = 'DINE_IN'`), la orden nace obligatoriamente en estado **`REQUESTED`** (no pasa directo a cocina).
  - Opcionalmente, la sucursal puede exigir el `table_session_pin` de 4 dígitos generado al abrir la `DiningAccount` de esa mesa.
  - El mesero o el operador del panel recibe una alerta en vivo (*"Solicitud desde QR en Mesa M-04"*) y la confirma con un toque (**`ACCEPTED`**), momento en el cual se suma a la `DiningAccount` y entra a la pantalla de cocina (`kitchen`).

### 4.4 Distribución informativa del consumo por persona (`dining.consumption_split`)

- Propósito **100 % informativo**: permite a un grupo de comensales saber cuánto le corresponde aportar a cada uno (`Persona 1`, `Persona 2`, `Persona 3`), manteniendo una sola `DiningAccount` y un único cierre de cobro por el total de la mesa.
- Soporta asignación de unidades enteras y reparto de platos compartidos entre varios comensales usando partes enteras (`share_units` sobre `total_item_shares`) y persistiendo el monto en pesos ya conciliado (`assigned_amount_cop`) como fuente de verdad.
- **Invariante financiero:** $\sum \text{assigned\_amount\_cop por persona} + \text{unassigned\_amount\_cop} \equiv \text{DiningAccount.grand\_total\_cop}$ al peso exacto (`1 COP`).

### 4.5 Precios, impuestos, configuración tributaria y aviso fiscal DIAN (Colombia)

- **Tres modos configurables por restaurante (`Tenant.tax_profile_mode`):**
  1. `FINAL_PRICE_NO_BREAKDOWN` *(Por defecto en Niveles 0 y 1)*: El precio publicado es el precio final (`$10.000 x 2 = $20.000`). No exige configurar tasas ni muestra tabla de discriminación tributaria.
  2. `TAX_INCLUDED_DISCRIMINATED` *(Habitual en restaurantes responsables de INC 8 % o IVA 19 %)*: El precio publicado de `$10.000` ya incluye el impuesto (cantidad `2` = `$20.000` total). El backend extrae internamente $\text{Base} = \text{Math.round}(\text{Total} / (1 + r))$ e $\text{Impuesto} = \text{Total} - \text{Base}$ sin cobrarlo dos veces.
  3. `BASE_PLUS_TAX`: El precio del producto es base antes de impuestos y el sistema calcula y suma el impuesto aplicable.
- Cada `OrderItem` guarda instantáneas inmutables (`product_snapshot_json`, `modifiers_snapshot_json`, `tax_snapshot_json`) al momento de la venta.
- La propina voluntaria (`tip_cop`) se maneja por separado y nunca se incluye en la base gravable del INC ni del IVA.
- **Aviso fiscal obligatorio (No equivalencia con Factura Electrónica DIAN):** La configuración de impuestos en el MVP tiene fines de control operativo y desglose informativo en pre-cuenta. Todo resumen web y todo pre-recibo impreso (58mm/80mm) incluye de forma visible la leyenda: *"Documento informativo de control interno / pre-cuenta — No sustituye la factura electrónica de venta ni el documento equivalente POS exigido por la DIAN"*.

### 4.6 Ciclo de vida del pedido, seguimiento al cliente y controles antifraude (`ordering` + `tracking`)

#### 4.6.1 Máquina de estados del pedido (`OrderStatus`)

| Estado interno (`OrderStatus`) | Significado operativo | Mensaje por defecto al cliente | ¿Es omitible? |
| :--- | :--- | :--- | :--- |
| `REQUESTED` | Solicitud iniciada por WhatsApp o desde QR de mesa, pendiente de confirmación del local/mesero (no admite cobros en este estado) | *"Enviamos tu solicitud al restaurante; pronto la confirmará."* | Inicial en `WHATSAPP` y `TABLE_QR` |
| `RECEIVED` | Pedido recibido directamente en el panel web (`origin = WEB_DIRECT`) | *"Recibimos tu pedido."* | Inicial en `WEB_DIRECT` |
| `ACCEPTED` | El restaurante/mesero verificó, ajustó (si aplicaba) y procesó el pedido | *"El restaurante confirmó tu pedido."* | Obligatorio en `WHATSAPP` y `TABLE_QR` |
| `PREPARING` | En preparación en cocina | *"Estamos preparando tu pedido."* | Sí |
| `READY` | Listo para recoger, despachar o servir en mesa | *"Tu pedido está listo."* | Sí |
| `OUT_FOR_DELIVERY` | En camino con el domiciliario (exclusivo de `fulfillment_type = DELIVERY`) | *"Tu pedido va en camino."* | Sí (solo aplica a `DELIVERY`) |
| `DELIVERED` / `PICKED_UP` / `SERVED` | Estado final exitoso según `fulfillment_type` (`DELIVERY` / `PICKUP` / `DINE_IN`) | *"Pedido entregado / recogido / servido."* | No (estado final obligatorio) |
| `REJECTED` / `CANCELLED` | Rechazado o cancelado con motivo (bloqueado si tiene pagos vigentes sin anular) | Mensaje con el motivo si el local decide mostrarlo | Terminal de excepción |
| `EXPIRED_UNPROCESSED` | Solicitud `REQUESTED` no procesada tras el tiempo de caducidad | No visible como venta; archivada automáticamente | Automático por scheduler |

- **Página pública de seguimiento (`/t/:publicOrderToken`):** Accesible sin cuenta mediante token opaco de 32 bytes, con pre-render de etiquetas OpenGraph para WhatsApp, datos personales enmascarados (`+57 *** *** 4567`), visualización de las instrucciones de pago del comercio (`payment_instructions_json`) cuando el pedido tiene política `OFFLINE_ONLY` y está en `UNPAID` o `PARTIALLY_PAID`, y actualización en vivo vía SSE.

#### 4.6.2 Controles antifraude para pedidos sin pasarela en línea

Dado que en el MVP los pedidos ingresan sin pasarela de pago en línea, el backend aplica cinco controles obligatorios contra pedidos falsos o abuso:
1. **Confirmación humana obligatoria y pre-cobro opcional antes de cocina:** Toda solicitud por WhatsApp (`origin = 'WHATSAPP'`) o QR de mesa (`origin = 'TABLE_QR'`) nace en `REQUESTED` y jamás entra al KDS de cocina hasta que el personal la confirma (`ACCEPTED`). Adicionalmente, para las modalidades `PICKUP` y `DELIVERY` que operen bajo política `OFFLINE_ONLY` (tanto `WEB_DIRECT` como `WHATSAPP`), la sucursal puede activar `require_payment_before_preparation = true` para impedir que el pedido pase a `PREPARING` o al KDS hasta que caja verifique el pago y el pedido esté en `payment_status = 'PAID'`.
2. **Límite de frecuencia (*Rate Limiting*) por teléfono e IP/dispositivo:** El endpoint `POST /api/v1/public/orders` limita la creación a máximo `3` pedidos activos sin finalizar por cada `phone_e164` dentro de una misma sucursal y aplica *rate limiting* por IP en NestJS.
3. **Lista de bloqueo por restaurante resistente a anonimización (`Customer.is_blocked` + `blocked_phone_hmac`):** El gerente o administrador puede bloquear cualquier número telefónico que haya realizado pedidos falsos (`PATCH /api/v1/admin/customers/:customerId/block`). Al crear un pedido público, el backend verifica que no exista un cliente bloqueado con ese `phone_e164` ni con su firma `HMAC_SHA256(FRAUD_PEPPER_SECRET, tenant_id + ":" + phone_e164)` en `blocked_phone_hmac`.
4. **Monto de pedido mínimo y validación de cobertura:** Para `fulfillment_type = 'DELIVERY'`, el backend exige cumplir el `min_order_cop` y pertenecer a una `DeliveryZone` activa de la sucursal.
5. **Caducidad automática segura de solicitudes abandonadas:** Las solicitudes en `status = 'REQUESTED'` (las cuales tienen prohibido recibir registros de cobro y por tanto tienen siempre `paid_total_cop == 0`) caducan automáticamente a `EXPIRED_UNPROCESSED` tras `unprocessed_expiry_minutes` (por defecto 240 min), sin riesgo de dejar pagos huérfanos.

#### 4.6.3 Mecánica de click-to-chat (`wa.me`) y gestión del número del cliente

- **Mecanismo técnico:** Enlaces estándar `https://wa.me/<numero_e164>?text=<texto_url_encoded>` en ambos sentidos (cliente → sucursal con el código `#A104`, y sucursal → número registrado del cliente al pulsar **"Procesar pedido"**).
- **Mitigación ante errores de digitación del número:** (1) Código `#A104` en la primera línea del mensaje inicial; (2) teléfono registrado visible en la tarjeta del panel para compararlo con el remitente del chat; (3) botón **"Copiar mensaje"** junto al botón de abrir WhatsApp para pegarlo manualmente en el chat activo; y (4) enlace de seguimiento opaco con PII enmascarado.

### 4.7 Cocina y preparación (`kitchen`)

- Vista KDS filtrable por estación (`KitchenStation`: ej. `PARRILLA`, `FRIOS`, `BEBIDAS`, o `GENERAL` por defecto).
- Semáforo visual de tiempos de espera, marcación táctil por ítem o por comanda completa (`PENDING` → `PREPARING` → `READY`) y sincronización automática del estado agregado hacia la `Order` principal y la pantalla del cliente.
- Si una orden de `PICKUP` o `DELIVERY` bajo política `OFFLINE_ONLY` tiene activa la bandera `require_payment_before_preparation = true` y su `payment_status` aún no es `PAID`, el backend retiene su paso a `PREPARING` y a la cola KDS hasta que caja registre el cobro total (`PAID`). En `DINE_IN` la bandera es siempre `false` y las comandas aceptadas pasan de inmediato al KDS.

### 4.8 Políticas de cobro, recálculo de saldos y resolución post-cierre (`payments.manual`)

En el MVP existen dos políticas de cobro configurables en `BranchChannelPolicy`:
- `NONE`: Permitida únicamente en `PICKUP` y `DELIVERY` cuando el restaurante no gestiona caja en la plataforma. La orden nace y permanece de forma inmutable con **`payment_status = 'NOT_TRACKED'`** (valor por defecto en `MENU_ONLY` y `WHATSAPP_SIMPLE`).
- `OFFLINE_ONLY`: Obligatoria siempre en `DINE_IN` y valor por defecto para todos los canales en `FULL_PANEL`, `DINING_ROOM` y `ENTERPRISE_MULTI`. El cobro es presencial o por transferencia directa al comercio (Nequi, DaviPlata, Bre-B, Bancolombia, etc.), el personal lo registra mediante `payments.manual` y la orden o cuenta nace con **`payment_status = 'UNPAID'`**.

**Acotación estricta de `require_payment_before_preparation`:**
- Solo puede ser `true` cuando `payment_policy == 'OFFLINE_ONLY'` **y** `fulfillment_type IN ('PICKUP', 'DELIVERY')`.
- Está prohibido (en validación de API y mediante restricción `CHECK` en PostgreSQL) activarla cuando `payment_policy == 'NONE'` o cuando `fulfillment_type == 'DINE_IN'`.
- Si el administrador cambia `payment_policy` de `OFFLINE_ONLY` a `NONE` en `PICKUP` o `DELIVERY`, el backend fuerza automáticamente `require_payment_before_preparation = false`.

**Reglas de integridad de cobros manuales, recálculo y reversión (`ManualPaymentsService`):**
- **Medios soportados en `Payment.method`:** `CASH` (Efectivo, con cálculo automático de cambio/devuelta `change_given_cop`), `POS_TERMINAL` (Datáfono) y `MANUAL_TRANSFER` (Nequi, DaviPlata, Bre-B o transferencia verificada por el cajero).
- **Condiciones previas verificadas bajo bloqueo `SELECT ... FOR UPDATE` antes de insertar un cobro:**
  1. Destino exclusivo (`CHECK` en tabla `payments`): `order_id IS NOT NULL` (pedido independiente) XOR `account_id IS NOT NULL` (cuenta de salón). Intentar cobrar directamente una orden hija de mesa responde `409 PAY_VIA_DINING_ACCOUNT`.
  2. Política válida: Prohibido cobrar sobre órdenes con `payment_policy = 'NONE'` (`409 PAYMENT_NOT_ALLOWED_FOR_POLICY`).
  3. Estado operativo válido: Al bloquear la fila en `orders` con `SELECT ... FOR UPDATE`, el servicio verifica que `order.status != 'REQUESTED'` (`409 ORDER_MUST_BE_ACCEPTED_BEFORE_PAYMENT`) y que no esté en `REJECTED`, `CANCELLED` ni `EXPIRED_UNPROCESSED`. Adicionalmente, la propia tabla `orders` tiene la restricción local `CHECK (status != 'REQUESTED' OR paid_total_cop = 0)`, que aborta cualquier transacción que intente dejar `paid_total_cop > 0` mientras `status = 'REQUESTED'`.
  4. Sin bloqueo por cierre o resolución: Prohibido cobrar o anular pagos sobre una orden resuelta (`COURTESY` / `WRITTEN_OFF`) o sobre una `DiningAccount` en `status = 'CLOSED'` sin antes revertir la resolución (`revert-resolution`) o reabrir la cuenta (`reopen` en modo `ACCOUNTING_ONLY` o `FULL_TABLE`).
- **Función única determinista de recálculo (`recalculatePaymentState`):**
  Cada vez que se registra un cobro (`Payment.status = 'APPROVED'`), se anula un cobro (`Payment.status = 'VOIDED'`), se edita el total de una orden o se revierte una resolución, el backend ejecuta dentro de la misma transacción:
  $$\text{paid\_total\_cop} = \sum (\text{Payment.amount\_cop} \text{ donde } \text{status} = \text{'APPROVED'})$$
  - Si `payment_policy == 'NONE'` $\implies$ `payment_status = 'NOT_TRACKED'`, `uncollected_amount_cop = 0`.
  - Si no tiene resolución activa (`COURTESY` / `WRITTEN_OFF`):
    - Si $\text{paid\_total\_cop} == 0 \implies \text{payment\_status} = \text{'UNPAID'}$.
    - Si $0 < \text{paid\_total\_cop} < \text{grand\_total\_cop} \implies \text{payment\_status} = \text{'PARTIALLY\_PAID'}$.
    - Si $\text{paid\_total\_cop} == \text{grand\_total\_cop} \implies \text{payment\_status} = \text{'PAID'}$.
- **Resolución y reversión de saldos no cobrados en órdenes (`resolve-uncollected` y `revert-resolution`):**
  - *Resolución (`POST /api/v1/orders/:orderId/resolve-uncollected`):* Exclusivo de `BRANCH_MANAGER` / `TENANT_ADMIN` sobre órdenes independientes `OFFLINE_ONLY` en `UNPAID` o `PARTIALLY_PAID` (`grand_total_cop > paid_total_cop`). Para `COURTESY`, la orden debe estar en `ACCEPTED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`, `DELIVERED` o `PICKED_UP`; para `WRITTEN_OFF` (incobrable), la orden debe estar en `READY`, `OUT_FOR_DELIVERY`, `DELIVERED` o `PICKED_UP`. Fija `uncollected_amount_cop = grand_total_cop - paid_total_cop`, cambia `payment_status` a `COURTESY` o `WRITTEN_OFF` y registra motivo obligatorio en `AuditEvent`.
  - *Reversión (`POST /api/v1/orders/:orderId/revert-resolution`):* Si el cliente regresa a pagar un pedido `WRITTEN_OFF` o se corrige una `COURTESY`, un `BRANCH_MANAGER` o `TENANT_ADMIN` revierte la resolución con motivo obligatorio: limpia `uncollected_amount_cop = 0`, ejecuta `recalculatePaymentState()` (devolviendo la orden a `UNPAID` o `PARTIALLY_PAID`), audita en `AuditEvent` y habilita nuevamente el registro del cobro en `payments.manual`.

### 4.9 Reportes, no doble conteo y prelación de imputación en pagos parciales (`reporting`)

Para garantizar conciliación contable exacta al peso colombiano en todos los escenarios, el módulo `reporting` aplica cuatro reglas formales:

1. **Unidad contable de agregación (Cero doble conteo en Salón):**
   - Los totalizadores financieros (`gross_billed_total_cop`, `collected_total_cop`, `pending_receivable_cop`, `courtesy_total_cop`, `written_off_total_cop`) se calculan sumando dos conjuntos disjuntos: (a) las **órdenes independientes** (`Order` donde `dining_account_id IS NULL` y `payment_policy = 'OFFLINE_ONLY'` en estados confirmados `ACCEPTED` a `DELIVERED`/`PICKED_UP`) y (b) las **cuentas de mesa** (`DiningAccount` no canceladas).
   - Las órdenes hijas de una mesa (`Order` donde `dining_account_id IS NOT NULL`) **jamás se suman por separado en los totales monetarios** para no duplicar los valores ya consolidados en su `DiningAccount`; sus `OrderItem` se consultan únicamente para el ranking de productos vendidos y tiempos de preparación en cocina.
   - *Construcción incremental por fases:* En la **Fase 05** (que cierra el Nivel 2 `FULL_PANEL`), el módulo `reporting` se construye sobre el conjunto de órdenes independientes; en la **Fase 06** (que incorpora el módulo `dining`), se extiende `ReportingService` para unir los agregados de `DiningAccount` y las métricas de rotación de mesas cuando `dining` está activo.
2. **Composición de la Facturación Confirmada (`OFFLINE_ONLY`) y Ecuación Maestra de Conciliación:**
   - `net_products_sales_cop`: Subtotal de productos menos descuentos (con desglose de base gravable e impuestos `INC` / `IVA`).
   - `delivery_fees_total_cop`: Total de recargos de domicilio.
   - `tips_total_cop`: Total de propinas voluntarias (fuera de la base gravable y separadas de la venta gastronómica).
   - **Total General Facturado (`gross_billed_total_cop`):**
     $$\text{gross\_billed\_total\_cop} = \text{net\_products\_sales\_cop} + \text{delivery\_fees\_total\_cop} + \text{tips\_total\_cop}$$
   - **Ecuación Maestra de Conciliación de Saldos (`OFFLINE_ONLY`):**
     $$\text{gross\_billed\_total\_cop} \equiv \text{collected\_total\_cop} + \text{pending\_receivable\_cop} + \text{courtesy\_total\_cop} + \text{written\_off\_total\_cop}$$
3. **Regla de Prelación de Imputación en Cobros Parciales (`PARTIALLY_PAID`):**
   Cuando una orden o cuenta tiene un pago parcial ($0 < \text{paid\_total\_cop} < \text{grand\_total\_cop}$), para desglosar qué parte de `paid_total_cop` corresponde a venta de productos, domicilio y propina en el reporte de recaudos, se aplica orden de prelación en cascada:
   - **1.º Productos e impuestos:** $\text{collected\_products\_cop} = \min(\text{paid\_total\_cop}, \text{net\_products\_sales\_cop})$
   - **2.º Recargo de domicilio:** $\text{collected\_delivery\_cop} = \min(\max(0, \text{paid\_total\_cop} - \text{net\_products\_sales\_cop}), \text{delivery\_fees\_total\_cop})$
   - **3.º Propina voluntaria:** $\text{collected\_tips\_cop} = \max(0, \text{paid\_total\_cop} - \text{net\_products\_sales\_cop} - \text{delivery\_fees\_total\_cop})$
   *(Cumpliendo siempre $\text{collected\_products\_cop} + \text{collected\_delivery\_cop} + \text{collected\_tips\_cop} \equiv \text{paid\_total\_cop}$).*
4. **Volumen Sin Seguimiento (`not_tracked_orders_summary`) y Exportación CSV sin PII:**
   - Los pedidos creados en Nivel 1 bajo `payment_policy = 'NONE'` (`NOT_TRACKED`) se presentan en un indicador separado de volumen nominal.
   - El archivo descargado en `GET /api/v1/reports/sales/export-csv` contiene exclusivamente columnas contables y operativas (`order_code` / `account_code`, fecha/hora, sucursal, origen, modalidad, estado operativo, estado de pago, venta neta de productos, base, impuesto, domicilio, propina, total facturado, monto recaudado por método y monto no recaudado con su tipo de resolución), **omitiendo por diseño nombres, teléfonos y direcciones de clientes** para proteger la privacidad (Ley 1581).

### 4.10 Horizonte Post-MVP (Funcionalidades para etapas posteriores)

- **Pasarelas de Pago en Línea (`payments.online`) y Links de Pago (`payments.links`):** Su arquitectura y el delta controlado de esquema y estados (`ONLINE_OPTIONAL`, `ONLINE_REQUIRED`, `AWAITING_PAYMENT`, `PENDING`, `REFUNDED` y tablas de proveedor) se especifican en el **Anexo Sección 21**.
- **Empaquetado Móvil Nativo con CapacitorJS:** Compilación de `apps/web` a binarios `.aab` (Android) e `.ipa` (iOS) con notificaciones Push nativas en segundo plano e impresión térmica directa ESC/POS por Bluetooth/LAN.
- **Expansión Operativa y Corporativa:** Inventario y recetas con descuento de insumos, facturación electrónica DIAN mediante proveedor tecnológico habilitado, API oficial de WhatsApp Business y conectores con operadores logísticos externos.

---

## 5. Modelo comercial SaaS y estrategia de pagos

### 5.1 Suscripción SaaS manual en el MVP

Cada restaurante contrata un plan comercial (`Subscription`) alineado con la escalera de adopción:
- `PLAN_STARTER_WHATSAPP`: Niveles 0 y 1 (Menú digital, QR, WhatsApp simple, Panel Liviano y Tracking).
- `PLAN_OPERATIONS_PRO`: Nivel 2 (Panel Completo, Cobros Manuales, Instrucciones de Transferencia, Cocina KDS y Reportes).
- `PLAN_ENTERPRISE_DINING`: Nivel 3 (Salón, Mesas, QR de mesa, Distribución informativa por persona y Multi-sucursal).

En el MVP, la activación y cambio de estado de la suscripción (`TRIALING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`) la ejecuta manualmente el `PLATFORM_ADMIN` en el módulo `billing-subscription` tras verificar el pago directo del restaurante a la plataforma.

### 5.2 Cobros directos del restaurante en el MVP y modelo Direct-to-Merchant Post-MVP

- **En el MVP:** El 100 % del dinero de las ventas de comida lo recibe directamente el restaurante en efectivo, en su datáfono o en sus cuentas/billeteras (Nequi, DaviPlata, Bre-B, Bancolombia, etc.) sin intermediación de la plataforma.
- **En el Horizonte Post-MVP (cuando se habilite `payments.online`):** Cada restaurante vinculará su propia cuenta de pasarela (Wompi o ePayco) para que el dinero se abone directamente a su banco (ver Anexo Sección 21).

---

## 6. Referencia de pasarelas en Colombia (Reservado para Horizonte Post-MVP)

*Datos públicos oficiales consultados el 2026-10-19 y conservados como referencia para el Anexo Post-MVP (Sección 21):*
- **Wompi (Bancolombia):** Plan Avanzado Agregador con tarifa pública de `2,65 % + $700 COP + IVA` por transacción exitosa; exige cuenta Bancolombia o Nequi y RUT original en PDF, con abono al día hábil siguiente. Soporta PSE, tarjetas, Nequi, Widget Checkout, links por API y webhooks firmados con SHA256.
- **ePayco (Davivienda):** Modelo agregador con tarifas públicas desde `2,64 % + $690 COP + IVA` (comercios con cuenta Davivienda vinculada) y `3,29 % + $700 COP + IVA` (cuentas de otros bancos), informando tarifa especial de PSE de `$2.000 COP + IVA` para transacciones inferiores a `$60.000 COP` (`POR VALIDAR` tabla completa por rangos y condiciones contractuales antes de integrar en Post-MVP).

---

## 7. Arquitectura técnica definitiva (React + NestJS + PostgreSQL)

### 7.1 Estilo arquitectónico: Monolito Modular en Monorepo + Headless API

Se implementa un **Monolito Modular en NestJS** acompañado de una aplicación **React (SPA + PWA instalable)** dentro de un **Monorepo TypeScript gestionado con Turborepo y pnpm**:
- **Backend Headless (`apps/api`):** Concentra el 100 % de las reglas de negocio, aritmética en pesos enteros (`COP`), validación atómica del grafo de módulos, seguridad multi-tenant, controles antifraude y emisión de eventos SSE.
- **Paquete Compartido (`packages/shared`):** Fuente única de verdad para esquemas `Zod`, tipos TypeScript, DTOs, catálogo de los 16 módulos, máquinas de estado y calculadoras matemáticas puras.

### 7.2 Estrategia Multiplataforma en el MVP: Web Mobile-First + PWA

1. **Comensal (Cliente final):** Accede desde el navegador móvil vía enlace de WhatsApp/redes o código QR. El servidor NestJS inyecta las meta-etiquetas OpenGraph en el HTML inicial de `/r/:slug` y `/t/:token` para que WhatsApp muestre vista previa con nombre, logo y estado del pedido.
2. **Personal del Restaurante (Admin, Caja, Meseros, Cocina):** Opera desde computador, tablet o celular mediante navegador o instalando la **PWA (`manifest.webmanifest` + Service Worker)** en pantalla completa, con alertas sonoras mediante Web Audio API e impresión de comandas/pre-cuentas informativas vía diálogo de impresión térmica CSS (`@media print` de 58mm / 80mm con leyenda fiscal DIAN).

### 7.3 Stack tecnológico definitivo y convenciones técnicas críticas

| Capa | Tecnología seleccionada | Convención técnica obligatoria |
| :--- | :--- | :--- |
| **Monorepo & Gestor** | **Turborepo + pnpm workspaces** | Versiones exactas fijadas en `STACK_VERSIONS.md`. |
| **Frontend (Web / PWA)** | **React 18 + TypeScript + Vite** | División de código (*lazy loading*) separando el bundle público del comensal del bundle operativo del restaurante. |
| **UI & Estado** | **Tailwind CSS + shadcn/ui + TanStack Query v5 + Zustand** | Variables CSS dinámicas para marca del restaurante; Zustand persistente en `localStorage` para el carrito por sede. |
| **Tiempo Real (SSE)** | **NestJS `@Sse()` + `@microsoft/fetch-event-source`** | En rutas privadas (`/api/v1/branches/:id/orders/events`) React usa `@microsoft/fetch-event-source` para enviar el header `Authorization: Bearer <jwt>`; en la ruta pública (`/t/:token`) usa el token opaco con fallback automático a *polling*. |
| **Backend API** | **NestJS 10 + Node.js 22 LTS + TypeScript** | Guards globales (`JwtAuthGuard`, `TenantContextGuard`, `ModuleCapabilityGuard`, `PermissionsGuard`), Rate Limiting antifraude, Pino Logger estructurado y controlador de metadatos OpenGraph. |
| **Base de Datos & ORM** | **PostgreSQL 16 + Prisma ORM** | Toda consulta de tenant corre dentro de `PrismaService.withTenant(tenantId, fn)` ejecutando `SELECT set_config('app.current_tenant_id', $1, true)` dentro de una transacción interactiva para garantizar compatibilidad con *Row-Level Security (RLS)* y *connection pooling*. |

### 7.4 Estructura completa del proyecto (Árbol del Monorepo del MVP)

~~~text
restaurante-saas/
├── STACK_VERSIONS.md                        # Versiones exactas fijadas de Node, pnpm, NestJS, React, Prisma y librerías
├── docker-compose.yml                       # PostgreSQL 16 local para desarrollo y pruebas E2E
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── apps/
│   ├── api/                                 # BACKEND: Monolito Modular en NestJS
│   │   ├── prisma/
│   │   │   ├── schema.prisma                # Esquema relacional único en PostgreSQL (Sección 9)
│   │   │   ├── migrations/                  # Migraciones SQL + políticas RLS + restricciones CHECK
│   │   │   └── seed.ts                      # Roles, permisos, los 16 módulos (13 MVP + 3 Post-MVP) y los 5 perfiles
│   │   ├── src/
│   │   │   ├── main.ts                      # Bootstrap, Pino Logger, CORS, Helmet, Rate Limiting y OpenAPI
│   │   │   ├── app.module.ts
│   │   │   ├── common/
│   │   │   │   ├── decorators/              # @CurrentTenant, @CurrentUser, @RequireModule, @RequirePermissions
│   │   │   │   ├── guards/                  # JwtAuthGuard, TenantContextGuard, ModuleCapabilityGuard, PermissionsGuard
│   │   │   │   └── filters/                 # UnifiedExceptionFilter
│   │   │   ├── database/
│   │   │   │   └── prisma.service.ts        # Helper transaccional withTenant() usando set_config(..., true) para RLS
│   │   │   └── modules/
│   │   │       ├── identity-access/         # Auth JWT, usuarios, invitaciones wa.me, claves temporales y RBAC
│   │   │       ├── tenancy/                 # Tenants, Branches, BrandSettings, instrucciones pago y OpenGraph injector
│   │   │       ├── capabilities/            # Validador atómico de grafo, perfiles y OpenOperationsChecker
│   │   │       ├── catalog/                 # Menús, categorías, productos, modificadores, QrCodeLink y motor tributario
│   │   │       ├── ordering/                # Órdenes (origin + fulfillment_type), antifraude HMAC, anonimización y tracking
│   │   │       ├── dining/                  # Áreas, mesas, DiningAccount (reopen contable/operativo), QR mesa y split
│   │   │       ├── kitchen/                 # KitchenStation, colas KDS por estación y sincronización de estados
│   │   │       ├── payments/                # Cobros manuales, recalculatePaymentState, resoluciones y reversión
│   │   │       ├── delivery/                # DeliveryZone, cobertura, pedido mínimo y tarifas de envío
│   │   │       ├── notifications/           # Generador de enlaces wa.me y SseStreamService (canales público y sucursal)
│   │   │       ├── reporting/               # Conciliación sin doble conteo, prelación de abonos parciales y CSV sin PII
│   │   │       ├── audit/                   # Registro inmutable AuditEvent (sin PII crudo de comensales)
│   │   │       └── billing-subscription/    # Gestión manual de planes y suscripciones SaaS por PLATFORM_ADMIN
│   │   └── test/
│   │       ├── rls-concurrency.e2e-spec.ts  # Prueba temprana de aislamiento RLS con transacciones concurrentes
│   │       ├── tenant-isolation.e2e-spec.ts # Suite de pruebas negativas entre Restaurante A y Restaurante B
│   │       └── modules-matrix.e2e-spec.ts   # Pruebas por perfil operativo
│   │
│   └── web/                                 # FRONTEND: React + Vite + Tailwind CSS + PWA
│       ├── public/
│       │   └── manifest.webmanifest         # Manifiesto PWA instalable en móviles, tablets y PC
│       └── src/
│           ├── main.tsx
│           ├── router/
│           │   ├── index.tsx                # Enrutador con Lazy Loading (Bundle Comensal vs Bundle Restaurante)
│           │   └── capability-route.tsx     # Bloquea y oculta vistas de módulos desactivados
│           ├── features/
│           │   ├── public-storefront/       # Vitrina pública, carrito Zustand, checkout WhatsApp / Web / QR de mesa
│           │   ├── public-tracking/         # Seguimiento en vivo (/t/:token) + instrucciones de pago + SSE
│           │   ├── lite-order-panel/        # Nivel 1: Panel liviano de 1 pantalla (Ajustar, Procesar en 1 toque, wa.me)
│           │   ├── full-order-panel/        # Nivel 2+: Consola con filtros, cobro manual, resolución y reversión
│           │   ├── dining-pos/              # Salón: Plano de mesas, confirmación QR mesa, comandas y división por persona
│           │   ├── kitchen-kds/             # Cocina: Pantalla KDS por estación con semáforo de tiempos y alerta sonora
│           │   ├── admin-catalog/           # Editor rápido de menú, importador CSV/pegado y centro de descargas QR
│           │   ├── admin-settings/          # Marca, sucursales, instrucciones Nequi/Bre-B, equipo y perfil tributario
│           │   ├── admin-capabilities/      # Selector de perfil operativo y matriz de módulos por sucursal
│           │   └── reports/                 # Dashboard conciliado (Recaudado, Por cobrar, Cortesías, Castigos) y CSV
│           ├── hooks/
│           │   ├── use-branch-capabilities.ts
│           │   └── use-sse-stream.ts        # Usa @microsoft/fetch-event-source con Bearer JWT en canales privados
│           └── services/
│               ├── api-client.ts
│               └── print-receipt.ts         # Impresión 58/80mm con leyenda obligatoria de no equivalencia fiscal DIAN
│
└── packages/
    └── shared/                              # CONTRATOS, ESQUEMAS ZOD Y CALCULADORAS PURAS COMPARTIDAS
        └── src/
            ├── constants/
            │   ├── modules.catalog.ts       # Los 16 módulos (13 MVP + 3 Post-MVP) y 5 perfiles operativos
            │   ├── order-status.machine.ts  # Máquina de estados evaluando origin, fulfillment_type y pre-cobro
            │   ├── payment-status.machine.ts# Políticas, estados, recalculatePaymentState() y prelación de abonos
            │   └── dining.machine.ts        # Estados de Table y DiningAccount (OPEN, REOPENED_ACCOUNTING, CLOSED)
            ├── schemas/                     # Esquemas Zod compartidos entre NestJS y React
            └── utils/
                ├── money-cop.ts             # Aritmética entera en COP
                ├── tax-calculator.ts        # Cálculo de los 3 modos tributarios DIAN por línea
                ├── consumption-split.calculator.ts # Distribución por persona en partes enteras conciliada al peso
                └── whatsapp-templates.ts    # Normalizador E.164, enlaces wa.me y enmascaramiento de PII
~~~

### 7.5 Módulos de dominio en el Backend (`apps/api`)

1. `identity-access`: Autenticación JWT, rotación de Refresh Token, alta/invitación de personal con clave temporal o link por WhatsApp, restablecimiento de contraseña (`reset-password` y `forgot-password`) y RBAC por sucursal.
2. `tenancy`: Organizaciones (`Tenant`), sucursales (`Branch`), marca (`BrandSettings`), instrucciones de pago e inyección de metadatos OpenGraph.
3. `capabilities`: Catálogo de 16 módulos (13 MVP + 3 Post-MVP), *entitlements* por plan, configuración por organización/sucursal, validación atómica en lote de `depends_on_all` / `depends_on_any`, perfiles operativos y `OpenOperationsChecker`.
4. `catalog`: Menús, categorías, productos, variantes, grupos de modificadores, `QrCodeLink` y motor tributario.
5. `ordering`: Creación de órdenes/solicitudes (`origin` + `fulfillment_type`), controles antifraude con `blocked_phone_hmac`, anonimización irreversible Ley 1581, ajustes (`OrderEdit`), máquina de estados, seguimiento público y caducidad automática.
6. `dining`: Áreas, mesas, cuentas abiertas (`DiningAccount` con `version`, `table_session_pin`, cobro centralizado, cierre/resolución y reapertura contable `REOPENED_ACCOUNTING` u operativa `FULL_TABLE`), confirmación de pedidos QR de mesa y distribución informativa por persona.
7. `kitchen`: Estaciones de preparación (`KitchenStation`), colas KDS y sincronización automática de ítems a orden respetando `require_payment_before_preparation`.
8. `payments`: Registro de cobros manuales (`CASH`, `POS_TERMINAL`, `MANUAL_TRANSFER`), motor único `recalculatePaymentState()`, resolución y reversión de saldos no cobrados (`COURTESY`, `WRITTEN_OFF`) y anulaciones auditadas (`VOIDED`).
9. `delivery`: Zonas de cobertura (`DeliveryZone`), pedido mínimo y tarifas de domicilio.
10. `notifications`: Construcción de enlaces `wa.me` y servicio `SseStreamService`.
11. `reporting`: Consultas conciliadas sin doble conteo de salón, prelación de cobros parciales, tiempos entre estados y exportación CSV sin PII.
12. `audit`: Registro inmutable de acciones sensibles (`AuditEvent`, sin PII crudo de comensales).
13. `billing-subscription`: Administración manual de planes y estado de suscripción SaaS del restaurante.

### 7.6 Etapas de escala de infraestructura (De pocos restaurantes a miles)

| Etapa de escala | Volumen estimado | Arquitectura de infraestructura y base de datos |
| :--- | :--- | :--- |
| **Etapa 1: Piloto e Inicio** | `1 a 50` restaurantes | 1 contenedor `apps/api` (NestJS), `apps/web` en CDN y 1 instancia **PostgreSQL 16** (`Shared Database, Shared Schema` con RLS vía `set_config`). Eventos SSE y cron de caducidad en memoria dentro de NestJS. |
| **Etapa 2: Crecimiento** | `50 a 500` restaurantes | Se añade **PgBouncer** en modo transacción y **Redis** para cachear el catálogo público (`GET /public/:slug/menu`) con invalidación al editar productos y sincronizar eventos SSE entre instancias mediante Redis Pub/Sub. |
| **Etapa 3: Alta Escala** | `500 a 5.000+` restaurantes | Múltiples réplicas *stateless* de NestJS, particionamiento nativo en PostgreSQL de las tablas `orders`, `order_items`, `order_status_events` y `audit_events` por fecha, y réplica de lectura dedicada para `reporting`. |

---

## 8. Multi-tenancy, seguridad de datos, privacidad (Ley 1581) y marco legal

- **Aislamiento en dos capas (Aplicación + PostgreSQL RLS):**
  1. `TenantContextGuard` determina el `tenant_id` únicamente a partir del JWT autenticado o del `restaurantSlug` / `publicOrderToken` / `qrToken` en rutas públicas; jamás confía en un `tenant_id` enviado en el body.
  2. Toda operación de base de datos se ejecuta mediante `PrismaService.withTenant(tenantId, async (tx) => ...)`, que abre una transacción e invoca `SELECT set_config('app.current_tenant_id', $1, true)` activando las políticas RLS de PostgreSQL sin contaminar otras peticiones del pool de conexiones.
- **Protección de enlaces públicos, QR y antifraude:** `public_token` y `qr_token` son cadenas aleatorias de 256 bits (`base64url`), no secuenciales, sujetas a *Rate Limiting* por IP y teléfono y con enmascaramiento de datos personales en lecturas públicas.
- **Cumplimiento Ley 1581 de 2012 (Anonimización Irreversible, Prevención de Fraude y Exclusión de PII en Logs/CSV):**
  1. *Consentimiento explícito:* Al registrar nombre, teléfono y dirección en el carrito, se exige aceptar la finalidad del tratamiento y se guarda la marca de tiempo `privacy_consent_at`.
  2. *Anonimización verdaderamente irreversible (`POST /api/v1/admin/customers/:customerId/anonymize` y job tras 24 meses de inactividad):*
     - Dado que un hash simple sobre los $\sim 10^9$ números móviles de Colombia es reversible por fuerza bruta, al anonimizar un cliente el sistema reemplaza `Customer.name` por `"Cliente Anonimizado"`, reemplaza `Customer.phone_e164` por un token aleatorio puro no reversible (`"ANON_" + crypto.randomUUID()`), fija `anonymized_at = NOW()` y elimina sus filas en `DeliveryAddress`.
     - **Preservación de bloqueo antifraude sin exponer el número:** Si el cliente que solicita supresión estaba bloqueado por fraude (`is_blocked = true`), antes de reemplazar su `phone_e164` por el UUID aleatorio, el backend guarda en `Customer.blocked_phone_hmac` el valor `HMAC_SHA256(FRAUD_PEPPER_SECRET, tenant_id + ":" + phone_e164)` usando una clave secreta de 256 bits almacenada exclusivamente en el servidor (`FRAUD_PEPPER_SECRET`). Esto impide revertir el teléfono sin el secreto del servidor y a la vez impide que un atacante eluda la lista de bloqueo solicitando supresión (`POR VALIDAR` el alcance de la excepción de prevención de fraude con asesoría jurídica).
     - **Redacción en snapshots, auditoría y exportaciones CSV:** La misma transacción redacta `Order.customer_snapshot_json` (`name: "Anonimizado"`, `phone_e164: "REDACTED"`, `address_line: "REDACTED"`, `notes: "REDACTED"`) conservando intactas las cifras contables. Ni `AuditEvent.metadata_json` ni los archivos descargados por `export-csv` incluyen PII de clientes.
- **Claridad sobre Facturación Electrónica y Documentos Equivalentes (DIAN):** Ni los resúmenes digitales de pedido ni los comprobantes de cobro manual/pre-cuentas emitidos por la plataforma constituyen factura electrónica de venta ni documento equivalente POS. El restaurante es responsable de cumplir sus obligaciones formales de facturación según su régimen tributario, y el software incluye esta advertencia legal en los recibos impresos y digitales.
## 9. Modelo de datos relacional consolidado (PostgreSQL)

### 9.1 Entidades y estructura exacta de tablas

**1. Tenancy, Identidad y Capacidades Modulares:**
- `Tenant`: `id (UUID PK)`, `name`, `slug (UNIQUE)`, `status`, `plan_id`, `tax_profile_mode (FINAL_PRICE_NO_BREAKDOWN | TAX_INCLUDED_DISCRIMINATED | BASE_PLUS_TAX)`, `default_tax_type (NONE | INC | IVA | EXEMPT)`, `default_tax_rate_bp (INT)`, `created_at`[cite: 8].
- `Branch`: `id (UUID PK)`, `tenant_id (FK)`, `name`, `slug`, `address`, `timezone (DEFAULT 'America/Bogota')`, `phone_whatsapp_e164`, `operating_hours_json (JSONB)`, `status`, `created_at`, `UNIQUE(tenant_id, slug)`[cite: 8].
- `BrandSettings`: `tenant_id (UUID PK/FK)`, `logo_url`, `primary_color`, `secondary_color`, `cover_url`, `description`, `public_domain (UNIQUE NULL)`[cite: 8].
- `User`:
  - `id (UUID PK)`, `email (UNIQUE)`, `password_hash`, `phone`, `name`, `status (ACTIVE | INVITED | SUSPENDED)`, `mfa_enabled (BOOLEAN DEFAULT FALSE)`[cite: 8]
  - `must_change_password (BOOLEAN DEFAULT FALSE)` — Fuerza el cambio de contraseña en el primer inicio de sesión cuando fue creado o restablecido con clave temporal por un administrador.
  - `invite_or_reset_token_hash (VARCHAR NULL)`, `invite_or_reset_expires_at (TIMESTAMPTZ NULL)` — Permite activar cuenta o restablecer clave mediante enlace compartible por WhatsApp o correo transaccional de sistema en `identity-access` (sin depender del módulo opcional `notifications.email`).
  - `created_at (TIMESTAMPTZ)`[cite: 8].
- `Membership`: `id (UUID PK)`, `tenant_id (FK)`, `user_id (FK)`, `role_key (FK)`, `branch_scope (UUID[] NULL — NULL autoriza todas las sucursales del tenant)`, `is_active (BOOLEAN DEFAULT TRUE)`[cite: 8].
- `Role` (`key VARCHAR PK`, `name`), `Permission` (`key VARCHAR PK`, `description`), `RolePermission` (`role_key`, `permission_key`)[cite: 8].
- `Module`: `key (VARCHAR PK)`, `name`, `depends_on_all (TEXT[])`, `depends_on_any (TEXT[])`, `is_core (BOOLEAN)`, `is_post_mvp (BOOLEAN DEFAULT FALSE)`[cite: 8].
- `PlanEntitlement`: `plan_id (VARCHAR)`, `module_key (FK)`, `limits_json (JSONB)`, `PK(plan_id, module_key)`[cite: 8].
- `TenantModuleSetting`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK NULL)`, `module_key (FK)`, `enabled (BOOLEAN)`, `config_json (JSONB)`, `updated_by (FK)`, `updated_at`[cite: 8].
- `OperatingProfile`: `key (VARCHAR PK)`, `name`, `module_keys (TEXT[])`, `default_pickup_delivery_policy (NONE | OFFLINE_ONLY)`, `default_config_json (JSONB)`. *(Al aplicar un perfil, `default_pickup_delivery_policy` se asigna solo a `PICKUP` y `DELIVERY`; la fila `DINE_IN` conserva siempre `payment_policy = 'OFFLINE_ONLY'`).*
- `BranchChannelPolicy`:
  - `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `fulfillment_type (PICKUP | DELIVERY | DINE_IN)`[cite: 8]
  - `enabled (BOOLEAN)`, `payment_policy (NONE | OFFLINE_ONLY)`[cite: 8]
  - `require_payment_before_preparation (BOOLEAN DEFAULT FALSE)` — Solo puede ser `true` cuando `payment_policy = 'OFFLINE_ONLY'` y `fulfillment_type IN ('PICKUP', 'DELIVERY')`[cite: 8].
  - `payment_instructions_json (JSONB NULL)` — Métodos aceptados e instrucciones de transferencia directa visibles para el cliente (Nequi, DaviPlata, Bre-B, titular y nota)[cite: 8].
  - `active_status_flow (TEXT[])`, `tracking_enabled (BOOLEAN)`, `whatsapp_number_e164`[cite: 8]
  - `require_table_pin (BOOLEAN DEFAULT FALSE)`, `unprocessed_expiry_minutes (INT DEFAULT 240)`[cite: 8]
  - `UNIQUE(tenant_id, branch_id, fulfillment_type)`[cite: 8]
  - `CHECK (fulfillment_type != 'DINE_IN' OR payment_policy = 'OFFLINE_ONLY')`
  - `CHECK (require_payment_before_preparation = FALSE OR (payment_policy = 'OFFLINE_ONLY' AND fulfillment_type IN ('PICKUP', 'DELIVERY')))`.

**2. Catálogo, Menú Digital y Códigos QR:**
- `Menu`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK NULL)`, `name`, `status (ACTIVE | ARCHIVED)`[cite: 8].
- `Category`: `id (UUID PK)`, `tenant_id (FK)`, `menu_id (FK)`, `name`, `description`, `sort_order (INT)`, `default_station_key (VARCHAR NULL)`, `availability_schedule_json (JSONB NULL)`, `is_active (BOOLEAN DEFAULT TRUE)`[cite: 8].
- `Product`: `id (UUID PK)`, `tenant_id (FK)`, `category_id (FK)`, `name`, `description`, `image_url`, `price_cop (INT)`, `tax_type (NONE | INC | IVA | EXEMPT)`, `tax_rate_bp (INT)`, `override_station_key (VARCHAR NULL)`, `allergen_tags (TEXT[])`, `status (ACTIVE | OUT_OF_STOCK | ARCHIVED)`, `sort_order (INT)`[cite: 8]. *(El modo de cálculo de impuesto lo define `Tenant.tax_profile_mode`, sin booleano redundante en el producto)*[cite: 8].
- `ProductVariant`: `id (UUID PK)`, `tenant_id (FK)`, `product_id (FK)`, `name`, `price_cop (INT)`, `status (ACTIVE | OUT_OF_STOCK)`, `sort_order (INT)`[cite: 8].
- `ModifierGroup`: `id (UUID PK)`, `tenant_id (FK)`, `name`, `min_selections (INT)`, `max_selections (INT)`, `is_required (BOOLEAN)`[cite: 8].
- `ModifierOption`: `id (UUID PK)`, `tenant_id (FK)`, `group_id (FK)`, `name`, `extra_price_cop (INT)`, `status (ACTIVE | OUT_OF_STOCK)`, `sort_order (INT)`[cite: 8].
- `ProductModifierGroup`: `product_id (FK)`, `group_id (FK)`, `sort_order (INT)`, `PK(product_id, group_id)`[cite: 8].
- `QrCodeLink`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `qr_token (VARCHAR(64) UNIQUE)`, `target_type (GENERAL_MENU | BRANCH_MENU | DINING_TABLE)`, `table_id (UUID FK NULL)`, `label`, `is_active (BOOLEAN DEFAULT TRUE)`, `revoked_at (TIMESTAMPTZ NULL)`, `created_at`[cite: 8].

**3. Clientes, Órdenes, Ajustes en Panel y Seguimiento:**
- `Customer`:
  - `id (UUID PK)`, `tenant_id (FK)`, `name`, `phone_e164` (`VARCHAR — al anonimizar se reemplaza por "ANON_" + UUID v4 aleatorio irreversible`), `privacy_consent_at (TIMESTAMPTZ)`[cite: 8]
  - `is_blocked (BOOLEAN DEFAULT FALSE)`, `blocked_reason (TEXT NULL)`, `blocked_at (TIMESTAMPTZ NULL)`[cite: 8]
  - `blocked_phone_hmac (VARCHAR(64) NULL)` — Guarda `HMAC_SHA256(FRAUD_PEPPER_SECRET, tenant_id + ":" + phone_e164)` únicamente cuando `is_blocked = true` para impedir que un número fraudulento se desbloquee solicitando anonimización, sin permitir revertir el teléfono por fuerza bruta sin el secreto del servidor.
  - `anonymized_at (TIMESTAMPTZ NULL)`, `last_order_at (TIMESTAMPTZ NULL)`, `created_at (TIMESTAMPTZ)`
  - `UNIQUE(tenant_id, phone_e164)`, `INDEX idx_customer_blocked_hmac ON customers(tenant_id, blocked_phone_hmac) WHERE blocked_phone_hmac IS NOT NULL`.
- `Order`:
  - `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `order_code (VARCHAR — ej. #A104)`[cite: 8]
  - `origin (WHATSAPP | WEB_DIRECT | TABLE_QR | STAFF)`[cite: 8]
  - `fulfillment_type (PICKUP | DELIVERY | DINE_IN)`[cite: 8]
  - `status (REQUESTED | RECEIVED | ACCEPTED | PREPARING | READY | OUT_FOR_DELIVERY | DELIVERED | PICKED_UP | SERVED | REJECTED | CANCELLED | EXPIRED_UNPROCESSED)`[cite: 8]
  - `payment_policy (NONE | OFFLINE_ONLY)` — Copia inmutable de la política vigente al momento de crearse el pedido (`DINE_IN` es siempre `OFFLINE_ONLY`)[cite: 8].
  - `require_payment_before_preparation (BOOLEAN DEFAULT FALSE)` — Copia inmutable al crearse el pedido (`false` siempre en `NONE` y en `DINE_IN`)[cite: 8].
  - `payment_status (NOT_TRACKED | UNPAID | PARTIALLY_PAID | PAID | COURTESY | WRITTEN_OFF)` — `NOT_TRACKED` cuando `payment_policy == 'NONE'`; en órdenes hijas de salón (`dining_account_id IS NOT NULL`) permanece en `UNPAID` mientras la cuenta está en `OPEN` o `REOPENED_ACCOUNTING` y hereda el estado final (`PAID`, `COURTESY` o `WRITTEN_OFF`) de su `DiningAccount` al cerrarse.
  - `customer_id (FK NULL)`, `customer_snapshot_json (JSONB — nombre, phone_e164, dirección y notas; redactado a "REDACTED" al anonimizar al cliente)`[cite: 8]
  - `table_id (FK NULL)`, `dining_account_id (FK NULL)`[cite: 8]
  - `public_token (VARCHAR(64) UNIQUE)`, `public_token_expires_at (TIMESTAMPTZ NULL)`[cite: 8]
  - `idempotency_key (VARCHAR NULL)` con restricción `UNIQUE(tenant_id, idempotency_key)`[cite: 8]
  - `subtotal_products_cop (INT)`, `discount_total_cop (INT DEFAULT 0)`, `delivery_fee_cop (INT DEFAULT 0)`, `tax_total_cop (INT DEFAULT 0)`, `tip_cop (INT DEFAULT 0)`, `grand_total_cop (INT)`, `paid_total_cop (INT DEFAULT 0)`, `uncollected_amount_cop (INT DEFAULT 0)`[cite: 8]
  - `resolution_type (COURTESY | WRITTEN_OFF NULL)`, `resolution_reason (TEXT NULL)`, `resolved_by (UUID FK NULL)`, `resolved_at (TIMESTAMPTZ NULL)`
  - `tax_summary_snapshot_json (JSONB)`[cite: 8]
  - `is_locked (BOOLEAN DEFAULT FALSE)`, `processed_at (TIMESTAMPTZ NULL)`, `processed_by (FK NULL)`, `created_at (TIMESTAMPTZ)`[cite: 8]
  - `CHECK (fulfillment_type != 'DINE_IN' OR payment_policy = 'OFFLINE_ONLY')`
  - `CHECK (require_payment_before_preparation = FALSE OR (payment_policy = 'OFFLINE_ONLY' AND fulfillment_type IN ('PICKUP', 'DELIVERY')))`
  - `CHECK ((payment_policy = 'NONE' AND payment_status = 'NOT_TRACKED') OR (payment_policy = 'OFFLINE_ONLY' AND payment_status != 'NOT_TRACKED'))`
  - `CHECK (status != 'REQUESTED' OR paid_total_cop = 0)` — Restricción local en la tabla `orders` que impide que una fila en `REQUESTED` tenga `paid_total_cop > 0`.
- `OrderItem`:
  - `id (UUID PK)`, `tenant_id (FK)`, `order_id (FK)`, `product_id (FK NULL)`[cite: 8]
  - `product_snapshot_json (JSONB — nombre, variante y descripción al momento de venta)`[cite: 8]
  - `quantity (INT)`, `unit_price_cop (INT)`, `discount_cop (INT DEFAULT 0)`[cite: 8]
  - `modifiers_snapshot_json (JSONB — opciones elegidas y sus precios unitarios)`[cite: 8]
  - `tax_snapshot_json (JSONB — tipo de impuesto, tarifa bp, base gravable y monto de impuesto de la línea)`[cite: 8]
  - `line_total_cop (INT)`[cite: 8]
  - `station_key (VARCHAR NULL)`, `status (PENDING | PREPARING | READY | SERVED | CANCELLED)`, `notes (TEXT NULL)`[cite: 8].
- `OrderStatusEvent`: `id (UUID PK)`, `tenant_id (FK)`, `order_id (FK)`, `from_status (VARCHAR NULL)`, `to_status (VARCHAR)`, `actor_id (FK NULL)`, `occurred_at (TIMESTAMPTZ)`, `reason (TEXT NULL)`, `visible_to_customer (BOOLEAN)`[cite: 8].
- `OrderEdit`: `id (UUID PK)`, `tenant_id (FK)`, `order_id (FK)`, `actor_id (FK)`, `occurred_at (TIMESTAMPTZ)`, `before_snapshot_json (JSONB)`, `after_snapshot_json (JSONB)`, `reason (TEXT NULL)`[cite: 8].

**4. Cocina, Salón, Mesas y Distribución Informativa por Persona:**
- `KitchenStation`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `key (VARCHAR)`, `name (VARCHAR)`, `sort_order (INT)`, `is_active (BOOLEAN DEFAULT TRUE)`, `UNIQUE(tenant_id, branch_id, key)`[cite: 8].
- `DiningArea`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `name`, `sort_order (INT)`, `is_active (BOOLEAN DEFAULT TRUE)`[cite: 8].
- `Table` (`dining_tables`): `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `area_id (FK)`, `code (VARCHAR)`, `capacity (INT)`, `status (FREE | OCCUPIED | PENDING_PAYMENT | RESERVED)`, `is_active (BOOLEAN DEFAULT TRUE)`, `UNIQUE(tenant_id, branch_id, code)`[cite: 8]. *(El código QR de la mesa se gestiona en `QrCodeLink` con `target_type = 'DINING_TABLE'`)*[cite: 8].
- `DiningAccount`:
  - `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `table_id (FK)`, `account_code (VARCHAR)`[cite: 8]
  - `status (OPEN | REOPENED_ACCOUNTING | CLOSED | CANCELLED)` — `REOPENED_ACCOUNTING` permite ajustes contables de caja sin ocupar la mesa física ni colisionar con otra cuenta `OPEN` en la misma mesa.
  - `payment_status (UNPAID | PARTIALLY_PAID | PAID | COURTESY | WRITTEN_OFF)` — Toda cuenta de salón opera siempre bajo política `OFFLINE_ONLY`[cite: 8].
  - `guest_count (INT DEFAULT 1)`, `table_session_pin (VARCHAR(4) NULL)`[cite: 8]
  - `subtotal_products_cop (INT DEFAULT 0)`, `discount_total_cop (INT DEFAULT 0)`, `tax_total_cop (INT DEFAULT 0)`, `tip_cop (INT DEFAULT 0)`, `grand_total_cop (INT DEFAULT 0)`, `paid_total_cop (INT DEFAULT 0)`, `uncollected_amount_cop (INT DEFAULT 0)`[cite: 8]
  - `resolution_type (COURTESY | WRITTEN_OFF NULL)`
  - `split_rule (PROPORTIONAL | EQUAL | UNASSIGNED DEFAULT 'PROPORTIONAL')`[cite: 8]
  - `opened_by (FK)`, `opened_at (TIMESTAMPTZ)`, `closed_by (FK NULL)`, `closed_at (TIMESTAMPTZ NULL)`, `close_reason (TEXT NULL)`[cite: 8]
  - `reopened_by (UUID FK NULL)`, `reopened_at (TIMESTAMPTZ NULL)`, `reopen_reason (TEXT NULL)`
  - `version (INT DEFAULT 1)`[cite: 8].
  - Restricción parcial única: `CREATE UNIQUE INDEX idx_unique_open_account_per_table ON dining_accounts(tenant_id, branch_id, table_id) WHERE status = 'OPEN'`[cite: 8].
- `AccountDiner`: `id (UUID PK)`, `tenant_id (FK)`, `account_id (FK)`, `label (VARCHAR — ej. Persona 1, Persona 2)`, `sort_order (INT)`[cite: 8].
- `ConsumptionAssignment`:
  - `id (UUID PK)`, `tenant_id (FK)`, `account_id (FK)`, `diner_id (FK)`, `order_item_id (FK)`[cite: 8]
  - `share_units (INT NOT NULL)` — partes enteras asignadas a este comensal[cite: 8].
  - `total_item_shares (INT NOT NULL)` — total de partes enteras en que se divide el ítem[cite: 8].
  - `assigned_amount_cop (INT NOT NULL)` — monto exacto en pesos ya conciliado (fuente de verdad persistida)[cite: 8].

**5. Domicilios, Cobros Manuales, Auditoría y Suscripción SaaS:**
- `DeliveryZone`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`, `name`, `polygon_or_neighborhoods_json (JSONB)`, `delivery_fee_cop (INT)`, `min_order_cop (INT)`, `estimated_minutes_min (INT)`, `estimated_minutes_max (INT)`, `is_active (BOOLEAN DEFAULT TRUE)`[cite: 8].
- `DeliveryAddress`: `id (UUID PK)`, `tenant_id (FK)`, `customer_id (FK NULL)`, `address_line`, `neighborhood`, `reference_notes`, `city`[cite: 8].
- `Payment`:
  - `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK)`[cite: 8]
  - `order_id (UUID FK NULL)`, `account_id (UUID FK NULL)`[cite: 8]
  - `method (CASH | POS_TERMINAL | MANUAL_TRANSFER)`, `amount_cop (INT > 0)`, `cash_received_cop (INT NULL)`, `change_given_cop (INT NULL)`, `reference_note (VARCHAR NULL)`[cite: 8]
  - `status (APPROVED | VOIDED)`[cite: 8]
  - `idempotency_key (VARCHAR NOT NULL)` con restricción `UNIQUE(tenant_id, idempotency_key)`[cite: 8]
  - `created_by (FK)`, `voided_by (FK NULL)`, `voided_at (TIMESTAMPTZ NULL)`, `voided_reason (TEXT NULL)`, `created_at (TIMESTAMPTZ)`[cite: 8]
  - `CHECK ((order_id IS NOT NULL AND account_id IS NULL) OR (order_id IS NULL AND account_id IS NOT NULL))`.
- `AuditEvent`: `id (UUID PK)`, `tenant_id (FK)`, `branch_id (FK NULL)`, `actor_id (FK NULL)`, `action`, `entity_type`, `entity_id`, `occurred_at (TIMESTAMPTZ)`, `metadata_json (JSONB — prohibido almacenar PII crudo de comensales)`[cite: 8].
- `Subscription` y `SubscriptionInvoice`: Control administrativo del plan comercial del restaurante en el SaaS[cite: 8].

### 9.2 Reglas de modelado e integridad de datos

- **Unidades monetarias enteras:** Todos los importes en PostgreSQL se almacenan como enteros en pesos colombianos (`INT`, `COP`)[cite: 8].
- **Inmutabilidad histórica de política y precios:** Cada `Order` congela el `payment_policy` y el `require_payment_before_preparation` con los que fue creada, y cada `OrderItem` congela sus snapshots de producto, modificadores e impuestos[cite: 8].
- **Prohibición de borrado físico financiero:** Las órdenes (`Order`), cuentas (`DiningAccount`), pagos (`Payment`) y eventos de auditoría jamás ejecutan `DELETE` físico; utilizan estados de anulación/archivo con trazabilidad[cite: 8].
- **Índices y claves únicas encabezadas por `tenant_id`:** Toda clave única de negocio, índice de búsqueda y clave de idempotencia incluye `tenant_id` como primera columna (`UNIQUE(tenant_id, idempotency_key)` en `orders` y `payments`; `UNIQUE(tenant_id, branch_id, code)` en `dining_tables`; `INDEX(tenant_id, branch_id, status, created_at DESC)` en `orders`)[cite: 8].

---

## 10. Flujos críticos paso a paso

### 10.1 Pedido por "WhatsApp simple" (Nivel 1: `origin = WHATSAPP`, `payment_policy = NONE`, `payment_status = NOT_TRACKED`)
1. El cliente arma el carrito en la web y registra nombre, **número de WhatsApp** (normalizado a `E.164`), modalidad (`PICKUP` o `DELIVERY`), dirección y notas, aceptando el tratamiento de datos[cite: 8].
2. El backend verifica los controles antifraude (que no exista un `Customer` bloqueado con ese `phone_e164` ni con su `blocked_phone_hmac` y que no supere el límite de 3 solicitudes abiertas), recalcula los precios finales y crea la solicitud en estado `REQUESTED` con `origin = 'WHATSAPP'`, `payment_policy = 'NONE'`, `require_payment_before_preparation = false` y `payment_status = 'NOT_TRACKED'`, generando el `order_code` (`#A104`) y el `public_token`[cite: 8].
3. El navegador redirige a `https://wa.me/<telefono_sucursal>` con el mensaje prellenado que incluye `#A104` y el detalle del pedido[cite: 8].
4. Cliente y comercio acuerdan por chat detalles finales (valor del domicilio, medio de pago y eventuales adiciones o cambios)[cite: 8].
5. El comercio abre el **Panel Liviano (1 pantalla)**, ubica la tarjeta pendiente `#A104`, compara el número registrado con el del chat y, si hubo cambios, ajusta productos/cantidades o digita el `delivery_fee_cop` (quedando auditado en `OrderEdit`)[cite: 8].
6. El comercio pulsa **"Procesar pedido"**: el estado pasa a `ACCEPTED`, la orden se bloquea (`is_locked = true`) y se abre WhatsApp hacia el número del cliente (`wa.me/<telefono_cliente>`) con el enlace público de resumen y seguimiento (`/t/<public_token>`), además del botón **"Copiar mensaje"**[cite: 8].
7. El comercio avanza los estados con un toque (`READY`, `OUT_FOR_DELIVERY`, `DELIVERED` / `PICKED_UP`), actualizando en tiempo real vía SSE la pantalla del cliente[cite: 8]. Las solicitudes ignoradas que permanecen en `REQUESTED` (con `paid_total_cop = 0`) caducan a `EXPIRED_UNPROCESSED` sin dejar pagos huérfanos y nunca suman en ventas[cite: 8].

### 10.2 Pedido en `PICKUP` o `DELIVERY` con control de cobro, resolución y reversión (Nivel 2: política `OFFLINE_ONLY`)
1. El cliente arma su carrito en la web y elige `PICKUP` o `DELIVERY` (ya sea por `origin = 'WEB_DIRECT'` o por `origin = 'WHATSAPP'`)[cite: 8]. En el checkout visualiza las instrucciones de pago configuradas por la sede (`payment_instructions_json`: ej. números de Nequi, DaviPlata o llave Bre-B, o pago contra entrega)[cite: 8].
2. El backend valida antifraude, horario, cobertura y pedido mínimo, y crea la orden con `payment_policy = 'OFFLINE_ONLY'` y `payment_status = 'UNPAID'`[cite: 8].
3. Si el pedido nació en `REQUESTED` (`origin = 'WHATSAPP'`), el operador primero lo confirma pulsando **"Procesar pedido"** (`ACCEPTED`) antes de poder registrarle cualquier pago manual.
4. Si la sucursal activó `require_payment_before_preparation = true` en ese canal (`PICKUP` o `DELIVERY`), una vez confirmada la orden (`ACCEPTED`), el backend impide su transición a `PREPARING` y su aparición en el KDS de cocina hasta que el cajero verifique el pago y registre el cobro en `payments.manual` (`payment_status = 'PAID'`)[cite: 8]. Si `require_payment_before_preparation = false`, la orden avanza normalmente a cocina y el cobro se registra al entregar o recoger (`CASH`, `POS_TERMINAL` o `MANUAL_TRANSFER`)[cite: 8].
5. Si una orden aceptada o entregada no se cobra en su totalidad por cortesía o por resultar incobrable, un gerente/administrador ejecuta `POST /api/v1/orders/:orderId/resolve-uncollected` indicando `COURTESY` o `WRITTEN_OFF` y el motivo obligatorio, fijando `uncollected_amount_cop = grand_total_cop - paid_total_cop` y congelando financieramente la orden.
6. Si posteriormente el cliente regresa y paga el saldo que estaba en `WRITTEN_OFF` (o se corrige una `COURTESY`), el gerente/administrador ejecuta `POST /api/v1/orders/:orderId/revert-resolution` con motivo obligatorio (lo que limpia `uncollected_amount_cop = 0` y recalcula el estado a `UNPAID` o `PARTIALLY_PAID` mediante `recalculatePaymentState()`) y registra el cobro en `payments.manual`.

### 10.3 Pedido desde QR en mesa con confirmación de mesero (Nivel 3: `origin = TABLE_QR`, `fulfillment_type = DINE_IN`)
1. El comensal escanea el QR de su mesa y abre el menú resolviendo el `qr_token` desde `QrCodeLink` (`target_type = 'DINING_TABLE'`)[cite: 8].
2. Si la sucursal exige `require_table_pin = true`, ingresa el PIN de 4 dígitos de la mesa; selecciona sus productos y confirma[cite: 8].
3. El backend recalcula precios y crea la orden en estado **`REQUESTED`** asociada a la mesa con `payment_policy = 'OFFLINE_ONLY'`, `require_payment_before_preparation = false` y `payment_status = 'UNPAID'`[cite: 8].
4. El mesero recibe alerta instantánea por SSE en su dispositivo móvil/panel (*"Nueva solicitud QR en Mesa M-04"*), verifica visualmente o con la mesa y pulsa **"Confirmar comanda"** (`ACCEPTED`)[cite: 8].
5. La orden se suma a la `DiningAccount` activa de la mesa (incrementando `version`) y sus ítems se enrutan de inmediato a las estaciones correspondientes del KDS (`kitchen`)[cite: 8].

### 10.4 Mesero en salón, distribución informativa por persona, cierre y reapertura contable/operativa (`dining` + `dining.consumption_split`)
1. El mesero abre una `DiningAccount` en una mesa libre (pasa a `OCCUPIED`) y agrega una o varias órdenes sucesivas durante la estancia[cite: 8].
2. Cuando los amigos piden saber cuánto le toca a cada uno, el mesero abre **"Asignar consumo por persona"**, crea `Persona 1`, `Persona 2`, `Persona 3` y asigna las cantidades o partes enteras de los platos compartidos[cite: 8].
3. El backend calcula y persiste en `ConsumptionAssignment` las partes (`share_units` / `total_item_shares`) y los montos exactos conciliados al peso (`assigned_amount_cop`), mostrando el subtotal informativo de cada persona sin alterar el `grand_total_cop` de la cuenta[cite: 8].
4. En caja se ejecuta el cierre de la `DiningAccount` por una de las dos vías autorizadas:
   - *Vía estándar por cobro total:* Caja registra el cobro sobre la `DiningAccount` en `payments.manual` (en un pago único o combinando medios hasta que `paid_total_cop == grand_total_cop`). En ese instante, `DiningAccount.payment_status` y el `payment_status` de todas sus órdenes hijas activas pasan a `PAID`, la cuenta pasa a `CLOSED` y, si estaba en `OPEN`, libera la mesa (`FREE`)[cite: 8].
   - *Vía de cierre administrativo o saldo `$0` (`POST /api/v1/accounts/:accountId/close`):* Si `grand_total_cop == 0` (sin consumo válido), se cierra con motivo (`payment_status = 'PAID'`). Si existe saldo sin cobrar (`grand_total_cop > paid_total_cop`), un `BRANCH_MANAGER` o `TENANT_ADMIN` debe indicar la resolución `COURTESY` o `WRITTEN_OFF` y el motivo obligatorio; el sistema calcula `uncollected_amount_cop = grand_total_cop - paid_total_cop`, marca la cuenta y sus órdenes hijas con ese estado (`COURTESY` o `WRITTEN_OFF`), cierra la cuenta (`CLOSED`), libera la mesa si estaba en `OPEN` y registra en `AuditEvent`[cite: 8].
5. Si es necesario anular un cobro registrado por error en una cuenta ya cerrada o cobrar un saldo que se había cerrado como `WRITTEN_OFF` (incluso cuando la mesa física ya está ocupada por nuevos clientes), un `BRANCH_MANAGER` o `TENANT_ADMIN` ejecuta `POST /api/v1/accounts/:accountId/reopen` con `mode = 'ACCOUNTING_ONLY'` y motivo obligatorio: la cuenta pasa a `status = 'REOPENED_ACCOUNTING'` sin alterar `Table.status`, limpia `uncollected_amount_cop = 0`, recalcula el saldo con `recalculatePaymentState()`, permite las correcciones en caja y vuelve a cerrarse (`CLOSED`). Si en cambio el grupo sigue en la mesa libre y desea pedir más comida, ejecuta `reopen` con `mode = 'FULL_TABLE'`, pasando la cuenta a `OPEN` y la mesa a `OCCUPIED`.

---

## 11. Reglas de integridad financiera para cobros manuales, recálculo y resoluciones

- **Separación de máquinas de estado:** `Order.status` / `DiningAccount.status` evolucionan de forma independiente a `payment_status`[cite: 8].
- **Distinción estricta entre `NOT_TRACKED` y `UNPAID`:**
  - `NOT_TRACKED` aplica exclusivamente a órdenes de `PICKUP`/`DELIVERY` nacidas bajo `payment_policy = 'NONE'`[cite: 8]. El backend rechaza con HTTP `409 Conflict` (`PAYMENT_NOT_ALLOWED_FOR_POLICY`) cualquier intento de registrar pagos manuales sobre una orden `NOT_TRACKED`[cite: 8].
  - `UNPAID` aplica a órdenes y cuentas nacidas bajo `payment_policy = 'OFFLINE_ONLY'` cuyo `paid_total_cop` es `$0 COP` y no tienen resolución activa[cite: 8].
- **Validación transaccional contra cobros en estado `REQUESTED` + `CHECK` local en `orders`:**
  - Como PostgreSQL no permite que un `CHECK` de `payments` consulte la tabla `orders`, la garantía se implementa en dos capas complementarias dentro de la misma transacción: (1) `ManualPaymentsService` bloquea la fila de `Order` con `SELECT ... FOR UPDATE` y verifica que `order.status != 'REQUESTED'` (lanzando HTTP `409 ORDER_MUST_BE_ACCEPTED_BEFORE_PAYMENT` si aún está en `REQUESTED`), y (2) al actualizar `orders.paid_total_cop`, la propia tabla `orders` evalúa su restricción local `CHECK (status != 'REQUESTED' OR paid_total_cop = 0)`, haciendo imposible que exista en base de datos un pedido en `REQUESTED` con pagos aplicados. Además, el scheduler de caducidad automática filtra `WHERE status = 'REQUESTED' AND paid_total_cop = 0`.
- **Prohibición de cobro directo sobre órdenes hijas de salón:** Toda orden con `dining_account_id IS NOT NULL` se cobra exclusivamente a través de su `DiningAccount` (`POST /api/v1/accounts/:accountId/payments/manual`). Intentar llamar a `POST /api/v1/orders/:orderId/payments/manual` sobre una orden de mesa responde HTTP `409 Conflict` (`PAY_VIA_DINING_ACCOUNT`), y la tabla `Payment` impone por base de datos `CHECK ((order_id IS NOT NULL AND account_id IS NULL) OR (order_id IS NULL AND account_id IS NOT NULL))`[cite: 8].
- **Función única determinista de recálculo (`recalculatePaymentState`):**
  - Tanto al registrar un pago como al anular uno existente (`POST /api/v1/payments/:paymentId/void`), jamás se asigna `UNPAID` de forma fija: la función suma todos los pagos con `status = 'APPROVED'` de la orden o cuenta ($\text{paid\_total\_cop} = \sum \text{amount\_cop}$).
  - Si en una orden de `$45.000` había dos pagos de `$20.000` y `$25.000` (`PAID`) y se anula el de `$25.000`, `recalculatePaymentState()` actualiza `paid_total_cop = 20000` y deja la orden en **`PARTIALLY_PAID`** (saldo pendiente `$25.000`). Solo si se anulan todos los pagos ($\text{paid\_total\_cop} == 0$) pasa a **`UNPAID`**.
- **Congelamiento en estados cerrados o resueltos y reversión auditada:**
  - Mientras una orden tenga `payment_status IN ('COURTESY', 'WRITTEN_OFF')` o una `DiningAccount` tenga `status = 'CLOSED'`, el backend rechaza registrar nuevos pagos o anular pagos existentes (`409 ORDER_RESOLUTION_ACTIVE` / `409 ACCOUNT_IS_CLOSED`).
  - Para modificar pagos en esos casos, un gerente/administrador debe ejecutar primero `POST /api/v1/orders/:orderId/revert-resolution` o `POST /api/v1/accounts/:accountId/reopen` (`mode: 'ACCOUNTING_ONLY' | 'FULL_TABLE'`), lo que limpia `uncollected_amount_cop = 0`, recalcula el estado mediante `recalculatePaymentState()` y registra la reversión en `AuditEvent`.
- **Bloqueo pesimista, no reducción bajo lo pagado y no cancelación con pagos activos:**
  - Todo registro de pago exige `Idempotency-Key` validada mediante `UNIQUE(tenant_id, idempotency_key)` y bloquea con `SELECT ... FOR UPDATE` la orden o cuenta en PostgreSQL, rechazando con `409 PAYMENT_EXCEEDS_BALANCE` si `paid_total_cop + nuevo_monto > grand_total_cop`[cite: 8].
  - Ninguna edición ni descuento puede dejar `grand_total_cop < paid_total_cop` (`409 TOTAL_BELOW_PAID_AMOUNT`), y ninguna orden o cuenta con `paid_total_cop > 0` puede pasarse a `CANCELLED` o `REJECTED` sin anular antes sus pagos activos (`409 ORDER_HAS_ACTIVE_PAYMENTS`)[cite: 8].

---

## 12. Especificación de API REST y Tiempo Real (`/api/v1`)

### 12.1 Autenticación, Recuperación de Acceso y Salud del Servicio
- `GET /api/v1/health` — Sonda de salud (liveness/readiness) verificando conectividad a PostgreSQL.
- `POST /api/v1/auth/register` — Registro inicial de organización + propietario[cite: 8].
- `POST /api/v1/auth/session`, `POST /api/v1/auth/refresh`, `DELETE /api/v1/auth/session`[cite: 8].
- `POST /api/v1/auth/change-password` — Cambio de contraseña (obligatorio al iniciar sesión con `must_change_password = true`).
- `POST /api/v1/auth/forgot-password` — Solicitud de recuperación de contraseña para propietarios (`TENANT_ADMIN`), enviando el token por el transporte de correo transaccional del núcleo `identity-access`.
- `POST /api/v1/auth/accept-invite` y `POST /api/v1/auth/reset-password` — Activación de cuenta o restablecimiento de clave mediante token de invitación/recuperación.

### 12.2 Rutas Públicas para el Comensal y OpenGraph (Con Rate Limiting)
- `GET /r/:restaurantSlug` y `GET /t/:publicOrderToken` — Sirven el HTML con meta-etiquetas OpenGraph dinámicas para vista previa en WhatsApp[cite: 8].
- `GET /api/v1/public/:restaurantSlug/branches` — Lista sedes activas, horarios, cobertura, canales habilitados e instrucciones de pago (`payment_instructions_json`)[cite: 8].
- `GET /api/v1/public/:restaurantSlug/menu` — Devuelve marca y catálogo activo evaluando disponibilidad horaria[cite: 8].
- `GET /api/v1/public/qr/:qrToken` — Resuelve un código QR desde `QrCodeLink` sin exponer UUIDs internos[cite: 8].
- `POST /api/v1/public/orders` — Valida controles antifraude (rate limit por IP/teléfono, `Customer.is_blocked` y `blocked_phone_hmac`), recalcula precios en servidor con `Idempotency-Key` (`UNIQUE(tenant_id, idempotency_key)`) y crea la orden (`origin` + `fulfillment_type`)[cite: 8].
- `GET /api/v1/public/orders/:publicOrderToken` — Resumen de orden con PII enmascarado, instrucciones de pago si está pendiente, leyenda fiscal DIAN y línea de tiempo de estados marcados[cite: 8].
- `GET /api/v1/public/orders/:publicOrderToken/events` — Stream **SSE** público para seguimiento en vivo del cliente[cite: 8].

### 12.3 Operación de Pedidos, Panel Liviano, Panel Completo y Cocina (KDS)
- `GET /api/v1/branches/:branchId/orders` — Lista filtrable por `status`, `payment_status` (`NOT_TRACKED`, `UNPAID`, `PARTIALLY_PAID`, `PAID`, `COURTESY`, `WRITTEN_OFF`), `origin`, `fulfillment_type`, fecha y búsqueda `q`[cite: 8].
- `GET /api/v1/branches/:branchId/orders/events` — Stream **SSE** autenticado con JWT (consumido vía `@microsoft/fetch-event-source`)[cite: 8].
- `PATCH /api/v1/orders/:orderId/items` — Ajusta productos, cantidades y `delivery_fee_cop` antes de procesar (`OrderEdit`), validando `grand_total_cop >= paid_total_cop`[cite: 8].
- `POST /api/v1/orders/:orderId/process` — Pasa a `ACCEPTED`, fija `is_locked = true` y devuelve `whatsapp_client_url` + `copyable_message`[cite: 8].
- `PATCH /api/v1/orders/:orderId/status` — Ejecuta transiciones válidas de `OrderStatus` (validando `require_payment_before_preparation` antes de `PREPARING` y ausencia de pagos activos antes de `CANCELLED`/`REJECTED`)[cite: 8].
- `GET /api/v1/orders/:orderId/status-history` — Historial unificado de `OrderStatusEvent`, `OrderEdit` y `Payment`[cite: 8].
- `GET /api/v1/kitchen/orders` y `PATCH /api/v1/kitchen/orders/:orderId/status` — Cola y actualización KDS (`@RequireModule('kitchen')`)[cite: 8].

### 12.4 Operación de Salón, Distribución Informativa, Cobros Manuales y Resoluciones de Saldo
- `GET /api/v1/branches/:branchId/tables` — Plano de áreas, mesas y resumen de cuentas en `OPEN` o `REOPENED_ACCOUNTING` (`@RequireModule('dining')`)[cite: 8].
- `POST /api/v1/branches/:branchId/accounts` — Abre `DiningAccount` en una mesa libre (`@RequireModule('dining')`)[cite: 8].
- `POST /api/v1/accounts/:accountId/orders` — Agrega comanda a una cuenta en estado `OPEN` validando `expected_account_version`[cite: 8].
- `POST /api/v1/accounts/:accountId/transfer-table` — Traslada cuenta `OPEN` a otra mesa libre con auditoría[cite: 8].
- `PATCH /api/v1/accounts/:accountId/bill-preview` — Actualiza propina voluntaria/descuentos (validando `grand_total_cop >= paid_total_cop`) y marca la mesa en `PENDING_PAYMENT`[cite: 8].
- `GET / PUT /api/v1/accounts/:accountId/consumption-distribution` — Calcula y guarda la distribución informativa por persona en partes enteras (`@RequireModule('dining', 'dining.consumption_split')`)[cite: 8].
- `POST /api/v1/orders/:orderId/payments/manual` — Registra cobro manual sobre un pedido independiente confirmado (`status != 'REQUESTED'` bajo `SELECT ... FOR UPDATE`), calcula cambio y ejecuta `recalculatePaymentState()` (`@RequireModule('payments.manual')`)[cite: 8].
- `POST /api/v1/accounts/:accountId/payments/manual` — Registra cobro manual sobre una `DiningAccount` en estado `OPEN` o `REOPENED_ACCOUNTING`; cuando `paid_total_cop == grand_total_cop`, marca la cuenta y sus órdenes hijas como `PAID`, cierra la cuenta (`CLOSED`) y, si estaba en `OPEN`, libera la mesa (`FREE`) (`@RequireModule('dining', 'payments.manual')`)[cite: 8].
- `POST /api/v1/orders/:orderId/resolve-uncollected` — *(Exclusivo `BRANCH_MANAGER` / `TENANT_ADMIN`)* Resuelve una orden independiente `OFFLINE_ONLY` con saldo pendiente como `COURTESY` (en estados `ACCEPTED` a `DELIVERED`/`PICKED_UP`) o `WRITTEN_OFF` (en estados `READY` a `DELIVERED`/`PICKED_UP`), fijando `uncollected_amount_cop`, motivo obligatorio y registro en `AuditEvent`.
- `POST /api/v1/orders/:orderId/revert-resolution` — *(Exclusivo `BRANCH_MANAGER` / `TENANT_ADMIN`)* Revierte una resolución `COURTESY` o `WRITTEN_OFF` con motivo obligatorio, limpia `uncollected_amount_cop = 0`, ejecuta `recalculatePaymentState()` y habilita el registro de cobros tardíos.
- `POST /api/v1/accounts/:accountId/close` — Cierra una `DiningAccount` (`OPEN` o `REOPENED_ACCOUNTING`) con `grand_total_cop == paid_total_cop` (`PAID`) o, si tiene saldo pendiente (`grand_total_cop > paid_total_cop`), exige rol `BRANCH_MANAGER` / `TENANT_ADMIN`, resolución explícita (`COURTESY` | `WRITTEN_OFF`) y motivo obligatorio, sincronizando sus órdenes hijas, liberando la mesa si estaba en `OPEN` y registrando en `AuditEvent`[cite: 8].
- `POST /api/v1/accounts/:accountId/reopen` — *(Exclusivo `BRANCH_MANAGER` / `TENANT_ADMIN`)* Recibe `mode: 'ACCOUNTING_ONLY' | 'FULL_TABLE'` y motivo obligatorio: en `'ACCOUNTING_ONLY'` pasa la cuenta a `REOPENED_ACCOUNTING` sin tocar `Table.status` (permitiendo corregir cobros aunque la mesa esté ocupada); en `'FULL_TABLE'` verifica que la mesa esté `FREE` y pasa la cuenta a `OPEN` y la mesa a `OCCUPIED`. En ambos modos limpia `uncollected_amount_cop = 0`, ejecuta `recalculatePaymentState()` y registra en `AuditEvent`.
- `POST /api/v1/payments/:paymentId/void` — Anula un cobro manual (`Payment.status = 'VOIDED'`) sobre una orden sin resolución activa o cuenta en `OPEN` / `REOPENED_ACCOUNTING` con motivo obligatorio, ejecuta `recalculatePaymentState()` y registra en `AuditEvent`[cite: 8].

### 12.5 Administración, Personal, Catálogo, Antifraude, Privacidad Ley 1581, Reportes y Suscripción
- `GET / PATCH /api/v1/admin/brand`, `GET / POST / PATCH /api/v1/admin/branches`[cite: 8].
- `GET / POST / PATCH /api/v1/admin/users` y `POST /api/v1/admin/users/:userId/reset-password` — Alta de personal (con contraseña temporal o enlace de invitación compartible por WhatsApp) y restablecimiento administrativo de clave.
- `GET / PATCH /api/v1/admin/branches/:branchId/channel-policies` — Configura políticas de cobro (`NONE` en `PICKUP`/`DELIVERY`, `OFFLINE_ONLY` fijo en `DINE_IN`), instrucciones de transferencia (`payment_instructions_json`) y `require_payment_before_preparation`[cite: 8].
- `GET /api/v1/admin/customers`, `PATCH /api/v1/admin/customers/:customerId/block` (bloqueo antifraude guardando `blocked_phone_hmac`) y `POST /api/v1/admin/customers/:customerId/anonymize` (supresión irreversible con UUID aleatorio en `Customer`, borrado de `DeliveryAddress` y redacción de `Order.customer_snapshot_json` conforme a la Ley 1581 de 2012).
- `GET / PATCH /api/v1/admin/tax-profile` — Configuración de los 3 modos tributarios[cite: 8].
- `GET / POST / PATCH /api/v1/admin/categories`, `/products`, `/modifier-groups`, `POST /api/v1/admin/products/import`[cite: 8].
- `GET / POST /api/v1/admin/branches/:branchId/qr-codes` y `POST /api/v1/admin/qr-codes/:qrId/revoke`[cite: 8].
- `GET / POST / PATCH /api/v1/admin/branches/:branchId/delivery-zones` y `/kitchen-stations`[cite: 8].
- `GET /api/v1/branches/:branchId/capabilities`, `GET / PATCH /api/v1/admin/modules`, `GET / PATCH /api/v1/admin/branches/:branchId/modules` (evaluando en lote el conjunto resultante $S_{\text{final}}$)[cite: 8].
- `GET /api/v1/admin/operating-profiles` y `POST /api/v1/admin/operating-profiles/:key/apply`[cite: 8].
- `GET /api/v1/reports/sales` y `GET /api/v1/reports/sales/export-csv` (sin PII de comensales, `@RequireModule('reporting')`)[cite: 8].
- `GET /api/v1/admin/subscription` y `PATCH /api/v1/platform/tenants/:tenantId/subscription`[cite: 8].

---

## 13. Requisitos no funcionales (RNF), Continuidad y Observabilidad

- **Disponibilidad:** Meta inicial de `99,5 %` mensual[cite: 8].
- **Rendimiento web móvil:** Carga inicial del menú público (`First Contentful Paint`) menor a `1,8 s` en red móvil 4G[cite: 8].
- **Latencia en tiempo real:** Reflejo de cambios de estado en el panel, KDS y página de seguimiento del cliente en `< 3 segundos` vía SSE[cite: 8].
- **Aislamiento transaccional RLS:** Cero contaminación de contexto `app.current_tenant_id` entre peticiones concurrentes bajo carga[cite: 8].
- **Continuidad de negocio y recuperación ante desastres (RPO / RTO):**
  - **RPO (*Recovery Point Objective*) `< 15 minutos`:** Instancia PostgreSQL gestionada con archivado continuo de logs transaccionales (WAL / *Point-in-Time Recovery - PITR*) además de snapshots completos diarios con retención mínima de 14 días.
  - **RTO (*Recovery Time Objective*) `< 60 minutos`:** Procedimiento documentado de restauración y redespliegue automatizado de contenedores `apps/api` y `apps/web` vía CI/CD, ensayado antes de salir a producción.
- **Observabilidad, logs estructurados y alertas:**
  - *Logging estructurado (Pino JSON):* Cada log incluye `timestamp`, `level`, `requestId`, `tenantId`, `branchId`, `actorId` y `orderId` (cuando aplique), redactando automáticamente contraseñas, tokens y PII sensible.
  - *Monitoreo y alertas automáticas:* Sonda `/api/v1/health` cada 60 segundos; alertas inmediatas al equipo técnico ante caída del servicio, tasa de errores HTTP `5xx > 1 %` en ventana de 5 minutos, latencia `p95 > 2 s` o fallos en el scheduler de caducidad.

---

## 14. Matriz completa de riesgos y mitigaciones

| # | Riesgo identificado | Mitigación técnica y operativa implementada |
| :--- | :--- | :--- |
| 1 | Filtración de datos entre restaurantes | `TenantContextGuard` + `set_config('app.current_tenant_id', ..., true)` en transacción Prisma + RLS en PostgreSQL + pruebas E2E negativas[cite: 8]. |
| 2 | Pedidos falsos o bromas al no existir pasarela de pago en línea | Cinco barreras activas (4.6.2): confirmación obligatoria antes de cocina (`REQUESTED` → `ACCEPTED`), opción de exigir cobro antes de preparar en `PICKUP`/`DELIVERY` (`require_payment_before_preparation`), *rate limiting* por teléfono/IP (máx. 3 activos por teléfono), pedido mínimo por zona y bloqueo de números (`Customer.is_blocked` + `blocked_phone_hmac`)[cite: 8]. |
| 3 | Pagos huérfanos si expira una solicitud `REQUESTED` | Validación transaccional en `ManualPaymentsService` tras bloquear la fila de `Order` con `SELECT ... FOR UPDATE` (`409 ORDER_MUST_BE_ACCEPTED_BEFORE_PAYMENT`), respaldada por la restricción local `CHECK (status != 'REQUESTED' OR paid_total_cop = 0)` en la tabla `orders` y el filtro `paid_total_cop = 0` en el job de caducidad. |
| 4 | Histórico del Nivel 1 mostrado por error como deuda pendiente al subir al Nivel 2 | Estado explícito `NOT_TRACKED` para pedidos nacidos bajo política `NONE` e inmutabilidad de `Order.payment_policy`[cite: 8]. |
| 5 | Choque del `CHECK` de `DINE_IN` al aplicar perfiles con política `NONE` | `OperatingProfile.default_pickup_delivery_policy` aplica `NONE` exclusivamente a las filas `PICKUP` y `DELIVERY` de `BranchChannelPolicy`, manteniendo la fila `DINE_IN` siempre en `OFFLINE_ONLY`. |
| 6 | Pedido o comanda de mesa atascada antes de cocina por mala configuración de pre-cobro | Restricción `CHECK` en BD y validación en API: `require_payment_before_preparation` solo puede ser `true` con `payment_policy = 'OFFLINE_ONLY'` y `fulfillment_type IN ('PICKUP', 'DELIVERY')`; en `DINE_IN` es siempre `false` y al bajar a `NONE` se apaga automáticamente[cite: 8]. |
| 7 | Imposibilidad de corregir cobros de una cuenta cerrada porque la mesa física ya fue reocupada | Reapertura contable (`mode = 'ACCOUNTING_ONLY'` → `status = 'REOPENED_ACCOUNTING'`) que no ocupa la mesa física ni choca con el índice único parcial `WHERE status = 'OPEN'`, permitiendo anular/registrar cobros y volver a cerrar en caja. |
| 8 | Reportes con doble conteo en salón o sin criterio de reparto en abonos parciales | Agregación disjunta (`Order` con `dining_account_id IS NULL` + `DiningAccount`), prelación determinista en cobros parciales (1.º Productos, 2.º Domicilio, 3.º Propina) y ecuación maestra $\text{Facturado} \equiv \text{Recaudado} + \text{Por Cobrar} + \text{Cortesías} + \text{Castigos}$. |
| 9 | Pérdida de pesos al recargar división de platos compartidos | Persistencia en `ConsumptionAssignment` de enteros `share_units`, `total_item_shares` y `assigned_amount_cop` conciliado al peso[cite: 8]. |
| 10 | Pedidos falsos desde fotos de un QR de mesa | Todo pedido `origin = 'TABLE_QR'` nace en `REQUESTED`, soporta `table_session_pin` rotativo y exige confirmación del mesero (`ACCEPTED`) antes de ir a cocina[cite: 8]. |
| 11 | Bloqueo de acceso del personal o del propietario cuando `notifications.email` está desactivado | El núcleo `identity-access` gestiona empleados con claves temporales/enlaces por WhatsApp y propietarios mediante correo transaccional de sistema propio (`forgot-password`) más respaldo asistido por `PLATFORM_SUPPORT`. |
| 12 | Reversión por fuerza bruta de teléfonos anonimizados o desbloqueo de clientes fraudulentos al pedir supresión (Ley 1581) | Reemplazo de `phone_e164` por `"ANON_" + UUID` aleatorio puro; preservación de bloqueo antifraude en `blocked_phone_hmac` firmado con secreto del servidor (`FRAUD_PEPPER_SECRET`), redacción de snapshots y exclusión de PII en `AuditEvent` y `export-csv`. |
| 13 | Falsas expectativas sobre Facturación Electrónica DIAN | Separar el desglose informativo de impuestos de la emisión fiscal DIAN e imprimir en todo pre-recibo (58mm/80mm) y vista web la leyenda de no equivalencia con factura electrónica ni documento equivalente POS[cite: 8]. |
| 14 | Incompatibilidad de cabeceras JWT en `EventSource` nativo | Uso de `@microsoft/fetch-event-source` en React para enviar `Authorization: Bearer <jwt>` en canales SSE privados[cite: 8]. |
| 15 | Enlaces de menú o seguimiento sin vista previa en WhatsApp | Inyección en servidor de etiquetas OpenGraph (`og:title`, `og:description`, `og:image`) en las rutas `/r/:slug` y `/t/:token`[cite: 8]. |
| 16 | Sobrescritura entre dos meseros editando la misma mesa | Control de concurrencia optimista (`expected_account_version`) + bloqueo pesimista (`FOR UPDATE`) en `DiningAccount`[cite: 8]. |
| 17 | Desactivación de un módulo con operaciones abiertas o bloqueo por dependencia mutua | `OpenOperationsChecker` verifica operaciones en curso y el validador del grafo evalúa de forma atómica el conjunto final $S_{\text{final}}$ en lote[cite: 8]. |
| 18 | Truncamiento o sobrecarga al generar código con IA | División balanceada con `FASE_03A` y `FASE_03B` separadas por puerta de pruebas intermedia, versiones fijas en `STACK_VERSIONS.md` y prompts acotados por módulo[cite: 8]. |

---

## 15. Alcance definitivo del MVP (Hitos 1 y 2) y criterios de aceptación

### 15.1 Estructura de Hitos y Fases de Construcción del MVP

**Hito 1: MVP Piloto para Restaurantes Pequeños (Fases 01, 02, 03A y 03B — Cierra Niveles 0 y 1)**
- **Fase 01 (`FASE_01_FUNDACION_Y_NUCLEO_SAAS.md`):** Monorepo, `STACK_VERSIONS.md`, PostgreSQL + RLS transaccional con `set_config`, Auth JWT/RBAC (con claves temporales, enlaces por WhatsApp y `forgot-password` de sistema), Multi-tenancy, Motor de Capacidades (evaluación atómica en lote de $S_{\text{final}}$ y `default_pickup_delivery_policy`), Auditoría sin PII, `/api/v1/health`, Pino Logger y Onboarding guiado[cite: 8].
- **Fase 02 (`FASE_02_CATALOGO_IMPUESTOS_Y_VITRINA.md`):** Catálogo digital, Motor Tributario DIAN (3 modos + aviso fiscal), Importador CSV/Pegado, `QrCodeLink`, Vitrina Pública Mobile-First y etiquetas OpenGraph para WhatsApp (**Completa Nivel 0: `MENU_ONLY`**)[cite: 8].
- **Fase 03A (`FASE_03A_MOTOR_PEDIDOS_ANTIFRAUDE_Y_WHATSAPP.md`):** Modelo de pedidos (`origin` + `fulfillment_type`), estado `NOT_TRACKED` para política `NONE`, zonas de cobertura (`delivery`), creación idempotente de pedidos públicos, los 5 controles antifraude (incluyendo `blocked_phone_hmac`), anonimización irreversible Ley 1581 (`UUID` + redacción de snapshots), generador de enlaces `wa.me`, scheduler de caducidad (`EXPIRED_UNPROCESSED`) y carrito/checkout público en React (**Puerta de pruebas intermedia obligatoria antes de pasar a 03B**).
- **Fase 03B (`FASE_03B_PANEL_LIVIANO_AJUSTES_Y_TRACKING_SSE.md`):** Servicio de tiempo real SSE (`SseStreamService` + `@microsoft/fetch-event-source`), **Panel Liviano de 1 pantalla** (`lite-order-panel`), ajuste pre-procesamiento auditado (`OrderEdit`), acción de un toque **"Procesar pedido"** (`ACCEPTED` + enlace de retorno a WhatsApp y botón copiar) y página pública de seguimiento en vivo (`/t/:publicToken`) (**Completa Nivel 1: `WHATSAPP_SIMPLE` — Listo para Piloto Comercial**).

**Hito 2: Operación Completa de Local, Cocina, Reportes y Salón (Fases 04, 05 y 06 — Cierra Niveles 2 y 3)**
- **Fase 04 (`FASE_04_PANEL_COMPLETO_COCINA_KDS_Y_COBROS_MANUALES.md`):** Panel Operativo Completo con filtros e historial, instrucciones de transferencia (`payment_instructions_json`), opción acotada `require_payment_before_preparation`, Cobros Manuales (`payments.manual` con función única `recalculatePaymentState()`, bloqueo transaccional + `CHECK` local contra cobro en `REQUESTED`, resolución `COURTESY` / `WRITTEN_OFF`, reversión `revert-resolution`, anulación `VOIDED` y restricciones `CHECK`) y Pantalla de Cocina KDS por estaciones (`KitchenStation`)[cite: 8].
- **Fase 05 (`FASE_05_REPORTES_SUSCRIPCION_MANUAL_Y_PWA.md`):** Módulo de Reportes (`reporting` sobre órdenes independientes: ecuación maestra de conciliación, prelación de cobros parciales, volumen `NOT_TRACKED`, tiempos entre estados y exportación CSV auditada sin PII), módulo de Suscripción SaaS manual (`billing-subscription`), impresión térmica CSS 58/80mm con leyenda DIAN y configuración PWA instalable (**Completa al 100 % el Nivel 2: `FULL_PANEL`**).
- **Fase 06 (`FASE_06_SALON_MESAS_Y_DIVISION_INFORMATIVA.md`):** Módulo de Salón (`dining` con política fija `OFFLINE_ONLY`, cobro centralizado en `DiningAccount`, cierre por pago total o resolución auditada, y reapertura en dos modos: `ACCOUNTING_ONLY` sin ocupar mesa física y `FULL_TABLE`), plano interactivo de mesas, QR de mesa confirmado por mesero (`channel.dine_in_qr`), cuentas abiertas con concurrencia (`version`), **Distribución Informativa por Persona** (`dining.consumption_split` en partes enteras) y extensión de `reporting` para consolidar `DiningAccount` sin doble conteo de órdenes hijas (**Completa Nivel 3: `DINING_ROOM` y `ENTERPRISE_MULTI`**).

### 15.2 Criterios de aceptación verificables del MVP (Definition of Done)

1. Un restaurante nuevo en perfil `WHATSAPP_SIMPLE` publica su menú (solo con nombre, precio y categoría) y recibe su primer pedido por WhatsApp con `payment_policy = 'NONE'` y `payment_status = 'NOT_TRACKED'`, mientras que la fila `DINE_IN` en `BranchChannelPolicy` permanece en `OFFLINE_ONLY` (`enabled = false`) sin violar ningún `CHECK` de base de datos.
2. Si ese restaurante sube después al perfil `FULL_PANEL` (`OFFLINE_ONLY`), los pedidos nuevos nacen en `UNPAID`, mientras que los pedidos históricos nacidos en Nivel 1 permanecen en `NOT_TRACKED` (y rechazan con `409 Conflict` cualquier intento de registrarles cobros manuales)[cite: 8].
3. Todo pedido almacena por separado `origin` (`WHATSAPP`, `WEB_DIRECT`, `TABLE_QR`, `STAFF`) y `fulfillment_type` (`PICKUP`, `DELIVERY`, `DINE_IN`), permitiendo que un pedido de WhatsApp a domicilio transicione a `OUT_FOR_DELIVERY` y uno de recogida a `READY` → `PICKED_UP`[cite: 8].
4. El sistema bloquea con `403 Forbidden` o `429 Too Many Requests` pedidos provenientes de un teléfono marcado con `is_blocked = true` (incluso si el cliente solicitó anonimización, verificando `blocked_phone_hmac`) o que supere el límite de 3 solicitudes abiertas en la sucursal.
5. `ManualPaymentsService` bloquea con `SELECT ... FOR UPDATE` la fila de `Order` y rechaza con `409 ORDER_MUST_BE_ACCEPTED_BEFORE_PAYMENT` cualquier intento de registrar un pago sobre una solicitud en `status = 'REQUESTED'` (respaldado por el `CHECK (status != 'REQUESTED' OR paid_total_cop = 0)` local en `orders`), garantizando cero pagos huérfanos al caducar solicitudes.
6. En `payments.manual`, `recalculatePaymentState()` calcula siempre el estado real: si una orden de `$45.000` recibe `$20.000` en efectivo queda en `PARTIALLY_PAID` (por cobrar `$25.000`); al recibir `$25.000` por transferencia pasa a `PAID`; si luego se anula (`VOIDED`) el pago de `$25.000`, regresa exactamente a `PARTIALLY_PAID` (`paid_total_cop = 20000`) y no a `UNPAID`.
7. Una orden resuelta como `COURTESY` o `WRITTEN_OFF` (o una `DiningAccount` en `CLOSED`) rechaza nuevos pagos o anulaciones con `409 Conflict`; al ejecutar `revert-resolution` en la orden o `reopen` con `mode = 'ACCOUNTING_ONLY'` en la cuenta de salón, permite corregir pagos en caja aunque la mesa física esté ocupada por otro grupo, dejando trazabilidad completa en `AuditEvent`.
8. En `reporting`, los totales monetarios suman órdenes independientes (`dining_account_id IS NULL`) más cuentas de salón (`DiningAccount`) sin duplicar órdenes hijas de mesa; los abonos parciales se imputan en orden (1.º Productos, 2.º Domicilio, 3.º Propina); las cifras concilian al peso ($\text{Facturado} \equiv \text{Recaudado} + \text{Por Cobrar} + \text{Cortesías} + \text{Castigos}$); y el CSV descargado no contiene PII de clientes.
9. `require_payment_before_preparation` solo puede activarse en `PICKUP` o `DELIVERY` con política `OFFLINE_ONLY` (nunca en `NONE` ni en `DINE_IN`), impidiendo pasar el pedido a `PREPARING` hasta que `payment_status` sea `PAID` y apagándose automáticamente si el canal baja a `NONE`[cite: 8].
10. Un administrador puede crear usuarios del personal y restablecer sus contraseñas mediante clave temporal (`must_change_password = true`) o enlace compartible por WhatsApp aunque `notifications.email` esté desactivado, y el propietario dispone de `POST /api/v1/auth/forgot-password`.
11. Al ejecutar la anonimización de un cliente (`POST /api/v1/admin/customers/:id/anonymize`), su `phone_e164` se reemplaza por `"ANON_" + UUID` aleatorio irreversible y su PII se redacta en `Customer`, `DeliveryAddress` y `Order.customer_snapshot_json` sin alterar un solo peso de las ventas históricas.
12. En la distribución informativa por persona (`dining.consumption_split`), una picada compartida de `$50.000` entre 3 personas persiste `share_units = 1`, `total_item_shares = 3` y montos `$16.667`, `$16.667` y `$16.666`; al recargar la cuenta desde la base de datos los montos se mantienen idénticos con `$0` sin asignar[cite: 8].
13. El validador del grafo de capacidades evalúa el conjunto resultante $S_{\text{final}}$ de forma atómica en lote (permitiendo activar o desactivar `dining` y `payments.manual` en una misma petición) y bloquea con `409 Conflict` si existen operaciones abiertas (`OpenOperationsChecker`).
14. Pruebas automatizadas E2E comprueban que el Restaurante A jamás puede leer, modificar ni recibir eventos SSE del Restaurante B, incluso bajo peticiones concurrentes sobre el pool de conexiones de PostgreSQL, y que las claves `idempotency_key` están aisladas por `tenant_id` (`UNIQUE(tenant_id, idempotency_key)`)[cite: 8].

---

## 16. Estructura de costes a presupuestar

1. **Infraestructura Etapa 1 (Piloto 1–50 locales):** Servidor/contenedor para NestJS (`apps/api`), base de datos PostgreSQL 16 gestionada con PITR (WAL archiving para RPO `< 15 min`) y backups diarios, hosting/CDN para `apps/web`, bucket compatible con S3 (Cloudflare R2 / AWS S3) para fotos del menú y servicio de correo transaccional del núcleo (ej. AWS SES / Resend en capa gratuita o de bajo volumen) para recuperación de contraseñas de propietarios (`identity-access`).
2. **Infraestructura Etapa 2 (50–500 locales):** Instancia Redis para caché de menús públicos y sincronización Pub/Sub de streams SSE[cite: 8].
3. **Asesoría legal y contable:** Validación de textos de privacidad, retención de `blocked_phone_hmac` por interés legítimo antifraude (Ley 1581 de 2012), leyenda fiscal DIAN y parametrización de perfiles tributarios de referencia (INC/IVA)[cite: 8].

---

## 17. Registro de Decisiones Arquitectónicas (ADRs Cerrados)

| ID | Decisión Arquitectónica | Estado | Resumen de la decisión adoptada |
| :--- | :--- | :--- | :--- |
| `ADR-001` | Monolito modular en NestJS + React en Monorepo | **Aprobada** | Monorepo `Turborepo` con `apps/api` (NestJS), `apps/web` (React + Vite) y `packages/shared` (Zod + tipos + calculadoras)[cite: 8]. |
| `ADR-002` | Multi-tenancy con PostgreSQL RLS transaccional | **Aprobada** | Esquema compartido con `tenant_id` obligatorio, `UNIQUE(tenant_id, idempotency_key)` y ejecución de `SELECT set_config('app.current_tenant_id', $1, true)` dentro de transacciones interactivas de Prisma[cite: 8]. |
| `ADR-003` | Ciclo financiero completo, reapertura contable y ecuación de conciliación | **Aprobada** | Recálculo único mediante `recalculatePaymentState()`, bloqueo transaccional + `CHECK` local contra cobros en `REQUESTED`, reapertura contable (`REOPENED_ACCOUNTING`) sin ocupar mesa física, prelación de abonos parciales y conciliación sin doble conteo en `reporting`. |
| `ADR-004` | Separación de `origin` y `fulfillment_type` y acotación de pre-cobro | **Aprobada** | Se reemplaza `channel` por `origin` y `fulfillment_type`; `DINE_IN` es siempre `OFFLINE_ONLY` con cobro en `DiningAccount`, y `require_payment_before_preparation` solo aplica a `PICKUP`/`DELIVERY` bajo `OFFLINE_ONLY`[cite: 8]. |
| `ADR-005` | Estrategia Web Mobile-First + PWA en el MVP | **Aprobada** | Web sin descarga con etiquetas OpenGraph para el comensal y PWA instalable para el personal del restaurante en el MVP[cite: 8]. |
| `ADR-006` | Motor tributario de 3 modos sin doble cobro y aviso fiscal DIAN | **Aprobada** | El modo se define en `Tenant.tax_profile_mode` (`FINAL_PRICE_NO_BREAKDOWN` por defecto en Nivel 1) guardando snapshots por línea en `OrderItem` e incluyendo aviso de no equivalencia con factura electrónica DIAN[cite: 8]. |
| `ADR-007` | Evaluación atómica del grafo `depends_on_all` y `depends_on_any` | **Aprobada** | Validación en lote sobre el conjunto resultante $S_{\text{final}}$, con 16 módulos en catálogo (13 MVP + 3 Post-MVP) y 5 perfiles operativos. |
| `ADR-008` | Tiempo real con SSE y `@microsoft/fetch-event-source` | **Aprobada** | Canales SSE autenticados con Bearer JWT en el panel/KDS mediante `@microsoft/fetch-event-source` y canal público por token opaco para el cliente[cite: 8]. |
| `ADR-009` | Persistencia entera en distribución por persona y QR de mesa confirmado | **Aprobada** | `ConsumptionAssignment` persiste partes enteras y `assigned_amount_cop`; los pedidos `TABLE_QR` nacen en `REQUESTED` hasta confirmación del mesero[cite: 8]. |
| `ADR-010` | Identidad resiliente y anonimización irreversible con UUID + HMAC antifraude (Ley 1581) | **Aprobada** | Alta/reseteo de empleados por clave temporal o WhatsApp y `forgot-password` de sistema para propietarios; anonimización de clientes con `"ANON_" + UUID`, `blocked_phone_hmac` con secreto de servidor y exclusión de PII en `AuditEvent` y CSV. |

---

## 18. Validaciones externas, precios comerciales SaaS y parámetros configurables

1. **Definición comercial de planes de suscripción SaaS (`POR VALIDAR` por dirección de negocio):**
   - Definir las tarifas mensuales en COP, límites de sucursales y eventual periodo de prueba (`TRIALING`) para los planes `PLAN_STARTER_WHATSAPP` (Niveles 0 y 1), `PLAN_OPERATIONS_PRO` (Nivel 2) y `PLAN_ENTERPRISE_DINING` (Nivel 3)[cite: 8].
2. **Parámetros operativos por defecto en base de datos:**
   - *Flujo de estados por defecto en Nivel 1 (`WHATSAPP_SIMPLE`):* `REQUESTED` → `ACCEPTED` → `READY` (si es `PICKUP`) / `OUT_FOR_DELIVERY` (si es `DELIVERY`) → `DELIVERED` / `PICKED_UP`[cite: 8].
   - *Límite antifraude de solicitudes abiertas simultáneas por `phone_e164`:* `3 solicitudes` por sucursal[cite: 8].
   - *Caducidad de solicitudes `REQUESTED` sin procesar:* `240 minutos (4 horas)`[cite: 8].
   - *Vigencia del enlace público de seguimiento tras estado final:* `24 horas`[cite: 8].
   - *Plazo de inactividad para anonimización automática de PII de clientes:* `24 meses`.
3. **Validaciones jurídicas y contables (`POR VALIDAR` en paralelo al desarrollo):**
   - Revisión del texto de autorización de tratamiento de datos personales, política de retención/anonimización y conservación de `blocked_phone_hmac` por prevención de fraude (Ley 1581 de 2012).
   - Revisión contable del tratamiento informativo del recargo de domicilio (`delivery_fee_cop`) y validación del texto de no equivalencia fiscal en pre-recibos[cite: 8].

---

## 19. Fuentes oficiales y referencias normativas

- **DIAN — Oficio 904106 de 2022 (INC y servicio de restaurante):** https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_904106_2022.htm[cite: 8]
- **DIAN — Oficio 902460 de 2022 (Base, tarifa, inclusión en lista de precios al público y discriminación del INC en restaurantes):** https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_902460_2022.htm[cite: 8]
- **DIAN — Concepto 012029 int. 1398 de 2025 (Consulta normativa sobre Impuesto Nacional al Consumo):** https://www.dian.gov.co/Contribuyentes-Plus/Documents/13-CONCEPTO-012029-int-1398-04092025.pdf[cite: 8]
- **Wompi & ePayco (Referencias conservadas para el Anexo Post-MVP):** https://wompi.co/es/co/planes-tarifas/ , https://docs.wompi.co/docs/colombia/eventos/ y https://epayco.com/tarifas/[cite: 8]

---

## 20. Historial de cambios

| Versión | Fecha | Descripción del cambio |
| :--- | :--- | :--- |
| `0.1.0` – `0.8.0` | 2026-10-19 | Iteraciones P-001 a P-008: levantamiento funcional, división informativa por persona, precios finales sin doble cobro, capacidades modulares, escalera de adopción y flujo WhatsApp sin API con panel liviano y ajuste previo[cite: 8]. |
| `1.0.0` | 2026-10-19 | Iteración P-009: consolidación en stack React + NestJS + PostgreSQL dentro de un Monorepo Turborepo[cite: 8]. |
| `2.0.0` | 2026-10-21 | Iteración P-010: retiro de pasarelas en línea del MVP; separación de `origin` + `fulfillment_type`; persistencia entera en `ConsumptionAssignment`; grafo `depends_on_all` / `depends_on_any`; confirmación de mesero en QR de mesa y estado `PARTIALLY_PAID`[cite: 8]. |
| `2.1.0` | 2026-10-23 | Iteración P-011: restitución de controles antifraude (4.6.2); `dining` exige `payments.manual` y cierre de cuenta; estado `NOT_TRACKED` para política `NONE`; bloqueo de cancelación/reducción por debajo de lo pagado; `payment_instructions_json`, aviso fiscal DIAN y Anexo Post-MVP[cite: 8]. |
| `2.2.0` | 2026-10-23 | Iteración P-012: `require_payment_before_preparation` acotado por `CHECK` a `OFFLINE_ONLY` y `PICKUP`/`DELIVERY`; `DINE_IN` forzado a `OFFLINE_ONLY` con cobro en `DiningAccount`; estados `COURTESY` y `WRITTEN_OFF`; `CHECK` XOR en `Payment` y `UNIQUE(tenant_id, idempotency_key)`; delta en Anexo Post-MVP[cite: 8]. |
| `2.3.0` | 2026-10-24 | Iteración P-013: función única `recalculatePaymentState()`, congelamiento/reversión de resoluciones, ecuación de conciliación en `reporting`, bloqueo de cobros en `REQUESTED`, `default_pickup_delivery_policy`, invitaciones sin email, anonimización Ley 1581, RPO/RTO e inversión de Fases 05 y 06. |
| `2.4.0` | 2026-10-26 | **Ajustes Finales de Precisión (P-014):** (1) Anonimización irreversible con `"ANON_" + UUID`, `blocked_phone_hmac` firmado con secreto del servidor y exclusión de PII en `AuditEvent`/CSV; (2) precisión en validación transaccional `SELECT ... FOR UPDATE` + `CHECK` local en `orders` contra cobros en `REQUESTED`; (3) reapertura contable (`REOPENED_ACCOUNTING`) sin ocupar mesa física y tres reglas de reportes (cero doble conteo en salón, prelación de abonos parciales y extensión en Fase 06); (4) `forgot-password` en API y coste de email transaccional del núcleo; (5) división de Fase 03 en `FASE_03A` y `FASE_03B` con puerta intermedia; y (6) evaluación atómica en lote del conjunto $S_{\text{final}}$ en el grafo de módulos. |

---

## 21. Anexo Técnico Post-MVP: Especificación de Reserva y Delta para Pasarelas de Pago en Línea (`payments.online` y `payments.links`)

Este anexo documenta las reglas de seguridad criptográfica y el **delta exacto de modelo de datos y máquinas de estado** que deberá aplicarse cuando se habiliten los módulos Post-MVP `payments.online` y `payments.links`[cite: 8]:

1. **Delta Controlado de Esquema y Enumeraciones al Activar Pasarelas Post-MVP:**
   - **Ampliación de `payment_policy`:** Se agregan los valores `ONLINE_OPTIONAL` y `ONLINE_REQUIRED` en `BranchChannelPolicy` y `Order` (aplicables a `PICKUP` y `DELIVERY`)[cite: 8].
   - **Nuevo estado inicial `AWAITING_PAYMENT` en `OrderStatus`:** Cuando un pedido se crea bajo `payment_policy = 'ONLINE_REQUIRED'`, nace en estado **`AWAITING_PAYMENT`** (y **no** en `RECEIVED`)[cite: 8]. El panel operativo y el KDS de cocina filtran y ocultan por defecto las órdenes en `AWAITING_PAYMENT` para que ningún operador ni cocinero prepare por error un pedido cuyo pago en línea aún no ha sido confirmado por la pasarela[cite: 8]. Solo cuando el webhook aprueba el pago, la orden transiciona automáticamente de `AWAITING_PAYMENT` a `RECEIVED` (o `ACCEPTED`) y emite la alerta SSE al panel y cocina[cite: 8].
   - **Ampliación de estados y columnas en `Payment` y `Order`:**
     - En `Payment`: se agregan los métodos `ONLINE_PSE`, `ONLINE_CARD`, `PAYMENT_LINK`; los estados `CREATED`, `PENDING`, `DECLINED`, `EXPIRED`, `REFUNDED`, `PARTIALLY_REFUNDED`, `REVIEW_REQUIRED`; y las columnas `provider (VARCHAR NULL)` y `provider_reference (VARCHAR NULL)` con `UNIQUE(tenant_id, provider, provider_reference)`[cite: 8].
     - En `Order.payment_status` y `DiningAccount.payment_status`: se agregan `PENDING`, `PARTIALLY_REFUNDED`, `REFUNDED` y `REVIEW_REQUIRED`[cite: 8].
   - **Nuevas tablas exclusivas del módulo `payments.online` / `payments.links`:**
     - `MerchantPaymentConfig(id, tenant_id, branch_id?, provider, environment, public_key, encrypted_private_key, encrypted_events_secret, encrypted_integrity_secret, is_active)`[cite: 8].
     - `PaymentLink(id, tenant_id, branch_id, payment_id, order_id?, account_id?, provider_link_id, url, amount_cop, expires_at?, status [ACTIVE | PAID | EXPIRED | SUPERSEDED], created_by, created_at)`[cite: 8].
     - `PaymentEvent(id, tenant_id?, provider, event_id, received_at, signature_valid, processed_at?, payload_json, UNIQUE(provider, event_id))`[cite: 8].
2. **Modelo Direct-to-Merchant y Cifrado de Credenciales por Comercio:**
   - Cada restaurante vincula su propia cuenta de Wompi o ePayco; las llaves privadas y secretos se cifran en reposo con **AES-256-GCM** usando `IV` y `authTag` únicos por registro[cite: 8].
3. **Resolución de Comercio en Webhooks e Integridad Financiera:**
   - El endpoint receptor de webhooks incluye el `tenantId` en la ruta (`POST /api/v1/integrations/payments/:provider/:tenantId/webhook`) para localizar el `MerchantPaymentConfig` del comercio y descifrar su `events_secret` antes de verificar la firma SHA256 (`crypto.timingSafeEqual`)[cite: 8].
   - **Prohibición de aprobación por redirección:** El retorno del navegador jamás aprueba un pago; solo el webhook verificado criptográficamente cambia el pago a `APPROVED` de forma idempotente bajo bloqueo `SELECT ... FOR UPDATE`[cite: 8].
   - **Conversión a centavos en el adaptador e invalidación de links:** La base de datos se mantiene en pesos enteros (`COP`), convirtiendo a centavos (`amount_cop * 100`) dentro de `WompiAdapter` / `EpaycoAdapter`, e invalidando como `SUPERSEDED` cualquier `PaymentLink` previo si cambia el saldo de la cuenta u orden[cite: 8].