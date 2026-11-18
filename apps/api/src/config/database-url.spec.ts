import { databaseUrl } from './database-url';

describe('databaseUrl', () => {
  it('prefers DATABASE_URL', () => {
    expect(databaseUrl({ DATABASE_URL: 'postgres://a:b@h:1/d', DB_HOST: 'other' })).toBe(
      'postgres://a:b@h:1/d',
    );
  });

  it('builds the URL from the RDS secret keys, escaping the password', () => {
    expect(
      databaseUrl({
        DB_HOST: 'db.internal',
        DB_PORT: '5432',
        DB_USERNAME: 'placement',
        DB_PASSWORD: 'p@ss/w:rd',
        DB_DATABASE: 'placement',
      }),
    ).toBe('postgres://placement:p%40ss%2Fw%3Ard@db.internal:5432/placement');
  });

  it('falls back to the local docker database', () => {
    expect(databaseUrl({})).toBe('postgres://placement:placement@localhost:5432/placement');
  });
});
