import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';

export interface SahayakNotification {
  recipientEmail: string;
  channels: Array<'email' | 'slack' | 'google_chat' | 'whatsapp'>;
  templateKey: string; // e.g. placement.INT-T02
  title: string;
  body: string;
  deepLink?: string; // https://sahayak.../placement/tickets/PLC-1042
}

/**
 * Shared notification service of the BimaSahayak suite (W9). Owns channel credentials (SES/SendGrid,
 * Slack, WhatsApp BSP), user channel preferences and opt-ins. Disabled -> log only.
 */
@Injectable()
export class SahayakNotificationsClient {
  private readonly logger = new Logger(SahayakNotificationsClient.name);
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async send(n: SahayakNotification): Promise<void> {
    if (!this.config.get('sahayak', { infer: true }).notificationsEnabled) {
      this.logger.log(`[notify:disabled] ${n.templateKey} -> ${n.recipientEmail}: ${n.title}`);
      return;
    }
    // TODO(W9): POST {apiUrl}/notifications with service token; retry via queue on 5xx
  }
}
