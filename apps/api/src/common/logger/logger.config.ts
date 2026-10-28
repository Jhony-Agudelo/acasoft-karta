import { Params } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

export const pinoLoggerOptions: Params = {
  pinoHttp: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["set-cookie"]',
        'password',
        'new_password',
        'current_password',
        'temp_password',
        'token',
        'invite_or_reset_token_hash',
        'secret',
        'jwt',
      ],
      censor: '[REDACTED]',
    },
    customProps: (req) => {
      const anyReq = req as any;
      return {
        tenantId: anyReq.tenantContext?.tenantId || null,
        branchId: anyReq.params?.branchId || anyReq.body?.branch_id || null,
        actorId: anyReq.user?.id || null,
      };
    },
  },
};
