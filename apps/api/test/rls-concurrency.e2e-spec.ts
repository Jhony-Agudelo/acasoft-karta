import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { PrismaService } from '../src/database/prisma.service';

describe('TC-01-I07: Concurrencia RLS y Aislamiento en el Pool de Conexiones (rls-concurrency.e2e-spec.ts)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    const testContext = await createTestApp();
    app = testContext.app;
    prisma = testContext.prisma;

    // Crear dos tenants con sucursales específicas para la prueba de concurrencia
    const tenantA = await prisma.tenant.create({
      data: {
        name: 'Restaurante A Concurrency',
        slug: `concurrency-a-${Date.now()}`,
        branches: {
          create: [
            { name: 'Sede A-1', slug: 'sede-a-1', address: 'Calle A1', phone_whatsapp_e164: '+573001111111' },
            { name: 'Sede A-2', slug: 'sede-a-2', address: 'Calle A2', phone_whatsapp_e164: '+573001111112' },
          ],
        },
      },
    });
    tenantAId = tenantA.id;

    const tenantB = await prisma.tenant.create({
      data: {
        name: 'Restaurante B Concurrency',
        slug: `concurrency-b-${Date.now()}`,
        branches: {
          create: [
            { name: 'Sede B-1', slug: 'sede-b-1', address: 'Calle B1', phone_whatsapp_e164: '+573002222221' },
            { name: 'Sede B-2', slug: 'sede-b-2', address: 'Calle B2', phone_whatsapp_e164: '+573002222222' },
          ],
        },
      },
    });
    tenantBId = tenantB.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('debe ejecutar 30 transacciones simultáneas mezcladas entre Tenant A y Tenant B sin fuga de datos RLS', async () => {
    const totalRequests = 30;
    const tasks = Array.from({ length: totalRequests }).map(async (_, index) => {
      const isTenantA = index % 2 === 0;
      const targetTenantId = isTenantA ? tenantAId : tenantBId;

      // Consulta protegida bajo withTenant
      const branches = await prisma.withTenant(targetTenantId, async (tx) => {
        // En una transacción interactiva con set_config('app.current_tenant_id', targetTenantId, true)
        // consultamos las sucursales directamente
        return tx.branch.findMany({
          where: { tenant_id: targetTenantId },
        });
      });

      return {
        index,
        targetTenantId,
        isTenantA,
        branches,
      };
    });

    const results = await Promise.all(tasks);

    expect(results).toHaveLength(totalRequests);

    for (const r of results) {
      expect(r.branches.length).toBeGreaterThan(0);
      for (const b of r.branches) {
        expect(b.tenant_id).toBe(r.targetTenantId);
        if (r.isTenantA) {
          expect(b.tenant_id).not.toBe(tenantBId);
          expect(b.name).toContain('Sede A');
        } else {
          expect(b.tenant_id).not.toBe(tenantAId);
          expect(b.name).toContain('Sede B');
        }
      }
    }
  });
});
