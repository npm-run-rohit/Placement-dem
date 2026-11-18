import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { BimaSetuInboundType, type BimaSetuEnvelope } from '@bimaplacement/contracts';
import type { AppConfig } from '../../config/configuration';
import { Public } from '../../common/auth/roles.decorator';
import { RateLimiter } from '../../common/rate-limit/rate-limiter';
import { JOB_QUEUE, type JobQueue } from '../../infrastructure/messaging/messaging.ports';
import { QUEUES } from '../../infrastructure/messaging/queues';
import { BimaSetuMessage } from './bimasetu-message.entity';
import { verifyBimaSetuSignature } from './hmac';

/**
 * Inbound BimaSetu webhook (PRD 4A). Verify signature -> insert into inbox (unique messageId =
 * dedupe) -> 202 -> async processing on BIMASETU_INBOUND. A float rejected for missing RFQ /
 * required fields is answered with float_rejected (FR-282) by the processor.
 * Hardening (PLAN 4.5): rate limited per source IP; the signature is checked whenever a secret is configured
 * (always in live mode); envelopes without an id, a known inbound type or a line reference are refused.
 */
@ApiExcludeController()
@Controller('integrations/bimasetu')
export class BimaSetuWebhookController {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @InjectRepository(BimaSetuMessage) private readonly inbox: Repository<BimaSetuMessage>,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly limiter: RateLimiter,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(202)
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-bimasetu-signature') sig: string,
    @Body() body: BimaSetuEnvelope,
  ) {
    const cfg = this.config.get('bimasetu', { infer: true });
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(body);
    if (
      (cfg.mode === 'live' || cfg.webhookSecret) &&
      !verifyBimaSetuSignature(raw, sig, cfg.webhookSecret, cfg.webhookToleranceSeconds)
    ) {
      // Only unsigned / badly signed calls count against the per-IP limit, so a flood of them can never
      // throttle BimaSetu's genuine webhooks (behind the load balancer req.ip needs TRUST_PROXY).
      const perMinute = this.config.get('rateLimits', { infer: true }).webhookPerMinute;
      if (!(await this.limiter.allow(`bimasetu-webhook-bad:${req.ip}`, perMinute, 60)))
        throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
      throw new UnauthorizedException('Invalid BimaSetu signature');
    }
    const problem = envelopeProblem(body);
    if (problem) throw new BadRequestException(problem);
    const inserted = await this.inbox
      .createQueryBuilder()
      .insert()
      .values({
        direction: 'in',
        messageId: body.messageId,
        type: body.type,
        lineRef: body.lineRef,
        payload: body as never,
      })
      .orIgnore()
      .returning(['id'])
      .execute();
    const id = inserted.identifiers[0]?.id as string | undefined;
    if (id)
      await this.queue.enqueue(
        QUEUES.BIMASETU_INBOUND,
        body.type,
        { inboxId: id },
        { jobId: `bs-in-${body.messageId}` },
      );
    return { accepted: true, duplicate: !id };
  }
}

/** Minimum shape before a message is stored; the processor validates each payload type (e.g. float, FR-282). */
export function envelopeProblem(b: Partial<BimaSetuEnvelope> | undefined): string | null {
  if (!b || typeof b !== 'object') return 'Body must be a BimaSetu envelope';
  if (typeof b.messageId !== 'string' || !b.messageId.trim() || b.messageId.length > 200)
    return 'messageId is required (max 200 characters)';
  if (!Object.values(BimaSetuInboundType).includes(b.type as BimaSetuInboundType))
    return `Unknown inbound type "${String(b.type)}"`;
  if (typeof b.lineRef !== 'string' || !b.lineRef.trim()) return 'lineRef is required';
  return null;
}
