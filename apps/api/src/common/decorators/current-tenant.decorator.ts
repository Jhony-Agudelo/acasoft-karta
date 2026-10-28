import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface TenantContext {
  readonly tenantId: string;
  readonly branchId?: string;
}

export const CurrentTenant = createParamDecorator(
  (data: keyof TenantContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const context = request.tenantContext as TenantContext;
    return data ? context?.[data] : context;
  },
);
