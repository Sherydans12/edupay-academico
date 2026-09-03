import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  academicFinancialProjectionSnapshotCompleteSchema,
  academicFinancialProjectionSnapshotPageSchema,
  academicFinancialProjectionSnapshotQuerySchema,
  academicFinancialProjectionSnapshotStartSchema,
  type AcademicFinancialProjectionSnapshotQuery,
} from '@edupay/contracts';

import { Public } from '../authentication/public.decorator';
import { ContractResponse } from '../http/zod-response.interceptor';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { FinancialProjectionProducerService } from './financial-projection-producer.service';
import {
  FinancialProjectionServiceAuthGuard,
  type FinancialProjectionRequest,
} from './financial-projection-service-auth.guard';

/**
 * The dedicated S2S guard sets the only tenant selector. User JWTs never
 * reach these handlers as an authorized principal.
 */
@Public()
@ApiTags('Academic Financial Projection')
@Controller('integrations/financial-projection')
@UseGuards(FinancialProjectionServiceAuthGuard)
export class FinancialProjectionContractController {
  constructor(private readonly producer: FinancialProjectionProducerService) {}

  @Post('snapshots')
  @ApiOperation({
    summary: 'Start a consistent Academic Financial Projection snapshot',
    description: 'Starts a tenant-bound materialized snapshot for BL Shadow.',
  })
  @ApiResponse({
    status: 401,
    description:
      'A user token or an unregistered service credential was rejected.',
  })
  @ApiResponse({
    status: 503,
    description: 'Producer intentionally disabled by configuration.',
  })
  @ContractResponse(academicFinancialProjectionSnapshotStartSchema)
  startSnapshot(@Req() request: FinancialProjectionRequest) {
    return this.producer.startSnapshot(this.canonicalTenantId(request));
  }

  @Get('snapshots/:snapshotToken/enrollments')
  @ApiOperation({
    summary: 'Read one bounded page from a consistent projection snapshot',
    description:
      'The service principal determines the tenant; no tenant selector is accepted from a client.',
  })
  @ApiParam({
    name: 'snapshotToken',
    description: 'Opaque tenant-bound snapshot token',
  })
  @ApiResponse({
    status: 403,
    description: 'Disabled for end-user principals.',
  })
  @ApiResponse({
    status: 503,
    description: 'Producer not enabled in Phase 1B.',
  })
  @ContractResponse(academicFinancialProjectionSnapshotPageSchema)
  listEnrollments(
    @Req() request: FinancialProjectionRequest,
    @Param('snapshotToken') snapshotToken: string,
    @Query(
      new ZodValidationPipe(academicFinancialProjectionSnapshotQuerySchema),
    )
    query: AcademicFinancialProjectionSnapshotQuery,
  ) {
    return this.producer.listSnapshotEnrollments(
      this.canonicalTenantId(request),
      snapshotToken,
      query,
    );
  }

  @Get('snapshots/:snapshotToken/complete')
  @ApiOperation({
    summary:
      'Confirm terminal watermark for an Academic Financial Projection snapshot',
    description:
      'A consumer may trust completion only after it has drained every page for its authorized snapshot.',
  })
  @ApiParam({
    name: 'snapshotToken',
    description: 'Opaque tenant-bound snapshot token',
  })
  @ApiResponse({
    status: 403,
    description: 'Disabled for end-user principals.',
  })
  @ApiResponse({
    status: 503,
    description: 'Producer not enabled in Phase 1B.',
  })
  @ContractResponse(academicFinancialProjectionSnapshotCompleteSchema)
  completeSnapshot(
    @Req() request: FinancialProjectionRequest,
    @Param('snapshotToken') snapshotToken: string,
  ) {
    return this.producer.completeSnapshot(
      this.canonicalTenantId(request),
      snapshotToken,
    );
  }

  private canonicalTenantId(request: FinancialProjectionRequest): string {
    const principal = request.financialProjectionPrincipal;
    if (!principal)
      throw new Error('Financial projection service principal missing.');
    return principal.canonicalTenantId;
  }
}
