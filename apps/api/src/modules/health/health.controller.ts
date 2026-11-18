import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Public } from '../../common/auth/roles.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    // TODO(W13): redis, mailbox connectors, Copycat, BimaSetu reachability (FR-188/190)
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
