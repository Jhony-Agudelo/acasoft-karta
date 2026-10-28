import { SetMetadata } from '@nestjs/common';

export const REQUIRE_MODULE_KEY = 'required_module';
export const RequireModule = (moduleKey: string) => SetMetadata(REQUIRE_MODULE_KEY, moduleKey);
