import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUserPayload {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly tenantId: string;
  readonly roleKey: string;
  readonly branchScope: string[];
  readonly mustChangePassword: boolean;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUserPayload;
    return data ? user?.[data] : user;
  },
);
