import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RequestContext } from '../../common/context/request-context';
import { OutboxDestination, OutboxEvent } from './outbox-event.entity';

export interface OutboxMessage {
  destination: OutboxDestination;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** business time of the change (engine clock); defaults to the DB clock */
  createdAt?: Date;
}

@Injectable()
export class OutboxService {
  /** Must be called with the transaction's EntityManager. */
  async add(manager: EntityManager, messages: OutboxMessage | OutboxMessage[]): Promise<void> {
    const list = Array.isArray(messages) ? messages : [messages];
    if (!list.length) return;
    const correlationId = RequestContext.get()?.correlationId ?? null;
    await manager.getRepository(OutboxEvent).insert(list.map((m) => ({ ...m, correlationId })));
  }
}
