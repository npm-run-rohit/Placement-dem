import { Injectable } from '@nestjs/common';

/** Injectable clock so SLA/sweeper logic is testable (and a dev "time travel" sim can override it). */
@Injectable()
export class Clock {
  private offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  /** DEV ONLY (FEATURE_DEV_SIMULATORS): advance engine time, replacing the prototype's PlEngineChip. */
  advance(ms: number) {
    this.offsetMs += ms;
  }
}
