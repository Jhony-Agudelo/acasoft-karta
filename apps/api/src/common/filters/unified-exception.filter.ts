import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ModuleValidationError } from '@restaurante-saas/shared';

@Catch()
export class UnifiedExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(UnifiedExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'Ha ocurrido un error interno en el servidor.';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        errorCode = resObj.errorCode || resObj.error || `HTTP_${statusCode}`;
        message = resObj.message || exception.message;
        details = resObj.details || (resObj.moduleKey ? { moduleKey: resObj.moduleKey } : undefined);
      }
    } else if (exception instanceof ZodError) {
      statusCode = HttpStatus.BAD_REQUEST;
      errorCode = 'VALIDATION_ERROR';
      message = 'Error de validación en los datos suministrados.';
      details = exception.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
    } else if (exception instanceof ModuleValidationError) {
      statusCode = exception.errorCode === 'PLAN_UPGRADE_REQUIRED' ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
      errorCode = exception.errorCode;
      message = exception.message;
      details = {
        moduleKey: exception.moduleKey,
        missingDependency: exception.missingDependency,
        requiredAnyOf: exception.requiredAnyOf,
      };
    } else if (exception instanceof Error) {
      // Manejo de errores conocidos de base de datos / Prisma
      const errName = exception.constructor.name;
      if (errName === 'PrismaClientKnownRequestError') {
        const prismaErr = exception as any;
        if (prismaErr.code === 'P2002') {
          statusCode = HttpStatus.CONFLICT;
          errorCode = 'RESOURCE_ALREADY_EXISTS';
          message = 'Ya existe un registro con los mismos identificadores únicos.';
          details = { target: prismaErr.meta?.target };
        } else if (prismaErr.code === 'P2025') {
          statusCode = HttpStatus.NOT_FOUND;
          errorCode = 'RESOURCE_NOT_FOUND';
          message = 'El recurso solicitado no fue encontrado.';
        }
      } else {
        message = process.env.NODE_ENV === 'production' ? 'Error interno del servidor.' : exception.message;
      }

      this.logger.error(`[${request.method}] ${request.url} - ${exception.message}`, exception.stack);
    }

    const payload = {
      statusCode,
      errorCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(details ? { details } : {}),
    };

    response.status(statusCode).json(payload);
  }
}
