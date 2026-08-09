import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  inAppNotificationSchema,
  markedNotificationsSchema,
  notificationListQuerySchema,
  notificationPageSchema,
  unreadNotificationCountSchema,
} from '@edupay/contracts';
import type { NotificationListQuery } from '@edupay/contracts';

import { TenantCapability } from '../authorization/authorization.types';
import { RequireCapabilities } from '../authorization/require-capabilities.decorator';
import { ContractResponse } from '../http/zod-response.interceptor';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import type { AcademicRequestContext } from '../academic/academic-context';
import { CurrentRequestContext } from '../tenant/current-request-context.service';
import { NotificationService } from './notification.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Notifications')
@Controller('notifications')
@RequireCapabilities(TenantCapability.AccessTenant)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly current: CurrentRequestContext,
  ) {}

  @Get()
  @ContractResponse(notificationPageSchema)
  list(
    @Query(new ZodValidationPipe(notificationListQuerySchema)) input: NotificationListQuery,
  ): Promise<object> {
    return this.notifications.listCurrent(
      this.context(),
      input.cursor
        ? { cursor: input.cursor, limit: input.limit }
        : { limit: input.limit },
    );
  }

  @Get('unread-count')
  @ContractResponse(unreadNotificationCountSchema)
  unreadCount(): Promise<object> {
    return this.notifications.unreadCount(this.context());
  }

  @Patch(':notificationId/read')
  @ContractResponse(inAppNotificationSchema)
  markRead(@Param('notificationId', uuid) notificationId: string): Promise<object> {
    return this.notifications.markRead(this.context(), notificationId);
  }

  @Post('read-all')
  @ContractResponse(markedNotificationsSchema)
  readAll(): Promise<object> {
    return this.notifications.markAllRead(this.context());
  }

  private context(): AcademicRequestContext {
    return {
      principal: this.current.principal(),
      requestId: this.current.requestId(),
      tenant: this.current.tenant(),
    };
  }
}
