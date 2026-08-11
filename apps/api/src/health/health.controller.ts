import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { LocalPrivateStorageAdapter } from '../storage/local-private-storage.adapter';

import { Public } from '../authentication/public.decorator';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalPrivateStorageAdapter,
  ) {}

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

  @Get('live')
  getLiveness(): { service: string; status: 'ok' } {
    return this.getHealth();
  }

  @Get('ready')
  @ApiOkResponse({
    schema: {
      example: {
        service: 'edupay-academico-api',
        status: 'ready',
        checks: { database: 'ok', storage: 'ok' },
      },
    },
  })
  async getReadiness(): Promise<{
    service: string;
    status: 'ready';
    checks: { database: 'ok'; storage: 'ok' };
  }> {
    try {
      await Promise.all([
        this.prisma.$queryRaw(Prisma.sql`SELECT 1`),
        this.storage.checkReadiness(),
      ]);
    } catch {
      throw new ServiceUnavailableException('The service is not ready.');
    }

    return {
      service: 'edupay-academico-api',
      status: 'ready',
      checks: { database: 'ok', storage: 'ok' },
    };
  }
}
