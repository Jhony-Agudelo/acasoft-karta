import { Controller, Get } from '@nestjs/common';
import { RequireModule } from '../src/common/decorators/require-module.decorator';

@Controller('test')
export class TestDummyController {
  @Get('dining-feature')
  @RequireModule('dining')
  diningFeature() {
    return { ok: true, feature: 'dining' };
  }
}
