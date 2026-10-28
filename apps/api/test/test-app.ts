try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile('.env');
  }
} catch {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile('../../.env');
    }
  } catch {}
}

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { TestDummyController } from './test-dummy.controller';
import { PrismaService } from '../src/database/prisma.service';

export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [TestDummyController],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser('test_cookie_secret'));
  app.setGlobalPrefix('api/v1', {
    exclude: ['r/(.*)'],
  });

  await app.init();
  const prisma = app.get(PrismaService);

  return { app, prisma };
}
