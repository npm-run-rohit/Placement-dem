import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BimaSetuOutboundType,
  Channel,
  PRODUCT_TYPES_SEED,
  Role,
  type FloatPayload,
  type ProductTypeCode,
} from '@bimaplacement/contracts';
import { DomainError } from '../../common/errors/domain-error';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { Actors } from '../../modules/audit/actor';
import { PlacementTicket } from '../../modules/tickets/entities/placement-ticket.entity';
import { TicketsService } from '../../modules/tickets/tickets.service';
import { User } from '../../modules/users/user.entity';
import { UsersService } from '../../modules/users/users.service';
import { floatRejection } from './float-validation';

/**
 * BimaSetu float -> Placement ticket (PRD 4A, FR-281/282). Exactly once per line reference. Until the
 * assignment rule is decided in BimaSetu, every float goes to the Placement Head (PRD 4A.4).
 */
@Injectable()
export class BimaSetuFloatService {
  constructor(
    private readonly ds: DataSource,
    private readonly tickets: TicketsService,
    private readonly users: UsersService,
    private readonly outbox: OutboxService,
  ) {}

  /** Returns the ticket, or throws DomainError (422) with the rejection reason after queuing float_rejected. */
  async receive(
    p: FloatPayload,
    messageRowId: string,
  ): Promise<{ ticketId: string; ticketNo: string; duplicate: boolean }> {
    const existing = p.lineRef
      ? await this.ds.getRepository(PlacementTicket).findOneBy({ bimasetuLineRef: p.lineRef })
      : null;
    if (existing) return { ticketId: existing.id, ticketNo: existing.ticketNo, duplicate: true };

    let reason = floatRejection(
      p,
      PRODUCT_TYPES_SEED.map((x) => x.code),
    );
    const rm = reason
      ? null
      : await this.ds
          .getRepository(User)
          .createQueryBuilder('u')
          .where('lower(u.email) = lower(:e)', { e: p.rm.email })
          .andWhere(':rm = ANY(u.roles)', { rm: Role.RM })
          .getOne();
    if (!reason && !rm) reason = `RM ${p.rm.email} is not in the BimaSahayak directory`;
    const [head] = reason ? [] : await this.users.heads();
    if (!reason && !head) reason = 'No active Placement Head to own the ticket';
    if (reason) {
      await this.ds.transaction((m) =>
        this.outbox.add(m, {
          destination: 'bimasetu',
          eventType: BimaSetuOutboundType.FLOAT_REJECTED,
          aggregateType: 'bimasetu_message',
          aggregateId: messageRowId,
          payload: { lineRef: p.lineRef ?? null, reason },
        }),
      );
      throw DomainError.guard(`Float rejected: ${reason}`);
    }

    const ticket = await this.tickets.createTicket(Actors.bimasetu(rm!.name), {
      channel: Channel.BIMASETU,
      createdById: null,
      ownerId: head.id,
      rm: { id: rm!.id, name: rm!.name, email: rm!.email },
      intake: {
        businessName: p.businessName.trim(),
        industryType: p.industryType,
        productType: p.productType as ProductTypeCode,
        businessType: p.businessType,
        renewalDate: p.renewalDate ?? undefined,
        incumbentInsurer: p.incumbentInsurer ?? undefined,
        clientSpoc: p.client?.spoc ?? undefined,
        targetPremium: p.targetPremium ?? undefined,
        noteToPlacement: p.noteToPlacement ?? null,
      },
      excelDocumentId: null, // TODO(W3): fetch rfq.excel.downloadUrl into storage before creating (outside the transaction)
      linkUrl: p.rfq.linkUrl ?? null,
      renderedViewUrl: p.rfq.renderedViewUrl ?? null,
      bimasetu: {
        lineRef: p.lineRef,
        clientRef: p.client?.id ?? null,
        opportunityRef: p.opportunityId ?? null,
        floatPayload: p as unknown as Record<string, unknown>,
      },
    });
    return { ticketId: ticket.id, ticketNo: ticket.ticketNo, duplicate: false };
  }
}
