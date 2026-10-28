# Casos de Prueba Detallados — Fase 03B: Panel Liviano de 1 Pantalla, Ajuste Pre-Procesamiento y Seguimiento en Vivo (SSE)

**Documento:** `CASOS_DE_PRUEBA_FASE_03B_KARTA.md`  
**Aplicación:** Karta — Sistema Operativo Gastronómico (Versión 2.4.0)  
**Fecha:** 2026-10-28  
**Hito Concluido:** **Hito 1 — MVP Piloto para Pequeños Restaurantes (Fases 01, 02, 03A y 03B)**  
**Prerrequisitos:** PostgreSQL 17 (`acasoft-karta-saas`), API NestJS en puerto `4000` y Frontend Vite React en puerto `5173`.  
**Credenciales de Administrador:** `admin@karta.co` / `Password123!`

---

## 1. Resumen de la Matriz de Pruebas Automatizadas (Fase 03B)

| Identificador | Nivel | Componente | Descripción Resumida | Estado Automatizado |
| :--- | :---: | :--- | :--- | :---: |
| **`TC-03B-U01`** | Unitario | `@restaurante-saas/shared` | Máquina de estados determinista (`canTransitionOrderStatus`), reglas según origen (`WHATSAPP`, `DIRECT_WA`, `POS`, `QR_TABLE`), tipo de entrega (`DELIVERY`, `PICKUP`, `ON_PREMISE`) y bloqueo terminal | ✅ Verde |
| **`TC-03B-U02`** | Unitario | `@restaurante-saas/shared` | Enmascaramiento PII estricto (`maskCustomerName`, `maskCustomerPhone`, `maskCustomerAddress`, `maskCustomerSnapshot`) en cumplimiento de la Ley 1581 de 2012 (Habeas Data Colombia) | ✅ Verde |
| **`TC-03B-U03`** | Unitario | `@restaurante-saas/shared` | Plantillas de mensajes WhatsApp Sucursal $\rightarrow$ Cliente (`buildBranchToCustomerProcessedWhatsapp`, `buildBranchToCustomerStatusWhatsapp`) sin exponer datos sensibles | ✅ Verde |
| **`TC-03B-I01`** | Integración | `@restaurante-saas/api` | Ajuste de ítems pre-procesamiento (`PATCH /orders/:id/items`), recálculo en backend con precios de catálogo COP, snapshots before/after en `order_edits` | ✅ Verde |
| **`TC-03B-I02`** | Integración | `@restaurante-saas/api` | Procesamiento 1-Touch (`POST /orders/:id/process`): transición a `ACCEPTED`, bloqueo inmutable `is_locked = true` y generación de URL `wa.me` de confirmación | ✅ Verde |
| **`TC-03B-I03`** | Integración | `@restaurante-saas/api` | Transición determinista de estados (`PATCH /orders/:id/status`) con validación de transiciones ilegales y registro en auditoría | ✅ Verde |
| **`TC-03B-I04`** | Integración | `@restaurante-saas/api` | Consulta de seguimiento público (`GET /public/orders/:publicOrderToken`) con PII enmascarada, historial de ajustes y disclaimer legal DIAN | ✅ Verde |
| **`TC-03B-I05`** | Integración | `@restaurante-saas/api` | Expiración de enlaces de seguimiento a las 24 horas del cierre (`HTTP 410 Gone`) por privacidad | ✅ Verde |
| **`TC-03B-I06`** | Integración | `@restaurante-saas/api` | Servicio reactivo `SseStreamService` para canal privado de sucursal (`branch:{tenantId}:{branchId}:orders`) y canal público (`tracking:{publicOrderToken}`) | ✅ Verde |
| **`TC-03B-I07`** | Integración | `@restaurante-saas/api` | Registro inmutable de eventos de auditoría y política RLS PostgreSQL en tabla `order_edits` | ✅ Verde |
| **`TC-03B-E01`** | E2E / Web | `@restaurante-saas/web` | Panel Liviano (`/panel/lite`), campana Web Audio API, modal de ajustes, avance de estados y timeline público en tiempo real (`/t/:token`) | ✅ Verde |

---

## 2. Guía de Ejecución Manual Paso a Paso (Frontend & Backend)

### CP-03B-01: Acceso al Panel Liviano de 1 Pantalla y Preferencias de Audio
- **Objetivo:** Verificar que el administrador u operador puede acceder al panel liviano optimizado para tablet/PC en barra o caja, y configurar las alertas sonoras de pedidos entrantes.
- **Ruta en Navegador:** `http://localhost:5173/panel/lite`.
- **Pasos de Ejecución:**
  1. Inicia sesión con `admin@karta.co` / `Password123!`.
  2. En el menú superior o lateral, haz clic en **"Panel Liviano"** (`/panel/lite`).
  3. Observa el encabezado del panel:
     - Debe mostrar la insignia verde de conexión en vivo **"En vivo (SSE)"**.
     - Debe mostrar el botón de prueba sonora **"Probar Sonido"**.
     - Debe mostrar el interruptor de sonido (**"Sonido Activo"** / **"Sonido Silenciado"**).
  4. Haz clic en **"Probar Sonido"** y verifica que suena una campana clara y armónica (dos tonos a 880 Hz y 1760 Hz sintetizados vía Web Audio API sin dependencias externas de archivos mp3).
  5. Haz clic en **"Sonido Activo"** para silenciarlo y recarga la página; verifica que la preferencia persiste en `localStorage`.
- **Resultado Esperado:**
  - El panel carga sin errores, establece la conexión SSE con el backend en `/api/v1/branches/:branchId/orders/events` y el sonido funciona según las preferencias del operador.

---

### CP-03B-02: Recepción de Nueva Orden en Tiempo Real vía SSE
- **Objetivo:** Comprobar que cuando un cliente realiza un pedido desde la vitrina pública, el pedido aparece inmediatamente en el Panel Liviano sin recargar la página y emite el sonido de campana.
- **Ruta en Navegador:**
  - Pestaña A (Operador): `http://localhost:5173/panel/lite`
  - Pestaña B (Cliente): `http://localhost:5173/r/karta-bistro`
- **Pasos de Ejecución:**
  1. En la Pestaña B, agrega productos al carrito (por ejemplo, 1 Hamburguesa Clásica y 1 Bebida).
  2. Haz clic en **"Pedir por WhatsApp"**, selecciona **"A Domicilio"**, diligencia nombre `Carlos Gómez`, teléfono `3001234567`, dirección `Calle 72 # 10-34` y acepta los términos de Habeas Data.
  3. Haz clic en **"Confirmar y Enviar Solicitud"**.
  4. Cambia inmediatamente a la Pestaña A (sin presionar F5 ni recargar).
- **Resultado Esperado:**
  - La campana suena inmediatamente alertando al restaurante.
  - La tarjeta del nuevo pedido con código `#A...` aparece en la columna **"Nuevos / Pendientes"** destacada con borde ámbar y la etiqueta de estado **"SOLICITUD ENVIADA (WHATSAPP)"**.
  - Los números de teléfono y dirección del cliente se visualizan con tipografía grande y legible para llamada telefónica rápida de verificación si es necesario.

---

### CP-03B-03: Ajuste Pre-Procesamiento de Ítems (`OrderAdjustModal`)
- **Objetivo:** Verificar que el restaurante puede negociar o ajustar la orden con el cliente antes de aceptarla (por ejemplo, si se agotó un ítem o el cliente pidió más unidades), recalculando de manera transparente y con integridad fiscal los subtotales COP.
- **Ruta en Navegador:** `http://localhost:5173/panel/lite`.
- **Pasos de Ejecución:**
  1. En una tarjeta de pedido en estado `REQUESTED` o `RECEIVED`, haz clic en el botón con ícono de deslizadores **"Ajustar Ítems"**.
  2. En el modal que se abre:
     - Incrementa la cantidad de un ítem con el botón `+`.
     - O elimina un ítem con el botón de papelera.
     - Agrega un ítem nuevo del catálogo disponible.
     - Diligencia obligatoriamente el campo **"Motivo del Ajuste"** (ejemplo: `Cliente solicitó adición de gaseosa por llamada`).
  3. Observa cómo el subtotal y el total en pesos colombianos (COP) se recalculan en tiempo real en la parte inferior del modal.
  4. Haz clic en **"Guardar Ajuste"**.
- **Resultado Esperado:**
  - El modal se cierra, la tarjeta se actualiza inmediatamente mostrando el nuevo total.
  - En la base de datos se crea un registro inmutable en `order_edits` con el snapshot `before` y `after`, el ID del usuario editor y el motivo textual.
  - La orden emite un evento SSE `order.adjusted` a la sucursal y `tracking.updated` al token público.

---

### CP-03B-04: Procesamiento 1-Touch (`1-Touch Process`) y Generación de WhatsApp
- **Objetivo:** Comprobar que con un solo clic el operador confirma la orden, bloquea modificaciones posteriores (`is_locked = true`) y obtiene el enlace directo para notificar al cliente por WhatsApp con el enlace de seguimiento en vivo.
- **Ruta en Navegador:** `http://localhost:5173/panel/lite`.
- **Pasos de Ejecución:**
  1. En la tarjeta del pedido, haz clic en el botón verde principal **"Procesar y Enviar WA"** (o **"Aceptar Pedido"**).
  2. Observa el modal o alerta de confirmación con dos opciones:
     - **"Abrir WhatsApp"**: Abre una nueva pestaña hacia `https://wa.me/573001234567?text=...`.
     - **"Copiar Enlace / Mensaje"**: Copia el mensaje preformateado al portapapeles.
  3. Verifica el contenido del mensaje preformateado:
     - Saludo cordial con el nombre de la sucursal.
     - Confirmación del código del pedido (ej. `#A101`).
     - Detalle de los productos y total en COP.
     - **Enlace de Seguimiento en Vivo:** `http://localhost:5173/t/{publicOrderToken}`.
     - **Cumplimiento Habeas Data:** En el mensaje no se exponen direcciones completas ni datos crediticios del cliente.
- **Resultado Esperado:**
  - El estado del pedido cambia a **"CONFIRMADO"** (`ACCEPTED`).
  - La orden se bloquea (`is_locked = true`), impidiendo alteraciones no autorizadas.
  - El botón **"Ajustar Ítems"** desaparece o queda inhabilitado.

---

### CP-03B-05: Flujo Progresivo de Estados del Pedido
- **Objetivo:** Validar que los botones de avance rápido permiten mover el pedido a través de su ciclo de vida natural según su tipo de entrega.
- **Ruta en Navegador:** `http://localhost:5173/panel/lite`.
- **Pasos de Ejecución:**
  1. En el pedido aceptado (`ACCEPTED`), haz clic en **"A Cocina / En Preparación"** $\rightarrow$ el estado cambia a `PREPARING`.
  2. Si es pedido a Domicilio (`DELIVERY`), haz clic en **"Despachar"** $\rightarrow$ el estado cambia a `DISPATCHED`.
  3. Haz clic en **"Marcar Entregado"** $\rightarrow$ el estado cambia a `DELIVERED`.
  4. Observa que el pedido pasa a la pestaña o filtro de pedidos finalizados.
- **Resultado Esperado:**
  - La máquina de estados valida cada transición en el servidor; ninguna transición inválida (por ejemplo, de `REQUESTED` directo a `DELIVERED`) es permitida.
  - Cada cambio emite eventos SSE en tiempo real y registra un evento en la tabla `audit_events`.

---

### CP-03B-06: Seguimiento en Vivo para el Cliente (`PublicTrackingPage`)
- **Objetivo:** Verificar la experiencia del cliente final al acceder al enlace de tracking `/t/:publicOrderToken` sin requerir autenticación ni descargas de apps.
- **Ruta en Navegador:** `http://localhost:5173/t/<publicOrderToken>`.
- **Pasos de Ejecución:**
  1. Abre el enlace público copiado en el paso anterior en una ventana de incógnito o en un dispositivo móvil.
  2. Verifica los elementos visuales en pantalla:
     - **Encabezado Gastronómico:** Nombre del restaurante, hora estimada y estado actual en badge coloreado.
     - **Línea de Tiempo Honesta:** Muestra cada hito (Solicitud $\rightarrow$ Confirmado $\rightarrow$ En Preparación $\rightarrow$ En Camino $\rightarrow$ Entregado) con marcas de tiempo reales.
     - **Detalle de Ítems:** Cantidad, nombre de los productos y desglose en pesos colombianos.
     - **Privacidad Ley 1581:** El nombre del cliente se muestra enmascarado (ej. `Car*** Góm***`), el teléfono como `300 *** **67` y la dirección de entrega como `Calle 72 # **-**`.
     - **Aviso Fiscal DIAN:** Muestra claramente el aviso: *"Este comprobante es un documento informativo de seguimiento de pedido y no reemplaza la Factura Electrónica de Venta ni el documento equivalente POS reglamentado por la DIAN."*
  3. Mientras mantienes la pantalla del cliente abierta, ve al Panel Liviano en otra ventana y cambia el estado del pedido.
- **Resultado Esperado:**
  - La pantalla del cliente se actualiza **instantáneamente** vía SSE reflejando el nuevo estado y el hito en la línea de tiempo sin que el cliente tenga que refrescar la página.

---

### CP-03B-07: Caducidad del Enlace de Seguimiento a las 24 Horas (`HTTP 410 Gone`)
- **Objetivo:** Proteger la privacidad de los datos del cliente según la normativa colombiana de Habeas Data, desactivando el enlace de tracking transcurridas 24 horas del cierre de la orden.
- **Ruta en Navegador:** `http://localhost:5173/t/<token_expirado>`.
- **Pasos de Ejecución:**
  1. En base de datos o mediante llamada de prueba, verifica una orden cuyo `tracking_expires_at` sea una fecha en el pasado.
  2. Ingresa a la URL de seguimiento con dicho token.
- **Resultado Esperado:**
  - La API responde con código `HTTP 410 Gone` con mensaje `"El enlace de seguimiento ha expirado por políticas de privacidad"`.
  - El frontend muestra una pantalla elegante con ícono de reloj de arena informando: *"Enlace de Seguimiento Expirado. Este enlace estuvo activo durante 24 horas y ya no está disponible por políticas de privacidad."*

---

## 3. Comandos de Verificación Automática

Para ejecutar toda la batería de pruebas de la Fase 03B y verificar la salud de los paquetes:

```bash
# 1. Pruebas unitarias de esquemas, PII y templates WhatsApp (Fase 03B)
pnpm --filter @restaurante-saas/shared test

# 2. Pruebas de integración de servicios, controllers, SSE y RLS (Fase 03B)
pnpm --filter @restaurante-saas/api test

# 3. Pruebas E2E / componentes web del Panel Liviano y Tracking (Fase 03B)
pnpm --filter @restaurante-saas/web test

# 4. Verificación integral de tipado estricto en todo el monorepo
pnpm turbo run typecheck

# 5. Ejecución completa de las 117 pruebas automatizadas
pnpm turbo run test
```

---

## 4. Conclusión del Hito 1 (MVP Piloto)

Con la implementación y aprobación estricta de las Fases **01**, **02**, **03A** y **03B**:
- **Karta** dispone de un MVP piloto completamente operativo, multi-tenant, con aislamiento en base de datos PostgreSQL mediante RLS, vitrina gastronómica pública, checkout por WhatsApp con cálculo íntegro en COP, panel liviano de 1 pantalla en tiempo real con Web Audio API, y seguimiento público reactivo bajo la Ley Estatutaria 1581 de 2012 de Colombia.
