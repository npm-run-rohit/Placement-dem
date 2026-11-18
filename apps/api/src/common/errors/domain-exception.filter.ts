import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiError } from '@bimaplacement/contracts';
import { DomainError, DomainErrorCode } from './domain-error';
import { RequestContext } from '../context/request-context';

const STATUS: Record<DomainErrorCode, number> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  GUARD_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  TRANSITION_NOT_ALLOWED: HttpStatus.CONFLICT,
  TERMINAL_TICKET: HttpStatus.CONFLICT,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  CONFLICT: HttpStatus.CONFLICT,
  INTEGRATION_FAILED: HttpStatus.BAD_GATEWAY,
  MALWARE_DETECTED: HttpStatus.UNPROCESSABLE_ENTITY,
  NOT_IMPLEMENTED: HttpStatus.NOT_IMPLEMENTED,
};

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const correlationId = RequestContext.get()?.correlationId;
    let body: ApiError;

    if (exception instanceof DomainError) {
      body = {
        statusCode: STATUS[exception.code],
        code: exception.code,
        message: exception.message,
        details: exception.details,
        correlationId,
      };
    } else if (exception instanceof HttpException) {
      const r = exception.getResponse();
      body = {
        statusCode: exception.getStatus(),
        code: exception.getStatus() === 400 ? 'VALIDATION_FAILED' : 'HTTP_ERROR',
        message: typeof r === 'string' ? r : ((r as { message?: string }).message ?? exception.message),
        details: typeof r === 'object' ? r : undefined,
        correlationId,
      };
    } else {
      this.logger.error(exception);
      body = { statusCode: 500, code: 'INTERNAL', message: 'Unexpected error', correlationId };
    }
    res.status(body.statusCode).json(body);
  }
}
