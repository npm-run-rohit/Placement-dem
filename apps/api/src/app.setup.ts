import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/** HTTP pipeline shared by main.ts and the e2e harness so tests hit the same prefix, pipes and headers. */
export function configureHttpApp(app: INestApplication): string {
  app.use(helmet());
  // Behind the ALB, req.ip must be the caller, not the load balancer: TRUST_PROXY = number of proxy hops.
  const hops = Number(process.env.TRUST_PROXY ?? 0);
  if (hops > 0) (app as NestExpressApplication).set('trust proxy', hops);
  const prefix = process.env.API_PREFIX ?? 'api/v1';
  app.setGlobalPrefix(prefix);
  app.enableCors({
    origin: (process.env.APP_BASE_URL ?? 'http://localhost:5173').split(','),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false }));
  return prefix;
}
