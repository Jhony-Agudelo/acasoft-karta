# Casos de Prueba Detallados — Fase 03A: Motor de Pedidos, Antifraude y Checkout WhatsApp

**Documento:** `CASOS_DE_PRUEBA_FASE_03A_KARTA.md`  
**Aplicación:** Karta — Sistema Operativo Gastronómico (Versión 2.4.0)  
**Fecha:** 2026-10-28  
**Prerrequisito:** Fase 01, Fase 02 y Fase 03A desplegadas en PostgreSQL 17 (`acasoft-karta-saas`), API NestJS en puerto `4000` y Web en puerto `5173`.  
**Credenciales de Administrador:** `admin@karta.co` / `Password123!`

---

## 1. Resumen de la Matriz de Pruebas Automatizadas (Fase 03A)

| Identificador | Nivel | Componente | Descripción Resumida | Estado Automatizado |
| :--- | :---: | :--- | :--- | :---: |
| **`TC-03A-U01`** | Unitario | `@restaurante-saas/shared` | Máquina de estados determinista (`canTransitionOrder`), evaluación de `fulfillment_type`, pre-cobro y transiciones válidas/inválidas | ✅ Verde |
| **`TC-03A-U02`** | Unitario | `@restaurante-saas/shared` | Generación de URL `wa.me` (Cliente $\rightarrow$ Sucursal) con texto estructurado y enmascaramiento PII (`maskCustomerSnapshot`) | ✅ Verde |
| **`TC-03A-U03`** | Unitario | `@restaurante-saas/shared` | Validación de esquemas Zod (`CreatePublicOrderSchema`, `DeliveryZoneSchema`, consentimiento Ley 1581) | ✅ Verde |
| **`TC-03A-I01`** | Integración | `@restaurante-saas/api` | Creación de pedido público Nivel 1 (`WHATSAPP`), autoridad de precios en backend y numeración `#A101` | ✅ Verde |
| **`TC-03A-I02`** | Integración | `@restaurante-saas/api` | Concurrencia en numeración diaria (`#A101` a `#A110`) con `ON CONFLICT DO UPDATE` y bloqueo a nivel de fila | ✅ Verde |
| **`TC-03A-I03`** | Integración | `@restaurante-saas/api` | Idempotencia aislada por tenant (`UNIQUE(tenant_id, idempotency_key)`) sin conflicto inter-tenant | ✅ Verde |
| **`TC-03A-I04`** | Integración | `@restaurante-saas/api` | Validación de cobertura de zona, pedido mínimo (`min_order_cop`) y rechazo por modificadores agotados | ✅ Verde |
| **`TC-03A-I05`** | Integración | `@restaurante-saas/api` | Control antifraude: límite de 3 solicitudes abiertas concurrentes por teléfono en la misma sucursal | ✅ Verde |
| **`TC-03A-I06`** | Integración | `@restaurante-saas/api` | Anonimización irreversible Ley 1581 con UUID v4, redacción en snapshots y preservación de bloqueo antifraude HMAC | ✅ Verde |
| **`TC-03A-I07`** | Integración | `@restaurante-saas/api` | Caducidad automática de solicitudes no atendidas (`EXPIRED_UNPROCESSED`) mediante scheduler programado | ✅ Verde |
| **`TC-03A-I08`** | Integración | `@restaurante-saas/api` | Restricciones `CHECK` en PostgreSQL (`chk_orders_payment_status_policy`, etc.) y aislamiento RLS multi-tenant | ✅ Verde |
| **`TC-03A-E01`** | E2E / Web | `@restaurante-saas/web` | Flujo de vitrina pública, carrito Zustand persistente, checkout de domicilio, validación de campos y redirección `wa.me` | ✅ Verde |

---

## 2. Guía de Ejecución Manual Paso a Paso (Frontend & Backend)

### CP-03A-01: Gestión de Zonas de Domicilio y Tarifas de Envío
- **Objetivo:** Verificar que el administrador puede configurar zonas de reparto con tarifas fijas y pedidos mínimos, y que la vitrina pública las expone inmediatamente.
- **Ruta en Navegador:** `http://localhost:5173/admin/delivery-zones`.
- **Pasos de Ejecución:**
  1. Inicia sesión con `admin@karta.co` / `Password123!`.
  2. En la barra de navegación superior o lateral, haz clic en **"Zonas de Domicilio"** (`/admin/delivery-zones`).
  3. Haz clic en el botón **"+ Nueva Zona"**.
  4. Diligencia los siguientes campos en el formulario:
     - **Nombre de la Zona:** `Zona Rosa / Parque 93`
     - **Barrios Cubiertos:** `Chicó Norte, El Retiro, Parque 93, Cabrera`
     - **Tarifa de Envío (COP):** `6000`
     - **Pedido Mínimo (COP):** `35000`
     - **Tiempo Estimado (Minutos):** `35`
  5. Haz clic en **"Crear Zona"**.
- **Resultado Esperado:**
  - La zona aparece en la tabla con insignia verde de **Activa**, tarifa `$ 6.000 COP`, pedido mínimo `$ 35.000 COP` y tiempo `35 min`.
  - La zona se persiste en la tabla `delivery_zones` vinculada al `tenant_id` y `branch_id`.

---

### CP-03A-02: Directorio de Clientes, Bloqueo Antifraude y Supresión Ley 1581 (Habeas Data)
- **Objetivo:** Validar que el administrador puede auditar el historial de clientes, bloquear clientes sospechosos con cálculo HMAC y ejecutar la anonimización irreversible requerida por la Ley Estatutaria 1581 de 2012 de Colombia.
- **Ruta en Navegador:** `http://localhost:5173/admin/customers`.
- **Pasos de Ejecución:**
  1. En el menú de administración, ingresa a **"Clientes & Fidelización"** (`/admin/customers`).
  2. Localiza a un cliente en la tabla o usa el buscador de nombre/teléfono.
  3. **Prueba de Bloqueo Antifraude:**
     - En la fila del cliente, haz clic en el botón de tres puntos o acción **"Bloquear"**.
     - Ingresa el motivo: `Múltiples pedidos falsos no recibidos`.
     - Confirma el bloqueo.
     - Verifica que el estado cambia a **"Bloqueado"** con fondo rojo y el motivo es visible.
     - En base de datos, `Customer.is_blocked = true` y `Customer.blocked_phone_hmac` almacena el digest SHA-256 generado con `FRAUD_PEPPER_SECRET`.
  4. **Prueba de Supresión de Datos Personales (Habeas Data):**
     - Haz clic en **"Anonimizar Datos (Ley 1581)"** en el cliente bloqueado.
     - Lee el modal de advertencia que indica que el proceso es irreversible y borra direcciones y nombres, preservando totales contables y el hash HMAC del bloqueo.
     - Haz clic en **"Confirmar Anonimización"**.
- **Resultado Esperado:**
  - El cliente se actualiza a nombre `Cliente Anonimizado`, teléfono `ANON_...` (UUID).
  - Sus direcciones guardadas en `delivery_addresses` son eliminadas físicamente.
  - El `customer_snapshot_json` de sus órdenes pasadas muestra campos `REDACTED`, pero el total `grand_total_cop` se mantiene intacto.
  - Si el cliente intenta realizar un nuevo pedido con su número original, el sistema lo rechaza con HTTP 403 Forbidden (`CUSTOMER_PHONE_BLOCKED`) gracias al HMAC preservado.

---

### CP-03A-03: Checkout Público con Modalidad Domicilio y Generación de Enlace WhatsApp
- **Objetivo:** Comprobar que un comensal puede armar un pedido desde la carta pública, validar la cobertura y finalizarlo recibiendo su código `#A101` y el deep link a WhatsApp.
- **Ruta en Navegador:** `http://localhost:5173/r/karta-bistro`.
- **Pasos de Ejecución:**
  1. Ingresa a la vitrina pública del restaurante (`/r/karta-bistro`).
  2. Agrega al menos dos productos al carrito (por ejemplo, *Ajiaco Santafereño* y *Jugo de Maracuyá*).
  3. Haz clic en el botón flotante del carrito en la esquina inferior derecha.
  4. En el modal de Checkout, selecciona la pestaña **"🛵 Domicilio"**.
  5. En el selector de **Zona de Cobertura**, elige la zona configurada previamente.
  6. Completa el formulario de entrega:
     - **Tu Nombre Completo:** `Santiago Morales`
     - **Número de WhatsApp:** `3105556677`
     - **Dirección de Entrega:** `Carrera 11 # 85-32`
     - **Barrio:** `Chicó Norte`
     - **Torre / Apto / Indicaciones:** `Apto 402, dejar en portería`
  7. Marca la casilla obligatoria: *"Autorizo el tratamiento de mis datos personales según la Ley 1581 de 2012 para la gestión de este pedido"*.
  8. Haz clic en el botón **"Terminar pedido por WhatsApp"**.
- **Resultado Esperado:**
  - El backend crea la orden con código diario `#A101`, estado `REQUESTED`, `payment_policy = 'NONE'` y `payment_status = 'NOT_TRACKED'`.
  - La pantalla muestra el código `#A101` en tipografía destacada, el desglose con tarifa de envío y el botón verde **"Continuar a WhatsApp"**.
  - Al pulsar el botón, se abre la URL `https://wa.me/57...` con el mensaje prellenado que incluye el código `#A101`, el detalle de los productos y la dirección de entrega.

---

### CP-03A-04: Seguimiento del Pedido en Tiempo Real por Token Opaco
- **Objetivo:** Verificar que el comensal puede consultar el avance de su pedido desde cualquier dispositivo sin necesidad de crear cuenta ni iniciar sesión.
- **Ruta en Navegador:** `http://localhost:5173/t/:publicToken` (utilizando el enlace generado en el pedido anterior).
- **Pasos de Ejecución:**
  1. Desde la pantalla de confirmación o copiando el enlace de seguimiento, ingresa a `/t/:publicToken`.
  2. Verifica que se visualiza:
     - Código del Pedido: `#A101`.
     - Insignia de Estado: **"Solicitud Recibida"** (Fase inicial `REQUESTED`).
     - Tipo de Entrega: `Domicilio`.
     - Datos enmascarados del cliente: `Santiago M.`, `+57 *** *** 6677` y dirección con máscara de seguridad.
     - Resumen contable con productos, modificadores y tarifa de domicilio.
     - Cronología de eventos (`OrderStatusEvent`) con la marca de tiempo de recepción.
- **Resultado Esperado:**
  - La página carga instantáneamente mediante la ruta pública segura `GET /api/v1/public/orders/track/:publicToken`.
  - La información personal crítica está enmascarada para proteger la privacidad del cliente en enlaces compartidos.

---

### CP-03A-05: Validación Antifraude de Pedido Mínimo y Límite de 3 Pedidos Abiertos
- **Objetivo:** Comprobar la resiliencia del sistema ante intentos de ordenar por debajo del mínimo exigido por la zona o ante ráfagas de pedidos spam desde el mismo número.
- **Ruta en Navegador:** `http://localhost:5173/r/karta-bistro`.
- **Pasos de Ejecución:**
  1. **Prueba de Pedido Mínimo:**
     - Agrega un producto de bajo costo (ej. `$ 8.000 COP`).
     - Abre el Checkout y selecciona una zona con pedido mínimo de `$ 35.000 COP`.
     - Verifica que el sistema muestra una alerta roja: *"El pedido mínimo para esta zona es de $ 35.000 COP (Faltan $ 27.000 COP)"* y desactiva el botón de envío.
  2. **Prueba de Límite de 3 Pedidos Abiertos:**
     - Realiza 3 pedidos sucesivos en estado `REQUESTED` con el mismo número telefónico.
     - Al intentar emitir el 4.° pedido, el backend responde con código de error HTTP `429 Too Many Requests` (`MAX_OPEN_ORDERS_PER_PHONE_EXCEEDED`).
- **Resultado Esperado:**
  - La plataforma bloquea pedidos no rentables o fraudulentos protegiendo la operación de la cocina y el repartidor.

---

### CP-03A-06: Verificación de Restricciones CHECK en PostgreSQL
- **Objetivo:** Asegurar que la integridad transaccional está garantizada a nivel del motor de base de datos relacional y no depende exclusivamente de la capa de aplicación.
- **Comando de Verificación:** Ejecutar `pnpm --filter @restaurante-saas/api test` (específicamente la suite `TC-03A-I08`).
- **Restricciones Verificadas en Base de Datos:**
  1. `chk_orders_payment_status_policy`: Si `payment_policy = 'NONE'`, el estado de pago debe ser forzosamente `NOT_TRACKED`. Si es `OFFLINE_ONLY`, no puede ser `NOT_TRACKED`.
  2. `chk_orders_no_payment_in_requested`: Ninguna orden en estado `REQUESTED` puede tener `paid_total_cop > 0`.
  3. `chk_orders_dine_in_policy`: Si la modalidad es `DINE_IN`, la política de pago no puede ser `NONE` (requiere `OFFLINE_ONLY` o pasarela).
  4. `chk_orders_prepayment_scope`: El pago anticipado obligatorio antes de cocina solo aplica a pedidos para llevar (`PICKUP`) o domicilio (`DELIVERY`).
- **Resultado Esperado:** Todo intento de inserción que viole estas reglas es abortado directamente por PostgreSQL con código de error `23514` (`check_violation`).

---

## 3. Comandos de Verificación Automatizada

Para ejecutar todas las pruebas de la Fase 03A en la terminal:

```bash
# 1. Pruebas Unitarias del Motor de Estados, Snapshots y Plantillas WhatsApp
pnpm --filter @restaurante-saas/shared test

# 2. Pruebas de Integración de API, Numeración Concurrente, Antifraude y Ley 1581
pnpm --filter @restaurante-saas/api test

# 3. Pruebas End-to-End del Frontend y Checkout
pnpm --filter @restaurante-saas/web test

# 4. Verificación Completa de Tipos y Compilación de Producción
pnpm turbo run typecheck
pnpm turbo run test
pnpm --filter @restaurante-saas/web build
```
