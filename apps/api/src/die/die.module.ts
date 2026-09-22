import { Module } from '@nestjs/common';

import { SecurityFoundationModule } from '../security/security-foundation.module';
import { DieAccessService } from './die-access.service';
import { DieController } from './die.controller';
import { DieIdentityMembershipVerifier } from './die-identity-membership.verifier';
import { DieService } from './die.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [SecurityFoundationModule, StorageModule],
  controllers: [DieController],
  providers: [DieAccessService, DieIdentityMembershipVerifier, DieService],
  exports: [DieAccessService, DieService],
})
export class DieModule {}
