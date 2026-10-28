# Estándar de Versiones y Configuración Técnica del Monorepo
**Documento:** `STACK_VERSIONS.md`  
**Versión:** 2.4.0 — Alineado con `DEFINICION_TECNICA.md` (v2.4.0)  
**Propósito:** Fijar de manera estricta las versiones de motores, librerías, banderas de compilación y variables de entorno para que todo el código generado en las fases `FASE_01` a `FASE_06` sea 100 % compatible y determinista.

---

## 1. Regla de Oro para Generación de Código con IA

1. **Prohibido mezclar versiones mayores:** Todo código generado para `packages/shared`, `apps/api` y `apps/web` debe respetar exactamente las versiones y sintaxis fijadas en este documento.
2. **Prohibido introducir librerías alternativas no listadas:** No reemplazar `Zod` por `Joi`/`Yup`, no reemplazar `Prisma` por `TypeORM`, no reemplazar `TanStack Query` por `SWR`/`Redux Toolkit`, y no usar `EventSource` nativo en rutas autenticadas.
3. **Puerta de Validación Manual Obligatoria tras cada Paso:** El modelo de IA no ejecuta los binarios. Al terminar cada prompt de generación de código, el desarrollador debe ejecutar en su terminal la puerta de control antes de pedir el siguiente paso:
   ```bash
   pnpm install
   pnpm turbo run typecheck
   pnpm turbo run test
   ```
   Si algún comando arroja error, se debe pegar la salida del error al modelo para corregirlo antes de avanzar al siguiente módulo.

---

## 2. Motores del Sistema e Infraestructura Local

| Herramienta / Motor | Versión Fijada | Notas de Compatibilidad |
| :--- | :--- | :--- |
| **Node.js** | `22.11.0 LTS` (`>=22.0.0`) | Incluye `crypto.randomUUID()`, `crypto.timingSafeEqual` y `fetch` nativo estable. |
| **Gestor de Paquetes** | `pnpm@9.12.3` | Configurado en `"packageManager": "pnpm@9.12.3"` en el `package.json` raíz. |
| **Orquestador Monorepo** | `turbo@2.2.3` | Sintaxis de `turbo.json` v2 (usa la clave `"tasks"`, **nunca** la clave deprecada `"pipeline"` de v1). |
| **TypeScript** | `5.6.3` | Compartido en todo el monorepo con modo estricto obligatorio. |
| **PostgreSQL** | `16.4-alpine` (Docker) | Soporte nativo de `Row-Level Security (RLS)`, `JSONB`, `UUID` e índices únicos parciales. |

---

## 3. Matriz Exacta de Dependencias por Paquete

### 3.1 Raíz del Monorepo (`package.json`)

```json
{
  "name": "restaurante-saas",
  "private": true,
  "packageManager": "pnpm@9.12.3",
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  },
  "devDependencies": {
    "turbo": "2.2.3",
    "typescript": "5.6.3",
    "prettier": "3.3.3",
    "eslint": "9.13.0"
  }
}
```

### 3.2 Paquete Compartido (`packages/shared/package.json`)

Contiene los contratos DTO, esquemas `Zod`, el catálogo de los 16 módulos, las máquinas de estado y las calculadoras matemáticas puras (`money-cop`, `tax-calculator`, `consumption-split.calculator`, `whatsapp-templates`).

```json
{
  "name": "@restaurante-saas/shared",
  "version": "2.4.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "zod": "3.23.8"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "vitest": "2.1.4"
  }
}
```

### 3.3 Backend Headless API (`apps/api/package.json`)

Basado en **NestJS 10** y **Prisma 5** sobre Express.

```json
{
  "name": "@restaurante-saas/api",
  "version": "2.4.0",
  "private": true,
  "dependencies": {
    "@nestjs/common": "10.4.7",
    "@nestjs/core": "10.4.7",
    "@nestjs/platform-express": "10.4.7",
    "@nestjs/config": "3.3.0",
    "@nestjs/jwt": "10.2.0",
    "@nestjs/passport": "10.0.3",
    "@nestjs/schedule": "4.1.1",
    "@nestjs/swagger": "7.4.2",
    "@nestjs/throttler": "6.2.1",
    "@prisma/client": "5.21.1",
    "@restaurante-saas/shared": "workspace:*",
    "argon2": "0.41.1",
    "cookie-parser": "1.4.7",
    "helmet": "8.0.0",
    "nestjs-pino": "4.1.0",
    "passport": "0.7.0",
    "passport-jwt": "4.0.1",
    "pino": "9.5.0",
    "pino-http": "10.3.0",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.1",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@nestjs/cli": "10.4.5",
    "@nestjs/testing": "10.4.7",
    "@types/cookie-parser": "1.4.7",
    "@types/express": "5.0.0",
    "@types/node": "22.8.6",
    "@types/passport-jwt": "4.0.1",
    "@types/supertest": "6.0.2",
    "prisma": "5.21.1",
    "supertest": "7.0.0",
    "ts-node": "10.9.2",
    "tsconfig-paths": "4.2.0",
    "typescript": "5.6.3",
    "vitest": "2.1.4",
    "unplugin-swc": "1.5.1",
    "@swc/core": "1.7.39"
  }
}
```

### 3.4 Frontend Web + PWA (`apps/web/package.json`)

Basado en **React 18**, **Vite 5**, **Tailwind CSS 3.4**, **React Router 6**, **TanStack Query 5** y **Zustand 5**.

```json
{
  "name": "@restaurante-saas/web",
  "version": "2.4.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@hookform/resolvers": "3.9.1",
    "@microsoft/fetch-event-source": "2.0.1",
    "@radix-ui/react-dialog": "1.1.2",
    "@radix-ui/react-dropdown-menu": "2.1.2",
    "@radix-ui/react-select": "2.1.2",
    "@radix-ui/react-slot": "1.1.0",
    "@radix-ui/react-switch": "1.1.1",
    "@radix-ui/react-tabs": "1.1.1",
    "@radix-ui/react-toast": "1.2.2",
    "@restaurante-saas/shared": "workspace:*",
    "@tanstack/react-query": "5.59.16",
    "class-variance-authority": "0.7.0",
    "clsx": "2.1.1",
    "lucide-react": "0.454.0",
    "qrcode.react": "4.1.0",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-hook-form": "7.53.1",
    "react-router-dom": "6.27.0",
    "tailwind-merge": "2.5.4",
    "zod": "3.23.8",
    "zustand": "5.0.1"
  },
  "devDependencies": {
    "@playwright/test": "1.48.2",
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "@vitejs/plugin-react": "4.3.3",
    "autoprefixer": "10.4.20",
    "postcss": "8.4.47",
    "tailwindcss": "3.4.14",
    "typescript": "5.6.3",
    "vite": "5.4.10",
    "vite-plugin-pwa": "0.21.0",
    "vitest": "2.1.4"
  }
}
```

---

## 4. Convenciones Técnicas Críticas por Librería (Obligatorias)

1. **Turborepo v2 (`turbo.json`):**
   - Usar obligatoriamente el objeto raíz `"tasks": { ... }` en lugar de `"pipeline": { ... }`.
2. **Prisma + PostgreSQL Row-Level Security (`PrismaService.withTenant`):**
   - Nunca ejecutar `SET LOCAL` fuera de una transacción interactiva ni concatenando cadenas.
   - Patrón obligatorio en `apps/api/src/database/prisma.service.ts`:
     ```typescript
     async withTenant<T>(
       tenantId: string,
       fn: (tx: Prisma.TransactionClient) => Promise<T>,
     ): Promise<T> {
       return this.$transaction(async (tx) => {
         await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
         return fn(tx);
       });
     }
     ```
3. **Server-Sent Events Autenticados (`@microsoft/fetch-event-source`):**
   - En `apps/web/src/hooks/use-sse-stream.ts`, para los canales privados del restaurante (`/api/v1/branches/:branchId/orders/events`), usar `fetchEventSource` pasando `headers: { Authorization: 'Bearer ' + accessToken }` y manejando reconexión exponencial.
4. **Cifrado y HMAC Antifraude (`crypto` nativo de Node 22):**
   - Para `Customer.blocked_phone_hmac`, usar `crypto.createHmac('sha256', process.env.FRAUD_PEPPER_SECRET).update(`${tenantId}:${phoneE164}`).digest('hex')`.
   - Para anonimización irreversible (Ley 1581), reemplazar `phone_e164` por `` `ANON_${crypto.randomUUID()}` ``.
5. **Tailwind CSS v3.4 (`tailwind.config.js`):**
   - Usar configuración estándar de Tailwind v3 (`@tailwind base; @tailwind components; @tailwind utilities;`) con variables CSS `--brand-primary` y `--brand-secondary` para tematización dinámica por restaurante.

---

## 5. Contrato de Variables de Entorno (`.env.example`)

### 5.1 Backend (`apps/api/.env.example`)

```ini
# Entorno y Servidor
NODE_ENV=development
PORT=4000
PUBLIC_WEB_URL=http://localhost:5173
API_BASE_URL=http://localhost:4000

# Base de Datos PostgreSQL 16
# Nota: La cuenta de aplicación (app_user) NO debe tener atributo BYPASSRLS ni SUPERUSER
# para que las políticas Row-Level Security (RLS) se apliquen estrictamente.
DATABASE_URL="postgresql://restaurante_app:restaurante_pass@localhost:5432/restaurante_saas?schema=public"
DATABASE_MIGRATION_URL="postgresql://restaurante_owner:restaurante_owner_pass@localhost:5432/restaurante_saas?schema=public"

# Seguridad JWT y Cookies
JWT_ACCESS_SECRET="cambiar_por_secreto_aleatorio_de_64_bytes_hex_acceso"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="cambiar_por_secreto_aleatorio_de_64_bytes_hex_refresco"
JWT_REFRESH_EXPIRES_IN="7d"
COOKIE_SECRET="cambiar_por_secreto_aleatorio_para_cookies_httponly"

# Secreto del Servidor para HMAC Antifraude (Sección 8 y 9.1.3 - Ley 1581)
FRAUD_PEPPER_SECRET="cambiar_por_secreto_256_bits_exclusivo_servidor_hmac_antifraude"

# Transporte de Correo Transaccional del Núcleo (Solo para forgot-password de TENANT_ADMIN)
SYSTEM_SMTP_HOST="localhost"
SYSTEM_SMTP_PORT=1025
SYSTEM_SMTP_FROM="no-reply@restaurantesaas.co"
```

### 5.2 Frontend (`apps/web/.env.example`)

```ini
VITE_API_BASE_URL=http://localhost:4000/api/v1
VITE_APP_NAME="Restaurante SaaS"
```

---

## 6. Configuración Base de TypeScript (`tsconfig.base.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "declaration": true,
    "sourceMap": true
  }
}
```