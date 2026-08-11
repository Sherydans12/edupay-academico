import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';

import { StorageService } from './storage.service';

@Injectable()
export class StorageCleanupService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger('StorageCleanup');
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly storage: StorageService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sweep();
    this.timer = setInterval(() => void this.sweep(), 15 * 60 * 1000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async sweep(): Promise<void> {
    try {
      const cleaned = await this.storage.cleanupExpiredUploads(100);
      this.logger.log({ action: 'STORAGE_STAGING_CLEANUP', cleaned });
    } catch {
      // Readiness remains the dependency gate; a transient sweep failure must
      // not turn into an unsafe upload success or hide the cause.
      this.logger.warn({ action: 'STORAGE_STAGING_CLEANUP_FAILED' });
    }
  }
}
