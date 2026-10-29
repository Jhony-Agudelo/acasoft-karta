# Casos de Prueba Detallados — Fase 02: Catálogo Digital, Motor Tributario, Códigos QR y Vitrina Pública
**Documento:** `CASOS_DE_PRUEBA_FASE_02_KARTA.md`  
**Aplicación:** Karta — Sistema Operativo Gastronómico (Versión 2.4.0)  
**Fecha:** 2026-10-28  
**Prerrequisito:** Fase 01 y Fase 02 completadas con PostgreSQL 16/17 (`acasoft-karta-saas`), API en puerto `4000` y Web en puerto `5173`.  
**Credenciales de Administrador Semilla:** `admin@karta.co` / `Password123!`

---

## 1. Resumen de la Matriz de Pruebas de la Fase 02

| Identificador | Nivel | Componente | Descripción Resumida | Estado Automatizado |
| :--- | :---: | :--- | :--- | :---: |
| **`TC-02-U01`** | Unitario | `@restaurante-saas/shared` | Invariante de No Doble Cobro en `$10.000 COP x 2` | ✅ Verde |
| **`TC-02-U02`** | Unitario | `@restaurante-saas/shared` | Conciliación al peso con modificadores y descuentos | ✅ Verde |
| **`TC-02-U03`** | Unitario | `@restaurante-saas/shared` | Modo `BASE_PLUS_TAX` con adición de impuesto | ✅ Verde |
| **`TC-02-U04`** | Unitario | `@restaurante-saas/shared` | Validador Zod de Esquema Tributario y Modificadores | ✅ Verde |
| **`TC-02-I01`** | Integración | `@restaurante-saas/api` | Carga Rápida e Importación Masiva (3 cats / 12 platos) | ✅ Verde |
| **`TC-02-I02`** | Integración | `@restaurante-saas/api` | Generación, Resolución y Revocación QR (410 Gone) | ✅ Verde |
| **`TC-02-I03`** | Integración | `@restaurante-saas/api` | Disponibilidad en 1 toque y filtro de `ARCHIVED` | ✅ Verde |
| **`TC-02-I04`** | Integración | `@restaurante-saas/api` | Inyección de OpenGraph dinámico para WhatsApp | ✅ Verde |
| **`TC-02-I05`** | Integración | `@restaurante-saas/api` | Prevención de configuración tributaria contradictoria | ✅ Verde |
| **`TC-02-I06`** | Integración | `@restaurante-saas/api` | Aislamiento RLS en catálogo y códigos QR entre tenants | ✅ Verde |
| **`TC-02-E01`** | E2E / Web | `@restaurante-saas/web` | Adaptación entre perfil `MENU_ONLY` y `WHATSAPP_SIMPLE` | ✅ Verde |

---

## 2. Guía de Ejecución Manual Paso a Paso (Frontend & Backend)

### CP-02-01: Configuración del Régimen Tributario y Simulador en Vivo
- **Objetivo:** Verificar que el selector tributario previene configuraciones contradictorias, calcula en vivo sin doble cobro y refleja el aviso legal DIAN.
- **Ruta en Navegador:** `http://localhost:5173/admin/settings` -> Pestaña **"Régimen Tributario & Precios"**.
- **Pasos de Ejecución:**
  1. Inicia sesión con `admin@karta.co` / `Password123!`.
  2. Navega a `Ajustes del Restaurante` y selecciona la pestaña **"Régimen Tributario & Precios"**.
  3. Selecciona el modo **"Precio Incluye Impuesto (TAX_INCLUDED_DISCRIMINATED)"**.
  4. En gravamen predeterminado elige **"INC — Impuesto Nacional al Consumo (8%)"** (tarifa se fija en `800 bp`).
  5. Observa el simulador en vivo:
     - Subtotal Bruto: `$20.000`
     - Base Gravable: `$18.519`
     - Impuesto (INC): `$1.481`
     - Total a Pagar: `$20.000`
     - Comprueba que `$18.519 + $1.481 = $20.000 COP` al peso exacto.
  6. Haz clic en **"Guardar Régimen Tributario"**.
- **Resultado Esperado:** Mensaje de éxito *"Perfil tributario actualizado correctamente"* y auditoría registrada en `audit_events`.

---

### CP-02-02: Creación Rápida de Plato en 15 Segundos
- **Objetivo:** Comprobar que un dueño de restaurante puede crear un plato nuevo indicando únicamente Nombre, Precio y Categoría.
- **Ruta en Navegador:** `http://localhost:5173/menu`.
- **Pasos de Ejecución:**
  1. En el menú lateral haz clic en **"Menú & Carta"**.
  2. Haz clic en el botón superior derecho **"Nuevo Plato Rápido"**.
  3. Ingresa:
     - Nombre del Plato: `Ajiaco Santafereño Especial`
     - Precio: `28000`
     - Categoría: Selecciona una categoría existente o crea una nueva con el botón **"Nueva Categoría"**.
  4. Haz clic en **"Crear Plato"**.
- **Resultado Esperado:** El plato aparece inmediatamente en la cuadrícula de productos con su precio `$ 28.000 COP` y estado `Disponible`.

---

### CP-02-03: Switch Instantáneo de Agotado en 1 Toque
- **Objetivo:** Validar que al agotarse un ingrediente en la cocina, el administrador alterna la disponibilidad en un toque con actualización optimista inmediata.
- **Ruta en Navegador:** `http://localhost:5173/menu`.
- **Pasos de Ejecución:**
  1. Localiza el plato creado en el paso anterior.
  2. En la esquina superior derecha de la tarjeta del plato, haz clic sobre el botón verde **"Disponible"**.
  3. Observa que cambia instantáneamente a **"Agotado Hoy"** con fondo grisáceo.
  4. Abre una pestaña de incógnito y entra a la vitrina pública `http://localhost:5173/r/karta-bistro` (o el slug de tu restaurante).
  5. Comprueba que el plato aparece con la insignia **"Agotado"**.
- **Resultado Esperado:** Cambio sin recargar página y reflejo inmediato en la carta pública.

---

### CP-02-04: Asistente de Importación Masiva (CSV / Pegar desde Excel)
- **Objetivo:** Importar decenas de platos en una sola operación transaccional.
- **Ruta en Navegador:** `http://localhost:5173/menu` -> Botón **"Importar Menú (CSV/Pegado)"**.
- **Pasos de Ejecución:**
  1. Haz clic en **"Importar Menú (CSV/Pegado)"**.
  2. Pega el siguiente bloque de texto en el área de texto:
     ```text
     Entradas | Empanadas Mixtas (3 und) | 12000 | Con ají de la casa
     Fuertes | Sobrebarriga en Salsa | 34000 | Acompañada de arroz y yuca
     Bebidas | Jugo de Maracuyá en Leche | 8000 | Espeso y natural
     ```
  3. Observa la tabla de vista previa inferior: las 3 filas deben mostrar la etiqueta verde **"Correcto"**.
  4. Haz clic en **"Importar 3 Platos"**.
- **Resultado Esperado:** Pantalla de confirmación con *"¡Importación Exitosa! Se crearon 3 categorías y 3 platos listos en tu carta"*.

---

### CP-02-05: Centro de Códigos QR, Previsualización y Descarga
- **Objetivo:** Generar códigos QR unificados opacos, visualizarlos y descargarlos en PNG/SVG.
- **Ruta en Navegador:** `http://localhost:5173/admin/qr-codes`.
- **Pasos de Ejecución:**
  1. En el menú lateral ingresa a **"Códigos QR"**.
  2. Haz clic en **"Generar Nuevo Código QR"**.
  3. Configura:
     - Tipo de Destino: `Carta Digital de la Sucursal`
     - Etiqueta: `Mesa 1 - Salón Principal`
  4. Haz clic en **"Crear Código QR"**.
  5. En la tarjeta generada, haz clic en **"Descargar PNG"** y luego en **"Descargar SVG"**.
  6. Haz clic en **"Copiar Enlace Público"** y pégalo en una pestaña nueva del navegador (formato: `http://localhost:5173/q/<token>`).
- **Resultado Esperado:** Redirección automática instantánea a la vitrina pública de la sede (`/r/:restaurantSlug/b/:branchSlug`).

---

### CP-02-06: Revocación de Código QR (Respuesta 410 Gone)
- **Objetivo:** Verificar que un código QR revocado deja de ser accesible y muestra la pantalla amigable para el comensal.
- **Pasos de Ejecución:**
  1. En `http://localhost:5173/admin/qr-codes`, haz clic en **"Revocar código QR"** en la tarjeta creada anteriormente.
  2. Confirma la alerta del navegador.
  3. Intenta entrar nuevamente al enlace copiado (`http://localhost:5173/q/<token>`).
- **Resultado Esperado:** El sistema no redirige a la carta, sino que despliega la pantalla informativa: *"Código QR Revocado — Este código QR ha sido deshabilitado o actualizado por el restaurante y ya no está en servicio"*.

---

### CP-02-07: Adaptación Modular de la Vitrina Pública (Nivel 0 vs Nivel 1)
- **Objetivo:** Comprobar que en el perfil `MENU_ONLY` no existen botones de compra ni carrito, y al activar `ordering` se habilitan fluidamente.
- **Ruta en Navegador:** `http://localhost:5173/r/karta-bistro`.
- **Pasos de Ejecución:**
  1. Con el perfil de la sucursal en `MENU_ONLY` (`ordering: false`), abre la vitrina pública.
  2. Comprueba que se visualizan: colores de marca, horarios, buscador de platos, tarjetas y pie de página con el aviso legal DIAN.
  3. Haz clic en cualquier plato: en el modal informativo **no aparece el botón de "Agregar al pedido"**, mostrando en su lugar *"Carta Digital Informativa"*.
  4. En el panel administrativo (`/admin/capabilities`), cambia el perfil a `WHATSAPP_SIMPLE`.
  5. Vuelve a la vitrina pública y abre el plato: ahora aparece el selector de cantidad y el botón **"Agregar al pedido — $ XX.XXX COP"**.
  6. Agrega 2 platos y observa la barra inferior flotante con el subtotal y el botón para despachar el pedido estructurado por WhatsApp.
- **Resultado Esperado:** Cumplimiento total de la Escalera de Adopción Progresiva sin alterar la experiencia visual del comensal.

---

## 3. Comandos de Verificación Automatizada

Para ejecutar todas las pruebas automáticas en terminal:

```bash
# 1. Pruebas unitarias de shared (Zod, no doble cobro COP):
pnpm --filter @restaurante-saas/shared test

# 2. Pruebas de integración backend (importador, RLS, QR, OpenGraph):
pnpm --filter @restaurante-saas/api test

# 3. Pruebas frontend y adaptación de vitrina (Zustand, TC-02-E01):
pnpm --filter @restaurante-saas/web test

# 4. Verificación global de tipos y compilación completa:
pnpm turbo run typecheck
pnpm turbo run build
```
