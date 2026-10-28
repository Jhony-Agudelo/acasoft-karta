import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Logger estructurado Pino
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Seguridad HTTP con Helmet
  app.use(helmet());

  // Manejo de Cookies seguras HttpOnly
  const cookieSecret = process.env.COOKIE_SECRET || 'cookie_secret_development_default';
  app.use(cookieParser(cookieSecret));

  // CORS para frontend Web y PWA
  const publicWebUrl = process.env.PUBLIC_WEB_URL || 'http://localhost:5173';
  app.enableCors({
    origin: [publicWebUrl, 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-request-id', 'idempotency-key'],
  });

  // Prefijo global de API /api/v1
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`🚀 Restaurante SaaS API corriendo en: http://localhost:${port}/api/v1`);
}

bootstrap();
