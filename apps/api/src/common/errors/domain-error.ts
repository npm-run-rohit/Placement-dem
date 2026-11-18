/**
 * Domain errors are thrown by services/domain code and mapped to HTTP by DomainExceptionFilter.
 * Never throw HttpException from domain code - keeps the domain usable from workers.
 */
export type DomainErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'GUARD_FAILED' // a business precondition failed (e.g. Validate with open queries)
  | 'TRANSITION_NOT_ALLOWED'
  | 'TERMINAL_TICKET'
  | 'FORBIDDEN'
  | 'CONFLICT' // optimistic lock / duplicate
  | 'INTEGRATION_FAILED'
  | 'MALWARE_DETECTED' // an upload or mail attachment failed the malware scan (PLAN 4.5)
  | 'NOT_IMPLEMENTED';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  static notFound(what: string, id: string) {
    return new DomainError('NOT_FOUND', `${what} ${id} not found`);
  }
  static guard(message: string, details?: unknown) {
    return new DomainError('GUARD_FAILED', message, details);
  }
  static notImplemented(what: string) {
    return new DomainError('NOT_IMPLEMENTED', `${what} is not implemented yet`);
  }
}
