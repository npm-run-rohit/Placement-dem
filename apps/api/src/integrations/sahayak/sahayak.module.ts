import { Global, Module } from '@nestjs/common';
import { SahayakAuthGuard } from './sahayak-auth.guard';
import { SahayakUsersClient } from './sahayak-users.client';
import { SahayakNotificationsClient } from './sahayak-notifications.client';

/** BimaSahayak umbrella-platform adapters: identity, directory, notifications (events go via MessagingModule). */
@Global()
@Module({
  providers: [SahayakAuthGuard, SahayakUsersClient, SahayakNotificationsClient],
  exports: [SahayakAuthGuard, SahayakUsersClient, SahayakNotificationsClient],
})
export class SahayakModule {}
