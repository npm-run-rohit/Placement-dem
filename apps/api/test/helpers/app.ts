import { DynamicModule, INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureHttpApp } from '../../src/app.setup';

/** Dev-auth identities (`x-dev-user: email|Name|roles`). Users are upserted on their first request. */
export const TEST_USERS = {
  pm: 'pm.e2e@bimakavach.test|E2E Placement Manager|placement_manager',
  head: 'head.e2e@bimakavach.test|E2E Placement Head|placement_head',
};

export interface TestApp {
  app: INestApplication;
  prefix: string;
}

/** `extraImports`: worker-only modules a spec needs to drive directly (e.g. AutomationModule for the SLA sweeper). */
export async function createTestApp(extraImports: Array<Type | DynamicModule> = []): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule, ...extraImports] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true, logger: false });
  const prefix = configureHttpApp(app);
  await app.init();
  return { app, prefix };
}

/** supertest client that prefixes routes and sends the dev-auth header for `user`. */
export function as({ app, prefix }: TestApp, user: string) {
  const http = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  return {
    get: (path: string) => http().get(url(path)).set('x-dev-user', user),
    post: (path: string, body: object = {}) => http().post(url(path)).set('x-dev-user', user).send(body),
    put: (path: string, body: object = {}) => http().put(url(path)).set('x-dev-user', user).send(body),
    patch: (path: string, body: object = {}) => http().patch(url(path)).set('x-dev-user', user).send(body),
    /** multipart upload: `file` field + plain fields (POST /documents) */
    upload: (
      path: string,
      fields: Record<string, string>,
      file: { name: string; content: string | Buffer },
    ) =>
      Object.entries(fields)
        .reduce((req, [k, v]) => req.field(k, v), http().post(url(path)).set('x-dev-user', user))
        .attach('file', Buffer.from(file.content), file.name),
  };
}
