import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AppConfig } from '../../config/configuration';
import { Public } from '../../common/auth/roles.decorator';
import { RateLimiter } from '../../common/rate-limit/rate-limiter';
import { SIGNATURE_HEADER, verifyEmailLayerSignature, type DeliveryPayload } from './contract';
import {
  EmailLayerInboundService,
  EmailLayerUnavailableError,
  deliveryProblem,
} from './email-layer-inbound.service';

/**
 * Inbound delivery webhook of the shared email layer. The signature is always required (an empty secret
 * refuses every call); bad signatures count against a per-IP limit like the BimaSetu webhook.
 * 200 processed or duplicate, 400 bad shape, 401 bad signature, 422 refused for good, 429 too many bad
 * signatures, 503 retry later (attachment URL or database).
 */
@ApiExcludeController()
@Controller('integrations/email-layer')
export class EmailLayerWebhookController {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly service: EmailLayerInboundService,
    private readonly limiter: RateLimiter,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers(SIGNATURE_HEADER) sig: string,
    @Body() body: DeliveryPayload,
  ) {
    const cfg = this.config.get('mailbox', { infer: true }).emailLayer;
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(body);
    if (!verifyEmailLayerSignature(raw, sig, cfg.secret, cfg.webhookToleranceSeconds)) {
      const perMinute = this.config.get('rateLimits', { infer: true }).webhookPerMinute;
      if (!(await this.limiter.allow(`email-layer-webhook-bad:${req.ip}`, perMinute, 60)))
        throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
      throw new UnauthorizedException('Invalid email layer signature');
    }
    const problem = deliveryProblem(body);
    if (problem) throw new BadRequestException(problem);

    let outcome: Awaited<ReturnType<EmailLayerInboundService['receive']>>;
    try {
      outcome = await this.service.receive(body);
    } catch (e) {
      if (!(e instanceof EmailLayerUnavailableError)) throw e;
      throw new ServiceUnavailableException('Delivery could not be processed yet; retry');
    }
    if (outcome === 'rejected') throw new UnprocessableEntityException('Delivery refused');
    return { accepted: true, duplicate: outcome === 'duplicate' };
  }
}
