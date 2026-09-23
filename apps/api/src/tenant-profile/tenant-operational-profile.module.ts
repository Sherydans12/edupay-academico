import { Module } from '@nestjs/common';

import { SecurityFoundationModule } from '../security/security-foundation.module';
import { TenantOperationalProfileController } from './tenant-operational-profile.controller';
import { TenantOperationalProfileService } from './tenant-operational-profile.service';

@Module({
  imports: [SecurityFoundationModule],
  controllers: [TenantOperationalProfileController],
  providers: [TenantOperationalProfileService],
  exports: [TenantOperationalProfileService],
})
export class TenantOperationalProfileModule {}
