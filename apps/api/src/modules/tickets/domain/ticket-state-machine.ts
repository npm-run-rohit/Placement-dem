import { canTransition, Stage, TERMINAL_STAGES, TicketCommand } from '@bimaplacement/contracts';
import { DomainError } from '../../../common/errors/domain-error';

/**
 * Guards stage changes against the transition table (FR-137/138, BR-090).
 * Invalid transitions throw TRANSITION_NOT_ALLOWED (the API also audits the attempt).
 */
export class TicketStateMachine {
  static assertMutable(stage: Stage) {
    if (TERMINAL_STAGES.includes(stage)) {
      throw new DomainError(
        'TERMINAL_TICKET',
        'Ticket is closed and read-only (FR-135). Create a new ticket instead.',
      );
    }
  }

  static assertTransition(from: Stage, to: Stage, command: TicketCommand) {
    if (!canTransition(from, to)) {
      throw new DomainError(
        'TRANSITION_NOT_ALLOWED',
        `Cannot move ticket from ${from} to ${to} via ${command}`,
        { from, to, command },
      );
    }
  }
}
