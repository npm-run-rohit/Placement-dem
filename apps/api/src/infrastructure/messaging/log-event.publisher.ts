import { Injectable, Logger } from '@nestjs/common';
import type { DomainEventEnvelope, EventPublisher } from './messaging.ports';

/** Dev publisher: logs domain events instead of sending them to the BimaSahayak bus. */
@Injectable()
export class LogEventPublisher implements EventPublisher {
  private readonly logger = new Logger('DomainEvents');
  async publish(events: DomainEventEnvelope[]) {
    for (const e of events) this.logger.log(`${e.type} ${JSON.stringify(e.data)}`);
  }
}
