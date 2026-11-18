import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import configuration, { type AppConfig } from './config/configuration';
import { TicketVisibilityInterceptor } from './modules/tickets/ticket-visibility';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { IdempotencyKey } from './common/idempotency/idempotency-key.entity';
import { CorrelationIdMiddleware } from './common/context/correlation-id.middleware';
import { DomainExceptionFilter } from './common/errors/domain-exception.filter';
import { RolesGuard } from './common/auth/roles.guard';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { OutboxModule } from './infrastructure/outbox/outbox.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { MalwareModule } from './infrastructure/malware/malware.module';
import { MailModule } from './infrastructure/mail/mail.module';
import { SahayakModule } from './integrations/sahayak/sahayak.module';
import { SahayakAuthGuard } from './integrations/sahayak/sahayak-auth.guard';
import { BimaSetuModule } from './integrations/bimasetu/bimasetu.module';
import { CopycatModule } from './integrations/copycat/copycat.module';
import { UsersModule } from './modules/users/users.module';
import { AuditModule } from './modules/audit/audit.module';
import { SlaModule } from './modules/sla/sla.module';
import { MastersModule } from './modules/masters/masters.module';
import { InsurersModule } from './modules/insurers/insurers.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { RfqModule } from './modules/rfq/rfq.module';
import { ThreadsModule } from './modules/threads/threads.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { QcrModule } from './modules/qcr/qcr.module';
import { DecisionsModule } from './modules/decisions/decisions.module';
import { MandatesModule } from './modules/mandates/mandates.module';
import { InboundMailModule } from './modules/inbound-mail/inbound-mail.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { HealthModule } from './modules/health/health.module';
import { DevModule } from './modules/dev/dev.module';
import { databaseSsl } from './config/database-url';

/** Feature + infrastructure modules shared by the API and the worker process. */
export const CORE_IMPORTS = [
  ConfigModule.forRoot({ isGlobal: true, load: [configuration], cache: true }),
  LoggerModule.forRoot({
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'), // e2e sets 'silent'
      redact: ['req.headers.authorization', 'req.headers.cookie', '*.email', '*.phone'], // PII masking (W13)
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
    },
  }),
  TypeOrmModule.forRootAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService<AppConfig, true>) => ({
      type: 'postgres' as const,
      url: config.get('database', { infer: true }).url,
      ssl: databaseSsl(config.get('database', { infer: true }).sslCaPath),
      autoLoadEntities: true,
      synchronize: false,
      logging: config.get('database', { infer: true }).logQueries,
    }),
  }),
  OutboxModule,
  StorageModule,
  MalwareModule,
  MailModule,
  SahayakModule,
  UsersModule,
  AuditModule,
  SlaModule,
  MastersModule,
  InsurersModule,
  TicketsModule,
  RfqModule,
  ThreadsModule,
  QcrModule,
  QuotesModule,
  DecisionsModule,
  MandatesModule,
  InboundMailModule,
  CommunicationsModule,
  NotificationsModule,
  DocumentsModule,
  TasksModule,
  ReportingModule,
  BimaSetuModule,
  CopycatModule,
];

@Module({
  imports: [
    ...CORE_IMPORTS,
    MessagingModule.forRoot({ worker: false }),
    TypeOrmModule.forFeature([IdempotencyKey]),
    HealthModule,
    DevModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SahayakAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TicketVisibilityInterceptor }, // FR-208 on every ticket-scoped route
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }, // PRD 10.2, opt-in via Idempotency-Key
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*path}'); // path-to-regexp v8 wildcard (Nest 11): every route
  }
}
