import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({
    schema: {
      example: {
        service: 'edupay-academico-api',
        status: 'ok',
      },
    },
  })
  getHealth(): { service: string; status: 'ok' } {
    return {
      service: 'edupay-academico-api',
      status: 'ok',
    };
  }
}
