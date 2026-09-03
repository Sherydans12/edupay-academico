import {
  Controller,
  Get,
  NotImplementedException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  academicFinancialProjectionSnapshotCompleteSchema,
  academicFinancialProjectionSnapshotPageSchema,
  academicFinancialProjectionSnapshotQuerySchema,
  academicFinancialProjectionSnapshotStartSchema,
  type AcademicFinancialProjectionSnapshotQuery,
} from '@edupay/contracts';

import { RequireCapabilities } from '../authorization/require-capabilities.decorator';
import { ContractResponse } from '../http/zod-response.interceptor';
import { ZodValidationPipe } from '../http/zod-validation.pipe';

/**
 * OpenAPI declaration for the outbound Academic Financial Projection contract.
 * The empty capability requirement fails closed until Phase 1C supplies the
 * reviewed service-to-service authorization and durable producer.
 */
@ApiTags('Academic Financial Projection (planned)')
@Controller('integrations/financial-projection')
@RequireCapabilities()
export class FinancialProjectionContractController {
  @Post('snapshots')
  @ApiOperation({
    summary: 'Start a consistent Academic Financial Projection snapshot',
    description:
      'Contract declaration only. Disabled until Phase 1C provides service-to-service authorization and a durable producer.',
  })
  @ApiResponse({
    status: 403,
    description: 'Disabled for end-user principals.',
  })
  @ApiResponse({
    status: 503,
    description: 'Producer not enabled in Phase 1B.',
  })
  @ContractResponse(academicFinancialProjectionSnapshotStartSchema)
  startSnapshot(): never {
    throw this.notEnabled();
  }

  @Get('snapshots/:snapshotToken/enrollments')
  @ApiOperation({
    summary: 'Read one bounded page from a consistent projection snapshot',
    description:
      'Contract declaration only. The future service principal determines the authorized canonical tenant; no tenant selector is accepted from a client.',
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
    @Param('snapshotToken') _snapshotToken: string,
    @Query(
      new ZodValidationPipe(academicFinancialProjectionSnapshotQuerySchema),
    )
    _query: AcademicFinancialProjectionSnapshotQuery,
  ): never {
    void _snapshotToken;
    void _query;
    throw this.notEnabled();
  }

  @Get('snapshots/:snapshotToken/complete')
  @ApiOperation({
    summary:
      'Confirm terminal watermark for an Academic Financial Projection snapshot',
    description:
      'Contract declaration only. A consumer may trust completion only after it has drained every page for its authorized snapshot.',
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
  completeSnapshot(@Param('snapshotToken') _snapshotToken: string): never {
    void _snapshotToken;
    throw this.notEnabled();
  }

  private notEnabled(): NotImplementedException {
    return new NotImplementedException(
      'Academic Financial Projection is a Phase 1B contract declaration; its producer is not enabled.',
    );
  }
}
