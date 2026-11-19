import configuration from './configuration';
import { productionProblems } from './production-checks';

const REAL_SECRET = 'k3Jx9vQ2mP8wL5tR7yN4bH6cF1dG0sZa';

describe('productionProblems', () => {
  const base = () => configuration();

  it('lists every laptop default', () => {
    const problems = productionProblems(base());
    expect(problems).toHaveLength(5);
    expect(problems.join(' ')).toMatch(
      /AUTH_MODE.*FEATURE_DEV_SIMULATORS.*STORAGE_DRIVER.*MALWARE_SCANNER.*EMAIL_LAYER_SECRET/,
    );
  });

  it('passes a production-shaped config and requires the webhook secret in live mode', () => {
    const c = base();
    c.auth.mode = 'sahayak';
    c.features.devSimulators = false;
    c.storage.driver = 's3';
    c.malware.driver = 'clamav';
    c.mailbox.emailLayer.secret = REAL_SECRET;
    expect(productionProblems(c)).toEqual([]);
    c.bimasetu.mode = 'live';
    expect(productionProblems(c)).toEqual([expect.stringMatching(/BIMASETU_WEBHOOK_SECRET/)]);
    c.bimasetu.webhookSecret = 'secret';
    expect(productionProblems(c)).toEqual([]);
  });

  it('requires the email layer url and secret when it is the mailbox driver', () => {
    const c = base();
    c.mailbox.driver = 'email-layer';
    const msgs = productionProblems(c).filter((p) => /EMAIL_LAYER/.test(p));
    expect(msgs).toHaveLength(2);
    c.mailbox.emailLayer.url = 'https://layer';
    c.mailbox.emailLayer.secret = REAL_SECRET;
    expect(productionProblems(c).filter((p) => /EMAIL_LAYER/.test(p))).toEqual([]);
  });

  it.each([
    ['empty', ''],
    ['short', 'x'.repeat(31)],
    ['the .env.example value', 'dev-email-layer-secret-change-me'],
    ['a long placeholder', 'change-me-change-me-change-me-change-me'],
  ])('refuses an %s EMAIL_LAYER_SECRET whatever the mailbox driver (D4)', (_n, secret) => {
    for (const driver of ['dev', 'email-layer'] as const) {
      const c = base();
      c.mailbox.driver = driver;
      c.mailbox.emailLayer.url = 'https://layer';
      c.mailbox.emailLayer.secret = secret;
      expect(productionProblems(c).filter((p) => /EMAIL_LAYER_SECRET/.test(p))).toHaveLength(1);
    }
  });
});
