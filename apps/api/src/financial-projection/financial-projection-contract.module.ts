import { Module } from '@nestjs/common';

import { SecurityFoundationModule } from '../security/security-foundation.module';
import { FinancialProjectionContractController } from './financial-projection-contract.controller';

@Module({
  imports: [SecurityFoundationModule],
  controllers: [FinancialProjectionContractController],
})
export class FinancialProjectionContractModule {}
