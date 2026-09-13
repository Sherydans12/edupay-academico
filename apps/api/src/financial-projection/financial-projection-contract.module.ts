import { Module } from '@nestjs/common';

import { SecurityFoundationModule } from '../security/security-foundation.module';
import { FinancialProjectionContractController } from './financial-projection-contract.controller';
import { FinancialProjectionConfigService } from './financial-projection-config.service';
import { FinancialProjectionOutboxService } from './financial-projection-outbox.service';
import { FinancialProjectionProducerService } from './financial-projection-producer.service';
import { FinancialProjectionPublisherService } from './financial-projection-publisher.service';
import { FinancialProjectionServiceAuthGuard } from './financial-projection-service-auth.guard';

@Module({
  imports: [SecurityFoundationModule],
  controllers: [FinancialProjectionContractController],
  providers: [
    FinancialProjectionConfigService,
    FinancialProjectionOutboxService,
    FinancialProjectionProducerService,
    FinancialProjectionPublisherService,
    FinancialProjectionServiceAuthGuard,
  ],
  exports: [
    FinancialProjectionConfigService,
    FinancialProjectionOutboxService,
    FinancialProjectionPublisherService,
  ],
})
export class FinancialProjectionContractModule {}
