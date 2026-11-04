# Definición Técnica Definitiva — Karta (Plataforma SaaS Modular para Restaurantes)
**Documento:** `DEFINICION_TECNICA.md` (Parte 1: Secciones 1 a 8)  
**Versión:** 2.5.0 — Incorporación de Turnos y Arqueo Ciego de Caja (`payments.cash_shifts`), Inventario por Recetas/Escandallos (`inventory.recipes`), Reserva de Facturación Electrónica DIAN (`invoicing.electronic_dian`) y Conector Contable de Cierre Z (P-015)  
**Fecha:** 2026-11-03  
**Estado:** Versión Definitiva Aprobada para Implementación (Hitos 1, 2 y 3). Los puntos sujetos a validación comercial, contable o jurídica externa se marcan como `POR VALIDAR`.

---

## 1. Propósito y visión

Construir **Karta**, una plataforma SaaS multiempresa (multi-tenant) para que restaurantes pequeños, medianos y grandes administren su presencia digital, recepción de pedidos por WhatsApp o web, cocina, operación de salón, control de turnos de caja e inventario gastronómico por recetas desde un solo lugar, conservando su identidad de marca y la relación directa con sus clientes.

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
- **Gestión de turnos y arqueo ciego de caja (`payments.cash_shifts`):** Apertura de turno con base de efectivo, registro auditado de entradas y salidas menores de efectivo (pago a proveedores de paso o caja menor) y cierre ciego para detectar faltantes o sobrantes de gaveta sin exponer el saldo esperado al cajero.
- **Inventario gastronómico por recetas / escandallos (`inventory.recipes`):** Control de insumos en unidades exactas (gramos, mililitros, unidades), fichas técnicas por plato, variante y modificador, descuento automático al entrar a preparación, registro de compras/mermas y kardex inmutable.
- Gestión multi-sucursal con aislamiento estricto de datos entre restaurantes en PostgreSQL.

### 1.2 Decisiones de producto y arquitectura consolidadas (P-001 a P-015)

1. **Multi-segmento con configuración progresiva:** Un único producto SaaS sirve a negocios desde pequeños locales por WhatsApp hasta restaurantes con salón y múltiples sedes mediante habilitación por plan (*entitlements*) y configuración por organización/sucursal.
2. **Alcance enfocado en operación gastronómica y sin pasarela de pagos en línea en el arranque:** Se prioriza el dominio gastronómico (menú digital, flujo WhatsApp, panel de pedidos, cocina KDS, salón/mesas, distribución informativa por persona, instrucciones de pago directo, registro manual de cobros, turnos de caja, inventario por recetas y reportes conciliados). Las pasarelas de pago en línea (`payments.online` y `payments.links`) quedan fuera del lanzamiento inicial para eliminar fricción bancaria y comisiones por transacción, documentando sus reglas y el delta de esquema en el Anexo Post-MVP (Sección 21).
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
11. **Especialización gastronómica (Turnos de caja e Inventario por Recetas) y coexistencia contable:** En lugar de construir un sistema de contabilidad general horizontal, Karta profundiza en las funciones críticas de restaurante mediante los módulos configurables `payments.cash_shifts` (turnos con base, salidas menores y arqueo ciego) e `inventory.recipes` (escandallos en milésimas enteras con descuento automático al preparar), dejando preparada la arquitectura de puerto/adaptador para Facturación Electrónica POS DIAN vía Proveedor Tecnológico (`invoicing.electronic_dian`) y la sincronización de un único resumen de cierre diario (Cierre Z) hacia softwares contables externos (como Alegra o Siigo).

### 1.3 Lo que NO forma parte del MVP (Exclusiones explícitas)

- Pasarelas de pago en línea (`payments.online`) y generación de links bancarios (`payments.links`), reservadas para el Horizonte Post-MVP (Secciones 4.10 y 21).
- Operar como un marketplace que agrupe restaurantes o cobre comisión por descubrimiento.
- Recaudar, custodiar o dispersar dinero de ventas de comida en cuentas de la plataforma.
- Emitir directamente facturación electrónica o documento equivalente electrónico POS ante la DIAN en el lanzamiento inicial (reservado en el catálogo como módulo Post-MVP `invoicing.electronic_dian` en espera de la selección comercial del Proveedor Tecnológico autorizado — `POR VALIDAR`).
- Reemplazar un software de contabilidad general, balances tributarios, nómina electrónica o ERP horizontal (la relación con softwares contables como Alegra o Siigo se resuelve mediante exportación o sincronización API del cierre diario conciliado).
- Integrar la API paga de WhatsApp Business (envíos automáticos desde servidor).
- Publicación obligatoria en tiendas móviles nativas (App Store / Play Store) durante el MVP.

---

## 2. Principios de producto y experiencia (UX)

1. **Inicio sencillo:** Un restaurante publica su menú y recibe pedidos configurando solo nombre, número de WhatsApp, horario y productos básicos.
2. **Funciones progresivas:** Mostrar únicamente las funciones habilitadas para cada plan, sucursal y rol.
3. **Mobile-first:** Los flujos de comensal, mesero y panel liviano están optimizados para pantallas pequeñas.
4. **Pocas acciones por tarea:** Procesar solicitudes, avanzar estados, enviar a cocina, asignar consumo informativo por persona, registrar cobros y cerrar turno de caja deben tomar los mínimos toques posibles.
5. **Operación tolerante a fallos:** Mostrar advertencias claras cuando falle la red; nunca afirmar que un pedido llegó a cocina o quedó cobrado sin confirmación del servidor.
6. **Datos portables y sin PII innecesario:** Permitir exportar la información contable, de ventas y de inventario en CSV con auditoría, sin incluir datos personales sensibles de los comensales en las descargas.
7. **Marca propia y vista previa en redes:** Cada restaurante conserva su identidad visual y sus enlaces públicos generan tarjetas de vista previa (OpenGraph) al compartirse por WhatsApp.
8. **Configuración segura:** Ningún rol operativo puede alterar precios de catálogo, perfiles tributarios, recetas ni módulos activos sin permiso administrativo.
9. **Trazabilidad completa:** Auditar quién realizó cambios sensibles, quién ajustó un pedido antes de procesarlo, quién anuló un cobro, quién registró salidas de efectivo o ajustes de inventario y quién cerró, reabrió o resolvió cuentas con saldo.
10. **No confundir pedido con pago:** Una orden puede estar aceptada, preparada o entregada sin que su cobro esté saldado (`UNPAID` o `PARTIALLY_PAID`), o sin que la plataforma gestione su cobro (`NOT_TRACKED`); ambas máquinas de estado son independientes.
11. **Adaptación al restaurante:** Cada capacidad se activa o se omite por restaurante y sucursal; lo desactivado se oculta en React y devuelve `MODULE_DISABLED` en NestJS.
12. **Cliente informado con datos reales:** La página de seguimiento muestra únicamente estados marcados por una persona del restaurante con su hora exacta, sin temporizadores falsos.
13. **Sin carga extra para el restaurante pequeño:** No se exige configurar mesas, turnos de caja, recetas de inventario, impuestos discriminados ni estaciones de cocina a quien opera en el nivel inicial de WhatsApp.

---

## 3. Actores, roles y matriz de alcance

Los roles agrupan permisos asignables con alcance de organización o de sucursales específicas (`branch_scope`). En un restaurante pequeño el propietario reúne todos los roles:

| Rol (`role_key`) | Actor | Responsabilidades y permisos principales |
| :--- | :--- | :--- |
| `TENANT_ADMIN` | Propietario / Administrador del restaurante | Configura organización, marca, sucursales, módulos activos, usuarios (alta con clave temporal o enlace de invitación), perfil tributario, instrucciones de pago, recetas e insumos globales, anonimización de datos de clientes, menú, horarios y reportes globales. |
| `BRANCH_MANAGER` | Gerente de sucursal | Gestiona la operación diaria, disponibilidad de catálogo, órdenes, mesas, bloqueo de teléfonos fraudulentos, anulaciones justificadas de cobros (`void`), resolución y reversión de saldos no cobrados (`COURTESY` / `WRITTEN_OFF`), reapertura contable u operativa de cuentas, auditoría de diferencias en arqueos ciegos de caja (`CashShift`), compras/ajustes/mermas de insumos (`inventory.recipes`) y reportes de sus sucursales asignadas. |
| `CASHIER` | Caja / Operador de panel | Revisa el panel de pedidos y cuentas, ajusta solicitudes antes de procesarlas, procesa pedidos, envía enlaces de seguimiento por WhatsApp, registra cobros manuales, cierra cuentas saldadas y, cuando `payments.cash_shifts` está activo, abre turno de caja con base inicial, registra entradas/salidas menores de efectivo y ejecuta el cierre/arqueo ciego de su turno. |
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

**Catálogo completo de módulos en base de datos (19 módulos en `seed.ts`: 15 habilitables en Hitos 1–3 + 4 reservados Post-MVP):**

| Módulo (`key`) | Estado | Qué habilita | Requiere todos (`depends_on_all`) | Requiere al menos uno (`depends_on_any`) | Comportamiento si está desactivado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ordering` | **Hito 1 (MVP)** | Carrito de compras y recepción de pedidos digitales | — | — | El sitio público opera únicamente en modo consulta (solo lectura de menú). |
| `channel.pickup` | **Hito 1 (MVP)** | Pedidos para recoger en tienda (`fulfillment_type = PICKUP`) | `['ordering']` | — | No se ofrece la modalidad de recogida en el checkout. |
| `channel.delivery` | **Hito 1 (MVP)** | Domicilio (`fulfillment_type = DELIVERY`), zonas, cobertura y tarifas | `['ordering']` | — | No se solicitan direcciones ni se calcula envío. |
| `dining` | **Hito 2 (MVP)** | Salón: áreas, plano de mesas y cuentas abiertas (`DiningAccount`) | `['payments.manual']` | — | No existen mesas, cuentas ni QR por mesa; el sistema opera solo con pedidos. |
| `channel.dine_in_qr` | **Hito 2 (MVP)** | Autopedido del comensal escaneando el QR de su mesa (`origin = TABLE_QR`) | `['ordering', 'dining']` | — | Los QR de mesa no habilitan carrito; solo se permite consulta de carta general. |
| `dining.consumption_split` | **Hito 2 (MVP)** | Distribución informativa del consumo por persona en salón (4.4) | `['dining']` | — | La calculadora de asignación por comensal no aparece en la cuenta de mesa. |
| `order_panel` | **Hito 1 (MVP)** | Panel operativo de pedidos (modo liviano de 1 pantalla en Nivel 1 y modo completo con filtros/historial en Nivel 2+) | — | `['ordering', 'dining']` | No hay panel de pedidos activo. |
| `kitchen` | **Hito 2 (MVP)** | Pantalla de cocina (KDS) separada por estaciones de preparación | `['order_panel']` | `['ordering', 'dining']` | Los estados de preparación se avanzan directamente desde el panel de pedidos. |
| `tracking` | **Hito 1 (MVP)** | Página pública en vivo de seguimiento del pedido (`/t/:publicToken`) | `['ordering', 'order_panel']` | — | El enlace público muestra únicamente un recibo estático sin línea de tiempo. |
| `payments.manual` | **Hito 2 (MVP)** | Registro manual de cobros (efectivo, datáfono, transferencia) e instrucciones de pago | — | `['order_panel', 'dining']` | La plataforma no registra cobros presenciales en pedidos (política `NONE` y estado `NOT_TRACKED`). |
| `payments.cash_shifts` | **Hito 3** | Turnos de caja con base inicial, entradas/salidas menores y cierre/arqueo ciego (4.8.1) | `['payments.manual']` | — | Los cobros en efectivo se registran directamente sin exigir apertura de turno ni arqueo de gaveta. |
| `inventory.recipes` | **Hito 3** | Catálogo de insumos, escandallos por plato/modificador, descuento automático y kardex (4.11) | — | `['ordering', 'dining']` | Vender o preparar productos no descuenta materia prima ni calcula costo de receta. |
| `notifications.whatsapp_click` | **Hito 1 (MVP)** | Enlaces profundos click-to-chat (`wa.me`) cliente ↔ restaurante | `['ordering']` | — | El checkout confirma directamente en web sin redirigir a WhatsApp. |
| `notifications.email` | **Hito 1 (MVP)** | Avisos comerciales/operativos por correo electrónico hacia el comensal | `['ordering']` | — | No se envían correos al comensal. *(La seguridad e identidad de usuarios en `identity-access` nunca depende de este módulo).* |
| `reporting` | **Hito 2 (MVP)** | Reportes operativos, conciliación de ventas, tiempos y exportación CSV | — | `['order_panel', 'dining']` | Se oculta el módulo de reportes. |
| `payments.online` | *Post-MVP* | Pasarela de pagos en línea (PSE y tarjetas con webhooks) | — | `['ordering', 'dining']` | Reservado con `is_post_mvp = true` (Anexo Sección 21). |
| `payments.links` | *Post-MVP* | Links de pago bancarios compartibles por WhatsApp | `['payments.online']` | — | Reservado con `is_post_mvp = true` (Anexo Sección 21). |
| `notifications.whatsapp_api` | *Post-MVP* | Mensajería automática con WhatsApp Business API | `['ordering']` | — | Reservado con `is_post_mvp = true`. |
| `invoicing.electronic_dian` | *Post-MVP* | Emisión de Factura Electrónica y Documento Equivalente POS DIAN vía Proveedor Tecnológico | `['payments.manual']` | — | Reservado con `is_post_mvp = true` (`POR VALIDAR` selección de proveedor tecnológico). |

**Reglas de modularidad obligatorias:**
1. **Aplicación estricta en Backend (`ModuleCapabilityGuard`):** Todo endpoint de un módulo desactivado responde HTTP `403 Forbidden` con `{ errorCode: 'MODULE_DISABLED', moduleKey }`. Intentar activar un módulo con `is_post_mvp = true` responde HTTP `400 Bad Request` (`MODULE_RESERVED_POST_MVP`).
2. **Evaluación atómica del conjunto resultante en el grafo (`depends_on_all` y `depends_on_any`):** Cuando se guarda una configuración de módulos (`PATCH /admin/modules` o `/admin/branches/:id/modules`) o se aplica un perfil operativo, el validador construye primero el **conjunto completo resultante de módulos activos $S_{\text{final}}$ en una sola operación en lote**, y luego verifica que para todo $M \in S_{\text{final}}$ se cumpla $M.\text{depends\_on\_all} \subseteq S_{\text{final}}$ y (si $M.\text{depends\_on\_any} \neq \emptyset$) $M.\text{depends\_on\_any} \cap S_{\text{final}} \neq \emptyset$. Evaluar el conjunto resultante de forma atómica permite activar o desactivar simultáneamente módulos con dependencia mutua (como `dining` y `payments.manual`) sin bloqueos de orden secuencial.
3. **Desactivar nunca borra datos:** El histórico de órdenes, cuentas, pagos, turnos de caja y movimientos de kardex se conserva intacto en PostgreSQL para consulta en solo lectura.
4. **Bloqueo por operaciones abiertas (`OpenOperationsChecker`):** No se permite desactivar `dining` si existen `DiningAccount` en estado `OPEN` o `REOPENED_ACCOUNTING`, ni desactivar `kitchen` si existen órdenes en `PREPARING`, ni desactivar `payments.manual` mientras existan órdenes o cuentas activas en estado `UNPAID` o `PARTIALLY_PAID` (una vez que dichas órdenes se saldan como `PAID` o se resuelven explícitamente como `COURTESY` / `WRITTEN_OFF`, dejan de bloquear el cambio de módulo o perfil), ni desactivar `payments.cash_shifts` mientras exista un turno de caja (`CashShift`) en estado `OPEN` en la sucursal.
5. **Aplicación de perfiles sobre `BranchChannelPolicy` e inmutabilidad por pedido:**
   - Al aplicar un perfil operativo (`OperatingProfile`), su `default_pickup_delivery_policy` (`NONE` u `OFFLINE_ONLY`) se asigna únicamente a las filas `fulfillment_type IN ('PICKUP', 'DELIVERY')` de `BranchChannelPolicy`, mientras que la fila `fulfillment_type = 'DINE_IN'` se mantiene **siempre** con `payment_policy = 'OFFLINE_ONLY'`, `require_payment_before_preparation = false` y `enabled = (dining está activo)`.
   - Cada `Order` congela en su registro el `payment_policy` y el `require_payment_before_preparation` vigentes cuando fue creada. Al cambiar de perfil entre Nivel 1 (`NONE`) y Nivel 2+ (`OFFLINE_ONLY`), los pedidos históricos creados bajo `NONE` conservan su estado `NOT_TRACKED` y jamás se muestran como deuda pendiente (`UNPAID`). Si una sucursal baja la política de `PICKUP` o `DELIVERY` a `NONE`, el backend fuerza automáticamente `require_payment_before_preparation = false` en ese canal.

**Perfiles de operación preconfigurados:**

| Clave (`profile_key`) | Nombre del perfil | Módulos activos por defecto | Política para `PICKUP` / `DELIVERY` (`DINE_IN` es siempre `OFFLINE_ONLY`) | Caso de uso objetivo |
| :--- | :--- | :--- | :--- | :--- |
| `MENU_ONLY` | Solo menú | Núcleo (`catalog`) | `NONE` | Restaurante que solo busca presencia web y QR de consulta de carta. |
| `WHATSAPP_SIMPLE` | WhatsApp simple | `ordering`, `channel.pickup`, `channel.delivery` (opcional), `notifications.whatsapp_click`, `order_panel` (modo liviano), `tracking` | `NONE` (`NOT_TRACKED`) | Sin mesas ni control de caja en plataforma. El cliente pide en web y abre WhatsApp; el local ajusta/procesa en el panel de 1 pantalla y envía el link de seguimiento por el chat. |
| `FULL_PANEL` | Panel completo | `WHATSAPP_SIMPLE` + `order_panel` (modo completo), `payments.manual`, `reporting` (+ `kitchen`, `payments.cash_shifts`, `inventory.recipes` opcionales) | `OFFLINE_ONLY` | Restaurante que desea mostrar instrucciones de transferencia (Nequi/DaviPlata/Bre-B), llevar control de cobros (`UNPAID`/`PARTIALLY_PAID`/`PAID`), arqueos de caja, tiempos de preparación, historial y reportes. |
| `DINING_ROOM` | Salón | `dining`, `ordering`, `channel.dine_in_qr`, `order_panel`, `kitchen`, `tracking`, `dining.consumption_split`, `payments.manual`, `reporting` (+ `payments.cash_shifts`, `inventory.recipes` opcionales) | `OFFLINE_ONLY` | Servicio a la mesa con meseros, autopedido QR en mesa confirmado por mesero, KDS de cocina, división informativa y cierre de caja. |
| `ENTERPRISE_MULTI` | Completo / Multi-sucursal | Los 15 módulos operativos activos (incluyendo `payments.cash_shifts` e `inventory.recipes`), con sobrescritura independiente por sucursal | `OFFLINE_ONLY` | Cadenas o restaurantes que combinan salón, recogida, domicilio, cocina, control de turnos de caja y escandallos de inventario en una o varias sedes. |

### 4.0.1 Escalera de adopción para restaurantes pequeños

| Nivel | Perfil asociado | Qué hace el restaurante | Qué hace la plataforma | Qué NO necesita configurar |
| :--- | :--- | :--- | :--- | :--- |
| **Nivel 0: Menú Digital** | `MENU_ONLY` | Carga su menú básico | Genera sitio público responsive y código QR | Pedidos, pagos, panel, mesas, inventario |
| **Nivel 1: WhatsApp Simple** | `WHATSAPP_SIMPLE` | Pacta pago, domicilio y tiempo por chat; ajusta el pedido en el panel de 1 pantalla, pulsa **"Procesar pedido"** y envía por WhatsApp el link de seguimiento | Permite armar el carrito, registra la solicitud (`REQUESTED`, `payment_status = NOT_TRACKED`), redirige al chat del local, muestra la solicitud en el panel liviano y genera el link de seguimiento | Registro de caja, turnos, mesas, KDS, recetas |
| **Nivel 2: Panel Completo y Cocina** | `FULL_PANEL` | Publica sus instrucciones de Nequi/DaviPlata/Bre-B, usa filtros, pantalla de cocina KDS y registra cobros manuales (con turnos de caja e inventario opcionales) | Habilita control de cobros (`UNPAID`/`PARTIALLY_PAID`/`PAID`), opción de exigir cobro antes de preparar en `PICKUP`/`DELIVERY`, estaciones de cocina y reportes conciliados | Mesas de salón |
| **Nivel 3: Salón, Control de Caja y Recetas** | `DINING_ROOM` / `ENTERPRISE_MULTI` | Activa zonas, mesas, meseros, QR de mesa, distribución informativa por persona, arqueo ciego de turnos de caja, recetas de inventario y múltiples sucursales | Habilita el conjunto completo de los 15 módulos operativos | — |

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

#### 4.8.1 Gestión de turnos, movimientos menores y arqueo ciego de caja (`payments.cash_shifts`)

Cuando el restaurante activa el módulo opcional `payments.cash_shifts` en una sucursal, la operación de efectivo en gaveta se controla por turno:

1. **Apertura de turno (`CashShift` en estado `OPEN`):**
   - El cajero abre el turno de la sucursal registrando la base inicial de efectivo (`opening_cash_cop >= 0`). Solo puede existir un turno en estado `OPEN` por sucursal a la vez (garantizado por índice único parcial en PostgreSQL).
   - Mientras `payments.cash_shifts` esté activo en la sucursal, el backend exige que exista un `CashShift` en estado `OPEN` para permitir registrar cualquier cobro con `method = 'CASH'` (respondiendo `409 OPEN_CASH_SHIFT_REQUIRED` si no hay turno abierto) y vincula automáticamente `Payment.cash_shift_id = shift.id`. Asimismo, solo se permite anular (`void`) un pago en efectivo si pertenece al turno actualmente `OPEN`. Si el módulo está desactivado, `cash_shift_id` permanece en `NULL`.
2. **Entradas y salidas menores de efectivo (`CashShiftMovement`):**
   - Permite registrar flujos de efectivo en gaveta que no provienen de pedidos:
     - `CASH_IN`: Ingreso adicional de base/sencillo para dar cambio (`CHANGE_FUND` u `OTHER`).
     - `CASH_OUT`: Salida menor de efectivo autorizada en operación diaria (`SUPPLIER_PAYMENT` para pago en efectivo a proveedores de paso como hielo/verduras, `PETTY_EXPENSE` para gastos menores de caja o `OTHER`), exigiendo monto entero `amount_cop > 0`, categoría, motivo obligatorio y referencia/soporte opcional.
3. **Ecuación determinista de efectivo esperado en gaveta (`expected_cash_cop`):**
   Dado que `Payment.amount_cop` en los cobros con `method = 'CASH'` y `status = 'APPROVED'` representa el efectivo neto que permanece en la caja tras entregar el cambio (`change_given_cop`), el efectivo físico esperado al cierre del turno es exactamente:
   $$\text{expected\_cash\_cop} = \text{opening\_cash\_cop} + \sum \text{Payment.amount\_cop}_{\text{CASH, APPROVED, shift}} + \sum \text{CashShiftMovement}_{\text{CASH\_IN}} - \sum \text{CashShiftMovement}_{\text{CASH\_OUT}}$$
4. **Arqueo y cierre ciego (`BLIND_CLOSE`):**
   - Durante el turno activo y en el modal de cierre, la interfaz para el rol `CASHIER` **oculta** `expected_cash_cop` y el acumulado de ventas en efectivo para evitar que el cajero ajuste artificialmente su conteo.
   - Al ejecutar `POST /api/v1/cash-shifts/:shiftId/close`, el cajero digita a ciegas el efectivo físico total contado en gaveta (`declared_cash_cop >= 0`, asistido opcionalmente por una calculadora de billetes y monedas) y observaciones de cierre.
   - El backend calcula y congela en el registro del turno `expected_cash_cop` y la diferencia `difference_cop = declared_cash_cop - expected_cash_cop` (`0` = cuadrado exacto, `< 0` = faltante de caja, `> 0` = sobrante de caja), pasa el turno a `status = 'CLOSED'`, registra el evento en `AuditEvent` y expone el resultado completo en el reporte de arqueos para `BRANCH_MANAGER` y `TENANT_ADMIN`.

### 4.9 Reportes, no doble conteo y prelación de imputación en pagos parciales (`reporting`)

Para garantizar conciliación contable exacta al peso colombiano en todos los escenarios, el módulo `reporting` aplica cuatro reglas formales:

1. **Unidad contable de agregación (Cero doble conteo en Salón):**
   - Los totalizadores financieros (`gross_billed_total_cop`, `collected_total_cop`, `pending_receivable_cop`, `courtesy_total_cop`, `written_off_total_cop`) se calculan sumando dos conjuntos disjuntos: (a) las **órdenes independientes** (`Order` donde `dining_account_id IS NULL` y `payment_policy = 'OFFLINE_ONLY'` en estados confirmados `ACCEPTED` a `DELIVERED`/`PICKED_UP`) y (b) las **cuentas de mesa** (`DiningAccount` no canceladas).
   - Las órdenes hijas de una mesa (`Order` donde `dining_account_id IS NOT NULL`) **jamás se suman por separado en los totales monetarios** para no duplicar los valores ya consolidados en su `DiningAccount`; sus `OrderItem` se consultan únicamente para el ranking de productos vendidos y tiempos de preparación en cocina.
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

- **Facturación Electrónica y Documento Equivalente Electrónico POS DIAN (`invoicing.electronic_dian` — En espera de definición de Proveedor Tecnológico):** Se reserva en la arquitectura el puerto `ElectronicInvoicingPort` para conectar vía API REST al Proveedor Tecnológico autorizado por la DIAN que se seleccione comercialmente (`POR VALIDAR`: Facturatech, HGI, Cadena, Siigo/Alegra API). Karta enviará el JSON estructurado de la venta e impuestos al cerrar una orden o cuenta, y el Proveedor Tecnológico se encargará de generar y firmar el XML UBL 2.1, realizar la validación previa ante la DIAN y retornar el CUFE/CUDE y el código QR fiscal para su impresión térmica en 58mm/80mm.
- **Conector Contable de Cierre Diario (Integración Alegra / Siigo):** Envío automatizado mediante API REST de un único asiento o factura consolidada de cierre diario ("Cierre Z") al finalizar la jornada o cerrar el turno de caja, inyectando las ventas discriminadas por método de pago, impuestos y propinas en el software contable del restaurante sin saturar la API con micro-transacciones por plato.
- **Pasarelas de Pago en Línea (`payments.online`) y Links de Pago (`payments.links`):** Su arquitectura y el delta controlado de esquema y estados (`ONLINE_OPTIONAL`, `ONLINE_REQUIRED`, `AWAITING_PAYMENT`, `PENDING`, `REFUNDED` y tablas de proveedor) se especifican en el **Anexo Sección 21**.
- **Empaquetado Móvil Nativo con CapacitorJS:** Compilación de `apps/web` a binarios `.aab` (Android) e `.ipa` (iOS) con notificaciones Push nativas en segundo plano e impresión térmica directa ESC/POS por Bluetooth/LAN.
- **Expansión Corporativa:** API oficial de WhatsApp Business y conectores con operadores logísticos externos.

### 4.11 Inventario de insumos y escandallos por receta (`inventory.recipes`)

Permite a los restaurantes controlar las existencias de ingredientes (gramos de carne, unidades de pan, mililitros de salsa, bebidas envasadas) y conocer el costo de materia prima de cada plato vendido:

1. **Catálogo de insumos (`Ingredient`) en milésimas enteras:**
   - Cada insumo pertenece a una sucursal y define su unidad base (`GRAM`, `MILLILITER`, `UNIT`), existencias actuales en milésimas enteras (`current_stock_milli BIGINT`, donde `1000` equivale a `1 g`, `1 ml` o `1 unidad` para evitar errores de punto flotante), umbral de alerta de agotamiento (`min_stock_milli`) y costo promedio en pesos por unidad entera (`cost_per_unit_cop`).
2. **Ficha técnica / Escandallo en dos niveles (`RecipeItem`):**
   - Permite asociar insumos con su cantidad en milésimas (`quantity_milli > 0`) tanto a un producto o variante del catálogo (`product_id` + `variant_id` opcional, ej. *Hamburguesa Doble = 300.000 milésimas [300 g] de carne + 1.000 milésimas [1 und] de pan*) como a una opción de modificador (`modifier_option_id`, ej. *Adición de queso cheddar = 30.000 milésimas [30 g] de queso*).
3. **Descuento automático idempotente y Kardex (`InventoryMovement`):**
   - **Gatillo de descuento (`SALE_CONSUMPTION`):** Cuando una orden transiciona por primera vez al estado `PREPARING` (o directamente a `READY` / `DELIVERED` / `PICKED_UP` / `SERVED` si el restaurante omitió `PREPARING`), y el módulo `inventory.recipes` está activo en la sucursal, el backend calcula en la misma transacción los insumos requeridos por cada `OrderItem` (incluyendo su variante y modificadores elegidos) con `inventory_deducted = false`, inserta los movimientos de salida en `InventoryMovement` (`quantity_delta_milli < 0`), actualiza `Ingredient.current_stock_milli` con bloqueo `SELECT ... FOR UPDATE` y marca `OrderItem.inventory_deducted = true`.
   - **Operación continua no bloqueante:** Si el stock de un insumo llega a `<= min_stock_milli` o pasa temporalmente a negativo (por una compra aún no digitada en el sistema), el panel muestra alerta de bajo stock pero **jamás bloquea una venta ni detiene la cocina**; el bloqueo de venta al público sigue gobernado por el estado `OUT_OF_STOCK` del producto.
   - **Tratamiento de cancelaciones post-preparación (`RETURN_TO_STOCK` vs. `WASTE_OUT`):** Si se cancela una orden o ítem que ya tenía `inventory_deducted = true`, el operador autorizado indica si los insumos no se prepararon (`inventory_resolution = 'RETURN_TO_STOCK'`, lo que inserta un movimiento inverso `SALE_REVERSAL` con `quantity_delta_milli > 0` que reintegra el stock y pone `inventory_deducted = false`) o si el plato ya se había cocinado y se desecha (`inventory_resolution = 'WASTE'`, manteniendo el descuento y registrando la trazabilidad de merma).

---

## 5. Modelo comercial SaaS y estrategia de pagos

### 5.1 Suscripción SaaS manual en el MVP

Cada restaurante contrata un plan comercial (`Subscription`) alineado con la escalera de adopción:
- `PLAN_STARTER_WHATSAPP`: Niveles 0 y 1 (Menú digital, QR, WhatsApp simple, Panel Liviano y Tracking).
- `PLAN_OPERATIONS_PRO`: Nivel 2 (Panel Completo, Cobros Manuales, Turnos y Arqueo Ciego de Caja `payments.cash_shifts`, Instrucciones de Transferencia, Cocina KDS y Reportes).
- `PLAN_ENTERPRISE_DINING`: Nivel 3 (Salón, Mesas, QR de mesa, Distribución informativa por persona, Inventario por Recetas `inventory.recipes` y Multi-sucursal).

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
- **Backend Headless (`apps/api`):** Concentra el 100 % de las reglas de negocio, aritmética en pesos enteros (`COP`) y milésimas de inventario, validación atómica del grafo de módulos, seguridad multi-tenant, controles antifraude y emisión de eventos SSE.
- **Paquete Compartido (`packages/shared`):** Fuente única de verdad para esquemas `Zod`, tipos TypeScript, DTOs, catálogo de los 19 módulos, máquinas de estado y calculadoras matemáticas puras.

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

### 7.4 Estructura completa del proyecto (Árbol del Monorepo)

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
│   │   │   └── seed.ts                      # Roles, permisos, los 19 módulos (15 Hitos 1-3 + 4 Post-MVP) y 5 perfiles
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
│   │   │       ├── payments/                # Cobros manuales, recalculatePaymentState, resoluciones y CashShifts (arqueos)
│   │   │       ├── inventory/               # Insumos (Ingredient), recetas (RecipeItem), descuento automático y Kardex
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
│           │   ├── cash-shifts/             # Hito 3: Apertura de turno, entradas/salidas menores y cierre/arqueo ciego
│           │   ├── dining-pos/              # Salón: Plano de mesas, confirmación QR mesa, comandas y división por persona
│           │   ├── kitchen-kds/             # Cocina: Pantalla KDS por estación con semáforo de tiempos y alerta sonora
│           │   ├── admin-catalog/           # Editor rápido de menú, importador CSV/pegado y centro de descargas QR
│           │   ├── admin-inventory/         # Hito 3: Catálogo de insumos, editor de recetas (escandallos), compras y kardex
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
            │   ├── modules.catalog.ts       # Los 19 módulos (15 Hitos 1-3 + 4 Post-MVP) y 5 perfiles operativos
            │   ├── order-status.machine.ts  # Máquina de estados evaluando origin, fulfillment_type y pre-cobro
            │   ├── payment-status.machine.ts# Políticas, estados, recalculatePaymentState() y prelación de abonos
            │   └── dining.machine.ts        # Estados de Table y DiningAccount (OPEN, REOPENED_ACCOUNTING, CLOSED)
            ├── schemas/                     # Esquemas Zod compartidos entre NestJS y React
            └── utils/
                ├── money-cop.ts             # Aritmética entera en COP
                ├── tax-calculator.ts        # Cálculo de los 3 modos tributarios DIAN por línea
                ├── consumption-split.calculator.ts # Distribución por persona en partes enteras conciliada al peso
                ├── cash-shift.calculator.ts # Cálculo determinista de efectivo esperado y diferencia en arqueo ciego
                ├── recipe-stock.calculator.ts # Conversión y descuento en milésimas enteras por receta y modificador
                └── whatsapp-templates.ts    # Normalizador E.164, enlaces wa.me y enmascaramiento de PII
~~~

### 7.5 Módulos de dominio en el Backend (`apps/api`)

1. `identity-access`: Autenticación JWT, rotación de Refresh Token, alta/invitación de personal con clave temporal o link por WhatsApp, restablecimiento de contraseña (`reset-password` y `forgot-password`) y RBAC por sucursal.
2. `tenancy`: Organizaciones (`Tenant`), sucursales (`Branch`), marca (`BrandSettings`), instrucciones de pago e inyección de metadatos OpenGraph.
3. `capabilities`: Catálogo de 19 módulos (15 operativos + 4 Post-MVP), *entitlements* por plan, configuración por organización/sucursal, validación atómica en lote de `depends_on_all` / `depends_on_any`, perfiles operativos y `OpenOperationsChecker`.
4. `catalog`: Menús, categorías, productos, variantes, grupos de modificadores, `QrCodeLink` y motor tributario.
5. `ordering`: Creación de órdenes/solicitudes (`origin` + `fulfillment_type`), controles antifraude con `blocked_phone_hmac`, anonimización irreversible Ley 1581, ajustes (`OrderEdit`), máquina de estados, seguimiento público y caducidad automática.
6. `dining`: Áreas, mesas, cuentas abiertas (`DiningAccount` con `version`, `table_session_pin`, cobro centralizado, cierre/resolución y reapertura contable `REOPENED_ACCOUNTING` u operativa `FULL_TABLE`), confirmación de pedidos QR de mesa y distribución informativa por persona.
7. `kitchen`: Estaciones de preparación (`KitchenStation`), colas KDS y sincronización automática de ítems a orden respetando `require_payment_before_preparation`.
8. `payments`: Registro de cobros manuales (`CASH`, `POS_TERMINAL`, `MANUAL_TRANSFER`), motor único `recalculatePaymentState()`, resolución y reversión de saldos no cobrados (`COURTESY`, `WRITTEN_OFF`), anulaciones auditadas (`VOIDED`) y gestión de turnos de caja con arqueo ciego (`CashShift`, `CashShiftMovement`).
9. `inventory`: Catálogo de insumos en milésimas enteras (`Ingredient`), fichas técnicas de recetas en productos/variantes y modificadores (`RecipeItem`), descuento automático al preparar y registro de compras/mermas en kardex (`InventoryMovement`).
10. `delivery`: Zonas de cobertura (`DeliveryZone`), pedido mínimo y tarifas de domicilio.
11. `notifications`: Construcción de enlaces `wa.me` y servicio `SseStreamService`.
12. `reporting`: Consultas conciliadas sin doble conteo de salón, prelación de cobros parciales, historial de arqueos de caja, tiempos entre estados y exportación CSV sin PII.
13. `audit`: Registro inmutable de acciones sensibles (`AuditEvent`, sin PII crudo de comensales).
14. `billing-subscription`: Administración manual de planes y estado de suscripción SaaS del restaurante.

### 7.6 Etapas de escala de infraestructura (De pocos restaurantes a miles)

| Etapa de escala | Volumen estimado | Arquitectura de infraestructura y base de datos |
| :--- | :--- | :--- |
| **Etapa 1: Piloto e Inicio** | `1 a 50` restaurantes | 1 contenedor `apps/api` (NestJS), `apps/web` en CDN y 1 instancia **PostgreSQL 16** (`Shared Database, Shared Schema` con RLS vía `set_config`). Eventos SSE y cron de caducidad en memoria dentro de NestJS. |
| **Etapa 2: Crecimiento** | `50 a 500` restaurantes | Se añade **PgBouncer** en modo transacción y **Redis** para cachear el catálogo público (`GET /public/:slug/menu`) con invalidación al editar productos y sincronizar eventos SSE entre instancias mediante Redis Pub/Sub. |
| **Etapa 3: Alta Escala** | `500 a 5.000+` restaurantes | Múltiples réplicas *stateless* de NestJS, particionamiento nativo en PostgreSQL de las tablas `orders`, `order_items`, `order_status_events`, `inventory_movements` y `audit_events` por fecha, y réplica de lectura dedicada para `reporting`. |

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
- **Claridad sobre Facturación Electrónica y Documentos Equivalentes (DIAN):** Ni los resúmenes digitales de pedido ni los comprobantes de cobro manual/pre-cuentas emitidos por la plataforma constituyen factura electrónica de venta ni documento equivalente electrónico POS mientras no esté activo el módulo Post-MVP `invoicing.electronic_dian`. El restaurante es responsable de cumplir sus obligaciones formales de facturación según su régimen tributario, y el software incluye esta advertencia legal en los recibos impresos y digitales.